import { sheetSpecs } from './store.js'

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
  return size + kerf
}

function computeGuillotine(board, item, kerf) {
  const orients = orientations(item)
  let best = null
  for (const strip of board.strips) {
    for (const o of orients) {
      if (o.h <= strip.height - kerf + 1e-6 && o.w <= strip.remaining + 1e-6) {
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

function splitFree(free, used, kerf) {
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
      const w = used.x - kerf - f.x
      if (w > 1e-6) result.push({ x: f.x, y: f.y, w, h: f.h })
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
      const hh = used.y - kerf - f.y
      if (hh > 1e-6) result.push({ x: f.x, y: f.y, w: f.w, h: hh })
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
  board.free = splitFree(board.free, { x: f.x, y: f.y, w: ow, h: oh }, kerf)
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
    hidden: !!item.hidden,
    length: Number(item.length),
    width: Number(item.width),
    thickness: item.thickness,
    furnitureId: item.furnitureId || '',
    furnitureName: item.furnitureName || '',
    furnitureCode: item.furnitureCode || '',
    color: item.color || '#5c4033'
  }
}

function itemFromPlacement(p) {
  return {
    uid: p.uid,
    id: p.pieceId,
    name: p.name,
    instance: p.instance,
    qty: p.qty,
    length: Number(p.length) || (p.rotated ? p.h : p.w),
    width: Number(p.width) || (p.rotated ? p.w : p.h),
    grain: p.grain,
    hidden: !!p.hidden,
    thickness: p.thickness,
    furnitureId: p.furnitureId || '',
    furnitureName: p.furnitureName || '',
    furnitureCode: p.furnitureCode || '',
    color: p.color || '#5c4033'
  }
}

function rebuildFree(board, kerf) {
  board.free = [{ x: 0, y: 0, w: board.W, h: board.H }]
  for (const p of board.placements) {
    const ow = occupy(p.w, kerf, board.W - p.x)
    const oh = occupy(p.h, kerf, board.H - p.y)
    board.free = splitFree(board.free, { x: p.x, y: p.y, w: ow, h: oh }, kerf)
  }
}

function compactBoards(boards, kerf) {
  const out = boards.slice()
  let changed = true
  let guard = 0
  while (changed && guard++ < 24) {
    changed = false
    for (let i = out.length - 1; i > 0; i--) {
      const src = out[i]
      const dests = []
      for (let j = i - 1; j >= 0; j--) {
        if (out[j].thickness === src.thickness) dests.push(out[j])
      }
      if (!dests.length) continue
      for (const d of dests) rebuildFree(d, kerf)
      const keep = []
      const movers = [...src.placements].sort((a, b) => b.w * b.h - a.w * a.h)
      for (const p of movers) {
        const item = itemFromPlacement(p)
        let moved = false
        for (const d of dests) {
          if (placeFree(d, item, kerf)) {
            moved = true
            changed = true
            break
          }
        }
        if (!moved) keep.push(p)
      }
      src.placements = keep
    }
    for (let i = out.length - 1; i >= 0; i--) {
      if (!out[i].placements.length) out.splice(i, 1)
    }
  }
  for (const board of out) packTightBoard(board, kerf)
  return out
}

function lexLess(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i]
  }
  return false
}

function contactAt(board, x, y, w, h, kerf) {
  let c = 0
  if (x <= 1e-6) c += h
  if (y <= 1e-6) c += w
  const x2 = x + w
  const y2 = y + h
  for (const p of board.placements) {
    const px2 = p.x + p.w
    const py2 = p.y + p.h
    if (Math.abs(px2 + kerf - x) < 1.2 || Math.abs(x2 + kerf - p.x) < 1.2) {
      const ov = Math.min(py2, y2) - Math.max(p.y, y)
      if (ov > 0) c += ov
    }
    if (Math.abs(py2 + kerf - y) < 1.2 || Math.abs(y2 + kerf - p.y) < 1.2) {
      const ov = Math.min(px2, x2) - Math.max(p.x, x)
      if (ov > 0) c += ov
    }
  }
  return c
}

function placeTight(board, item, kerf) {
  const orients = orientations(item)
  const usedH = board.placements.reduce((m, p) => Math.max(m, p.y + p.h), 0)
  const usedW = board.placements.reduce((m, p) => Math.max(m, p.x + p.w), 0)
  let best = null
  let bestKey = null
  for (const o of orients) {
    for (const f of board.free) {
      if (!fits(f.w, f.h, o.w, o.h)) continue
      const ow = occupy(o.w, kerf, f.w)
      const oh = occupy(o.h, kerf, f.h)
      const contact = contactAt(board, f.x, f.y, o.w, o.h, kerf)
      const growH = Math.max(usedH, f.y + o.h)
      const growW = Math.max(usedW, f.x + o.w)
      const key = [growH, growW, f.y, f.x, -contact]
      if (!best || lexLess(key, bestKey)) {
        best = { f, o, ow, oh }
        bestKey = key
      }
    }
  }
  if (!best) return false
  board.free = splitFree(board.free, { x: best.f.x, y: best.f.y, w: best.ow, h: best.oh }, kerf)
  board.placements.push(placeRecord(item, best.o, best.f.x, best.f.y))
  return true
}

function leftoverScore(board) {
  const usedH = (board.placements || []).reduce((m, p) => Math.max(m, p.y + p.h), 0)
  const usedW = (board.placements || []).reduce((m, p) => Math.max(m, p.x + p.w), 0)
  const bottom = Math.max(0, board.H - usedH) * board.W
  const right = Math.max(0, board.W - usedW) * board.H
  const free = board.free || []
  return [Math.max(bottom, right), -usedH, -usedW, -(free.length || 0)]
}

function emptyLike(board) {
  const b = newBoard(board.W, board.H, board.mode, board.thickness)
  b.spec = board.spec
  return b
}

function packWith(board, items, kerf, sorter, placer) {
  const fresh = emptyLike(board)
  const sorted = [...items].sort(sorter)
  for (const item of sorted) {
    if (!placer(fresh, item, kerf)) return null
  }
  rebuildFree(fresh, kerf)
  return fresh
}

function packTightBoard(board, kerf) {
  gravityBoard(board, kerf)
  const items = (board.placements || []).map(itemFromPlacement)
  if (items.length < 2) return
  const areaSort = (a, b) => b.length * b.width - a.length * a.width || Math.max(b.length, b.width) - Math.max(a.length, a.width)
  const bulkyFirst = (a, b) => {
    const amin = Math.min(a.length, a.width)
    const bmin = Math.min(b.length, b.width)
    if (bmin !== amin) return bmin - amin
    return areaSort(a, b)
  }
  const lockedFirst = (a, b) => {
    const ga = a.hidden || a.grain === 'livre' ? 1 : 0
    const gb = b.hidden || b.grain === 'livre' ? 1 : 0
    if (ga !== gb) return ga - gb
    return bulkyFirst(a, b)
  }
  const asPlaced = () => 0
  const attempts = [
    [areaSort, placeGuillotine],
    [bulkyFirst, placeGuillotine],
    [lockedFirst, placeGuillotine],
    [areaSort, placeTight],
    [bulkyFirst, placeTight],
    [lockedFirst, placeTight],
    [asPlaced, placeTight]
  ]
  rebuildFree(board, kerf)
  let best = board
  let bestScore = leftoverScore(board)
  for (const [sorter, placer] of attempts) {
    const packed = packWith(board, items, kerf, sorter, placer)
    if (!packed || packed.placements.length !== items.length) continue
    gravityBoard(packed, kerf)
    const score = leftoverScore(packed)
    if (lexLess(bestScore, score)) {
      best = packed
      bestScore = score
    }
  }
  if (best !== board) {
    board.placements = best.placements
    board.free = best.free
    board.strips = best.strips
  }
  gravityBoard(board, kerf)
}

export function overlapGap(a, b, kerf) {
  return a.x < b.x + b.w + kerf - 1e-6 && a.x + a.w + kerf - 1e-6 > b.x && a.y < b.y + b.h + kerf - 1e-6 && a.y + a.h + kerf - 1e-6 > b.y
}

function canSit(board, p, x, y, kerf) {
  if (x < -1e-6 || y < -1e-6 || x + p.w > board.W + 1e-6 || y + p.h > board.H + 1e-6) return false
  const me = { x, y, w: p.w, h: p.h }
  for (const q of board.placements) {
    if (q === p) continue
    if (overlapGap(me, q, kerf)) return false
  }
  return true
}

export function placementFits(board, c) {
  return c.x >= -0.5 && c.y >= -0.5 && c.x + c.w <= board.packW + 0.5 && c.y + c.h <= board.packH + 0.5
}

function manualCandidate(piece, move) {
  const rotated = !!move.rotated
  const length = Number(piece.length) || piece.w
  const width = Number(piece.width) || piece.h
  return {
    x: Number(move.x),
    y: Number(move.y),
    w: rotated ? width : length,
    h: rotated ? length : width,
    rotated
  }
}

export function applyManualMoves(layout, moves) {
  if (!layout || !moves) return layout
  for (const board of layout.boards) {
    const moved = board.placements.filter((q) => moves[q.uid])
    if (!moved.length) continue
    const settled = board.placements
      .filter((q) => !moves[q.uid])
      .map((q) => ({ x: q.x, y: q.y, w: q.w, h: q.h }))
    for (const piece of moved) {
      const cand = manualCandidate(piece, moves[piece.uid])
      if (!Number.isFinite(cand.x) || !Number.isFinite(cand.y)) continue
      if (!placementFits(board, cand)) continue
      if (settled.some((q) => overlapGap(cand, q, board.kerf))) continue
      piece.x = cand.x
      piece.y = cand.y
      piece.rotated = cand.rotated
      piece.w = cand.w
      piece.h = cand.h
      settled.push(cand)
    }
  }
  return layout
}

function gravityBoard(board, kerf) {
  const snaps = (axis) => {
    const s = new Set([0])
    for (const p of board.placements) s.add(axis === 'x' ? p.x + p.w + kerf : p.y + p.h + kerf)
    return [...s].filter((v) => v >= -1e-6).sort((a, b) => a - b)
  }
  let moved = true
  let guard = 0
  while (moved && guard++ < 40) {
    moved = false
    const order = [...board.placements].sort((a, b) => a.y - b.y || a.x - b.x)
    for (const p of order) {
      for (const x of snaps('x')) {
        if (x >= p.x - 1e-6) break
        if (canSit(board, p, x, p.y, kerf)) {
          p.x = x
          moved = true
          break
        }
      }
      for (const y of snaps('y')) {
        if (y >= p.y - 1e-6) break
        if (canSit(board, p, p.x, y, kerf)) {
          p.y = y
          moved = true
          break
        }
      }
    }
  }
  rebuildFree(board, kerf)
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
  const rawMode = ['mac', 'free', 'manual'].includes(settings.cutMode) ? settings.cutMode : 'guillotine'
  const mode = rawMode === 'guillotine' ? 'guillotine' : 'free'
  const tight = rawMode === 'mac'
  const specs = sheetSpecs(settings).filter((sp) => sp.width - 2 * trim > 0 && sp.height - 2 * trim > 0)
  const empty = {
    boards: [],
    unplaced: [],
    sheetsNeeded: 0,
    totalUsed: 0,
    totalSheet: 0,
    totalUsable: 0,
    efficiency: 0,
    wasteArea: 0
  }
  if (!specs.length) return empty

  const itemFits = (item, sp) => {
    const W = sp.width - 2 * trim
    const H = sp.height - 2 * trim
    return fits(W, H, item.length, item.width) || fits(W, H, item.width, item.length)
  }
  const specForItem = (item) => {
    let exact = null
    let any = null
    for (const sp of specs) {
      if (!itemFits(item, sp)) continue
      const area = sp.width * sp.height
      const cand = { sp, area }
      if (!any || area < any.area) any = cand
      if (sp.thickness === item.thickness && (!exact || area < exact.area)) exact = cand
    }
    return exact || any
  }

  const areaSort = (a, b) => {
    const aa = a.length * a.width
    const ba = b.length * b.width
    if (ba !== aa) return ba - aa
    return Math.max(b.length, b.width) - Math.max(a.length, a.width)
  }
  const fillSort = (a, b) => {
    const ha = a.hidden ? 1 : 0
    const hb = b.hidden ? 1 : 0
    if (ha !== hb) return ha - hb
    return areaSort(a, b)
  }

  const pack = (items) => {
    const boards = []
    const unplaced = []
    for (const item of items) {
      const pick = specForItem(item)
      if (!pick) {
        unplaced.push(item)
        continue
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
        const board = newBoard(pick.sp.width - 2 * trim, pick.sp.height - 2 * trim, mode, item.thickness)
        board.spec = pick.sp
        placed = mode === 'free' ? placeFree(board, item, kerf) : placeGuillotine(board, item, kerf)
        if (placed) boards.push(board)
        else unplaced.push(item)
      }
    }

    const result = tight ? compactBoards(boards, kerf) : boards
    for (const board of result) {
      const ordered = [...board.placements].sort((a, b) => a.y - b.y || a.x - b.x)
      ordered.forEach((p, i) => {
        p.order = i + 1
      })
    }
    return { boards: result, unplaced }
  }

  const finish = (boards, unplaced) => {
    const mapped = boards.map((board, index) => {
      const sp = board.spec
      const W = sp.width - 2 * trim
      const H = sp.height - 2 * trim
      const used = board.placements.reduce((s, p) => s + p.w * p.h, 0)
      const usable = W * H
      return {
        index: index + 1,
        sheetWidth: sp.width,
        sheetHeight: sp.height,
        sheetName: sp.name,
        sheetPrice: sp.price,
        trim,
        kerf,
        packW: W,
        packH: H,
        thickness: board.thickness,
        placements: board.placements,
        usedArea: used,
        usableArea: usable,
        sheetArea: sp.width * sp.height,
        wasteArea: Math.max(0, usable - used),
        efficiency: usable > 0 ? (used / usable) * 100 : 0,
        mode: rawMode
      }
    })

    const totalUsed = mapped.reduce((s, b) => s + b.usedArea, 0)
    const totalSheet = mapped.reduce((s, b) => s + b.sheetArea, 0)
    const totalUsable = mapped.reduce((s, b) => s + b.usableArea, 0)

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

  const scoreOf = (res, pol) => [res.unplaced.length, res.sheetsNeeded, -res.efficiency, pol.fill ? 0 : 1]
  const better = (a, b) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] < b[i]
    }
    return false
  }

  const hasHidden = pieces.some((p) => p.hidden)
  const canFree = pieces.some((p) => p.hidden && p.grain !== 'livre')
  const policies = [{ free: false, fill: false }]
  if (canFree) policies.push({ free: true, fill: false })
  if (hasHidden) policies.push({ free: true, fill: true })

  let best = null
  for (const pol of policies) {
    const transformed = pieces.map((p) => (pol.free && p.hidden ? { ...p, grain: 'livre' } : p))
    const items = expandPieces(transformed).sort(pol.fill ? fillSort : areaSort)
    const packed = pack(items)
    const res = finish(packed.boards, packed.unplaced)
    const score = scoreOf(res, pol)
    if (!best || better(score, best.score)) best = { res, score }
  }
  return best.res
}

export function cutSequence(board) {
  const rows = []
  const ordered = [...(board.placements || [])].sort((a, b) => a.y - b.y || a.x - b.x)
  for (const p of ordered) {
    let row = rows.find((r) => Math.abs(r.y - p.y) < 0.5)
    if (!row) {
      row = { y: p.y, height: 0, pieces: [] }
      rows.push(row)
    }
    row.pieces.push(p)
    row.height = Math.max(row.height, p.h)
  }
  return rows
}

export function summarize(project, settings, layout, pieces) {
  const list = pieces || project.pieces || []
  const areaM2 = list.reduce((s, p) => s + pieceAreaM2(p), 0)
  const tapeM = list.reduce((s, p) => s + edgeMeters(p), 0)
  const sheets = layout.sheetsNeeded
  const boards = layout.boards || []
  const sheetCost = boards.length
    ? boards.reduce((s, b) => s + Number(b.sheetPrice || 0), 0)
    : sheets * Number(settings.sheetPrice || 0)
  const tapeCost = tapeM * Number(settings.tapePricePerMeter || 0)
  const labor = (sheetCost + tapeCost) * (Number(settings.laborPercent || 0) / 100)
  const total = sheetCost + tapeCost + labor
  const sheetAreaM2 = boards.length
    ? boards.reduce((s, b) => s + b.sheetArea, 0) / 1e6
    : (Number(settings.sheetWidth) * Number(settings.sheetHeight) * sheets) / 1e6
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
