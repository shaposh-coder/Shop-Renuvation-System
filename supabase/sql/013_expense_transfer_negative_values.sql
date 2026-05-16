-- Allow negative expense values for Head Office transfer deductions

alter table public.expenses drop constraint if exists expenses_expense_value_check;
alter table public.expenses
  add constraint expenses_expense_value_check check (expense_value <> 0);

select pg_notify('pgrst', 'reload schema');
