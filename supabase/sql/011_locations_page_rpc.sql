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
              'address', l.address
            )
            order by l.id desc
          )
          from public.locations l
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
            'address', l.address
          )
          order by l.id desc
        )
        from public.locations l
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
