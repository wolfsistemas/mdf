import { createFurniture, modelByTypeVariant } from './catalog.js'

export const KEY = 'mdf-atelier-v2'

export const GRAIN = {
  livre: 'Livre (pode girar)',
  comprimento: 'Veio no comprimento',
  largura: 'Veio na largura'
}

export const CUT_MODES = {
  guillotine: 'Serra / guilhotina',
  free: 'Nesting livre'
}

const uid = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)

export function defaultSettings() {
  return {
    kerf: 3.2,
    trim: 0,
    cutMode: 'guillotine',
    currency: 'BRL',
    sheetWidth: 2750,
    sheetHeight: 1830,
    sheetThickness: 15,
    sheetPrice: 180,
    sheetName: 'MDF 15 mm 2750x1830',
    tapePricePerMeter: 2.5,
    tapeName: 'Fita PVC 22 mm',
    laborPercent: 0,
    defaultMargin: 100,
    shopName: 'MDF Atelier',
    shopPhone: ''
  }
}

function sampleProject() {
  const armario = createFurniture(modelByTypeVariant('armario', '3-portas'), [])
  armario.name = 'Armário escritório'
  armario.params = {
    ...armario.params,
    width: 1200,
    height: 1800,
    depth: 500,
    doors: 3,
    shelves: 4,
    hasBack: 1,
    carcassT: 15,
    backT: 15,
    doorT: 15
  }
  const mesa = createFurniture(modelByTypeVariant('mesa', 'gaveteiro'), [armario])
  mesa.name = 'Mesa com gaveteiro'
  mesa.params = {
    ...mesa.params,
    width: 1400,
    depth: 600,
    height: 750,
    thickness: 15,
    modesty: 1,
    saiaH: 120,
    gavetas: 3,
    gavH: 170,
    drawerBase: 'alto',
    baseH: 150,
    pedW: 0,
    shelf: 0
  }
  const closet = createFurniture(modelByTypeVariant('guarda-roupa', 'closet'), [armario, mesa])
  closet.name = 'Closet quarto'
  closet.params = {
    ...closet.params,
    width: 1600,
    height: 2100,
    depth: 580,
    doors: 0,
    shelves: 2,
    divisors: 1,
    cabideiro: 1,
    hasBack: 1
  }
  return {
    id: uid(),
    name: 'Escritório e quarto — exemplo',
    client: 'Fulano da Silva',
    phone: '',
    notes: 'Exemplo: armário 3 portas, mesa com gaveteiro e closet. Edite as medidas ou adicione móveis do catálogo.',
    createdAt: Date.now(),
    billingBasis: 'used',
    furniture: [armario, mesa, closet]
  }
}

export function piece(name, length, width, thickness, qty, grain, edges) {
  return {
    id: uid(),
    name,
    length,
    width,
    thickness,
    qty,
    grain,
    edges: edges || { front: false, back: false, left: false, right: false },
    notes: ''
  }
}

export function blankPiece() {
  return piece('Nova peça', 600, 400, 15, 1, 'livre', {
    front: false,
    back: false,
    left: false,
    right: false
  })
}

export function blankProject() {
  return {
    id: uid(),
    name: 'Novo orçamento',
    client: '',
    phone: '',
    notes: '',
    createdAt: Date.now(),
    billingBasis: 'used',
    furniture: []
  }
}

function migrateProject(p) {
  if (p.furniture) {
    return {
      ...p,
      client: p.client || '',
      phone: p.phone || '',
      billingBasis: p.billingBasis === 'rateio' ? 'rateio' : 'used',
      furniture: p.furniture
    }
  }
  const avulso = createFurniture('avulso', [])
  avulso.name = p.name || 'Peças avulsas'
  avulso.extraPieces = (p.pieces || []).map((x) => ({
    ...x,
    id: x.id || uid(),
    edges: { ...(x.edges || {}) }
  }))
  return {
    id: p.id || uid(),
    name: p.name || 'Projeto',
    client: p.client || '',
    phone: p.phone || '',
    notes: p.notes || '',
    createdAt: p.createdAt || Date.now(),
    billingBasis: p.billingBasis === 'rateio' ? 'rateio' : 'used',
    furniture: [avulso]
  }
}

export function loadState() {
  try {
    const v2 = localStorage.getItem(KEY)
    const v1 = localStorage.getItem('mdf-atelier-v1')
    const raw = v2 || v1
    if (!raw) {
      const project = sampleProject()
      return { settings: defaultSettings(), activeProjectId: project.id, projects: [project] }
    }
    const data = JSON.parse(raw)
    if (!data.projects?.length) {
      const project = sampleProject()
      return { settings: defaultSettings(), activeProjectId: project.id, projects: [project] }
    }
    data.settings = { ...defaultSettings(), ...data.settings }
    data.projects = data.projects.map(migrateProject)
    if (!v2 && v1) {
      const sample = sampleProject()
      data.projects.unshift(sample)
      data.activeProjectId = sample.id
    }
    if (!data.projects.some((p) => p.id === data.activeProjectId)) {
      data.activeProjectId = data.projects[0].id
    }
    return data
  } catch {
    const project = sampleProject()
    return { settings: defaultSettings(), activeProjectId: project.id, projects: [project] }
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function formatMoney(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatMm(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return Number.isInteger(v) ? `${v} mm` : `${v.toFixed(1)} mm`
}

export function formatM2(n) {
  return `${n.toFixed(3)} m²`
}

export function formatMeters(n) {
  return `${n.toFixed(2)} m`
}

export function newId() {
  return uid()
}
