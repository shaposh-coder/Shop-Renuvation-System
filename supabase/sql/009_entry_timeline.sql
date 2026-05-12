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

select pg_notify('pgrst', 'reload schema');
