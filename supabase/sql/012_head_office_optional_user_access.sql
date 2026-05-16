-- Head Office stays on the Location page as a fixed system location,
-- but user access is assigned manually from the Users form.

drop trigger if exists users_assign_fixed_locations on public.users;
drop function if exists public.assign_fixed_locations_to_user();

select pg_notify('pgrst', 'reload schema');
