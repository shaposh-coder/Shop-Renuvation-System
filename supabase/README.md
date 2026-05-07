# Supabase SQL Migrations (Manual Order)

Is folder me saari SQL files ordered format me rakhi hui hain taake kisi bhi naye Supabase project/server par easily run ki ja saken.

## Run Order

1. `supabase/sql/001_categories.sql`
2. `supabase/sql/002_locations.sql`
3. `supabase/sql/003_users.sql`
4. `supabase/sql/004_user_locations.sql`
5. `supabase/sql/005_users_password_hash_migration.sql`
6. `supabase/sql/006_cash_records.sql`
7. `supabase/sql/007_cash_records_value.sql`
8. `supabase/sql/008_expenses.sql`
9. `supabase/sql/009_cash_expenses_entry_date.sql`
10. `supabase/sql/010_users_page_rpc.sql`
11. `supabase/sql/011_locations_page_rpc.sql`
12. `supabase/sql/012_categories_page_rpc.sql`
13. `supabase/sql/013_cash_records_page_rpc.sql`
14. `supabase/sql/014_expenses_page_rpc.sql`
15. `supabase/sql/015_dashboard_summary_rpc.sql`
16. `supabase/sql/016_cash_in_hand_rpc.sql`
17. `supabase/sql/017_admin_access_controls.sql`
18. `supabase/sql/018_users_page_rpc_admin_access.sql`

## Kaise Run Karna Hai

1. Supabase Dashboard open karein.
2. SQL Editor me jayein.
3. Upar wali files ko order me run karein.
4. Har query ke baad success confirm karein.

## Notes

- Files idempotent style me likhi gayi hain (`if not exists`, `drop ... if exists`) taake rerun safe rahe.
- Future DB changes ke liye nayi numbered file add karein:
- `018_*.sql`, `019_*.sql`, etc.
