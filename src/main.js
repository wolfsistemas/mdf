import './styles.css'
import {
  loadState,
  saveState,
  blankProject,
  blankPiece,
  GRAIN,
  CUT_MODES,
  formatMoney,
  formatM2,
  formatMeters,
  formatMm
} from './store.js'
import { nest, summarize, edgeMeters, pieceAreaM2 } from './nesting.js'
import { exportCsv, exportPdf } from './export.js'
import {
  CATALOG_GROUPS,
  modelMeta,
  modelByTypeVariant,
  createFurniture,
  fieldsFor,
  flattenProjectPieces,
  furnitureSummaryLine
} from './catalog.js'
import { schematicSvg } from './schematic.js'
import { saleCalc as calcItemSale, projectTotals as calcProjectTotals, rateioCtx as calcRateioCtx } from './pricing.js'
import {
  isConfigured as cloudConfigured,
  init as cloudInit,
  setAuthListener,
  signIn as cloudSignIn,
  signUp as cloudSignUp,
  signOut as cloudSignOut,
  pullState,
  schedulePush
} from './cloud.js'
import { landingHTML } from './landing.js'
import { FREE_PROJECT_LIMIT, planLabel, isLimitedPlan, upgradeHref } from './billing.js'
import qrcode from 'qrcode-generator'
qrcode.stringToBytes =
  typeof TextEncoder !== 'undefined'
    ? (s) => Array.from(new TextEncoder().encode(s))
    : (s) => Array.from(s, (ch) => ch.charCodeAt(0) & 0xff)

const state = loadState()
let tab = 'orcamento'
let selectedFurnitureId = null
let layoutCache = null
let summaryCache = null
let piecesCache = []
let saleCtx = null
let catalogQuery = ''
let modal = null
let editorLView = 'planta'
let editorStep = 0
let drawerOpen = false
let authUser = null
let syncTimer = null
const groupOpen = {}
CATALOG_GROUPS.forEach((g, i) => (groupOpen[g.group] = i === 0))

function project() {
  return state.projects.find((p) => p.id === state.activeProjectId) || state.projects[0]
}
function furnitureList() {
  return (project() && project().furniture) || []
}
function selectedFurniture() {
  const list = furnitureList()
  return list.find((f) => f.id === selectedFurnitureId) || list[0] || null
}

function recalc() {
  const p = project()
  piecesCache = flattenProjectPieces(p)
  layoutCache = nest(piecesCache, state.settings)
  summaryCache = summarize(p, state.settings, layoutCache, piecesCache)
  saleCtx = calcRateioCtx(furnitureList(), state.settings, layoutCache.sheetsNeeded, project().billingBasis || 'used')
}
function persist() {
  saveState(state)
  scheduleCloud()
  recalc()
  render()
}
function scheduleCloud() {
  if (!cloudConfigured() || !authUser) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => schedulePush(state), 500)
}
function refresh() {
  render()
}

/* ============================== projetos ============================== */

function setActive(id) {
  state.activeProjectId = id
  selectedFurnitureId = (project()?.furniture || [])[0]?.id || null
  modal = null
  drawerOpen = false
  persist()
}

function addProject() {
  if (!guardProjectSlots()) return
  const p = blankProject()
  state.projects.unshift(p)
  state.activeProjectId = p.id
  selectedFurnitureId = null
  drawerOpen = false
  persist()
}

function duplicateProject() {
  if (!guardProjectSlots()) return
  const p = project()
  const copy = structuredClone(p)
  copy.id = blankProject().id
  copy.name = p.name + ' (cópia)'
  copy.createdAt = Date.now()
  copy.furniture = (p.furniture || []).map((f) => ({
    ...structuredClone(f),
    id: createFurniture(modelByTypeVariant(f.type, f.variant) || { type: f.type, variant: f.variant }, []).id
  }))
  state.projects.unshift(copy)
  state.activeProjectId = copy.id
  drawerOpen = false
  persist()
}

function removeProject(id) {
  if (state.projects.length <= 1) return
  state.projects = state.projects.filter((p) => p.id !== id)
  if (state.activeProjectId === id) state.activeProjectId = state.projects[0].id
  drawerOpen = false
  persist()
}

/* ====================== mutações cientes do modal ====================== */

function mutableItem(id) {
  if (modal && modal.kind === 'edit' && modal.staged.id === id) return modal.staged
  return furnitureList().find((f) => f.id === id) || null
}
function commitFor(item) {
  if (modal && modal.kind === 'edit' && modal.staged.id === item.id) refresh()
  else persist()
}

function updateProject(patch) {
  Object.assign(project(), patch)
  persist()
}

function updateFurniture(id, patch) {
  const item = mutableItem(id)
  if (!item) return
  Object.assign(item, patch)
  commitFor(item)
}

function updateParam(id, key, value) {
  const item = mutableItem(id)
  if (!item) return
  item.params = { ...item.params, [key]: value }
  commitFor(item)
}

function removeFurniture(id) {
  const p = project()
  p.furniture = (p.furniture || []).filter((f) => f.id !== id)
  if (selectedFurnitureId === id) selectedFurnitureId = p.furniture[0]?.id || null
  modal = null
  persist()
}

function addExtraPiece(item) {
  item.extraPieces = item.extraPieces || []
  item.extraPieces.push(blankPiece())
  commitFor(item)
}

function updateExtra(item, pieceId, patch) {
  const pce = item?.extraPieces?.find((x) => x.id === pieceId)
  if (!pce) return
  Object.assign(pce, patch)
  commitFor(item)
}

function updateExtraEdge(item, pieceId, key, value) {
  const pce = item?.extraPieces?.find((x) => x.id === pieceId)
  if (!pce) return
  pce.edges = { ...pce.edges, [key]: value }
  commitFor(item)
}

function removeExtra(item, pieceId) {
  item.extraPieces = (item.extraPieces || []).filter((x) => x.id !== pieceId)
  commitFor(item)
}

/* ====================== custo e venda por móvel ====================== */

const qtyInt = (v) => Math.max(0, Math.floor(Number(v) || 0))
const numP = (p, k, d = 0) => {
  const v = Number(p?.[k])
  return Number.isFinite(v) ? v : d
}

function saleCalc(item) {
  return calcItemSale(item, state.settings, saleCtx)
}

function projectSaleTotals() {
  return calcProjectTotals(furnitureList(), state.settings, saleCtx)
}

function projectBillingBasis() {
  const b = (project() && project().billingBasis) || 'used'
  return b === 'rateio' ? 'rateio' : 'used'
}

function saleCalcForStaged(item) {
  if (projectBillingBasis() !== 'rateio') return calcItemSale(item, state.settings, null)
  const drop = new Set([item.id, modal && modal.targetId].filter(Boolean))
  const list = [...furnitureList().filter((f) => !drop.has(f.id)), item]
  const lay = nest(flattenProjectPieces({ furniture: list }), state.settings)
  return calcItemSale(item, state.settings, calcRateioCtx(list, state.settings, lay.sheetsNeeded, 'rateio'))
}

/* ====================== descrição / ficha ====================== */

function specBullets(item) {
  const p = item.params || {}
  const out = []
  const type = item.type
  const W = Math.round(numP(p, 'width', 0))
  const H = Math.round(numP(p, 'height', 0))
  const D = Math.round(numP(p, 'depth', 0))
  if (type === 'mesa') {
    const totalW = W + (numP(p, 'retLen') ? Math.round(numP(p, 'retLen') || 0) : 0)
    out.push(`Plano de ${W} × ${Math.round(numP(p, 'depth', 0))} mm${numP(p, 'retLen') ? ` + retorno de ${Math.round(numP(p, 'retLen') || 0)} mm` : ''} (largura útil total ${totalW} mm)`)
    out.push(`Altura de ${Math.round(numP(p, 'height', 750))} mm`)
    const th = Math.round(numP(p, 'thickness', 15))
    out.push(`Tampo em MDF ${th} mm`)
    if (p.modesty) out.push(`Saia de vedação de ${Math.round(numP(p, 'saiaH', 120))} mm abaixo do tampo`)
    const g = qtyInt(p.gavetas)
    if (g) {
      out.push(`${g} ${g === 1 ? 'gaveta' : 'gavetas'}${numP(p, 'gavH') > 0 ? ` com ${Math.round(numP(p, 'gavH'))} mm de altura` : ' com frente regulável'} em coluna lateral`)
    }
    if (p.shelf) out.push('Com prateleira inferior de apoio')
    return out
  }
  if (type === 'prateleira') {
    return [`Peça de ${W} × ${Math.round(numP(p, 'depth', 0))} × ${Math.round(numP(p, 'thickness', 15))} mm`, `${qtyInt(p.qty) || 1} unidade(s) idêntica(s)`]
  }
  if (type === 'avulso') {
    const n = (item.extraPieces || []).reduce((s, x) => s + Math.max(0, Number(x.qty) || 0), 0)
    return [`Peças avulsas sob medida — ${n} peça(s) no total`, ...(item.extraPieces || []).map((x) => `${x.name}: ${Math.round(numP(x, 'length'))} × ${Math.round(numP(x, 'width'))} mm${x.qty > 1 ? ` ×${x.qty}` : ''}`)]
  }
  out.push(`${W} × ${H} × ${D} mm (largura × altura × profundidade)`)
  const doors = qtyInt(p.doors)
  const correr = p.doorStyle === 'correr'
  if (type === 'armario' || type === 'guarda-roupa') {
    out.push(doors > 0 ? `${doors} ${doors === 1 ? 'porta' : 'portas'}${correr ? ' de correr' : ' de abrir'}` : 'Frente aberta (estante)')
  }
  const sh = qtyInt(p.shelves)
  if (sh) out.push(`${sh} ${sh === 1 ? 'prateleira interna' : 'prateleiras internas'}`)
  const dv = qtyInt(p.divisors)
  if (dv) out.push(`${dv} ${dv === 1 ? 'divisor interno' : 'divisores internos'}`)
  const g = qtyInt(p.gavetas)
  if (g) out.push(`${g} ${g === 1 ? 'gaveta' : 'gavetas'}${type === 'gaveteiro' ? '' : ' na base'}`)
  if (p.hasBack === false || p.hasBack === 0) out.push('Sem fundo (aberto)')
  const extra = (item.extraPieces || []).length
  if (extra) out.push(`${extra} ${extra === 1 ? 'peça extra' : 'peças extras'} inclusa(s)`)
  return out
}

function materialLine() {
  const s = state.settings
  return `Em MDF ${Math.round(Number(s.sheetThickness) || 15)} mm, bordas com fita PVC. Chapa: ${s.sheetName || 'MDF'}.`
}

function descMeta(item) {
  const meta = modelMeta(item)
  const summary = furnitureSummaryLine(item)
  const parts = [meta.group]
  if (summary) parts.push(summary)
  if (qtyInt(item.qty) > 1) parts.push(`quantidade ${qtyInt(item.qty)}`)
  return parts.join(' · ')
}

/* ============================== DOM helpers ============================== */

let focusSeq = 0

function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag)
  if (tag === 'input' || tag === 'select' || tag === 'textarea') el.dataset.k = 'k' + ++focusSeq
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v
    else if (k === 'html') el.innerHTML = v
    else if (k === 'style') el.setAttribute('style', v)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k === 'checked' || k === 'selected') el[k] = !!v
    else if (k === 'value') el.value = v
    else if (v === true) el.setAttribute(k, '')
    else if (v !== false && v != null) el.setAttribute(k, v)
  }
  const appendChild = (child) => {
    if (child == null || child === false) return
    if (Array.isArray(child)) {
      child.forEach(appendChild)
      return
    }
    el.append(child.nodeType ? child : document.createTextNode(child))
  }
  appendChild(children)
  return el
}

function inputNum(value, onChange, extra = {}) {
  return h('input', {
    type: 'number',
    value,
    min: extra.min ?? '0',
    step: extra.step ?? '1',
    onChange: (e) => onChange(Number(e.target.value))
  })
}

function field(label, control, extraClass = '') {
  return h('div', { class: 'field ' + extraClass }, [h('label', {}, [label]), control])
}

function text(value, onChange, placeholder) {
  return h('input', { type: 'text', value, placeholder, onChange: (e) => onChange(e.target.value) })
}

function th(t) {
  return h('th', {}, [t])
}
function td(c) {
  return h('td', {}, [c])
}

function swatch(color, inline) {
  return h('span', { class: 'swatch' + (inline ? ' inline' : ''), style: `background:${color}` })
}

function confirmDialog(message) {
  return typeof window.confirm === 'function' ? window.confirm(message) : true
}

/* ============================== mobile / drawer ============================== */

const MOBILE_QUERY = '(max-width: 900px)'
function isMobileNow() {
  try {
    return !!(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches)
  } catch (e) {
    return false
  }
}
function openDrawer() {
  drawerOpen = true
  refresh()
}
function closeDrawer() {
  if (!drawerOpen) return
  drawerOpen = false
  refresh()
}
const EDITOR_STEPS = [
  ['medidas', 'Medidas'],
  ['acabamento', 'Acabamento'],
  ['extras', 'Peças extras'],
  ['resumo', 'Revisão']
]
function gotoStep(i) {
  editorStep = Math.max(0, Math.min(EDITOR_STEPS.length - 1, i))
  refresh()
}
function mobileNav() {
  return h(
    'nav',
    { class: 'mobile-nav', 'aria-label': 'Abas do orçamento' },
    tabsDef().map(([id, label]) =>
      h(
        'button',
        { class: 'mnav' + (tab === id ? ' active' : ''), onClick: () => { tab = id; refresh() } },
        [label]
      )
    )
  )
}

/* ============================== nuvem (Supabase) ============================== */

function currentPlan() {
  return (state.settings && state.settings.plan) || 'gratis'
}
function planLimited() {
  return Boolean(authUser) && isLimitedPlan(currentPlan())
}
function guardProjectSlots() {
  if (!planLimited()) return true
  if (state.projects.length >= FREE_PROJECT_LIMIT) {
    openUpgrade(
      `Você está no plano Grátis (limite de ${FREE_PROJECT_LIMIT} orçamentos). No Pro os orçamentos são ilimitados.`
    )
    return false
  }
  return true
}
function openUpgrade(message) {
  modal = { kind: 'upgrade', msg: message || '' }
  render()
}

function cloudChip() {
  const cls = 'cloud-chip' + (authUser ? ' on' : '')
  if (authUser) {
    const plan = currentPlan()
    const buttons = []
    if (isLimitedPlan(plan)) {
      buttons.push(h('button', { class: 'btn small primary', onClick: () => openUpgrade('Faça upgrade para criar quantos orçamentos quiser.') }, ['Fazer upgrade']))
    }
    buttons.push(h('button', { class: 'btn small ghost', onClick: cloudLogout }, ['Sair']))
    return h('div', { class: cls }, [
      h('div', { class: 'cloud-txt' }, [
        h('strong', {}, [`Nuvem ativa · Plano ${planLabel(plan)}`]),
        h('span', {}, [authUser.email || ''])
      ]),
      buttons
    ])
  }
  return h('div', { class: cls }, [
    h('div', { class: 'cloud-txt' }, [
      h('strong', {}, ['Backup na nuvem']),
      h('span', {}, ['Entre ou crie uma conta para sincronizar os orçamentos.'])
    ]),
    h('button', { class: 'btn small primary', onClick: openAuth }, ['Entrar'])
  ])
}

function openAuth() {
  modal = { kind: 'auth' }
  render()
}

async function cloudLogout() {
  const r = await cloudSignOut()
  if (r.error) console.warn(r.error)
  authUser = null
  modal = null
  render()
}

function applyCloudData(data) {
  if (data.settings) state.settings = { ...state.settings, ...data.settings }
  state.projects = data.projects
  state.activeProjectId = data.activeProjectId || (data.projects[0] && data.projects[0].id)
  selectedFurnitureId = null
  modal = null
  persist()
}

async function syncAfterLogin() {
  try {
    const data = await pullState()
    if (data && data.projects.length) {
      applyCloudData(data)
    } else {
      await schedulePush(state)
    }
  } catch (err) {
    console.warn('sync', err)
  }
  render()
}

function authModal() {
  const email = h('input', { type: 'email', class: 'doc-input', placeholder: 'voce@marcenaria.com' })
  const pass = h('input', { type: 'password', class: 'doc-input', placeholder: 'senha' })
  const msgEl = h('div', { class: 'auth-msg' }, [])
  const setMsg = (text, kind) => {
    msgEl.textContent = text || ''
    msgEl.className = 'auth-msg' + (kind ? ' ' + kind : '')
  }
  const run = async (mode) => {
    const emailV = email.value.trim()
    const passV = pass.value
    if (!emailV || !passV) return setMsg('Preencha e-mail e senha.', 'err')
    setMsg(mode === 'in' ? 'Entrando…' : 'Criando conta…')
    const r = mode === 'in' ? await cloudSignIn(emailV, passV) : await cloudSignUp(emailV, passV)
    if (r.error) return setMsg(r.error, 'err')
    if (r.confirm) return setMsg('Conta criada! Confirme o e-mail de verificação e entre novamente.', 'ok')
    modal = null
    setMsg('Conectado. Sincronizando…', 'ok')
    syncAfterLogin()
  }
  return h('div', { class: 'modal-backdrop' }, [
    h('div', { class: 'modal auth-modal' }, [
      h('div', { class: 'modal-head' }, [
        h('div', {}, [
          h('h2', {}, ['Backup na nuvem']),
          h('span', { class: 'help' }, ['Seus orçamentos ficam salvos na sua conta (Supabase).'])
        ]),
        h('button', { class: 'btn small ghost x', onClick: () => { modal = null; render() } }, ['✕'])
      ]),
      h('div', { class: 'modal-body' }, [
        h('div', { class: 'auth-box' }, [
          field('E-mail', email),
          field('Senha', pass),
          msgEl,
          h('div', { class: 'row' }, [
            h('button', { class: 'btn primary', onClick: () => run('in') }, ['Entrar']),
            h('button', { class: 'btn', onClick: () => run('up') }, ['Criar conta'])
          ]),
          h('p', { class: 'help', style: 'line-height:1.45' }, [
            'Primeira vez: crie uma conta. No primeiro login, os dados deste navegador são enviados para a sua conta.'
          ])
        ])
      ])
    ])
  ])
}

function upgradeModal() {
  const m = modal
  return h('div', { class: 'modal-backdrop' }, [
    h('div', { class: 'modal auth-modal' }, [
      h('div', { class: 'modal-head' }, [
        h('div', {}, [
          h('h2', {}, ['Plano Pro do MDF Atelier']),
          h('span', { class: 'help' }, ['Orçamentos ilimitados para a sua marcenaria.'])
        ]),
        h('button', { class: 'btn small ghost x', onClick: () => { modal = null; render() } }, ['✕'])
      ]),
      h('div', { class: 'modal-body' }, [
        h('div', { class: 'auth-box' }, [
          h('p', { class: 'help', style: 'line-height:1.5' }, [m.msg || '']),
          h('div', { class: 'auth-plans' }, [
            h('div', { class: 'auth-plan hot' }, [
              h('strong', {}, ['Pro']),
              h('span', {}, ['R$ 49/mês'])
            ]),
            h('div', { class: 'auth-plan' }, [
              h('strong', {}, ['Premium']),
              h('span', {}, ['R$ 99/mês'])
            ])
          ]),
          h('ul', { class: 'help', style: 'line-height:1.7;padding-left:16px;margin:0' }, [
            h('li', {}, ['Orçamentos ilimitados']),
            h('li', {}, ['Sua logo e seu WhatsApp no documento']),
            h('li', {}, ['Backup na nuvem e suporte'])
          ]),
          h('div', { class: 'row' }, [
            h(
              'a',
              { class: 'btn primary', href: upgradeHref('Quero assinar o plano Pro do MDF Atelier.'), target: '_blank', rel: 'noopener' },
              ['Assinar o Pro']
            ),
            h('button', { class: 'btn', onClick: () => { modal = null; render() } }, ['Agora não'])
          ])
        ])
      ])
    ])
  ])
}

/* ============================== sidebar ============================== */

function renderSidebar(open = false) {
  const active = project()
  return h('aside', { class: 'sidebar' + (open ? ' open' : '') }, [
    h('div', { class: 'brand' }, [
      h('div', { class: 'mark' }, ['MDF ATELIER']),
      h('h1', {}, ['Orçamentos']),
      h('p', {}, ['Monte os móveis do cliente, calcule o custo com margem e gere o orçamento impresso com foto, descrição e valores.'])
    ]),
    h('div', { class: 'side-actions' }, [
      h('button', { class: 'btn primary', onClick: addProject }, ['+ Orçamento']),
      h('button', { class: 'btn', title: 'Duplicar orçamento atual', onClick: duplicateProject }, ['Duplicar']),
      h(
        'button',
        {
          class: 'btn ghost danger-side',
          disabled: state.projects.length <= 1,
          title: state.projects.length <= 1 ? 'Não é possível excluir o único orçamento' : 'Excluir orçamento atual',
          onClick: () => {
            if (confirmDialog('Excluir este orçamento e todas as suas peças?')) removeProject(state.activeProjectId)
          }
        },
        ['Excluir']
      )
    ]),
    h('div', { class: 'section-label' }, ['PROJETOS / ORÇAMENTOS']),
    h(
      'div',
      { class: 'project-list' },
      state.projects.map((p) =>
        h(
          'button',
          {
            class: 'project-item' + (p.id === state.activeProjectId ? ' active' : ''),
            onClick: () => setActive(p.id)
          },
          [
            h('strong', {}, [p.name]),
            h('span', {}, [
              `${p.client ? p.client + ' · ' : ''}${(p.furniture || []).length} móvel(is) · ${new Date(p.createdAt).toLocaleDateString('pt-BR')}`
            ])
          ]
        )
      )
    ),
    active && active.notes ? h('div', { class: 'side-note' }, [active.notes]) : null,
    cloudConfigured() ? cloudChip() : null
  ])
}

/* ============================== barra kpi interna ============================== */

function kpis() {
  const s = summaryCache
  const items = [
    ['Chapas', String(s.sheets)],
    ['Aproveitamento', `${s.efficiency.toFixed(1)}%`],
    ['Peças', String(s.pieceCount)],
    ['Fita', formatMeters(s.tapeM)],
    ['Área usada', formatM2(s.areaM2)],
    ['Custo material', formatMoney(s.total)]
  ]
  return h(
    'div',
    { class: 'kpis' },
    items.map(([label, val], i) =>
      h('div', { class: 'kpi' + (i === 0 && s.unplaced ? ' warn' : '') }, [h('label', {}, [label]), h('strong', {}, [val])])
    )
  )
}

/* ============================== ABA ORÇAMENTO (documento) ============================== */

function budgetDocNo(p) {
  return new Date(p.createdAt).toLocaleDateString('pt-BR').replaceAll('/', '')
}

function tabOrcamento() {
  const p = project()
  const items = furnitureList()
  const t = projectSaleTotals()
  const pages = [coverPage(p)]
  if (items.length) {
    items.forEach((f) => pages.push(itemPage(f)))
    pages.push(summaryPage(p, t))
  } else {
    pages.push(
      h('div', { class: 'budget-empty' }, [
        h('h3', {}, ['Nenhum móvel neste orçamento']),
        h('p', {}, ['Use o botão flutuante "+ Adicionar móvel" para montar o primeiro item do cliente.'])
      ])
    )
  }
  return h('div', { class: 'budget-doc' }, pages)
}

function coverPage(p) {
  const set = state.settings
  const date = new Date(p.createdAt).toLocaleDateString('pt-BR')
  const count = furnitureList().length
  return h('section', { class: 'doc-page cover' }, [
    h('div', { class: 'cover-band' }, [
      docLogoMark('cover'),
      h('div', { class: 'cover-no' }, [h('span', {}, ['ORÇAMENTO Nº']), h('b', {}, [budgetDocNo(p)])])
    ]),
    h('div', { class: 'cover-hero' }, [
      h('span', { class: 'cover-kicker' }, ['PROPOSTA DE MÓVEIS PLANEJADOS']),
      h('input', {
        type: 'text',
        class: 'doc-input cover-title',
        value: p.name,
        placeholder: 'Nome do orçamento',
        onChange: (e) => updateProject({ name: e.target.value })
      }),
      h('p', { class: 'cover-sub' }, [
        count ? `${count} ${count === 1 ? 'móvel' : 'móveis'} no detalhamento das próximas páginas.` : 'Adicione os móveis para montar a proposta.'
      ])
    ]),
    h('div', { class: 'cover-facts' }, [
      field(
        'Cliente',
        h('input', {
          type: 'text',
          class: 'doc-input',
          value: p.client || '',
          placeholder: 'Nome do cliente',
          onChange: (e) => updateProject({ client: e.target.value })
        }),
        'grow'
      ),
      field(
        'Telefone',
        h('input', {
          type: 'text',
          class: 'doc-input',
          value: p.phone || '',
          placeholder: '(00) 00000-0000',
          onChange: (e) => updateProject({ phone: e.target.value })
        })
      ),
      field('Emissão', h('div', { class: 'cover-static' }, [date]))
    ]),
    h('div', { class: 'cover-foot' }, [
      h('div', { class: 'cover-about' }, [
        h('strong', {}, [set.shopName || 'MDF Atelier']),
        h('span', {}, [set.shopPhone ? 'WhatsApp ' + set.shopPhone : 'Móveis planejados em MDF']),
        h('small', {}, [materialLine()])
      ]),
      h('div', { class: 'cover-tag' }, ['Projeto, corte e montagem com precisão. Condições, observações e o valor final estão nas próximas páginas.'])
    ])
  ])
}

function itemPage(f) {
  return h('section', { class: 'doc-page item-page' }, [budgetRow(f)])
}

function budgetRow(f) {
  const s = saleCalc(f)
  const isL = f.type === 'mesa' && (f.variant || '').startsWith('l-')
  return h('div', { class: 'budget-card', id: 'f-' + f.id }, [
    h('div', { class: 'budget-top' }, [
      h('div', { class: 'budget-id' }, [
        swatch(f.color, true),
        h('div', {}, [h('h3', {}, [[`[${f.code}] `, f.name]]), h('span', { class: 'budget-meta' }, [descMeta(f)])])
      ]),
      h('div', { class: 'budget-price' }, [
        h('label', {}, [s.qty > 1 ? `Valor unitário (×${s.qty})` : 'Valor unitário']),
        h('strong', {}, [formatMoney(s.salePerUnit)]),
        s.qty > 1 ? h('span', { class: 'budget-line' }, [`total ${formatMoney(s.lineTotal)}`]) : null
      ])
    ]),
    h('div', { class: 'budget-body' }, [
      h('div', { class: 'shot' }, [h('div', { class: 'svg-frame', html: schematicSvg(f, isL ? 'planta' : undefined) })]),
      h('div', { class: 'budget-info' }, [
        h('p', { class: 'blurb' }, [modelMeta(f).blurb || '']),
        h('ul', { class: 'specs' }, specBullets(f).map((b) => h('li', {}, [b]))),
        h('p', { class: 'compose' }, [`${s.pieceCount} peça(s) · ${formatM2(s.areaM2)} de chapa${s.tapeM ? ' · ' + formatMeters(s.tapeM) + ' de fita' : ''} · ${formatMm(Number(f.params?.thickness) || Number(state.settings.sheetThickness))}`])
      ])
    ]),
    h('div', { class: 'budget-foot' }, [
      h('span', { class: 'help print-hide' }, ['Custo de material por item: ' + formatMoney(s.cost)]),
      h('div', { class: 'row print-hide' }, [
        h('button', { class: 'btn small', title: 'Editar medidas, opções e peças extras', onClick: () => openModalEdit(f) }, ['Editar']),
        h('button', { class: 'btn small', title: 'Criar uma cópia deste móvel', onClick: () => duplicateModalFrom(f) }, ['Duplicar']),
        h('button', { class: 'btn small danger', title: 'Remover deste orçamento', onClick: () => removeFromList(f) }, ['Excluir'])
      ])
    ])
  ])
}

function removeFromList(f) {
  if (confirmDialog(`Excluir "${f.name}" deste orçamento?`)) removeFurniture(f.id)
}

function totalsCard(t, p) {
  return h('div', { class: 'budget-total' }, [
    h('div', { class: 'bt-lines' }, [
      h('div', {}, [h('span', {}, [`${t.count} ${t.count === 1 ? 'item' : 'itens'} · ${t.units} ${t.units === 1 ? 'unidade' : 'unidades'}`])]),
      h('div', {}, [h('span', {}, ['Subtotal']), h('strong', {}, [formatMoney(t.sale)])])
    ]),
    h('div', { class: 'bt-grand' }, [h('label', {}, ['TOTAL DO ORÇAMENTO']), h('strong', {}, [formatMoney(t.sale)])])
  ])
}

function docLogoMark(cls) {
  const mark = h('div', { class: 'mark' }, ['MDF ATELIER'])
  const img = h('img', { class: 'logo-img', src: import.meta.env.BASE_URL + 'logo.png', alt: '' })
  img.style.display = 'none'
  img.addEventListener('load', () => {
    img.style.display = 'block'
    mark.style.display = 'none'
  })
  img.addEventListener('error', () => {
    img.remove()
  })
  return h('div', { class: 'logo-slot' + (cls ? ' ' + cls : '') }, [mark, img])
}

function waDigits() {
  return String((state.settings && state.settings.shopPhone) || '').replace(/\D/g, '')
}

function qrSvgDataUri(text, size = 140) {
  const q = qrcode(0, 'M')
  q.addData(text)
  q.make()
  const n = q.getModuleCount()
  const pad = 2
  const cell = Math.max(1, Math.floor(size / (n + pad * 2)))
  const dim = (n + pad * 2) * cell
  const dark = '#241d15'
  const light = '#fbf8f2'
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}"><rect width="${dim}" height="${dim}" fill="${light}"/>`
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (q.isDark(r, c)) {
        s += `<rect x="${(c + pad) * cell}" y="${(r + pad) * cell}" width="${cell}" height="${cell}" fill="${dark}"/>`
      }
    }
  }
  s += '</svg>'
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s)
}

function docTail(p, t) {
  const set = state.settings
  const phone = waDigits()
  if (phone.length < 8) return null
  const msg = `Olá! Gostaria de falar sobre o orçamento "${p.name || 'sem nome'}", no valor de ${formatMoney(t.sale)}.`
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
  return h('div', { class: 'doc-tail' }, [
    h('div', { class: 'tail-brand' }, [
      docLogoMark(),
      h('div', {}, [
        h('strong', {}, [set.shopName || 'MDF Atelier']),
        h('span', { class: 'tail-phone' }, [set.shopPhone]),
        h('span', { class: 'tail-hint print-hide' }, ['Escaneie o QR code — a conversa já abre com o nome e o valor deste orçamento.'])
      ])
    ]),
    h('a', { class: 'qr-open', href: url, target: '_blank', rel: 'noopener', title: 'Abrir WhatsApp com o resumo deste orçamento' }, [
      h('img', { class: 'qr-img', src: qrSvgDataUri(url), alt: 'QR code WhatsApp ' + set.shopPhone })
    ])
  ])
}

function budgetNotesGrid(p) {
  return h('div', { class: 'budget-notes' }, [
    h('div', {}, [
      h('label', {}, ['Observações / condições para o cliente']),
      h('textarea', {
        class: 'doc-input',
        value: p.notes || '',
        placeholder: 'Prazos, forma de pagamento, garantia, o que está incluso…',
        onChange: (e) => updateProject({ notes: e.target.value })
      })
    ]),
    h('div', { class: 'sign-row' }, [
      h('div', {}, [h('span', {}, ['_________________________']), h('label', {}, ['Assinatura do cliente'])]),
      h('div', {}, [h('span', {}, ['_________________________']), h('label', {}, [state.settings.shopName || 'MDF Atelier'])])
    ])
  ])
}

function summaryRow(f) {
  const s = saleCalc(f)
  return h('div', { class: 'sum-row' }, [
    swatch(f.color, true),
    h('div', { class: 'sum-info' }, [
      h('span', { class: 'sum-name' }, [[`[${f.code}] `, f.name]]),
      h('span', { class: 'sum-meta' }, [[`${modelMeta(f).group} · ${furnitureSummaryLine(f)}`]])
    ]),
    h('div', { class: 'sum-price' }, [
      h('strong', {}, [formatMoney(s.lineTotal)]),
      s.qty > 1 ? h('span', { class: 'sum-unit' }, [`valor total ×${s.qty} un.`]) : null
    ])
  ])
}

function summaryPage(p, t) {
  const items = furnitureList()
  return h('section', { class: 'doc-page final-page' }, [
    h('div', { class: 'sum-head' }, [
      h('div', {}, [
        h('h2', {}, ['Resumo do orçamento']),
        h('span', { class: 'sum-people' }, [
          `${p.client || 'sem cliente'}${p.phone ? ' · ' + p.phone : ''}`
        ])
      ]),
      h('div', { class: 'cover-no' }, [h('span', {}, ['ORÇAMENTO Nº']), h('b', {}, [budgetDocNo(p)])])
    ]),
    h('div', { class: 'sum-list' }, items.map((f) => summaryRow(f))),
    totalsCard(t, p),
    budgetNotesGrid(p),
    docTail(p, t)
  ])
}

/* ============================== MODAL: escolher e montar ============================== */

function openModalNew() {
  modal = { kind: 'pick' }
  refresh()
}

function startEditingModel(model) {
  const staged = createFurniture(model, furnitureList())
  if (!staged) return
  editorLView = 'planta'
  editorStep = 0
  modal = { kind: 'edit', targetId: null, staged }
  refresh()
}

function openModalEdit(item) {
  editorLView = 'planta'
  editorStep = 0
  modal = { kind: 'edit', targetId: item.id, staged: structuredClone(item) }
  refresh()
}

function duplicateModalFrom(f) {
  const m = modal
  if (m && m.kind === 'edit' && !m.targetId) modalSave()
  const base = mutableItem(f.id) || f
  const model = modelByTypeVariant(f.type, f.variant) || (typeof f.type === 'string' ? { type: f.type } : null)
  if (!model) return
  const fresh = createFurniture(model, furnitureList())
  fresh.name = f.name + ' (cópia)'
  fresh.params = structuredClone(base.params || {})
  fresh.extraPieces = structuredClone(base.extraPieces || [])
  fresh.qty = base.qty
  fresh.margin = base.margin
  project().furniture.push(fresh)
  selectedFurnitureId = fresh.id
  editorLView = 'planta'
  editorStep = 0
  modal = { kind: 'edit', targetId: fresh.id, staged: fresh }
  persist()
}

function modalSave() {
  const m = modal
  if (!m || m.kind !== 'edit') return
  const list = furnitureList()
  const st = m.staged
  if (m.targetId) {
    const idx = list.findIndex((f) => f.id === m.targetId)
    if (idx >= 0) list[idx] = { ...st, id: m.targetId }
  } else {
    list.push(st)
  }
  selectedFurnitureId = st.id
  modal = null
  persist()
}

function modalCancel() {
  modal = null
  refresh()
}

function modalRemove() {
  const m = modal
  if (!m || m.kind !== 'edit') return
  if (!m.targetId) {
    modal = null
    refresh()
    return
  }
  if (confirmDialog(`Excluir "${m.staged.name}" deste orçamento?`)) removeFurniture(m.targetId)
}

function pickerModal() {
  const query = catalogQuery.trim().toLowerCase()
  const hasQuery = query.length > 0
  return h('div', { class: 'modal-backdrop' }, [
    h('div', { class: 'modal modal-picker' }, [
      h('div', { class: 'modal-head' }, [
        h('div', {}, [h('h2', {}, ['Adicionar móvel ao orçamento']), h('span', { class: 'help' }, ['Escolha o modelo. Depois você confere o desenho e ajusta as medidas ao lado.'])])
      ]),
      h('div', { class: 'modal-body' }, [
        h('div', { class: 'search-wrap' }, [
          h('span', {}, ['']),
          h('input', {
            type: 'text',
            value: catalogQuery,
            placeholder: 'Buscar (ex.: mesa, correr, gavetas, armário…)',
            onChange: (e) => {
              catalogQuery = e.target.value
              refresh()
            }
          })
        ]),
        h('div', { class: 'picker-groups' }, [
          CATALOG_GROUPS.map((g) => {
            const matches = g.models.filter(
              (m) => !hasQuery || (m.label + ' ' + m.blurb + ' ' + g.group).toLowerCase().includes(query)
            )
            if (hasQuery && !matches.length) return null
            const open = hasQuery ? true : !!groupOpen[g.group]
            return h('div', { class: 'catalog-group' }, [
              h(
                'button',
                { class: 'catalog-group-head' + (open ? ' open' : ''), onClick: () => toggleGroup(g.group) },
                [
                  h('span', { class: 'cg-caret' }, [open ? '▾' : '▸']),
                  h('strong', {}, [g.group]),
                  h('span', { class: 'cg-count' }, [`${matches.length}`])
                ]
              ),
              open
                ? h(
                    'div',
                    { class: 'catalog-grid' },
                    matches.map((m) =>
                      h(
                        'button',
                        { class: 'catalog-card', title: m.blurb, onClick: () => startEditingModel(m) },
                        [h('strong', {}, [m.label]), h('span', {}, [m.blurb])]
                      )
                    )
                  )
                : null
            ])
          })
        ])
      ]),
      h('div', { class: 'modal-foot' }, [
        h('span', { class: 'help' }, ['Passo 1 de 2 — depois você ajusta medidas, gavetas, portas e cores.']),
        h('button', { class: 'btn', onClick: modalCancel }, ['Cancelar'])
      ])
    ])
  ])
}

function toggleGroup(name) {
  groupOpen[name] = !groupOpen[name]
  refresh()
}

function editorModal() {
  return isMobileNow() ? editorModalMobile() : editorModalDesktop()
}

function editorModalMobile() {
  const m = modal
  const item = m.staged
  const meta = modelMeta(item)
  const isL = item.type === 'mesa' && (item.variant || '').startsWith('l-')
  const isNew = !m.targetId
  const step = Math.max(0, Math.min(EDITOR_STEPS.length - 1, editorStep))
  const s = saleCalcForStaged(item)
  const rateioActive = projectBillingBasis() === 'rateio'
  const generated = flattenProjectPieces({ furniture: [{ ...item, qty: 1 }] })
  const params = fieldsFor(item).filter((f) => !isParamHidden(item, f))
  const stepsHeader = h(
    'div',
    { class: 'editor-steps', role: 'tablist' },
    EDITOR_STEPS.map(([key, label], i) =>
      h(
        'button',
        {
          class: 'estep' + (i < step ? ' done' : '') + (i === step ? ' active' : ''),
          onClick: () => gotoStep(i),
          title: label
        },
        [h('span', { class: 'estep-n' }, [String(i + 1)]), h('span', {}, [label])]
      )
    )
  )
  let inner
  if (step === 0) {
    inner = [
      h('div', { class: 'card' }, [
        h('div', { class: 'row' }, [
          field(
            'Nome no orçamento',
            text(item.name, (v) => updateFurniture(item.id, { name: v }), '[Código] Nome'),
            'grow'
          ),
          field('Quantidade', inputNum(item.qty || 1, (v) => updateFurniture(item.id, { qty: Math.max(1, v) }), { min: '1' }))
        ])
      ]),
      params.length
        ? h('div', { class: 'card' }, [
            h('div', { class: 'row', style: 'justify-content:space-between;align-items:center' }, [h('h3', {}, ['Medidas e opções']), h('span', { class: 'help' }, [materialLine()])]),
            h('div', { class: 'param-grid', style: 'margin-top:6px' }, params.map((f) => paramField(item, f)))
          ])
        : null,
      h('p', { class: 'help step-tip' }, ['Ajuste medidas e opções — o custo é recalculado a cada mudança.'])
    ]
  } else if (step === 1) {
    inner = [
      h('div', { class: 'card' }, [
        h('h3', {}, ['Cor / identificação']),
        h('div', { class: 'row color-row' }, [
          h('input', { type: 'color', value: item.color, onChange: (e) => updateFurniture(item.id, { color: e.target.value }) }),
          h('div', { class: 'color-chip', style: `background:${item.color}` }),
          h('p', { class: 'help grow' }, ['A cor aparece no documento impresso para identificar o móvel do cliente.'])
        ])
      ]),
      h('div', { class: 'card' }, [
        h('h3', {}, ['Material']),
        h('p', { class: 'big-line' }, [materialLine()]),
        h('p', { class: 'help' }, ['Tipo de chapa, espessura e preço da placa são definidos na aba Config. Fita e bordas de peças avulsas ficam em "Peças extras".'])
      ])
    ]
  } else if (step === 2) {
    inner = [extraPiecesBlock(item)]
  } else {
    inner = [
      isL
        ? h('div', { class: 'view-seg' }, [
            h('button', { class: editorLView === 'planta' ? 'active' : '', onClick: () => setLView('planta') }, ['Vista superior']),
            h('button', { class: editorLView === '3d' ? 'active' : '', onClick: () => setLView('3d') }, ['Perspectiva'])
          ])
        : null,
      h('div', { class: 'modal-preview' }, [
        h('div', { class: 'svg-frame', html: schematicSvg(item, isL ? editorLView : undefined) }),
        h('div', { class: 'stat-chips' }, [
          h('span', {}, [`${s.pieceCount} peça(s)`]),
          h('span', {}, [formatM2(s.areaM2)]),
          h('span', {}, [formatMeters(s.tapeM)]),
          h('span', { class: 'chip-money' }, [`custo ${formatMoney(s.cost)}`])
        ])
      ]),
      h('div', { class: 'card money-card' }, [
        h('h3', {}, ['Custo e venda deste item']),
        h('div', { class: 'money-grid' }, [
          h('div', {}, [h('label', {}, ['Custo de material (1 un.)']), h('strong', {}, [formatMoney(s.cost)])]),
          h('div', {}, [h('label', {}, ['Margem aplicada']), h('strong', {}, [`${s.margin.toFixed(0)}%`])]),
          h('div', {}, [h('label', {}, ['Valor de venda (1 un.)']), h('strong', { class: 'accent' }, [formatMoney(s.salePerUnit)])])
        ]),
        h('p', { class: 'help' }, ['Margem é configurada na aba Custos (por item) ou no padrão global em Config.']),
        rateioActive ? h('p', { class: 'help' }, ['Este orçamento usa "incluir custo das sobras": o custo acima já soma a parcela rateada da sobra das chapas.']) : null
      ]),
      h('p', { class: 'help center' }, [`${generated.length} tipo(s) de peça no corte${isNew ? ' — nada foi salvo ainda' : ''}.`])
    ]
  }
  const lastStep = step >= EDITOR_STEPS.length - 1
  return h('div', { class: 'modal-backdrop' }, [
    h('div', { class: 'modal modal-editor' }, [
      h('div', { class: 'modal-head' }, [
        h('div', {}, [
          h('h2', {}, [swatch(item.color, true), [` [${item.code}] `, meta.label]]),
          h('span', { class: 'help' }, [meta.group + (isNew ? ' · novo item' : ' · editar item')])
        ]),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn small ghost x', onClick: modalCancel, 'aria-label': 'Fechar' }, ['✕'])
        ])
      ]),
      h('div', { class: 'modal-body' }, [stepsHeader, h('div', { class: 'mobile-config' }, inner)]),
      h('div', { class: 'modal-foot' }, [
        step > 0 ? h('button', { class: 'btn', onClick: () => gotoStep(step - 1) }, ['Voltar']) : h('span', { class: 'help' }, [meta.group]),
        h('span', { class: 'help step-info' }, [`${step + 1} de ${EDITOR_STEPS.length}`]),
        h('button', { class: 'btn primary', onClick: () => (lastStep ? modalSave() : gotoStep(step + 1)) }, [lastStep ? (isNew ? 'Adicionar ao orçamento' : 'Salvar alterações') : 'Continuar'])
      ])
    ])
  ])
}

function editorModalDesktop() {
  const m = modal
  const item = m.staged
  const meta = modelMeta(item)
  const isL = item.type === 'mesa' && (item.variant || '').startsWith('l-')
  const isNew = !m.targetId
  const generated = flattenProjectPieces({ furniture: [{ ...item, qty: 1 }] })
  const s = saleCalcForStaged(item)
  const rateioActive = projectBillingBasis() === 'rateio'
  return h('div', { class: 'modal-backdrop' }, [
    h('div', { class: 'modal modal-editor' }, [
      h('div', { class: 'modal-head' }, [
        h('div', {}, [
          h('h2', {}, [swatch(item.color, true), [` [${item.code}] `, meta.label]]),
          h('span', { class: 'help' }, [meta.group + (isNew ? ' · novo item' : ' · editar item')])
        ]),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn small', title: 'Duplicar este item no orçamento', onClick: () => duplicateModalFrom(item) }, ['Duplicar']),
          h('button', { class: 'btn small danger', onClick: modalRemove }, ['Excluir']),
          h('button', { class: 'btn small ghost x', onClick: modalCancel }, ['✕'])
        ])
      ]),
      h('div', { class: 'modal-body' }, [
        h('div', { class: 'modal-preview' }, [
          isL
            ? h('div', { class: 'view-seg' }, [
                h('button', { class: editorLView === 'planta' ? 'active' : '', onClick: () => setLView('planta') }, ['Vista superior']),
                h('button', { class: editorLView === '3d' ? 'active' : '', onClick: () => setLView('3d') }, ['Perspectiva'])
              ])
            : null,
          h('div', { class: 'svg-frame', html: schematicSvg(item, isL ? editorLView : undefined) }),
          h('div', { class: 'stat-chips' }, [
            h('span', {}, [`${s.pieceCount} peça(s)`]),
            h('span', {}, [formatM2(s.areaM2)]),
            h('span', {}, [formatMeters(s.tapeM)]),
            h('span', { class: 'chip-money' }, [`custo ${formatMoney(s.cost)}`])
          ])
        ]),
        h('div', { class: 'modal-config' }, [
          h('div', { class: 'card' }, [
            h('div', { class: 'row' }, [
              field(
                'Nome no orçamento',
                text(item.name, (v) => updateFurniture(item.id, { name: v }), '[Código] Nome'),
                'grow'
              ),
              field('Quantidade', inputNum(item.qty || 1, (v) => updateFurniture(item.id, { qty: Math.max(1, v) }), { min: '1' }))
            ]),
            h('div', { class: 'row' }, [
              field('Cor / identificação', h('input', { type: 'color', value: item.color, onChange: (e) => updateFurniture(item.id, { color: e.target.value }) }))
            ])
          ]),
          fieldsFor(item).length
            ? h('div', { class: 'card' }, [
                h('div', { class: 'row', style: 'justify-content:space-between;align-items:center' }, [h('h3', {}, ['Medidas e opções']), h('span', { class: 'help' }, [materialLine()])]),
                h('div', { class: 'param-grid', style: 'margin-top:6px' }, fieldsFor(item).filter((f) => !isParamHidden(item, f)).map((f) => paramField(item, f)))
              ])
            : null,
          extraPiecesBlock(item),
          h('div', { class: 'card money-card' }, [
            h('h3', {}, ['Custo e venda deste item']),
            h('div', { class: 'money-grid' }, [
              h('div', {}, [h('label', {}, ['Custo de material (1 un.)']), h('strong', {}, [formatMoney(s.cost)])]),
              h('div', {}, [h('label', {}, ['Margem aplicada']), h('strong', {}, [`${s.margin.toFixed(0)}%`])]),
              h('div', {}, [h('label', {}, ['Valor de venda (1 un.)']), h('strong', { class: 'accent' }, [formatMoney(s.salePerUnit)])])
            ]),
            h('p', { class: 'help' }, ['Margem é configurada na aba Custos (por item) ou no padrão global em Config.']),
            rateioActive ? h('p', { class: 'help' }, ['Este orçamento usa "incluir custo das sobras": o custo acima já soma a parcela rateada da sobra das chapas.']) : null
          ])
        ])
      ]),
      h('div', { class: 'modal-foot' }, [
        h('span', { class: 'help' }, [`${generated.length} tipo(s) de peça no corte${isNew ? ' — nada foi salvo ainda' : ''}.`]),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn', onClick: modalCancel }, ['Cancelar']),
          h('button', { class: 'btn primary', onClick: modalSave }, [isNew ? 'Adicionar ao orçamento' : 'Salvar alterações'])
        ])
      ])
    ])
  ])
}

function setLView(view) {
  editorLView = view
  refresh()
}

/* ====================== configuração de parâmetros / peças extras ====================== */

function isParamHidden(item, f) {
  if (f.kind === 'check') return false
  const p = item.params || {}
  const noDrawers = !Number(p.gavetas || 0)
  if (f.key === 'gavH' || f.key === 'pedW' || f.key === 'drawerBase') return noDrawers
  if (f.key === 'baseH') return noDrawers || p.drawerBase !== 'alto'
  if (f.key === 'frontT') return noDrawers
  if (f.key === 'doorT') return !Number(p.doors || 0) && noDrawers
  if (f.key === 'backT') return !Number(p.hasBack ?? 1)
  return false
}

function paramField(item, f) {
  const val = item.params?.[f.key]
  if (f.kind === 'check') {
    return h('label', { class: 'check-field' }, [
      h('input', {
        type: 'checkbox',
        checked: !!val,
        onChange: (e) => updateParam(item.id, f.key, e.target.checked ? 1 : 0)
      }),
      f.label
    ])
  }
  if (f.kind === 'select') {
    return field(
      f.label,
      h(
        'select',
        { onChange: (e) => updateParam(item.id, f.key, e.target.value) },
        (f.options || []).map(([k, label]) => h('option', { value: k, selected: String(val) === String(k) }, [label]))
      )
    )
  }
  return field(f.label, inputNum(val ?? 0, (v) => updateParam(item.id, f.key, v)))
}

function extraPiecesHead(item) {
  return h('div', { class: 'row', style: 'justify-content:space-between;align-items:center' }, [
    h('h3', {}, ['Peças extras neste móvel']),
    h('button', { class: 'btn small', onClick: () => addExtraPiece(item) }, ['+ Peça extra'])
  ])
}

function extraPiecesBody(item) {
  return (item.extraPieces || []).length
    ? h('div', { style: 'overflow:auto;margin-top:10px' }, [pieceTable(item)])
    : h('p', { class: 'help', style: 'margin:10px 0 0' }, ['Use para complementos que o modelo não gera (ex.: cimalha, rodapé, nicho avulso).'])
}

function extraPiecesBlock(item) {
  return h('div', { class: 'card' }, [extraPiecesHead(item), extraPiecesBody(item)])
}

function pieceTable(item) {
  return h('table', {}, [
    h('thead', {}, [h('tr', {}, [th('Nome'), th('L'), th('A'), th('Esp.'), th('Qtd'), th('Veio'), th('Fita'), th('')])]),
    h(
      'tbody',
      {},
      (item.extraPieces || []).map((piece) =>
        h('tr', {}, [
          td(h('input', { type: 'text', value: piece.name, onChange: (e) => updateExtra(item, piece.id, { name: e.target.value }) })),
          td(inputNum(piece.length, (v) => updateExtra(item, piece.id, { length: v }))),
          td(inputNum(piece.width, (v) => updateExtra(item, piece.id, { width: v }))),
          td(inputNum(piece.thickness, (v) => updateExtra(item, piece.id, { thickness: v }))),
          td(inputNum(piece.qty, (v) => updateExtra(item, piece.id, { qty: v }))),
          td(
            h(
              'select',
              { onChange: (e) => updateExtra(item, piece.id, { grain: e.target.value }) },
              Object.entries(GRAIN).map(([k, label]) => h('option', { value: k, selected: piece.grain === k }, [label]))
            )
          ),
          td(
            h('div', { class: 'edges' }, [
              extraEdge(item, piece, 'front', 'F'),
              extraEdge(item, piece, 'back', 'Tr'),
              extraEdge(item, piece, 'left', 'E'),
              extraEdge(item, piece, 'right', 'D')
            ])
          ),
          td(h('button', { class: 'btn danger', onClick: () => removeExtra(item, piece.id) }, ['x']))
        ])
      )
    )
  ])
}

function extraEdge(item, piece, key, label) {
  return h('label', {}, [
    h('input', {
      type: 'checkbox',
      checked: !!piece.edges?.[key],
      onChange: (e) => updateExtraEdge(item, piece.id, key, e.target.checked)
    }),
    label
  ])
}

/* ============================== ABA CUSTOS ============================== */

function billingBasisCard() {
  const basis = projectBillingBasis()
  const setBasis = (v) => updateProject({ billingBasis: v })
  const ctx = saleCtx || { wasteCost: 0 }
  const s = summaryCache
  const effText = s ? `${s.efficiency.toFixed(1)}%` : '—'
  const wasteM2Text = s ? formatM2(s.wasteM2) : '—'
  return h('div', { class: 'card basis-card' }, [
    h('div', { class: 'row', style: 'justify-content:space-between;align-items:center' }, [
      h('h2', {}, ['Base de cobrança das chapas']),
      h('span', { class: 'help' }, ['Vale para este orçamento. Fita de borda é sempre cobrada por metro usado.'])
    ]),
    h('div', { class: 'basis-opts' }, [
      basisOption(
        'used',
        'Por área usada',
        'Cada item paga somente a chapa que usa de fato. A sobra/perda do corte fica por conta da marcenaria.',
        basis,
        setBasis
      ),
      basisOption(
        'rateio',
        'Incluir custo das sobras',
        'Além da área usada, soma-se a cada item uma parcela do custo da sobra das chapas, proporcional ao que ele usa. A soma dos itens cobre o custo real das chapas do plano.',
        basis,
        setBasis
      )
    ]),
    h('p', { class: 'help', style: 'margin-top:10px' }, [
      basis === 'rateio'
        ? `Aproveitamento do plano: ${effText} (sobra de ${wasteM2Text}). Custo das sobras a ratear entre os itens: ${formatMoney(ctx.wasteCost)}.`
        : `Aproveitamento do plano: ${effText} (sobra de ${wasteM2Text}). Neste modo a sobra de ${formatMoney(ctx.wasteCost)} fica embutida na margem e não é cobrada à parte.`
    ])
  ])
}

function basisOption(key, title, desc, current, onChange) {
  const active = current === key
  return h(
    'button',
    { class: 'basis-opt' + (active ? ' active' : ''), onClick: () => onChange(key) },
    [
      h('span', { class: 'basis-radio' }, [active ? '●' : '○']),
      h('span', { class: 'basis-txt' }, [h('strong', {}, [title]), h('small', {}, [desc])])
    ]
  )
}

function tabCustos() {
  const items = furnitureList()
  const t = projectSaleTotals()
  return h('div', {}, [
    kpis(),
    billingBasisCard(),
    h('div', { class: 'card' }, [
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start' }, [
        h('div', {}, [h('h2', {}, ['Custo e venda por item']), h('p', { class: 'help' }, ['Margem padrão: ' + Number(state.settings.defaultMargin || 0).toFixed(0) + '%. Ajuste por item abaixo — o valor de venda alimenta o Orçamento do cliente.'])])
      ]),
      items.length
        ? h('div', { style: 'overflow:auto' }, [
            h('table', { class: 'cost-table' }, [
              h('thead', {}, [
                h('tr', {}, [
                  th(''),
                  th('Item'),
                  th('Qtd'),
                  th('Peças'),
                  th('Área m²'),
                  th('Fita'),
                  th('Custo mat.'),
                  th('Margem %'),
                  th('Venda un.'),
                  th('Total venda')
                ])
              ]),
              h(
                'tbody',
                {},
                items.map((f) => {
                  const s = saleCalc(f)
                  const def = f.margin === undefined || f.margin === null
                  return h('tr', {}, [
                    td(swatch(f.color)),
                    td(h('div', { class: 'cell-item' }, [h('strong', {}, [`[${f.code}] ${f.name}`]), h('span', {}, [modelMeta(f).label + (s.qty > 1 ? ` ×${s.qty}` : '')])])),
                    td(String(s.qty)),
                    td(String(s.pieceCount)),
                    td(s.areaM2.toFixed(3)),
                    td(formatMeters(s.tapeM)),
                    td(h('span', { title: `Painel ${formatMoney(s.panel)} · fita ${formatMoney(s.tape)} · mão de obra ${formatMoney(s.labor)}` }, [formatMoney(s.cost)])),
                    td(
                      h('div', { class: 'margin-cell' }, [
                        h('input', {
                          type: 'number',
                          class: 'margin-input' + (def ? ' def' : ''),
                          min: '0',
                          step: '5',
                          value: s.margin,
                          title: def ? 'Usando a margem padrão do projeto' : 'Margem própria deste item',
                          onChange: (e) => {
                            const v = Number(e.target.value)
                            if (Number.isFinite(v) && e.target.value !== '') updateFurniture(f.id, { margin: v })
                            else {
                              const it = mutableItem(f.id)
                              if (it) delete it.margin
                              persist()
                            }
                          }
                        })
                      ])
                    ),
                    td(h('strong', {}, [formatMoney(s.salePerUnit)])),
                    td(h('strong', { class: 'gold' }, [formatMoney(s.lineTotal)]))
                  ])
                })
              )
            ])
          ])
        : h('p', { class: 'help' }, ['Nenhum móvel ainda — adicione itens na aba Orçamento.'])
    ]),
    h('div', { class: 'cost-sheet row', style: 'margin-bottom:0' }, [
      moneyStat(
        'Custo total da obra (estimado)',
        formatMoney(t.cost),
        projectBillingBasis() === 'rateio'
          ? 'Soma dos itens já com a sobra das chapas rateada — confere com o fechamento abaixo.'
          : 'Soma do material usado por item + mão de obra.',
        ''
      ),
      moneyStat('Valor de venda (orçamento)', formatMoney(t.sale), 'O que será apresentado ao cliente.'),
      moneyStat('Lucro previsto', formatMoney(t.profit), t.cost > 0 ? `${((t.profit / t.cost) * 100).toFixed(0)}% sobre o custo` : '', 'accent')
    ]),
    closingCard()
  ])
}

function moneyStat(label, value, helpText, cls) {
  return h('div', { class: 'money-stat card' + (cls ? ' ' + cls : '') }, [
    h('label', {}, [label]),
    h('strong', {}, [value]),
    helpText ? h('span', { class: 'help' }, [helpText]) : null
  ])
}

function closingCard() {
  const s = summaryCache
  const set = state.settings
  const basis = projectBillingBasis()
  return h('div', { class: 'card' }, [
    h('h2', {}, ['Fechamento da obra (custo real de chapa)']),
    costLine('Chapas compradas', `${s.sheets} × ${formatMoney(Number(set.sheetPrice || 0))}`, formatMoney(s.sheetCost)),
    costLine('Fita de borda', `${formatMeters(s.tapeM)} × ${formatMoney(Number(set.tapePricePerMeter || 0))}/m`, formatMoney(s.tapeCost)),
    Number(set.laborPercent)
      ? costLine('Mão de obra / perda extra', `${set.laborPercent}% sobre material`, formatMoney(s.labor || 0))
      : null,
    costLine('Área das peças', formatM2(s.areaM2), ''),
    costLine('Área das chapas', formatM2(s.sheetAreaM2), ''),
    costLine('Sobra (área útil)', formatM2(s.wasteM2), ''),
    costLine('Aproveitamento', `${s.efficiency.toFixed(1)}%`, ''),
    costLine('Peças não posicionadas', String(s.unplaced), ''),
    h('p', { class: 'help' }, [
      basis === 'rateio'
        ? 'Base de cobrança "incluir custo das sobras": os valores por item (aba acima) somam exatamente este total de produção.'
        : 'Este é o custo de produção real (chapa inteira). A diferença para a soma por item é a perda/sobra do encaixe.'
    ]),
    h('div', { class: 'cost-total' }, [h('span', {}, ['TOTAL (material + mão de obra)']), h('span', {}, [formatMoney(s.total)])])
  ])
}

function costLine(a, b, c) {
  return h('div', { class: 'cost-line' }, [h('span', {}, [a]), h('span', {}, [b + (c ? '   ' + c : '')])])
}

/* ============================== ABA PEÇAS ============================== */

function tabPecas() {
  const grouped = {}
  for (const p of piecesCache) {
    const key = p.furnitureId || 'x'
    if (!grouped[key]) grouped[key] = { meta: p, rows: [] }
    grouped[key].rows.push(p)
  }
  const blocks = Object.values(grouped).map((g) =>
    h('div', { class: 'card' }, [
      h('h2', {}, [swatch(g.meta.color, true), [` [${g.meta.furnitureCode}] ${g.meta.furnitureName}`]]),
      h('div', { style: 'overflow:auto' }, [
        h('table', {}, [
          h('thead', {}, [h('tr', {}, [th('Peça'), th('L mm'), th('A mm'), th('Esp.'), th('Qtd'), th('Veio'), th('Área'), th('Fita')])]),
          h(
            'tbody',
            {},
            g.rows.map((p) =>
              h('tr', {}, [
                td(p.name),
                td(String(p.length)),
                td(String(p.width)),
                td(String(p.thickness)),
                td(String(p.qty)),
                td(GRAIN[p.grain] || p.grain),
                td(formatM2(pieceAreaM2(p))),
                td(formatMeters(edgeMeters(p)))
              ])
            )
          )
        ])
      ])
    ])
  )
  return h('div', {}, [
    kpis(),
    blocks.length ? blocks : [h('div', { class: 'card' }, [h('p', { class: 'help' }, ['Adicione móveis para gerar a lista de peças.'])])]
  ])
}

/* ============================== ABA CORTE ============================== */

function tabCorte() {
  const layout = layoutCache
  const s = state.settings
  return h('div', {}, [
    kpis(),
    h('div', { class: 'card' }, [
      h('h2', {}, ['Plano de corte do projeto']),
      h('p', { class: 'help' }, [
        layout.sheetsNeeded
          ? `${layout.sheetsNeeded} chapa(s) · aproveitamento ${layout.efficiency.toFixed(1)}% · modo ${s.cutMode === 'free' ? 'nesting livre' : 'serra / guilhotina'} · kerf ${s.kerf} mm. Cores = móvel.`
          : 'Adicione móveis para gerar o nesting.'
      ]),
      legend(),
      layout.unplaced.length
        ? h('p', { class: 'unplaced' }, [
            `${layout.unplaced.length} peça(s) não cabem na chapa: ${layout.unplaced.map((x) => `[${x.furnitureCode}] ${x.name}`).join(', ')}`
          ])
        : null
    ]),
    h(
      'div',
      { class: 'sheet-wrap' },
      layout.boards.length ? layout.boards.map((board) => sheetEl(board)) : [h('p', { class: 'help' }, ['Nenhuma chapa gerada.'])]
    )
  ])
}

function legend() {
  const items = furnitureList()
  if (!items.length) return null
  return h(
    'div',
    { class: 'legend' },
    items.map((f) =>
      h('span', { class: 'legend-item' }, [swatch(f.color), `[${f.code}] ${f.name}`])
    )
  )
}

function sheetEl(board) {
  const maxW = Math.min(920, window.innerWidth - 80)
  const scale = maxW / board.sheetWidth
  const w = board.sheetWidth * scale
  const hgt = board.sheetHeight * scale
  const sheet = h('div', {
    class: 'sheet',
    style: `width:${w}px;height:${hgt}px`
  })
  board.placements.forEach((p) => {
    const box = h(
      'div',
      {
        class: 'piece-box',
        style: [
          `left:${(board.trim + p.x) * scale}px`,
          `top:${(board.trim + p.y) * scale}px`,
          `width:${p.w * scale}px`,
          `height:${p.h * scale}px`,
          `background:${p.color || '#5c4033'}`
        ].join(';')
      },
      [
        h('b', {}, [[`[${p.furnitureCode || '?'}] `, p.name, p.rotated ? ' ↻' : '']]),
        h('span', {}, [`${Math.round(p.w)} × ${Math.round(p.h)} mm`])
      ]
    )
    sheet.append(box)
  })
  return h('div', { style: 'margin-bottom:18px' }, [
    h('h3', {}, [`Chapa ${board.index} · ${board.thickness || '—'} mm — ${board.efficiency.toFixed(1)}% · ${board.placements.length} peças`]),
    sheet
  ])
}

/* ============================== ABA CONFIG ============================== */

function tabConfig() {
  const s = state.settings
  const set = (patch) => {
    Object.assign(state.settings, patch)
    persist()
  }
  return h('div', {}, [
    h('div', { class: 'card' }, [
      h('h2', {}, ['Empresa e venda']),
      h('div', { class: 'row' }, [
        field('Nome da empresa (no orçamento)', text(s.shopName || '', (v) => set({ shopName: v })), 'grow'),
        field('Telefone / WhatsApp', text(s.shopPhone || '', (v) => set({ shopPhone: v })))
      ]),
      h('div', { class: 'row', style: 'margin-top:10px' }, [
        field('Margem padrão sobre o custo %', inputNum(s.defaultMargin ?? 100, (v) => set({ defaultMargin: v }), { step: '5' }), 'grow'),
        field('% extra (mão de obra)', inputNum(s.laborPercent || 0, (v) => set({ laborPercent: v }), { step: '0.5' }))
      ]),
      h('p', { class: 'help' }, [
        'A margem padrão vale para todos os itens, mas cada móvel pode ter a própria margem na aba Custos. O % extra (mão de obra / perda) entra no custo de cada item.'
      ]),
      h('p', { class: 'help' }, [
        'O WhatsApp informado aparece no documento do orçamento com um QR code: ao escanear, o cliente já abre a conversa com o nome e o valor deste orçamento.'
      ])
    ]),
    h('div', { class: 'card' }, [
      h('h2', {}, ['Chapa e corte']),
      h('div', { class: 'row' }, [
        field('Nome da chapa', text(s.sheetName, (v) => set({ sheetName: v })), 'grow'),
        field('Largura mm', inputNum(s.sheetWidth, (v) => set({ sheetWidth: v }))),
        field('Altura mm', inputNum(s.sheetHeight, (v) => set({ sheetHeight: v }))),
        field('Espessura mm', inputNum(s.sheetThickness, (v) => set({ sheetThickness: v }))),
        field('Preço da chapa', inputNum(s.sheetPrice, (v) => set({ sheetPrice: v }), { step: '0.01' }))
      ]),
      h('div', { class: 'row', style: 'margin-top:10px' }, [
        field('Kerf (serra) mm', inputNum(s.kerf, (v) => set({ kerf: v }), { step: '0.1' })),
        field('Refilo mm', inputNum(s.trim, (v) => set({ trim: v }))),
        field(
          'Modo de corte',
          h(
            'select',
            { onChange: (e) => set({ cutMode: e.target.value }) },
            Object.entries(CUT_MODES).map(([k, label]) => h('option', { value: k, selected: s.cutMode === k }, [label]))
          )
        )
      ]),
      h('p', { class: 'help' }, [
        'Kerf é a perda da serra. Refilo reserva a borda da chapa. Serra/guilhotina gera faixas. Nesting livre encaixa melhor.'
      ])
    ]),
    h('div', { class: 'card' }, [
      h('h2', {}, ['Fita de borda']),
      h('div', { class: 'row' }, [
        field('Nome da fita', text(s.tapeName, (v) => set({ tapeName: v })), 'grow'),
        field('Preço por metro', inputNum(s.tapePricePerMeter, (v) => set({ tapePricePerMeter: v }), { step: '0.01' }))
      ])
    ])
  ])
}

/* ============================== barra superior / render ============================== */

function tabsDef() {
  return [
    ['orcamento', 'Orçamento'],
    ['custos', 'Custos'],
    ['pecas', 'Peças'],
    ['corte', 'Corte'],
    ['config', 'Config']
  ]
}

function topActions(p) {
  const btns = [h('button', { class: 'btn', title: 'Baixar CSV com todas as peças do projeto', onClick: () => exportCsv(p, piecesCache) }, ['CSV peças'])]
  if (tab === 'orcamento') {
    btns.unshift(
      h('button', { class: 'btn primary', title: 'Imprimir ou salvar em PDF apenas o orçamento do cliente', onClick: () => window.print() }, ['Imprimir / PDF']),
      h('button', { class: 'btn', title: 'PDF interno com plano de corte', onClick: () => exportPdf(p, state.settings, layoutCache, summaryCache, piecesCache) }, ['PDF plano'])
    )
  } else if (tab === 'corte') {
    btns.unshift(h('button', { class: 'btn', title: 'PDF interno com plano de corte', onClick: () => exportPdf(p, state.settings, layoutCache, summaryCache, piecesCache) }, ['PDF plano']))
  }
  return btns
}

function render() {
  const root = document.getElementById('app')
  const scroller = document.scrollingElement || document.documentElement
  const scrollTop = scroller.scrollTop
  const prevActive = document.activeElement
  const prevTag = prevActive ? prevActive.tagName : ''
  const isEdit = prevTag === 'INPUT' || prevTag === 'SELECT' || prevTag === 'TEXTAREA'
  const prevKey = isEdit && prevActive.getAttribute ? prevActive.getAttribute('data-k') : null
  const prevSel = isEdit && prevTag === 'INPUT' ? prevActive.selectionStart : null
  const modalBodyEl = document.querySelector('.modal-body')
  const modalScrollTop = modalBodyEl ? modalBodyEl.scrollTop : 0
  root.innerHTML = ''
  const p = project()
  if (!selectedFurnitureId && furnitureList()[0]) selectedFurnitureId = furnitureList()[0].id

  const body =
    tab === 'orcamento'
      ? tabOrcamento()
      : tab === 'custos'
        ? tabCustos()
        : tab === 'pecas'
          ? tabPecas()
          : tab === 'corte'
            ? tabCorte()
            : tabConfig()

  const mobile = isMobileNow()
  root.append(
    h('div', { class: 'app' }, [
      mobile
        ? h('button', { class: 'scrim' + (drawerOpen ? ' show' : ''), onClick: closeDrawer, 'aria-label': 'Fechar lista de projetos', title: 'Fechar' }, [])
        : null,
      renderSidebar(mobile && drawerOpen),
      h('section', { class: 'main' }, [
        h('div', { class: 'topbar' }, [
          mobile ? h('button', { class: 'menu-btn', onClick: openDrawer, 'aria-label': 'Projetos e ações', title: 'Projetos / orçamentos' }, ['☰']) : null,
          h('div', { class: 'top-title' }, [
            h('strong', {}, [p.name]),
            h('span', {}, [`${(p.furniture || []).length} móvel(is) · ${(p.client && p.client) || 'sem cliente'} · `, new Date(p.createdAt).toLocaleDateString('pt-BR')])
          ]),
          h('div', { class: 'tabs', role: 'tablist' }, tabsDef().map(([id, label]) =>
            h(
              'button',
              { class: 'tab' + (tab === id ? ' active' : ''), onClick: () => { tab = id; refresh() } },
              [label]
            )
          )),
          h('div', { class: 'actions' }, topActions(p))
        ]),
        h('div', { class: 'content' }, [body]),
        tab === 'orcamento' && !modal ? fabButton() : null,
        mobile && !modal ? mobileNav() : null
      ])
    ])
  )
  if (modal) {
    root.append(
      modal.kind === 'pick'
        ? pickerModal()
        : modal.kind === 'auth'
          ? authModal()
          : modal.kind === 'upgrade'
            ? upgradeModal()
            : editorModal()
    )
  }
  if (isEdit) {
    scroller.scrollTop = scrollTop
    if (prevKey) {
      const restored = root.querySelector(`[data-k="${prevKey}"]`)
      if (restored) {
        restored.focus()
        if (prevTag === 'INPUT' && prevSel != null) {
          try {
            restored.setSelectionRange(prevSel, prevSel)
          } catch {
            /* número sem caret */
          }
        }
      }
    }
  }
  if (modal && modalScrollTop > 0) {
    const nb = root.querySelector('.modal-body')
    if (nb) nb.scrollTop = modalScrollTop
  }
  document.body.style.overflow = modal ? 'hidden' : ''
}

function fabButton() {
  return h('button', { class: 'fab', onClick: openModalNew, title: 'Adicionar móvel ao orçamento' }, ['+'])
}

let appStarted = false
let currentScreen = null

function showScreen() {
  const desired = location.hash.startsWith('#/app') ? 'app' : 'landing'
  if (currentScreen === desired) return
  currentScreen = desired
  const root = document.getElementById('app')
  document.body.style.overflow = ''
  if (desired === 'app') {
    document.body.classList.remove('landing-mode')
    if (!appStarted) {
      appStarted = true
      recalc()
      render()
      if (cloudConfigured()) {
        setAuthListener((u) => {
          authUser = u
          if (u) syncAfterLogin()
          else render()
        })
        cloudInit()
      }
    } else {
      recalc()
      render()
    }
  } else {
    document.body.classList.add('landing-mode')
    root.innerHTML = ''
    root.insertAdjacentHTML('afterbegin', landingHTML())
  }
}

window.addEventListener('resize', () => {
  if (currentScreen === 'app' && (tab === 'corte' || tab === 'pecas' || tab === 'orcamento')) render()
})
window.addEventListener('hashchange', showScreen)

showScreen()
