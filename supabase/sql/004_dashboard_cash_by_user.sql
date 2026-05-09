-- Per-user cash in hand breakdown for dashboard table (same semantics as get_cash_in_hand_value per user_name scope).
-- Excludes: Admin with admin_access All Access or Approvals Only (null admin_access treated like All Access for Admins).

create or replace function public.get_cash_in_hand_by_user_rows(p_viewer_email text)
returns jsonb
language plpgsql
stable
as $$
declare
  v_viewer_role text;
  v_viewer_name text;
  r record;
  v_row jsonb;
  v_out jsonb := '[]'::jsonb;
  v_approved_cash numeric;
  v_approved_expenses numeric;
  v_pending_expenses numeric;
  v_cash_value numeric;
  v_net numeric;
begin
  select u.role, trim(u.user_name)
  into v_viewer_role, v_viewer_name
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

    select coalesce(sum(e.expense_value), 0)
    into v_approved_expenses
    from public.expenses e
    where e.status = 'Approved' and e.user_name = r.user_name;

    select coalesce(sum(e.expense_value), 0)
    into v_pending_expenses
    from public.expenses e
    where e.status = 'Pending' and e.user_name = r.user_name;

    v_cash_value := v_approved_cash - v_approved_expenses;
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
