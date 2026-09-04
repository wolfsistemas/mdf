import { jsPDF } from 'jspdf'
import { formatMm, formatMoney, formatMeters, formatM2, GRAIN } from './store.js'
import { edgeMeters, pieceAreaM2 } from './nesting.js'

function csvEscape(v) {
  const s = String(v ?? '')
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function exportCsv(project) {
  const header = [
    'Nome',
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
    'Fita_m'
  ]
  const rows = [header.join(';')]
  for (const p of project.pieces) {
    rows.push(
      [
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
        edgeMeters(p).toFixed(3)
      ]
        .map(csvEscape)
        .join(';')
    )
  }
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
  download(blob, slug(project.name) + '-pecas.csv')
}

export function exportPdf(project, settings, layout, summary) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 12

  coverPage(doc, project, settings, summary, pageW, pageH, margin)
  partsPage(doc, project, pageW, pageH, margin)
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
  doc.text(project.name || 'Projeto', margin + 6, 40)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(168, 154, 138)
  const date = new Date().toLocaleString('pt-BR')
  doc.text(`Gerado em ${date}`, margin + 6, 50)
  if (project.notes) {
    const notes = doc.splitTextToSize(project.notes, pageW - margin * 2 - 20)
    doc.text(notes, margin + 6, 60)
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
    const y = 90 + row * 42
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

function partsPage(doc, project, pageW, pageH, margin) {
  doc.addPage()
  doc.setFillColor(250, 247, 242)
  doc.rect(0, 0, pageW, pageH, 'F')
  heading(doc, 'Lista de peças', margin)

  const cols = [
    { k: 'name', label: 'Peça', w: 55 },
    { k: 'length', label: 'L (mm)', w: 22 },
    { k: 'width', label: 'A (mm)', w: 22 },
    { k: 'thickness', label: 'Esp.', w: 16 },
    { k: 'qty', label: 'Qtd', w: 14 },
    { k: 'grain', label: 'Veio', w: 48 },
    { k: 'edges', label: 'Fita', w: 42 },
    { k: 'area', label: 'm²', w: 22 },
    { k: 'tape', label: 'Fita m', w: 22 }
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
  project.pieces.forEach((p, i) => {
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
    const edge = edgeLabel(p.edges)
    const vals = [
      p.name,
      String(p.length),
      String(p.width),
      String(p.thickness),
      String(p.qty),
      GRAIN[p.grain] || p.grain,
      edge,
      pieceAreaM2(p).toFixed(3),
      edgeMeters(p).toFixed(2)
    ]
    x = margin
    doc.setTextColor(32, 27, 23)
    vals.forEach((v, ci) => {
      doc.text(String(v).slice(0, 32), x + 2, y + 5.5)
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
  const boxH = pageH - 48
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

  const palette = [
    [92, 64, 51],
    [140, 94, 58],
    [166, 124, 82],
    [120, 80, 60],
    [78, 92, 66],
    [110, 86, 70],
    [150, 108, 72],
    [88, 72, 58]
  ]

  board.placements.forEach((p, i) => {
    const c = palette[i % palette.length]
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
      doc.text(p.name, px + 1.5, py + 4, { maxWidth: pw - 3 })
      doc.text(`${Math.round(p.w)}×${Math.round(p.h)}`, px + 1.5, py + 8, { maxWidth: pw - 3 })
    }
  })

  doc.setFontSize(8)
  doc.setTextColor(90, 78, 66)
  doc.text(`Kerf ${settings.kerf} mm · refilo ${settings.trim} mm`, margin, pageH - 8)
}

function costPage(doc, project, settings, summary, pageW, pageH, margin) {
  doc.addPage()
  doc.setFillColor(250, 247, 242)
  doc.rect(0, 0, pageW, pageH, 'F')
  heading(doc, 'Orçamento', margin)

  const lines = [
    ['Chapas', `${summary.sheets} × ${formatMoney(Number(settings.sheetPrice || 0))}`, formatMoney(summary.sheetCost)],
    ['Fita de borda', `${formatMeters(summary.tapeM)} × ${formatMoney(Number(settings.tapePricePerMeter || 0))}/m`, formatMoney(summary.tapeCost)],
    ['Área das peças', formatM2(summary.areaM2), ''],
    ['Área das chapas', formatM2(summary.sheetAreaM2), ''],
    ['Sobra (área útil)', formatM2(summary.wasteM2), ''],
    ['Aproveitamento', `${summary.efficiency.toFixed(1)}%`, ''],
    ['Peças não posicionadas', String(summary.unplaced), '']
  ]

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
    doc.text(row[1], margin + 90, y)
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
