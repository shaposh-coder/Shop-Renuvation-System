alter table if exists public.cash_records
add column if not exists cash_value numeric(12, 2) not null default 0;

update public.cash_records
set cash_value = 0
where cash_value is null;

alter table public.cash_records
drop constraint if exists cash_records_cash_value_non_negative;

alter table public.cash_records
add constraint cash_records_cash_value_non_negative check (cash_value >= 0);

create index if not exists cash_records_cash_value_idx on public.cash_records(cash_value);
