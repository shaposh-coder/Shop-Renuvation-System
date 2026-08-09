# Shop Renovation System (RMS)

Shop renovation operations app for cash records, expenses, locations, categories, users, and dashboard summaries.

## Stack

- **Frontend:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Database / API:** Supabase (Postgres + PostgREST)
- **Attachments:** Cloudinary (cash/expense file uploads)
- **Deploy:** Vercel (includes daily keepalive cron)

## Features

- Login with email + SHA-256 hashed password (`public.users`)
- Roles: `Admin`, `Managment`, `Viewer` (+ admin access levels)
- Cash records & expenses (create / edit / approve / attachments)
- Locations, categories, user-location mapping
- Dashboard summaries via Supabase RPCs
- Settings: profile, password, users, locations, categories

## Setup

### 1) Install

```bash
npm install
```

### 2) Environment variables

Create `.env.local` (and optionally `.env`) with:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_or_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_jwt
CRON_SECRET=your_cron_secret

# Cloudinary (attachments)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_FOLDER=ml_default
```

Notes:

- Client uses the anon/publishable key (`lib/supabase.ts`).
- Uploads go through `/api/upload` using Cloudinary server credentials.
- Keep `.env` / `.env.local` out of git (already ignored).

### 3) Database schema

Run SQL files in order in the Supabase SQL Editor:

1. `supabase/sql/001_user_and_access.sql`
2. `supabase/sql/002_categories.sql`
3. `supabase/sql/003_core_tables.sql`
4. `supabase/sql/004_dashboard_cash_calc_settings.sql`
5. `supabase/sql/005_fix_anon_rls_policies.sql` (required if login shows RLS / empty users for anon key)
6. `supabase/sql/006_install_rpc_functions.sql` (dashboard / list page RPCs — required after table-only import)

Default seed admin (from `001`):

- Email: `admin@admin.com`
- Password: `admin123`

### 4) Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Useful scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local development |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run backup:supabase` | Schema + data SQL backup via REST |
| `npm run backup:supabase:schema` | Schema-only backup |
| `npm run download:attachments` | Download attachment files from SQL/storage URLs |
| `npm run migrate:cloudinary` | Upload local attachments to Cloudinary + write URL map |
| `npm run remap:sql-urls` | Rewrite SQL dumps to Cloudinary URLs |
| `npm run import:new-supabase` | Copy old Supabase data → new project (with Cloudinary URLs) |

Backup / migration outputs are written under `backups/`.

## Architecture notes

- **Auth:** Custom table-based login (not Supabase Auth). Session stored in cookies + `localStorage`.
- **Passwords:** Stored as SHA-256 hex (`js-sha256` on client; SQL uses `encode(digest(..., 'sha256'), 'hex')`).
- **Attachments:** Stored as URL arrays in `cash_records.attachment_urls` and `expenses.attachment_urls`. New uploads use Cloudinary; DB remains on Supabase.
- **Publishable keys:** `lib/supabase.ts` avoids sending `sb_publishable_...` as a JWT Bearer token (PostgREST-compatible).

## Vercel deploy

1. Push code to GitHub and import the project in Vercel.
2. Add the same env vars listed above (Production + Preview).
3. Deploy / Redeploy after any env change.
4. Cron: `vercel.json` hits `/api/cron/keepalive` daily (`CRON_SECRET` required).

## Project structure (high level)

```text
app/                  # Next.js routes (login, dashboard, cash, expenses, settings, api)
components/           # Shared UI (sidebar, shell)
lib/                  # Supabase client, Cloudinary upload helper
supabase/sql/         # Schema migrations
scripts/              # Backup / migrate / import utilities
backups/              # Generated dumps, downloads, Cloudinary mapping
```

## License

Private project.
