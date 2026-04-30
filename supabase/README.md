# Supabase SQL Migrations (Manual Order)

Is folder me saari SQL files ordered format me rakhi hui hain taake kisi bhi naye Supabase project/server par easily run ki ja saken.

## Run Order

1. `supabase/sql/001_categories.sql`
2. `supabase/sql/002_locations.sql`

## Kaise Run Karna Hai

1. Supabase Dashboard open karein.
2. SQL Editor me jayein.
3. Upar wali files ko order me run karein.
4. Har query ke baad success confirm karein.

## Notes

- Files idempotent style me likhi gayi hain (`if not exists`, `drop ... if exists`) taake rerun safe rahe.
- Future DB changes ke liye nayi numbered file add karein:
  - `003_*.sql`, `004_*.sql`, etc.
