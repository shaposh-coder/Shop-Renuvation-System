-- =====================================================
-- 006: Install / refresh all app RPC functions
-- Run AFTER tables exist (001-005). Safe to re-run.
-- Source: extracted from 003_core_tables.sql + 004_dashboard_cash_calc_settings.sql
-- =====================================================

alter table public.users
  add column if not exists dashboard_include_approved_cash boolean not null default true,
  add column if not exists dashboard_include_pending_cash boolean not null default false;

-- ===== From 003_core_tables.sql =====
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

-- RPC: cash records
create or replace function public.get_cash_records_page_data(
  p_user_email text,
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default '',
  p_filter_user_name text default '',
  p_filter_location_id bigint default null,
  p_filter_status text default '',
  p_filter_date_from date default null,
  p_filter_date_to date default null
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
  v_total_value numeric;
  v_records jsonb;
begin
  select u.role, u.user_name
  into v_user_role, v_user_name
  from public.users u
  where lower(trim(u.user_email)) = lower(trim(p_user_email))
  limit 1;

  if v_user_role is null then
    return jsonb_build_object('total_count', 0, 'total_value', 0, 'records', '[]'::jsonb);
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
      coalesce(cr.attachment_urls, '[]'::jsonb) as attachment_urls,
      l.id as location_ref_id,
      l.shop_name as location_shop_name
    from public.cash_records cr
    left join public.locations l on l.id = cr.location_id
    where
      (v_user_role = 'Admin' or cr.user_name = v_user_name)
      and (
        v_user_role <> 'Admin'
        or coalesce(trim(p_filter_user_name), '') = ''
        or cr.user_name = trim(p_filter_user_name)
      )
      and (p_filter_location_id is null or cr.location_id = p_filter_location_id)
      and (coalesce(trim(p_filter_status), '') = '' or cr.status = trim(p_filter_status))
      and (p_filter_date_from is null or cr.entry_date >= p_filter_date_from)
      and (p_filter_date_to is null or cr.entry_date <= p_filter_date_to)
      and (
        coalesce(trim(p_search), '') = ''
        or cr.user_name ilike '%' || trim(p_search) || '%'
        or cr.narration ilike '%' || trim(p_search) || '%'
        or cr.status ilike '%' || trim(p_search) || '%'
      )
  )
  select count(*), coalesce(sum(cash_value), 0)
  into v_total_count, v_total_value
  from filtered;

  with filtered as (
    select
      cr.id,
      cr.user_name,
      cr.entry_date,
      cr.narration,
      cr.cash_value,
      cr.location_id,
      cr.status,
      coalesce(cr.attachment_urls, '[]'::jsonb) as attachment_urls,
      l.id as location_ref_id,
      l.shop_name as location_shop_name
    from public.cash_records cr
    left join public.locations l on l.id = cr.location_id
    where
      (v_user_role = 'Admin' or cr.user_name = v_user_name)
      and (
        v_user_role <> 'Admin'
        or coalesce(trim(p_filter_user_name), '') = ''
        or cr.user_name = trim(p_filter_user_name)
      )
      and (p_filter_location_id is null or cr.location_id = p_filter_location_id)
      and (coalesce(trim(p_filter_status), '') = '' or cr.status = trim(p_filter_status))
      and (p_filter_date_from is null or cr.entry_date >= p_filter_date_from)
      and (p_filter_date_to is null or cr.entry_date <= p_filter_date_to)
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
          'attachment_urls', f.attachment_urls,
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

  return jsonb_build_object('total_count', v_total_count, 'total_value', v_total_value, 'records', v_records);
end;
$$;

grant execute on function public.get_cash_records_page_data(text, integer, integer, text, text, bigint, text, date, date) to anon, authenticated;

-- RPC: expenses
create or replace function public.get_expenses_page_data(
  p_user_email text,
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default '',
  p_filter_user_name text default '',
  p_filter_location_id bigint default null,
  p_filter_category_id bigint default null,
  p_filter_status text default '',
  p_filter_date_from date default null,
  p_filter_date_to date default null
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
  v_total_value numeric;
  v_records jsonb;
begin
  select u.role, u.user_name
  into v_user_role, v_user_name
  from public.users u
  where lower(trim(u.user_email)) = lower(trim(p_user_email))
  limit 1;

  if v_user_role is null then
    return jsonb_build_object('total_count', 0, 'total_value', 0, 'records', '[]'::jsonb);
  end if;

  v_page_size := greatest(1, least(coalesce(p_page_size, 25), 200));
  v_offset := greatest(coalesce(p_page, 1) - 1, 0) * v_page_size;

  with filtered as (
    select
      e.id,
      e.user_name,
      e.entry_date,
      e.narration,
      e.expense_value,
      e.location_id,
      e.category_id,
      e.status,
      coalesce(e.attachment_urls, '[]'::jsonb) as attachment_urls,
      l.id as location_ref_id,
      l.shop_name as location_shop_name,
      c.id as category_ref_id,
      c.name as category_name
    from public.expenses e
    left join public.locations l on l.id = e.location_id
    left join public.categories c on c.id = e.category_id
    where
      (v_user_role = 'Admin' or e.user_name = v_user_name)
      and (
        v_user_role <> 'Admin'
        or coalesce(trim(p_filter_user_name), '') = ''
        or e.user_name = trim(p_filter_user_name)
      )
      and (p_filter_location_id is null or e.location_id = p_filter_location_id)
      and (p_filter_category_id is null or e.category_id = p_filter_category_id)
      and (coalesce(trim(p_filter_status), '') = '' or e.status = trim(p_filter_status))
      and (p_filter_date_from is null or e.entry_date >= p_filter_date_from)
      and (p_filter_date_to is null or e.entry_date <= p_filter_date_to)
      and (
        coalesce(trim(p_search), '') = ''
        or e.user_name ilike '%' || trim(p_search) || '%'
        or e.narration ilike '%' || trim(p_search) || '%'
        or e.status ilike '%' || trim(p_search) || '%'
      )
  )
  select count(*), coalesce(sum(expense_value), 0)
  into v_total_count, v_total_value
  from filtered;

  with filtered as (
    select
      e.id,
      e.user_name,
      e.entry_date,
      e.narration,
      e.expense_value,
      e.location_id,
      e.category_id,
      e.status,
      coalesce(e.attachment_urls, '[]'::jsonb) as attachment_urls,
      l.id as location_ref_id,
      l.shop_name as location_shop_name,
      c.id as category_ref_id,
      c.name as category_name
    from public.expenses e
    left join public.locations l on l.id = e.location_id
    left join public.categories c on c.id = e.category_id
    where
      (v_user_role = 'Admin' or e.user_name = v_user_name)
      and (
        v_user_role <> 'Admin'
        or coalesce(trim(p_filter_user_name), '') = ''
        or e.user_name = trim(p_filter_user_name)
      )
      and (p_filter_location_id is null or e.location_id = p_filter_location_id)
      and (p_filter_category_id is null or e.category_id = p_filter_category_id)
      and (coalesce(trim(p_filter_status), '') = '' or e.status = trim(p_filter_status))
      and (p_filter_date_from is null or e.entry_date >= p_filter_date_from)
      and (p_filter_date_to is null or e.entry_date <= p_filter_date_to)
      and (
        coalesce(trim(p_search), '') = ''
        or e.user_name ilike '%' || trim(p_search) || '%'
        or e.narration ilike '%' || trim(p_search) || '%'
        or e.status ilike '%' || trim(p_search) || '%'
      )
    order by e.id desc
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
          'expense_value', f.expense_value,
          'location_id', f.location_id,
          'category_id', f.category_id,
          'status', f.status,
          'attachment_urls', f.attachment_urls,
          'locations',
          case
            when f.location_ref_id is null then null
            else jsonb_build_object('id', f.location_ref_id, 'shop_name', f.location_shop_name)
          end,
          'categories',
          case
            when f.category_ref_id is null then null
            else jsonb_build_object('id', f.category_ref_id, 'name', f.category_name)
          end
        )
      ),
      '[]'::jsonb
    )
  into v_records
  from filtered f;

  return jsonb_build_object('total_count', v_total_count, 'total_value', v_total_value, 'records', v_records);
end;
$$;

grant execute on function public.get_expenses_page_data(text, integer, integer, text, text, bigint, bigint, text, date, date) to anon, authenticated;

-- RPC: categories (joins expenses)
create or replace function public.get_categories_page_data()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'categories',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'description', c.description,
            'expense_value_total', coalesce(category_totals.total_value, 0)
          )
          order by c.id desc
        )
        from public.categories c
        left join (
          select e.category_id, coalesce(sum(e.expense_value), 0) as total_value
          from public.expenses e
          group by e.category_id
        ) category_totals on category_totals.category_id = c.id
      ),
      '[]'::jsonb
    )
  );
$$;

grant execute on function public.get_categories_page_data() to anon, authenticated;

create or replace function public.get_category_expense_shop_details(p_category_id bigint)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'location_id', grouped.location_id,
        'shop_name', grouped.shop_name,
        'expense_value_total', grouped.expense_value_total,
        'expense_count', grouped.expense_count
      )
      order by grouped.expense_value_total desc, grouped.shop_name
    ),
    '[]'::jsonb
  )
  from (
    select
      e.location_id,
      coalesce(l.shop_name, 'Unknown shop') as shop_name,
      coalesce(sum(e.expense_value), 0) as expense_value_total,
      count(*)::integer as expense_count
    from public.expenses e
    left join public.locations l on l.id = e.location_id
    where e.category_id = p_category_id
    group by e.location_id, l.shop_name
  ) grouped;
$$;

grant execute on function public.get_category_expense_shop_details(bigint) to anon, authenticated;

-- Timeline/audit history for Cash Records and Expenses.
-- The app writes one row after each add, update, approve, or delete action.

create table if not exists public.entry_timeline (
  id bigint generated always as identity primary key,
  entry_type text not null check (entry_type in ('cash_record', 'expense')),
  entry_id bigint not null,
  action text not null check (char_length(trim(action)) > 0),
  actor_name text,
  actor_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists entry_timeline_entry_idx
  on public.entry_timeline (entry_type, entry_id, created_at desc);

alter table public.entry_timeline enable row level security;

drop policy if exists "entry_timeline_select_policy" on public.entry_timeline;
create policy "entry_timeline_select_policy"
on public.entry_timeline
for select
to anon, authenticated
using (true);

drop policy if exists "entry_timeline_insert_policy" on public.entry_timeline;
create policy "entry_timeline_insert_policy"
on public.entry_timeline
for insert
to anon, authenticated
with check (true);

create or replace function public.get_entry_timeline(
  p_entry_type text,
  p_entry_id bigint
)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', et.id,
        'action', et.action,
        'actor_name', et.actor_name,
        'actor_email', et.actor_email,
        'details', et.details,
        'created_at', et.created_at
      )
      order by et.created_at desc, et.id desc
    ),
    '[]'::jsonb
  )
  from public.entry_timeline et
  where et.entry_type = p_entry_type
    and et.entry_id = p_entry_id;
$$;

grant execute on function public.get_entry_timeline(text, bigint) to anon, authenticated;

-- Dashboard RPCs
create or replace function public.get_dashboard_summary(
  p_user_email text,
  p_filter_user_name text default '',
  p_filter_date_from date default null,
  p_filter_date_to date default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_user_role text;
  v_user_name text;
  v_cash_approved numeric;
  v_cash_pending numeric;
  v_expenses_approved numeric;
  v_expenses_pending numeric;
begin
  select u.role, u.user_name
  into v_user_role, v_user_name
  from public.users u
  where lower(trim(u.user_email)) = lower(trim(p_user_email))
  limit 1;

  if v_user_role is null then
    return jsonb_build_object(
      'cash', jsonb_build_object('approved', 0, 'pending', 0, 'total', 0),
      'expenses', jsonb_build_object('approved', 0, 'pending', 0, 'total', 0),
      'net_cash_in_hand', 0
    );
  end if;

  select
    coalesce(sum(case when cr.status = 'Approved' then cr.cash_value else 0 end), 0),
    coalesce(sum(case when cr.status = 'Pending' then cr.cash_value else 0 end), 0)
  into v_cash_approved, v_cash_pending
  from public.cash_records cr
  where
    (v_user_role = 'Admin' or cr.user_name = v_user_name)
    and (v_user_role <> 'Admin' or coalesce(trim(p_filter_user_name), '') = '' or cr.user_name = trim(p_filter_user_name))
    and (p_filter_date_from is null or cr.entry_date >= p_filter_date_from)
    and (p_filter_date_to is null or cr.entry_date <= p_filter_date_to);

  select
    coalesce(sum(case when e.status = 'Approved' then e.expense_value else 0 end), 0),
    coalesce(sum(case when e.status = 'Pending' then e.expense_value else 0 end), 0)
  into v_expenses_approved, v_expenses_pending
  from public.expenses e
  where
    (v_user_role = 'Admin' or e.user_name = v_user_name)
    and (v_user_role <> 'Admin' or coalesce(trim(p_filter_user_name), '') = '' or e.user_name = trim(p_filter_user_name))
    and (p_filter_date_from is null or e.entry_date >= p_filter_date_from)
    and (p_filter_date_to is null or e.entry_date <= p_filter_date_to);

  return jsonb_build_object(
    'cash', jsonb_build_object('approved', v_cash_approved, 'pending', v_cash_pending, 'total', v_cash_approved + v_cash_pending),
    'expenses', jsonb_build_object('approved', v_expenses_approved, 'pending', v_expenses_pending, 'total', v_expenses_approved + v_expenses_pending),
    'net_cash_in_hand', v_cash_approved - v_expenses_approved
  );
end;
$$;

grant execute on function public.get_dashboard_summary(text, text, date, date) to anon, authenticated;

create or replace function public.get_dashboard_summary_v2(p_user_email text)
returns jsonb
language plpgsql
stable
as $$
begin
  return public.get_dashboard_summary(p_user_email, '', null, null);
end;
$$;

grant execute on function public.get_dashboard_summary_v2(text) to anon, authenticated;

create or replace function public.get_dashboard_summary_v3(
  p_user_email text,
  p_filter_user_name text default '',
  p_filter_date_from date default null,
  p_filter_date_to date default null
)
returns jsonb
language plpgsql
stable
as $$
begin
  return public.get_dashboard_summary(p_user_email, p_filter_user_name, p_filter_date_from, p_filter_date_to);
end;
$$;

grant execute on function public.get_dashboard_summary_v3(text, text, date, date) to anon, authenticated;

-- Cash in hand RPC
create or replace function public.get_cash_in_hand_value(p_user_email text)
returns jsonb
language plpgsql
stable
as $$
declare
  v_user_role text;
  v_user_name text;
  v_include_approved_cash boolean;
  v_include_pending_cash boolean;
  v_approved_cash numeric;
  v_pending_cash numeric;
  v_cash_total numeric;
  v_approved_expenses numeric;
  v_pending_expenses numeric;
begin
  select
    u.role,
    u.user_name,
    coalesce(u.dashboard_include_approved_cash, true),
    coalesce(u.dashboard_include_pending_cash, false)
  into v_user_role, v_user_name, v_include_approved_cash, v_include_pending_cash
  from public.users u
  where lower(trim(u.user_email)) = lower(trim(p_user_email))
  limit 1;

  if v_user_role is null then
    return jsonb_build_object(
      'approved_cash', 0,
      'pending_cash', 0,
      'approved_expenses', 0,
      'pending_expenses', 0,
      'cash_in_hand', 0
    );
  end if;

  select coalesce(sum(cr.cash_value), 0)
  into v_approved_cash
  from public.cash_records cr
  where cr.status = 'Approved' and (v_user_role = 'Admin' or cr.user_name = v_user_name);

  select coalesce(sum(cr.cash_value), 0)
  into v_pending_cash
  from public.cash_records cr
  where cr.status = 'Pending' and (v_user_role = 'Admin' or cr.user_name = v_user_name);

  v_cash_total := 0;
  if v_include_approved_cash then
    v_cash_total := v_cash_total + v_approved_cash;
  end if;
  if v_include_pending_cash then
    v_cash_total := v_cash_total + v_pending_cash;
  end if;

  select coalesce(sum(e.expense_value), 0)
  into v_approved_expenses
  from public.expenses e
  where e.status = 'Approved' and (v_user_role = 'Admin' or e.user_name = v_user_name);

  select coalesce(sum(e.expense_value), 0)
  into v_pending_expenses
  from public.expenses e
  where e.status = 'Pending' and (v_user_role = 'Admin' or e.user_name = v_user_name);

  return jsonb_build_object(
    'approved_cash', v_approved_cash,
    'pending_cash', v_pending_cash,
    'approved_expenses', v_approved_expenses,
    'pending_expenses', v_pending_expenses,
    'cash_in_hand', v_cash_total - v_approved_expenses
  );
end;
$$;

grant execute on function public.get_cash_in_hand_value(text) to anon, authenticated;


-- Per-user cash in hand breakdown for dashboard table (same semantics as get_cash_in_hand_value per user_name scope).
-- Uses the viewer's dashboard_include_* settings for cash totals, matching the main Cash in Hand card.
-- Excludes: Admin with admin_access All Access or Approvals Only (null admin_access treated like All Access for Admins).

create or replace function public.get_cash_in_hand_by_user_rows(p_viewer_email text)
returns jsonb
language plpgsql
stable
as $$
declare
  v_viewer_role text;
  v_viewer_name text;
  v_viewer_include_approved_cash boolean;
  v_viewer_include_pending_cash boolean;
  r record;
  v_row jsonb;
  v_out jsonb := '[]'::jsonb;
  v_approved_cash numeric;
  v_pending_cash numeric;
  v_cash_total numeric;
  v_approved_expenses numeric;
  v_pending_expenses numeric;
  v_cash_value numeric;
  v_net numeric;
begin
  select
    u.role,
    trim(u.user_name),
    coalesce(u.dashboard_include_approved_cash, true),
    coalesce(u.dashboard_include_pending_cash, false)
  into v_viewer_role, v_viewer_name, v_viewer_include_approved_cash, v_viewer_include_pending_cash
  from public.users u
  where lower(trim(u.user_email)) = lower(trim(p_viewer_email))
  limit 1;

  if v_viewer_role is null then
    return '[]'::jsonb;
  end if;

  for r in
    select trim(u.user_name) as user_name
    from public.users u
    where u.status = 'Active'
      and not (
        u.role = 'Admin'
        and coalesce(nullif(trim(u.admin_access), ''), 'All Access') in ('All Access', 'Approvals Only')
      )
    order by trim(u.user_name)
  loop
    if v_viewer_role is distinct from 'Admin' and r.user_name is distinct from v_viewer_name then
      continue;
    end if;

    select coalesce(sum(cr.cash_value), 0)
    into v_approved_cash
    from public.cash_records cr
    where cr.status = 'Approved' and cr.user_name = r.user_name;

    select coalesce(sum(cr.cash_value), 0)
    into v_pending_cash
    from public.cash_records cr
    where cr.status = 'Pending' and cr.user_name = r.user_name;

    v_cash_total := 0;
    if v_viewer_include_approved_cash then
      v_cash_total := v_cash_total + v_approved_cash;
    end if;
    if v_viewer_include_pending_cash then
      v_cash_total := v_cash_total + v_pending_cash;
    end if;

    select coalesce(sum(e.expense_value), 0)
    into v_approved_expenses
    from public.expenses e
    where e.status = 'Approved' and e.user_name = r.user_name;

    select coalesce(sum(e.expense_value), 0)
    into v_pending_expenses
    from public.expenses e
    where e.status = 'Pending' and e.user_name = r.user_name;

    v_cash_value := v_cash_total - v_approved_expenses;
    v_net := v_cash_value - v_pending_expenses;

    v_row := jsonb_build_object(
      'user_name', r.user_name,
      'cash_value', v_cash_value,
      'pending_expenses', v_pending_expenses,
      'net_cash_in_hand', v_net
    );

    v_out := v_out || jsonb_build_array(v_row);
  end loop;

  return v_out;
end;
$$;

grant execute on function public.get_cash_in_hand_by_user_rows(text) to anon, authenticated;

-- ===== From 004_dashboard_cash_calc_settings.sql (overrides cash-in-hand RPCs) =====
create or replace function public.get_cash_in_hand_value(p_user_email text)
returns jsonb
language plpgsql
stable
as $$
declare
  v_user_role text;
  v_user_name text;
  v_include_approved_cash boolean;
  v_include_pending_cash boolean;
  v_approved_cash numeric;
  v_pending_cash numeric;
  v_cash_total numeric;
  v_approved_expenses numeric;
  v_pending_expenses numeric;
begin
  select
    u.role,
    u.user_name,
    coalesce(u.dashboard_include_approved_cash, true),
    coalesce(u.dashboard_include_pending_cash, false)
  into v_user_role, v_user_name, v_include_approved_cash, v_include_pending_cash
  from public.users u
  where lower(trim(u.user_email)) = lower(trim(p_user_email))
  limit 1;

  if v_user_role is null then
    return jsonb_build_object(
      'approved_cash', 0,
      'pending_cash', 0,
      'approved_expenses', 0,
      'pending_expenses', 0,
      'cash_in_hand', 0
    );
  end if;

  select coalesce(sum(cr.cash_value), 0)
  into v_approved_cash
  from public.cash_records cr
  where cr.status = 'Approved' and (v_user_role = 'Admin' or cr.user_name = v_user_name);

  select coalesce(sum(cr.cash_value), 0)
  into v_pending_cash
  from public.cash_records cr
  where cr.status = 'Pending' and (v_user_role = 'Admin' or cr.user_name = v_user_name);

  v_cash_total := 0;
  if v_include_approved_cash then
    v_cash_total := v_cash_total + v_approved_cash;
  end if;
  if v_include_pending_cash then
    v_cash_total := v_cash_total + v_pending_cash;
  end if;

  select coalesce(sum(e.expense_value), 0)
  into v_approved_expenses
  from public.expenses e
  where e.status = 'Approved' and (v_user_role = 'Admin' or e.user_name = v_user_name);

  select coalesce(sum(e.expense_value), 0)
  into v_pending_expenses
  from public.expenses e
  where e.status = 'Pending' and (v_user_role = 'Admin' or e.user_name = v_user_name);

  return jsonb_build_object(
    'approved_cash', v_approved_cash,
    'pending_cash', v_pending_cash,
    'approved_expenses', v_approved_expenses,
    'pending_expenses', v_pending_expenses,
    'cash_in_hand', v_cash_total - v_approved_expenses
  );
end;
$$;

grant execute on function public.get_cash_in_hand_value(text) to anon, authenticated;

create or replace function public.get_cash_in_hand_by_user_rows(p_viewer_email text)
returns jsonb
language plpgsql
stable
as $$
declare
  v_viewer_role text;
  v_viewer_name text;
  v_viewer_include_approved_cash boolean;
  v_viewer_include_pending_cash boolean;
  r record;
  v_row jsonb;
  v_out jsonb := '[]'::jsonb;
  v_approved_cash numeric;
  v_pending_cash numeric;
  v_cash_total numeric;
  v_approved_expenses numeric;
  v_pending_expenses numeric;
  v_cash_value numeric;
  v_net numeric;
begin
  select
    u.role,
    trim(u.user_name),
    coalesce(u.dashboard_include_approved_cash, true),
    coalesce(u.dashboard_include_pending_cash, false)
  into v_viewer_role, v_viewer_name, v_viewer_include_approved_cash, v_viewer_include_pending_cash
  from public.users u
  where lower(trim(u.user_email)) = lower(trim(p_viewer_email))
  limit 1;

  if v_viewer_role is null then
    return '[]'::jsonb;
  end if;

  for r in
    select trim(u.user_name) as user_name
    from public.users u
    where u.status = 'Active'
      and not (
        u.role = 'Admin'
        and coalesce(nullif(trim(u.admin_access), ''), 'All Access') in ('All Access', 'Approvals Only')
      )
    order by trim(u.user_name)
  loop
    if v_viewer_role is distinct from 'Admin' and r.user_name is distinct from v_viewer_name then
      continue;
    end if;

    select coalesce(sum(cr.cash_value), 0)
    into v_approved_cash
    from public.cash_records cr
    where cr.status = 'Approved' and cr.user_name = r.user_name;

    select coalesce(sum(cr.cash_value), 0)
    into v_pending_cash
    from public.cash_records cr
    where cr.status = 'Pending' and cr.user_name = r.user_name;

    v_cash_total := 0;
    if v_viewer_include_approved_cash then
      v_cash_total := v_cash_total + v_approved_cash;
    end if;
    if v_viewer_include_pending_cash then
      v_cash_total := v_cash_total + v_pending_cash;
    end if;

    select coalesce(sum(e.expense_value), 0)
    into v_approved_expenses
    from public.expenses e
    where e.status = 'Approved' and e.user_name = r.user_name;

    select coalesce(sum(e.expense_value), 0)
    into v_pending_expenses
    from public.expenses e
    where e.status = 'Pending' and e.user_name = r.user_name;

    v_cash_value := v_cash_total - v_approved_expenses;
    v_net := v_cash_value - v_pending_expenses;

    v_row := jsonb_build_object(
      'user_name', r.user_name,
      'cash_value', v_cash_value,
      'pending_expenses', v_pending_expenses,
      'net_cash_in_hand', v_net
    );

    v_out := v_out || jsonb_build_array(v_row);
  end loop;

  return v_out;
end;
$$;

grant execute on function public.get_cash_in_hand_by_user_rows(text) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
