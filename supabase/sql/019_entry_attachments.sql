alter table public.cash_records
add column if not exists attachment_urls jsonb not null default '[]'::jsonb;

alter table public.expenses
add column if not exists attachment_urls jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('rms-entry-attachments', 'rms-entry-attachments', true)
on conflict (id) do nothing;

drop policy if exists "Public read entry attachments" on storage.objects;
create policy "Public read entry attachments"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'rms-entry-attachments');

drop policy if exists "Public upload entry attachments" on storage.objects;
create policy "Public upload entry attachments"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'rms-entry-attachments');
