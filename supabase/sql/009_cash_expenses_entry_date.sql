alter table if exists public.cash_records
add column if not exists entry_date date not null default current_date;

update public.cash_records
set entry_date = coalesce(entry_date, (created_at at time zone 'utc')::date)
where entry_date is null;

alter table if exists public.expenses
add column if not exists entry_date date not null default current_date;

update public.expenses
set entry_date = coalesce(entry_date, (created_at at time zone 'utc')::date)
where entry_date is null;
