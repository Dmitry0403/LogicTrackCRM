-- Run once in Supabase SQL Editor. Independent of the cancelled workspaces migration.
begin;
create table if not exists public.account_drive_settings (
  owner_user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  folder_id text not null check (length(trim(folder_id)) > 0),
  folder_name text not null,
  updated_at timestamptz not null default now()
);

alter table public.account_drive_settings enable row level security;
revoke all on public.account_drive_settings from public, anon, authenticated;
grant select, insert on public.account_drive_settings to authenticated;
grant update (folder_id, folder_name) on public.account_drive_settings to authenticated;

drop policy if exists account_drive_settings_read on public.account_drive_settings;
create policy account_drive_settings_read on public.account_drive_settings
for select to authenticated using (owner_user_id = auth.uid());
drop policy if exists account_drive_settings_insert on public.account_drive_settings;
create policy account_drive_settings_insert on public.account_drive_settings
for insert to authenticated with check (owner_user_id = auth.uid());
drop policy if exists account_drive_settings_update on public.account_drive_settings;
create policy account_drive_settings_update on public.account_drive_settings
for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create or replace function public.touch_drive_settings_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
drop trigger if exists account_drive_settings_touch on public.account_drive_settings;
create trigger account_drive_settings_touch before update on public.account_drive_settings
for each row execute function public.touch_drive_settings_updated_at();
commit;
