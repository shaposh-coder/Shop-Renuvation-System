create or replace function public.get_cash_records_page_data(
  p_user_email text,
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default '',
  p_filter_user_name text default '',
  p_filter_location_id bigint default null,
  p_filter_status text default ''
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_user_role text;
  v_user_name text;
  v_offset integer;
  v_page_size integer;
  v_total_count bigint;
  v_records jsonb;
begin
  select u.role, u.user_name
  into v_user_role, v_user_name
  from public.users u
  where lower(trim(u.user_email)) = lower(trim(p_user_email))
  limit 1;

  if v_user_role is null then
    return jsonb_build_object('total_count', 0, 'records', '[]'::jsonb);
  end if;

  v_page_size := greatest(1, least(coalesce(p_page_size, 25), 200));
  v_offset := greatest(coalesce(p_page, 1) - 1, 0) * v_page_size;

  with filtered as (
    select
      cr.id,
      cr.user_name,
      cr.entry_date,
      cr.narration,
      cr.cash_value,
      cr.location_id,
      cr.status,
      l.id as location_ref_id,
      l.shop_name as location_shop_name
    from public.cash_records cr
    left join public.locations l on l.id = cr.location_id
    where
      (
        v_user_role = 'Admin'
        or cr.user_name = v_user_name
      )
      and (
        v_user_role <> 'Admin'
        or coalesce(trim(p_filter_user_name), '') = ''
        or cr.user_name = trim(p_filter_user_name)
      )
      and (
        p_filter_location_id is null
        or cr.location_id = p_filter_location_id
      )
      and (
        coalesce(trim(p_filter_status), '') = ''
        or cr.status = trim(p_filter_status)
      )
      and (
        coalesce(trim(p_search), '') = ''
        or cr.user_name ilike '%' || trim(p_search) || '%'
        or cr.narration ilike '%' || trim(p_search) || '%'
        or cr.status ilike '%' || trim(p_search) || '%'
      )
  )
  select count(*) into v_total_count from filtered;

  with filtered as (
    select
      cr.id,
      cr.user_name,
      cr.entry_date,
      cr.narration,
      cr.cash_value,
      cr.location_id,
      cr.status,
      l.id as location_ref_id,
      l.shop_name as location_shop_name
    from public.cash_records cr
    left join public.locations l on l.id = cr.location_id
    where
      (
        v_user_role = 'Admin'
        or cr.user_name = v_user_name
      )
      and (
        v_user_role <> 'Admin'
        or coalesce(trim(p_filter_user_name), '') = ''
        or cr.user_name = trim(p_filter_user_name)
      )
      and (
        p_filter_location_id is null
        or cr.location_id = p_filter_location_id
      )
      and (
        coalesce(trim(p_filter_status), '') = ''
        or cr.status = trim(p_filter_status)
      )
      and (
        coalesce(trim(p_search), '') = ''
        or cr.user_name ilike '%' || trim(p_search) || '%'
        or cr.narration ilike '%' || trim(p_search) || '%'
        or cr.status ilike '%' || trim(p_search) || '%'
      )
    order by cr.id desc
    offset v_offset
    limit v_page_size
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'user_name', f.user_name,
          'entry_date', f.entry_date,
          'narration', f.narration,
          'cash_value', f.cash_value,
          'location_id', f.location_id,
          'status', f.status,
          'locations',
          case
            when f.location_ref_id is null then null
            else jsonb_build_object(
              'id', f.location_ref_id,
              'shop_name', f.location_shop_name
            )
          end
        )
      ),
      '[]'::jsonb
    )
  into v_records
  from filtered f;

  return jsonb_build_object(
    'total_count', v_total_count,
    'records', v_records
  );
end;
$$;

grant execute on function public.get_cash_records_page_data(text, integer, integer, text, text, bigint, text) to anon, authenticated;
