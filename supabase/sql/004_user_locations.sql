-- User <-> Location mapping table (many-to-many)
create table if not exists public.user_locations (
  user_id bigint not null references public.users(id) on delete cascade,
  location_id bigint not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

create index if not exists user_locations_user_id_idx on public.user_locations(user_id);
create index if not exists user_locations_location_id_idx on public.user_locations(location_id);

alter table public.user_locations enable row level security;

drop policy if exists "user_locations_select_policy" on public.user_locations;
create policy "user_locations_select_policy"
on public.user_locations
for select
to anon, authenticated
using (true);

drop policy if exists "user_locations_insert_policy" on public.user_locations;
create policy "user_locations_insert_policy"
on public.user_locations
for insert
to anon, authenticated
with check (true);

drop policy if exists "user_locations_delete_policy" on public.user_locations;
create policy "user_locations_delete_policy"
on public.user_locations
for delete
to anon, authenticated
using (true);
