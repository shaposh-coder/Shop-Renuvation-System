alter table public.users
add column if not exists admin_access text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_admin_access_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_admin_access_check
      check (admin_access is null or admin_access in ('All Access', 'Edit and Delete', 'Approvals Only'));
  end if;
end $$;

update public.users
set admin_access = 'All Access'
where role = 'Admin'
  and (admin_access is null or btrim(admin_access) = '');
