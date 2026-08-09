#!/usr/bin/env node
/**
 * Upload locally downloaded attachments to Cloudinary and write URL mapping.
 *
 * Prerequisites:
 *   - backups/downloaded-attachments/ populated
 *   - Cloudinary env vars in .env.local
 *
 * Usage:
 *   node scripts/migrate_attachments_to_cloudinary.mjs
 *   node scripts/migrate_attachments_to_cloudinary.mjs --limit=10
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { v2 as cloudinary } from 'cloudinary'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
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

const attachmentsDir = path.join(root, 'backups', 'downloaded-attachments')
const mappingPath = path.join(root, 'backups', 'cloudinary_url_mapping.json')
const reportPath = path.join(root, 'backups', 'cloudinary_upload_report.json')
const rootFolder = process.env.CLOUDINARY_FOLDER || 'rms-entry-attachments'
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : 0

const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const apiKey = process.env.CLOUDINARY_API_KEY
const apiSecret = process.env.CLOUDINARY_API_SECRET

if (!cloudName || !apiKey || !apiSecret) {
  console.error('Missing Cloudinary env vars in .env.local')
  process.exit(1)
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
})

function walkFiles(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full))
    else out.push(full)
  }
  return out
}

function oldPublicUrlFromRelative(relativePosix) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/rms-entry-attachments/${relativePosix}`
}

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

async function uploadFile(localPath, relativePosix) {
  const publicId = `${rootFolder}/${relativePosix}`.replace(/\.[^.]+$/, '')
  const result = await cloudinary.uploader.upload(localPath, {
    public_id: publicId,
    resource_type: 'auto',
    overwrite: false,
    unique_filename: false,
    use_filename: true,
  })
  return result.secure_url
}

async function main() {
  const files = walkFiles(attachmentsDir)
  console.log(`Local attachment files: ${files.length}`)
  if (files.length === 0) {
    console.error('No files in', attachmentsDir)
    process.exit(1)
  }

  const mapping = loadMapping()
  const report = { uploaded: 0, skipped: 0, failed: 0, errors: [] }
  const queue = limit > 0 ? files.slice(0, limit) : files

  for (let i = 0; i < queue.length; i++) {
    const localPath = queue[i]
    const relative = path.relative(attachmentsDir, localPath).split(path.sep).join('/')
    const oldUrl = oldPublicUrlFromRelative(relative)

    if (mapping[oldUrl]) {
      report.skipped += 1
      console.log(`[${i + 1}/${queue.length}] skip mapped ${relative}`)
      continue
    }

    try {
      const newUrl = await uploadFile(localPath, relative)
      mapping[oldUrl] = newUrl
      report.uploaded += 1
      console.log(`[${i + 1}/${queue.length}] uploaded ${relative}`)
      if (report.uploaded % 10 === 0) saveMapping(mapping)
    } catch (error) {
      report.failed += 1
      const message = error instanceof Error ? error.message : String(error)
      report.errors.push({ relative, message })
      console.log(`[${i + 1}/${queue.length}] FAIL ${relative}: ${message}`)
    }
  }

  saveMapping(mapping)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log('\nDone.')
  console.log({
    uploaded: report.uploaded,
    skipped: report.skipped,
    failed: report.failed,
    mappingCount: Object.keys(mapping).length,
    mappingPath,
    reportPath,
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
