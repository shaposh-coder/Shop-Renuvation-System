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
                select jsonb_agg(l.shop_name order by l.shop_name)
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
          jsonb_build_object('id', l.id, 'shop_name', l.shop_name)
          order by l.shop_name
        )
        from public.locations l
      ),
      '[]'::jsonb
    )
  );
$$;

grant execute on function public.get_users_page_data() to anon, authenticated;
