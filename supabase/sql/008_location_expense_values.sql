-- Add location-wise expense totals to the Location page RPC.
-- Value is the sum of expense_value for all expense records linked to each location.

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
              'expense_value_total', coalesce(location_totals.total_value, 0)
            )
            order by l.id desc
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
            'expense_value_total', coalesce(location_totals.total_value, 0)
          )
          order by l.id desc
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

grant execute on function public.get_locations_page_data(text) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
