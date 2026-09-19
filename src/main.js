import './styles.css'
import {
  loadState,
  saveState,
  guestState,
  blankProject,
  blankPiece,
  GRAIN,
  CUT_MODES,
  THICKNESS_PRESETS,
  SHEET_PRESETS,
  TAPE_PRESETS,
  sheetSpecs,
  newId,
  formatMoney,
  formatM2,
  formatMeters,
  formatMm
} from './store.js'
import { nest, summarize, cutSequence, edgeMeters, pieceAreaM2, overlapGap, placementFits, applyManualMoves, largestFreeRect, tightenBoard } from './nesting.js'
import { exportCsv, exportCorteCloud, exportPdf, exportPlanPng, htmlPagesToPdfBlob, quoteFilename, savePdfFile } from './export.js'
import {
  CATALOG_GROUPS,
  modelMeta,
  modelByTypeVariant,
  createFurniture,
  fieldsFor,
  flattenProjectPieces,
  furnitureSummaryLine,
  hardwareCounts,
  PUXADOR_LABEL,
  ACCESSORY_KEYS
} from './catalog.js'
import { schematicSvg } from './schematic.js'
import { saleCalc as calcItemSale, projectTotals as calcProjectTotals, rateioCtx as calcRateioCtx, panelPricePerM2, sheetAreaM2 } from './pricing.js'
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
import { landingHTML, termosHTML, privacidadeHTML, initLanding, stopLanding } from './landing.js'
import {
  PLANS,
  ONCE_PLANS,
  freeProjectLimit,
  loadPlanConfig,
  planLabel,
  isLimitedPlan,
  effectivePlan,
  billingConfigured,
  ADMIN_EMAIL,
  ADMIN_ALIAS,
  subscribePlan,
  checkoutOnceInfinity,
  confirmInfinity,
  syncSubscription,
  cancelSubscription,
  supportHref,
  supportLabel
} from './billing.js'
import qrcode from 'qrcode-generator'
qrcode.stringToBytes =
  typeof TextEncoder !== 'undefined'
    ? (s) => Array.from(new TextEncoder().encode(s))
    : (s) => Array.from(s, (ch) => ch.charCodeAt(0) & 0xff)

const state = loadState()
let tab = 'projetos'
let lastRenderTab = null
let selectedFurnitureId = null
let layoutCache = null
let summaryCache = null
let piecesCache = []
let saleCtx = null
let catalogQuery = ''
let modal = null
let editorLView = 'planta'
let editorStep = 0
let listFocusId = null
let printFull = false
let authUser = null
let syncTimer = null
let lastSyncAt = 0
let lastSyncOk = true
let shareBusy = false
let tourStep = 0
let saveToastTimer = null
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

function emptyLayout() {
  return { boards: [], unplaced: [], sheetsNeeded: 0, efficiency: 0, wasteArea: 0 }
}
function emptySummary() {
  return {
    sheets: 0,
    efficiency: 0,
    pieceCount: 0,
    tapeM: 0,
    areaM2: 0,
    total: 0,
    sheetCost: 0,
    tapeCost: 0,
    labor: 0,
    sheetAreaM2: 0,
    wasteM2: 0,
    unplaced: 0,
    byFurniture: []
  }
}
function recalc() {
  const p = project()
  if (!p) {
    piecesCache = []
    layoutCache = emptyLayout()
    summaryCache = emptySummary()
    saleCtx = null
    return
  }
  piecesCache = flattenProjectPieces(p)
  layoutCache = nest(piecesCache, state.settings)
  applyManualMoves(layoutCache, state.settings.cutMode === 'manual' ? p.manual : null)
  summaryCache = summarize(p, state.settings, layoutCache, piecesCache)
  saleCtx = calcRateioCtx(furnitureList(), state.settings, layoutCache.sheetsNeeded, p.billingBasis || 'used', layoutCache)
}
function persist(opts) {
  saveState(state)
  scheduleCloud()
  if (!(opts && opts.silent)) showSavedToast()
  recalc()
  render()
}
function scheduleCloud() {
  if (!cloudConfigured() || !authUser) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    Promise.resolve(schedulePush(state))
      .then(() => {
        lastSyncAt = Date.now()
        lastSyncOk = true
        const chip = document.querySelector('.account-txt span')
        if (chip) chip.textContent = syncLabel()
      })
      .catch(() => {
        lastSyncOk = false
      })
  }, 500)
}
function syncLabel() {
  if (!authUser) return 'Entre ou crie uma conta para sincronizar os orçamentos.'
  if (!lastSyncAt) return authUser.email || 'Sincronizando…'
  if (!lastSyncOk) return 'Falha ao salvar. Tente de novo.'
  const mins = Math.max(0, Math.round((Date.now() - lastSyncAt) / 60000))
  if (mins < 1) return 'Salvo na nuvem agora'
  if (mins === 1) return 'Salvo na nuvem há 1 min'
  return `Salvo na nuvem há ${mins} min`
}
function refresh() {
  render()
}

/* ============================== projetos ============================== */

function setActive(id) {
  state.activeProjectId = id
  selectedFurnitureId = (project()?.furniture || [])[0]?.id || null
  modal = null
  listFocusId = null
  tab = 'orcamento'
  persist({ silent: true })
}

function addProject() {
  if (!guardProjectSlots()) return
  const p = blankProject()
  state.projects.unshift(p)
  state.activeProjectId = p.id
  selectedFurnitureId = null
  listFocusId = null
  tab = 'orcamento'
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
  listFocusId = null
  tab = 'orcamento'
  persist()
}

function removeProject(id) {
  if (state.projects.length <= 1) return
  state.projects = state.projects.filter((p) => p.id !== id)
  if (state.activeProjectId === id) state.activeProjectId = state.projects[0].id
  listFocusId = null
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

function liveProject(patch) {
  Object.assign(project(), patch)
  saveState(state)
  scheduleCloud()
  showSavedToast(true)
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
  if (listFocusId === id) listFocusId = null
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

function moneyForProject(p) {
  const furniture = (p && p.furniture) || []
  const pieces = flattenProjectPieces(p)
  const layout = nest(pieces, state.settings)
  const ctx = calcRateioCtx(furniture, state.settings, layout.sheetsNeeded, (p && p.billingBasis) || 'used', layout)
  return calcProjectTotals(furniture, state.settings, ctx)
}

function clientWaDigits(p) {
  return String((p && p.phone) || '').replace(/\D/g, '')
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
  return calcItemSale(item, state.settings, calcRateioCtx(list, state.settings, lay.sheetsNeeded, 'rateio', lay))
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
    const totalW = W + (numP(p, 'retDepth') ? Math.round(numP(p, 'retDepth') || 0) : 0)
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
    out.push(...accessoryBullets(item))
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
  out.push(...accessoryBullets(item))
  return out
}

function hardwareHelp(s) {
  const n = Number(s.hardware || 0)
  if (!(n > 0)) return 'Sem ferragens neste item.'
  const bits = []
  if (s.hinges) bits.push(`${s.hinges} dobradiça(s)`)
  if (s.slides) bits.push(`${s.slides} par(es) de corrediça`)
  if (s.handles) bits.push(`${s.handles} puxador(es)`)
  if (s.tracks) bits.push(`${s.tracks} trilho(s)`)
  if (s.feetBuy) bits.push(`${s.feetBuy} pé(s) comprado(s)`)
  return `Ferragens ${formatMoney(n)}${bits.length ? ' · ' + bits.join(' · ') : ''}.`
}

function hardwareTotalLine() {
  const items = furnitureList()
  let total = 0
  for (const f of items) total += Number(saleCalc(f).hardware || 0) * Math.max(1, Number(f.qty) || 1)
  if (!(total > 0)) return null
  return costLine('Ferragens e acessórios', 'dobradiça, corrediça, puxador, trilho e pé comprado', formatMoney(total))
}

function accessoryBullets(item) {
  const p = item.params || {}
  const out = []
  const pe = p.pe || 'nenhum'
  if (pe !== 'nenhum') {
    const n = Math.max(1, qtyInt(p.peQty) || 4)
    const h = Math.round(numP(p, 'peH', 80))
    if (pe === 'sapatinha') out.push(`${n} sapatinha${n === 1 ? '' : 's'} de MDF (${h} mm)`)
    else if (pe === 'regulavel') out.push(`${n} pé${n === 1 ? '' : 's'} regulável${n === 1 ? '' : 'is'}`)
    else if (pe === 'rodizio') out.push(`${n} rodízio${n === 1 ? '' : 's'}`)
  }
  const px = p.puxador || 'nenhum'
  if (px === 'perfil') out.push('Puxador perfil / cava')
  else if (px !== 'nenhum') out.push(`Puxador ${String(PUXADOR_LABEL[px] || px).toLowerCase()}`)
  const hw = hardwareCounts(item)
  if (hw.hinges) out.push(`${hw.hinges} ${hw.hinges === 1 ? 'dobradiça' : 'dobradiças'}`)
  if (hw.slides) out.push(`${hw.slides} ${hw.slides === 1 ? 'par de corrediça' : 'pares de corrediça'}`)
  if (hw.tracks) out.push(`${hw.tracks === 1 ? 'Trilho de correr' : hw.tracks + ' trilhos de correr'}`)
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
  if ((tag === 'input' || tag === 'select' || tag === 'textarea') && attrs['data-k'] == null) {
    el.dataset.k = 'k' + ++focusSeq
  }
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

function presetRow(label, options, onPick) {
  return h('div', { class: 'preset-row' }, [
    h('span', { class: 'preset-label' }, [label]),
    ...options.map((opt) => {
      const text = typeof opt === 'string' ? opt : opt.label
      return h('button', { class: 'preset-chip', type: 'button', onClick: () => onPick(opt) }, [text])
    })
  ])
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

let toastTimer = null

function showToast(message, kind, ms) {
  const el = document.createElement('div')
  el.className = 'app-toast' + (kind ? ' ' + kind : '')
  el.textContent = message
  document.body.append(el)
  requestAnimationFrame(() => el.classList.add('show'))
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    el.classList.remove('show')
    setTimeout(() => el.remove(), 220)
  }, ms || 3200)
}

function hideToast() {
  document.querySelectorAll('.app-toast').forEach((el) => el.remove())
}

function confirmModal(message, opts) {
  const o = opts || {}
  return new Promise((resolve) => {
    const backdrop = h('div', { class: 'modal-backdrop' })
    const box = h('div', { class: 'modal modal-confirm' })
    function done(val) {
      document.removeEventListener('keydown', onKey)
      backdrop.remove()
      resolve(val)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') done(false)
    }
    const confirm = h(
      'button',
      {
        class: 'btn ' + (o.danger ? 'danger' : 'primary'),
        type: 'button',
        onClick: () => done(true)
      },
      [o.confirmLabel || 'Confirmar']
    )
    box.append(
      h('div', { class: 'modal-head' }, [
        h('h2', {}, [o.title || 'Confirmar']),
        h('button', { class: 'btn small ghost x', type: 'button', onClick: () => done(false) }, ['✕'])
      ]),
      h('div', { class: 'modal-body' }, [
        o.icon ? h('div', { class: 'confirm-icon' }, [o.icon]) : null,
        h('p', { class: 'confirm-msg' }, [message])
      ]),
      h('div', { class: 'modal-foot' }, [
        h('button', { class: 'btn', type: 'button', onClick: () => done(false) }, [o.cancelLabel || 'Cancelar']),
        confirm
      ])
    )
    backdrop.append(box)
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) done(false)
    })
    document.addEventListener('keydown', onKey)
    document.body.append(backdrop)
    setTimeout(() => confirm.focus(), 0)
  })
}

/* ============================== mobile ============================== */

const MOBILE_QUERY = '(max-width: 900px)'
function isMobileNow() {
  try {
    return !!(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches)
  } catch (e) {
    return false
  }
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
function selectTab(id) {
  tab = id
  if (id === 'orcamento') listFocusId = null
  refresh()
}
function mobileNav() {
  return h(
    'nav',
    { class: 'mobile-nav', 'aria-label': 'Navegação' },
    tabsDef().map(([id, label]) =>
      h(
        'button',
        { class: 'mnav' + (tab === id ? ' active' : ''), onClick: () => selectTab(id) },
        [label]
      )
    )
  )
}
function sideNav() {
  const item = (id, label) =>
    h('button', { class: 'snav' + (tab === id ? ' active' : ''), onClick: () => selectTab(id) }, [label])
  return h('aside', { class: 'sidebar', 'aria-label': 'Navegação' }, [
    h('div', { class: 'brand' }, [h('span', { class: 'mark' }, ['MDF ATELIER']), h('h1', {}, ['MDF Atelier'])]),
    h('nav', { class: 'side-nav' }, [
      ...tabsDef().map(([id, label]) => item(id, label)),
      h('div', { class: 'side-sep' }),
      item('config', 'Configurações')
    ])
  ])
}

/* ============================== nuvem (Supabase) ============================== */

function currentPlan() {
  return effectivePlan(state.settings && state.settings.plan, state.settings && state.settings.planExpiresAt)
}
function planLimited() {
  if (!authUser) return true
  return isLimitedPlan(currentPlan())
}
function guardProjectSlots() {
  if (!planLimited()) return true
  if (state.projects.length >= freeProjectLimit()) {
    openUpgrade(
      `Você está no plano Grátis (limite de ${freeProjectLimit()} orçamentos). No Pro os orçamentos são ilimitados.`
    )
    return false
  }
  return true
}
function openUpgrade(message, plan) {
  modal = { kind: 'upgrade', msg: message || '', pick: plan || '3m' }
  render()
}

function accountMenu() {
  const plan = currentPlan()
  const contaBtn = h(
    'button',
    { class: 'btn small' + (tab === 'conta' ? ' primary' : ' ghost'), onClick: () => selectTab('conta') },
    ['Conta']
  )
  if (authUser) {
    return h('div', { class: 'account-menu' }, [
      h('div', { class: 'account-txt' }, [
        h('strong', {}, [planLabel(plan)]),
        h('span', {}, [authUser.email || syncLabel()])
      ]),
      isLimitedPlan(plan)
        ? h('a', { class: 'btn small ghost', href: '#/' }, ['Site'])
        : null,
      isLimitedPlan(plan)
        ? h('button', { class: 'btn small primary', onClick: () => openUpgrade('Faça upgrade para criar quantos orçamentos quiser.') }, ['Upgrade'])
        : null,
      contaBtn,
      h('button', { class: 'btn small ghost', onClick: cloudLogout }, ['Sair'])
    ])
  }
  const enter = cloudConfigured()
    ? h('button', { class: 'btn small primary', onClick: openAuth }, ['Entrar'])
    : null
  return h('div', { class: 'account-menu' }, [
    h('a', { class: 'btn small ghost', href: '#/' }, ['Site']),
    contaBtn,
    enter
  ])
}

function openAuth() {
  modal = { kind: 'auth' }
  render()
}

function resetToGuest() {
  const fresh = guestState()
  state.settings = fresh.settings
  state.projects = fresh.projects
  state.activeProjectId = fresh.activeProjectId
  selectedFurnitureId = null
  listFocusId = null
  modal = null
  tab = 'projetos'
  lastSyncAt = 0
  lastSyncOk = true
  saveState(state)
  recalc()
}

async function cloudLogout() {
  clearTimeout(syncTimer)
  authUser = null
  modal = null
  resetToGuest()
  hideToast()
  const r = await cloudSignOut()
  if (r.error) console.warn(r.error)
  authUser = null
  render()
}

function showSavedToast(debounce) {
  const run = () => {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    showToast(`Orçamento salvo automaticamente às ${hh}:${mm}`, 'ok', 2200)
  }
  clearTimeout(saveToastTimer)
  if (debounce) {
    saveToastTimer = setTimeout(run, 700)
    return
  }
  run()
}

function applyCloudData(data) {
  if (data.settings) state.settings = { ...state.settings, ...data.settings }
  const incoming = data.projects || []
  const localManual = new Map((state.projects || []).map((p) => [p.id, p.manual]))
  state.projects = incoming.map((p) => ({
    ...p,
    manual: p.manual && Object.keys(p.manual).length ? p.manual : localManual.get(p.id) || {}
  }))
  state.activeProjectId = data.activeProjectId || (incoming[0] && incoming[0].id)
  selectedFurnitureId = null
  modal = null
  persist({ silent: true })
}

function isAdminEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase() === ADMIN_EMAIL
}

async function syncAfterLogin() {
  if (isAdminEmail(authUser && authUser.email)) {
    location.href = 'admin.html'
    return
  }
  try {
    const data = await pullState()
    if (data && data.settings) {
      state.settings = { ...state.settings, ...data.settings }
    }
    if (data && data.projects.length) {
      applyCloudData(data)
    } else {
      await schedulePush(state)
    }
    lastSyncAt = Date.now()
    lastSyncOk = true
  } catch (err) {
    lastSyncOk = false
    console.warn('sync', err)
  }
  render()
}

function hashHasPlanOk() {
  return /[?&]plano=ok(?:&|$)/.test(location.hash || '') || /[?&]plano=ok(?:&|$)/.test(location.search || '')
}

function applyPlanPayload(r) {
  if (!r) return false
  if (r.plan) state.settings.plan = r.plan
  if (r.plan_expires_at) state.settings.planExpiresAt = r.plan_expires_at
  saveState(state)
  render()
  return !isLimitedPlan(currentPlan())
}

function consumePlanReturn() {
  if (!hashHasPlanOk()) return
  if (!authUser) {
    if (cloudConfigured()) return
    history.replaceState(null, '', (location.pathname || '/') + '#/app')
    openAuth()
    return
  }
  history.replaceState(null, '', (location.pathname || '/') + '#/app')
  if (!billingConfigured()) return
  let tries = 0
  const run = () => {
    tries += 1
    syncSubscription(authUser.id)
      .then((r) => {
        if (applyPlanPayload(r)) return
        if (tries < 4) setTimeout(run, 4000)
      })
      .catch(() => {
        if (tries < 4) setTimeout(run, 4000)
      })
  }
  run()
}

function queryParams() {
  const out = {}
  const dec = (s) => {
    try {
      return decodeURIComponent(s)
    } catch {
      return s
    }
  }
  const add = (qs) => {
    String(qs || '').split(/[&?]/).forEach((pair) => {
      const i = pair.indexOf('=')
      if (i > 0) {
        const k = dec(pair.slice(0, i))
        const v = dec(pair.slice(i + 1))
        if (k && v) out[k] = v
      }
    })
  }
  add((location.search || '').replace(/^\?/, ''))
  const hash = (location.hash || '').replace(/^#/, '')
  if (hash.indexOf('?') >= 0) add(hash.slice(hash.indexOf('?') + 1))
  if (hash.indexOf('&') >= 0) add(hash.slice(hash.indexOf('&') + 1))
  return out
}

function infinityOrderFromUrl() {
  const q = queryParams()
  if (!q.order_nsu) return null
  return {
    order_nsu: q.order_nsu,
    transaction_nsu: q.transaction_nsu,
    slug: q.slug,
    capture_method: q.capture_method
  }
}

function consumeInfinityReturn() {
  const order = infinityOrderFromUrl()
  if (!order) return
  if (!authUser) {
    if (cloudConfigured()) return
    history.replaceState(null, '', (location.pathname || '/') + '#/app')
    openAuth()
    return
  }
  history.replaceState(null, '', (location.pathname || '/') + '#/app')
  if (!billingConfigured()) return
  let tries = 0
  const run = () => {
    tries += 1
    confirmInfinity(authUser.id, order)
      .then((r) => {
        if (applyPlanPayload(r)) {
          showToast('Pagamento confirmado. Pro liberado!', 'ok')
          return
        }
        if (tries < 6) setTimeout(run, 3000)
      })
      .catch(() => {
        if (tries < 6) setTimeout(run, 3000)
      })
  }
  run()
}

function consumeUpgradeIntent() {
  const m = (location.hash || '').match(/[?&]upgrade=(pro|ultra)(?:&|$)/)
  if (!m) return
  history.replaceState(null, '', (location.pathname || '/') + '#/app')
  openUpgrade('Plano Pro: orçamentos ilimitados e a logo da sua marcenaria no documento.')
}

function authModal() {
  const email = h('input', {
    type: 'email',
    name: 'email',
    class: 'doc-input',
    placeholder: 'voce@marcenaria.com',
    autocomplete: 'username',
    inputmode: 'email',
    enterkeyhint: 'next',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    'data-k': 'auth-email'
  })
  const pass = h('input', {
    type: 'password',
    name: 'password',
    class: 'doc-input',
    placeholder: 'senha',
    autocomplete: 'current-password',
    enterkeyhint: 'done',
    'data-k': 'auth-pass'
  })
  const msgEl = h('div', { class: 'auth-msg' }, [])
  const setMsg = (text, kind) => {
    msgEl.textContent = text || ''
    msgEl.className = 'auth-msg' + (kind ? ' ' + kind : '')
  }
  const run = async (mode) => {
    const raw = email.value.trim()
    const emailV = raw.toLowerCase() === ADMIN_ALIAS ? ADMIN_EMAIL : raw
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
        h('form', {
          class: 'auth-box',
          autocomplete: 'on',
          onSubmit: (e) => {
            e.preventDefault()
            run('in')
          }
        }, [
          field('E-mail', email),
          field('Senha', pass),
          msgEl,
          h('div', { class: 'row' }, [
            h('button', { type: 'submit', class: 'btn primary' }, ['Entrar']),
            h('button', { type: 'button', class: 'btn', onClick: () => run('up') }, ['Criar conta'])
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
  const msgEl = h('div', { class: 'auth-msg' + (m.payKind ? ' ' + m.payKind : '') }, [m.payMsg || ''])
  const go = (url, test) => {
    if (!test.test(url)) {
      let host = url
      try {
        host = new URL(url).host
      } catch (e) {
        /* mantém a url crua */
      }
      throw new Error(`O pagamento devolveu um link inesperado (${host}). Avise o suporte.`)
    }
    console.info('[billing] abrindo checkout', url)
    location.href = url
  }
  const needAuth = () => {
    if (authUser) return true
    modal = { kind: 'auth' }
    render()
    return false
  }
  const needBilling = () => {
    if (billingConfigured()) return true
    m.payMsg = 'Cobrança ainda não está no ar neste site.'
    m.payKind = 'err'
    render()
    return false
  }
  const runOnce = async (interval) => {
    if (!needAuth() || !needBilling()) return
    m.payMsg = 'Abrindo o pagamento…'
    m.payKind = ''
    render()
    try {
      const r = await checkoutOnceInfinity(authUser.id, interval)
      if (r && r.url) {
        go(r.url, /^https:\/\/[^/]*infinitepay\.io/i)
        return
      }
      throw new Error('Sem link de pagamento.')
    } catch (err) {
      m.payMsg = (err && err.message) || 'Não deu para abrir o pagamento.'
      m.payKind = 'err'
      render()
    }
  }
  const runSub = async () => {
    if (!needAuth() || !needBilling()) return
    m.payMsg = 'Abrindo a assinatura…'
    m.payKind = ''
    render()
    try {
      const r = await subscribePlan(authUser.id, 'pro')
      if (r && r.url) {
        go(r.url, /^https:\/\/[^/]*\.?mercadopago\.com/i)
        return
      }
      throw new Error('Sem link de assinatura.')
    } catch (err) {
      m.payMsg = (err && err.message) || 'Não deu para abrir a assinatura.'
      m.payKind = 'err'
      render()
    }
  }
  const runSync = async () => {
    if (!needAuth() || !needBilling()) return
    m.payMsg = 'Verificando pagamento…'
    m.payKind = ''
    render()
    try {
      const r = await syncSubscription(authUser.id)
      if (applyPlanPayload(r) && !isLimitedPlan(currentPlan())) {
        modal = null
        render()
        showToast('Pagamento confirmado. Pro liberado!', 'ok')
        return
      }
      m.payMsg = 'Ainda não consta. Se você já pagou, aguarde um minuto e tente de novo.'
      m.payKind = 'err'
      render()
    } catch (err) {
      m.payMsg = (err && err.message) || 'Não deu para verificar agora.'
      m.payKind = 'err'
      render()
    }
  }
  const options = [
    {
      id: '3m',
      title: '3 meses de Pro',
      amt: ONCE_PLANS['3m'].priceLabel,
      note: 'Pagamento único · equivale a R$ 43/mês',
      badge: 'Melhor valor'
    },
    {
      id: '1m',
      title: '1 mês de Pro',
      amt: ONCE_PLANS['1m'].priceLabel,
      note: 'Pagamento único'
    },
    {
      id: 'sub',
      title: 'Mensal',
      amt: PLANS.pro.priceLabel,
      note: 'Renova automaticamente · cancele quando quiser'
    }
  ]
  const selected = options.find((o) => o.id === m.pick) || options[0]
  const runSelected = () => (selected.id === 'sub' ? runSub() : runOnce(selected.id))
  const optionEl = (o) =>
    h(
      'button',
      {
        type: 'button',
        class: 'pay-opt' + (selected.id === o.id ? ' sel' : ''),
        onClick: () => {
          m.pick = o.id
          m.payMsg = ''
          m.payKind = ''
          render()
        }
      },
      [
        h('span', { class: 'radio' }),
        h('span', { class: 'info' }, [
          h('span', { class: 'title' }, [o.title, o.badge ? h('em', { class: 'badge' }, [o.badge]) : null]),
          h('span', { class: 'note' }, [o.note])
        ]),
        h('span', { class: 'amt' }, [o.amt])
      ]
    )
  return h('div', { class: 'modal-backdrop' }, [
    h('div', { class: 'modal auth-modal' }, [
      h('div', { class: 'modal-head' }, [
        h('div', {}, [
          h('h2', {}, ['Assinar o MDF Atelier']),
          h('span', { class: 'help' }, ['Escolha uma opção e toque em Assinar.'])
        ]),
        h('button', { class: 'btn small ghost x', onClick: () => { modal = null; render() } }, ['✕'])
      ]),
      h('div', { class: 'modal-body' }, [
        h('div', { class: 'auth-box' }, [
          m.msg ? h('p', { class: 'help pay-msg' }, [m.msg]) : null,
          h('div', { class: 'pay-options' }, options.map(optionEl)),
          h('p', { class: 'help pay-benefits' }, [
            'Orçamentos ilimitados e a logo da sua marcenaria no documento.'
          ]),
          msgEl,
          h('button', { class: 'btn primary full', onClick: runSelected }, ['Assinar ' + selected.amt]),
          h('div', { class: 'row pay-extra' }, [
            h('button', { class: 'btn ghost', onClick: runSync }, ['Já paguei — verificar']),
            h('button', { class: 'btn ghost', onClick: () => { modal = null; render() } }, ['Agora não'])
          ])
        ])
      ])
    ])
  ])
}

/* ============================== home / projetos ============================== */

function openProject(id) {
  setActive(id)
}

function duplicateProjectFrom(id) {
  const cur = state.activeProjectId
  state.activeProjectId = id
  const n = state.projects.length
  duplicateProject()
  if (state.projects.length === n) state.activeProjectId = cur
}

function tabProjetos() {
  const plan = currentPlan()
  const rows = state.projects.map((p) => {
    const n = (p.furniture || []).length
    const date = new Date(p.createdAt).toLocaleDateString('pt-BR')
    const money = moneyForProject(p)
    const phone = clientWaDigits(p)
    return h('div', { class: 'home-card' + (p.id === state.activeProjectId ? ' active' : '') }, [
      h('button', { class: 'home-card-main', onClick: () => openProject(p.id) }, [
        h('strong', {}, [p.name || 'Novo orçamento']),
        h('span', {}, [
          `${p.client ? p.client + ' · ' : ''}${n} ${n === 1 ? 'móvel' : 'móveis'} · ${date}`
        ])
      ]),
      h('div', { class: 'home-money' }, [
        h('div', {}, [h('label', {}, ['Custo']), h('strong', { class: 'home-cost' }, [formatMoney(money.cost)])]),
        h('div', {}, [h('label', {}, ['Lucro']), h('strong', { class: 'home-profit' }, [formatMoney(money.profit)])]),
        h('div', {}, [h('label', {}, ['Venda']), h('strong', { class: 'home-sale' }, [formatMoney(money.sale)])])
      ]),
      h('div', { class: 'home-card-actions' }, [
        h('button', { class: 'btn small', onClick: () => openProject(p.id) }, ['Abrir']),
        h('button', { class: 'btn small', onClick: () => duplicateProjectFrom(p.id) }, ['Duplicar']),
        h(
          'button',
          {
            class: 'btn small primary',
            title: phone ? 'Enviar o PDF pelo WhatsApp do cliente' : 'Gerar o PDF e compartilhar',
            onClick: () => shareProjectWhatsApp(p.id)
          },
          ['WhatsApp']
        ),
        h(
          'button',
          {
            class: 'btn small ghost danger-side',
            disabled: state.projects.length <= 1,
            onClick: async () => {
              const ok = await confirmModal('Excluir este orçamento e todas as suas peças?', {
                title: 'Excluir orçamento',
                confirmLabel: 'Excluir',
                danger: true
              })
              if (ok) removeProject(p.id)
            }
          },
          ['Excluir']
        )
      ])
    ])
  })
  return h('div', { class: 'home' }, [
    h('div', { class: 'home-head' }, [
      h('div', {}, [
        h('h2', {}, ['Orçamentos']),
        h('p', { class: 'help' }, [
          isLimitedPlan(plan)
            ? `Plano ${planLabel(plan)} · ${state.projects.length} de ${freeProjectLimit()} orçamentos.`
            : `Plano ${planLabel(plan)} · ${state.projects.length} orçamento(s).`
        ])
      ]),
      h('button', { class: 'btn primary', onClick: addProject }, ['+ Novo orçamento'])
    ]),
    rows.length ? h('div', { class: 'home-grid' }, rows) : h('div', { class: 'card' }, [h('p', { class: 'help' }, ['Nenhum orçamento ainda.'])])
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

/* ============ orçamento no smartphone: lista de itens × detalhe ============ */

function mobileOpenItem(id) {
  listFocusId = id
  refresh()
}
function mobileBackList() {
  listFocusId = null
  refresh()
}

function itemDims(item) {
  const p = item.params || {}
  const w = numP(p, 'width') || numP(p, 'length')
  const d = numP(p, 'depth')
  const h = numP(p, 'height')
  const parts = [w, d, h].filter((v) => v > 0).map((v) => `${Math.round(v)} mm`)
  return parts.join(' × ')
}

function waitFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

function inlineSvgStyles(orig, clone) {
  const props = [
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-opacity',
    'stroke-width',
    'stroke-dasharray',
    'stroke-linecap',
    'stroke-linejoin',
    'opacity',
    'font-family',
    'font-size',
    'font-weight',
    'letter-spacing',
    'text-anchor'
  ]
  const cs = getComputedStyle(orig)
  props.forEach((prop) => {
    const val = cs.getPropertyValue(prop)
    if (val) clone.style.setProperty(prop, val)
  })
  const oc = orig.children
  const cc = clone.children
  for (let i = 0; i < oc.length && i < cc.length; i++) inlineSvgStyles(oc[i], cc[i])
}

/* O html2canvas não rasteriza SVG inline de forma confiável no celular
 * (desenhos tortos/cortados). Convertemos cada desenho em PNG pelo próprio
 * navegador antes de capturar. Só afeta o PDF do botão Enviar, não a impressão. */
function svgToCaptureImage(svg) {
  const rect = svg.getBoundingClientRect()
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number)
  const vbW = vb.length === 4 && vb[2] > 0 ? vb[2] : 0
  const vbH = vb.length === 4 && vb[3] > 0 ? vb[3] : 0
  const w = Math.max(1, Math.round(rect.width || vbW || 300))
  const h = Math.max(1, Math.round(rect.height || (vbW ? (w * vbH) / vbW : vbH || 150)))
  const clone = svg.cloneNode(true)
  inlineSvgStyles(svg, clone)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  if (vb.length === 4) clone.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`)
  const data =
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone))
  return new Promise((resolve) => {
    const im = new Image()
    im.onload = () => {
      try {
        const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 2))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(w * scale))
        canvas.height = Math.max(1, Math.round(h * scale))
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(im, 0, 0, canvas.width, canvas.height)
        const out = document.createElement('img')
        out.className = svg.getAttribute('class') || ''
        out.setAttribute('alt', '')
        out.src = canvas.toDataURL('image/png')
        out.style.width = '100%'
        out.style.height = 'auto'
        svg.replaceWith(out)
      } catch {
        /* se falhar, mantém o SVG e deixa o html2canvas tentar */
      }
      resolve()
    }
    im.onerror = () => resolve()
    im.src = data
  })
}

async function buildQuotePdf() {
  const p = project()
  const filename = quoteFilename(p.name)
  const prevPrint = printFull
  printFull = true
  render()
  await waitFrame()
  const src = document.querySelector('.budget-doc')
  if (!src) {
    printFull = prevPrint
    render()
    throw new Error('documento')
  }
  const host = document.createElement('div')
  host.className = 'pdf-capture'
  const clone = src.cloneNode(true)
  clone.querySelectorAll('.print-hide').forEach((el) => el.remove())
  host.append(clone)
  document.body.append(host)
  await Promise.all(Array.from(host.querySelectorAll('svg.schematic-svg')).map(svgToCaptureImage))
  const imgs = Array.from(host.querySelectorAll('img'))
  await Promise.all(
    imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((res) => {
      img.onload = res
      img.onerror = res
    })))
  )
  await waitFrame()
  try {
    return await htmlPagesToPdfBlob(host.querySelectorAll('.doc-page'), filename)
  } finally {
    host.remove()
    printFull = prevPrint
    render()
  }
}

function shareQuote() {
  sharePackedQuote(project())
}

function shareProjectWhatsApp(id) {
  if (shareBusy) return
  const prevId = state.activeProjectId
  const prevTab = tab
  state.activeProjectId = id
  tab = 'orcamento'
  recalc()
  sharePackedQuote(project(), {
    whatsapp: true,
    after: () => {
      state.activeProjectId = prevId
      tab = prevTab
      recalc()
      render()
    }
  })
}

function sharePackedQuote(p, opts = {}) {
  if (shareBusy || !p) return
  shareBusy = true
  const overlay = document.createElement('div')
  overlay.className = 'capturing-overlay'
  overlay.textContent = 'Gerando PDF…'
  document.body.append(overlay)
  const totals = p.id === state.activeProjectId ? projectSaleTotals() : moneyForProject(p)
  const title = p.name || 'Orçamento'
  const text = `${p.client ? p.client + ' · ' : ''}${formatMoney(totals.sale)}`
  const digits = clientWaDigits(p)
  const finish = () => {
    shareBusy = false
    overlay.remove()
    if (opts.after) opts.after()
  }
  buildQuotePdf()
    .then((packed) => {
      const file = packed.file
      const save = () => savePdfFile(packed.blob, packed.filename)
      const openWa = () => {
        if (!opts.whatsapp || digits.length < 8) return
        const msg = `Olá${p.client ? ' ' + p.client : ''}! Segue o orçamento "${title}", no valor de ${formatMoney(totals.sale)}.`
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
      }
      if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ title, text, files: [file] }).catch((err) => {
          if (!err || err.name !== 'AbortError') {
            save()
            openWa()
          }
        })
      }
      save()
      openWa()
    })
    .catch(() => {})
    .finally(finish)
}

function mobileClientCard(p) {
  return h('div', { class: 'card client-card' }, [
    h('h2', {}, ['Cliente deste orçamento']),
    field(
      'Nome',
      h('input', {
        type: 'text',
        class: 'doc-input',
        value: p.client || '',
        placeholder: 'Nome do cliente',
        autocomplete: 'name',
        enterkeyhint: 'next',
        'data-k': 'client-name',
        onInput: (e) => liveProject({ client: e.target.value })
      })
    ),
    field(
      'Telefone',
      h('input', {
        type: 'tel',
        class: 'doc-input',
        value: p.phone || '',
        placeholder: '(00) 00000-0000',
        autocomplete: 'tel',
        inputmode: 'tel',
        enterkeyhint: 'next',
        'data-k': 'client-phone',
        onInput: (e) => liveProject({ phone: e.target.value })
      })
    ),
    field(
      'Observações',
      h('textarea', {
        class: 'doc-input',
        value: p.notes || '',
        placeholder: 'Prazos, forma de pagamento, o que está incluso…',
        'data-k': 'client-notes',
        onInput: (e) => liveProject({ notes: e.target.value })
      })
    )
  ])
}

function mobileOrcamento() {
  const p = project()
  const items = furnitureList()
  if (!items.length) listFocusId = null
  const focus = listFocusId ? items.find((f) => f.id === listFocusId) || null : null
  if (focus) {
    return h('div', { class: 'mobile-detail' }, [
      h('div', { class: 'detail-bar' }, [
        h('button', { class: 'btn', onClick: mobileBackList }, ['‹ Todos os itens']),
        h('span', { class: 'help' }, [formatMoney(saleCalc(focus).lineTotal)]),
        h('button', { class: 'btn', title: 'Enviar o orçamento completo em PDF', onClick: shareQuote }, ['Enviar']),
        h('button', { class: 'btn primary', title: 'Imprimir ou salvar o orçamento completo em PDF', onClick: printBudget }, ['Imprimir'])
      ]),
      h('div', { class: 'budget-doc' }, [itemPage(focus)])
    ])
  }
  const t = projectSaleTotals()
  return h('div', { class: 'mobile-list' }, [
    mobileClientCard(p),
    items.length
      ? h('div', { class: 'list-summary' }, [
          h('div', { class: 'ls-stats' }, [
            h('div', {}, [h('label', {}, ['ITENS']), h('strong', {}, [String(t.count)])]),
            h('div', {}, [h('label', {}, ['UNIDADES']), h('strong', {}, [String(t.units)])])
          ]),
          h('div', { class: 'ls-total' }, [h('label', {}, ['TOTAL']), h('strong', { class: 'accent' }, [formatMoney(t.sale)])])
        ])
      : null,
    items.length
      ? h(
          'div',
          { class: 'item-list' },
          items.map((f) => {
            const s = saleCalc(f)
            const dims = itemDims(f)
            return h('button', { class: 'item-row', onClick: () => mobileOpenItem(f.id) }, [
              h('span', { class: 'row-swatch', style: `background:${f.color}` }),
              h('span', { class: 'row-main' }, [
                h('strong', {}, [f.name]),
                h('span', {}, [dims ? dims : `${s.pieceCount} peça(s)`, ` · ${s.qty} ${s.qty === 1 ? 'unidade' : 'unidades'}`])
              ]),
              h('span', { class: 'row-price' }, [h('strong', { class: 'accent' }, [formatMoney(s.lineTotal)])]),
              h('span', { class: 'row-chev' }, ['›'])
            ])
          })
        )
      : h('div', { class: 'budget-empty' }, [
          h('h3', {}, ['Nenhum móvel neste orçamento']),
          h('p', {}, ['Toque em "+ Adicionar móvel" para montar o primeiro item do cliente.']),
          h('div', { style: 'margin-top:14px' }, [h('button', { class: 'btn primary', onClick: openModalNew }, ['+ Adicionar móvel'])])
        ]),
    items.length
      ? h('div', { class: 'list-send' }, [
          h('button', { class: 'btn primary', onClick: shareQuote }, ['Enviar PDF']),
          h('button', { class: 'btn', onClick: printBudget }, ['Imprimir'])
        ])
      : null,
    items.length
      ? h('p', { class: 'help list-tip' }, ['Toque em um item para ver o desenho. Enviar PDF manda o orçamento pelo WhatsApp ou baixa o arquivo.'])
      : null
  ])
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

async function removeFromList(f) {
  const ok = await confirmModal(`Excluir "${f.name}" deste orçamento?`, {
    title: 'Excluir móvel',
    confirmLabel: 'Excluir',
    danger: true
  })
  if (ok) removeFurniture(f.id)
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

function logoSrc() {
  if (canUseShopLogo() && state.settings && state.settings.shopLogo) return state.settings.shopLogo
  return import.meta.env.BASE_URL + 'logo.png'
}

function canUseShopLogo() {
  return !isLimitedPlan(currentPlan())
}

function docLogoMark(cls) {
  const mark = h('div', { class: 'mark' }, ['MDF ATELIER'])
  const custom = canUseShopLogo() && state.settings && state.settings.shopLogo
  const img = h('img', { class: 'logo-img', src: logoSrc(), alt: '' })
  if (!custom) img.style.display = 'none'
  img.addEventListener('load', () => {
    img.style.display = 'block'
    mark.style.display = 'none'
  })
  img.addEventListener('error', () => {
    img.remove()
    mark.style.display = ''
  })
  return h('div', { class: 'logo-slot' + (cls ? ' ' + cls : '') }, [mark, img])
}

function onLogoFile(e) {
  if (!canUseShopLogo()) {
    e.target.value = ''
    openUpgrade('No Pro a logo da sua marcenaria aparece na capa e no rodapé do orçamento.')
    return
  }
  const file = e.target.files && e.target.files[0]
  if (!file) return
  if (file.size > 800000) {
    showToast('Use uma imagem de até 800 KB.', 'err')
    e.target.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    state.settings.shopLogo = String(reader.result || '')
    persist()
  }
  reader.readAsDataURL(file)
}

function clearShopLogo() {
  state.settings.shopLogo = ''
  persist()
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

async function modalRemove() {
  const m = modal
  if (!m || m.kind !== 'edit') return
  if (!m.targetId) {
    modal = null
    refresh()
    return
  }
  const ok = await confirmModal(`Excluir "${m.staged.name}" deste orçamento?`, {
    title: 'Excluir móvel',
    confirmLabel: 'Excluir',
    danger: true
  })
  if (ok) removeFurniture(m.targetId)
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
            placeholder: 'Buscar (ex.: mesa, correr, cozinha, banheiro, gavetas, armário…)',
            onChange: (e) => {
              catalogQuery = e.target.value
              refresh()
            }
          })
        ]),
        h('div', { class: 'picker-groups' }, [
          CATALOG_GROUPS.map((g) => {
            const hay = (m) =>
              [m.label, m.blurb, g.group, m.type, m.variant, (m.tags || []).join(' ')].join(' ').toLowerCase()
            const matches = g.models.filter((m) => !hasQuery || query.split(/\s+/).every((t) => hay(m).includes(t)))
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
      ...paramCards(item, materialLine()),
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
          h('div', {}, [h('label', {}, ['Custo (1 un.)']), h('strong', {}, [formatMoney(s.cost)])]),
          h('div', {}, [h('label', {}, ['Margem aplicada']), h('strong', {}, [`${s.margin.toFixed(0)}%`])]),
          h('div', {}, [h('label', {}, ['Valor de venda (1 un.)']), h('strong', { class: 'accent' }, [formatMoney(s.salePerUnit)])])
        ]),
        h('p', { class: 'help' }, [hardwareHelp(s), ' Margem é configurada na aba Custos (por item) ou no padrão global em Config.']),
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
          ...paramCards(item, materialLine()),
          extraPiecesBlock(item),
          h('div', { class: 'card money-card' }, [
            h('h3', {}, ['Custo e venda deste item']),
            h('div', { class: 'money-grid' }, [
          h('div', {}, [h('label', {}, ['Custo (1 un.)']), h('strong', {}, [formatMoney(s.cost)])]),
              h('div', {}, [h('label', {}, ['Margem aplicada']), h('strong', {}, [`${s.margin.toFixed(0)}%`])]),
              h('div', {}, [h('label', {}, ['Valor de venda (1 un.)']), h('strong', { class: 'accent' }, [formatMoney(s.salePerUnit)])])
            ]),
            h('p', { class: 'help' }, [hardwareHelp(s), ' Margem é configurada na aba Custos (por item) ou no padrão global em Config.']),
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
  const noDoors = item.type !== 'armario' && item.type !== 'guarda-roupa' ? true : !Number(p.doors || 0)
  if (f.key === 'gavH' || f.key === 'pedW' || f.key === 'drawerBase') return noDrawers
  if (f.key === 'baseH') return noDrawers || p.drawerBase !== 'alto'
  if (f.key === 'frontT') return noDrawers
  if (f.key === 'doorT') return noDoors && noDrawers
  if (f.key === 'backT') return !Number(p.hasBack ?? 1)
  if (f.key === 'tampoT' && item.type === 'mesa') return (p.tamponamento || 'nenhum') !== 'dobra'
  const peOff = item.variant === 'aereo' || item.variant === 'espelheira' || item.variant === 'forno' || String(item.variant || '').startsWith('suspenso')
  const pe = p.pe || 'nenhum'
  if (f.key === 'pe' || f.key === 'peH' || f.key === 'peQty') {
    if (peOff) return true
  }
  if (f.key === 'peH') return pe !== 'sapatinha'
  if (f.key === 'peQty') return pe === 'nenhum'
  if (f.key === 'puxador' || f.key === 'puxadorQty') {
    if (item.type === 'nicho') return true
    if (noDoors && noDrawers && item.type !== 'gaveteiro') return true
  }
  if (f.key === 'puxadorQty') {
    const px = p.puxador || 'nenhum'
    return px === 'nenhum' || px === 'perfil'
  }
  return false
}

function paramCards(item, material) {
  const all = fieldsFor(item).filter((f) => !isParamHidden(item, f))
  if (!all.length) return []
  const rest = all.filter((f) => !ACCESSORY_KEYS.includes(f.key))
  const acc = all.filter((f) => ACCESSORY_KEYS.includes(f.key))
  const cards = []
  if (rest.length) {
    const checks = rest.filter((f) => f.kind === 'check')
    const grid = rest.filter((f) => f.kind !== 'check')
    cards.push(
      h('div', { class: 'card' }, [
        h('div', { class: 'row', style: 'justify-content:space-between;align-items:center' }, [h('h3', {}, ['Medidas e opções']), material ? h('span', { class: 'help' }, [material]) : null]),
        checks.length ? h('div', { class: 'param-checks' }, checks.map((f) => paramField(item, f))) : null,
        grid.length ? h('div', { class: 'param-grid', style: 'margin-top:6px' }, grid.map((f) => paramField(item, f))) : null
      ])
    )
  }
  if (acc.length) {
    cards.push(
      h('div', { class: 'card' }, [
        h('h3', {}, ['Pés, puxador e ferragens']),
        h('p', { class: 'help' }, ['Pé de MDF entra no corte. Regulável, rodízio, puxador, dobradiça e corrediça entram no custo (preços na aba Conta).']),
        h('div', { class: 'param-grid', style: 'margin-top:6px' }, acc.map((f) => paramField(item, f)))
      ])
    )
  }
  return cards
}

function paramField(item, f) {
  let val = item.params?.[f.key]
  if ((f.key === 'pe' || f.key === 'puxador') && (val == null || val === '')) val = 'nenhum'
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
  if (!(item.extraPieces || []).length) {
    return h('p', { class: 'help', style: 'margin:10px 0 0' }, ['Use para complementos que o modelo não gera (ex.: cimalha, rodapé, nicho avulso).'])
  }
  if (isMobileNow()) return extraPiecesCards(item)
  return h('div', { style: 'overflow:auto;margin-top:10px' }, [pieceTable(item)])
}

function extraPiecesCards(item) {
  return h(
    'div',
    { class: 'extra-cards' },
    (item.extraPieces || []).map((piece) =>
      h('div', { class: 'extra-card' }, [
        field('Nome', h('input', { type: 'text', value: piece.name, onChange: (e) => updateExtra(item, piece.id, { name: e.target.value }) }), 'grow'),
        h('div', { class: 'row' }, [
          field('L mm', inputNum(piece.length, (v) => updateExtra(item, piece.id, { length: v }))),
          field('A mm', inputNum(piece.width, (v) => updateExtra(item, piece.id, { width: v }))),
          field('Esp.', inputNum(piece.thickness, (v) => updateExtra(item, piece.id, { thickness: v }))),
          field('Qtd', inputNum(piece.qty, (v) => updateExtra(item, piece.id, { qty: v })))
        ]),
        field(
          'Veio',
          h(
            'select',
            { onChange: (e) => updateExtra(item, piece.id, { grain: e.target.value }) },
            Object.entries(GRAIN).map(([k, label]) => h('option', { value: k, selected: piece.grain === k }, [label]))
          )
        ),
        h('div', { class: 'edges' }, [
          extraEdge(item, piece, 'front', 'Frente'),
          extraEdge(item, piece, 'back', 'Fundo'),
          extraEdge(item, piece, 'left', 'Esq.'),
          extraEdge(item, piece, 'right', 'Dir.')
        ]),
        h('button', { class: 'btn danger', onClick: () => removeExtra(item, piece.id) }, ['Remover peça'])
      ])
    )
  )
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
                    td(h('span', { title: `Painel ${formatMoney(s.panel)} · fita ${formatMoney(s.tape)} · ferragens ${formatMoney(s.hardware || 0)} · mão de obra ${formatMoney(s.labor)}` }, [formatMoney(s.cost)])),
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
  const sheetGroups = []
  for (const b of (layoutCache && layoutCache.boards) || []) {
    const key = `${b.sheetName}|${b.sheetWidth}x${b.sheetHeight}|${b.sheetPrice}|${b.thickness}`
    let g = sheetGroups.find((x) => x.key === key)
    if (!g) {
      g = { key, name: b.sheetName || 'MDF', width: b.sheetWidth, height: b.sheetHeight, price: Number(b.sheetPrice) || 0, count: 0 }
      sheetGroups.push(g)
    }
    g.count += 1
  }
  return h('div', { class: 'card' }, [
    h('h2', {}, ['Fechamento da obra (custo real de chapa)']),
    costLine('Chapas compradas', `${s.sheets} chapa(s)`, formatMoney(s.sheetCost)),
    ...sheetGroups.map((g) =>
      costLine(`   ${g.count}× ${g.name} ${g.width}×${g.height} mm`, formatMoney(g.price), formatMoney(g.count * g.price))
    ),
    costLine('Fita de borda', `${formatMeters(s.tapeM)} × ${formatMoney(Number(set.tapePricePerMeter || 0))}/m`, formatMoney(s.tapeCost)),
    hardwareTotalLine(),
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

/* ============================== CORTE MANUAL ============================== */

let manualUndo = []
let manualSelection = new Set()

function clearManualSelection(redraw) {
  if (!manualSelection.size) return
  manualSelection.clear()
  if (redraw) render()
}

function toggleManualSelection(uid, additive) {
  if (additive) {
    if (manualSelection.has(uid)) manualSelection.delete(uid)
    else manualSelection.add(uid)
  } else if (manualSelection.size === 1 && manualSelection.has(uid)) {
    manualSelection.clear()
  } else {
    manualSelection.clear()
    manualSelection.add(uid)
  }
  render()
}

function selectedPlacements() {
  const pad = state.settings.cutMode === 'manual'
  if (!pad || !layoutCache) return []
  const out = []
  for (const b of layoutCache.boards) {
    for (const p of b.placements) if (manualSelection.has(p.uid)) out.push({ board: b, piece: p })
  }
  return out
}

function manualMap() {
  const p = project()
  if (!p) return null
  if (!p.manual || typeof p.manual !== 'object') p.manual = {}
  return p.manual
}

function pushManualUndo() {
  const p = project()
  if (!p) return
  manualUndo.push({ id: p.id, data: JSON.stringify(p.manual || {}) })
  if (manualUndo.length > 50) manualUndo.shift()
}

function manualSnapTargets(board, piece, axis, size) {
  const out = axis === 'x' ? [0, board.packW - size] : [0, board.packH - size]
  for (const q of board.placements) {
    if (q === piece) continue
    if (axis === 'x') out.push(q.x - size - board.kerf, q.x + q.w + board.kerf)
    else out.push(q.y - size - board.kerf, q.y + q.h + board.kerf)
  }
  return out
}

function snapValue(value, targets, tol) {
  let best = value
  let dist = tol
  for (const t of targets) {
    const d = Math.abs(value - t)
    if (d < dist) {
      dist = d
      best = t
    }
  }
  return best
}

function moveFits(board, piece, cand) {
  if (!placementFits(board, cand)) return false
  for (const q of board.placements) {
    if (q === piece) continue
    if (overlapGap(cand, q, board.kerf)) return false
  }
  return true
}

function makeGhost(box, piece) {
  const g = document.createElement('div')
  g.className = 'piece-ghost'
  g.style.width = `${box.offsetWidth}px`
  g.style.height = `${box.offsetHeight}px`
  g.style.background = piece.color || '#5c4033'
  g.textContent = `${Math.round(piece.w)} × ${Math.round(piece.h)}`
  document.body.append(g)
  return g
}

function sheetFromPoint(x, y) {
  const el = document.elementFromPoint(x, y)
  return el ? el.closest('.sheet') : null
}

function crossCandidate(sheet, piece, clientX, clientY, fx, fy, w, h) {
  const board = sheet.__board
  const scale = sheet.__scale
  if (!board || !(scale > 0)) return null
  const r = sheet.getBoundingClientRect()
  let x = (clientX - r.left) / scale - board.trim - w * fx
  let y = (clientY - r.top) / scale - board.trim - h * fy
  x = snapValue(x, manualSnapTargets(board, piece, 'x', w), 6)
  y = snapValue(y, manualSnapTargets(board, piece, 'y', h), 6)
  x = Math.max(0, Math.min(board.packW - w, x))
  y = Math.max(0, Math.min(board.packH - h, y))
  const cand = { x, y, w, h }
  const valid =
    placementFits(board, cand) && !board.placements.some((q) => overlapGap(cand, q, board.kerf))
  return { board, x, y, valid }
}

function attachManualDrag(board, box, piece, scale) {
  if (!(scale > 0)) return
  box.classList.add('piece-drag')
  box.addEventListener('pointerdown', (ev) => {
    if (ev.button != null && ev.button !== 0) return
    ev.preventDefault()
    const startX = ev.clientX
    const startY = ev.clientY
    const ox = piece.x
    const oy = piece.y
    const w = piece.w
    const h = piece.h
    const tol = 6
    const boxRect = box.getBoundingClientRect()
    const fx = boxRect.width > 0 ? (startX - boxRect.left) / boxRect.width : 0.5
    const fy = boxRect.height > 0 ? (startY - boxRect.top) / boxRect.height : 0.5
    let last = { x: ox, y: oy }
    let valid = true
    let moved = false
    let ghost = null
    let cross = null
    let hover = null
    pushManualUndo()
    box.classList.add('dragging')
    box.style.pointerEvents = 'none'
    const setHover = (sheet) => {
      if (hover === sheet) return
      if (hover) hover.classList.remove('drop-target')
      hover = sheet
      if (hover) hover.classList.add('drop-target')
    }
    const onMove = (e) => {
      if (Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4) moved = true
      let nx = ox + (e.clientX - startX) / scale
      let ny = oy + (e.clientY - startY) / scale
      nx = snapValue(nx, manualSnapTargets(board, piece, 'x', w), tol)
      ny = snapValue(ny, manualSnapTargets(board, piece, 'y', h), tol)
      nx = Math.max(0, Math.min(board.packW - w, nx))
      ny = Math.max(0, Math.min(board.packH - h, ny))
      last = { x: nx, y: ny }
      valid = moveFits(board, piece, { x: nx, y: ny, w, h })
      const sheet = sheetFromPoint(e.clientX, e.clientY)
      if (sheet && sheet.__board && sheet.__board.index !== board.index) {
        cross = crossCandidate(sheet, piece, e.clientX, e.clientY, fx, fy, w, h)
        setHover(sheet)
        box.style.visibility = 'hidden'
        if (!ghost) ghost = makeGhost(box, piece)
        ghost.style.display = ''
        ghost.style.left = `${e.clientX - fx * ghost.offsetWidth}px`
        ghost.style.top = `${e.clientY - fy * ghost.offsetHeight}px`
        ghost.classList.toggle('piece-bad', !(cross && cross.valid))
      } else {
        cross = null
        setHover(null)
        box.style.visibility = ''
        if (ghost) ghost.style.display = 'none'
        box.style.left = `${(board.trim + nx) * scale}px`
        box.style.top = `${(board.trim + ny) * scale}px`
        box.classList.toggle('piece-bad', !valid)
      }
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      box.classList.remove('dragging', 'piece-bad')
      box.style.visibility = ''
      box.style.pointerEvents = ''
      setHover(null)
      if (ghost) ghost.remove()
    }
    const onCancel = () => {
      cleanup()
      manualUndo.pop()
      render()
    }
    const onUp = (e) => {
      cleanup()
      if (cross && cross.valid) {
        const map = manualMap()
        if (!map) return
        map[piece.uid] = {
          x: Math.round(cross.x * 10) / 10,
          y: Math.round(cross.y * 10) / 10,
          rotated: !!piece.rotated,
          board: cross.board.index
        }
        persist({ silent: true })
        return
      }
      if (!moved) {
        manualUndo.pop()
        toggleManualSelection(piece.uid, !!(e && (e.shiftKey || e.metaKey || e.ctrlKey)))
        return
      }
      const unchanged = Math.abs(last.x - ox) < 0.05 && Math.abs(last.y - oy) < 0.05
      if (!valid || unchanged) {
        manualUndo.pop()
        if (!valid && !unchanged) render()
        return
      }
      const map = manualMap()
      if (!map) return
      map[piece.uid] = {
        x: Math.round(last.x * 10) / 10,
        y: Math.round(last.y * 10) / 10,
        rotated: !!piece.rotated,
        board: board.index
      }
      persist({ silent: true })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  })
}

function undoManual() {
  const p = project()
  if (!p) return
  while (manualUndo.length && manualUndo[manualUndo.length - 1].id !== p.id) manualUndo.pop()
  if (!manualUndo.length) return
  p.manual = JSON.parse(manualUndo.pop().data)
  persist({ silent: true })
}

function clearManual() {
  const p = project()
  if (!p || !p.manual || !Object.keys(p.manual).length) return
  pushManualUndo()
  p.manual = {}
  persist({ silent: true })
}

function canRotatePiece(piece) {
  return !!piece.hidden || piece.grain === 'livre'
}

function rotateManual(board, piece) {
  if (!canRotatePiece(piece)) {
    showToast('Esta peça tem veio definido: não pode girar.', 'info', 4000)
    return
  }
  const next = !piece.rotated
  const length = Number(piece.length) || piece.w
  const width = Number(piece.width) || piece.h
  const w = next ? width : length
  const h = next ? length : width
  if (w > board.packW + 0.5 || h > board.packH + 0.5) {
    showToast('A peça girada não cabe nesta chapa.', 'info', 4000)
    return
  }
  const clamp = (v, max) => Math.max(0, Math.min(max, v))
  const tries = [
    [piece.x + (piece.w - w) / 2, piece.y + (piece.h - h) / 2],
    [piece.x, piece.y],
    [0, 0]
  ]
  for (const [tx, ty] of tries) {
    const x = clamp(tx, board.packW - w)
    const y = clamp(ty, board.packH - h)
    if (!moveFits(board, piece, { x, y, w, h })) continue
    pushManualUndo()
    const map = manualMap()
    if (!map) return
    map[piece.uid] = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, rotated: next, board: board.index }
    persist({ silent: true })
    return
  }
  showToast('Não há espaço livre para girar aqui. Mova a peça primeiro.', 'info', 4000)
}

function tightenManualSheet(board) {
  const packed = tightenBoard(board)
  if (!packed.length) return
  pushManualUndo()
  const map = manualMap()
  if (!map) return
  for (const item of packed) {
    map[item.uid] = {
      x: Math.round(item.x * 10) / 10,
      y: Math.round(item.y * 10) / 10,
      rotated: !!item.rotated,
      board: board.index
    }
  }
  persist({ silent: true })
}

function applyManualGroup(board, updates) {
  const moving = new Set(updates.map((u) => u.piece.uid))
  const occ = board.placements
    .filter((q) => !moving.has(q.uid))
    .map((q) => ({ uid: q.uid, x: q.x, y: q.y, w: q.w, h: q.h }))
  for (const u of updates) {
    const cand = { x: u.x, y: u.y, w: u.piece.w, h: u.piece.h }
    if (!placementFits(board, cand) || occ.some((q) => overlapGap(cand, q, board.kerf))) return false
    occ.push({ uid: u.piece.uid, x: u.x, y: u.y, w: u.piece.w, h: u.piece.h })
  }
  return true
}

function commitManualGroup(board, updates) {
  const map = manualMap()
  if (!map) return
  for (const u of updates) {
    map[u.piece.uid] = {
      x: Math.round(u.x * 10) / 10,
      y: Math.round(u.y * 10) / 10,
      rotated: !!u.piece.rotated,
      board: board.index
    }
  }
  persist({ silent: true })
}

function alignManual(mode) {
  const sel = selectedPlacements()
  if (sel.length < 2) return
  const board = sel[0].board
  if (sel.some((s) => s.board !== board)) {
    showToast('Selecione peças da mesma chapa para alinhar.', 'info', 4000)
    return
  }
  const xs = sel.map((s) => s.piece.x)
  const ys = sel.map((s) => s.piece.y)
  const rights = sel.map((s) => s.piece.x + s.piece.w)
  const bottoms = sel.map((s) => s.piece.y + s.piece.h)
  const updates = sel.map((s) => {
    const p = s.piece
    if (mode === 'left') return { piece: p, x: Math.min(...xs), y: p.y }
    if (mode === 'right') return { piece: p, x: Math.max(...rights) - p.w, y: p.y }
    if (mode === 'top') return { piece: p, x: p.x, y: Math.min(...ys) }
    return { piece: p, x: p.x, y: Math.max(...bottoms) - p.h }
  })
  if (!applyManualGroup(board, updates)) {
    showToast('O alinhamento geraria sobreposição nesta chapa.', 'info', 4000)
    return
  }
  pushManualUndo()
  commitManualGroup(board, updates)
}

function distributeManual(axis) {
  const sel = selectedPlacements()
  if (sel.length < 3) {
    showToast('Distribuir exige ao menos 3 peças selecionadas.', 'info', 4000)
    return
  }
  const board = sel[0].board
  if (sel.some((s) => s.board !== board)) {
    showToast('Selecione peças da mesma chapa para distribuir.', 'info', 4000)
    return
  }
  const horiz = axis === 'x'
  const list = [...sel].sort((a, b) =>
    horiz
      ? a.piece.x - b.piece.x || a.piece.y - b.piece.y
      : a.piece.y - b.piece.y || a.piece.x - b.piece.x
  )
  const lo = Math.min(...list.map((s) => (horiz ? s.piece.x : s.piece.y)))
  const hi = Math.max(...list.map((s) => (horiz ? s.piece.x + s.piece.w : s.piece.y + s.piece.h)))
  const total = list.reduce((sum, s) => sum + (horiz ? s.piece.w : s.piece.h), 0)
  const gap = (hi - lo - total) / (list.length - 1)
  if (gap < -0.05) {
    showToast('Não há espaço para distribuir sem sobrepor.', 'info', 4000)
    return
  }
  let cursor = lo
  const updates = list.map((s) => {
    const p = s.piece
    const u = horiz ? { piece: p, x: cursor, y: p.y } : { piece: p, x: p.x, y: cursor }
    cursor += (horiz ? p.w : p.h) + gap
    return u
  })
  if (!applyManualGroup(board, updates)) {
    showToast('A distribuição geraria sobreposição nesta chapa.', 'info', 4000)
    return
  }
  pushManualUndo()
  commitManualGroup(board, updates)
}

function manualToolbar() {
  const p = project()
  const count = p && p.manual ? Object.keys(p.manual).length : 0
  const selCount = selectedPlacements().length
  const btn = (label, title, onClick, disabled) =>
    h('button', { class: 'btn', title, disabled: !!disabled, onClick }, [label])
  return h('div', { class: 'card' }, [
    h('h2', {}, ['Ajuste manual do plano']),
    h('p', { class: 'help' }, [
      'O plano começa no corte serra/guilhotina. Arraste as peças na chapa: elas encaixam nas bordas e no kerf da serra. Para levar uma peça a outra chapa, arraste até ela. Clique numa peça para selecionar (Shift/Ctrl soma várias) e use alinhar/distribuir. Vermelho = posição inválida. Use ↻ para girar as peças de aproveitamento (tracejadas). Borda dourada = peça ajustada; borda azul = selecionada.'
    ]),
    h('div', { class: 'row' }, [
      btn('Desfazer', 'Desfazer o último ajuste', undoManual, !manualUndo.length),
      btn('Limpar ajustes', 'Voltar ao plano automático', clearManual, !count),
      btn('Limpar seleção', 'Desmarcar peças', () => clearManualSelection(true), !selCount),
      h('span', { class: 'help', style: 'align-self:center' }, [
        count ? `${count} peça(s) com posição manual` : 'Nenhum ajuste manual ainda'
      ])
    ]),
    selCount >= 2
      ? h('div', { class: 'row' }, [
          h('span', { class: 'help', style: 'align-self:center' }, [`${selCount} selecionada(s):`]),
          btn('Alinhar esq.', '', () => alignManual('left')),
          btn('Alinhar dir.', '', () => alignManual('right')),
          btn('Alinhar topo', '', () => alignManual('top')),
          btn('Alinhar base', '', () => alignManual('bottom')),
          btn('Distribuir H', '', () => distributeManual('x'), selCount < 3),
          btn('Distribuir V', '', () => distributeManual('y'), selCount < 3)
        ])
      : null
  ])
}

/* ============================== ABA CORTE ============================== */

function tabCorte() {
  const layout = layoutCache
  const s = state.settings
  const cutLabel =
    { guillotine: 'serra / guilhotina', bbw: 'BBW (linha de corte + aproveitamento)', free: 'nesting livre', mac: 'MAC (máximo aproveitamento)', manual: 'manual' }[
      s.cutMode
    ] || 'serra / guilhotina'
  const manual = s.cutMode === 'manual'
  const summary = h('div', { class: 'card' }, [
    h('h2', {}, ['Plano de corte do projeto']),
    h('p', { class: 'help' }, [
      layout.sheetsNeeded
        ? `${layout.sheetsNeeded} chapa(s) · aproveitamento ${layout.efficiency.toFixed(1)}% · modo ${cutLabel} · kerf ${s.kerf} mm. Cores = móvel.`
        : 'Adicione móveis para gerar o nesting.'
    ]),
    legend(),
    layout.boards.some((b) => b.placements.some((p) => p.hidden))
      ? h('p', { class: 'help' }, ['Tracejado = aproveitamento (fundos, caixotes e tamponamento): sem veio, entram por ultimo nas sobras da chapa.'])
      : null,
    layout.unplaced.length
      ? h('p', { class: 'unplaced' }, [
          `${layout.unplaced.length} peça(s) não cabem na chapa: ${layout.unplaced.map((x) => `[${x.furnitureCode}] ${x.name}`).join(', ')}`
        ])
      : null
  ])
  return h('div', {}, [
    kpis(),
    summary,
    manual ? manualToolbar() : null,
    h(
      'div',
      { class: 'sheet-wrap', id: 'plan-sheets' },
      layout.boards.length
        ? layout.boards.flatMap((board) => [sheetEl(board), sequenceEl(board)])
        : [h('p', { class: 'help' }, ['Nenhuma chapa gerada.'])]
    )
  ])
}

function sequenceEl(board) {
  const rows = cutSequence(board)
  if (!rows.length) return null
  return h('div', { class: 'cut-sequence' }, [
    h('h4', {}, [`Sequência de corte — chapa ${board.index} (${board.mode === 'guillotine' ? 'serra / guilhotina' : board.mode === 'bbw' ? 'BBW' : board.mode === 'mac' ? 'MAC' : board.mode === 'manual' ? 'manual' : 'livre'})`]),
    ...rows.map((row, i) =>
      h('div', { class: 'cut-row' }, [
        h('b', {}, [`${row.vertical ? 'Coluna' : 'Faixa'} ${i + 1} · ${Math.round(row.size)} mm`]),
        h(
          'span',
          {},
          row.pieces
            .map((p) => `${p.order}. [${p.furnitureCode || '?'}] ${p.name} ${Math.round(p.w)}×${Math.round(p.h)}${p.rotated ? ' ↻' : ''}`)
            .join('  ·  ')
        )
      ])
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
  const manual = state.settings.cutMode === 'manual'
  const pad = isMobileNow() ? 48 : 80
  const maxW = Math.min(920, Math.max(220, window.innerWidth - pad))
  const scale = maxW / board.sheetWidth
  const w = board.sheetWidth * scale
  const hgt = board.sheetHeight * scale
  const sheet = h('div', {
    class: 'sheet' + (manual ? ' sheet-manual' : ''),
    style: `width:${w}px;height:${hgt}px`,
    onClick: manual
      ? (e) => {
          if (e.target === sheet && manualSelection.size) {
            manualSelection.clear()
            render()
          }
        }
      : undefined
  })
  sheet.__board = board
  sheet.__scale = scale
  board.placements.forEach((p) => {
    const hasMove = manual && !!(project() && project().manual && project().manual[p.uid])
    const selected = manual && manualSelection.has(p.uid)
    const box = h(
      'div',
      {
        class:
          'piece-box' +
          (p.hidden ? ' piece-fill' : '') +
          (hasMove ? ' piece-manual' : '') +
          (selected ? ' piece-selected' : ''),
        title: manual
          ? canRotatePiece(p)
            ? 'Arraste para reposicionar (ou para outra chapa). Use ↻ para girar 90°.'
            : 'Arraste para reposicionar (peça com veio: não gira).'
          : p.hidden
            ? 'Aproveitamento (peça oculta — pode girar e usar sobras)'
            : '',
        style: [
          `left:${(board.trim + p.x) * scale}px`,
          `top:${(board.trim + p.y) * scale}px`,
          `width:${p.w * scale}px`,
          `height:${p.h * scale}px`,
          `background:${p.color || '#5c4033'}`
        ].join(';')
      },
      [
        h('i', { class: 'piece-order' }, [String(p.order || '')]),
        h('b', {}, [[`[${p.furnitureCode || '?'}] `, p.name, p.rotated ? ' ↻' : '']]),
        h('span', {}, [`${Math.round(p.w)} × ${Math.round(p.h)} mm`]),
        manual && canRotatePiece(p)
          ? h(
              'button',
              {
                class: 'piece-rotate',
                title: 'Girar 90°',
                onPointerDown: (e) => e.stopPropagation(),
                onClick: (e) => {
                  e.stopPropagation()
                  rotateManual(board, p)
                }
              },
              ['↻']
            )
          : null
      ]
    )
    if (manual) attachManualDrag(board, box, p, scale)
    sheet.append(box)
  })
  const free = manual ? largestFreeRect(board) : null
  return h('div', { style: 'margin-bottom:18px' }, [
    h('div', { class: 'sheet-head' }, [
      h('h3', {}, [
        `Chapa ${board.index} · ${board.sheetName || 'MDF'} ${Math.round(board.sheetWidth)}×${Math.round(board.sheetHeight)} · ${board.thickness || '—'} mm — ${board.efficiency.toFixed(1)}% · ${board.placements.length} peças`
      ]),
      manual
        ? h('span', { class: 'sheet-actions' }, [
            free && free.w > 0 && free.h > 0
              ? h('span', { class: 'help sheet-free' }, [
                  `Sobra contínua ${Math.round(free.w)} × ${Math.round(free.h)} mm`
                ])
              : null,
            h(
              'button',
              {
                class: 'btn small',
                title: 'Reencaixar as peças desta chapa (máximo aproveitamento)',
                onClick: () => tightenManualSheet(board)
              },
              ['Encaixar no canto']
            )
          ])
        : null
    ]),
    sheet
  ])
}

/* ============================== ABA CONFIG ============================== */

function settingsPatch(patch) {
  Object.assign(state.settings, patch)
  persist()
}

async function cancelPlan() {
  if (!authUser) {
    openAuth()
    return
  }
  let recurring = false
  let checked = false
  try {
    const info = await syncSubscription(authUser.id)
    if (info) {
      checked = true
      recurring = !!(info.subscription_id || info.mp_subscription_status === 'authorized')
      applyPlanPayload(info)
    }
  } catch {
    /* não deu para consultar: segue e tenta cancelar mesmo assim */
  }
  if (checked && !recurring) {
    showToast('Seu Pro é pagamento único (sem renovação). Não há cobrança para cancelar.', 'info', 6000)
    return
  }
  const ok = await confirmModal(
    'Cancelar a assinatura Pro? A próxima cobrança não acontece. O período já pago segue até o vencimento.',
    { title: 'Cancelar assinatura', confirmLabel: 'Cancelar assinatura', cancelLabel: 'Manter o Pro', danger: true }
  )
  if (!ok) return
  const overlay = document.createElement('div')
  overlay.className = 'capturing-overlay'
  overlay.textContent = 'Cancelando…'
  document.body.append(overlay)
  try {
    const r = await cancelSubscription(authUser.id)
    if (r && r.canceled) {
      showToast('Assinatura cancelada. O Pro segue até o vencimento.', 'ok', 5000)
      const synced = await syncSubscription(authUser.id).catch(() => null)
      if (synced) applyPlanPayload(synced)
      else render()
      return
    }
    showToast('Não deu para cancelar agora. Tente de novo ou fale com o suporte.', 'err', 5000)
  } catch (err) {
    if (err && err.code === 'no_subscription') {
      showToast('Seu Pro é pagamento único (sem renovação). Não há cobrança para cancelar.', 'info', 6000)
      return
    }
    showToast((err && err.message) || 'Não deu para cancelar agora.', 'err', 6000)
  } finally {
    overlay.remove()
  }
}

function extraSheetsCard(s, set) {
  const list = s.extraSheets || []
  const update = (id, patch) =>
    set({ extraSheets: list.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
  const remove = (id) => set({ extraSheets: list.filter((e) => e.id !== id) })
  const add = (base) =>
    set({
      extraSheets: [
        ...list,
        {
          id: newId(),
          name: (base && base.name) || 'MDF',
          width: (base && base.width) || 2440,
          height: (base && base.height) || 1220,
          thickness: Number(s.sheetThickness) || 15,
          price: Number(s.sheetPrice) || 0
        }
      ]
    })
  return h('div', { class: 'card' }, [
    h('h2', {}, ['Outros tamanhos de chapa']),
    h('p', { class: 'help' }, [
      'A chapa padrão acima é a principal. Cadastre aqui outras chapas (ex.: 25 mm para o tamponamento ou 2440×1220 para retalhos). O plano usa a menor chapa que couber a peça, respeitando a espessura.'
    ]),
    list.length
      ? h(
          'div',
          {},
          list.map((e) =>
            h('div', { class: 'row', style: 'margin-top:8px' }, [
              field('Nome', text(e.name || '', (v) => update(e.id, { name: v })), 'grow'),
              field('Largura mm', inputNum(e.width || 0, (v) => update(e.id, { width: v }))),
              field('Altura mm', inputNum(e.height || 0, (v) => update(e.id, { height: v }))),
              field('Espessura mm', inputNum(e.thickness || 0, (v) => update(e.id, { thickness: v }))),
              field('Preço', inputNum(e.price || 0, (v) => update(e.id, { price: v }), { step: '0.01' })),
              h('button', { class: 'btn small ghost danger-side', type: 'button', onClick: () => remove(e.id) }, ['Remover'])
            ])
          )
        )
      : h('p', { class: 'help' }, ['Nenhuma chapa extra.']),
    h('div', { class: 'row', style: 'margin-top:10px' }, [
      h('button', { class: 'btn small', type: 'button', onClick: () => add(null) }, ['Adicionar chapa'])
    ]),
    presetRow('Atalhos', SHEET_PRESETS, (p) => add({ name: p.name, width: p.width, height: p.height }))
  ])
}

function tabConta() {
  const s = state.settings
  const set = settingsPatch
  const plan = currentPlan()
  return h('div', {}, [
    h('div', { class: 'card' }, [
      h('h2', {}, ['Conta e empresa']),
      h('p', { class: 'help' }, ['Estes dados valem para todos os orçamentos: logo, WhatsApp, margem e materiais padrão.']),
      h('p', { class: 'help' }, [`Plano atual: ${planLabel(plan)}. ${authUser ? authUser.email : 'Sem login — os orçamentos ficam só neste aparelho.'}`]),
      cloudConfigured() && !authUser
        ? h('div', { class: 'row', style: 'margin-top:10px' }, [h('button', { class: 'btn primary', onClick: openAuth }, ['Entrar ou criar conta'])])
        : null,
      h('div', { class: 'row', style: 'margin-top:12px;flex-wrap:wrap' }, [
        isLimitedPlan(plan) ? h('a', { class: 'btn small ghost', href: '#/' }, ['Voltar ao site']) : null,
        h('a', { class: 'btn small ghost', href: supportHref(), target: '_blank', rel: 'noopener' }, [supportLabel()]),
        !isLimitedPlan(plan) && authUser
          ? h('button', { class: 'btn small ghost danger-side', onClick: cancelPlan }, ['Cancelar assinatura'])
          : null
      ]),
      h('p', { class: 'help' }, [
        isLimitedPlan(plan)
          ? 'Suporte por e-mail. No Pro você tem orçamentos ilimitados e a sua logo no documento.'
          : 'No Pro mensal, cancelar aqui impede a próxima cobrança (o período já pago segue até o vencimento). Se o Pro veio de pagamento único, ele não renova e não há cobrança para cancelar.'
      ])
    ]),
    h('div', { class: 'card' }, [
      h('h2', {}, ['Marca no documento']),
      h('div', { class: 'row' }, [
        field('Nome da empresa', text(s.shopName || '', (v) => set({ shopName: v })), 'grow'),
        field('Telefone / WhatsApp', text(s.shopPhone || '', (v) => set({ shopPhone: v })))
      ]),
      h('div', { class: 'logo-config' }, [
        canUseShopLogo()
          ? field(
              'Logo da marcenaria',
              h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', onChange: onLogoFile })
            )
          : h('p', { class: 'help' }, ['No plano Grátis o documento usa a marca MDF Atelier.']),
        canUseShopLogo() && s.shopLogo
          ? h('div', { class: 'logo-preview-row' }, [
              h('img', { class: 'logo-preview', src: s.shopLogo, alt: 'Logo atual' }),
              h('button', { class: 'btn small ghost', onClick: clearShopLogo }, ['Remover logo'])
            ])
          : canUseShopLogo()
            ? h('p', { class: 'help' }, ['A logo aparece na capa e no rodapé de todos os orçamentos. Sem arquivo, usamos o monograma.'])
            : h('button', { class: 'btn small primary', onClick: () => openUpgrade('No Pro a logo da sua marcenaria aparece na capa e no rodapé do orçamento.') }, ['Usar minha logo no Pro']),
      ]),
      h('p', { class: 'help' }, [
        'O WhatsApp aparece no documento com um QR code: ao escanear, o cliente já abre a conversa com o nome e o valor daquele orçamento.'
      ])
    ]),
    h('div', { class: 'row mobile-only', style: 'margin-top:2px' }, [
      h('button', { class: 'btn small ghost', onClick: () => selectTab('config') }, ['Configurações do app'])
    ])
  ])
}

function tabConfig() {
  const s = state.settings
  const set = settingsPatch
  return h('div', {}, [
    h('div', { class: 'row mobile-only', style: 'margin-bottom:4px' }, [
      h('button', { class: 'btn small ghost', onClick: () => selectTab('conta') }, ['Conta e empresa'])
    ]),
    h('div', { class: 'card' }, [
      h('h2', {}, ['Venda padrão']),
      h('div', { class: 'row' }, [
        field('Margem padrão sobre o custo %', inputNum(s.defaultMargin ?? 100, (v) => set({ defaultMargin: v }), { step: '5' }), 'grow'),
        field('% extra (mão de obra)', inputNum(s.laborPercent || 0, (v) => set({ laborPercent: v }), { step: '0.5' }))
      ]),
      h('p', { class: 'help' }, [
        'A margem padrão vale para todos os itens. Cada móvel pode ter a própria margem na aba Custos daquele orçamento.'
      ])
    ]),
    h('div', { class: 'card' }, [
      h('h2', {}, ['Chapa e corte padrão']),
      h('div', { class: 'row' }, [
        field('Nome da chapa', text(s.sheetName, (v) => set({ sheetName: v })), 'grow'),
        field('Largura mm', inputNum(s.sheetWidth, (v) => set({ sheetWidth: v }))),
        field('Altura mm', inputNum(s.sheetHeight, (v) => set({ sheetHeight: v }))),
        field('Espessura mm', inputNum(s.sheetThickness, (v) => set({ sheetThickness: v }))),
        field('Preço da chapa', inputNum(s.sheetPrice, (v) => set({ sheetPrice: v }), { step: '0.01' }))
      ]),
      presetRow('Chapa', SHEET_PRESETS, (p) => set({ sheetName: p.name, sheetWidth: p.width, sheetHeight: p.height })),
      presetRow(
        'Espessura',
        THICKNESS_PRESETS.map((t) => ({ label: `${t} mm`, value: t })),
        (p) => set({ sheetThickness: p.value })
      ),
      h('p', { class: 'help' }, [
        `Área da chapa: ${formatM2(sheetAreaM2(s))} · média ${formatMoney(panelPricePerM2(s))}/m² (preço da chapa ÷ área).`
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
        'Kerf é a perda da serra. Refilo reserva a borda da chapa. Serra/guilhotina gera faixas. Nesting livre encaixa melhor. MAC junta as peças no canto (máximo aproveitamento, deixa a sobra numa faixa só) — o desenho pode não sair em cortes retos. Manual deixa você arrastar as peças na aba Corte.'
      ])
    ]),
    extraSheetsCard(s, set),
    h('div', { class: 'card' }, [
      h('h2', {}, ['Fita de borda padrão']),
      h('div', { class: 'row' }, [
        field('Nome da fita', text(s.tapeName, (v) => set({ tapeName: v })), 'grow'),
        field('Preço por metro', inputNum(s.tapePricePerMeter, (v) => set({ tapePricePerMeter: v }), { step: '0.01' }))
      ]),
      presetRow('Modelos', TAPE_PRESETS, (name) => set({ tapeName: name }))
    ]),
    h('div', { class: 'card' }, [
      h('h2', {}, ['Ferragens e acessórios (preço unitário)']),
      h('div', { class: 'row' }, [
        field('Dobradiça', inputNum(s.hingePrice || 0, (v) => set({ hingePrice: v }), { step: '0.01' })),
        field('Corrediça (par)', inputNum(s.slidePrice || 0, (v) => set({ slidePrice: v }), { step: '0.01' })),
        field('Puxador', inputNum(s.handlePrice || 0, (v) => set({ handlePrice: v }), { step: '0.01' })),
        field('Trilho de correr', inputNum(s.trackPrice || 0, (v) => set({ trackPrice: v }), { step: '0.01' })),
        field('Pé regulável / rodízio', inputNum(s.footPrice || 0, (v) => set({ footPrice: v }), { step: '0.01' })),
        field('Fechadura', inputNum(s.lockPrice || 0, (v) => set({ lockPrice: v }), { step: '0.01' }))
      ]),
      h('p', { class: 'help' }, [
        'Dobradiça: 2 por porta de abrir (3 se a porta passar de 1800 mm). Corrediça: 1 par por gaveta. Puxador: 1 por porta ou gaveta. Fechadura: 1 por gaveta nos gaveteiros suspensos. Pé de MDF entra no corte; regulável e rodízio só no custo.'
      ])
    ])
  ])
}

/* ============================== barra superior / render ============================== */

function tabsDef() {
  return [
    ['projetos', 'Projetos'],
    ['orcamento', 'Orçamento'],
    ['custos', 'Custos'],
    ['pecas', 'Peças'],
    ['corte', 'Corte']
  ]
}

function topActions(p) {
  if (tab === 'projetos' || tab === 'conta' || tab === 'config' || !p) return []
  const btns = [h('button', { class: 'btn', title: 'Baixar CSV com todas as peças do projeto', onClick: () => exportCsv(p, piecesCache) }, ['CSV peças'])]
  btns.push(h('button', { class: 'btn', title: 'Planilha para importar no CorteCloud', onClick: () => exportCorteCloud(p, piecesCache, state.settings) }, ['CorteCloud']))
  if (tab === 'orcamento') {
    btns.unshift(
      h('button', { class: 'btn', title: 'Enviar o orçamento em PDF', onClick: shareQuote }, ['Enviar PDF']),
      h('button', { class: 'btn primary', title: 'Imprimir ou salvar em PDF o orçamento do cliente', onClick: printBudget }, ['Imprimir / PDF']),
      h('button', { class: 'btn', title: 'PDF interno com plano de corte', onClick: () => exportPdf(p, state.settings, layoutCache, summaryCache, piecesCache) }, ['PDF plano'])
    )
  } else if (tab === 'corte') {
    btns.unshift(
      h('button', { class: 'btn', title: 'Baixar o plano de corte em imagem PNG', onClick: async () => { try { await exportPlanPng(document.getElementById('plan-sheets'), p) } catch { alert('Não foi possível gerar o PNG do plano.') } } }, ['PNG plano']),
      h('button', { class: 'btn', title: 'PDF interno com plano de corte', onClick: () => exportPdf(p, state.settings, layoutCache, summaryCache, piecesCache) }, ['PDF plano'])
    )
  }
  return btns
}

function printBudget() {
  if (!isMobileNow() || printFull) {
    window.print()
    return
  }
  printFull = true
  render()
  requestAnimationFrame(() => {
    window.print()
    const done = () => {
      window.removeEventListener('afterprint', done)
      printFull = false
      render()
    }
    window.addEventListener('afterprint', done)
    setTimeout(() => {
      window.removeEventListener('afterprint', done)
      if (printFull) {
        printFull = false
        render()
      }
    }, 6000)
  })
}

function render() {
  focusSeq = 0
  const root = document.getElementById('app')
  const scroller = document.scrollingElement || document.documentElement
  const scrollTop = scroller.scrollTop
  const contentEl = document.querySelector('.content')
  const contentScroll = contentEl ? contentEl.scrollTop : 0
  const planEl = document.getElementById('plan-sheets')
  const planScroll = planEl ? { top: planEl.scrollTop, left: planEl.scrollLeft } : null
  const tabChanged = tab !== lastRenderTab
  lastRenderTab = tab
  const prevActive = document.activeElement
  const prevTag = prevActive ? prevActive.tagName : ''
  const isEdit = prevTag === 'INPUT' || prevTag === 'SELECT' || prevTag === 'TEXTAREA'
  const prevKey = isEdit && prevActive.getAttribute ? prevActive.getAttribute('data-k') : null
  const prevSel = isEdit && (prevTag === 'INPUT' || prevTag === 'TEXTAREA') ? prevActive.selectionStart : null
  const modalBodyEl = document.querySelector('.modal-body')
  const modalScrollTop = modalBodyEl ? modalBodyEl.scrollTop : 0
  root.innerHTML = ''
  const p = project()
  const mobile = isMobileNow()
  if (!selectedFurnitureId && furnitureList()[0]) selectedFurnitureId = furnitureList()[0].id

  const body =
    tab === 'projetos'
      ? tabProjetos()
      : tab === 'conta'
        ? tabConta()
        : tab === 'config'
          ? tabConfig()
          : mobile && tab === 'orcamento' && !printFull
            ? mobileOrcamento()
            : tab === 'orcamento'
              ? tabOrcamento()
              : tab === 'custos'
                ? tabCustos()
                : tab === 'pecas'
                  ? tabPecas()
                  : tab === 'corte'
                    ? tabCorte()
                    : tabProjetos()

  const title =
    tab === 'projetos' || tab === 'conta' || tab === 'config' || !p
      ? [
          isLimitedPlan(currentPlan())
            ? h('a', { class: 'top-home', href: '#/' }, [h('strong', {}, ['MDF Atelier'])])
            : h('strong', {}, ['MDF Atelier']),
          h('span', {}, [
            tab === 'conta' ? 'Configuração da conta' : tab === 'config' ? 'Configurações do app' : 'Seus orçamentos'
          ])
        ]
      : [
          h('strong', {}, [p.name]),
          h('span', {}, [`${(p.furniture || []).length} móvel(is) · ${(p.client && p.client) || 'sem cliente'} · `, new Date(p.createdAt).toLocaleDateString('pt-BR')])
        ]

  root.append(
    h('div', { class: 'app' }, [
      sideNav(),
      h('section', { class: 'main' }, [
        h('div', { class: 'topbar' }, [
          h('div', { class: 'top-title' }, title),
          h('div', { class: 'actions' }, topActions(p)),
          accountMenu()
        ]),
        h('div', { class: 'content' }, [body]),
        tab === 'orcamento' && !modal ? fabButton() : null,
        mobile && !modal ? mobileNav() : null
      ])
    ])
  )
  const tour = printFull ? null : tourOverlay()
  if (tour) root.append(tour)
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
  const newContent = root.querySelector('.content')
  if (tabChanged) {
    if (newContent) newContent.scrollTop = 0
  } else {
    scroller.scrollTop = scrollTop
    if (newContent) newContent.scrollTop = contentScroll
    if (planScroll) {
      const newPlan = root.querySelector('#plan-sheets')
      if (newPlan) {
        newPlan.scrollTop = planScroll.top
        newPlan.scrollLeft = planScroll.left
      }
    }
  }
  if (isEdit) {
    if (prevKey) {
      const restored = root.querySelector(`[data-k="${prevKey}"]`)
      if (restored) {
        restored.focus()
        if ((prevTag === 'INPUT' || prevTag === 'TEXTAREA') && prevSel != null) {
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
  document.body.style.overflow = tour || (modal && modal.kind !== 'auth') ? 'hidden' : ''
}

function fabButton() {
  return h('button', { class: 'fab', onClick: openModalNew, title: 'Adicionar móvel ao orçamento' }, ['+'])
}

const TOUR_KEY = 'mdf-atelier-tour-v1'
const TOUR_STEPS = [
  {
    title: 'Seus orçamentos',
    body: 'A tela inicial lista os projetos. Toque em um para abrir, ou crie um novo. Logo e WhatsApp ficam em Conta; margem, chapa e fita em Configurações.'
  },
  {
    title: 'Monte o móvel em 4 passos',
    body: 'No orçamento, toque no + para escolher o modelo. Medidas, acabamento, peças extras e revisão — um passo de cada vez.'
  },
  {
    title: 'Envie o PDF',
    body: 'Use Enviar PDF para mandar o orçamento pelo WhatsApp, ou Imprimir para gerar o documento completo.'
  }
]

function tourSeen() {
  try {
    return localStorage.getItem(TOUR_KEY) === '1'
  } catch {
    return true
  }
}
function markTourSeen() {
  try {
    localStorage.setItem(TOUR_KEY, '1')
  } catch {
    /* ignore */
  }
  tourStep = 0
  refresh()
}
function maybeStartTour() {
  if (tourSeen()) return
  if (tourStep < 1) tourStep = 1
}
function tourOverlay() {
  if (!tourStep || tourSeen()) return null
  const i = Math.min(TOUR_STEPS.length, Math.max(1, tourStep)) - 1
  const step = TOUR_STEPS[i]
  const last = i === TOUR_STEPS.length - 1
  return h('div', { class: 'tour-backdrop', onClick: (e) => e.target === e.currentTarget && markTourSeen() }, [
    h('div', { class: 'tour-card' }, [
      h('span', { class: 'help' }, [`${i + 1} / ${TOUR_STEPS.length}`]),
      h('h2', {}, [step.title]),
      h('p', {}, [step.body]),
      h('div', { class: 'row' }, [
        h('button', { class: 'btn ghost', onClick: markTourSeen }, ['Pular']),
        last
          ? h('button', { class: 'btn primary', onClick: markTourSeen }, ['Começar'])
          : h('button', { class: 'btn primary', onClick: () => { tourStep = i + 2; refresh() } }, ['Próximo'])
      ])
    ])
  ])
}

function registerPwa() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {})
}

let appStarted = false
let currentScreen = null

const SITE_ORIGIN = 'https://wolfsaas.com.br'
const BASE_PATH = import.meta.env.BASE_URL || '/'
function siteUrl(hash) {
  return SITE_ORIGIN + BASE_PATH.replace(/\/$/, '/') + (hash || '')
}
const SCREEN_META = {
  landing: {
    title: 'MDF Atelier — Orçamentos de móveis planejados',
    desc: 'Monte o móvel, o app calcula chapas, sobras, fita e margem e gera o orçamento em PDF com a sua marca. Teste grátis.',
    url: siteUrl('')
  },
  app: {
    title: 'MDF Atelier — App do marceneiro',
    desc: 'Monte móveis, calcule chapas, sobras e margem e gere o orçamento em PDF. Seus dados ficam com você.',
    url: siteUrl('#/app')
  },
  termos: {
    title: 'Termos de Uso — MDF Atelier',
    desc: 'Condições de uso do MDF Atelier: conta, planos, cancelamento e responsabilidades.',
    url: siteUrl('#/termos')
  },
  privacidade: {
    title: 'Privacidade — MDF Atelier',
    desc: 'Como o MDF Atelier trata seus dados: o que fica no aparelho, o que vai para a nuvem e como pedir exclusão.',
    url: siteUrl('#/privacidade')
  }
}

function setMeta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.append(el)
  }
  el.setAttribute('content', value)
}

function setScreenMeta(screen) {
  const m = SCREEN_META[screen] || SCREEN_META.landing
  document.title = m.title
  setMeta('property', 'og:title', m.title)
  setMeta('property', 'og:description', m.desc)
  setMeta('property', 'og:url', m.url)
  setMeta('name', 'twitter:title', m.title)
  setMeta('name', 'twitter:description', m.desc)
  const desc = document.head.querySelector('meta[name="description"]')
  if (desc) desc.setAttribute('content', m.desc)
  const canonical = document.head.querySelector('link[rel="canonical"]')
  if (canonical) canonical.setAttribute('href', m.url)
}

function desiredScreen() {
  const hash = location.hash || ''
  if (hash.startsWith('#/admin')) return 'admin'
  if (hash.startsWith('#/app') || hashHasPlanOk()) return 'app'
  if (hash.startsWith('#/termos')) return 'termos'
  if (hash.startsWith('#/privacidade')) return 'privacidade'
  return 'landing'
}

function landingAnchor() {
  const hash = location.hash || ''
  if (!hash || hash === '#' || hash === '#/') return ''
  if (
    hash.startsWith('#/app') ||
    hash.startsWith('#/admin') ||
    hash.startsWith('#/termos') ||
    hash.startsWith('#/privacidade')
  )
    return ''
  return hash.replace(/^#\/?/, '')
}

function scrollLanding() {
  const id = landingAnchor()
  if (!id) {
    window.scrollTo(0, 0)
    return
  }
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  else window.scrollTo(0, 0)
}

function showScreen() {
  const desired = desiredScreen()
  if (desired === 'admin') {
    location.replace('admin.html')
    return
  }
  if (currentScreen === desired) {
    if (desired === 'app') {
      consumeUpgradeIntent()
      consumePlanReturn()
      consumeInfinityReturn()
    } else if (desired === 'landing') {
      scrollLanding()
    }
    return
  }
  currentScreen = desired
  setScreenMeta(desired)
  const root = document.getElementById('app')
  document.body.style.overflow = ''
  if (desired === 'app') {
    stopLanding()
    document.body.classList.remove('landing-mode')
    if (!appStarted) {
      appStarted = true
      maybeStartTour()
      registerPwa()
      recalc()
      render()
      consumeUpgradeIntent()
      if (cloudConfigured()) {
        setAuthListener((u) => {
          authUser = u
          if (u) {
            syncAfterLogin().then(() => {
              consumePlanReturn()
              consumeInfinityReturn()
            })
          } else render()
        })
        cloudInit()
      } else {
        consumePlanReturn()
        consumeInfinityReturn()
      }
    } else {
      recalc()
      render()
      consumeUpgradeIntent()
      consumePlanReturn()
      consumeInfinityReturn()
    }
  } else {
    document.body.classList.add('landing-mode')
    root.innerHTML = ''
    const html = desired === 'termos' ? termosHTML() : desired === 'privacidade' ? privacidadeHTML() : landingHTML()
    root.insertAdjacentHTML('afterbegin', html)
    if (desired === 'landing') {
      scrollLanding()
      initLanding()
    } else {
      stopLanding()
      window.scrollTo(0, 0)
    }
  }
}

function syncKbClass() {
  const t = document.activeElement
  const on = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')
  document.body.classList.toggle('kb-open', !!on)
}
document.addEventListener('focusin', syncKbClass)
document.addEventListener('focusout', () => setTimeout(syncKbClass, 0))

window.addEventListener('resize', () => {
  if (currentScreen !== 'app') return
  const ae = document.activeElement
  const tag = ae && ae.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
  if (tab === 'corte' || tab === 'pecas' || tab === 'orcamento') render()
})
window.addEventListener('hashchange', showScreen)

if (cloudConfigured()) {
  cloudInit()
    .then((u) => {
      if (isAdminEmail(u && u.email)) location.replace('admin.html')
    })
    .catch(() => {})
}

Promise.race([loadPlanConfig(), new Promise((r) => setTimeout(r, 1500))]).finally(showScreen)
