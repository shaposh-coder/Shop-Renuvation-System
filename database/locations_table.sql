-- Locations table for RMS app
create table if not exists public.locations (
  id bigint generated always as identity primary key,
  shop_name text not null,
  address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_shop_name_not_empty check (char_length(trim(shop_name)) > 0),
  constraint locations_address_not_empty check (char_length(trim(address)) > 0)
);

create unique index if not exists locations_shop_name_unique_idx
  on public.locations (lower(trim(shop_name)));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
before update on public.locations
for each row
execute function public.set_updated_at();

alter table public.locations enable row level security;

drop policy if exists "locations_select_policy" on public.locations;
create policy "locations_select_policy"
on public.locations
for select
to anon, authenticated
using (true);

drop policy if exists "locations_insert_policy" on public.locations;
create policy "locations_insert_policy"
on public.locations
for insert
to anon, authenticated
with check (true);

drop policy if exists "locations_update_policy" on public.locations;
create policy "locations_update_policy"
on public.locations
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "locations_delete_policy" on public.locations;
create policy "locations_delete_policy"
on public.locations
for delete
to anon, authenticated
using (true);
