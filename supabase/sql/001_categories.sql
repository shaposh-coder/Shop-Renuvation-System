-- Categories table for RMS app
create table if not exists public.categories (
  id bigint generated always as identity primary key,
  name text not null,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_empty check (char_length(trim(name)) > 0),
  constraint categories_description_not_empty check (char_length(trim(description)) > 0)
);

create unique index if not exists categories_name_unique_idx
  on public.categories (lower(trim(name)));

-- Auto-update updated_at on row updates
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row
execute function public.set_updated_at();

-- RLS policies for frontend (anon/authenticated access)
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

-- Make description optional for existing/new setups
alter table public.categories alter column description drop not null;
alter table public.categories drop constraint if exists categories_description_not_empty;
