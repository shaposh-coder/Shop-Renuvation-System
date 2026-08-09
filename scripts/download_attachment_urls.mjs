#!/usr/bin/env node
/**
 * Extract attachment URLs from manual SQL dumps and download the files locally.
 *
 * Usage:
 *   node scripts/download_attachment_urls.mjs
 *   node scripts/download_attachment_urls.mjs --dry-run
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const sqlDir = path.join(root, 'sql table download menual')
const outDir = path.join(root, 'backups', 'downloaded-attachments')
const dryRun = process.argv.includes('--dry-run')

const sqlFiles = [
  'cash_records_rows.sql',
  'expenses_rows.sql',
]

function extractUrls(text) {
  const matches = text.match(/https:\/\/[^\s"'\\\]]+/g) || []
  return [...new Set(matches.filter((url) => url.includes('/storage/') || url.includes('cloudinary.com')))]
}

function localPathForUrl(url) {
  try {
    const u = new URL(url)
    // Keep storage path after bucket name when possible
    const marker = '/rms-entry-attachments/'
    const idx = u.pathname.indexOf(marker)
    const relative =
      idx >= 0
        ? u.pathname.slice(idx + marker.length)
        : u.pathname.replace(/^\/+/, '').replace(/^storage\/v1\/object\/public\//, '')
    return path.join(outDir, decodeURIComponent(relative))
  } catch {
    return path.join(outDir, `file-${Date.now()}`)
  }
}

async function downloadOne(url) {
  const dest = localPathForUrl(url)
  fs.mkdirSync(path.dirname(dest), { recursive: true })

  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    return { url, dest, status: 'skipped-exists' }
  }

  if (dryRun) {
    return { url, dest, status: 'dry-run' }
  }

  const response = await fetch(url)
  if (!response.ok) {
    return { url, dest, status: `http-${response.status}` }
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(dest, buffer)
  return { url, dest, status: 'downloaded', bytes: buffer.length }
}

async function main() {
  if (!fs.existsSync(sqlDir)) {
    console.error('SQL folder not found:', sqlDir)
    process.exit(1)
  }

  const urls = []
  for (const file of sqlFiles) {
    const full = path.join(sqlDir, file)
    if (!fs.existsSync(full)) {
      console.warn('Missing:', full)
      continue
    }
    const text = fs.readFileSync(full, 'utf8')
    const found = extractUrls(text)
    console.log(`${file}: ${found.length} unique URL(s)`)
    urls.push(...found)
  }

  const unique = [...new Set(urls)]
  console.log(`Total unique URLs: ${unique.length}`)
  fs.mkdirSync(outDir, { recursive: true })

  let ok = 0
  let fail = 0
  let skip = 0

  for (let i = 0; i < unique.length; i++) {
    const url = unique[i]
    try {
      const result = await downloadOne(url)
      if (result.status === 'downloaded') {
        ok += 1
        console.log(`[${i + 1}/${unique.length}] OK ${result.bytes} bytes -> ${result.dest}`)
      } else if (result.status.startsWith('http-') || result.status.startsWith('error')) {
        fail += 1
        console.log(`[${i + 1}/${unique.length}] FAIL ${result.status} ${url}`)
      } else {
        skip += 1
        console.log(`[${i + 1}/${unique.length}] ${result.status} ${result.dest}`)
      }
    } catch (error) {
      fail += 1
      console.log(`[${i + 1}/${unique.length}] ERROR ${error instanceof Error ? error.message : error}`)
    }
  }

  console.log('\nDone.')
  console.log({ downloaded: ok, failed: fail, skipped: skip, outDir })
  if (fail > 0) {
    console.log(
      '\nIf many failed with 402/403: unlock Supabase storage first (upgrade / remove spend cap), then re-run.'
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
