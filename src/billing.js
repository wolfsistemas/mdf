export const SALE = {
  url: '',
  whatsapp: '',
  email: 'wolfsaasbr@gmail.com'
}

/* Conta exclusiva do painel administrativo (admin.html). */
export const ADMIN_EMAIL = 'wolfsaasbr@gmail.com'
export const ADMIN_ALIAS = 'admin'

export const FREE_PROJECT_LIMIT = 3

export const PLANS = {
  gratis: {
    id: 'gratis',
    label: 'Grátis',
    priceLabel: 'R$ 0',
    cents: 0
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    priceLabel: 'R$ 49/mês',
    cents: 4900
  },
  ultra: {
    id: 'ultra',
    label: 'Ultra',
    priceLabel: 'R$ 89/mês',
    cents: 8900
  }
}

/* Pagamento avulso (sem recorrência): 1 mês ou 3 meses de Pro. */
export const ONCE_PLANS = {
  '1m': { id: '1m', label: '1 mês', priceLabel: 'R$ 49', cents: 4900, days: 30 },
  '3m': { id: '3m', label: '3 meses', priceLabel: 'R$ 129', cents: 12900, days: 90 }
}

const DEFAULT_BILLING_URL = 'https://bqwiostqeeahhcoohkcz.supabase.co/functions/v1/billing'

const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxd2lvc3RxZWVhaGhjb29oa2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MDg0NDIsImV4cCI6MjEwNDE4NDQ0Mn0.DDGoEWygqd5c-9Ja6kZtghdRCT9s8axiBG6vUNd6KVc'

const BILLING_URL = String(import.meta.env.VITE_BILLING_URL || DEFAULT_BILLING_URL).trim()
const ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY).trim()

export function billingConfigured() {
  return Boolean(BILLING_URL)
}

export function planLabel(plan) {
  if (plan === 'pro') return 'Pro'
  if (plan === 'ultra' || plan === 'premium') return 'Ultra'
  return 'Grátis'
}

export function isLimitedPlan(plan) {
  return plan !== 'pro' && plan !== 'ultra' && plan !== 'premium'
}

export function effectivePlan(plan, expiresAt) {
  const id = plan === 'premium' ? 'ultra' : plan
  if (id !== 'pro' && id !== 'ultra') return 'gratis'
  if (!expiresAt) return id
  const t = new Date(expiresAt).getTime()
  if (Number.isFinite(t) && t < Date.now()) return 'gratis'
  return id
}

export function saleDigits() {
  return String(SALE.whatsapp || '').replace(/\D/g, '')
}

export function supportHref(message) {
  const wa = saleDigits()
  if (wa.length >= 8) {
    const text = encodeURIComponent(message || 'Olá! Preciso de suporte no MDF Atelier.')
    return `https://wa.me/${wa}?text=${text}`
  }
  const email = String(SALE.email || '').trim()
  if (email) {
    const subject = encodeURIComponent('Suporte MDF Atelier')
    const body = encodeURIComponent(message || 'Olá! Preciso de suporte no MDF Atelier.')
    return `mailto:${email}?subject=${subject}&body=${body}`
  }
  return '#/app'
}

export function supportLabel() {
  return saleDigits().length >= 8 ? 'WhatsApp de suporte' : 'E-mail de suporte'
}

export function upgradeHref(message) {
  if (SALE.url) return SALE.url
  const wa = saleDigits()
  if (wa.length >= 8) {
    const text = encodeURIComponent(message || 'Olá! Quero assinar o MDF Atelier.')
    return `https://wa.me/${wa}?text=${text}`
  }
  return '#/app'
}

export function salePlanHref(plan) {
  if (SALE.url) return SALE.url
  const wa = saleDigits()
  if (wa.length >= 8) {
    const text = encodeURIComponent(`Olá! Quero o plano ${plan} do MDF Atelier.`)
    return `https://wa.me/${wa}?text=${text}`
  }
  return '#/app'
}

export function billingReturnUrl() {
  const path = location.pathname || '/'
  return location.origin + path + '?plano=ok#/app'
}

export function infinityReturnUrl() {
  const path = location.pathname || '/'
  return location.origin + path + '?avulso=ok#/app'
}

async function billingPost(action, payload) {
  if (!BILLING_URL) throw new Error('Cobrança não configurada.')
  let token = null
  try {
    const mod = await import('./cloud.js')
    token = await mod.currentAccessToken()
  } catch {
    token = null
  }
  if (!token) throw new Error('Sessão expirada. Entre de novo no app.')
  return fetch(BILLING_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify({ action, ...payload })
  })
    .then(async (res) => {
      const text = await res.text().catch(() => '')
      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch (err) {
        json = null
      }
      if (!res.ok || !json || json.ok === false) {
        const serverMsg = json && (json.error || json.message)
        const snippet = text ? text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) : ''
        const err = new Error(serverMsg || snippet || `Falha na cobrança (HTTP ${res.status}).`)
        if (json && json.code) err.code = json.code
        throw err
      }
      return json
    })
    .catch((err) => {
      if (err instanceof TypeError) throw new Error('Sem conexão com o servidor de cobrança. Tente de novo.')
      throw err
    })
}

export function subscribePlan(userId, plan) {
  return billingPost('subscribe', {
    user_id: userId,
    plan,
    redirect_url: billingReturnUrl()
  })
}

export function checkoutOnce(userId, plan) {
  return billingPost('checkout', {
    user_id: userId,
    plan,
    redirect_url: billingReturnUrl()
  })
}

/* Abre o checkout de pagamento avulso (1 mês / 3 meses). */
export function checkoutOnceInfinity(userId, interval) {
  return billingPost('infinity_once', {
    user_id: userId,
    interval,
    redirect_url: infinityReturnUrl()
  })
}

/* Confirma no servidor se o pagamento avulso caiu (redundante ao webhook). */
export function confirmInfinity(userId, params) {
  return billingPost('infinity_confirm', {
    user_id: userId,
    order_nsu: params && params.order_nsu,
    transaction_nsu: params && params.transaction_nsu,
    slug: params && params.slug
  })
}

export function syncSubscription(userId) {
  return billingPost('sync_subscription', { user_id: userId })
}

export function cancelSubscription(userId) {
  return billingPost('cancel_subscription', { user_id: userId })
}

/* Chamadas do super admin (mesma Edge Function, valida no servidor). */
export function adminAction(action, payload = {}) {
  return billingPost(action, payload)
}

/* ============================== config global dos planos ============================== */

const REST_BASE = BILLING_URL.replace(/\/functions\/v1\/.*$/, '')
let planCfg = undefined
let freeLimitValue = FREE_PROJECT_LIMIT

export function getPlanConfig() {
  return planCfg && typeof planCfg === 'object' ? planCfg : {}
}

export function freeProjectLimit() {
  return freeLimitValue
}

function applyPlanConfig(data) {
  const d = data && typeof data === 'object' ? data : {}
  if (d.plans && typeof d.plans === 'object') {
    for (const id of ['gratis', 'pro', 'ultra']) {
      const c = d.plans[id]
      if (!c || typeof c !== 'object') continue
      if (c.label) PLANS[id].label = String(c.label)
      if (c.priceLabel) PLANS[id].priceLabel = String(c.priceLabel)
      if (Number.isFinite(Number(c.cents)) && Number(c.cents) >= 0) PLANS[id].cents = Number(c.cents)
    }
  }
  if (d.once && typeof d.once === 'object') {
    for (const id of ['1m', '3m']) {
      const c = d.once[id]
      if (!c || typeof c !== 'object') continue
      if (c.label) ONCE_PLANS[id].label = String(c.label)
      if (c.priceLabel) ONCE_PLANS[id].priceLabel = String(c.priceLabel)
      if (Number.isFinite(Number(c.cents)) && Number(c.cents) > 0) ONCE_PLANS[id].cents = Number(c.cents)
      if (Number.isFinite(Number(c.days)) && Number(c.days) > 0) ONCE_PLANS[id].days = Number(c.days)
    }
  }
  const limit = Number(d.freeProjectLimit)
  if (Number.isFinite(limit) && limit > 0) freeLimitValue = Math.round(limit)
}

/* Carrega (uma vez) a config global e aplica nos rótulos/preços do app.
   Sem rede, mantém os padrões do código. */
export function loadPlanConfig(force = false) {
  if (planCfg !== undefined && !force) return Promise.resolve(planCfg)
  if (!REST_BASE) {
    planCfg = {}
    return Promise.resolve(planCfg)
  }
  return fetch(REST_BASE + '/rest/v1/plan_config?id=eq.1&select=data', {
    headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY }
  })
    .then((res) => res.json())
    .then((rows) => {
      const data = rows && rows[0] && rows[0].data ? rows[0].data : {}
      applyPlanConfig(data)
      planCfg = data
      return planCfg
    })
    .catch(() => {
      planCfg = {}
      return planCfg
    })
}
