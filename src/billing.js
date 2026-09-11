export const SALE = {
  url: '',
  whatsapp: '',
  email: 'wolfsaasbr@gmail.com'
}

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

const DEFAULT_BILLING_URL =
  'https://script.google.com/macros/s/AKfycbzKfLpnGAnlav80VOlqqa1oFYhaG4nUCGYdsY5TfJ8KAnUmHiJvb-YM3SRo7ROZjMhKHg/exec'

const BILLING_URL = String(import.meta.env.VITE_BILLING_URL || DEFAULT_BILLING_URL).trim()

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

function billingPost(action, payload) {
  if (!BILLING_URL) return Promise.reject(new Error('Cobrança não configurada.'))
  return fetch(BILLING_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  }).then(async (res) => {
    const json = await res.json().catch(() => null)
    if (!res.ok || !json || json.ok === false) {
      throw new Error((json && (json.error || json.message)) || 'Falha na cobrança.')
    }
    return json
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

export function syncSubscription(userId) {
  return billingPost('sync_subscription', { user_id: userId })
}

export function cancelSubscription(userId) {
  return billingPost('cancel_subscription', { user_id: userId })
}
