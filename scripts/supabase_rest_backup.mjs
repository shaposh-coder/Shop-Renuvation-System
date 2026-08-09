#!/usr/bin/env node
/**
 * Full Supabase backup via PostgREST + local schema SQL files.
 * Uses SUPABASE_SERVICE_ROLE_KEY from .env.local (never prints secrets).
 *
 * Usage (from repo root; unset sandbox proxies if curl/node hit 403):
 *   npm run backup:supabase
 *   node scripts/supabase_rest_backup.mjs
 *   node scripts/supabase_rest_backup.mjs --schema-only
 *
 * Writes to backups/:
 *   supabase_full_backup_YYYYMMDD_HHMMSS.sql
 *   supabase_data_only_YYYYMMDD_HHMMSS.sql
 *   supabase_schema_only_YYYYMMDD_HHMMSS.sql
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'backups');
const SQL_DIR = path.join(ROOT, 'supabase', 'sql');
const PAGE_SIZE = 1000;

const KNOWN_TABLES = [
  'users',
  'categories',
  'locations',
  'user_locations',
  'cash_records',
  'expenses',
  'entry_timeline',
];

/** Tables with identity PK column `id` (from migrations). */
const IDENTITY_TABLES = {
  users: 'always',
  categories: 'always',
  locations: 'always',
  cash_records: 'default',
  expenses: 'default',
  entry_timeline: 'always',
};

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env.local not found at ${envPath}`);
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  if (typeof value === 'bigint') return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === 'object') {
    // jsonb / arrays from PostgREST
    const json = JSON.stringify(value).replace(/'/g, "''");
    return `'${json}'::jsonb`;
  }
  // string (and numeric-looking strings stay quoted — safer for text/date/timestamptz)
  return `'${String(value).replace(/'/g, "''")}'`;
}

function quoteIdent(ident) {
  return `"${String(ident).replace(/"/g, '""')}"`;
}

function loadSchemaSql() {
  const files = ['001', '002', '003', '004'].map((prefix) => {
    const match = fs.readdirSync(SQL_DIR).find((f) => f.startsWith(prefix) && f.endsWith('.sql'));
    if (!match) throw new Error(`Missing schema file starting with ${prefix} in ${SQL_DIR}`);
    return path.join(SQL_DIR, match);
  });
  const parts = files.map(
    (f) =>
      `-- ========== Schema from ${path.basename(f)} ==========\n` +
      fs.readFileSync(f, 'utf8').trimEnd() +
      '\n'
  );
  return parts.join('\n');
}


async function preflightRest(supabaseUrl, serviceKey) {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/users?select=id&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body: body.slice(0, 500) };
}

async function discoverTables(supabaseUrl, serviceKey) {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/openapi+json, application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.warn(
      `OpenAPI discovery failed HTTP ${res.status}: ${text.slice(0, 300)}. Falling back to known tables.`
    );
    return [...KNOWN_TABLES];
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    console.warn('OpenAPI JSON parse failed; using known tables.');
    return [...KNOWN_TABLES];
  }
  const defs = doc.definitions || doc.components?.schemas || {};
  const names = Object.keys(defs).filter((name) => {
    // Skip nested/composite type names that are not top-level tables when possible
    if (name.includes('.')) return false;
    return true;
  });
  const set = new Set([...KNOWN_TABLES, ...names]);
  // Prefer known order first, then any extras alphabetically
  const extras = [...set].filter((t) => !KNOWN_TABLES.includes(t)).sort();
  return [...KNOWN_TABLES, ...extras];
}

async function fetchAllRows(supabase, table) {
  const rows = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error, status } = await supabase
      .from(table)
      .select('*')
      .range(from, to);
    if (error) {
      const msg = error.message || JSON.stringify(error);
      const err = new Error(`Failed to fetch ${table}: ${msg}`);
      err.status = status;
      err.details = error;
      throw err;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function rowsToInsertSql(table, rows) {
  if (!rows.length) {
    return `-- ${table}: 0 rows\n`;
  }
  const cols = Object.keys(rows[0]);
  const colList = cols.map(quoteIdent).join(', ');
  const identityMode = IDENTITY_TABLES[table];
  const overriding =
    identityMode === 'always' ? ' OVERRIDING SYSTEM VALUE' : '';

  const lines = [`-- ${table}: ${rows.length} rows`];
  // Batch inserts for readability / size (~100 rows per statement)
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = chunk
      .map((row) => `(${cols.map((c) => sqlLiteral(row[c])).join(', ')})`)
      .join(',\n  ');
    lines.push(
      `INSERT INTO public.${quoteIdent(table)} (${colList})${overriding} VALUES\n  ${values};`
    );
  }
  return lines.join('\n') + '\n';
}

function identityRestartSql(table, rows) {
  if (!IDENTITY_TABLES[table] || !rows.length) return '';
  if (!Object.prototype.hasOwnProperty.call(rows[0], 'id')) return '';
  let maxId = 0;
  for (const row of rows) {
    const n = Number(row.id);
    if (Number.isFinite(n) && n > maxId) maxId = n;
  }
  if (maxId < 1) return '';
  // setval(..., is_called => true) so next nextval is maxId+1
  return (
    `SELECT setval(pg_get_serial_sequence('public.${table}', 'id'), ${maxId}, true);\n` +
    `-- also: ALTER TABLE public.${table} ALTER COLUMN id RESTART WITH ${maxId + 1};\n`
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const schemaOnly = args.has('--schema-only') || args.has('-s');

  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = stamp();
  const fullPath = path.join(BACKUP_DIR, `supabase_full_backup_${ts}.sql`);
  const dataPath = path.join(BACKUP_DIR, `supabase_data_only_${ts}.sql`);
  const schemaPath = path.join(BACKUP_DIR, `supabase_schema_only_${ts}.sql`);

  const schemaSql = loadSchemaSql();
  fs.writeFileSync(schemaPath, schemaSql + '\n', 'utf8');
  console.log(`Wrote schema-only: ${schemaPath} (${fs.statSync(schemaPath).size} bytes)`);

  if (schemaOnly) {
    console.log('Schema-only mode; skipping REST data export.');
    console.log(`Schema: ${schemaPath}`);
    return;
  }

  console.log('Preflight: GET /rest/v1/users?select=id&limit=1 ...');
  const pf = await preflightRest(url, key);
  console.log(`Preflight HTTP ${pf.status}`);
  if (!pf.ok) {
    console.error(pf.body);
    if (pf.status === 402) {
      console.error(
        '\nProject is restricted (likely exceed_storage_size_quota).\n' +
          'Fix in Supabase Dashboard (upgrade / remove spend cap / free storage), then re-run:\n' +
          '  npm run backup:supabase\n' +
          'Schema backup was written; leaving existing backups untouched besides this new schema file.'
      );
      // Still write stub full/data so paths are predictable, but mark clearly
      const stub =
        `-- DATA EXPORT BLOCKED (HTTP ${pf.status})\n` +
        `-- ${pf.body.replace(/\n/g, ' ')}\n` +
        `-- Re-run after quota is restored: npm run backup:supabase\n`;
      fs.writeFileSync(dataPath, stub, 'utf8');
      fs.writeFileSync(
        fullPath,
        `-- Full backup incomplete: data blocked\n\n` + schemaSql + '\n\n' + stub,
        'utf8'
      );
      console.log(`Stub full: ${fullPath}`);
      console.log(`Stub data: ${dataPath}`);
      process.exitCode = 2;
      return;
    }
    throw new Error(`REST preflight failed with HTTP ${pf.status}`);
  }
  console.log('Preflight OK — exporting table data.');

  console.log('Discovering tables...');
  const tables = await discoverTables(url, key);
  console.log(`Tables to export (${tables.length}): ${tables.join(', ')}`);

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const counts = {};
  const dataParts = [];
  dataParts.push('-- Data-only dump generated via Supabase REST (service_role)');
  dataParts.push(`-- Generated at: ${new Date().toISOString()}`);
  dataParts.push(`-- Source: ${url}`);
  dataParts.push('BEGIN;');
  dataParts.push('');
  // Disable triggers temporarily for cleaner restore of timeline/updated_at side effects? Keep simple: just truncate/insert order.
  dataParts.push('-- Suggested restore order respects FKs; TRUNCATE optional:');
  dataParts.push(
    '-- TRUNCATE TABLE public.entry_timeline, public.expenses, public.cash_records, public.user_locations, public.locations, public.categories, public.users RESTART IDENTITY CASCADE;'
  );
  dataParts.push('');

  const errors = [];
  for (const table of tables) {
    process.stdout.write(`Fetching ${table}... `);
    try {
      const rows = await fetchAllRows(supabase, table);
      counts[table] = rows.length;
      console.log(`${rows.length} rows`);
      dataParts.push(rowsToInsertSql(table, rows));
      dataParts.push(identityRestartSql(table, rows));
      dataParts.push('');
    } catch (e) {
      counts[table] = null;
      console.log(`ERROR: ${e.message}`);
      errors.push({ table, message: e.message });
      dataParts.push(`-- ERROR exporting ${table}: ${e.message.replace(/\n/g, ' ')}\n`);
    }
  }

  dataParts.push('COMMIT;');
  dataParts.push('');

  const dataSql = dataParts.join('\n');
  fs.writeFileSync(dataPath, dataSql, 'utf8');

  const fullSql =
    `-- Full backup: schema (from supabase/sql 001-004) + data (REST export)\n` +
    `-- Generated at: ${new Date().toISOString()}\n` +
    `-- Source: ${url}\n\n` +
    schemaSql +
    '\n\n-- ========== DATA ==========\n\n' +
    dataSql;

  fs.writeFileSync(fullPath, fullSql, 'utf8');

  console.log('');
  console.log('=== Backup summary ===');
  for (const [t, c] of Object.entries(counts)) {
    console.log(`  ${t}: ${c === null ? 'FAILED' : c}`);
  }
  console.log(`Full:   ${fullPath} (${fs.statSync(fullPath).size} bytes)`);
  console.log(`Data:   ${dataPath} (${fs.statSync(dataPath).size} bytes)`);
  console.log(`Schema: ${schemaPath} (${fs.statSync(schemaPath).size} bytes)`);

  if (errors.length) {
    console.error(`\n${errors.length} table export error(s). Schema files were still written.`);
    // Exit non-zero if ALL known tables failed
    const knownFailed = KNOWN_TABLES.every((t) => counts[t] === null);
    if (knownFailed) process.exitCode = 2;
    else process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
