/**
 * MDF Atelier — cobrança Mercado Pago (Supabase Edge Function)
 *
 * Substitui o Web App do Apps Script (gas/billing.js). O front NÃO tokeniza
 * cartão: usa o modelo hospedado preapproval_plan + init_point.
 *
 * Ações: subscribe | checkout | cancel_subscription | sync_subscription
 *        + webhooks do Mercado Pago (payment / preapproval / authorized_payment)
 *
 * As ações de usuário exigem o JWT do Supabase (Authorization: Bearer <token>)
 * e só conseguem mexer no próprio user_id. Os webhooks não levam JWT; se
 * MP_WEBHOOK_SECRET estiver definido, a assinatura x-signature é validada.
 *
 * Secrets (supabase secrets set):
 *   MP_ACCESS_TOKEN      APP_USR-... (prod) ou TEST-... (teste)
 *   PRO_PRICE_CENTS      4900
 *   ULTRA_PRICE_CENTS    8900
 *   PAYMENT_PROVIDER     mp (opcional)
 *   MP_WEBHOOK_SECRET    (opcional; liga a validação da assinatura)
 *   INFINITEPAY_HANDLE   InfiniteTag da conta (ex.: maiconvss) — pagamento avulso
 *   INFINITEPAY_API      (opcional) default https://api.checkout.infinitepay.io
 *   ONCE_1M_CENTS        (opcional) default 4900
 *   ONCE_3M_CENTS        (opcional) default 12900
 *   RESEND_API_KEY       (opcional; e-mail de log via Resend)
 *   EMAIL_FROM           (opcional) remetente Resend
 *   EMAIL_LOG            (opcional) destino dos avisos
 *   NOTIFY_URL           (opcional) relay de e-mail (ex.: Web App do GAS)
 *
 * SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY são injetados
 * automaticamente pela plataforma.
 *
 * Deploy: supabase functions deploy billing --no-verify-jwt
 *   (--no-verify-jwt porque o webhook do MP não manda JWT; a validação das
 *    ações de usuário é feita aqui dentro.)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const BUILD = 'fn-2026-09-14b'
const PLAN_DAYS = 30
const DEFAULT_LOG_EMAIL = 'wolfsaasbr@gmail.com'
const PLAN_DEFS: Record<string, { reason: string; centsKey: string; fallbackCents: number }> = {
  pro: { reason: 'MDF Atelier Pro', centsKey: 'PRO_PRICE_CENTS', fallbackCents: 4900 },
  ultra: { reason: 'MDF Atelier Ultra', centsKey: 'ULTRA_PRICE_CENTS', fallbackCents: 8900 }
}
/* Pagamento avulso (InfinityPay): valor fixo em centavos + dias de Pro. */
const ONCE_DEFS: Record<string, { label: string; days: number; centsKey: string; fallbackCents: number }> = {
  '1m': { label: 'MDF Atelier Pro — 30 dias', days: 30, centsKey: 'ONCE_1M_CENTS', fallbackCents: 4900 },
  '3m': { label: 'MDF Atelier Pro — 90 dias', days: 90, centsKey: 'ONCE_3M_CENTS', fallbackCents: 12900 }
}
const MP_SUB_TOPICS = [
  'preapproval',
  'subscription_preapproval',
  'subscription_authorized_payment',
  'subscription_preapproval_plan',
  'merchant_order'
]

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const SELF_URL = SUPABASE_URL + '/functions/v1/billing'

function ipBase() {
  return (Deno.env.get('INFINITEPAY_API') || 'https://api.checkout.infinitepay.io').replace(/\/$/, '')
}

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente')
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}

const env = (k: string) => String(Deno.env.get(k) || '').trim()

function provider() {
  return (env('PAYMENT_PROVIDER') || 'mp').toLowerCase()
}

function planExpiresAt() {
  return new Date(Date.now() + PLAN_DAYS * 86400000).toISOString()
}

function uuidOk(id: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''))
}

function extRef(userId: string, plan?: string) {
  return plan ? 'plan:' + userId + ':' + plan : 'plan:' + userId
}

function userIdFromRef(ref: unknown) {
  let s = String(ref || '')
  if (s.indexOf('plan:') === 0) s = s.slice(5)
  const id = s.split(':')[0]
  return uuidOk(id) ? id : ''
}

function planFromRef(ref: unknown) {
  const s = String(ref || '')
  if (s.indexOf('plan:') !== 0) return ''
  const parts = s.split(':')
  return PLAN_DEFS[parts[2]] ? parts[2] : ''
}

function planAmount(plan: string) {
  const def = PLAN_DEFS[plan]
  if (!def) return 0
  let cents = Number(env(def.centsKey) || def.fallbackCents)
  if (!(cents > 0)) cents = def.fallbackCents
  return cents / 100
}

function onceCents(interval: string) {
  const def = ONCE_DEFS[interval]
  if (!def) return 0
  let cents = Number(env(def.centsKey) || def.fallbackCents)
  if (!(cents > 0)) cents = def.fallbackCents
  return Math.round(cents)
}

function mpCheckoutUrl(obj: any) {
  if (!obj) return ''
  return obj.init_point || obj.sandbox_init_point || ''
}

function mpSubscriptionUrl(planId: unknown) {
  if (!planId) return ''
  return (
    'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=' +
    encodeURIComponent(String(planId))
  )
}

/* ============================== e-mail / log ============================== */

async function notify(subject: string, body: string) {
  const text = String(body).slice(0, 3000)
  console.log(JSON.stringify({ notify: subject, body: text.slice(0, 1200) }))
  const to = env('EMAIL_LOG') || DEFAULT_LOG_EMAIL
  try {
    const resend = env('RESEND_API_KEY')
    if (resend) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + resend, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env('EMAIL_FROM') || 'MDF Atelier <onboarding@resend.dev>',
          to: [to],
          subject: '[MDF Atelier] ' + subject,
          text
        })
      })
      return
    }
    const relay = env('NOTIFY_URL')
    if (relay) {
      await fetch(relay, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'notify', subject, to, body: text })
      })
    }
  } catch (err) {
    console.warn('notify falhou:', String(err))
  }
}

/* ============================== Mercado Pago ============================== */

async function mpRaw(path: string, method: string, payload?: unknown) {
  const token = env('MP_ACCESS_TOKEN')
  if (!token) throw new Error('MP_ACCESS_TOKEN ausente no servidor')
  const res = await fetch('https://api.mercadopago.com' + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: payload == null ? undefined : JSON.stringify(payload)
  })
  const text = await res.text()
  let parsed: any = {}
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = {}
  }
  return { status: res.status, text, json: parsed }
}

async function mpFetch(path: string, method: string, payload?: unknown) {
  const r = await mpRaw(path, method, payload)
  if (r.status < 200 || r.status >= 300) {
    const err: any = new Error(
      'MP ' + method + ' ' + path + ' ' + r.status + ' ' + r.text.slice(0, 400)
    )
    err.status = r.status
    throw err
  }
  return r.json
}

function isNotFound(err: any) {
  const msg = String((err && err.message) || err)
  return err?.status === 404 || /404/.test(msg) || /not found/i.test(msg)
}

/* ============================== InfinityPay ============================== */

async function ipFetch(path: string, method: string, payload?: unknown) {
  const res = await fetch(ipBase() + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: payload == null ? undefined : JSON.stringify(payload)
  })
  const text = await res.text()
  let parsed: any = {}
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = {}
  }
  if (res.status < 200 || res.status >= 300) {
    const err: any = new Error(text.slice(0, 400) || `InfinityPay HTTP ${res.status}`)
    err.status = res.status
    err.json = parsed
    throw err
  }
  return parsed
}

/* ============================== perfis ============================== */

async function loadProfile(userId: string) {
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw new Error('GET profiles falhou: ' + error.message)
  return data
}

async function findProfileByPlanId(planId: string) {
  if (!planId) return null
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('mp_plan_id', planId)
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data
}

async function patchProfile(userId: string, patch: Record<string, unknown>) {
  const { data, error } = await sb
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .maybeSingle()
  if (error) throw new Error('PATCH profiles falhou: ' + error.message)
  return data
}

function paidPlan(row: any) {
  if (!row) return false
  if (row.plan !== 'pro' && row.plan !== 'ultra') return false
  if (!row.plan_expires_at) return true
  return new Date(row.plan_expires_at).getTime() > Date.now()
}

function inferPlan(sub: any, prof: any, fallback: string) {
  const fromRef = planFromRef(sub && sub.external_reference)
  if (fromRef) return fromRef
  const amount = Number(
    (sub && sub.auto_recurring && sub.auto_recurring.transaction_amount) ||
      (sub && sub.summarized && sub.summarized.charged_amount) ||
      0
  )
  if (amount && Math.abs(amount - planAmount('ultra')) < 0.05) return 'ultra'
  const reason = String((sub && sub.reason) || '')
  if (/ultra/i.test(reason)) return 'ultra'
  if (prof && prof.plan === 'ultra') return 'ultra'
  return fallback || 'pro'
}

async function activatePlan(userId: string, plan: string) {
  let next = PLAN_DEFS[plan] ? plan : 'pro'
  const row = await loadProfile(userId)
  if (row && row.plan === 'ultra' && next === 'pro') next = 'ultra'
  await patchProfile(userId, { plan: next, plan_expires_at: planExpiresAt() })
  const fresh = await loadProfile(userId)
  if (!fresh || (fresh.plan !== 'pro' && fresh.plan !== 'ultra')) {
    await notify('ATENÇÃO: plano não confirmado', 'user=' + userId + '\nrow=' + JSON.stringify(fresh))
    throw new Error('Plano não confirmado')
  }
  return fresh
}

/**
 * Libera `days` de Pro somando ao saldo atual (não descarta tempo já pago).
 * Usado no pagamento avulso: 1 mês = 30 dias, 3 meses = 90 dias.
 */
async function grantDays(userId: string, days: number) {
  const row = await loadProfile(userId)
  if (!row) throw new Error('Perfil não encontrado')
  const current = row.plan_expires_at ? new Date(row.plan_expires_at).getTime() : 0
  const base = Number.isFinite(current) && current > Date.now() ? current : Date.now()
  const expires = new Date(base + days * 86400000).toISOString()
  const plan = row.plan === 'ultra' ? 'ultra' : 'pro'
  await patchProfile(userId, { plan, plan_expires_at: expires })
  const fresh = await loadProfile(userId)
  if (!fresh || (fresh.plan !== 'pro' && fresh.plan !== 'ultra')) {
    await notify('ATENÇÃO: plano avulso não confirmado', 'user=' + userId + '\nrow=' + JSON.stringify(fresh))
    throw new Error('Plano não confirmado')
  }
  return fresh
}

async function resolveUser(ext: string, planId?: string, preapprovalId?: string) {
  let userId = userIdFromRef(ext)
  if (userId) return userId
  if (planId) {
    const byPlan = await findProfileByPlanId(String(planId))
    if (byPlan) return String(byPlan.id)
  }
  if (preapprovalId) {
    try {
      const pre = await mpFetch('/preapproval/' + encodeURIComponent(preapprovalId), 'get')
      if (pre && pre.preapproval_plan_id) {
        const byPre = await findProfileByPlanId(String(pre.preapproval_plan_id))
        if (byPre) return String(byPre.id)
      }
      userId = userIdFromRef(pre && pre.external_reference)
    } catch {
      /* ignore */
    }
  }
  return userId || ''
}

/* ============================== webhook dedupe ============================== */

async function beginEvent(id: string) {
  const { error } = await sb.from('mp_events').insert({ id })
  if (!error) return true
  if (error.code === '23505') return false
  console.warn('mp_events insert falhou:', error.message)
  return true
}

async function dropEvent(id: string) {
  try {
    await sb.from('mp_events').delete().eq('id', id)
  } catch {
    /* ignore */
  }
}

/* ============================== ações ============================== */

async function ensureMpPlan(userId: string, plan: string, redirectUrl: string) {
  if (!env('MP_ACCESS_TOKEN')) return { error: 'MP_ACCESS_TOKEN ausente no servidor' }
  const row = await loadProfile(userId)
  if (!row) return { error: 'Perfil não encontrado. Entre no app uma vez antes de assinar.' }
  const want = planAmount(plan)

  if (row.mp_plan_id) {
    try {
      const existing = await mpFetch('/preapproval_plan/' + encodeURIComponent(row.mp_plan_id), 'get')
      const existingAmt = Number((existing.auto_recurring && existing.auto_recurring.transaction_amount) || 0)
      const samePrice = !want || Math.abs(existingAmt - want) < 0.05
      if (existing && String(existing.status || '') === 'active' && samePrice) {
        const reuse = mpCheckoutUrl(existing) || mpSubscriptionUrl(existing.id)
        if (reuse) return { plan_id: String(existing.id), url: reuse }
      }
    } catch {
      /* plano antigo inválido -> cria outro */
    }
  }

  const payload: any = {
    reason: PLAN_DEFS[plan].reason,
    external_reference: extRef(userId, plan),
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: want,
      currency_id: 'BRL'
    },
    back_url: redirectUrl || '',
    notification_url: SELF_URL
  }

  let res = await mpRaw('/preapproval_plan', 'post', payload)
  if (res.status >= 300 && res.status < 500 && payload.notification_url && /notification[_\s]?url/i.test(res.text)) {
    await notify('MP recusou notification_url; plano será criado SEM webhook no recurso', res.text.slice(0, 600))
    delete payload.notification_url
    res = await mpRaw('/preapproval_plan', 'post', payload)
  }
  if (res.status >= 300 || !res.json.id) {
    await notify('Falha ao criar plano MP (user ' + userId + ')', res.text)
    return { error: res.json.message || res.json.error || 'Mercado Pago recusou o plano', status: res.status }
  }
  const checkoutUrl = mpCheckoutUrl(res.json) || mpSubscriptionUrl(res.json.id)
  if (!checkoutUrl) {
    await notify('Plano MP criado sem init_point (user ' + userId + ')', res.text)
    return { error: 'Mercado Pago não devolveu o link de assinatura', status: res.status }
  }
  await patchProfile(userId, { mp_plan_id: String(res.json.id) })
  return { plan_id: String(res.json.id), url: checkoutUrl }
}

async function handleSubscribe(userId: string, body: any) {
  const plan = String(body.plan || 'pro')
  const redirectUrl = String(body.redirect_url || '')
  if (!uuidOk(userId)) return { ok: false, error: 'user_id inválido' }
  if (!PLAN_DEFS[plan]) return { ok: false, error: 'plano inválido' }
  if (!redirectUrl) return { ok: false, error: 'redirect_url ausente' }
  const created = await ensureMpPlan(userId, plan, redirectUrl)
  if (created.error) return { ok: false, error: created.error }
  return { ok: true, url: created.url, plan_id: created.plan_id, plan }
}

async function handleCheckout(userId: string, body: any) {
  if (!env('MP_ACCESS_TOKEN')) return { ok: false, error: 'MP_ACCESS_TOKEN ausente no servidor' }
  const plan = String(body.plan || 'pro')
  const redirect = String(body.redirect_url || '')
  if (!uuidOk(userId)) return { ok: false, error: 'user_id inválido' }
  if (!PLAN_DEFS[plan]) return { ok: false, error: 'plano inválido' }
  if (!redirect) return { ok: false, error: 'redirect_url ausente' }
  const row = await loadProfile(userId)
  if (!row) return { ok: false, error: 'Perfil não encontrado. Entre no app uma vez antes de pagar.' }
  const payload = {
    items: [
      {
        title: PLAN_DEFS[plan].reason + ' — 30 dias',
        quantity: 1,
        currency_id: 'BRL',
        unit_price: planAmount(plan)
      }
    ],
    external_reference: extRef(userId, plan) + ':' + Date.now(),
    notification_url: SELF_URL,
    auto_return: 'approved',
    back_urls: { success: redirect, pending: redirect, failure: redirect },
    statement_descriptor: 'MDFATELIER'
  }
  let parsed: any
  try {
    parsed = await mpFetch('/checkout/preferences', 'post', payload)
  } catch (err: any) {
    await notify('Falha ao gerar checkout MP (user ' + userId + ')', String(err))
    return { ok: false, error: String((err && err.message) || err) }
  }
  const url = mpCheckoutUrl(parsed)
  if (!url) return { ok: false, error: 'Mercado Pago não devolveu o link de pagamento' }
  return { ok: true, url, plan, once: true }
}

async function findSubscriptionId(row: any) {
  const planId = String((row && row.mp_plan_id) || '')
  if (!planId) return ''
  try {
    const data: any = await mpFetch(
      '/preapproval/search?preapproval_plan_id=' + encodeURIComponent(planId) + '&status=authorized&limit=1',
      'get'
    )
    const found = (data.results || [])[0]
    return found && found.id ? String(found.id) : ''
  } catch {
    return ''
  }
}

async function handleCancel(userId: string) {
  if (!uuidOk(userId)) return { ok: false, error: 'user_id inválido' }
  const row = await loadProfile(userId)
  if (!row) return { ok: false, error: 'Perfil não encontrado' }
  let subId = String(row.mp_subscription_id || '')
  if (!subId) subId = await findSubscriptionId(row)
  if (!subId) {
    return {
      ok: false,
      error:
        'Nenhuma assinatura recorrente ativa no Mercado Pago. Se o Pro veio de um pagamento avulso, não há cobrança para cancelar.'
    }
  }
  try {
    await mpFetch('/preapproval/' + encodeURIComponent(subId), 'put', { status: 'canceled' })
  } catch (err) {
    if (!isNotFound(err)) {
      await notify('Falha ao cancelar assinatura (user ' + userId + ')', String(err))
      return { ok: false, error: String((err && err.message) || err) }
    }
  }
  await patchProfile(userId, { mp_subscription_id: subId, mp_subscription_status: 'canceled' })
  await notify('Assinatura cancelada', 'user=' + userId + '\nsub=' + subId)
  return { ok: true, canceled: true, subscription_id: subId }
}

async function handleSync(userId: string) {
  if (!uuidOk(userId)) return { ok: false, error: 'user_id inválido' }
  if (!env('MP_ACCESS_TOKEN')) return { ok: false, error: 'MP_ACCESS_TOKEN ausente no servidor' }
  const row = await loadProfile(userId)
  if (!row) return { ok: false, error: 'Perfil não encontrado' }
  if (paidPlan(row)) {
    return {
      ok: true,
      status: 'already-active',
      plan: row.plan,
      plan_expires_at: row.plan_expires_at,
      mp_subscription_status: row.mp_subscription_status
    }
  }
  const planId = String(row.mp_plan_id || '')
  if (!planId) return { ok: false, error: 'mp_plan_id vazio (assine primeiro)', status: 'no-plan' }

  let data: any
  try {
    data = await mpFetch(
      '/preapproval/search?preapproval_plan_id=' + encodeURIComponent(planId) + '&status=authorized&limit=1',
      'get'
    )
  } catch {
    await notify('Sync assinatura falhou (user ' + userId + ')', 'preapproval search erro')
    return { ok: false, error: 'Mercado Pago recusou a consulta', status: 'search-failed' }
  }
  const found = (data.results || [])[0]
  if (!found) {
    return { ok: false, status: 'no-subscription', error: 'Nenhuma assinatura autorizada encontrada no MP' }
  }
  const subId = String(found.id)
  const plan = inferPlan(found, row, 'pro')
  await patchProfile(userId, { mp_subscription_id: subId, mp_subscription_status: 'authorized' })
  const fresh = await activatePlan(userId, plan)
  await notify(
    'Assinatura ativada (sync)',
    'user=' + userId + '\nsub=' + subId + '\nplano=' + fresh.plan + '\nvalidade=' + fresh.plan_expires_at
  )
  return {
    ok: true,
    status: 'activated',
    plan: fresh.plan,
    plan_expires_at: fresh.plan_expires_at,
    mp_subscription_status: 'authorized',
    subscription_id: subId
  }
}

/* ============================== avulso (InfinityPay) ============================== */

async function findByOrderNsu(orderNsu: string) {
  const { data, error } = await sb.from('ip_orders').select('*').eq('order_nsu', orderNsu).maybeSingle()
  if (error) throw new Error('GET ip_orders falhou: ' + error.message)
  return data
}

async function markOrderPaid(order: any, info: any) {
  const patch: Record<string, unknown> = { status: 'paid', paid_at: new Date().toISOString() }
  if (info && info.slug) patch.slug = String(info.slug).slice(0, 120)
  if (info && info.transaction_nsu) patch.transaction_nsu = String(info.transaction_nsu).slice(0, 120)
  if (info && info.capture_method) patch.capture_method = String(info.capture_method).slice(0, 30)
  if (info && info.receipt_url) patch.receipt_url = String(info.receipt_url).slice(0, 500)
  await sb.from('ip_orders').update(patch).eq('order_nsu', order.order_nsu)
}

async function handleInfinityCheckout(userId: string, body: any) {
  if (!env('INFINITEPAY_HANDLE')) return { ok: false, error: 'Pagamento avulso indisponível no servidor.' }
  if (!uuidOk(userId)) return { ok: false, error: 'user_id inválido' }
  const interval = String(body.interval || '1m')
  const def = ONCE_DEFS[interval]
  if (!def) return { ok: false, error: 'opção de pagamento inválida' }
  const redirect = String(body.redirect_url || '')
  if (!redirect) return { ok: false, error: 'redirect_url ausente' }
  const row = await loadProfile(userId)
  if (!row) return { ok: false, error: 'Perfil não encontrado. Entre no app uma vez antes de pagar.' }
  let email = ''
  try {
    const { data } = await sb.auth.admin.getUserById(userId)
    email = String((data && data.user && data.user.email) || '')
  } catch {
    /* e-mail é opcional */
  }
  const cents = onceCents(interval)
  const orderNsu = 'ip-' + userId + '-' + Date.now().toString(36)
  const payload: any = {
    handle: env('INFINITEPAY_HANDLE'),
    order_nsu: orderNsu,
    redirect_url: redirect,
    webhook_url: SELF_URL + '?infinity=1',
    items: [{ quantity: 1, price: cents, description: def.label }]
  }
  if (email) payload.customer = { email }
  let data: any
  try {
    data = await ipFetch('/links', 'post', payload)
  } catch (err: any) {
    await notify('Falha ao gerar link avulso (user ' + userId + ')', String((err && err.message) || err))
    return { ok: false, error: 'Não deu para abrir o pagamento agora. Tente de novo.' }
  }
  if (!data || !data.url) return { ok: false, error: 'O pagamento não devolveu o link.' }
  const { error } = await sb.from('ip_orders').insert({
    order_nsu: orderNsu,
    user_id: userId,
    interval,
    days: def.days,
    amount_cents: cents
  })
  if (error) {
    await notify('Falha ao gravar pedido avulso (user ' + userId + ')', error.message)
    return { ok: false, error: 'Não deu para registrar o pedido. Tente de novo.' }
  }
  return { ok: true, url: String(data.url), order_nsu: orderNsu, interval, days: def.days }
}

async function handleInfinityConfirm(userId: string, body: any) {
  if (!env('INFINITEPAY_HANDLE')) return { ok: false, error: 'Pagamento avulso indisponível no servidor.' }
  if (!uuidOk(userId)) return { ok: false, error: 'user_id inválido' }
  const orderNsu = String(body.order_nsu || '')
  if (!orderNsu) return { ok: false, error: 'order_nsu ausente' }
  const order = await findByOrderNsu(orderNsu)
  if (!order || String(order.user_id) !== userId) return { ok: false, error: 'Pedido não encontrado' }
  if (order.status === 'paid') {
    const p = await loadProfile(userId)
    return { ok: true, status: 'already', plan: p && p.plan, plan_expires_at: p && p.plan_expires_at }
  }
  let check: any = {}
  try {
    check = await ipFetch('/payment_check', 'post', {
      handle: env('INFINITEPAY_HANDLE'),
      order_nsu: orderNsu,
      transaction_nsu: String(body.transaction_nsu || order.transaction_nsu || ''),
      slug: String(body.slug || order.slug || '')
    })
  } catch {
    return { ok: false, status: 'pending', error: 'Pagamento ainda não confirmado.' }
  }
  if (!check || check.paid !== true) {
    return { ok: false, status: 'pending', error: 'Pagamento ainda não confirmado. Se já pagou, aguarde alguns segundos.' }
  }
  await markOrderPaid(order, {
    slug: body.slug,
    transaction_nsu: body.transaction_nsu,
    capture_method: body.capture_method,
    receipt_url: body.receipt_url
  })
  const fresh = await grantDays(userId, Number(order.days) || 30)
  await notify(
    'Pagamento avulso confirmado',
    'user=' + userId + '\norder=' + orderNsu + '\nplano=' + fresh.plan + '\nvalidade=' + fresh.plan_expires_at
  )
  return { ok: true, status: 'activated', plan: fresh.plan, plan_expires_at: fresh.plan_expires_at }
}

async function handleInfinityWebhook(body: any) {
  const orderNsu = String(body.order_nsu || '')
  if (!orderNsu) return { success: false, message: 'order_nsu ausente' }
  let order: any = null
  try {
    order = await findByOrderNsu(orderNsu)
  } catch (err) {
    console.warn('ip_orders lookup falhou:', String(err))
  }
  if (!order) {
    await notify('Webhook avulso sem pedido', JSON.stringify(body).slice(0, 1500))
    return { success: false, message: 'Pedido não encontrado' }
  }
  if (order.status === 'paid') return { success: true, message: null }
  const freshEvent = await beginEvent('ip:' + orderNsu)
  if (!freshEvent) return { success: true, message: null }
  try {
    await markOrderPaid(order, {
      slug: body.invoice_slug,
      transaction_nsu: body.transaction_nsu,
      capture_method: body.capture_method,
      receipt_url: body.receipt_url
    })
    const fresh = await grantDays(String(order.user_id), Number(order.days) || 30)
    await notify(
      'Pagamento avulso aprovado (webhook)',
      'user=' + order.user_id + '\norder=' + orderNsu + '\nplano=' + fresh.plan + '\nvalidade=' + fresh.plan_expires_at
    )
    return { success: true, message: null }
  } catch (err) {
    await dropEvent('ip:' + orderNsu)
    throw err
  }
}

function isInfinityWebhook(req: Request, body: any) {
  const url = new URL(req.url)
  if (url.searchParams.get('infinity')) return true
  return !!(body && body.order_nsu && (body.invoice_slug || body.capture_method || body.paid_amount != null))
}

/* ============================== webhooks ============================== */

async function handleMpApprovedPayment(eventId: string, payment: any) {
  const fresh = await beginEvent(eventId)
  if (!fresh) return { ok: true, already: true }
  try {
    const ext = String(payment.external_reference || '')
    const userId = await resolveUser(ext, payment.preapproval_plan_id, payment.preapproval_id)
    if (!userId) {
      await notify('Webhook MP aprovado sem usuário (aguardando vínculo?)', JSON.stringify(payment).slice(0, 2000))
      return { ok: true, status: 'no-store' }
    }
    const plan = planFromRef(ext) || inferPlan(payment, await loadProfile(userId), 'pro')
    await activatePlan(userId, plan)
    return { ok: true }
  } catch (err) {
    await dropEvent(eventId)
    throw err
  }
}

async function handleMpPaymentWebhook(paymentId: string) {
  let payment: any
  try {
    payment = await mpFetch('/v1/payments/' + encodeURIComponent(paymentId), 'get')
  } catch (err) {
    if (isNotFound(err)) return { ok: true, status: 'not-found' }
    throw err
  }
  if (String(payment.status || '') !== 'approved') return { ok: true, status: payment.status }
  return handleMpApprovedPayment('pay:' + paymentId, payment)
}

async function handleMpPreapprovalWebhook(subId: string) {
  if (!subId || subId === '123456') return { ok: true, status: 'ignored' }
  let pre: any
  try {
    pre = await mpFetch('/preapproval/' + encodeURIComponent(subId), 'get')
  } catch (err) {
    if (isNotFound(err)) return { ok: true, status: 'not-found' }
    throw err
  }
  const status = String(pre.status || '')
  const userId = await resolveUser(pre.external_reference, pre.preapproval_plan_id, subId)
  if (!userId) {
    await notify('Webhook MP preapproval sem usuário (ack 200; sync cobre a 1ª cobrança)', JSON.stringify(pre))
    return { ok: true, status: 'no-store' }
  }
  if (status === 'canceled' || status === 'paused') {
    await patchProfile(userId, { mp_subscription_status: status })
    return { ok: true, status }
  }
  if (status === 'authorized') {
    const fresh = await beginEvent('sub:' + subId)
    if (!fresh) return { ok: true, already: true }
    try {
      await patchProfile(userId, { mp_subscription_id: subId, mp_subscription_status: 'authorized' })
      const plan = inferPlan(pre, await loadProfile(userId), 'pro')
      const p = await activatePlan(userId, plan)
      await notify(
        'Assinatura ativada - plano liberado',
        'user=' + userId + '\nsub=' + subId + '\nplano=' + p.plan + '\nvalidade=' + p.plan_expires_at
      )
    } catch (err) {
      await dropEvent('sub:' + subId)
      throw err
    }
  }
  return { ok: true, status }
}

async function handleMpAuthorizedPaymentWebhook(authId: string) {
  if (!authId || authId === '123456') return { ok: true, status: 'ignored' }
  let auth: any
  try {
    auth = await mpFetch('/authorized_payments/' + encodeURIComponent(authId), 'get')
  } catch (err) {
    if (isNotFound(err)) return { ok: true, status: 'not-found' }
    throw err
  }
  const userId = await resolveUser(auth.external_reference, auth.preapproval_plan_id, auth.preapproval_id)
  if (!userId) {
    await notify('Webhook MP authorized_payment sem usuário (ack 200)', JSON.stringify(auth))
    return { ok: true, status: 'no-store' }
  }
  return handleMpApprovedPayment('ap:' + authId, {
    external_reference: auth.external_reference || extRef(userId),
    status: 'approved',
    preapproval_plan_id: auth.preapproval_plan_id,
    preapproval_id: auth.preapproval_id
  })
}

function isMpWebhook(req: Request, body: any) {
  const url = new URL(req.url)
  const type = String(body.type || url.searchParams.get('topic') || '')
  if (type === 'payment' || MP_SUB_TOPICS.indexOf(type) !== -1) return true
  if (body && body.data && body.data.id) return true
  return false
}

async function signatureOk(req: Request) {
  const secret = env('MP_WEBHOOK_SECRET')
  if (!secret) return true
  const sig = req.headers.get('x-signature') || ''
  const reqId = req.headers.get('x-request-id') || ''
  const parts: Record<string, string> = {}
  sig.split(',').forEach((pair) => {
    const i = pair.indexOf('=')
    if (i > 0) parts[pair.slice(0, i).trim()] = pair.slice(i + 1).trim()
  })
  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1) return false
  const url = new URL(req.url)
  const dataId = url.searchParams.get('data.id') || ''
  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest))
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex === v1
}

/* ============================== auth ============================== */

async function userFromJwt(req: Request, body: any): Promise<string> {
  const header = req.headers.get('Authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  const claimed = String(body.user_id || body.store_id || '')
  if (!token || (ANON_KEY && token === ANON_KEY)) return ''
  try {
    const { data, error } = await sb.auth.getUser(token)
    if (error || !data || !data.user) return ''
    if (claimed && claimed !== data.user.id) return ''
    return data.user.id
  } catch {
    return ''
  }
}

const USER_ACTIONS = [
  'subscribe',
  'checkout',
  'infinity_once',
  'infinity_confirm',
  'cancel_subscription',
  'sync_subscription'
]

/* ============================== handler ============================== */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method === 'GET') {
    return json({
      ok: true,
      service: 'mdf-atelier-billing',
      build: BUILD,
      provider: provider(),
      routes: [...USER_ACTIONS, 'webhook']
    })
  }
  if (req.method !== 'POST') return json({ ok: false, error: 'método não permitido' }, 405)

  const raw = await req.text()
  let body: any = {}
  try {
    body = JSON.parse(raw)
  } catch {
    body = {}
    raw.split('&').forEach((pair) => {
      const i = pair.indexOf('=')
      if (i > 0) body[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1))
    })
  }

  const action = String(body.action || '')
  const log: any = {
    at: new Date().toISOString(),
    action: 'desconhecida',
    provider: provider(),
    keys: Object.keys(body).slice(0, 25)
  }

  try {
    let result: any
    if (USER_ACTIONS.indexOf(action) !== -1) {
      log.action = action
      const userId = await userFromJwt(req, body)
      if (!userId) return json({ ok: false, error: 'Sessão expirada. Entre de novo no app.' }, 401)
      if (action === 'subscribe') result = await handleSubscribe(userId, body)
      else if (action === 'checkout') result = await handleCheckout(userId, body)
      else if (action === 'infinity_once') result = await handleInfinityCheckout(userId, body)
      else if (action === 'infinity_confirm') result = await handleInfinityConfirm(userId, body)
      else if (action === 'cancel_subscription') result = await handleCancel(userId)
      else result = await handleSync(userId)
    } else if (isInfinityWebhook(req, body)) {
      log.action = 'webhook_infinity'
      const ipResult = await handleInfinityWebhook(body)
      log.result = ipResult
      console.log(JSON.stringify(log))
      return json(ipResult, ipResult && ipResult.success ? 200 : 400)
    } else if (isMpWebhook(req, body)) {
      log.action = 'webhook_mp'
      if (!(await signatureOk(req))) return json({ ok: false, error: 'assinatura inválida' }, 401)
      const url = new URL(req.url)
      const type = String(body.type || url.searchParams.get('topic') || 'payment')
      const dataId = String((body.data && body.data.id) || url.searchParams.get('id') || '')
      if (type === 'preapproval' || type === 'subscription_preapproval') {
        result = await handleMpPreapprovalWebhook(dataId)
      } else if (type === 'subscription_authorized_payment') {
        result = await handleMpAuthorizedPaymentWebhook(dataId)
      } else if (type === 'merchant_order' || type === 'subscription_preapproval_plan') {
        result = { ok: true, ignored: type }
      } else {
        result = await handleMpPaymentWebhook(dataId)
      }
    } else {
      log.action = 'ignored'
      result = { ok: true, ignored: true }
    }

    log.result = result
    console.log(JSON.stringify(log))
    if (result && result.ok === false) await notify('Falha em ' + log.action, JSON.stringify(log, null, 2))
    return json(result)
  } catch (err: any) {
    log.error = String((err && err.stack) || err)
    console.log(JSON.stringify(log))
    await notify('Erro em ' + log.action + ' - ' + String((err && err.message) || err), JSON.stringify(log, null, 2))
    if (log.action === 'webhook_mp') return json({ ok: false, error: 'erro interno' }, 500)
    return json({ ok: false, error: String((err && err.message) || err) })
  }
})
