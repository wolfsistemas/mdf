-- ============================================================================
-- MDF Atelier — cobrança Mercado Pago (additive)
-- Rode este arquivo no SQL Editor do projeto que JÁ tem o schema.sql.
-- Não apaga profiles/projects.
-- ============================================================================

alter table public.profiles
  add column if not exists plan text not null default 'gratis',
  add column if not exists plan_expires_at timestamptz,
  add column if not exists mp_subscription_id text,
  add column if not exists mp_subscription_status text,
  add column if not exists mp_plan_id text;

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('gratis', 'pro', 'ultra'));

create index if not exists profiles_mp_plan_id_idx
  on public.profiles (mp_plan_id)
  where mp_plan_id is not null;

create index if not exists profiles_mp_subscription_id_idx
  on public.profiles (mp_subscription_status, mp_subscription_id);

-- Dedupe de webhooks do Mercado Pago (Edge Function usa service_role).
-- Sem policies: anon/authenticated nao enxergam; service_role ignora RLS.
create table if not exists public.mp_events (
  id text primary key,
  created_at timestamptz not null default now()
);

alter table public.mp_events enable row level security;

-- O cliente autenticado NÃO pode se promover. Só o service_role grava plano.
create or replace function public.protect_billing_columns()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' then
    new.plan := old.plan;
    new.plan_expires_at := old.plan_expires_at;
    new.mp_subscription_id := old.mp_subscription_id;
    new.mp_subscription_status := old.mp_subscription_status;
    new.mp_plan_id := old.mp_plan_id;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_billing on public.profiles;
create trigger profiles_protect_billing
  before update on public.profiles
  for each row execute function public.protect_billing_columns();
