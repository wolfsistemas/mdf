const KEY = 'mdf-atelier-v1'

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
    sheetThickness: 18,
    sheetPrice: 180,
    sheetName: 'MDF 18 mm 2750x1830',
    tapePricePerMeter: 2.5,
    tapeName: 'Fita PVC 22 mm'
  }
}

function defaultState() {
  const settings = defaultSettings()
  const projectId = uid()
  return {
    settings,
    activeProjectId: projectId,
    projects: [
      {
        id: projectId,
        name: 'Armário 800 — exemplo',
        notes: 'Módulo de 800 mm. Edite ou crie um projeto novo.',
        createdAt: Date.now(),
        pieces: [
          piece('Lateral', 720, 500, 18, 2, 'comprimento', { front: true, back: true, left: false, right: true }),
          piece('Base', 764, 500, 18, 1, 'comprimento', { front: true, back: false, left: true, right: true }),
          piece('Tampo', 764, 500, 18, 1, 'comprimento', { front: true, back: false, left: true, right: true }),
          piece('Prateleira', 764, 480, 18, 2, 'comprimento', { front: true, back: false, left: false, right: false }),
          piece('Porta', 715, 397, 18, 2, 'comprimento', { front: true, back: true, left: true, right: true }),
          piece('Fundo', 764, 704, 15, 1, 'livre', { front: false, back: false, left: false, right: false })
        ]
      }
    ]
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
  return piece('Nova peça', 600, 400, 18, 1, 'livre', {
    front: false,
    back: false,
    left: false,
    right: false
  })
}

export function blankProject() {
  return {
    id: uid(),
    name: 'Novo projeto',
    notes: '',
    createdAt: Date.now(),
    pieces: []
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    const data = JSON.parse(raw)
    if (!data.projects?.length) return defaultState()
    data.settings = { ...defaultSettings(), ...data.settings }
    return data
  } catch {
    return defaultState()
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
