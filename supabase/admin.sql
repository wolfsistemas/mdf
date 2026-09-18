-- ============================================================================
-- MDF Atelier — Super admin (controle de planos)
-- Rode este arquivo no SQL Editor do projeto que JÁ tem schema.sql e billing.sql.
-- É aditivo: não apaga profiles/projects.
--
--   * admins        -> quem pode entrar no painel (só o service_role escreve)
--   * is_admin()    -> checagem usada pelo servidor e pela RPC am_i_admin()
--   * plan_config   -> configs globais dos planos (preço/rótulo/limite)
--   * admin_audit   -> histórico de alterações feitas pelo admin
--   * profiles ganha is_blocked / admin_note / plan_source
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Quem é admin
-- ----------------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
-- Sem policies: anon/authenticated não enxergam. Só o service_role (Edge Function).

create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = uid);
$$;

-- RPC que o próprio usuário logado chama para saber se é admin.
create or replace function public.am_i_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin(auth.uid());
$$;

-- is_admin(uuid) não precisa ser público: am_i_admin chama como owner.
revoke all on function public.is_admin(uuid) from public;
revoke all on function public.is_admin(uuid) from anon;
revoke all on function public.is_admin(uuid) from authenticated;
grant execute on function public.am_i_admin() to authenticated;

-- ----------------------------------------------------------------------------
-- Campos de controle no perfil
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_blocked boolean not null default false,
  add column if not exists admin_note text not null default '',
  add column if not exists plan_source text not null default '';

-- ----------------------------------------------------------------------------
-- Config global dos planos (linha única, id = 1)
-- Leitura pública (preços aparecem na landing/app); escrita só service_role.
-- ----------------------------------------------------------------------------
create table if not exists public.plan_config (
  id         integer primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.plan_config (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

alter table public.plan_config enable row level security;

drop policy if exists plan_config_read on public.plan_config;
create policy plan_config_read on public.plan_config
  for select using (true);

-- ----------------------------------------------------------------------------
-- Auditoria do admin (só service_role enxerga)
-- ----------------------------------------------------------------------------
create table if not exists public.admin_audit (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  admin_id     uuid,
  admin_email  text,
  target_id    uuid,
  target_email text,
  action       text not null,
  before       jsonb,
  after        jsonb
);

alter table public.admin_audit enable row level security;

create index if not exists admin_audit_at_idx on public.admin_audit (at desc);

-- ----------------------------------------------------------------------------
-- O usuário autenticado não pode mexer nos campos de controle (inclusive os
-- novos). O service_role (Edge Function) continua liberado.
-- ----------------------------------------------------------------------------
create or replace function public.protect_billing_columns()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' then
    new.plan := old.plan;
    new.plan_expires_at := old.plan_expires_at;
    new.mp_subscription_id := old.mp_subscription_id;
    new.mp_subscription_status := old.mp_subscription_status;
    new.mp_plan_id := old.mp_plan_id;
    new.is_blocked := old.is_blocked;
    new.admin_note := old.admin_note;
    new.plan_source := old.plan_source;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_billing on public.profiles;
create trigger profiles_protect_billing
  before update on public.profiles
  for each row execute function public.protect_billing_columns();
