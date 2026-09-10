/**
 * MDF Atelier — cobrança Mercado Pago (Apps Script)
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
 *   EMAIL_LOG               e-mail de log
 *   PRO_PRICE_CENTS         4900
 *   ULTRA_PRICE_CENTS       8900
 *   MP_PROCESSED            NÃO mexer (dedupe interno)
 */

var PLAN_DEFS = {
  pro: { reason: 'MDF Atelier Pro', centsKey: 'PRO_PRICE_CENTS', fallbackCents: 4900 },
  ultra: { reason: 'MDF Atelier Ultra', centsKey: 'ULTRA_PRICE_CENTS', fallbackCents: 8900 }
}

function doGet() {
  return json_({
    ok: true,
    service: 'mdf-atelier-billing',
    provider: prop_('PAYMENT_PROVIDER') || 'mp',
    routes: ['subscribe', 'checkout', 'cancel_subscription', 'sync_subscription']
  })
}

function doPost(e) {
  try {
    var body = parseBody_(e)
    var action = String(body.action || '')
    if (action === 'subscribe') return json_(handleSubscribe_(body))
    if (action === 'checkout') return json_(handleCheckout_(body))
    if (action === 'cancel_subscription') return json_(handleCancel_(body))
    if (action === 'sync_subscription') return json_(handleSync_(body))
    handleWebhook_(body)
    return json_({ ok: true })
  } catch (err) {
    logMail_('billing error', String(err && err.stack ? err.stack : err))
    throw err
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {}
  try {
    return JSON.parse(e.postData.contents)
  } catch (err) {
    return {}
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}

function prop_(k) {
  return String(PropertiesService.getScriptProperties().getProperty(k) || '').trim()
}

function mpToken_() {
  var t = prop_('MP_ACCESS_TOKEN')
  if (!t) throw new Error('MP_ACCESS_TOKEN ausente')
  return t
}

function sbUrl_() {
  var u = prop_('SUPABASE_URL').replace(/\/$/, '')
  if (!u) throw new Error('SUPABASE_URL ausente')
  return u
}

function sbKey_() {
  var k = prop_('SUPABASE_SERVICE_ROLE')
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE ausente')
  return k
}

function useSandbox_() {
  return prop_('MP_USE_SANDBOX').toLowerCase() === 'true'
}

function planAmount_(plan) {
  var def = PLAN_DEFS[plan]
  if (!def) throw new Error('plano inválido')
  var cents = Number(prop_(def.centsKey) || def.fallbackCents)
  if (!(cents > 0)) cents = def.fallbackCents
  return cents / 100
}

function mpFetch_(method, path, payload) {
  var url = 'https://api.mercadopago.com' + path
  var opt = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + mpToken_(),
      'Content-Type': 'application/json'
    }
  }
  if (payload != null) opt.payload = JSON.stringify(payload)
  var res = UrlFetchApp.fetch(url, opt)
  var code = res.getResponseCode()
  var text = res.getContentText()
  var json = {}
  try {
    json = JSON.parse(text)
  } catch (err) {
    json = { raw: text }
  }
  if (code < 200 || code >= 300) {
    throw new Error('MP ' + method + ' ' + path + ' ' + code + ' ' + text.slice(0, 400))
  }
  return json
}

function sbHeaders_() {
  var k = sbKey_()
  return {
    apikey: k,
    Authorization: 'Bearer ' + k,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  }
}

function loadProfile_(userId) {
  var url = sbUrl_() + '/rest/v1/profiles?id=eq.' + encodeURIComponent(userId) + '&select=*'
  var res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, headers: sbHeaders_() })
  if (res.getResponseCode() >= 300) throw new Error('supabase get profile ' + res.getContentText().slice(0, 300))
  var rows = JSON.parse(res.getContentText() || '[]')
  return rows[0] || null
}

function findProfileBy_(query) {
  var url = sbUrl_() + '/rest/v1/profiles?' + query + '&select=*'
  var res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, headers: sbHeaders_() })
  if (res.getResponseCode() >= 300) throw new Error('supabase find ' + res.getContentText().slice(0, 300))
  var rows = JSON.parse(res.getContentText() || '[]')
  return rows[0] || null
}

function patchProfile_(userId, patch) {
  var url = sbUrl_() + '/rest/v1/profiles?id=eq.' + encodeURIComponent(userId)
  var res = UrlFetchApp.fetch(url, {
    method: 'patch',
    muteHttpExceptions: true,
    headers: sbHeaders_(),
    payload: JSON.stringify(patch)
  })
  if (res.getResponseCode() >= 300) throw new Error('supabase patch ' + res.getContentText().slice(0, 400))
  var rows = JSON.parse(res.getContentText() || '[]')
  return rows[0] || null
}

function uuidOk_(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''))
}

function extRef_(userId) {
  return 'plan:' + userId
}

function userIdFromRef_(ref) {
  var s = String(ref || '')
  if (s.indexOf('plan:') !== 0) return ''
  return s.slice(5).split(':')[0]
}

function plus30d_() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
}

function initPoint_(obj) {
  if (useSandbox_() && obj.sandbox_init_point) return obj.sandbox_init_point
  return obj.init_point || obj.sandbox_init_point || ''
}

function handleSubscribe_(body) {
  var userId = String(body.user_id || '')
  var plan = String(body.plan || 'pro')
  var redirect = String(body.redirect_url || '')
  if (!uuidOk_(userId)) throw new Error('user_id inválido')
  if (!PLAN_DEFS[plan]) throw new Error('plano inválido')
  if (!redirect) throw new Error('redirect_url ausente')
  var prof = loadProfile_(userId)
  if (!prof) throw new Error('perfil não encontrado')

  var amount = planAmount_(plan)
  var created = mpFetch_('post', '/preapproval_plan', {
    reason: PLAN_DEFS[plan].reason,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: amount,
      currency_id: 'BRL'
    },
    back_url: redirect,
    external_reference: extRef_(userId)
  })
  var url = initPoint_(created)
  if (!url) throw new Error('MP não devolveu init_point')
  patchProfile_(userId, { mp_plan_id: created.id || created.preapproval_plan_id || null })
  return { ok: true, url: url, plan: plan }
}

function handleCheckout_(body) {
  var userId = String(body.user_id || '')
  var plan = String(body.plan || 'pro')
  var redirect = String(body.redirect_url || '')
  if (!uuidOk_(userId)) throw new Error('user_id inválido')
  if (!PLAN_DEFS[plan]) throw new Error('plano inválido')
  if (!redirect) throw new Error('redirect_url ausente')
  var prof = loadProfile_(userId)
  if (!prof) throw new Error('perfil não encontrado')
  var amount = planAmount_(plan)
  var pref = mpFetch_('post', '/checkout/preferences', {
    items: [
      {
        title: PLAN_DEFS[plan].reason + ' — 30 dias',
        quantity: 1,
        currency_id: 'BRL',
        unit_price: amount
      }
    ],
    external_reference: extRef_(userId) + ':' + plan + ':' + Date.now(),
    auto_return: 'approved',
    back_urls: { success: redirect, pending: redirect, failure: redirect }
  })
  var url = initPoint_(pref)
  if (!url) throw new Error('MP não devolveu init_point')
  return { ok: true, url: url, plan: plan, once: true }
}

function handleCancel_(body) {
  var userId = String(body.user_id || '')
  if (!uuidOk_(userId)) throw new Error('user_id inválido')
  var prof = loadProfile_(userId)
  if (!prof || !prof.mp_subscription_id) return { ok: true, canceled: false }
  mpFetch_('put', '/preapproval/' + encodeURIComponent(prof.mp_subscription_id), { status: 'canceled' })
  patchProfile_(userId, { mp_subscription_status: 'canceled' })
  return { ok: true, canceled: true }
}

function handleSync_(body) {
  var userId = String(body.user_id || '')
  if (!uuidOk_(userId)) throw new Error('user_id inválido')
  var prof = loadProfile_(userId)
  if (!prof) throw new Error('perfil não encontrado')
  if (prof.mp_subscription_id) {
    var sub = mpFetch_('get', '/preapproval/' + encodeURIComponent(prof.mp_subscription_id))
    applyPreapproval_(sub)
  } else if (prof.mp_plan_id) {
    var search = mpFetch_(
      'get',
      '/preapproval/search?external_reference=' + encodeURIComponent(extRef_(userId)) + '&status=authorized'
    )
    var list = (search.results || search.data || [])
    if (list[0]) applyPreapproval_(list[0])
  }
  var fresh = loadProfile_(userId)
  return {
    ok: true,
    plan: fresh.plan,
    plan_expires_at: fresh.plan_expires_at,
    mp_subscription_status: fresh.mp_subscription_status
  }
}

function handleWebhook_(body) {
  var type = String(body.type || body.topic || '')
  var id = body.data && body.data.id ? String(body.data.id) : String(body.id || '')
  if (!id || id === '123456') return
  if (seen_(type + ':' + id)) return
  if (type.indexOf('subscription_preapproval_plan') >= 0 || type === 'preapproval_plan') return
  if (type.indexOf('subscription_preapproval') >= 0 || type === 'preapproval') {
    var sub = null
    try {
      sub = mpFetch_('get', '/preapproval/' + encodeURIComponent(id))
    } catch (err) {
      return
    }
    applyPreapproval_(sub)
    mark_(type + ':' + id)
    return
  }
  if (type.indexOf('subscription_authorized_payment') >= 0) {
    var ap = mpFetch_('get', '/authorized_payments/' + encodeURIComponent(id))
    applyAuthorizedPayment_(ap)
    mark_(type + ':' + id)
    return
  }
  if (type === 'payment') {
    var pay = mpFetch_('get', '/v1/payments/' + encodeURIComponent(id))
    applyPayment_(pay)
    mark_(type + ':' + id)
  }
}

function applyPreapproval_(sub) {
  if (!sub || !sub.id) return
  var userId = userIdFromRef_(sub.external_reference)
  var prof = userId && uuidOk_(userId) ? loadProfile_(userId) : null
  if (!prof && sub.preapproval_plan_id) {
    prof = findProfileBy_('mp_plan_id=eq.' + encodeURIComponent(sub.preapproval_plan_id))
  }
  if (!prof) return
  var status = String(sub.status || '')
  var patch = {
    mp_subscription_id: String(sub.id),
    mp_subscription_status: status
  }
  if (status === 'authorized') {
    var plan = inferPlan_(sub, prof)
    patch.plan = plan
    patch.plan_expires_at = plus30d_()
  }
  patchProfile_(prof.id, patch)
}

function applyAuthorizedPayment_(ap) {
  var preId = ap && (ap.preapproval_id || ap.preapprovalId)
  if (!preId) return
  var sub = mpFetch_('get', '/preapproval/' + encodeURIComponent(preId))
  var status = String((ap.status || ap.payment && ap.payment.status) || '')
  if (status === 'approved' || status === 'processed' || status === 'authorized') {
    applyPreapproval_(sub)
    var userId = userIdFromRef_(sub.external_reference)
    if (userId && uuidOk_(userId)) patchProfile_(userId, { plan_expires_at: plus30d_() })
  }
}

function applyPayment_(pay) {
  if (!pay || String(pay.status) !== 'approved') return
  var ref = String(pay.external_reference || '')
  var userId = userIdFromRef_(ref)
  if (!userId || !uuidOk_(userId)) return
  var parts = ref.split(':')
  var plan = parts[2] && PLAN_DEFS[parts[2]] ? parts[2] : 'pro'
  patchProfile_(userId, { plan: plan, plan_expires_at: plus30d_() })
}

function inferPlan_(sub, prof) {
  var amount = Number(
    (sub.auto_recurring && sub.auto_recurring.transaction_amount) ||
      (sub.summarized && sub.summarized.charged_amount) ||
      0
  )
  var ultra = planAmount_('ultra')
  if (amount && Math.abs(amount - ultra) < 0.05) return 'ultra'
  var reason = String(sub.reason || '')
  if (/ultra/i.test(reason)) return 'ultra'
  if (prof && prof.plan === 'ultra') return 'ultra'
  return 'pro'
}

function seen_(key) {
  var raw = prop_('MP_PROCESSED')
  if (!raw) return false
  try {
    var map = JSON.parse(raw)
    return !!map[key]
  } catch (err) {
    return false
  }
}

function mark_(key) {
  var map = {}
  try {
    map = JSON.parse(prop_('MP_PROCESSED') || '{}')
  } catch (err) {
    map = {}
  }
  map[key] = Date.now()
  var keys = Object.keys(map)
  if (keys.length > 400) {
    keys
      .sort(function (a, b) {
        return map[a] - map[b]
      })
      .slice(0, keys.length - 300)
      .forEach(function (k) {
        delete map[k]
      })
  }
  PropertiesService.getScriptProperties().setProperty('MP_PROCESSED', JSON.stringify(map))
}

function logMail_(subject, body) {
  var to = prop_('EMAIL_LOG')
  if (!to) return
  try {
    MailApp.sendEmail(to, '[MDF Atelier] ' + subject, body)
  } catch (err) {}
}
