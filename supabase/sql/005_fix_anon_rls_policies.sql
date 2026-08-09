-- =====================================================
-- 005: Fix RLS so anon/authenticated can use the app
-- Run this in the NEW Supabase project's SQL Editor.
-- Safe to re-run.
-- =====================================================

-- USERS
alter table public.users enable row level security;

drop policy if exists "users_select_policy" on public.users;
create policy "users_select_policy"
on public.users for select
to anon, authenticated
using (true);

drop policy if exists "users_insert_policy" on public.users;
create policy "users_insert_policy"
on public.users for insert
to anon, authenticated
with check (true);

drop policy if exists "users_update_policy" on public.users;
create policy "users_update_policy"
on public.users for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "users_delete_policy" on public.users;
create policy "users_delete_policy"
on public.users for delete
to anon, authenticated
using (true);

-- CATEGORIES
alter table public.categories enable row level security;

drop policy if exists "categories_select_policy" on public.categories;
create policy "categories_select_policy"
on public.categories for select
to anon, authenticated
using (true);

drop policy if exists "categories_insert_policy" on public.categories;
create policy "categories_insert_policy"
on public.categories for insert
to anon, authenticated
with check (true);

drop policy if exists "categories_update_policy" on public.categories;
create policy "categories_update_policy"
on public.categories for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "categories_delete_policy" on public.categories;
create policy "categories_delete_policy"
on public.categories for delete
to anon, authenticated
using (true);

-- LOCATIONS
alter table public.locations enable row level security;

drop policy if exists "locations_select_policy" on public.locations;
create policy "locations_select_policy"
on public.locations for select
to anon, authenticated
using (true);

drop policy if exists "locations_insert_policy" on public.locations;
create policy "locations_insert_policy"
on public.locations for insert
to anon, authenticated
with check (true);

drop policy if exists "locations_update_policy" on public.locations;
create policy "locations_update_policy"
on public.locations for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "locations_delete_policy" on public.locations;
create policy "locations_delete_policy"
on public.locations for delete
to anon, authenticated
using (true);

-- USER_LOCATIONS
alter table public.user_locations enable row level security;

drop policy if exists "user_locations_select_policy" on public.user_locations;
create policy "user_locations_select_policy"
on public.user_locations for select
to anon, authenticated
using (true);

drop policy if exists "user_locations_insert_policy" on public.user_locations;
create policy "user_locations_insert_policy"
on public.user_locations for insert
to anon, authenticated
with check (true);

drop policy if exists "user_locations_update_policy" on public.user_locations;
create policy "user_locations_update_policy"
on public.user_locations for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "user_locations_delete_policy" on public.user_locations;
create policy "user_locations_delete_policy"
on public.user_locations for delete
to anon, authenticated
using (true);

-- CASH_RECORDS
alter table public.cash_records enable row level security;

drop policy if exists "Allow select for cash_records" on public.cash_records;
create policy "Allow select for cash_records"
on public.cash_records for select
to anon, authenticated
using (true);

drop policy if exists "Allow insert for cash_records" on public.cash_records;
create policy "Allow insert for cash_records"
on public.cash_records for insert
to anon, authenticated
with check (true);

drop policy if exists "Allow update for cash_records" on public.cash_records;
create policy "Allow update for cash_records"
on public.cash_records for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow delete for cash_records" on public.cash_records;
create policy "Allow delete for cash_records"
on public.cash_records for delete
to anon, authenticated
using (true);

-- EXPENSES
alter table public.expenses enable row level security;

drop policy if exists "Allow select for expenses" on public.expenses;
create policy "Allow select for expenses"
on public.expenses for select
to anon, authenticated
using (true);

drop policy if exists "Allow insert for expenses" on public.expenses;
create policy "Allow insert for expenses"
on public.expenses for insert
to anon, authenticated
with check (true);

drop policy if exists "Allow update for expenses" on public.expenses;
create policy "Allow update for expenses"
on public.expenses for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow delete for expenses" on public.expenses;
create policy "Allow delete for expenses"
on public.expenses for delete
to anon, authenticated
using (true);

-- ENTRY_TIMELINE
alter table public.entry_timeline enable row level security;

drop policy if exists "entry_timeline_select_policy" on public.entry_timeline;
create policy "entry_timeline_select_policy"
on public.entry_timeline for select
to anon, authenticated
using (true);

drop policy if exists "entry_timeline_insert_policy" on public.entry_timeline;
create policy "entry_timeline_insert_policy"
on public.entry_timeline for insert
to anon, authenticated
with check (true);

drop policy if exists "entry_timeline_update_policy" on public.entry_timeline;
create policy "entry_timeline_update_policy"
on public.entry_timeline for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "entry_timeline_delete_policy" on public.entry_timeline;
create policy "entry_timeline_delete_policy"
on public.entry_timeline for delete
to anon, authenticated
using (true);

select pg_notify('pgrst', 'reload schema');
