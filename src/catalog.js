const uid = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)

function makePiece(name, length, width, thickness, qty, grain, edges) {
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

export const FURNITURE_COLORS = [
  '#2E5A88',
  '#3D6B4F',
  '#A85A3A',
  '#7A3E52',
  '#B0892E',
  '#3F5E8A',
  '#6B6B3A',
  '#5A6570',
  '#8B3A3A',
  '#2F6F6F',
  '#5E8A7A',
  '#A95E2E'
]

const nf = (key, label) => ({ key, label, kind: 'num' })
const cf = (key, label) => ({ key, label, kind: 'check' })
const sf = (key, label, options) => ({ key, label, kind: 'select', options })

const DRAWER_HEIGHT = () => [nf('gavH', 'Altura da gaveta mm (0 = automática)')]
const DESK_DRAWERS = () => [
  nf('gavetas', 'Gavetas'),
  nf('pedW', 'Largura col. gavetas mm'),
  nf('gavH', 'Altura da gaveta mm (0 = automática)'),
  sf('drawerBase', 'Base das gavetas', [
    ['chao', 'Gavetas até o chão'],
    ['alto', 'Suspensas (vão embaixo)']
  ]),
  nf('baseH', 'Vão sob as gavetas mm')
]
const MESA_SAIA = () => [cf('modesty', 'Saia / vedação'), nf('saiaH', 'Altura da saia mm')]

const COMMON_BOX_FIELDS = (hasDivs = false) => [
  nf('width', 'Largura mm'),
  nf('height', 'Altura mm'),
  nf('depth', 'Profundidade mm'),
  nf('doors', 'Portas'),
  nf('shelves', 'Prateleiras'),
  ...(hasDivs ? [nf('divisors', 'Divisores internos')] : []),
  cf('hasBack', 'Fundo 15 mm'),
  nf('carcassT', 'Esp. caixa mm'),
  nf('backT', 'Esp. fundo mm'),
  nf('doorT', 'Esp. porta mm')
]

const BOX_CARCASS = {
  width: 800,
  height: 1800,
  depth: 500,
  doors: 2,
  shelves: 3,
  divisors: 0,
  hasBack: 1,
  carcassT: 15,
  backT: 15,
  doorT: 15
}

const BOX_CARCASS_SLIDING = {
  ...BOX_CARCASS,
  doors: 4,
  doorStyle: 'correr'
}

export const CATALOG_GROUPS = [
  {
    group: 'Mesas',
    models: [
      {
        type: 'mesa',
        variant: 'reta',
        label: 'Mesa reta',
        blurb: 'Tampo com laterais ou pernas. Sem gavetas.',
        defaults: { width: 1400, depth: 600, height: 750, thickness: 15, modesty: 1, saiaH: 120, shelf: 0, gavetas: 0, retLen: 0, retDepth: 500, pernas: 'laterais' },
        fields: [
          nf('width', 'Largura mm'),
          nf('depth', 'Profundidade mm'),
          nf('height', 'Altura mm'),
          nf('thickness', 'Esp. tampo mm'),
          ...MESA_SAIA(),
          cf('shelf', 'Prateleira inferior'),
          sf('pernas', 'Base', [
            ['laterais', 'Painéis laterais'],
            ['pernas', 'Pernas soltas (aprox.)']
          ])
        ]
      },
      {
        type: 'mesa',
        variant: 'gaveteiro',
        label: 'Mesa c/ gaveteiro',
        blurb: 'Mesa reta com coluna de gavetas lateral.',
        defaults: { ...BOX_CARCASS, width: 1400, depth: 600, height: 750, thickness: 15, modesty: 1, saiaH: 120, shelf: 0, gavetas: 3, gavH: 0, pedW: 0, drawerBase: 'chao', baseH: 120, retLen: 0, retDepth: 500 },
        fields: [
          nf('width', 'Largura mm'),
          nf('depth', 'Profundidade mm'),
          nf('height', 'Altura mm'),
          nf('thickness', 'Esp. tampo mm'),
          ...DESK_DRAWERS(),
          ...MESA_SAIA(),
          cf('shelf', 'Prateleira inferior')
        ]
      },
      {
        type: 'mesa',
        variant: 'l-esq',
        label: 'Mesa em L (retorno esq.)',
        blurb: 'Corpo principal + retorno à esquerda.',
        defaults: { ...BOX_CARCASS, width: 1400, depth: 600, height: 750, thickness: 15, modesty: 1, saiaH: 120, shelf: 0, gavetas: 0, gavH: 0, pedW: 0, drawerBase: 'chao', baseH: 120, retLen: 800, retDepth: 600 },
        fields: [
          nf('width', 'Largura principal mm'),
          nf('depth', 'Profundidade mm'),
          nf('retLen', 'Compr. do retorno mm'),
          nf('retDepth', 'Prof. do retorno mm'),
          nf('height', 'Altura mm'),
          nf('thickness', 'Esp. tampo mm'),
          ...DESK_DRAWERS(),
          ...MESA_SAIA(),
          cf('shelf', 'Prateleira inferior')
        ]
      },
      {
        type: 'mesa',
        variant: 'l-dir',
        label: 'Mesa em L (retorno dir.)',
        blurb: 'Corpo principal + retorno à direita.',
        defaults: { ...BOX_CARCASS, width: 1400, depth: 600, height: 750, thickness: 15, modesty: 1, saiaH: 120, shelf: 0, gavetas: 3, gavH: 0, pedW: 0, drawerBase: 'chao', baseH: 120, retLen: 800, retDepth: 600 },
        fields: [
          nf('width', 'Largura principal mm'),
          nf('depth', 'Profundidade mm'),
          nf('retLen', 'Compr. do retorno mm'),
          nf('retDepth', 'Prof. do retorno mm'),
          nf('height', 'Altura mm'),
          nf('thickness', 'Esp. tampo mm'),
          ...DESK_DRAWERS(),
          ...MESA_SAIA(),
          cf('shelf', 'Prateleira inferior')
        ]
      },
      {
        type: 'mesa',
        variant: 'jantar',
        label: 'Mesa de jantar',
        blurb: 'Tampo grande com 2 tampas e 4 pernas (aprox.).',
        defaults: { width: 1800, depth: 900, height: 750, thickness: 15, modesty: 0, saiaH: 140 },
        fields: [
          nf('width', 'Largura mm'),
          nf('depth', 'Profundidade mm'),
          nf('height', 'Altura mm'),
          nf('thickness', 'Esp. tampo mm'),
          ...MESA_SAIA()
        ]
      },
      {
        type: 'mesa',
        variant: 'escrivaninha',
        label: 'Escrivaninha c/ gaveta',
        blurb: 'Pequena, com gavetas sob o tampo.',
        defaults: { width: 1000, depth: 500, height: 750, thickness: 15, gavetas: 2, gavH: 0, pedW: 0, drawerBase: 'chao', baseH: 100, modesty: 0, saiaH: 100 },
        fields: [
          nf('width', 'Largura mm'),
          nf('depth', 'Profundidade mm'),
          nf('height', 'Altura mm'),
          nf('thickness', 'Esp. tampo mm'),
          ...DESK_DRAWERS(),
          ...MESA_SAIA()
        ]
      },
      {
        type: 'mesa',
        variant: 'reuniao',
        label: 'Mesa de reunião',
        blurb: 'Tampo reto alongado, sem gavetas.',
        defaults: { width: 2400, depth: 1200, height: 750, thickness: 15, modesty: 0, saiaH: 100 },
        fields: [nf('width', 'Largura mm'), nf('depth', 'Profundidade mm'), nf('thickness', 'Esp. tampo mm'), ...MESA_SAIA()]
      }
    ]
  },
  {
    group: 'Armários',
    models: [
      { type: 'armario', variant: '1-porta', label: 'Armário 1 porta', blurb: 'Caixa com prateleiras e uma porta.', defaults: { ...BOX_CARCASS, width: 600, doors: 1, shelves: 3 }, fields: COMMON_BOX_FIELDS() },
      { type: 'armario', variant: '2-portas', label: 'Armário 2 portas', blurb: 'Portas duplas, prateleiras.', defaults: { ...BOX_CARCASS, width: 900, doors: 2, shelves: 4 }, fields: COMMON_BOX_FIELDS() },
      { type: 'armario', variant: '3-portas', label: 'Armário 3 portas', blurb: 'Caixa com divisor e três portas.', defaults: { ...BOX_CARCASS, width: 1300, doors: 3, shelves: 4, divisors: 1 }, fields: COMMON_BOX_FIELDS(true) },
      { type: 'armario', variant: '4-portas', label: 'Armário 4 portas', blurb: 'Duas colunas, quatro portas.', defaults: { ...BOX_CARCASS, width: 1700, doors: 4, shelves: 4, divisors: 1 }, fields: COMMON_BOX_FIELDS(true) },
      { type: 'armario', variant: 'baixo-portas', label: 'Armário baixo / balcão', blurb: 'Balcão com portas e prateleiras.', defaults: { ...BOX_CARCASS, width: 1200, height: 800, depth: 500, doors: 3, shelves: 1 }, fields: COMMON_BOX_FIELDS() },
      { type: 'armario', variant: 'baixo-gavetas', label: 'Armário baixo c/ gavetas', blurb: 'Balcão com coluna de gavetas.', defaults: { ...BOX_CARCASS, width: 1200, height: 800, depth: 500, doors: 0, shelves: 1, gavetas: 3, zoneH: 340 }, fields: COMMON_BOX_FIELDS().concat([nf('gavetas', 'Gavetas embaixo')]) },
      { type: 'armario', variant: 'alto-portas', label: 'Armário com gavetas embaixo', blurb: 'Portas em cima e gavetas na base.', defaults: { ...BOX_CARCASS, width: 1200, doors: 3, shelves: 3, gavetas: 2, zoneH: 320 }, fields: COMMON_BOX_FIELDS().concat([nf('gavetas', 'Gavetas embaixo')]) },
      { type: 'armario', variant: 'aereo', label: 'Armário aéreo', blurb: 'Alto, menos profundo, para cozinha.', defaults: { ...BOX_CARCASS, width: 900, height: 900, depth: 350, doors: 2, shelves: 2 }, fields: COMMON_BOX_FIELDS() },
      { type: 'armario', variant: 'cristaleira', label: 'Cristaleira / vitrine', blurb: 'Portas com vidro, prateleiras internas.', defaults: { ...BOX_CARCASS, width: 900, height: 2000, doors: 2, shelves: 4 }, fields: COMMON_BOX_FIELDS() }
    ]
  },
  {
    group: 'Guarda-roupas e closets',
    models: [
      { type: 'guarda-roupa', variant: '2-portas', label: 'Guarda-roupa 2 portas', blurb: 'Abrir, cabideiro e prateleiras.', defaults: { ...BOX_CARCASS, width: 1200, height: 2100, depth: 580, doors: 2, shelves: 3 }, fields: COMMON_BOX_FIELDS() },
      { type: 'guarda-roupa', variant: '3-portas', label: 'Guarda-roupa 3 portas', blurb: 'Três portas, divisor central.', defaults: { ...BOX_CARCASS, width: 1800, height: 2100, depth: 580, doors: 3, shelves: 3, divisors: 1 }, fields: COMMON_BOX_FIELDS(true) },
      { type: 'guarda-roupa', variant: '4-portas', label: 'Guarda-roupa 4 portas', blurb: 'Quatro portas, dois vãos.', defaults: { ...BOX_CARCASS, width: 2300, height: 2100, depth: 580, doors: 4, shelves: 3, divisors: 1 }, fields: COMMON_BOX_FIELDS(true) },
      { type: 'guarda-roupa', variant: '6-portas', label: 'Guarda-roupa 6 portas', blurb: 'Grande, três vãos, quatro divisores.', defaults: { ...BOX_CARCASS, width: 3200, height: 2100, depth: 580, doors: 6, shelves: 3, divisors: 2 }, fields: COMMON_BOX_FIELDS(true) },
      { type: 'guarda-roupa', variant: 'correr-2', label: 'Guarda-roupa de correr 2', blurb: 'Duas folhas deslizantes.', defaults: { ...BOX_CARCASS_SLIDING, width: 1600, height: 2200, depth: 600, doors: 2, shelves: 2, divisors: 1 }, fields: COMMON_BOX_FIELDS(true) },
      { type: 'guarda-roupa', variant: 'correr-4', label: 'Guarda-roupa de correr 4', blurb: 'Quatro folhas deslizantes.', defaults: { ...BOX_CARCASS_SLIDING, width: 3000, height: 2200, depth: 600, doors: 4, shelves: 2, divisors: 1 }, fields: COMMON_BOX_FIELDS(true) },
      { type: 'guarda-roupa', variant: 'com-gavetas', label: 'Guarda-roupa c/ gavetas', blurb: 'Sapateira/gavetas na base + portas.', defaults: { ...BOX_CARCASS, width: 1800, height: 2100, depth: 580, doors: 3, shelves: 2, divisors: 1, gavetas: 3, zoneH: 360 }, fields: COMMON_BOX_FIELDS(true).concat([nf('gavetas', 'Gavetas na base')]) },
      { type: 'guarda-roupa', variant: 'closet', label: 'Closet (aberto)', blurb: 'Módulo sem portas, cabideiro.', defaults: { ...BOX_CARCASS, width: 1000, height: 2100, depth: 580, doors: 0, shelves: 2, divisors: 1, cabideiro: 1 }, fields: COMMON_BOX_FIELDS(true) }
    ]
  },
  {
    group: 'Gaveteiros e cômodas',
    models: [
      { type: 'gaveteiro', variant: '2', label: 'Gaveteiro 2 gavetas', blurb: 'Pequeno, uso sob mesa.', defaults: { width: 420, height: 460, depth: 460, gavetas: 2, carcassT: 15, backT: 15, frontT: 15 }, fields: [nf('width', 'Largura mm'), nf('height', 'Altura mm'), nf('depth', 'Profundidade mm'), nf('gavetas', 'Gavetas'), nf('carcassT', 'Esp. caixa mm'), nf('backT', 'Esp. fundo mm'), nf('frontT', 'Esp. frente mm')] },
      { type: 'gaveteiro', variant: '3', label: 'Gaveteiro 3 gavetas', blurb: 'Padrão de escritório.', defaults: { width: 450, height: 640, depth: 480, gavetas: 3, carcassT: 15, backT: 15, frontT: 15 }, fields: [nf('width', 'Largura mm'), nf('height', 'Altura mm'), nf('depth', 'Profundidade mm'), nf('gavetas', 'Gavetas'), nf('carcassT', 'Esp. caixa mm'), nf('backT', 'Esp. fundo mm'), nf('frontT', 'Esp. frente mm')] },
      { type: 'gaveteiro', variant: '4', label: 'Gaveteiro 4 gavetas', blurb: 'Volumoso, uso geral.', defaults: { width: 450, height: 760, depth: 480, gavetas: 4, carcassT: 15, backT: 15, frontT: 15 }, fields: [nf('width', 'Largura mm'), nf('height', 'Altura mm'), nf('depth', 'Profundidade mm'), nf('gavetas', 'Gavetas'), nf('carcassT', 'Esp. caixa mm'), nf('backT', 'Esp. fundo mm'), nf('frontT', 'Esp. frente mm')] },
      { type: 'gaveteiro', variant: '5', label: 'Gaveteiro 5 gavetas', blurb: 'Alto, gavetas estreitas.', defaults: { width: 450, height: 900, depth: 480, gavetas: 5, carcassT: 15, backT: 15, frontT: 15 }, fields: [nf('width', 'Largura mm'), nf('height', 'Altura mm'), nf('depth', 'Profundidade mm'), nf('gavetas', 'Gavetas'), nf('carcassT', 'Esp. caixa mm'), nf('backT', 'Esp. fundo mm'), nf('frontT', 'Esp. frente mm')] },
      { type: 'gaveteiro', variant: 'arquivo', label: 'Arquivo de documentos', blurb: 'Gavetas altas p/ pastas suspensas.', defaults: { width: 460, height: 1320, depth: 620, gavetas: 2, carcassT: 15, backT: 15, frontT: 15 }, fields: [nf('width', 'Largura mm'), nf('height', 'Altura mm'), nf('depth', 'Profundidade mm'), nf('gavetas', 'Gavetas'), nf('carcassT', 'Esp. caixa mm'), nf('backT', 'Esp. fundo mm'), nf('frontT', 'Esp. frente mm')] },
      { type: 'gaveteiro', variant: 'comoda', label: 'Cômoda', blurb: 'Baixa e larga, coluna de gavetas.', defaults: { width: 1000, height: 800, depth: 460, gavetas: 4, carcassT: 15, backT: 15, frontT: 15 }, fields: [nf('width', 'Largura mm'), nf('height', 'Altura mm'), nf('depth', 'Profundidade mm'), nf('gavetas', 'Gavetas'), nf('carcassT', 'Esp. caixa mm'), nf('backT', 'Esp. fundo mm'), nf('frontT', 'Esp. frente mm')] },
      { type: 'gaveteiro', variant: 'criado', label: 'Criado-mudo', blurb: 'Mesa de cabeceira com gaveta.', defaults: { width: 450, height: 500, depth: 400, gavetas: 1, carcassT: 15, backT: 15, frontT: 15 }, fields: [nf('width', 'Largura mm'), nf('height', 'Altura mm'), nf('depth', 'Profundidade mm'), nf('gavetas', 'Gavetas'), nf('carcassT', 'Esp. caixa mm'), nf('backT', 'Esp. fundo mm'), nf('frontT', 'Esp. frente mm')] },
      { type: 'gaveteiro', variant: 'sapateira', label: 'Sapateira', blurb: 'Coluna de gavetas baixas p/ sapatos.', defaults: { width: 800, height: 2100, depth: 400, gavetas: 8, carcassT: 15, backT: 15, frontT: 15 }, fields: [nf('width', 'Largura mm'), nf('height', 'Altura mm'), nf('depth', 'Profundidade mm'), nf('gavetas', 'Gavetas'), nf('carcassT', 'Esp. caixa mm'), nf('backT', 'Esp. fundo mm'), nf('frontT', 'Esp. frente mm')] }
    ]
  },
  {
    group: 'Nichos, estantes e racks',
    models: [
      { type: 'nicho', variant: 'simples', label: 'Nicho simples', blurb: 'Caixa aberta com fundo.', defaults: { width: 600, height: 800, depth: 300, shelves: 1, hasBack: 1, carcassT: 15, backT: 15 }, fields: [nf('width', 'Largura mm'), nf('height', 'Altura mm'), nf('depth', 'Profundidade mm'), nf('shelves', 'Prateleiras'), cf('hasBack', 'Fundo'), nf('carcassT', 'Esp. caixa mm'), nf('backT', 'Esp. fundo mm')] },
      { type: 'nicho', variant: 'duplo', label: 'Nicho duplo', blurb: 'Dois vãos com divisor central.', defaults: { width: 1200, height: 800, depth: 300, shelves: 2, divisors: 1, hasBack: 1, carcassT: 15, backT: 15 }, fields: [nf('width', 'Largura mm'), nf('height', 'Altura mm'), nf('depth', 'Profundidade mm'), nf('shelves', 'Prateleiras'), nf('divisors', 'Divisores'), cf('hasBack', 'Fundo'), nf('carcassT', 'Esp. caixa mm'), nf('backT', 'Esp. fundo mm')] },
      { type: 'nicho', variant: 'estante', label: 'Estante coluna', blurb: 'Alta, prateleiras visíveis.', defaults: { width: 800, height: 2000, depth: 300, shelves: 5, hasBack: 1, carcassT: 15, backT: 15 }, fields: [nf('width', 'Largura mm'), nf('height', 'Altura mm'), nf('depth', 'Profundidade mm'), nf('shelves', 'Prateleiras'), cf('hasBack', 'Fundo'), nf('carcassT', 'Esp. caixa mm'), nf('backT', 'Esp. fundo mm')] },
      { type: 'nicho', variant: 'rack', label: 'Painel rack / TV', blurb: 'Painel baixo com divisórias.', defaults: { width: 1800, height: 500, depth: 400, shelves: 2, divisors: 2, hasBack: 1, carcassT: 15, backT: 15 }, fields: [nf('width', 'Largura mm'), nf('height', 'Altura mm'), nf('depth', 'Profundidade mm'), nf('shelves', 'Prateleiras'), nf('divisors', 'Divisores'), cf('hasBack', 'Fundo'), nf('carcassT', 'Esp. caixa mm'), nf('backT', 'Esp. fundo mm')] },
      { type: 'prateleira', variant: 'livre', label: 'Prateleira solta', blurb: 'Peça única, repetida N vezes.', defaults: { width: 800, depth: 250, thickness: 15, qty: 3 }, fields: [nf('width', 'Largura mm'), nf('depth', 'Profundidade mm'), nf('thickness', 'Espessura mm'), nf('qty', 'Quantidade')] },
      { type: 'avulso', variant: 'pecas', label: 'Peças avulsas', blurb: 'Lista livre, sem fórmula.', defaults: {}, fields: [] }
    ]
  }
]

function withDrawerHeight(m) {
  const hasDrawers =
    m.type === 'gaveteiro' ||
    (m.type === 'armario' || m.type === 'guarda-roupa' ? Number(m.defaults?.gavetas || 0) > 0 : false)
  if (!hasDrawers || m.fields.some((f) => f.key === 'gavH')) return m
  return { ...m, fields: [...m.fields, nf('gavH', 'Altura da gaveta mm (0 = automática)')] }
}

const MODELS = CATALOG_GROUPS.flatMap((g) => g.models.map((m) => withDrawerHeight({ ...m, group: g.group })))

export const CATALOG = MODELS

function findModel(type, variant) {
  return MODELS.find((m) => m.type === type && (!variant || m.variant === variant)) || MODELS.find((m) => m.type === type) || null
}

export function catalogItem(type) {
  return findModel(type, null)
}

export function modelByTypeVariant(type, variant) {
  return findModel(type, variant)
}

export function modelMeta(item) {
  const model = findModel(item?.type, item?.variant)
  return model || { type: item?.type, variant: item?.variant, label: item?.type || '—', group: '', blurb: '' }
}

export function nextCode(list) {
  const used = new Set((list || []).map((f) => f.code))
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  for (const c of letters) {
    if (!used.has(c)) return c
  }
  let i = 1
  while (used.has('Z' + i)) i += 1
  return 'Z' + i
}

export function nextColor(list) {
  const used = (list || []).map((f) => f.color)
  return FURNITURE_COLORS.find((c) => !used.includes(c)) || FURNITURE_COLORS[used.length % FURNITURE_COLORS.length]
}

export function createFurniture(modelOrType, existing = []) {
  const model = typeof modelOrType === 'string' ? findModel(modelOrType, null) : modelOrType
  if (!model) return null
  const code = nextCode(existing)
  return {
    id: uid(),
    type: model.type,
    variant: model.variant,
    name: model.label + ' ' + code,
    code,
    color: nextColor(existing),
    qty: 1,
    params: { ...model.defaults },
    extraPieces: []
  }
}

export function fieldsFor(item) {
  const model = modelMeta(item)
  return (model.fields || []).map((f) => ({ ...f }))
}

function mm(n) {
  const v = Math.round(Number(n) || 0)
  return v < 0 ? 0 : v
}

function nint(n, fallback = 0) {
  const v = Math.floor(Number(n))
  return Number.isFinite(v) ? v : fallback
}

function num(p, k, d = 0) {
  const v = Number(p?.[k])
  return Number.isFinite(v) ? v : d
}

function edges(front, back, left, right) {
  return { front: !!front, back: !!back, left: !!left, right: !!right }
}

function part(name, length, width, thickness, qty, grain, edge) {
  const q = nint(qty, 0)
  if (q <= 0 || mm(length) <= 0 || mm(width) <= 0) return null
  return makePiece(name, mm(length), mm(width), mm(thickness), q, grain, edge)
}

function push(list, item) {
  if (item) list.push(item)
}

const tEdge = edges(true, true, true, true)
const fEdge = edges(true, false, true, true)
const lEdge = edges(true, true, false, true)

function carcass(W, H, D, t, backT, hasBack, shelves, divisors) {
  const out = []
  const innerW = W - 2 * t
  const innerH = H - 2 * t
  const nDiv = Math.max(0, nint(divisors))
  const nShelf = Math.max(0, nint(shelves))
  const bays = nDiv + 1
  const bayW = bays > 0 ? (innerW - nDiv * t) / bays : innerW
  const shelfD = D - (hasBack ? backT : 0) - 10

  push(out, part('Lateral', H, D, t, 2, 'comprimento', lEdge))
  push(out, part('Base', innerW, D, t, 1, 'comprimento', fEdge))
  push(out, part('Tampo', innerW, D, t, 1, 'comprimento', fEdge))
  if (nDiv) {
    push(out, part('Divisor', innerH, D, t, nDiv, 'comprimento', lEdge))
  }
  if (hasBack) {
    push(out, part('Fundo', innerW, innerH, backT, 1, 'livre', edges(false, false, false, false)))
  }
  if (nShelf) {
    push(out, part('Prateleira', bayW, shelfD, t, nShelf * bays, 'comprimento', edges(true, false, false, false)))
  }
  return out
}

function overlayDoors(W, H, n, doorT) {
  const doors = Math.max(0, nint(n))
  if (!doors) return []
  const gap = 2
  const doorW = (W - gap * (doors + 1)) / doors
  const doorH = H - gap * 2
  const p = part('Porta', doorH, doorW, doorT, doors, 'comprimento', tEdge)
  return p ? [p] : []
}

function slidingDoors(W, H, n, doorT, side = 0) {
  const doors = Math.max(0, nint(n))
  if (!doors) return []
  const pairs = Math.max(1, Math.ceil(doors / 2))
  const base = W / pairs
  const overlap = 40
  const doorW = base + overlap
  const doorH = H - 10
  const p = part('Porta de correr', doorH, doorW, doorT, doors, 'comprimento', tEdge)
  return p ? [p] : []
}

function drawerInternal(p, frontH, name) {
  const frontW = Number(p.frontW) || 0
  const frontT = Number(p.frontT) || 15
  const boxH = Math.max(80, frontH - 24)
  const boxW = Math.max(80, frontW - 30)
  const boxD = Math.max(80, Number(p.boxD) || 300)
  return [
    part(name + ' — lateral', boxD, boxH, 15, 2, 'comprimento', edges(false, false, true, false)),
    part(name + ' — fundo', boxW, boxD, 15, 1, 'livre', edges(false, false, false, false)),
    part(name + ' — base', boxW, boxH, 15, 1, 'livre', edges(false, false, false, false))
  ].filter(Boolean)
}

function buildBox(item, opts) {
  const p = item.params || {}
  const W = mm(num(p, 'width', opts.width || 800))
  const H = mm(num(p, 'height', opts.height || 1800))
  const D = mm(num(p, 'depth', opts.depth || 500))
  const t = mm(num(p, 'carcassT', 15))
  const backT = mm(num(p, 'backT', 15))
  const doorT = mm(num(p, 'doorT', 15))
  const hasBack = !!num(p, 'hasBack', 1)
  const shelves = nint(num(p, 'shelves', opts.shelves ?? 0))
  const divisors = nint(num(p, 'divisors', 0))
  const doors = nint(num(p, 'doors', opts.doors ?? 0))
  const sliding = (p.doorStyle === 'correr' || opts.sliding)
  const gavetas = nint(num(p, 'gavetas', 0))
  const zoneH = Math.max(0, mm(num(p, 'zoneH', 0)))
  const innerW = W - 2 * t
  const innerH = H - 2 * t

  const out = []
  push(out, part('Lateral', H, D, t, 2, 'comprimento', lEdge))
  push(out, part('Base', innerW, D, t, 1, 'comprimento', fEdge))
  push(out, part('Tampo', innerW, D, t, 1, 'comprimento', fEdge))
  if (divisors) push(out, part('Divisor', innerH, D, t, divisors, 'comprimento', lEdge))
  if (hasBack) push(out, part('Fundo', innerW, innerH, backT, 1, 'livre', edges(false, false, false, false)))

  const drawerZoneH = gavetas > 0 ? Math.max(zoneH, 180) : 0
  const doorZoneH = H - drawerZoneH

  if (gavetas > 0 && drawerZoneH > 0) {
    const gap = 3
    const frontH = drawerFront(p, drawerZoneH, gavetas, gap)
    const frontW = innerW - 2
    const fronts = part('Frente de gaveta', frontH, frontW, doorT, gavetas, 'comprimento', tEdge)
    if (fronts) out.push(fronts)
    const int = drawerInternal({ frontW, frontT: doorT, boxD: D - 60 }, frontH, 'Gaveta')
    for (const x of int) out.push(x)
    if (shelves) {
      const shelfD = D - (hasBack ? backT : 0) - 10
      const bays = divisors + 1
      const bayW = (innerW - divisors * t) / bays
      push(out, part('Prateleira', bayW, shelfD, t, shelves * bays, 'comprimento', edges(true, false, false, false)))
    }
  } else {
    if (shelves) {
      const nDiv = divisors
      const bays = nDiv + 1
      const bayW = bays > 0 ? (innerW - nDiv * t) / bays : innerW
      const shelfD = D - (hasBack ? backT : 0) - 10
      push(out, part('Prateleira', bayW, shelfD, t, shelves * bays, 'comprimento', edges(true, false, false, false)))
    }
  }

  if (doors > 0 && doorZoneH > 0) {
    const doorH = doorZoneH - 2
    if (sliding) {
      const doorW = (W / Math.max(1, Math.ceil(doors / 2))) + 40
      push(out, part('Porta de correr', doorH, doorW, doorT, doors, 'comprimento', tEdge))
    } else {
      const gap = 2
      const doorW = (W - gap * (doors + 1)) / doors
      push(out, part('Porta', doorH, doorW, doorT, doors, 'comprimento', tEdge))
    }
  }
  return out
}

function buildGaveteiro(item) {
  const p = item.params || {}
  const W = mm(num(p, 'width', 450))
  const H = mm(num(p, 'height', 700))
  const D = mm(num(p, 'depth', 480))
  const t = mm(num(p, 'carcassT', 15))
  const backT = mm(num(p, 'backT', 15))
  const frontT = mm(num(p, 'frontT', 15))
  const gavetas = Math.max(0, nint(num(p, 'gavetas', 4)))
  const innerW = W - 2 * t
  const innerH = H - 2 * t
  const out = []
  push(out, part('Lateral', H, D, t, 2, 'comprimento', lEdge))
  push(out, part('Base', innerW, D, t, 1, 'comprimento', fEdge))
  push(out, part('Tampo', innerW, D, t, 1, 'comprimento', fEdge))
  push(out, part('Fundo', innerW, innerH, backT, 1, 'livre', edges(false, false, false, false)))
  if (gavetas) {
    const gap = 3
    const frontH = drawerFront(p, H, gavetas, gap)
    const frontW = innerW - 2
    push(out, part('Frente de gaveta', frontH, frontW, frontT, gavetas, 'comprimento', tEdge))
    const int = drawerInternal({ frontW, frontT, boxD: D - 60 }, frontH, 'Gaveta')
    for (const x of int) out.push(x)
  }
  return out
}

function drawerFront(p, zoneH, count, gap = 3) {
  const n = Math.max(1, nint(count, 1))
  const auto = Math.max(50, (zoneH - gap * (n + 1)) / n)
  const want = mm(num(p, 'gavH', 0))
  if (want > 0) return Math.max(50, Math.min(want, auto))
  return auto
}

function deskPedestal(p, colW, colDepth, baseT = 15, frontT = 15) {
  const out = []
  const n = Math.max(0, nint(num(p, 'gavetas', 0)))
  if (!n || colW <= 0 || colDepth <= 0) return out
  const legH = Math.max(160, mm(num(p, 'height', 750)) - mm(num(p, 'thickness', 15)))
  const elevated = p.drawerBase === 'alto'
  const gap = elevated ? Math.min(legH - 120, Math.max(40, mm(num(p, 'baseH', 120)))) : 0
  const bodyH = Math.max(120, legH - gap)
  push(out, part('Gaveteiro — lateral', bodyH, colDepth, baseT, 2, 'comprimento', lEdge))
  push(out, part('Gaveteiro — base', colW, colDepth, baseT, 1, 'comprimento', fEdge))
  push(out, part('Gaveteiro — tampo', colW, colDepth, baseT, 1, 'comprimento', fEdge))
  if (gap > 0) push(out, part('Gaveteiro — pé', gap, 70, baseT, 4, 'comprimento', lEdge))
  const faceH = drawerFront(p, bodyH, n)
  const faceW = Math.max(80, colW - 2)
  push(out, part('Gaveteiro — frente', faceH, faceW, frontT, n, 'comprimento', tEdge))
  const int = drawerInternal({ frontW: faceW, frontT, boxD: Math.max(120, colDepth - 50) }, faceH, 'Gaveta')
  for (const x of int) out.push(x)
  return out
}

function saiaLen(board) {
  return Math.max(0, mm(board) - 36)
}

function generateMesa(p, variant) {
  const W = mm(num(p, 'width', 1400))
  const D = mm(num(p, 'depth', 600))
  const H = mm(num(p, 'height', 750))
  const t = mm(num(p, 'thickness', 15))
  const retLen = mm(num(p, 'retLen', variant.startsWith('l-') ? 800 : 0))
  const retDepth = Math.max(120, mm(num(p, 'retDepth', retLen > 0 ? 600 : 0)))
  const out = []
  const legH = Math.max(120, H - t)
  const saiaH = Math.max(40, mm(num(p, 'saiaH', 120)))
  const hasRet = retLen > 0

  push(out, part('Tampo', W, D, t, 1, 'comprimento', tEdge))
  if (p.pernas === 'pernas') {
    push(out, part('Perna', legH, 80, 15, 4, 'comprimento', tEdge))
  } else {
    push(out, part('Lateral', legH, D, 15, 2, 'comprimento', lEdge))
  }

  if (hasRet) {
    push(out, part('Retorno — tampo', retLen, retDepth, t, 1, 'comprimento', tEdge))
    if (p.pernas === 'pernas') {
      push(out, part('Retorno — perna', legH, 80, 15, 2, 'comprimento', tEdge))
    } else {
      push(out, part('Retorno — lateral', legH, retDepth, 15, 1, 'comprimento', lEdge))
    }
    if (p.modesty) {
      push(out, part('Saia do corpo', saiaLen(W), saiaH, 15, 1, 'comprimento', fEdge))
      push(out, part('Saia do retorno', saiaLen(retLen), saiaH, 15, 1, 'comprimento', fEdge))
    }
    if (p.shelf) push(out, part('Prateleira inferior (retorno)', saiaLen(retLen), Math.max(120, retDepth - 40), 15, 1, 'comprimento', fEdge))
    if (num(p, 'gavetas', 0) > 0) {
      const cw = num(p, 'pedW', 0) > 0 ? mm(num(p, 'pedW', 0)) : Math.min(620, Math.max(300, retLen - 120))
      for (const x of deskPedestal(p, cw, retDepth - 80)) out.push(x)
    }
  } else {
    if (p.modesty) push(out, part('Saia frontal', saiaLen(W), saiaH, 15, 1, 'comprimento', fEdge))
    if (p.shelf) push(out, part('Prateleira inferior', saiaLen(W), Math.max(120, D - 40), 15, 1, 'comprimento', fEdge))
    if (num(p, 'gavetas', 0) > 0) {
      const cw = num(p, 'pedW', 0) > 0 ? mm(num(p, 'pedW', 0)) : Math.min(520, Math.max(260, Math.round(W * 0.4)))
      for (const x of deskPedestal(p, cw, D - 80)) out.push(x)
    }
  }
  return out
}

function generateJantar(p) {
  const W = mm(num(p, 'width', 1800))
  const D = mm(num(p, 'depth', 900))
  const H = mm(num(p, 'height', 750))
  const t = mm(num(p, 'thickness', 15))
  const halves = Math.ceil(W / 2)
  const out = []
  push(out, part('Tampo principal', halves, D, t, 1, 'comprimento', tEdge))
  push(out, part('Tampo complementar', W - halves, D, t, 1, 'comprimento', tEdge))
  push(out, part('Perna', H - t, 100, 15, 4, 'comprimento', tEdge))
  push(out, part('Travessa lateral', Math.max(0, W - 120), 120, 15, 2, 'comprimento', lEdge))
  if (p.modesty) {
    const saiaH = Math.max(40, mm(num(p, 'saiaH', 140)))
    push(out, part('Saia comprida', saiaLen(W), saiaH, 15, 2, 'comprimento', fEdge))
    push(out, part('Saia curta', saiaLen(D), saiaH, 15, 2, 'comprimento', fEdge))
  }
  return out
}

function generateNicho(item) {
  const p = item.params || {}
  const W = mm(num(p, 'width', 600))
  const H = mm(num(p, 'height', 800))
  const D = mm(num(p, 'depth', 300))
  const t = mm(num(p, 'carcassT', 15))
  const backT = mm(num(p, 'backT', 15))
  const hasBack = !!num(p, 'hasBack', 1)
  const shelves = nint(num(p, 'shelves', 1))
  const divisors = nint(num(p, 'divisors', 0))
  return buildBox(item, { width: W, height: H, depth: D, shelves, doors: 0, hasBack, carcassT: t, backT, divisors })
}

export function generateFurniturePieces(item) {
  const p = item.params || {}
  const type = item.type
  const variant = item.variant || ''
  if (type === 'mesa') {
    if (variant === 'jantar') return generateJantar(p)
    return generateMesa(p, variant)
  }
  if (type === 'gaveteiro') return buildGaveteiro(item)
  if (type === 'nicho') return generateNicho(item)
  if (type === 'prateleira') {
    const pce = part('Prateleira', p.width, p.depth, p.thickness || 15, p.qty || 1, 'comprimento', tEdge)
    return pce ? [pce] : []
  }
  if (type === 'avulso') return []
  if (type === 'armario' || type === 'guarda-roupa') {
    return buildBox(item, {
      width: num(p, 'width', 900),
      height: num(p, 'height', type === 'armario' ? 1800 : 2100),
      depth: num(p, 'depth', type === 'armario' ? 500 : 580),
      doors: num(p, 'doors', 0),
      shelves: num(p, 'shelves', 0)
    })
  }
  return []
}

export function flattenProjectPieces(project) {
  const out = []
  for (const item of project.furniture || []) {
    const generated = generateFurniturePieces(item)
    const extras = (item.extraPieces || []).map((x) => ({ ...x, edges: { ...x.edges } }))
    const all = [...generated, ...extras]
    const qtyMul = Math.max(1, nint(item.qty, 1))
    all.forEach((p, idx) => {
      out.push({
        ...p,
        id: `${item.id}-${p.id || idx}`,
        qty: (Number(p.qty) || 0) * qtyMul,
        furnitureId: item.id,
        furnitureName: item.name,
        furnitureCode: item.code,
        color: item.color
      })
    })
  }
  return out
}

export function furnitureSummaryLine(item) {
  const p = item.params || {}
  if (item.type === 'avulso') {
    const n = (item.extraPieces || []).reduce((s, x) => s + (Number(x.qty) || 0), 0)
    return `${n} peça(s) avulsa(s)`
  }
  if (item.type === 'prateleira') {
    return `${mm(p.width)} × ${mm(p.depth)} × ${mm(p.thickness || 15)} mm · qtd ${nint(p.qty, 1)}`
  }
  if (item.type === 'mesa') {
    const bits = [`${mm(p.width)} × ${mm(p.depth)} × ${mm(p.height || 750)} mm`]
    if (p.retLen) bits.push(`retorno ${mm(p.retLen)}`)
    if (p.gavetas) bits.push(`${nint(p.gavetas)} gav.`)
    return bits.join(' · ')
  }
  const bits = [`${mm(p.width)} × ${mm(p.height || 0)} × ${mm(p.depth)} mm`]
  if (p.doors) bits.push(`${nint(p.doors)} porta(s)`)
  if (p.gavetas) bits.push(`${nint(p.gavetas)} gav.`)
  if (p.shelves) bits.push(`${nint(p.shelves)} prat.`)
  return bits.join(' · ')
}
