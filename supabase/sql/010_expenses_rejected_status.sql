-- Allow Rejected status on expenses
alter table public.expenses drop constraint if exists expenses_status_check;
alter table public.expenses
  add constraint expenses_status_check check (status in ('Pending', 'Approved', 'Rejected'));
