import './styles.css'
import {
  loadState,
  saveState,
  blankProject,
  blankPiece,
  GRAIN,
  CUT_MODES,
  formatMoney,
  formatMm,
  formatM2,
  formatMeters
} from './store.js'
import { nest, summarize } from './nesting.js'
import { exportCsv, exportPdf } from './export.js'

const PALETTE = ['#5c4033', '#8c5e3a', '#a67c52', '#78604a', '#4e5c42', '#6e5646', '#966c48', '#58483a']

const state = loadState()
let tab = 'pecas'
let layoutCache = null
let summaryCache = null

function project() {
  return state.projects.find((p) => p.id === state.activeProjectId) || state.projects[0]
}

function recalc() {
  const p = project()
  layoutCache = nest(p.pieces, state.settings)
  summaryCache = summarize(p, state.settings, layoutCache)
}

function persist() {
  saveState(state)
  recalc()
  render()
}

function setActive(id) {
  state.activeProjectId = id
  persist()
}

function addProject() {
  const p = blankProject()
  state.projects.unshift(p)
  state.activeProjectId = p.id
  persist()
}

function duplicateProject() {
  const p = project()
  const copy = {
    ...p,
    id: blankProject().id,
    name: p.name + ' (cópia)',
    createdAt: Date.now(),
    pieces: p.pieces.map((x) => ({ ...x, id: blankPiece().id, edges: { ...x.edges } }))
  }
  state.projects.unshift(copy)
  state.activeProjectId = copy.id
  persist()
}

function removeProject(id) {
  if (state.projects.length === 1) return
  state.projects = state.projects.filter((p) => p.id !== id)
  if (state.activeProjectId === id) state.activeProjectId = state.projects[0].id
  persist()
}

function addPiece() {
  project().pieces.push(blankPiece())
  persist()
}

function updatePiece(id, patch) {
  const p = project().pieces.find((x) => x.id === id)
  if (!p) return
  Object.assign(p, patch)
  persist()
}

function updateEdge(id, key, value) {
  const p = project().pieces.find((x) => x.id === id)
  if (!p) return
  p.edges = { ...p.edges, [key]: value }
  persist()
}

function removePiece(id) {
  const p = project()
  p.pieces = p.pieces.filter((x) => x.id !== id)
  persist()
}

function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag)
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
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue
    el.append(child.nodeType ? child : document.createTextNode(child))
  }
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

function renderSidebar() {
  return h('aside', { class: 'sidebar' }, [
    h('div', { class: 'brand' }, [
      h('div', { class: 'mark' }, ['MDF ATELIER']),
      h('h1', {}, ['Projetos e nesting']),
      h('p', {}, ['Chapas, veio, fita de borda, plano de corte e orçamento — local no navegador.'])
    ]),
    h('div', { class: 'side-actions' }, [
      h('button', { class: 'btn primary', onClick: addProject }, ['+ Projeto']),
      h('button', { class: 'btn', onClick: duplicateProject }, ['Duplicar'])
    ]),
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
            h('span', {}, [`${p.pieces.reduce((s, x) => s + (Number(x.qty) || 0), 0)} peças · ${new Date(p.createdAt).toLocaleDateString('pt-BR')}`])
          ]
        )
      )
    )
  ])
}

function kpis() {
  const s = summaryCache
  const items = [
    ['Chapas', String(s.sheets)],
    ['Aproveitamento', `${s.efficiency.toFixed(1)}%`],
    ['Peças', String(s.pieceCount)],
    ['Fita', formatMeters(s.tapeM)],
    ['Área', formatM2(s.areaM2)],
    ['Total', formatMoney(s.total)]
  ]
  return h(
    'div',
    { class: 'kpis' },
    items.map(([label, val], i) =>
      h('div', { class: 'kpi' + (i === 0 && s.unplaced ? ' warn' : '') }, [h('label', {}, [label]), h('strong', {}, [val])])
    )
  )
}

function tabPecas() {
  const p = project()
  return h('div', {}, [
    h('div', { class: 'card' }, [
      h('div', { class: 'row' }, [
        field('Nome do projeto', h('input', {
          type: 'text',
          value: p.name,
          onChange: (e) => {
            p.name = e.target.value
            persist()
          }
        }), 'grow'),
        h('button', { class: 'btn danger', onClick: () => removeProject(p.id) }, ['Excluir projeto'])
      ]),
      h('div', { style: 'height:10px' }),
      field(
        'Notas',
        h('textarea', {
          value: p.notes || '',
          onChange: (e) => {
            p.notes = e.target.value
            persist()
          }
        })
      )
    ]),
    h('div', { class: 'card' }, [
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:center' }, [
        h('h2', {}, ['Lista de peças']),
        h('button', { class: 'btn primary', onClick: addPiece }, ['+ Peça'])
      ]),
      h('div', { style: 'overflow:auto' }, [
        h('table', {}, [
          h('thead', {}, [
            h('tr', {}, [
              th('Nome'),
              th('Comp. L'),
              th('Larg. A'),
              th('Esp.'),
              th('Qtd'),
              th('Veio'),
              th('Fita de borda'),
              th('')
            ])
          ]),
          h(
            'tbody',
            {},
            p.pieces.map((piece) =>
              h('tr', {}, [
                td(
                  h('input', {
                    type: 'text',
                    value: piece.name,
                    onChange: (e) => updatePiece(piece.id, { name: e.target.value })
                  })
                ),
                td(inputNum(piece.length, (v) => updatePiece(piece.id, { length: v }))),
                td(inputNum(piece.width, (v) => updatePiece(piece.id, { width: v }))),
                td(inputNum(piece.thickness, (v) => updatePiece(piece.id, { thickness: v }))),
                td(inputNum(piece.qty, (v) => updatePiece(piece.id, { qty: v }))),
                td(
                  h(
                    'select',
                    {
                      onChange: (e) => updatePiece(piece.id, { grain: e.target.value })
                    },
                    Object.entries(GRAIN).map(([k, label]) =>
                      h('option', { value: k, selected: piece.grain === k }, [label])
                    )
                  )
                ),
                td(
                  h('div', { class: 'edges' }, [
                    edgeCheck(piece, 'front', 'Frente (L)'),
                    edgeCheck(piece, 'back', 'Fundo (L)'),
                    edgeCheck(piece, 'left', 'Esq. (A)'),
                    edgeCheck(piece, 'right', 'Dir. (A)')
                  ])
                ),
                td(h('button', { class: 'btn danger', onClick: () => removePiece(piece.id) }, ['x']))
              ])
            )
          )
        ])
      ]),
      h('p', { class: 'help' }, [
        'L = comprimento, A = largura. Veio no comprimento impede giro. Fita: Frente/Fundo usam L; Esquerda/Direita usam A.'
      ])
    ])
  ])
}

function edgeCheck(piece, key, label) {
  return h('label', {}, [
    h('input', {
      type: 'checkbox',
      checked: !!piece.edges?.[key],
      onChange: (e) => updateEdge(piece.id, key, e.target.checked)
    }),
    label
  ])
}

function tabCorte() {
  const layout = layoutCache
  const s = state.settings
  const boards = layout.boards.map((board) => sheetEl(board, s))
  return h('div', {}, [
    h('div', { class: 'card' }, [
      h('h2', {}, ['Plano de corte']),
      h('p', { class: 'help' }, [
        layout.sheetsNeeded
          ? `${layout.sheetsNeeded} chapa(s) · aproveitamento ${layout.efficiency.toFixed(1)}% · modo ${s.cutMode === 'free' ? 'nesting livre' : 'serra / guilhotina'} · kerf ${s.kerf} mm`
          : 'Adicione peças para gerar o nesting.'
      ]),
      layout.unplaced.length
        ? h('p', { class: 'unplaced' }, [
            `${layout.unplaced.length} peça(s) não cabem na chapa: ${layout.unplaced.map((x) => x.name).join(', ')}`
          ])
        : null
    ]),
    h('div', { class: 'sheet-wrap' }, boards.length ? boards : [h('p', { class: 'help' }, ['Nenhuma chapa gerada.'])])
  ])
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
  board.placements.forEach((p, i) => {
    const box = h('div', {
      class: 'piece-box',
      style: [
        `left:${(board.trim + p.x) * scale}px`,
        `top:${(board.trim + p.y) * scale}px`,
        `width:${p.w * scale}px`,
        `height:${p.h * scale}px`,
        `background:${PALETTE[i % PALETTE.length]}`
      ].join(';')
    }, [
      h('b', {}, [p.name + (p.rotated ? ' ↻' : '')]),
      h('span', {}, [`${Math.round(p.w)} × ${Math.round(p.h)} mm`])
    ])
    sheet.append(box)
  })
  return h('div', {}, [
    h('h3', {}, [`Chapa ${board.index} · ${board.thickness || '—'} mm — ${board.efficiency.toFixed(1)}% · ${board.placements.length} peças`]),
    sheet
  ])
}

function tabOrcamento() {
  const s = summaryCache
  const set = state.settings
  return h('div', { class: 'card' }, [
    h('h2', {}, ['Custos e orçamento']),
    line('Chapas', `${s.sheets} × ${formatMoney(Number(set.sheetPrice || 0))}`, formatMoney(s.sheetCost)),
    line('Fita de borda', `${formatMeters(s.tapeM)} × ${formatMoney(Number(set.tapePricePerMeter || 0))}/m`, formatMoney(s.tapeCost)),
    line('Área das peças', formatM2(s.areaM2), ''),
    line('Área das chapas', formatM2(s.sheetAreaM2), ''),
    line('Sobra (área útil)', formatM2(s.wasteM2), ''),
    line('Aproveitamento', `${s.efficiency.toFixed(1)}%`, ''),
    line('Não posicionadas', String(s.unplaced), ''),
    h('div', { class: 'cost-total' }, [h('span', {}, ['TOTAL']), h('span', {}, [formatMoney(s.total)])])
  ])
}

function tabConfig() {
  const s = state.settings
  const set = (patch) => {
    Object.assign(state.settings, patch)
    persist()
  }
  return h('div', {}, [
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
        'Kerf é a perda da serra entre peças. Refilo reserva borda da chapa. Serra/guilhotina gera faixas (corte retilíneo). Nesting livre encaixa melhor, mas pode exigir recortes mais livres.'
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

function field(label, control, extraClass = '') {
  return h('div', { class: 'field ' + extraClass }, [h('label', {}, [label]), control])
}

function text(value, onChange) {
  return h('input', { type: 'text', value, onChange: (e) => onChange(e.target.value) })
}

function th(t) {
  return h('th', {}, [t])
}
function td(c) {
  return h('td', {}, [c])
}
function line(a, b, c) {
  return h('div', { class: 'cost-line' }, [
    h('span', {}, [a]),
    h('span', {}, [b + (c ? '   ' + c : '')])
  ])
}

function render() {
  const root = document.getElementById('app')
  root.innerHTML = ''
  const p = project()
  const tabs = [
    ['pecas', 'Peças'],
    ['corte', 'Plano de corte'],
    ['orcamento', 'Orçamento'],
    ['config', 'Config']
  ]
  const body =
    tab === 'pecas' ? tabPecas() : tab === 'corte' ? tabCorte() : tab === 'orcamento' ? tabOrcamento() : tabConfig()

  root.append(
    h('div', { class: 'app' }, [
      renderSidebar(),
      h('section', { class: 'main' }, [
        h('div', { class: 'topbar' }, [
          h(
            'div',
            { class: 'tabs' },
            tabs.map(([id, label]) =>
              h(
                'button',
                {
                  class: 'tab' + (tab === id ? ' active' : ''),
                  onClick: () => {
                    tab = id
                    render()
                  }
                },
                [label]
              )
            )
          ),
          h('div', { class: 'actions' }, [
            h('button', { class: 'btn', onClick: () => exportCsv(p) }, ['CSV peças']),
            h('button', { class: 'btn primary', onClick: () => exportPdf(p, state.settings, layoutCache, summaryCache) }, [
              'PDF plano + orçamento'
            ])
          ])
        ]),
        h('div', { class: 'content' }, [kpis(), body])
      ])
    ])
  )
}

recalc()
render()
window.addEventListener('resize', () => {
  if (tab === 'corte') render()
})
