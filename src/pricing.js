import { flattenProjectPieces } from './catalog.js'
import { edgeMeters, pieceAreaM2 } from './nesting.js'

const qtyInt = (v) => Math.max(0, Math.floor(Number(v) || 0))

export function sheetAreaM2(settings) {
  return (Number(settings.sheetWidth || 0) * Number(settings.sheetHeight || 0)) / 1e6
}

export function panelPricePerM2(settings) {
  const area = sheetAreaM2(settings)
  return area > 0 ? Number(settings.sheetPrice || 0) / area : 0
}

export function itemMetrics(item) {
  const list = flattenProjectPieces({ furniture: [{ ...item, qty: 1 }] })
  let areaM2 = 0
  let tapeM = 0
  let pieceCount = 0
  for (const p of list) {
    areaM2 += pieceAreaM2(p)
    tapeM += edgeMeters(p)
    pieceCount += Math.max(0, Number(p.qty) || 0)
  }
  return { areaM2, tapeM, pieceCount }
}

function unitQty(item) {
  return Math.max(1, qtyInt(item.qty) || 1)
}

export function itemCost(item, settings) {
  const m = itemMetrics(item)
  const panel = m.areaM2 * panelPricePerM2(settings)
  const tape = m.tapeM * Number(settings.tapePricePerMeter || 0)
  const material = panel + tape
  const laborPct = Number(settings.laborPercent || 0)
  const labor = material * (laborPct / 100)
  return { ...m, panel, tape, material, labor, cost: material + labor }
}

export function rateioCtx(furniture, settings, sheets, basis) {
  let totalPanelLine = 0
  for (const f of furniture || []) {
    totalPanelLine += itemCost(f, settings).panel * unitQty(f)
  }
  const sheetCount = Math.max(0, Math.floor(Number(sheets) || 0))
  const sheetCost = sheetCount * Number(settings.sheetPrice || 0)
  const wasteCost = Math.max(0, sheetCost - totalPanelLine)
  return {
    basis: basis === 'rateio' ? 'rateio' : 'used',
    totalPanelLine,
    sheetCost,
    wasteCost
  }
}

function adjustPanel(c, qty, ctx) {
  if (!ctx || ctx.basis !== 'rateio') return c.panel
  if (!(ctx.totalPanelLine > 0) || !(ctx.wasteCost > 0)) return c.panel
  const linePanel = c.panel * qty
  return c.panel + ctx.wasteCost * (linePanel / ctx.totalPanelLine) / qty
}

export function saleCalc(item, settings, ctx) {
  const c = itemCost(item, settings)
  const hasOverride = item.margin !== undefined && item.margin !== null
  const margin = hasOverride ? Number(item.margin) : Number(settings.defaultMargin || 0)
  const qty = unitQty(item)
  const panel = adjustPanel(c, qty, ctx)
  const material = panel + c.tape
  const laborPct = Number(settings.laborPercent || 0)
  const labor = material * (laborPct / 100)
  const cost = material + labor
  const salePerUnit = cost * (1 + margin / 100)
  return { ...c, panel, material, labor, cost, margin, hasOverride, qty, salePerUnit, lineTotal: salePerUnit * qty, costLine: cost * qty }
}

export function projectTotals(furniture, settings, ctx) {
  let cost = 0
  let sale = 0
  let profit = 0
  let count = 0
  let units = 0
  for (const f of furniture || []) {
    const s = saleCalc(f, settings, ctx)
    cost += s.costLine
    sale += s.lineTotal
    profit += s.lineTotal - s.costLine
    count += 1
    units += s.qty
  }
  return { cost, sale, profit, count, units }
}
