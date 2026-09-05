function orientations(piece) {
  const L = Number(piece.length)
  const A = Number(piece.width)
  if (piece.grain === 'comprimento') {
    return [{ w: L, h: A, rotated: false }]
  }
  if (piece.grain === 'largura') {
    return [{ w: A, h: L, rotated: true }]
  }
  const opts = [{ w: L, h: A, rotated: false }]
  if (L !== A) opts.push({ w: A, h: L, rotated: true })
  return opts
}

export function expandPieces(pieces) {
  const out = []
  for (const p of pieces) {
    const qty = Math.max(0, Math.floor(Number(p.qty) || 0))
    for (let i = 0; i < qty; i++) {
      out.push({
        ...p,
        length: Number(p.length),
        width: Number(p.width),
        thickness: Number(p.thickness),
        instance: i + 1,
        uid: `${p.id}-${i}`
      })
    }
  }
  return out
}

export function edgeMeters(piece) {
  const L = Number(piece.length) / 1000
  const A = Number(piece.width) / 1000
  const e = piece.edges || {}
  let m = 0
  if (e.front) m += L
  if (e.back) m += L
  if (e.left) m += A
  if (e.right) m += A
  return m * Math.max(0, Number(piece.qty) || 0)
}

export function pieceAreaM2(piece) {
  return (Number(piece.length) * Number(piece.width) * Math.max(0, Number(piece.qty) || 0)) / 1e6
}

function fits(W, H, w, h) {
  return w <= W + 1e-6 && h <= H + 1e-6
}

function occupy(size, kerf, remaining) {
  return Math.min(remaining, size + kerf)
}

function computeGuillotine(board, item, kerf) {
  const orients = orientations(item)
  let best = null
  for (const strip of board.strips) {
    for (const o of orients) {
      if (o.h <= strip.height + 1e-6 && o.w <= strip.remaining + 1e-6) {
        const used = occupy(o.w, kerf, strip.remaining)
        const cost = strip.remaining - used
        if (!best || cost < best.cost) best = { kind: 'strip', strip, o, cost }
      }
    }
  }

  const usedH = board.strips.reduce((s, st) => s + st.height, 0)
  const remainH = board.H - usedH
  const ranked = [...orients].sort((a, b) => a.h - b.h)
  for (const o of ranked) {
    if (o.h <= remainH + 1e-6 && o.w <= board.W + 1e-6) {
      const used = occupy(o.h, kerf, remainH)
      const cost = remainH - used
      if (!best || cost < best.cost) best = { kind: 'row', o, cost }
      break
    }
  }
  return best
}

function placeGuillotine(board, item, kerf) {
  const best = computeGuillotine(board, item, kerf)
  if (!best) return false
  if (best.kind === 'strip') {
    const x = board.W - best.strip.remaining
    const y = best.strip.y
    const used = occupy(best.o.w, kerf, best.strip.remaining)
    best.strip.usedW += used
    best.strip.remaining -= used
    board.placements.push(placeRecord(item, best.o, x, y))
    return true
  }
  const usedH = board.strips.reduce((s, st) => s + st.height, 0)
  const remainH = board.H - usedH
  const stripH = occupy(best.o.h, kerf, remainH)
  const usedW = occupy(best.o.w, kerf, board.W)
  const strip = {
    y: usedH,
    height: stripH,
    usedW,
    remaining: board.W - usedW
  }
  board.strips.push(strip)
  board.placements.push(placeRecord(item, best.o, 0, strip.y))
  return true
}

function splitFree(free, used) {
  const result = []
  for (const f of free) {
    if (
      used.x >= f.x + f.w ||
      used.x + used.w <= f.x ||
      used.y >= f.y + f.h ||
      used.y + used.h <= f.y
    ) {
      result.push(f)
      continue
    }
    if (used.x > f.x) {
      result.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h })
    }
    if (used.x + used.w < f.x + f.w) {
      result.push({
        x: used.x + used.w,
        y: f.y,
        w: f.x + f.w - (used.x + used.w),
        h: f.h
      })
    }
    if (used.y > f.y) {
      result.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y })
    }
    if (used.y + used.h < f.y + f.h) {
      result.push({
        x: f.x,
        y: used.y + used.h,
        w: f.w,
        h: f.y + f.h - (used.y + used.h)
      })
    }
  }
  return pruneRects(result)
}

function pruneRects(rects) {
  const out = []
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i]
    if (a.w <= 0 || a.h <= 0) continue
    let contained = false
    for (let j = 0; j < rects.length; j++) {
      if (i === j) continue
      const b = rects[j]
      if (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
        contained = true
        break
      }
    }
    if (!contained) out.push(a)
  }
  return out
}

function placeFree(board, item, kerf) {
  const orients = orientations(item)
  let best = null
  let bestShort = Infinity
  let bestArea = Infinity

  for (const o of orients) {
    for (const f of board.free) {
      if (!fits(f.w, f.h, o.w, o.h)) continue
      const ow = occupy(o.w, kerf, f.w)
      const oh = occupy(o.h, kerf, f.h)
      const leftoverW = f.w - ow
      const leftoverH = f.h - oh
      const ss = Math.min(leftoverW, leftoverH)
      const area = leftoverW * leftoverH
      if (ss < bestShort || (ss === bestShort && area < bestArea)) {
        bestShort = ss
        bestArea = area
        best = { f, o, ow, oh }
      }
    }
  }

  if (!best) return false
  const { f, o, ow, oh } = best
  board.free = splitFree(board.free, { x: f.x, y: f.y, w: ow, h: oh })
  board.placements.push(placeRecord(item, o, f.x, f.y))
  return true
}

function placeRecord(item, o, x, y) {
  return {
    uid: item.uid,
    pieceId: item.id,
    name: item.name,
    instance: item.instance,
    qty: item.qty,
    x,
    y,
    w: o.w,
    h: o.h,
    rotated: o.rotated,
    grain: item.grain,
    thickness: item.thickness,
    furnitureId: item.furnitureId || '',
    furnitureName: item.furnitureName || '',
    furnitureCode: item.furnitureCode || '',
    color: item.color || '#5c4033'
  }
}

function newBoard(W, H, mode, thickness) {
  return {
    W,
    H,
    mode,
    thickness,
    strips: [],
    free: [{ x: 0, y: 0, w: W, h: H }],
    placements: []
  }
}

export function nest(pieces, settings) {
  const kerf = Math.max(0, Number(settings.kerf) || 0)
  const trim = Math.max(0, Number(settings.trim) || 0)
  const sheetW = Number(settings.sheetWidth)
  const sheetH = Number(settings.sheetHeight)
  const W = sheetW - 2 * trim
  const H = sheetH - 2 * trim
  const mode = settings.cutMode === 'free' ? 'free' : 'guillotine'

  const items = expandPieces(pieces).sort((a, b) => {
    const aa = a.length * a.width
    const ba = b.length * b.width
    if (ba !== aa) return ba - aa
    return Math.max(b.length, b.width) - Math.max(a.length, a.width)
  })

  const boards = []
  const unplaced = []

  for (const item of items) {
    const maxSide = Math.max(item.length, item.width)
    const minSide = Math.min(item.length, item.width)
    if (maxSide > Math.max(W, H) + 1e-6 || minSide > Math.min(W, H) + 1e-6) {
      if (!fits(W, H, item.length, item.width) && !fits(W, H, item.width, item.length)) {
        unplaced.push(item)
        continue
      }
    }

    let placed = false
    if (mode === 'free') {
      for (const board of boards) {
        if (board.thickness !== item.thickness) continue
        placed = placeFree(board, item, kerf)
        if (placed) break
      }
    } else {
      let bestBoard = null
      let bestCost = Infinity
      for (const board of boards) {
        if (board.thickness !== item.thickness) continue
        const c = computeGuillotine(board, item, kerf)
        if (c && c.cost < bestCost) {
          bestCost = c.cost
          bestBoard = board
        }
      }
      if (bestBoard) placed = placeGuillotine(bestBoard, item, kerf)
    }
    if (!placed) {
      const board = newBoard(W, H, mode, item.thickness)
      placed = mode === 'free' ? placeFree(board, item, kerf) : placeGuillotine(board, item, kerf)
      if (placed) boards.push(board)
      else unplaced.push(item)
    }
  }

  const sheetArea = sheetW * sheetH
  const mapped = boards.map((board, index) => {
    const used = board.placements.reduce((s, p) => s + p.w * p.h, 0)
    const usable = W * H
    return {
      index: index + 1,
      sheetWidth: sheetW,
      sheetHeight: sheetH,
      trim,
      kerf,
      packW: W,
      packH: H,
      thickness: board.thickness,
      placements: board.placements,
      usedArea: used,
      usableArea: usable,
      sheetArea,
      wasteArea: Math.max(0, usable - used),
      efficiency: usable > 0 ? (used / usable) * 100 : 0,
      mode
    }
  })

  const totalUsed = mapped.reduce((s, b) => s + b.usedArea, 0)
  const totalSheet = mapped.length * sheetArea
  const totalUsable = mapped.length * (W * H)

  return {
    boards: mapped,
    unplaced,
    sheetsNeeded: mapped.length,
    totalUsed,
    totalSheet,
    totalUsable,
    efficiency: totalUsable > 0 ? (totalUsed / totalUsable) * 100 : 0,
    wasteArea: Math.max(0, totalUsable - totalUsed)
  }
}

export function summarize(project, settings, layout, pieces) {
  const list = pieces || project.pieces || []
  const areaM2 = list.reduce((s, p) => s + pieceAreaM2(p), 0)
  const tapeM = list.reduce((s, p) => s + edgeMeters(p), 0)
  const sheets = layout.sheetsNeeded
  const sheetCost = sheets * Number(settings.sheetPrice || 0)
  const tapeCost = tapeM * Number(settings.tapePricePerMeter || 0)
  const labor = (sheetCost + tapeCost) * (Number(settings.laborPercent || 0) / 100)
  const total = sheetCost + tapeCost + labor
  const sheetAreaM2 = (Number(settings.sheetWidth) * Number(settings.sheetHeight) * sheets) / 1e6
  const byFurniture = {}
  for (const p of list) {
    const key = p.furnitureId || '_avulso'
    if (!byFurniture[key]) {
      byFurniture[key] = {
        id: p.furnitureId,
        name: p.furnitureName || 'Peças',
        code: p.furnitureCode || '',
        color: p.color || '#5c4033',
        pieceCount: 0,
        areaM2: 0,
        tapeM: 0
      }
    }
    byFurniture[key].pieceCount += Math.max(0, Number(p.qty) || 0)
    byFurniture[key].areaM2 += pieceAreaM2(p)
    byFurniture[key].tapeM += edgeMeters(p)
  }
  return {
    pieceCount: list.reduce((s, p) => s + Math.max(0, Number(p.qty) || 0), 0),
    types: list.length,
    areaM2,
    tapeM,
    sheets,
    sheetCost,
    tapeCost,
    labor,
    total,
    sheetAreaM2,
    efficiency: layout.efficiency,
    wasteM2: layout.wasteArea / 1e6,
    unplaced: layout.unplaced.length,
    byFurniture: Object.values(byFurniture)
  }
}
