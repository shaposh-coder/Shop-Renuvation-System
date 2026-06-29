-- Dashboard cash calculation preferences per user profile

alter table public.users
  add column if not exists dashboard_include_approved_cash boolean not null default true,
  add column if not exists dashboard_include_pending_cash boolean not null default false;

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
