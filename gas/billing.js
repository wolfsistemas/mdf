/**
 * MDF Atelier — cobrança Mercado Pago (Apps Script)
 *
 * Portado do GAS que já funciona no VitrineZap (wolfsistemas/app):
 * modelo HOSPEDADO com preapproval_plan + init_point. Front NÃO tokeniza cartão.
 *
 * Deploy: Web app, Execute as: Me, Who has access: Anyone.
 * Ao atualizar: Nova versão no MESMO deployment (não crie outro).
 *
 * Script Properties:
 *   SUPABASE_URL            https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE   service_role (nunca no front)
 *   PAYMENT_PROVIDER        mp
 *   MP_ACCESS_TOKEN         APP_USR-... (prod) ou TEST-... (sandbox)
 *   MP_USE_SANDBOX          true só em teste; vazio em produção
 *   EMAIL_LOG               e-mail de log (padrão wolfsaasbr@gmail.com)
 *   PRO_PRICE_CENTS         4900
 *   ULTRA_PRICE_CENTS       8900
 *   MP_PROCESSED            NÃO mexer (dedupe interno)
 */

var PLAN_DAYS = 30
var DEFAULT_LOG_EMAIL = 'wolfsaasbr@gmail.com'
var PLAN_DEFS = {
  pro: { reason: 'MDF Atelier Pro', centsKey: 'PRO_PRICE_CENTS', fallbackCents: 4900 },
  ultra: { reason: 'MDF Atelier Ultra', centsKey: 'ULTRA_PRICE_CENTS', fallbackCents: 8900 }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}

function props() {
  return PropertiesService.getScriptProperties()
}

function prop_(k) {
  return String(props().getProperty(k) || '').trim()
}

function provider() {
  return String(prop_('PAYMENT_PROVIDER') || 'mp').toLowerCase()
}

function notify(subject, body) {
  try {
    var email = prop_('EMAIL_LOG') || DEFAULT_LOG_EMAIL
    MailApp.sendEmail(email, '[MDF Atelier] ' + subject, String(body).slice(0, 3000))
  } catch (err) {
    console.log('Falha ao enviar e-mail de log: ' + err)
  }
}

function safeLog(obj) {
  try {
    console.log(JSON.stringify(obj))
  } catch (err) {
    console.log('Erro ao gerar log: ' + err)
  }
}

function parseQueryString(qs) {
  var out = {}
  if (!qs) return out
  qs.split('&').forEach(function (pair) {
    var i = pair.indexOf('=')
    if (i < 0) return
    out[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1))
  })
  return out
}

function parseBody(e) {
  var raw = (e && e.postData && e.postData.contents) || ''
  var body = {}
  try {
    body = JSON.parse(raw)
  } catch (err) {
    body = parseQueryString(raw)
    body.__parsed_as = 'query'
  }
  body.__raw = String(raw).slice(0, 2000)
  return body
}

function planExpiresAt() {
  return new Date(Date.now() + PLAN_DAYS * 86400000).toISOString()
}

function uuidOk_(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''))
}

function userIdOf_(body) {
  return String(body.user_id || body.store_id || '')
}

function extRef_(userId, plan) {
  return plan ? 'plan:' + userId + ':' + plan : 'plan:' + userId
}

function userIdFromRef_(ref) {
  var s = String(ref || '')
  if (s.indexOf('plan:') === 0) s = s.slice(5)
  var id = s.split(':')[0]
  return uuidOk_(id) ? id : ''
}

function planFromRef_(ref) {
  var s = String(ref || '')
  if (s.indexOf('plan:') !== 0) return ''
  var parts = s.split(':')
  return PLAN_DEFS[parts[2]] ? parts[2] : ''
}

function planAmount_(plan) {
  var def = PLAN_DEFS[plan]
  if (!def) return 0
  var cents = Number(prop_(def.centsKey) || def.fallbackCents)
  if (!(cents > 0)) cents = def.fallbackCents
  return cents / 100
}

function useSandbox_() {
  return prop_('MP_USE_SANDBOX').toLowerCase() === 'true'
}

function mpToken_() {
  var t = prop_('MP_ACCESS_TOKEN')
  if (!t) throw new Error('MP_ACCESS_TOKEN ausente no GAS')
  return t
}

function sbUrl_() {
  var u = prop_('SUPABASE_URL').replace(/\/$/, '')
  if (!u) throw new Error('SUPABASE_URL ausente no GAS')
  return u
}

function sbKey_() {
  var k = prop_('SUPABASE_SERVICE_ROLE')
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE ausente no GAS')
  return k
}

function sbHeaders_(prefer) {
  var k = sbKey_()
  return {
    apikey: k,
    Authorization: 'Bearer ' + k,
    'Content-Type': 'application/json',
    Prefer: prefer || 'return=representation'
  }
}

function mpFetch(path, method, payload) {
  var opt = {
    method: method || 'get',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + mpToken_(), 'Content-Type': 'application/json' }
  }
  if (payload != null) opt.payload = JSON.stringify(payload)
  var res = UrlFetchApp.fetch('https://api.mercadopago.com' + path, opt)
  var text = res.getContentText()
  var code = res.getResponseCode()
  var json = {}
  try {
    json = JSON.parse(text || '{}')
  } catch (err) {
    json = { raw: text }
  }
  if (code < 200 || code >= 300) {
    throw new Error('MP ' + (method || 'get') + ' ' + path + ' ' + code + ' ' + String(text).slice(0, 400))
  }
  return json
}

function mpCreatePlan(payload) {
  var res = UrlFetchApp.fetch('https://api.mercadopago.com/preapproval_plan', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + mpToken_() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  })
  return { code: res.getResponseCode(), text: res.getContentText() }
}

function mpPlanCheckoutUrl(plan) {
  if (useSandbox_() && plan.sandbox_init_point) return plan.sandbox_init_point
  return plan.init_point || plan.sandbox_init_point || ''
}

function loadProfile_(userId) {
  var res = UrlFetchApp.fetch(
    sbUrl_() + '/rest/v1/profiles?id=eq.' + encodeURIComponent(userId) + '&select=*',
    { method: 'get', muteHttpExceptions: true, headers: sbHeaders_() }
  )
  if (res.getResponseCode() >= 300) throw new Error('GET profiles falhou: ' + res.getContentText().slice(0, 300))
  var rows = JSON.parse(res.getContentText() || '[]')
  return rows[0] || null
}

function findProfileByPlanId_(planId) {
  if (!planId) return null
  var res = UrlFetchApp.fetch(
    sbUrl_() + '/rest/v1/profiles?mp_plan_id=eq.' + encodeURIComponent(planId) + '&select=*&limit=1',
    { method: 'get', muteHttpExceptions: true, headers: sbHeaders_() }
  )
  if (res.getResponseCode() >= 300) return null
  var rows = JSON.parse(res.getContentText() || '[]')
  return rows[0] || null
}

function patchProfile_(userId, patch) {
  var res = UrlFetchApp.fetch(sbUrl_() + '/rest/v1/profiles?id=eq.' + encodeURIComponent(userId), {
    method: 'patch',
    muteHttpExceptions: true,
    headers: sbHeaders_('return=representation'),
    payload: JSON.stringify(patch)
  })
  if (res.getResponseCode() >= 300) throw new Error('PATCH profiles falhou: ' + res.getContentText().slice(0, 400))
  var rows = JSON.parse(res.getContentText() || '[]')
  return rows[0] || null
}

function paidPlan_(row) {
  if (!row) return false
  if (row.plan !== 'pro' && row.plan !== 'ultra') return false
  if (!row.plan_expires_at) return true
  return new Date(row.plan_expires_at).getTime() > Date.now()
}

function inferPlan_(sub, prof, fallback) {
  var fromRef = planFromRef_(sub && sub.external_reference)
  if (fromRef) return fromRef
  var amount = Number(
    (sub && sub.auto_recurring && sub.auto_recurring.transaction_amount) ||
      (sub && sub.summarized && sub.summarized.charged_amount) ||
      0
  )
  var ultra = planAmount_('ultra')
  if (amount && Math.abs(amount - ultra) < 0.05) return 'ultra'
  var reason = String((sub && sub.reason) || '')
  if (/ultra/i.test(reason)) return 'ultra'
  if (prof && prof.plan === 'ultra') return 'ultra'
  return fallback || 'pro'
}

function activatePlan_(userId, plan) {
  var next = PLAN_DEFS[plan] ? plan : 'pro'
  var row = loadProfile_(userId)
  if (row && row.plan === 'ultra' && next === 'pro') next = 'ultra'
  patchProfile_(userId, { plan: next, plan_expires_at: planExpiresAt() })
  var fresh = loadProfile_(userId)
  if (!fresh || (fresh.plan !== 'pro' && fresh.plan !== 'ultra')) {
    notify('ATENÇÃO: plano não confirmado', 'user=' + userId + '\nrow=' + JSON.stringify(fresh))
    throw new Error('Plano não confirmado')
  }
  return fresh
}

function ensureMpPlan(userId, plan, redirectUrl) {
  if (!prop_('MP_ACCESS_TOKEN')) return { error: 'MP_ACCESS_TOKEN ausente no GAS' }
  var row = loadProfile_(userId)
  if (!row) return { error: 'Perfil não encontrado. Entre no app uma vez antes de assinar.' }
  var want = planAmount_(plan)

  if (row.mp_plan_id) {
    try {
      var existing = mpFetch('/preapproval_plan/' + encodeURIComponent(row.mp_plan_id))
      var existingAmt = Number((existing.auto_recurring && existing.auto_recurring.transaction_amount) || 0)
      var samePrice = !want || Math.abs(existingAmt - want) < 0.05
      if (existing && String(existing.status || '') === 'active' && samePrice) {
        var reuse = mpPlanCheckoutUrl(existing)
        if (reuse) return { plan_id: String(existing.id), url: reuse }
      }
    } catch (err) {
      /* plano antigo inválido -> cria outro */
    }
  }

  var webhook = ScriptApp.getService().getUrl()
  var payload = {
    reason: PLAN_DEFS[plan].reason,
    external_reference: extRef_(userId, plan),
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: want,
      currency_id: 'BRL'
    },
    back_url: redirectUrl || '',
    notification_url: webhook
  }

  var res = mpCreatePlan(payload)
  var text = res.text
  if (res.code >= 300 && res.code < 500 && payload.notification_url && /notification[_\s]?url/i.test(text)) {
    notify('MP recusou notification_url; plano será criado SEM webhook no recurso', text.slice(0, 600))
    var fallback = JSON.parse(JSON.stringify(payload))
    delete fallback.notification_url
    res = mpCreatePlan(fallback)
    text = res.text
  }
  var parsed = {}
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    parsed = {}
  }
  if (res.code >= 300 || !parsed.id) {
    notify('Falha ao criar plano MP (user ' + userId + ')', text)
    return { error: parsed.message || parsed.error || 'Mercado Pago recusou o plano', status: res.code }
  }
  var checkoutUrl = mpPlanCheckoutUrl(parsed)
  if (!checkoutUrl) {
    notify('Plano MP criado sem init_point (user ' + userId + ')', text)
    return { error: 'Mercado Pago não devolveu o link de assinatura', status: res.code }
  }
  patchProfile_(userId, { mp_plan_id: String(parsed.id) })
  return { plan_id: String(parsed.id), url: checkoutUrl }
}

function handleSubscribe(body) {
  var userId = userIdOf_(body)
  var plan = String(body.plan || 'pro')
  var redirectUrl = String(body.redirect_url || '')
  if (!uuidOk_(userId)) return { ok: false, error: 'user_id inválido' }
  if (!PLAN_DEFS[plan]) return { ok: false, error: 'plano inválido' }
  if (!redirectUrl) return { ok: false, error: 'redirect_url ausente' }
  var created = ensureMpPlan(userId, plan, redirectUrl)
  if (created.error) return { ok: false, error: created.error, status: created.status }
  return { ok: true, url: created.url, plan_id: created.plan_id, plan: plan }
}

function handleCheckout(body) {
  if (!prop_('MP_ACCESS_TOKEN')) return { ok: false, error: 'MP_ACCESS_TOKEN ausente no GAS' }
  var userId = userIdOf_(body)
  var plan = String(body.plan || 'pro')
  var redirect = String(body.redirect_url || '')
  if (!uuidOk_(userId)) return { ok: false, error: 'user_id inválido' }
  if (!PLAN_DEFS[plan]) return { ok: false, error: 'plano inválido' }
  if (!redirect) return { ok: false, error: 'redirect_url ausente' }
  var row = loadProfile_(userId)
  if (!row) return { ok: false, error: 'Perfil não encontrado. Entre no app uma vez antes de pagar.' }
  var amount = planAmount_(plan)
  var webhook = ScriptApp.getService().getUrl()
  var payload = {
    items: [
      {
        title: PLAN_DEFS[plan].reason + ' — 30 dias',
        quantity: 1,
        currency_id: 'BRL',
        unit_price: amount
      }
    ],
    external_reference: extRef_(userId, plan) + ':' + Date.now(),
    notification_url: webhook,
    auto_return: 'approved',
    back_urls: { success: redirect, pending: redirect, failure: redirect },
    statement_descriptor: 'MDFATELIER'
  }
  var parsed
  try {
    parsed = mpFetch('/checkout/preferences', 'post', payload)
  } catch (err) {
    notify('Falha ao gerar checkout MP (user ' + userId + ')', String(err))
    return { ok: false, error: String((err && err.message) || err) }
  }
  var url = mpPlanCheckoutUrl(parsed)
  if (!url) return { ok: false, error: 'Mercado Pago não devolveu o link de pagamento' }
  return { ok: true, url: url, plan: plan, once: true }
}

function handleCancel(body) {
  var userId = userIdOf_(body)
  if (!uuidOk_(userId)) return { ok: false, error: 'user_id inválido' }
  var row = loadProfile_(userId)
  if (!row) return { ok: false, error: 'Perfil não encontrado' }
  var subId = String(row.mp_subscription_id || '')
  if (!subId) return { ok: false, error: 'Esta conta não possui assinatura registrada' }
  try {
    mpFetch('/preapproval/' + encodeURIComponent(subId), 'put', { status: 'canceled' })
  } catch (err) {
    notify('Falha ao cancelar assinatura (user ' + userId + ')', String(err))
    return { ok: false, error: String((err && err.message) || err) }
  }
  patchProfile_(userId, { mp_subscription_status: 'canceled' })
  notify('Assinatura cancelada', 'user=' + userId + '\nsub=' + subId)
  return { ok: true, canceled: true, subscription_id: subId }
}

function handleSync(body) {
  var userId = userIdOf_(body)
  if (!uuidOk_(userId)) return { ok: false, error: 'user_id inválido' }
  if (!prop_('MP_ACCESS_TOKEN')) return { ok: false, error: 'MP_ACCESS_TOKEN ausente no GAS' }
  var row = loadProfile_(userId)
  if (!row) return { ok: false, error: 'Perfil não encontrado' }
  if (paidPlan_(row)) {
    return {
      ok: true,
      status: 'already-active',
      plan: row.plan,
      plan_expires_at: row.plan_expires_at,
      mp_subscription_status: row.mp_subscription_status
    }
  }
  var planId = String(row.mp_plan_id || '')
  if (!planId) return { ok: false, error: 'mp_plan_id vazio (assine primeiro)', status: 'no-plan' }

  var res = UrlFetchApp.fetch(
    'https://api.mercadopago.com/preapproval/search?preapproval_plan_id=' +
      encodeURIComponent(planId) +
      '&status=authorized&limit=1',
    {
      method: 'get',
      headers: { Authorization: 'Bearer ' + mpToken_() },
      muteHttpExceptions: true
    }
  )
  var text = res.getContentText()
  if (res.getResponseCode() >= 300) {
    notify('Sync assinatura falhou (user ' + userId + ')', text.slice(0, 600))
    return { ok: false, error: 'Mercado Pago recusou a consulta', status: res.getResponseCode() }
  }
  var data = JSON.parse(text || '{}')
  var found = (data.results || [])[0]
  if (!found) {
    return { ok: false, status: 'no-subscription', error: 'Nenhuma assinatura autorizada encontrada no MP' }
  }
  var subId = String(found.id)
  var plan = inferPlan_(found, row, 'pro')
  patchProfile_(userId, { mp_subscription_id: subId, mp_subscription_status: 'authorized' })
  var fresh = activatePlan_(userId, plan)
  notify(
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

function mpIsProcessed(id) {
  var list = []
  try {
    list = JSON.parse(prop_('MP_PROCESSED') || '[]')
  } catch (err) {
    list = []
  }
  return list.indexOf(id) !== -1
}

function mpMarkProcessed(id) {
  var list = []
  try {
    list = JSON.parse(prop_('MP_PROCESSED') || '[]')
  } catch (err) {
    list = []
  }
  if (list.indexOf(id) === -1) list.push(id)
  if (list.length > 80) list = list.slice(-80)
  props().setProperty('MP_PROCESSED', JSON.stringify(list))
}

function isNotFound(err) {
  var msg = String((err && err.message) || err)
  return /404/.test(msg) || /not found/i.test(msg)
}

function resolveUser_(ext, planId, preapprovalId) {
  var userId = userIdFromRef_(ext)
  if (userId) return userId
  if (planId) {
    var byPlan = findProfileByPlanId_(String(planId))
    if (byPlan) return String(byPlan.id)
  }
  if (preapprovalId) {
    try {
      var pre = mpFetch('/preapproval/' + encodeURIComponent(preapprovalId))
      if (pre && pre.preapproval_plan_id) {
        var byPre = findProfileByPlanId_(String(pre.preapproval_plan_id))
        if (byPre) return String(byPre.id)
      }
      userId = userIdFromRef_(pre && pre.external_reference)
    } catch (err) {
      /* ignore */
    }
  }
  return userId || ''
}

function handleMpApprovedPayment(paymentId, payment) {
  if (mpIsProcessed('pay:' + paymentId)) return { ok: true, already: true }
  var ext = String(payment.external_reference || '')
  var userId = resolveUser_(ext, payment.preapproval_plan_id, payment.preapproval_id)
  if (!userId) {
    notify('Webhook MP aprovado sem usuário (aguardando vínculo?)', JSON.stringify(payment, null, 2))
    return { ok: true, status: 'no-store' }
  }
  var plan = planFromRef_(ext) || inferPlan_(payment, loadProfile_(userId), 'pro')
  activatePlan_(userId, plan)
  mpMarkProcessed('pay:' + paymentId)
  return { ok: true }
}

function handleMpPaymentWebhook(paymentId) {
  var payment
  try {
    payment = mpFetch('/v1/payments/' + encodeURIComponent(paymentId))
  } catch (err) {
    if (isNotFound(err)) return { ok: true, status: 'not-found' }
    throw err
  }
  if (String(payment.status || '') !== 'approved') return { ok: true, status: payment.status }
  return handleMpApprovedPayment(paymentId, payment)
}

function handleMpPreapprovalWebhook(subId) {
  if (!subId) throw new Error('Webhook preapproval sem id')
  var pre
  try {
    pre = mpFetch('/preapproval/' + encodeURIComponent(subId))
  } catch (err) {
    if (isNotFound(err)) return { ok: true, status: 'not-found' }
    throw err
  }
  var status = String(pre.status || '')
  var userId = resolveUser_(pre.external_reference, pre.preapproval_plan_id, subId)
  if (!userId) {
    notify('Webhook MP preapproval sem usuário', JSON.stringify(pre, null, 2))
    throw new Error('Usuário não identificado no preapproval')
  }
  if (status === 'canceled' || status === 'paused') {
    patchProfile_(userId, { mp_subscription_status: status })
    return { ok: true, status: status }
  }
  if (status === 'authorized') {
    if (mpIsProcessed('sub:' + subId)) return { ok: true, already: true }
    patchProfile_(userId, { mp_subscription_id: subId, mp_subscription_status: 'authorized' })
    var plan = inferPlan_(pre, loadProfile_(userId), 'pro')
    var fresh = activatePlan_(userId, plan)
    notify(
      'Assinatura ativada - plano liberado',
      'user=' + userId + '\nsub=' + subId + '\nplano=' + fresh.plan + '\nvalidade=' + fresh.plan_expires_at
    )
    mpMarkProcessed('sub:' + subId)
  }
  return { ok: true, status: status }
}

function handleMpAuthorizedPaymentWebhook(authId) {
  if (!authId) throw new Error('Webhook authorized_payment sem id')
  var auth
  try {
    auth = mpFetch('/authorized_payments/' + encodeURIComponent(authId))
  } catch (err) {
    if (isNotFound(err)) return { ok: true, status: 'not-found' }
    throw err
  }
  var userId = resolveUser_(auth.external_reference, auth.preapproval_plan_id, auth.preapproval_id)
  if (!userId) {
    notify('Webhook MP authorized_payment sem usuário', JSON.stringify(auth, null, 2))
    throw new Error('Usuário não identificado no authorized_payment')
  }
  return handleMpApprovedPayment('ap:' + authId, {
    external_reference: auth.external_reference || extRef_(userId),
    status: 'approved',
    preapproval_plan_id: auth.preapproval_plan_id,
    preapproval_id: auth.preapproval_id
  })
}

var MP_SUB_TOPICS = [
  'preapproval',
  'subscription_preapproval',
  'subscription_authorized_payment',
  'subscription_preapproval_plan',
  'merchant_order'
]

function isMpWebhook(e, body) {
  var type = String(body.type || (e.parameter && e.parameter.topic) || '')
  if (type === 'payment' || MP_SUB_TOPICS.indexOf(type) !== -1) return true
  if (body.data && body.data.id) return true
  return false
}

function handleMpWebhook(e, body) {
  var type = String(body.type || (e.parameter && e.parameter.topic) || 'payment')
  var dataId = String((body.data && body.data.id) || (e.parameter && e.parameter.id) || '')
  if (type === 'preapproval' || type === 'subscription_preapproval') return handleMpPreapprovalWebhook(dataId)
  if (type === 'subscription_authorized_payment') return handleMpAuthorizedPaymentWebhook(dataId)
  if (type === 'merchant_order' || type === 'subscription_preapproval_plan') {
    return { ok: true, ignored: type }
  }
  return handleMpPaymentWebhook(dataId)
}

function doPost(e) {
  var body = parseBody(e)
  var log = {
    at: new Date().toISOString(),
    action: 'desconhecida',
    provider: provider(),
    keys: Object.keys(body).slice(0, 25)
  }
  try {
    var result
    if (body.action === 'subscribe') {
      log.action = 'subscribe'
      result = handleSubscribe(body)
    } else if (body.action === 'checkout') {
      log.action = 'checkout'
      result = handleCheckout(body)
    } else if (body.action === 'cancel_subscription') {
      log.action = 'cancel_subscription'
      result = handleCancel(body)
    } else if (body.action === 'sync_subscription') {
      log.action = 'sync_subscription'
      result = handleSync(body)
    } else if (isMpWebhook(e, body)) {
      log.action = 'webhook_mp'
      result = handleMpWebhook(e, body)
    } else {
      log.action = 'ignored'
      result = { ok: true, ignored: true }
    }
    log.result = result
    safeLog(log)
    if (result && result.ok === false) notify('Falha em ' + log.action, JSON.stringify(log, null, 2))
    return jsonOut(result)
  } catch (err) {
    log.error = String((err && err.stack) || err)
    safeLog(log)
    notify('Erro em ' + log.action + ' - ' + String((err && err.message) || err), JSON.stringify(log, null, 2))
    throw err
  }
}

function doGet() {
  return jsonOut({
    ok: true,
    service: 'mdf-atelier-billing',
    provider: provider(),
    routes: ['subscribe', 'checkout', 'cancel_subscription', 'sync_subscription', 'webhook']
  })
}
