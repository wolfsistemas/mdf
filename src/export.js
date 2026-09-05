import { jsPDF } from 'jspdf'
import { formatMoney, formatMeters, formatM2, GRAIN } from './store.js'
import { edgeMeters, pieceAreaM2 } from './nesting.js'

function csvEscape(v) {
  const s = String(v ?? '')
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function exportCsv(project, pieces) {
  const list = pieces || project.pieces || []
  const header = [
    'Codigo_movel',
    'Movel',
    'Peca',
    'Comprimento_mm',
    'Largura_mm',
    'Espessura_mm',
    'Qtd',
    'Veio',
    'Fita_frente',
    'Fita_fundo',
    'Fita_esquerda',
    'Fita_direita',
    'Area_m2',
    'Fita_m',
    'Cor'
  ]
  const rows = [header.join(';')]
  for (const p of list) {
    rows.push(
      [
        p.furnitureCode || '',
        p.furnitureName || '',
        p.name,
        p.length,
        p.width,
        p.thickness,
        p.qty,
        GRAIN[p.grain] || p.grain,
        p.edges?.front ? 'sim' : 'nao',
        p.edges?.back ? 'sim' : 'nao',
        p.edges?.left ? 'sim' : 'nao',
        p.edges?.right ? 'sim' : 'nao',
        pieceAreaM2(p).toFixed(4),
        edgeMeters(p).toFixed(3),
        p.color || ''
      ]
        .map(csvEscape)
        .join(';')
    )
  }
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
  download(blob, slug(project.name) + '-pecas.csv')
}

export function exportPdf(project, settings, layout, summary, pieces) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 12
  const list = pieces || project.pieces || []

  coverPage(doc, project, settings, summary, pageW, pageH, margin)
  furniturePage(doc, project, summary, pageW, pageH, margin)
  partsPage(doc, list, pageW, pageH, margin)
  layout.boards.forEach((board) => {
    doc.addPage()
    boardPage(doc, project, settings, board, pageW, pageH, margin)
  })
  costPage(doc, project, settings, summary, pageW, pageH, margin)

  doc.save(slug(project.name) + '-plano-corte.pdf')
}

function coverPage(doc, project, settings, summary, pageW, pageH, margin) {
  doc.setFillColor(20, 17, 14)
  doc.rect(0, 0, pageW, pageH, 'F')
  doc.setFillColor(212, 165, 116)
  doc.rect(0, 0, 6, pageH, 'F')

  doc.setTextColor(212, 165, 116)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('MDF ATELIER', margin + 6, 22)

  doc.setTextColor(243, 236, 227)
  doc.setFontSize(26)
  doc.text(project.name || 'Orçamento', margin + 6, 40)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(168, 154, 138)
  const date = new Date().toLocaleString('pt-BR')
  const clientLine = project.client ? `Cliente: ${project.client}` : ''
  const phoneLine = project.phone ? ` · ${project.phone}` : ''
  doc.text(`${clientLine}${phoneLine}`.trim() || `Gerado em ${date}`, margin + 6, 50)
  doc.text(`Gerado em ${date}`, margin + 6, 58)
  if (project.notes) {
    const notes = doc.splitTextToSize(project.notes, pageW - margin * 2 - 20)
    doc.text(notes, margin + 6, 68)
  }

  const cards = [
    ['Chapas', String(summary.sheets)],
    ['Aproveitamento', `${summary.efficiency.toFixed(1)}%`],
    ['Peças', String(summary.pieceCount)],
    ['Fita de borda', formatMeters(summary.tapeM)],
    ['Área das peças', formatM2(summary.areaM2)],
    ['Orçamento', formatMoney(summary.total)]
  ]

  cards.forEach((c, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = margin + 6 + col * 90
    const y = 100 + row * 42
    doc.setFillColor(37, 32, 27)
    doc.roundedRect(x, y, 82, 34, 2, 2, 'F')
    doc.setTextColor(168, 154, 138)
    doc.setFontSize(8)
    doc.text(c[0].toUpperCase(), x + 8, y + 12)
    doc.setTextColor(243, 236, 227)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text(c[1], x + 8, y + 24)
    doc.setFont('helvetica', 'normal')
  })

  doc.setTextColor(168, 154, 138)
  doc.setFontSize(9)
  doc.text(
    `Chapa ${settings.sheetName} · ${settings.sheetWidth} × ${settings.sheetHeight} × ${settings.sheetThickness} mm · kerf ${settings.kerf} mm · refilo ${settings.trim} mm`,
    margin + 6,
    pageH - 16
  )
}

function furniturePage(doc, project, summary, pageW, pageH, margin) {
  doc.addPage()
  doc.setFillColor(250, 247, 242)
  doc.rect(0, 0, pageW, pageH, 'F')
  heading(doc, 'Móveis do orçamento', margin)

  let y = 28
  const list = project.furniture || []
  list.forEach((f, i) => {
    if (y > pageH - 22) {
      doc.addPage()
      doc.setFillColor(250, 247, 242)
      doc.rect(0, 0, pageW, pageH, 'F')
      heading(doc, 'Móveis do orçamento (cont.)', margin)
      y = 28
    }
    if (i % 2 === 0) {
      doc.setFillColor(237, 230, 218)
      doc.rect(margin, y - 5, pageW - margin * 2, 12, 'F')
    }
    const rgb = hexToRgb(f.color)
    doc.setFillColor(rgb[0], rgb[1], rgb[2])
    doc.rect(margin + 3, y - 3, 6, 8, 'F')
    doc.setTextColor(32, 27, 23)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`[${f.code}] ${f.name}`, margin + 14, y + 2)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(90, 78, 66)
    const stats = (summary.byFurniture || []).find((x) => x.id === f.id)
    const extra = stats ? ` · ${stats.pieceCount} peças · ${formatM2(stats.areaM2)}` : ''
    doc.text(`${f.qty || 1} un.${extra}`, margin + 140, y + 2)
    y += 12
  })
}

function partsPage(doc, pieces, pageW, pageH, margin) {
  doc.addPage()
  doc.setFillColor(250, 247, 242)
  doc.rect(0, 0, pageW, pageH, 'F')
  heading(doc, 'Lista de peças', margin)

  const cols = [
    { label: 'Cód.', w: 14 },
    { label: 'Móvel', w: 42 },
    { label: 'Peça', w: 48 },
    { label: 'L', w: 18 },
    { label: 'A', w: 18 },
    { label: 'Esp.', w: 14 },
    { label: 'Qtd', w: 12 },
    { label: 'Veio', w: 40 },
    { label: 'Fita', w: 28 },
    { label: 'm²', w: 20 },
    { label: 'Fita m', w: 18 }
  ]

  let x = margin
  let y = 28
  doc.setFillColor(32, 27, 23)
  doc.rect(margin, y, pageW - margin * 2, 8, 'F')
  doc.setTextColor(243, 236, 227)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  cols.forEach((c) => {
    doc.text(c.label, x + 2, y + 5.5)
    x += c.w
  })

  y += 8
  doc.setFont('helvetica', 'normal')
  pieces.forEach((p, i) => {
    if (y > pageH - 18) {
      doc.addPage()
      doc.setFillColor(250, 247, 242)
      doc.rect(0, 0, pageW, pageH, 'F')
      heading(doc, 'Lista de peças (cont.)', margin)
      y = 28
    }
    if (i % 2 === 0) {
      doc.setFillColor(237, 230, 218)
      doc.rect(margin, y, pageW - margin * 2, 8, 'F')
    }
    const vals = [
      p.furnitureCode || '',
      (p.furnitureName || '').slice(0, 24),
      p.name,
      String(p.length),
      String(p.width),
      String(p.thickness),
      String(p.qty),
      GRAIN[p.grain] || p.grain,
      edgeLabel(p.edges),
      pieceAreaM2(p).toFixed(3),
      edgeMeters(p).toFixed(2)
    ]
    x = margin
    doc.setTextColor(32, 27, 23)
    vals.forEach((v, ci) => {
      doc.text(String(v).slice(0, 28), x + 2, y + 5.5)
      x += cols[ci].w
    })
    y += 8
  })
}

function boardPage(doc, project, settings, board, pageW, pageH, margin) {
  doc.setFillColor(250, 247, 242)
  doc.rect(0, 0, pageW, pageH, 'F')
  heading(doc, `Chapa ${board.index} — plano de corte`, margin)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90, 78, 66)
  doc.text(
    `${board.sheetWidth} × ${board.sheetHeight} × ${board.thickness || settings.sheetThickness} mm · aproveitamento ${board.efficiency.toFixed(1)}% · ${board.placements.length} peças · modo ${board.mode === 'free' ? 'nesting livre' : 'serra / guilhotina'}`,
    margin,
    24
  )

  const boxW = pageW - margin * 2
  const boxH = pageH - 56
  const scale = Math.min(boxW / board.sheetWidth, boxH / board.sheetHeight)
  const dw = board.sheetWidth * scale
  const dh = board.sheetHeight * scale
  const ox = margin + (boxW - dw) / 2
  const oy = 30 + (boxH - dh) / 2

  doc.setFillColor(201, 184, 150)
  doc.rect(ox, oy, dw, dh, 'F')
  doc.setDrawColor(90, 70, 40)
  doc.setLineWidth(0.4)
  doc.rect(ox, oy, dw, dh)

  board.placements.forEach((p) => {
    const c = hexToRgb(p.color || '#5c4033')
    const px = ox + (board.trim + p.x) * scale
    const py = oy + (board.trim + p.y) * scale
    const pw = p.w * scale
    const ph = p.h * scale
    doc.setFillColor(c[0], c[1], c[2])
    doc.rect(px, py, pw, ph, 'F')
    doc.setDrawColor(243, 236, 227)
    doc.setLineWidth(0.2)
    doc.rect(px, py, pw, ph)
    if (pw > 16 && ph > 10) {
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(Math.max(5, Math.min(8, pw / 8)))
      doc.text(`[${p.furnitureCode || ''}] ${p.name}`, px + 1.5, py + 4, { maxWidth: pw - 3 })
      doc.text(`${Math.round(p.w)}×${Math.round(p.h)}`, px + 1.5, py + 8, { maxWidth: pw - 3 })
    }
  })

  let lx = margin
  const legend = uniqueFurniture(board.placements)
  doc.setFontSize(7)
  legend.forEach((f) => {
    const rgb = hexToRgb(f.color)
    doc.setFillColor(rgb[0], rgb[1], rgb[2])
    doc.rect(lx, pageH - 12, 4, 4, 'F')
    doc.setTextColor(90, 78, 66)
    const label = `[${f.code}] ${f.name}`
    doc.text(label, lx + 6, pageH - 9)
    lx += doc.getTextWidth(label) + 14
  })
}

function uniqueFurniture(placements) {
  const map = {}
  for (const p of placements) {
    const k = p.furnitureId || p.furnitureCode || p.name
    if (!map[k]) map[k] = { code: p.furnitureCode || '', name: p.furnitureName || p.name, color: p.color }
  }
  return Object.values(map)
}

function costPage(doc, project, settings, summary, pageW, pageH, margin) {
  doc.addPage()
  doc.setFillColor(250, 247, 242)
  doc.rect(0, 0, pageW, pageH, 'F')
  heading(doc, 'Orçamento', margin)

  const lines = [
    ['Cliente', project.client || '—', ''],
    ['Chapas', `${summary.sheets} × ${formatMoney(Number(settings.sheetPrice || 0))}`, formatMoney(summary.sheetCost)],
    ['Fita de borda', `${formatMeters(summary.tapeM)} × ${formatMoney(Number(settings.tapePricePerMeter || 0))}/m`, formatMoney(summary.tapeCost)]
  ]
  if (summary.labor) {
    lines.push(['Extra / mão de obra', `${settings.laborPercent || 0}%`, formatMoney(summary.labor)])
  }
  lines.push(
    ['Área das peças', formatM2(summary.areaM2), ''],
    ['Área das chapas', formatM2(summary.sheetAreaM2), ''],
    ['Sobra (área útil)', formatM2(summary.wasteM2), ''],
    ['Aproveitamento', `${summary.efficiency.toFixed(1)}%`, ''],
    ['Peças não posicionadas', String(summary.unplaced), '']
  )

  let y = 32
  lines.forEach((row, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(237, 230, 218)
      doc.rect(margin, y - 5, pageW - margin * 2, 10, 'F')
    }
    doc.setTextColor(32, 27, 23)
    doc.setFontSize(11)
    doc.text(row[0], margin + 4, y)
    doc.setTextColor(90, 78, 66)
    doc.text(String(row[1]), margin + 90, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(32, 27, 23)
    if (row[2]) doc.text(row[2], pageW - margin - 4, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    y += 10
  })

  y += 10
  doc.setFillColor(32, 27, 23)
  doc.roundedRect(margin, y, pageW - margin * 2, 18, 2, 2, 'F')
  doc.setTextColor(212, 165, 116)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('TOTAL', margin + 6, y + 12)
  doc.text(formatMoney(summary.total), pageW - margin - 6, y + 12, { align: 'right' })
}

function heading(doc, title, margin) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(32, 27, 23)
  doc.text(title, margin, 16)
}

function edgeLabel(edges) {
  if (!edges) return '—'
  const tags = []
  if (edges.front) tags.push('F')
  if (edges.back) tags.push('Tr')
  if (edges.left) tags.push('E')
  if (edges.right) tags.push('D')
  return tags.length ? tags.join(' ') : '—'
}

function hexToRgb(hex) {
  const h = String(hex || '#5c4033').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (!Number.isFinite(n)) return [92, 64, 51]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function slug(name) {
  return (name || 'projeto')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function download(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
