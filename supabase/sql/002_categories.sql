-- =====================================================
-- 002: CATEGORIES (run second)
-- Table, RLS, and seed data only.
-- Category RPCs that join expenses are in 003.
-- =====================================================

create table if not exists public.categories (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_empty check (char_length(trim(name)) > 0)
);

create unique index if not exists categories_name_unique_idx
  on public.categories (lower(trim(name)));

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row
execute function public.set_updated_at();

alter table public.categories enable row level security;

drop policy if exists "categories_select_policy" on public.categories;
create policy "categories_select_policy"
on public.categories
for select
to anon, authenticated
using (true);

drop policy if exists "categories_insert_policy" on public.categories;
create policy "categories_insert_policy"
on public.categories
for insert
to anon, authenticated
with check (true);

drop policy if exists "categories_update_policy" on public.categories;
create policy "categories_update_policy"
on public.categories
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "categories_delete_policy" on public.categories;
create policy "categories_delete_policy"
on public.categories
for delete
to anon, authenticated
using (true);

-- Seed categories (safe rerun, skips existing)
insert into public.categories (name, description)
select v.name, null
from (
  values
    ('Tiles'),
    ('Tile labour'),
    ('Tile material'),
    ('Marble'),
    ('Stairs/ railing'),
    ('Washroom , kitchen'),
    ('Sanitory material'),
    ('Plumber labour'),
    ('Ceiling'),
    ('Alka bond ceiling'),
    ('Glass'),
    ('Glass labour'),
    ('Glass hardware'),
    ('mirror looking'),
    ('Table glass work'),
    ('Jewellery table glass'),
    ('Sign board'),
    ('Sha posh logo'),
    ('Electrical work DB s'),
    ('Electrical wire'),
    ('Electrical labour'),
    ('Duct Patti'),
    ('Track Patti'),
    ('Track Lights'),
    ('Open Lights'),
    ('Celling Lights'),
    ('Celling Fans'),
    ('T5 ROD'),
    ('Bracket Fan'),
    ('UPS'),
    ('Batteries'),
    ('Generator'),
    ('AC'),
    ('AC labour'),
    ('AC pipe'),
    ('Cameras'),
    ('Cameras wire'),
    ('NVR'),
    ('DVR'),
    ('Camera screen'),
    ('PTCL'),
    ('Intercom'),
    ('Paint'),
    ('Paint labour'),
    ('Stool'),
    ('Wood work material'),
    ('Carpenter labour'),
    ('Number of carpenter'),
    ('Store'),
    ('Tailor room'),
    ('Counter'),
    ('Corien'),
    ('Counter chair'),
    ('System'),
    ('Keyboard'),
    ('Mouse'),
    ('Speaker system'),
    ('Printer'),
    ('Display screen'),
    ('Locker'),
    ('Hangers Kids'),
    ('Hangers Ladies'),
    ('Dummies Ladies'),
    ('Dummies kids'),
    ('Dummies Sitting'),
    ('Furniture'),
    ('Decorations'),
    ('Window Interior'),
    ('Window steaker'),
    ('Wallpapers'),
    ('Wallpaper labour'),
    ('Travelling'),
    ('Food'),
    ('Construction'),
    ('Extra welding work'),
    ('Antinas'),
    ('Advertisement'),
    ('Rent shop'),
    ('Till'),
    ('FIRE FIGHTING + SMOKE DETECTOR'),
    ('Poll'),
    ('Iron pipes + material')
) as v(name)
where not exists (
  select 1
  from public.categories c
  where lower(trim(c.name)) = lower(trim(v.name))
);

select pg_notify('pgrst', 'reload schema');
