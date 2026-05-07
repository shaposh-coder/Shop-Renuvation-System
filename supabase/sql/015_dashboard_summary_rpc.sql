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
    and (
      v_user_role <> 'Admin'
      or coalesce(trim(p_filter_user_name), '') = ''
      or cr.user_name = trim(p_filter_user_name)
    )
    and (
      p_filter_date_from is null
      or cr.entry_date >= p_filter_date_from
    )
    and (
      p_filter_date_to is null
      or cr.entry_date <= p_filter_date_to
    );

  select
    coalesce(sum(case when e.status = 'Approved' then e.expense_value else 0 end), 0),
    coalesce(sum(case when e.status = 'Pending' then e.expense_value else 0 end), 0)
  into v_expenses_approved, v_expenses_pending
  from public.expenses e
  where
    (v_user_role = 'Admin' or e.user_name = v_user_name)
    and (
      v_user_role <> 'Admin'
      or coalesce(trim(p_filter_user_name), '') = ''
      or e.user_name = trim(p_filter_user_name)
    )
    and (
      p_filter_date_from is null
      or e.entry_date >= p_filter_date_from
    )
    and (
      p_filter_date_to is null
      or e.entry_date <= p_filter_date_to
    );

  return jsonb_build_object(
    'cash',
    jsonb_build_object(
      'approved', v_cash_approved,
      'pending', v_cash_pending,
      'total', v_cash_approved + v_cash_pending
    ),
    'expenses',
    jsonb_build_object(
      'approved', v_expenses_approved,
      'pending', v_expenses_pending,
      'total', v_expenses_approved + v_expenses_pending
    ),
    'net_cash_in_hand', v_cash_approved - v_expenses_approved
  );
end;
$$;

grant execute on function public.get_dashboard_summary(text, text, date, date) to anon, authenticated;

-- Refresh PostgREST schema cache (so rpc can find it immediately)
select pg_notify('pgrst', 'reload schema');

-- v2 wrapper (helps when PostgREST cache is stubborn)
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

select pg_notify('pgrst', 'reload schema');

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

select pg_notify('pgrst', 'reload schema');
