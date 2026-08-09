#!/usr/bin/env node
/**
 * Rewrite Supabase storage attachment URLs in SQL dumps to Cloudinary URLs.
 *
 * Usage:
 *   node scripts/remap_sql_attachment_urls.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const mappingPath = path.join(root, 'backups', 'cloudinary_url_mapping.json')
const outDir = path.join(root, 'backups', 'ready-for-new-supabase')

const sources = [
  path.join(root, 'backups', 'supabase_full_backup_20260809_170951.sql'),
  path.join(root, 'backups', 'supabase_data_only_20260809_170951.sql'),
  path.join(root, 'sql table download menual', 'cash_records_rows.sql'),
  path.join(root, 'sql table download menual', 'expenses_rows.sql'),
]

if (!fs.existsSync(mappingPath)) {
  console.error('Mapping not found. Run migrate_attachments_to_cloudinary.mjs first.')
  console.error(mappingPath)
  process.exit(1)
}

const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'))
const pairs = Object.entries(mapping)
  .filter(([oldUrl, newUrl]) => oldUrl && newUrl)
  .sort((a, b) => b[0].length - a[0].length)

console.log(`Loaded ${pairs.length} URL mappings`)
fs.mkdirSync(outDir, { recursive: true })

let totalReplacements = 0

for (const source of sources) {
  if (!fs.existsSync(source)) {
    console.warn('Skip missing:', source)
    continue
  }

  const original = fs.readFileSync(source, 'utf8')
  let rewritten = original
  let fileCount = 0

  for (const [oldUrl, newUrl] of pairs) {
    if (!rewritten.includes(oldUrl)) continue
    const parts = rewritten.split(oldUrl)
    fileCount += parts.length - 1
    rewritten = parts.join(newUrl)
  }

  const outName = `${path.basename(source).replace(/\.sql$/, '')}_cloudinary.sql`
  const outPath = path.join(outDir, outName)
  fs.writeFileSync(outPath, rewritten)
  totalReplacements += fileCount
  console.log(`${path.basename(source)} -> ${outName} (${fileCount} replacements)`)
}

console.log('\nDone.')
console.log({ outDir, totalReplacements })
console.log('On NEW Supabase: run schema SQL first, then remapped data SQL.')
