-- Fixed "Head Office" location (cannot be deleted or renamed)

alter table public.locations
  add column if not exists is_fixed boolean not null default false;

insert into public.locations (shop_name, address, is_fixed)
select 'Head Office', 'Head Office', true
where not exists (
  select 1
  from public.locations
  where lower(trim(shop_name)) = lower(trim('Head Office'))
);

update public.locations
set is_fixed = true,
    address = case
      when char_length(trim(address)) = 0 then 'Head Office'
      else address
    end
where lower(trim(shop_name)) = lower(trim('Head Office'));

insert into public.user_locations (user_id, location_id)
select u.id, l.id
from public.users u
cross join public.locations l
where l.is_fixed = true
on conflict do nothing;

create or replace function public.protect_fixed_location()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.is_fixed then
    raise exception 'Fixed locations cannot be deleted.';
  end if;

  if tg_op = 'UPDATE' and old.is_fixed then
    if lower(trim(new.shop_name)) is distinct from lower(trim(old.shop_name)) then
      raise exception 'Fixed location name cannot be changed.';
    end if;
    if new.is_fixed is distinct from true then
      raise exception 'Fixed location flag cannot be removed.';
    end if;
  end if;

  if tg_op = 'INSERT' and lower(trim(new.shop_name)) = lower(trim('Head Office')) then
    if exists (
      select 1
      from public.locations
      where lower(trim(shop_name)) = lower(trim('Head Office'))
    ) then
      raise exception 'Head Office already exists as a fixed location.';
    end if;
    new.is_fixed := true;
  end if;

  return new;
end;
$$;

drop trigger if exists locations_protect_fixed on public.locations;
create trigger locations_protect_fixed
before insert or update or delete on public.locations
for each row
execute function public.protect_fixed_location();

create or replace function public.assign_fixed_locations_to_user()
returns trigger
language plpgsql
as $$
begin
  insert into public.user_locations (user_id, location_id)
  select new.id, l.id
  from public.locations l
  where l.is_fixed = true
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists users_assign_fixed_locations on public.users;
create trigger users_assign_fixed_locations
after insert on public.users
for each row
execute function public.assign_fixed_locations_to_user();

create or replace function public.get_locations_page_data(p_user_email text)
returns jsonb
language plpgsql
stable
as $$
declare
  v_user_id bigint;
  v_user_role text;
begin
  select u.id, u.role
  into v_user_id, v_user_role
  from public.users u
  where lower(trim(u.user_email)) = lower(trim(p_user_email))
  limit 1;

  if v_user_id is null then
    return jsonb_build_object('locations', '[]'::jsonb);
  end if;

  if v_user_role = 'Admin' then
    return jsonb_build_object(
      'locations',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', l.id,
              'shop_name', l.shop_name,
              'address', l.address,
              'is_fixed', l.is_fixed,
              'expense_value_total', coalesce(location_totals.total_value, 0)
            )
            order by l.is_fixed desc, l.shop_name asc
          )
          from public.locations l
          left join (
            select e.location_id, coalesce(sum(e.expense_value), 0) as total_value
            from public.expenses e
            group by e.location_id
          ) location_totals on location_totals.location_id = l.id
        ),
        '[]'::jsonb
      )
    );
  end if;

  return jsonb_build_object(
    'locations',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'shop_name', l.shop_name,
            'address', l.address,
            'is_fixed', l.is_fixed,
            'expense_value_total', coalesce(location_totals.total_value, 0)
          )
          order by l.is_fixed desc, l.shop_name asc
        )
        from public.locations l
        left join (
          select e.location_id, coalesce(sum(e.expense_value), 0) as total_value
          from public.expenses e
          group by e.location_id
        ) location_totals on location_totals.location_id = l.id
        where l.id in (
          select ul.location_id
          from public.user_locations ul
          where ul.user_id = v_user_id
        )
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.get_users_page_data()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'users',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', u.id,
            'user_name', u.user_name,
            'user_email', u.user_email,
            'status', u.status,
            'role', u.role,
            'admin_access', u.admin_access,
            'location_ids',
            coalesce(
              (
                select jsonb_agg(ul.location_id order by ul.location_id)
                from public.user_locations ul
                where ul.user_id = u.id
              ),
              '[]'::jsonb
            ),
            'location_names',
            coalesce(
              (
                select jsonb_agg(l.shop_name order by l.is_fixed desc, l.shop_name asc)
                from public.user_locations ul
                join public.locations l on l.id = ul.location_id
                where ul.user_id = u.id
              ),
              '[]'::jsonb
            )
          )
          order by u.id desc
        )
        from public.users u
      ),
      '[]'::jsonb
    ),
    'locations',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', l.id, 'shop_name', l.shop_name, 'is_fixed', l.is_fixed)
          order by l.is_fixed desc, l.shop_name asc
        )
        from public.locations l
      ),
      '[]'::jsonb
    )
  );
$$;

grant execute on function public.get_locations_page_data(text) to anon, authenticated;
grant execute on function public.get_users_page_data() to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
