-- ============================================================================
-- MDF Atelier — schema Supabase
-- Execute este arquivo inteiro no SQL Editor do seu projeto Supabase.
-- (pode rodar mais de uma vez com segurança)
--
-- Mapeamento com o app:
--   localStorage:  { settings, activeProjectId, projects: [ projeto ] }
--   projeto:       { id, name, client, phone, notes, createdAt,
--                    billingBasis ('used'|'rateio'), furniture: [ móveis ] }
-- Aqui guardamos settings/activeProjectId no perfil do usuário e cada
-- projeto vira uma linha de projects (furniture fica em jsonb).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- updated_at automático
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- profiles — 1 linha por usuário do auth
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  settings          jsonb not null default '{}'::jsonb,
  active_project_id uuid,
  created_at        timestamptz not null default now()
);

-- settings default igual ao do app (defaultSettings em store.js)
create or replace function public.default_settings()
returns jsonb language sql stable as $$
  select '{"kerf":3.2,"trim":0,"cutMode":"guillotine","currency":"BRL",' ||
         '"sheetWidth":2750,"sheetHeight":1830,"sheetThickness":15,' ||
         '"sheetPrice":180,"sheetName":"MDF 15 mm 2750x1830",' ||
         '"tapePricePerMeter":2.5,"tapeName":"Fita PVC 22 mm",' ||
         '"laborPercent":0,"defaultMargin":100,' ||
         '"shopName":"MDF Atelier","shopPhone":""}'::jsonb;
$$;

-- Cria o perfil automaticamente quando um usuário novo se cadastra.
-- shopName/shopPhone podem vir no metadata do signup (ex.: Supabase Auth).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, settings)
  values (
    new.id,
    jsonb_set(
      public.default_settings(),
      '{shopName}',
      coalesce(to_jsonb(new.raw_user_meta_data ->> 'shopName'), to_jsonb('MDF Atelier'::text))
    )
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- projects — um orçamento por linha (móveis em jsonb)
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null default 'Novo orçamento',
  client        text not null default '',
  phone         text not null default '',
  notes         text not null default '',
  billing_basis text not null default 'used'
                check (billing_basis in ('used', 'rateio')),
  furniture     jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security — cada usuário só enxerga os próprios dados
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;

-- profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id);

-- projects
drop policy if exists projects_select_own on public.projects;
create policy projects_select_own on public.projects
  for select using (auth.uid() = user_id);

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects
  for insert with check (auth.uid() = user_id);

drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects
  for update using (auth.uid() = user_id);

drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own on public.projects
  for delete using (auth.uid() = user_id);
