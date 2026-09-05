// Configuração comercial (paywall).
// - url: link de assinatura (Mercado Pago/Stripe) quando existir.
// - whatsapp: formato 55DDDNUMBER; usado enquanto não houver url.
// Deixe url vazio durante os testes: os botões levam ao app/WhatsApp.
export const SALE = {
  url: '',
  whatsapp: ''
}

export const FREE_PROJECT_LIMIT = 3

export function planLabel(plan) {
  if (plan === 'pro') return 'Pro'
  if (plan === 'premium') return 'Premium'
  return 'Grátis'
}

export function isLimitedPlan(plan) {
  return plan !== 'pro' && plan !== 'premium'
}

export function upgradeHref(message) {
  if (SALE.url) return SALE.url
  const wa = String(SALE.whatsapp || '').replace(/\D/g, '')
  if (wa.length >= 8) {
    const text = encodeURIComponent(message || 'Olá! Quero assinar o MDF Atelier.')
    return `https://wa.me/${wa}?text=${text}`
  }
  return '#/app'
}
