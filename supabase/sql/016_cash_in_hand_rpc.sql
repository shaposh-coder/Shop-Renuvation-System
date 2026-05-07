create or replace function public.get_cash_in_hand_value(p_user_email text)
returns jsonb
language plpgsql
stable
as $$
declare
  v_user_role text;
  v_user_name text;
  v_approved_cash numeric;
  v_approved_expenses numeric;
  v_pending_expenses numeric;
begin
  select u.role, u.user_name
  into v_user_role, v_user_name
  from public.users u
  where lower(trim(u.user_email)) = lower(trim(p_user_email))
  limit 1;

  if v_user_role is null then
    return jsonb_build_object(
      'approved_cash', 0,
      'approved_expenses', 0,
      'pending_expenses', 0,
      'cash_in_hand', 0
    );
  end if;

  select coalesce(sum(cr.cash_value), 0)
  into v_approved_cash
  from public.cash_records cr
  where
    cr.status = 'Approved'
    and (v_user_role = 'Admin' or cr.user_name = v_user_name);

  select coalesce(sum(e.expense_value), 0)
  into v_approved_expenses
  from public.expenses e
  where
    e.status = 'Approved'
    and (v_user_role = 'Admin' or e.user_name = v_user_name);

  select coalesce(sum(e.expense_value), 0)
  into v_pending_expenses
  from public.expenses e
  where
    e.status = 'Pending'
    and (v_user_role = 'Admin' or e.user_name = v_user_name);

  return jsonb_build_object(
    'approved_cash', v_approved_cash,
    'approved_expenses', v_approved_expenses,
    'pending_expenses', v_pending_expenses,
    'cash_in_hand', v_approved_cash - v_approved_expenses
  );
end;
$$;

grant execute on function public.get_cash_in_hand_value(text) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
