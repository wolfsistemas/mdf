import { init as cloudInit, signIn, sessionUser, rpc, signOut as cloudSignOut } from './cloud.js'
import {
  PLANS,
  ONCE_PLANS,
  planLabel,
  adminAction,
  billingConfigured,
  getPlanConfig,
  freeProjectLimit,
  loadPlanConfig,
  ADMIN_EMAIL,
  ADMIN_ALIAS
} from './billing.js'

const PLAN_IDS = ['gratis', 'pro', 'ultra']
const ONCE_IDS = ['1m', '3m']

let st = {
  loaded: false,
  stats: null,
  rows: [],
  audit: [],
  sub: 'cadastros',
  q: '',
  filter: 'todos',
  modal: null,
  msg: ''
}

/* ============================== helpers ============================== */

function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'html') el.innerHTML = v
    else if (k === 'style') el.setAttribute('style', v)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k === 'value') el.value = v
    else if (v === true) el.setAttribute(k, '')
    else el.setAttribute(k, v)
  }
  const add = (c) => {
    if (c == null || c === false) return
    if (Array.isArray(c)) return c.forEach(add)
    el.append(c.nodeType ? c : document.createTextNode(String(c)))
  }
  add(children)
  return el
}

function brlFromCents(cents) {
  const v = Number(cents || 0) / 100
  return (
    'R$ ' +
    v.toLocaleString('pt-BR', {
      minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
      maximumFractionDigits: 2
    })
  )
}

function dt(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '-'
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function dateOnly(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() + '-' + m + '-' + day
}

function toast(text, kind) {
  st.msg = text
  const el = document.getElementById('admin-toast')
  if (!el) return
  el.textContent = text || ''
  el.className = 'admin-toast' + (kind ? ' ' + kind : '')
  if (text) {
    clearTimeout(toast._t)
    toast._t = setTimeout(() => {
      el.textContent = ''
      el.className = 'admin-toast'
    }, 4000)
  }
}

/* ============================== shell ============================== */

export function adminHTML() {
  return `
  <div class="admin-shell">
    <div id="admin-root"><div class="admin-loading">Verificando acesso...</div></div>
    <div id="admin-toast" class="admin-toast"></div>
  </div>`
}

function loginCard(root) {
  const email = h('input', { class: 'doc-input', type: 'email', placeholder: 'usuário', autocomplete: 'username' })
  const pass = h('input', { class: 'doc-input', type: 'password', placeholder: 'Senha', autocomplete: 'current-password' })
  const msg = h('div', { class: 'admin-msg', style: 'display:none' })
  const show = (text, kind) => {
    msg.textContent = text || ''
    msg.className = 'admin-msg' + (kind ? ' ' + kind : '')
    msg.style.display = text ? 'block' : 'none'
  }
  const btn = h('button', { class: 'btn primary', type: 'submit' }, ['Entrar'])
  const form = h(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault()
        const raw = email.value.trim()
        const em = raw.toLowerCase() === ADMIN_ALIAS ? ADMIN_EMAIL : raw
        if (!em || !pass.value) return show('Informe usuário e senha.', 'err')
        btn.disabled = true
        show('Entrando...', '')
        const res = await signIn(em, pass.value).catch((err) => ({ error: err.message }))
        if (res.error) {
          btn.disabled = false
          return show(res.error, 'err')
        }
        const ok = await rpc('am_i_admin').catch(() => false)
        if (!ok) {
          await cloudSignOut().catch(() => {})
          btn.disabled = false
          return show('Esta conta não tem acesso ao painel.', 'err')
        }
        await refresh(root)
      }
    },
    [
      h('h1', {}, ['Acesso restrito']),
      h('p', { class: 'help' }, ['Entre com a conta de administrador.']),
      h('div', { style: 'margin-top:12px' }, [email]),
      pass,
      msg,
      btn
    ]
  )
  return h('div', { class: 'admin-center' }, [h('div', { class: 'admin-card admin-login' }, [form])])
}

function restrictedCard(root) {
  return h('div', { class: 'admin-center' }, [
    h('div', { class: 'admin-card' }, [
      h('h1', {}, ['Acesso restrito']),
      h('p', { class: 'help' }, ['Esta conta não tem permissão de administrador.']),
      h('div', { class: 'row', style: 'margin-top:14px' }, [
        h('button', { class: 'btn', onClick: () => doLogout(root) }, ['Sair'])
      ])
    ])
  ])
}

async function doLogout(root) {
  try {
    await cloudSignOut()
  } catch {
    /* segue */
  }
  if (root) root.replaceChildren(loginCard(root))
}

/* ============================== init / load ============================== */

export async function initAdmin() {
  const root = document.getElementById('admin-root')
  if (!root) return
  if (!billingConfigured()) {
    root.replaceChildren(errorBox('Painel indisponível: cobrança não configurada no servidor.'))
    return
  }
  try {
    await cloudInit()
  } catch {
    /* sem sessao */
  }
  const u = sessionUser()
  if (!u) {
    root.replaceChildren(loginCard(root))
    return
  }
  let ok = false
  try {
    ok = await rpc('am_i_admin')
  } catch {
    ok = false
  }
  if (!ok) {
    root.replaceChildren(restrictedCard(root))
    return
  }
  await refresh(root)
}

function errorBox(text) {
  return h('div', { class: 'admin-center' }, [
    h('div', { class: 'admin-card' }, [h('h1', {}, ['Painel administrativo']), h('p', { class: 'help' }, [text])])
  ])
}

async function refresh(root) {
  root.replaceChildren(h('div', { class: 'admin-loading' }, ['Carregando...']))
  try {
    const [statsR, listR, cfgR, auditR] = await Promise.all([
      adminAction('admin_stats'),
      adminAction('admin_list', { per_page: 200 }),
      adminAction('admin_plan_config_get'),
      adminAction('admin_audit', { limit: 60 })
    ])
    st.stats = (statsR && statsR.stats) || {}
    st.rows = (listR && listR.rows) || []
    st.config = (cfgR && cfgR.data) || {}
    st.audit = (auditR && auditR.rows) || []
    st.loaded = true
  } catch (err) {
    root.replaceChildren(errorBox(String((err && err.message) || 'Falha ao carregar o painel.')))
    return
  }
  render(root)
}

/* ============================== render ============================== */

function render(root) {
  const body = h('div', { class: 'admin-body' })
  if (st.sub === 'config') body.append(configView())
  else if (st.sub === 'auditoria') body.append(auditView())
  else body.append(cadastrosView())
  root.replaceChildren(header(), subNav(), body)
}

function header() {
  return h('header', { class: 'admin-top' }, [
    h('div', { class: 'admin-brand' }, [
      h('span', { class: 'mark' }, ['SUPER ADMIN']),
      h('strong', {}, ['Painel administrativo']),
      h('span', { class: 'help' }, [sessionUser() ? sessionUser().email : ''])
    ]),
    h('div', { class: 'admin-top-actions' }, [
      h('button', { class: 'btn small', onClick: () => refresh(document.getElementById('admin-root')) }, ['Atualizar']),
      h('button', { class: 'btn small ghost', onClick: () => doLogout(document.getElementById('admin-root')) }, ['Sair'])
    ])
  ])
}

function subNav() {
  const item = (id, label) =>
    h('button', { class: 'asub' + (st.sub === id ? ' active' : ''), onClick: () => { st.sub = id; render(document.getElementById('admin-root')) } }, [label])
  return h('nav', { class: 'admin-subnav' }, [item('cadastros', 'Cadastros'), item('config', 'Planos'), item('auditoria', 'Auditoria')])
}

/* ============================== cadastros ============================== */

function kpis() {
  const s = st.stats || {}
  const card = (label, value, cls) => h('div', { class: 'admin-kpi' + (cls ? ' ' + cls : '') }, [h('b', {}, [String(value || 0)]), h('span', {}, [label])])
  return h('div', { class: 'admin-kpis' }, [
    card('Cadastros', s.total),
    card('Grátis', s.gratis),
    card('Pro', s.pro, 'ok'),
    card('Ultra', s.ultra, 'ok'),
    card('Expirados', s.expirados, 'warn'),
    card('Bloqueados', s.bloqueados, 'bad')
  ])
}

function matches(r) {
  if (st.q) {
    const q = st.q.toLowerCase()
    if (!(String(r.email || '').toLowerCase().includes(q) || String(r.shop || '').toLowerCase().includes(q))) return false
  }
  if (st.filter === 'todos') return true
  if (st.filter === 'blocked') return r.blocked
  if (st.filter === 'expirados') return r.effective === 'gratis' && (r.plan === 'pro' || r.plan === 'ultra')
  return r.effective === st.filter
}

function cadastrosView() {
  const search = h('input', {
    class: 'doc-input',
    placeholder: 'Buscar por e-mail ou loja',
    value: st.q,
    onInput: (e) => {
      st.q = e.target.value
      fillTable(listBox)
    }
  })
  const sel = h(
    'select',
    {
      onChange: (e) => {
        st.filter = e.target.value
        fillTable(listBox)
      }
    },
    [
      ['todos', 'Todos'],
      ['gratis', 'Grátis'],
      ['pro', 'Pro'],
      ['ultra', 'Ultra'],
      ['expirados', 'Expirados'],
      ['blocked', 'Bloqueados']
    ].map(([v, l]) => h('option', { value: v, selected: st.filter === v }, [l]))
  )
  const listBox = h('div', { class: 'admin-list' })
  setTimeout(() => fillTable(listBox), 0)
  return h('div', {}, [
    kpis(),
    h('div', { class: 'admin-filters' }, [search, sel]),
    listBox
  ])
}

function fillTable(box) {
  if (!box) return
  const rows = st.rows.filter(matches)
  if (!rows.length) {
    box.replaceChildren(h('p', { class: 'help' }, ['Nenhum cadastro encontrado.']))
    return
  }
  const table = h('table', { class: 'admin-table' }, [
    h('thead', {}, [
      h('tr', {}, [
        h('th', {}, ['E-mail']),
        h('th', {}, ['Plano']),
        h('th', {}, ['Validade']),
        h('th', {}, ['Orçam.']),
        h('th', {}, ['Status']),
        h('th', {}, [''])
      ])
    ]),
    h('tbody', {}, rows.map(row))
  ])
  box.replaceChildren(table)
}

function row(r) {
  const planBadge = h('span', { class: 'abadge ' + r.effective }, [planLabel(r.effective)])
  const status = []
  if (r.blocked) status.push(h('span', { class: 'abadge bad' }, ['Bloqueado']))
  if (r.status) status.push(h('span', { class: 'abadge ghost' }, [r.status]))
  if (r.source) status.push(h('span', { class: 'abadge ghost' }, [r.source]))
  return h('tr', { class: r.blocked ? 'blocked' : '' }, [
    h('td', {}, [h('strong', {}, [r.email || '-']), r.shop ? h('span', { class: 'admin-sub' }, [r.shop]) : null]),
    h('td', {}, [planBadge]),
    h('td', {}, [dateOnly(r.plan_expires_at) || 'sem validade']),
    h('td', {}, [String(r.projects || 0)]),
    h('td', {}, [status.length ? status : h('span', { class: 'admin-sub' }, ['-'])]),
    h('td', {}, [h('button', { class: 'btn small', onClick: () => openUser(r) }, ['Gerenciar'])])
  ])
}

/* ============================== modal do usuário ============================== */

function closeModal() {
  st.modal = null
  const el = document.getElementById('admin-modal')
  if (el) el.remove()
}

function openUser(r) {
  closeModal()
  const dateInput = h('input', { type: 'date', class: 'doc-input', value: dateOnly(r.plan_expires_at) })
  const planSel = h(
    'select',
    {},
    PLAN_IDS.map((id) => h('option', { value: id, selected: r.effective === id }, [PLANS[id].label]))
  )
  const note = h('textarea', { class: 'doc-input', rows: '3', placeholder: 'Anotação interna' }, [r.note || ''])
  const savePlan = h('button', { class: 'btn primary', onClick: async () => {
    const plan = planSel.value
    let iso = null
    if (plan !== 'gratis' && dateInput.value) iso = new Date(dateInput.value + 'T12:00:00').toISOString()
    savePlan.disabled = true
    try {
      await adminAction('admin_set_plan', { user_id: r.id, plan, plan_expires_at: iso, source: 'admin' })
      toast('Plano atualizado.', 'ok')
      closeModal()
      await refresh(document.getElementById('admin-root'))
    } catch (err) {
      toast(String((err && err.message) || 'Falha ao salvar.'), 'err')
      savePlan.disabled = false
    }
  }}, ['Salvar plano'])
  const quick = (label, days) =>
    h('button', { class: 'btn small ghost', onClick: () => {
      if (planSel.value === 'gratis') planSel.value = 'pro'
      const d = new Date()
      d.setDate(d.getDate() + days)
      dateInput.value = dateOnly(d.toISOString())
    }}, [label])
  const blockBtn = h('button', { class: 'btn small ' + (r.blocked ? '' : 'ghost danger-side'), onClick: async () => {
    blockBtn.disabled = true
    try {
      await adminAction('admin_block', { user_id: r.id, blocked: !r.blocked })
      toast(r.blocked ? 'Conta reativada.' : 'Conta bloqueada.', 'ok')
      closeModal()
      await refresh(document.getElementById('admin-root'))
    } catch (err) {
      toast(String((err && err.message) || 'Falha.'), 'err')
      blockBtn.disabled = false
    }
  }}, [r.blocked ? 'Reativar conta' : 'Bloquear conta'])
  const noteBtn = h('button', { class: 'btn small', onClick: async () => {
    noteBtn.disabled = true
    try {
      await adminAction('admin_note', { user_id: r.id, note: note.value })
      toast('Nota salva.', 'ok')
      noteBtn.disabled = false
    } catch (err) {
      toast(String((err && err.message) || 'Falha.'), 'err')
      noteBtn.disabled = false
    }
  }}, ['Salvar nota'])

  const info = [
    ['E-mail', r.email || '-'],
    ['Loja', r.shop || '-'],
    ['Plano efetivo', planLabel(r.effective)],
    ['Plano gravado', planLabel(r.plan)],
    ['Fonte', r.source || '-'],
    ['Status MP', r.status || '-'],
    ['Orçamentos', String(r.projects || 0)],
    ['Criado em', dt(r.created_at)],
    ['Último acesso', dt(r.last_sign_in_at)]
  ]

  const modal = h('div', { class: 'admin-modal-backdrop', id: 'admin-modal', onClick: (e) => e.target === e.currentTarget && closeModal() }, [
    h('div', { class: 'admin-modal', id: 'admin-modal-card' }, [
      h('div', { class: 'admin-modal-head' }, [h('h2', {}, [r.email || 'Cadastro']), h('button', { class: 'btn small ghost x', onClick: closeModal }, ['Fechar'])]),
      h('div', { class: 'admin-info' }, info.map(([k, v]) => h('div', { class: 'admin-info-row' }, [h('span', {}, [k]), h('b', {}, [v])]))),
      h('div', { class: 'admin-field' }, [h('label', {}, ['Plano']), planSel]),
      h('div', { class: 'admin-field' }, [h('label', {}, ['Validade (Pro/Ultra)']), dateInput]),
      h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, [quick('+30 dias', 30), quick('+90 dias', 90), quick('+1 ano', 365), h('button', { class: 'btn small ghost', onClick: () => { dateInput.value = '' } }, ['Sem validade'])]),
      savePlan,
      h('hr', { class: 'admin-hr' }),
      h('div', { class: 'admin-field' }, [h('label', {}, ['Nota interna']), note, noteBtn]),
      h('div', { class: 'row', style: 'margin-top:6px' }, [blockBtn])
    ])
  ])
  document.body.append(modal)
  st.modal = r.id
}

/* ============================== config dos planos ============================== */

function numFromCents(cents) {
  return (Number(cents || 0) / 100).toFixed(2)
}

function configView() {
  const cfg = getPlanConfig()
  const fields = {}
  const money = (key, cents) =>
    (fields[key] = h('input', { type: 'number', min: '0', step: '0.01', class: 'doc-input', value: numFromCents(cents) }))
  const days = (key, v) => (fields[key] = h('input', { type: 'number', min: '1', step: '1', class: 'doc-input', value: String(v) }))
  const textF = (key, v) => (fields[key] = h('input', { type: 'text', class: 'doc-input', value: v == null ? '' : String(v) }))
  const freeLimit = h('input', { type: 'number', min: '1', step: '1', class: 'doc-input', value: String(cfg.freeProjectLimit || freeProjectLimit()) })

  const planRows = PLAN_IDS.map((id) => {
    const p = PLANS[id]
    return h('div', { class: 'admin-plan-row' }, [
      h('strong', {}, [p.label]),
      h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, [
        h('label', { class: 'admin-inline' }, ['Rótulo ', textF('label_' + id, p.label)]),
        h('label', { class: 'admin-inline' }, ['Preço R$ ', money('cents_' + id, p.cents)]),
        id === 'gratis' ? null : h('label', { class: 'admin-inline' }, ['Sufixo ', textF('suffix_' + id, (p.priceLabel || '').includes('/') ? '/' + (p.priceLabel.split('/')[1] || 'mês') : '')])
      ])
    ])
  })

  const onceRows = ONCE_IDS.map((id) => {
    const o = ONCE_PLANS[id]
    return h('div', { class: 'admin-plan-row' }, [
      h('strong', {}, [o.label]),
      h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, [
        h('label', { class: 'admin-inline' }, ['Rótulo ', textF('once_label_' + id, o.label)]),
        h('label', { class: 'admin-inline' }, ['Preço R$ ', money('once_cents_' + id, o.cents)]),
        h('label', { class: 'admin-inline' }, ['Dias ', days('once_days_' + id, o.days)])
      ])
    ])
  })

  const save = h('button', { class: 'btn primary', onClick: async () => {
    save.disabled = true
    try {
      const plans = {}
      for (const id of PLAN_IDS) {
        const cents = Math.round(Number(fields['cents_' + id].value || 0) * 100)
        const suffix = fields['suffix_' + id] ? fields['suffix_' + id].value : ''
        plans[id] = {
          label: fields['label_' + id].value || PLANS[id].label,
          cents,
          suffix,
          priceLabel: brlFromCents(cents) + suffix
        }
      }
      const once = {}
      for (const id of ONCE_IDS) {
        const cents = Math.round(Number(fields['once_cents_' + id].value || 0) * 100)
        once[id] = {
          label: fields['once_label_' + id].value || ONCE_PLANS[id].label,
          cents,
          days: Math.max(1, Math.round(Number(fields['once_days_' + id].value || ONCE_PLANS[id].days))),
          priceLabel: brlFromCents(cents)
        }
      }
      const data = { plans, once, freeProjectLimit: Math.max(1, Math.round(Number(freeLimit.value || 3))) }
      await adminAction('admin_plan_config_set', { data })
      await loadPlanConfig(true)
      toast('Configs salvas. Valores já valem no app e no checkout.', 'ok')
      await refresh(document.getElementById('admin-root'))
    } catch (err) {
      toast(String((err && err.message) || 'Falha ao salvar configs.'), 'err')
      save.disabled = false
    }
  }}, ['Salvar configs'])

  return h('div', {}, [
    h('div', { class: 'admin-card' }, [
      h('h2', {}, ['Configurações globais dos planos']),
      h('p', { class: 'help' }, ['Valem para o app, para a landing e para a cobrança (o valor em centavos é o que o servidor usa no checkout).']),
      h('label', { class: 'admin-inline' }, ['Limite de orçamentos no Grátis ', freeLimit]),
      ...planRows,
      h('hr', { class: 'admin-hr' }),
      h('h3', {}, ['Pagamento avulso (Pro por período)']),
      ...onceRows,
      h('div', { style: 'margin-top:12px' }, [save])
    ])
  ])
}

/* ============================== auditoria ============================== */

const ACTION_LABEL = {
  set_plan: 'Plano alterado',
  block: 'Conta bloqueada',
  unblock: 'Conta reativada',
  note: 'Nota interna',
  plan_config: 'Configs dos planos'
}

function auditView() {
  if (!st.audit.length) return h('p', { class: 'help' }, ['Nenhuma alteração registrada ainda.'])
  return h('table', { class: 'admin-table' }, [
    h('thead', {}, [h('tr', {}, [h('th', {}, ['Quando']), h('th', {}, ['Admin']), h('th', {}, ['Ação']), h('th', {}, ['Alvo'])])]),
    h('tbody', {}, st.audit.map((a) =>
      h('tr', {}, [
        h('td', {}, [dt(a.at)]),
        h('td', {}, [a.admin_email || '-']),
        h('td', {}, [ACTION_LABEL[a.action] || a.action]),
        h('td', {}, [a.target_email || (a.action === 'plan_config' ? '(global)' : '-')])
      ])
    ))
  ])
}
