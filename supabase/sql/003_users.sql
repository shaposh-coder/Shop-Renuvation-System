-- Users table for RMS app
create extension if not exists pgcrypto;

create table if not exists public.users (
  id bigint generated always as identity primary key,
  user_name text not null,
  user_email text not null,
  user_password text not null,
  status text not null default 'Active',
  role text not null default 'Viewer',
  admin_access text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_name_not_empty check (char_length(trim(user_name)) > 0),
  constraint users_email_not_empty check (char_length(trim(user_email)) > 0),
  constraint users_password_not_empty check (char_length(trim(user_password)) > 0),
  constraint users_status_check check (status in ('Active', 'In-active')),
  constraint users_role_check check (role in ('Admin', 'Managment', 'Viewer')),
  constraint users_admin_access_check check (
    admin_access is null or admin_access in ('All Access', 'Edit and Delete', 'Approvals Only')
  )
);

create unique index if not exists users_email_unique_idx
  on public.users (lower(trim(user_email)));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

alter table public.users enable row level security;

drop policy if exists "users_select_policy" on public.users;
create policy "users_select_policy"
on public.users
for select
to anon, authenticated
using (true);

drop policy if exists "users_insert_policy" on public.users;
create policy "users_insert_policy"
on public.users
for insert
to anon, authenticated
with check (true);

drop policy if exists "users_update_policy" on public.users;
create policy "users_update_policy"
on public.users
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "users_delete_policy" on public.users;
create policy "users_delete_policy"
on public.users
for delete
to anon, authenticated
using (true);

-- Default admin user seed
insert into public.users (user_name, user_email, user_password, status, role)
values ('admin', 'admin@admin.com', encode(digest('admin123', 'sha256'), 'hex'), 'Active', 'Admin')
on conflict ((lower(trim(user_email)))) do nothing;
