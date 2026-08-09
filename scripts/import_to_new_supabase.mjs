#!/usr/bin/env node
/**
 * Copy all public table data from OLD Supabase -> NEW Supabase,
 * remapping attachment_urls via backups/cloudinary_url_mapping.json.
 *
 * Reads active NEW credentials from .env.local and OLD from commented block
 * (or IMPORT_OLD_* env overrides).
 *
 * New project identity columns reject explicit ids via REST, so parent rows
 * are synced/inserted without ids and child FKs / entry_timeline.entry_id
 * are remapped.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const envPath = path.join(root, '.env.local')
const mappingPath = path.join(root, 'backups', 'cloudinary_url_mapping.json')

function parseEnvFile(filePath) {
  const active = {}
  const commented = {}
  if (!fs.existsSync(filePath)) return { active, commented }
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('##')) continue
    const isComment = line.startsWith('#')
    const body = isComment ? line.replace(/^#\s*/, '') : line
    if (body.startsWith('#')) continue
    const eq = body.indexOf('=')
    if (eq <= 0) continue
    const key = body.slice(0, eq).trim()
    let value = body.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (isComment) commented[key] = value
    else active[key] = value
  }
  return { active, commented }
}

async function fetchAll(client, table, select = '*') {
  const pageSize = 1000
  let from = 0
  const rows = []
  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await client.from(table).select(select).range(from, to)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

function remapAttachmentUrls(value, mapping) {
  if (!Array.isArray(value)) return value ?? []
  return value.map((url) => mapping[url] || url)
}

function stripId(row) {
  const { id, ...rest } = row
  return rest
}

async function insertBatch(client, table, rows) {
  if (!rows.length) return
  const chunkSize = 200
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await client.from(table).insert(chunk)
    if (error) throw new Error(`${table} insert: ${error.message}`)
  }
}

async function deleteAll(client, table) {
  const hasCreated = !['entry_timeline'].includes(table)
    ? true
    : false
  if (table === 'user_locations') {
    const { error } = await client.from(table).delete().gte('created_at', '1970-01-01')
    if (error) throw new Error(`${table} delete: ${error.message}`)
    return
  }
  if (hasCreated && table !== 'entry_timeline') {
    const { error } = await client.from(table).delete().gte('created_at', '1970-01-01')
    if (!error) return
  }
  const { error } = await client.from(table).delete().gte('id', 0)
  if (error) throw new Error(`${table} delete: ${error.message}`)
}

async function syncByNaturalKey(client, table, oldRows, keyFn, buildInsert) {
  const existing = await fetchAll(client, table)
  const byKey = new Map(existing.map((row) => [keyFn(row), row]))
  const idMap = new Map()

  for (const old of oldRows) {
    const key = keyFn(old)
    const found = byKey.get(key)
    if (found) {
      idMap.set(Number(old.id), found.id)
      const patch = buildInsert(old)
      const { error } = await client.from(table).update(patch).eq('id', found.id)
      if (error) throw new Error(`${table} update ${key}: ${error.message}`)
    } else {
      const payload = buildInsert(old)
      const { data, error } = await client.from(table).insert(payload).select('id').single()
      if (error) throw new Error(`${table} insert ${key}: ${error.message}`)
      idMap.set(Number(old.id), data.id)
      byKey.set(key, { id: data.id, ...payload })
    }
  }
  return idMap
}

/** Insert rows without ids (table must be empty); return oldId -> newId map by insert order. */
async function insertRemapIds(client, table, oldRows, toPayload) {
  const idMap = new Map()
  const sorted = [...oldRows].sort((a, b) => Number(a.id) - Number(b.id))
  const chunkSize = 100
  for (let i = 0; i < sorted.length; i += chunkSize) {
    const chunk = sorted.slice(i, i + chunkSize)
    const payloads = chunk.map(toPayload)
    const { data, error } = await client.from(table).insert(payloads).select('id')
    if (error) throw new Error(`${table} insert: ${error.message}`)
    if (!data || data.length !== chunk.length) {
      throw new Error(`${table} insert: expected ${chunk.length} ids, got ${data?.length ?? 0}`)
    }
    for (let j = 0; j < chunk.length; j++) {
      idMap.set(Number(chunk[j].id), data[j].id)
    }
  }
  return idMap
}

async function main() {
  const { active, commented } = parseEnvFile(envPath)

  const newUrl = active.NEXT_PUBLIC_SUPABASE_URL
  const newKey = active.SUPABASE_SERVICE_ROLE_KEY
  const oldUrl = process.env.IMPORT_OLD_SUPABASE_URL || commented.NEXT_PUBLIC_SUPABASE_URL
  const oldKey = process.env.IMPORT_OLD_SUPABASE_SERVICE_ROLE_KEY || commented.SUPABASE_SERVICE_ROLE_KEY

  if (!newUrl || !newKey) {
    console.error('Missing NEW Supabase credentials in .env.local')
    process.exit(1)
  }
  if (!oldUrl || !oldKey) {
    console.error('Missing OLD Supabase credentials (commented block in .env.local)')
    process.exit(1)
  }
  if (!fs.existsSync(mappingPath)) {
    console.error('Missing mapping:', mappingPath)
    process.exit(1)
  }

  const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'))
  console.log('Old:', oldUrl)
  console.log('New:', newUrl)
  console.log('URL mappings:', Object.keys(mapping).length)

  const oldClient = createClient(oldUrl, oldKey)
  const newClient = createClient(newUrl, newKey)

  for (const [label, client] of [
    ['old', oldClient],
    ['new', newClient],
  ]) {
    const { error, status } = await client.from('users').select('id').limit(1)
    if (error) throw new Error(`${label} preflight failed (${status}): ${error.message}`)
    console.log(`${label} preflight OK`)
  }

  const users = await fetchAll(oldClient, 'users')
  const categories = await fetchAll(oldClient, 'categories')
  const locations = await fetchAll(oldClient, 'locations')
  const userLocations = await fetchAll(oldClient, 'user_locations')
  const cashRecords = await fetchAll(oldClient, 'cash_records')
  const expenses = await fetchAll(oldClient, 'expenses')
  const timeline = await fetchAll(oldClient, 'entry_timeline')

  console.log('Fetched rows:', {
    users: users.length,
    categories: categories.length,
    locations: locations.length,
    user_locations: userLocations.length,
    cash_records: cashRecords.length,
    expenses: expenses.length,
    entry_timeline: timeline.length,
  })

  console.log('Clearing dependent tables on new project...')
  await deleteAll(newClient, 'entry_timeline')
  await deleteAll(newClient, 'expenses')
  await deleteAll(newClient, 'cash_records')
  await deleteAll(newClient, 'user_locations')

  console.log('Syncing users/categories/locations (identity-safe)...')
  const userIdMap = await syncByNaturalKey(
    newClient,
    'users',
    users,
    (row) => String(row.user_email || '').trim().toLowerCase(),
    (row) => ({
      user_name: row.user_name,
      user_email: row.user_email,
      user_password: row.user_password,
      status: row.status,
      role: row.role,
      admin_access: row.admin_access,
      dashboard_include_approved_cash: row.dashboard_include_approved_cash,
      dashboard_include_pending_cash: row.dashboard_include_pending_cash,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })
  )

  const categoryIdMap = await syncByNaturalKey(
    newClient,
    'categories',
    categories,
    (row) => String(row.name || '').trim().toLowerCase(),
    (row) => ({
      name: row.name,
      description: row.description,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })
  )

  const locationIdMap = await syncByNaturalKey(
    newClient,
    'locations',
    locations,
    (row) => String(row.shop_name || '').trim().toLowerCase(),
    (row) => ({
      shop_name: row.shop_name,
      address: row.address,
      is_fixed: row.is_fixed,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })
  )

  const userLocationsMapped = userLocations.map((row) => {
    const user_id = userIdMap.get(Number(row.user_id)) ?? userIdMap.get(row.user_id)
    const location_id = locationIdMap.get(Number(row.location_id)) ?? locationIdMap.get(row.location_id)
    if (user_id == null || location_id == null) {
      throw new Error(
        `user_locations missing map for user_id=${row.user_id} location_id=${row.location_id}`
      )
    }
    return {
      user_id,
      location_id,
      created_at: row.created_at,
    }
  })

  try {
    await insertBatch(newClient, 'user_locations', userLocationsMapped)
  } catch (err) {
    console.warn('user_locations insert failed, retry after delete:', String(err?.message || err))
    await deleteAll(newClient, 'user_locations')
    await insertBatch(newClient, 'user_locations', userLocationsMapped)
  }
  console.log('user_locations imported:', userLocationsMapped.length)

  console.log('Inserting cash_records/expenses with id remap...')
  const cashIdMap = await insertRemapIds(newClient, 'cash_records', cashRecords, (row) => {
    const location_id = locationIdMap.get(Number(row.location_id)) ?? locationIdMap.get(row.location_id)
    if (location_id == null) throw new Error(`cash_records missing location map ${row.location_id}`)
    return {
      user_name: row.user_name,
      narration: row.narration,
      attachment_urls: remapAttachmentUrls(row.attachment_urls, mapping),
      cash_value: row.cash_value,
      location_id,
      status: row.status,
      entry_date: row.entry_date,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  })

  const expenseIdMap = await insertRemapIds(newClient, 'expenses', expenses, (row) => {
    const location_id = locationIdMap.get(Number(row.location_id)) ?? locationIdMap.get(row.location_id)
    const category_id = categoryIdMap.get(Number(row.category_id)) ?? categoryIdMap.get(row.category_id)
    if (location_id == null) throw new Error(`expenses missing location map ${row.location_id}`)
    if (category_id == null) throw new Error(`expenses missing category map ${row.category_id}`)
    return {
      user_name: row.user_name,
      narration: row.narration,
      attachment_urls: remapAttachmentUrls(row.attachment_urls, mapping),
      expense_value: row.expense_value,
      location_id,
      category_id,
      status: row.status,
      entry_date: row.entry_date,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  })

  let skippedTimeline = 0
  const timelineMapped = []
  for (const row of timeline) {
    let entry_id = row.entry_id
    if (row.entry_type === 'cash_record') {
      entry_id = cashIdMap.get(Number(row.entry_id)) ?? cashIdMap.get(row.entry_id)
      if (entry_id == null) {
        skippedTimeline++
        continue
      }
    } else if (row.entry_type === 'expense') {
      entry_id = expenseIdMap.get(Number(row.entry_id)) ?? expenseIdMap.get(row.entry_id)
      if (entry_id == null) {
        skippedTimeline++
        continue
      }
    }
    timelineMapped.push({
      entry_type: row.entry_type,
      entry_id,
      action: row.action,
      actor_name: row.actor_name,
      actor_email: row.actor_email,
      details: row.details,
      created_at: row.created_at,
    })
  }
  if (skippedTimeline) {
    console.warn(`Skipped orphan entry_timeline rows (missing parent): ${skippedTimeline}`)
  }
  await insertBatch(newClient, 'entry_timeline', timelineMapped)

  const counts = {}
  for (const table of [
    'users',
    'categories',
    'locations',
    'user_locations',
    'cash_records',
    'expenses',
    'entry_timeline',
  ]) {
    const { count, error } = await newClient
      .from(table)
      .select('*', { count: 'exact', head: true })
    if (error) throw new Error(`count ${table}: ${error.message}`)
    counts[table] = count
  }

  const { data: sample } = await newClient
    .from('expenses')
    .select('id, attachment_urls')
    .not('attachment_urls', 'eq', '[]')
    .limit(1)
    .maybeSingle()

  console.log('\nImport complete. New project counts:', counts)
  console.log(
    'Sample attachment URL:',
    Array.isArray(sample?.attachment_urls) ? sample.attachment_urls[0] : null
  )
  console.log('ID maps:', {
    users: userIdMap.size,
    categories: categoryIdMap.size,
    locations: locationIdMap.size,
    cash_records: cashIdMap.size,
    expenses: expenseIdMap.size,
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
