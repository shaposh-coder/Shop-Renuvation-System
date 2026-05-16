# Supabase SQL Migrations (Manual Order)

Is folder me saari SQL files ordered format me rakhi hui hain taake kisi bhi naye Supabase project/server par easily run ki ja saken.

## Run Order

1. `supabase/sql/001_user_and_access.sql`
2. `supabase/sql/002_categories.sql`
3. `supabase/sql/003_core_tables.sql`

## Kaise Run Karna Hai

1. Supabase Dashboard open karein.
2. SQL Editor me jayein.
3. Upar wali files ko order me run karein.
4. Har query ke baad success confirm karein.

## Notes

- Files idempotent style me likhi gayi hain (`if not exists`, `drop ... if exists`) taake rerun safe rahe.
- Saari migrations in teen files me merge hain (pehle `004`–`013` alag thi).
- Naye DB changes ke liye inhi files me update karein ya nayi migration strategy adopt karein.
