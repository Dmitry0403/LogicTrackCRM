-- Minimal shared app state for LogicTrack CRM.
-- For quick start this uses one shared workspace row (id = 'default').

create table if not exists public.app_state (
  id text primary key,
  owner_user_id uuid not null default auth.uid(),
  orders jsonb not null default '[]'::jsonb,
  trips jsonb not null default '[]'::jsonb,
  order_stages jsonb not null default '[]'::jsonb,
  trip_stages jsonb not null default '[]'::jsonb,
  print_signer jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state
  add column if not exists owner_user_id uuid;

alter table public.app_state
  alter column owner_user_id set default auth.uid();

update public.app_state
set owner_user_id = coalesce(auth.uid(), gen_random_uuid())
where owner_user_id is null;

alter table public.app_state
  alter column owner_user_id set not null;

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists app_state_touch_updated_at on public.app_state;
create trigger app_state_touch_updated_at
before update on public.app_state
for each row execute function public.touch_updated_at();

alter table public.app_state enable row level security;

revoke all on table public.app_state from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.app_state to authenticated;

drop policy if exists app_state_read_all on public.app_state;
create policy app_state_read_all on public.app_state
for select
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists app_state_write_all on public.app_state;
create policy app_state_write_all on public.app_state
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());
