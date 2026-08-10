#!/usr/bin/env node
/**
 * Migrate existing attachment_urls (Cloudinary / old Supabase storage)
 * to Cloudflare R2 with image compression, then update Supabase rows.
 *
 * Requires .env.local:
 *   Supabase service role + R2_* vars
 *
 * Usage:
 *   node scripts/migrate_attachments_to_r2.mjs
 *   node scripts/migrate_attachments_to_r2.mjs --limit=20
 *   node scripts/migrate_attachments_to_r2.mjs --dry-run
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('##')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvFile(path.join(root, '.env.local'))
loadEnvFile(path.join(root, '.env'))

const dryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : 0

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const accountId = process.env.R2_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const bucket = process.env.R2_BUCKET_NAME
const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')
const prefix = (process.env.R2_FOLDER_PREFIX || 'rms-attachments').replace(/^\/+|\/+$/g, '')

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  R2_ACCOUNT_ID: accountId,
  R2_ACCESS_KEY_ID: accessKeyId,
  R2_SECRET_ACCESS_KEY: secretAccessKey,
  R2_BUCKET_NAME: bucket,
  R2_PUBLIC_BASE_URL: publicBaseUrl,
})) {
  if (!value) {
    console.error(`Missing env: ${name}`)
    process.exit(1)
  }
}

const mappingPath = path.join(root, 'backups', 'r2_url_mapping.json')
const reportPath = path.join(root, 'backups', 'r2_migrate_report.json')
fs.mkdirSync(path.dirname(mappingPath), { recursive: true })

const supabase = createClient(supabaseUrl, serviceKey)
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
})

function loadMapping() {
  if (!fs.existsSync(mappingPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(mappingPath, 'utf8'))
  } catch {
    return {}
  }
}

function saveMapping(mapping) {
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2))
}

function needsMigrate(url) {
  if (!url || typeof url !== 'string') return false
  if (url.includes(publicBaseUrl)) return false
  return (
    url.includes('res.cloudinary.com') ||
    url.includes('/storage/v1/object/public/') ||
    url.startsWith('http')
  )
}

function keyFromUrl(url) {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    // cloudinary: .../upload/v123/folder/file.ext
    const uploadIdx = parts.findIndex((p) => p === 'upload')
    if (uploadIdx >= 0 && parts[uploadIdx + 1]) {
      const rest = parts.slice(uploadIdx + 1)
      // drop version token like v123456
      if (/^v\d+$/i.test(rest[0])) rest.shift()
      return `${prefix}/${rest.join('/')}`
    }
    const marker = 'rms-entry-attachments'
    const idx = parts.indexOf(marker)
    if (idx >= 0) return `${prefix}/${parts.slice(idx + 1).join('/')}`
    return `${prefix}/migrated/${parts.slice(-3).join('/')}`
  } catch {
    return `${prefix}/migrated/${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

async function compressBuffer(input, contentType = '', fileName = '') {
  const mime = (contentType || '').toLowerCase()
  const name = fileName.toLowerCase()
  const isImage =
    mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|bmp|tiff?)$/i.test(name || keyGuess(fileName))

  if (!isImage || mime.includes('gif') || name.endsWith('.gif')) {
    return { buffer: input, contentType: contentType || 'application/octet-stream', extension: extOf(name, 'bin') }
  }

  try {
    let pipeline = sharp(input, { failOn: 'none' }).rotate()
    const meta = await pipeline.metadata()
    if ((meta.width || 0) > 1600) {
      pipeline = pipeline.resize({ width: 1600, withoutEnlargement: true })
    }
    const buffer = await pipeline.webp({ quality: 72, effort: 4 }).toBuffer()
    return { buffer, contentType: 'image/webp', extension: 'webp' }
  } catch {
    const buffer = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 75, mozjpeg: true })
      .toBuffer()
    return { buffer, contentType: 'image/jpeg', extension: 'jpg' }
  }
}

function keyGuess(name) {
  return name || ''
}

function extOf(name, fallback) {
  if (!name.includes('.')) return fallback
  return name.split('.').pop() || fallback
}

function publicUrlForKey(key) {
  return `${publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`
}

async function uploadToR2(key, body, contentType) {
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  )
  return publicUrlForKey(key)
}

async function fetchAll(table) {
  const pageSize = 1000
  let from = 0
  const rows = []
  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabase.from(table).select('id, attachment_urls').range(from, to)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function migrateUrl(oldUrl, mapping, stats) {
  if (mapping[oldUrl]) {
    stats.skipped += 1
    return mapping[oldUrl]
  }

  if (!needsMigrate(oldUrl)) {
    stats.skipped += 1
    return oldUrl
  }

  if (dryRun) {
    stats.dryRun += 1
    return `[dry-run]${oldUrl}`
  }

  const response = await fetch(oldUrl)
  if (!response.ok) {
    stats.failed += 1
    stats.errors.push({ url: oldUrl, error: `HTTP ${response.status}` })
    return oldUrl
  }

  const contentType = response.headers.get('content-type') || ''
  const input = Buffer.from(await response.arrayBuffer())
  const compressed = await compressBuffer(input, contentType, oldUrl)

  let key = keyFromUrl(oldUrl)
  // ensure extension matches compressed output
  key = key.replace(/\.[a-z0-9]+$/i, '') + `.${compressed.extension}`

  const newUrl = await uploadToR2(key, compressed.buffer, compressed.contentType)
  mapping[oldUrl] = newUrl
  stats.uploaded += 1
  stats.bytesIn += input.length
  stats.bytesOut += compressed.buffer.length
  console.log(
    `OK ${Math.round(input.length / 1024)}KB -> ${Math.round(compressed.buffer.length / 1024)}KB`
  )
  return newUrl
}

async function main() {
  console.log('Fetching expenses + cash_records attachment URLs...')
  const expenses = await fetchAll('expenses')
  const cash = await fetchAll('cash_records')

  const work = []
  for (const row of expenses) {
    const urls = Array.isArray(row.attachment_urls) ? row.attachment_urls : []
    if (urls.some(needsMigrate)) work.push({ table: 'expenses', id: row.id, urls })
  }
  for (const row of cash) {
    const urls = Array.isArray(row.attachment_urls) ? row.attachment_urls : []
    if (urls.some(needsMigrate)) work.push({ table: 'cash_records', id: row.id, urls })
  }

  const queue = limit > 0 ? work.slice(0, limit) : work
  console.log(`Rows needing migrate: ${work.length} (processing ${queue.length})`)
  console.log(dryRun ? 'DRY RUN — no uploads/updates' : 'LIVE migrate')

  const mapping = loadMapping()
  const stats = {
    uploaded: 0,
    skipped: 0,
    failed: 0,
    dryRun: 0,
    rowsUpdated: 0,
    bytesIn: 0,
    bytesOut: 0,
    errors: [],
  }

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i]
    console.log(`[${i + 1}/${queue.length}] ${item.table}#${item.id}`)
    const nextUrls = []
    for (const url of item.urls) {
      try {
        nextUrls.push(await migrateUrl(url, mapping, stats))
      } catch (error) {
        stats.failed += 1
        const message = error instanceof Error ? error.message : String(error)
        stats.errors.push({ url, error: message })
        nextUrls.push(url)
        console.log(`FAIL ${message}`)
      }
    }

    const changed = JSON.stringify(nextUrls) !== JSON.stringify(item.urls)
    if (changed && !dryRun) {
      const { error } = await supabase
        .from(item.table)
        .update({ attachment_urls: nextUrls })
        .eq('id', item.id)
      if (error) {
        stats.errors.push({ table: item.table, id: item.id, error: error.message })
        console.log(`DB update fail: ${error.message}`)
      } else {
        stats.rowsUpdated += 1
      }
    }

    if (stats.uploaded > 0 && stats.uploaded % 10 === 0) saveMapping(mapping)
  }

  saveMapping(mapping)
  fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2))
  console.log('\nDone.')
  console.log(stats)
  console.log('mapping:', mappingPath)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
