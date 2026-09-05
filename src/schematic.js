function n(v, d = 0) {
  const x = Number(v)
  return Number.isFinite(x) ? x : d
}

function dim(x1, y1, x2, y2, label, along) {
  if (along === 'h') {
    const y = y1
    return `
      <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" />
      <text x="${(x1 + x2) / 2}" y="${y - 6}" text-anchor="middle">${label}</text>
    `
  }
  const x = x1
  return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" />
    <text x="${x - 8}" y="${(y1 + y2) / 2}" text-anchor="end">${label}</text>
  `
}

export function schematicSvg(item, view) {
  const p = item.params || {}
  const color = item.color || '#2E5A88'
  const type = item.type
  const variant = item.variant || ''
  const W = Math.max(1, n(p.width, 800))
  const H = Math.max(1, n(p.height, type === 'mesa' ? n(p.depth, 600) : 1800))
  const D = Math.max(1, n(p.depth, 500))

  if (type === 'mesa' && variant.startsWith('l-')) {
    if (view === '3d') return schematicLDesk3D(item)
    return schematicLDesk(item)
  }

  return schematicFront(item, { W, H, D, color, type, variant })
}

function schematicFront(item, meta) {
  const p = item.params || {}
  const color = meta.color
  const type = meta.type
  const variant = meta.variant || ''
  const W = meta.W
  const H = meta.H
  const D = meta.D

  const isDesk = type === 'mesa'
  const isShelf = type === 'prateleira'
  const dimH = isShelf ? D : H
  const vbW = 420
  const vbH = 300
  const padL = 58
  const padT = 28
  const padR = 24
  const padB = 46
  const boxW = vbW - padL - padR
  const boxH = vbH - padT - padB
  const scale = Math.min(boxW / W, boxH / dimH)
  const dw = W * scale
  const dh = dimH * scale
  const ox = padL + (boxW - dw) / 2
  const oy = padT + (boxH - dh) / 2

  let inner = ''
  if (isDesk) {
    const thicknessMm = n(p.thickness, 15)
    const topT = Math.max(6, thicknessMm * scale)
    const topH = topT
    inner += `<rect x="${ox}" y="${oy}" width="${dw}" height="${topT}" fill="${color}" />`
    const legW = Math.max(6, 18 * scale)
    const legHmm = Math.max(160, n(p.height, 750) - thicknessMm)
    const legHpx = Math.max(0, dh - topT)

    if (p.pernas === 'pernas') {
      const baseW = Math.max(4, 60 * scale)
      inner += `<rect x="${ox}" y="${oy + topH}" width="${baseW}" height="${legHpx}" fill="${color}" opacity="0.55" />`
      inner += `<rect x="${ox + dw - baseW}" y="${oy + topH}" width="${baseW}" height="${legHpx}" fill="${color}" opacity="0.55" />`
    } else {
      inner += `<rect x="${ox}" y="${oy + topH}" width="${legW}" height="${legHpx}" fill="${color}" opacity="0.75" />`
      inner += `<rect x="${ox + dw - legW}" y="${oy + topH}" width="${legW}" height="${legHpx}" fill="${color}" opacity="0.75" />`
    }

    if (p.modesty) {
      const saiaRaw = n(p.saiaH, 120)
      const saiaCap = Math.max(60, Math.round(legHmm * 0.6))
      const saiaMm = Math.max(5, Math.min(saiaRaw, saiaCap))
      const saiaPx = Math.min(Math.max(0, legHpx - 2), Math.max(4, saiaMm * scale))
      inner += `<rect x="${ox + legW}" y="${oy + topH}" width="${Math.max(0, dw - 2 * legW)}" height="${saiaPx}" fill="${color}" opacity="0.4" />`
    }

    if (p.shelf) {
      inner += `<rect x="${ox + legW}" y="${oy + dh - 14}" width="${Math.max(0, dw - 2 * legW)}" height="5" fill="${color}" opacity="0.55" />`
    }

    if (n(p.gavetas, 0) > 0) {
      inner += deskDrawerStack(p, ox, oy, dw, dh, topH, legW, legHmm, legHpx, scale, color)
    }
  } else if (isShelf) {
    inner += `<rect x="${ox}" y="${oy}" width="${dw}" height="${dh}" fill="${color}" />`
  } else if (type === 'avulso') {
    inner += `<rect x="${ox}" y="${oy}" width="${dw}" height="${dh}" fill="${color}" opacity="0.25" stroke="${color}" stroke-dasharray="6 4" />`
    inner += `<text x="${ox + dw / 2}" y="${oy + dh / 2}" text-anchor="middle" fill="${color}" font-size="14">Peças avulsas</text>`
  } else {
    inner += `<rect x="${ox}" y="${oy}" width="${dw}" height="${dh}" fill="${color}" opacity="0.18" stroke="${color}" stroke-width="2" />`
    const doors = Math.max(0, Math.floor(n(p.doors, 0)))
    const gavetas = Math.max(0, Math.floor(n(p.gavetas, 0)))
    const carcassT = Math.max(1, n(p.carcassT, 15))
    const panelPx = Math.max(2, carcassT * scale)
    const isGaveteiro = type === 'gaveteiro'
    let zoneMm = 0
    if (gavetas > 0) {
      zoneMm = isGaveteiro ? Math.max(60, H - 2 * carcassT) : Math.max(60, n(p.zoneH, Math.round(H * 0.5)))
    }
    const zoneH = Math.max(0, Math.min(dh - 4, zoneMm * scale))
    const zoneTop = Math.max(oy + panelPx, oy + dh - zoneH)
    const doorH = Math.max(0, zoneTop - oy - 4)
    const shelfAreaH = zoneH > 4 ? Math.max(0, zoneTop - oy) : dh

    if (doors && doorH > 4) {
      const sliding = p.doorStyle === 'correr'
      const gap = 2 * scale
      if (sliding) {
        const pairs = Math.max(1, Math.ceil(doors / 2))
        const doorW = dw / pairs
        for (let i = 0; i < pairs; i++) {
          const x = ox + i * doorW + gap / 2
          inner += `<rect x="${x}" y="${oy + 3}" width="${Math.max(1, doorW - gap)}" height="${Math.max(1, doorH - 6)}" fill="${color}" opacity="0.4" stroke="#f3ece3" stroke-width="0.5" />`
          inner += `<rect x="${x + 3}" y="${oy + 3}" width="${Math.max(1, doorW - 10)}" height="${Math.max(1, doorH - 6)}" fill="none" stroke="#f3ece3" stroke-width="0.3" stroke-dasharray="4 3" opacity="0.6" />`
        }
      } else {
        const doorW = (dw - gap * (doors + 1)) / doors
        for (let i = 0; i < doors; i++) {
          const x = ox + gap + i * (doorW + gap)
          inner += `<rect x="${x}" y="${oy + gap}" width="${Math.max(1, doorW)}" height="${Math.max(1, doorH - 2 * gap)}" fill="${color}" opacity="0.55" stroke="#f3ece3" stroke-width="0.6" />`
          inner += `<circle cx="${x + doorW - 6}" cy="${oy + doorH / 2}" r="2.2" fill="#f3ece3" />`
        }
      }
    }

    const shelves = Math.max(0, Math.floor(n(p.shelves, 0)))
    if (shelves && !doors) {
      for (let i = 1; i <= shelves; i++) {
        const y = oy + (shelfAreaH * i) / (shelves + 1)
        inner += `<line x1="${ox + 4}" y1="${y}" x2="${ox + dw - 4}" y2="${y}" stroke="${color}" stroke-width="2" />`
      }
    }

    const divs = Math.max(0, Math.floor(n(p.divisors, 0)))
    if (divs) {
      const t = Math.max(2, carcassT * scale)
      const divH = Math.max(4, (zoneH > 4 ? zoneTop - oy - 3 : dh - 6))
      for (let i = 1; i <= divs; i++) {
        const x = ox + (dw * i) / (divs + 1) - t / 2
        inner += `<rect x="${x}" y="${oy + 3}" width="${t}" height="${divH}" fill="${color}" opacity="0.85" />`
      }
    }

    if (gavetas > 0 && zoneH > 4) {
      const zonePx = oy + dh - 3 - zoneTop
      inner += `<rect x="${ox + 3}" y="${zoneTop}" width="${dw - 6}" height="${zonePx}" fill="${color}" opacity="0.22" />`
      const frontMm = drawerFrontHeight(p, zoneMm, gavetas)
      const gapPx = Math.max(1.5, 3 * scale)
      const maxFh = Math.max(3, (zonePx - gapPx * (gavetas + 1)) / gavetas)
      const fhPx = Math.min(maxFh, Math.max(3, frontMm * scale))
      let y = zoneTop + gapPx
      for (let i = 0; i < gavetas; i++) {
        inner += `<rect x="${ox + 6}" y="${y}" width="${dw - 12}" height="${fhPx}" fill="${color}" opacity="0.5" stroke="#f3ece3" stroke-width="0.4" />`
        y += fhPx + gapPx
      }
    }
  }

  const heightLabel = isShelf ? `${Math.round(D)}` : `${Math.round(isDesk ? n(p.height, 750) : H)}`
  const widthLabel = `${Math.round(W)}`
  const extra =
    isDesk || isShelf
      ? ''
      : `<text x="${ox + dw / 2}" y="${oy + dh + 32}" text-anchor="middle" class="muted">prof. ${Math.round(D)} mm</text>`

  return `
    <svg viewBox="0 0 ${vbW} ${vbH}" class="schematic-svg" aria-hidden="true">
      <rect x="0" y="0" width="${vbW}" height="${vbH}" fill="#1a1612" rx="12" />
      ${inner}
      ${dim(ox, oy + dh + 16, ox + dw, oy + dh + 16, widthLabel + ' mm', 'h')}
      ${dim(ox - 16, oy, ox - 16, oy + dh, heightLabel + ' mm', 'v')}
      ${extra}
    </svg>
  `
}

function drawerFrontHeight(p, zoneMm, count) {
  const nDrawers = Math.max(1, Math.floor(Number(count) || 1))
  const gap = 3
  const auto = Math.max(50, (zoneMm - gap * (nDrawers + 1)) / nDrawers)
  const want = Math.round(n(p.gavH, 0))
  return want > 0 ? Math.max(50, Math.min(want, auto)) : auto
}

function deskDrawerStack(p, ox, oy, dw, dh, topH, legW, legHmm, legHpx, scale, color) {
  const count = Math.max(1, Math.floor(n(p.gavetas, 1)))
  const elevated = p.drawerBase === 'alto'
  const gapMm = elevated ? Math.min(Math.max(0, legHmm - 120), Math.max(40, n(p.baseH, 120))) : 0
  const bodyHmm = Math.max(120, legHmm - gapMm)
  const bodyPx = Math.max(6, Math.min(legHpx, bodyHmm * scale))
  const wantCol = Number(p.pedW) || 0
  const colMax = Math.max(40, dw - 2 * legW - 6)
  const colWpx = Math.max(28, Math.min(colMax, wantCol > 0 ? wantCol * scale : dw * 0.34))
  const gx = ox + dw - colWpx - legW
  const gy = oy + topH
  let s = ''
  s += `<rect x="${gx}" y="${gy}" width="${colWpx}" height="${bodyPx}" fill="${color}" opacity="0.26" />`
  if (elevated && gapMm > 4) {
    const footH = Math.max(2, legHpx - bodyPx)
    const footW = Math.max(3, Math.min(70 * scale, colWpx * 0.92))
    const footY = gy + bodyPx
    s += `<rect x="${gx}" y="${footY}" width="${footW}" height="${footH}" fill="${color}" opacity="0.5" />`
    s += `<rect x="${gx + colWpx - footW}" y="${footY}" width="${footW}" height="${footH}" fill="${color}" opacity="0.5" />`
  }
  const frontMm = drawerFrontHeight(p, bodyHmm, count)
  const gapPx = Math.max(1.5, 3 * scale)
  const maxFh = Math.max(3, (bodyPx - gapPx * (count + 1)) / count)
  const fhPx = Math.min(maxFh, Math.max(3, frontMm * scale))
  let y = gy + gapPx
  for (let i = 0; i < count; i++) {
    s += `<rect x="${gx + gapPx}" y="${y}" width="${Math.max(1, colWpx - 2 * gapPx)}" height="${fhPx}" fill="${color}" opacity="0.5" />`
    y += fhPx + gapPx
  }
  return s
}

function schematicLDesk(item) {
  const p = item.params || {}
  const color = item.color || '#2E5A88'
  const W = Math.max(1, n(p.width, 1400))
  const D = Math.max(1, n(p.depth, 600))
  const rL = Math.max(1, n(p.retLen, 800))
  const rD = Math.max(1, n(p.retDepth, 500))
  const side = (item.variant || '').indexOf('dir') >= 0 ? 'right' : 'left'

  const vbW = 420
  const vbH = 300
  const padL = 30
  const padT = 30
  const padR = 40
  const padB = 50
  const boxW = vbW - padL - padR
  const boxH = vbH - padT - padB
  const scale = Math.min(boxW / (W + rL), boxH / (D + rD))
  const mainW = W * scale
  const mainD = D * scale
  const retW = rL * scale
  const retD = rD * scale

  let mw, mh, ox, oy, rx, ry, rw, rh
  if (side === 'right') {
    mw = mainW
    mh = mainD
    ox = padL
    oy = padT
    rx = ox + mw
    ry = oy + (mh - retD)
    rw = retW
    rh = retD
  } else {
    mw = mainW
    mh = mainD
    ox = padL + retW
    oy = padT
    rx = ox - retW
    ry = oy + (mh - retD)
    rw = retW
    rh = retD
  }

  const fillMain = `<rect x="${ox}" y="${oy}" width="${mw}" height="${mh}" fill="${color}" />`
  const fillRet = `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${color}" opacity="0.8" />`
  const totalX = Math.min(ox, rx)
  const totalY = Math.min(oy, ry)
  const totalW = Math.max(ox + mw, rx + rw) - totalX
  const totalH = Math.max(oy + mh, ry + rh) - totalY

  return `
    <svg viewBox="0 0 ${vbW} ${vbH}" class="schematic-svg" aria-hidden="true">
      <rect x="0" y="0" width="${vbW}" height="${vbH}" fill="#1a1612" rx="12" />
      ${fillRet}
      ${fillMain}
      ${dim(totalX, totalY + totalH + 16, totalX + totalW, totalY + totalH + 16, `${Math.round(W + (side === 'right' ? rL : rL))} mm`, 'h')}
      ${dim(totalX - 14, totalY, totalX - 14, totalY + totalH, `${Math.round(D + rD)} mm`, 'v')}
      <text x="${(totalX + totalW) / 2}" y="${totalY + totalH + 32}" text-anchor="middle" class="muted">vista superior · retorno ${side === 'right' ? 'direito' : 'esquerdo'} (${Math.round(rL)} mm)${n(p.gavetas, 0) > 0 ? ' · col. de gavetas' : ''}</text>
    </svg>
  `
}

function schematicLDesk3D(item) {
  const p = item.params || {}
  const color = item.color || '#2E5A88'
  const W = Math.max(1, n(p.width, 1400))
  const D = Math.max(1, n(p.depth, 600))
  const rL = Math.max(1, n(p.retLen, 800))
  const rD = Math.max(1, n(p.retDepth, 600))
  const tableH = Math.max(1, n(p.height, 750))
  const thk = Math.max(4, n(p.thickness, 15))
  const saiaRaw = Math.max(0, n(p.saiaH, 120))
  const saiaCap = Math.max(40, Math.round((tableH - thk) * 0.6))
  const saiaMm = Math.min(saiaRaw || 120, saiaCap)
  const side = (item.variant || '').indexOf('dir') >= 0 ? 'right' : 'left'
  const gavetas = Math.max(0, Math.floor(n(p.gavetas, 0)))
  const elevated = p.drawerBase === 'alto'
  const gapMm = gavetas && elevated ? Math.min(Math.max(0, tableH - thk - 120), Math.max(40, n(p.baseH, 120))) : 0

  const main = side === 'right' ? { px0: 0, px1: W, pz0: 0, pz1: D } : { px0: rL, px1: rL + W, pz0: 0, pz1: D }
  const ret = side === 'right' ? { px0: W, px1: W + rL, pz0: D - rD, pz1: D } : { px0: 0, px1: rL, pz0: D - rD, pz1: D }
  const leaves = [main, ret]

  const vbW = 420
  const vbH = 300
  const padX = 56
  const padTop = 46
  const padB = 38
  let minD = Infinity
  let maxD = -Infinity
  let minS = Infinity
  let maxS = -Infinity
  leaves.forEach(({ px0, px1, pz0, pz1 }) => {
    for (const px of [px0, px1]) {
      for (const pz of [pz0, pz1]) {
        minD = Math.min(minD, px - pz)
        maxD = Math.max(maxD, px - pz)
        minS = Math.min(minS, px + pz)
        maxS = Math.max(maxS, px + pz)
      }
    }
  })
  const cs = Math.min((vbW - 2 * padX) / (maxD - minD), (vbH - padTop - padB) / (0.5 * (maxS - minS + tableH)))
  const ox = padX - cs * minD
  const oy = padTop + 0.5 * cs * tableH - 0.5 * cs * minS
  const P = (px, pz, Y) => [ox + (px - pz) * cs, oy + (px + pz) * 0.5 * cs - Y * 0.5 * cs]
  const poly = (pts) => pts.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ')

  const dark = shade(color, -34)
  const darker = shade(color, -52)

  let g = ''

  const silhouettePts = side === 'right'
    ? [[0, 0], [W, 0], [W, D - rD], [W + rL, D - rD], [W + rL, D], [0, D]]
    : [[rL + W, 0], [rL + W, D], [0, D], [0, D - rD], [rL, D - rD], [rL, 0]]

  const shadow = silhouettePts.map(([px, pz]) => P(px, pz, 0))
  g += `<polygon points="${poly(shadow)}" fill="#000" opacity="0.16" />`

  const box = (x0, z0, x1, z1, yBot, yTop, fill) => {
    let s = ''
    const t = [P(x0, z0, yTop), P(x1, z0, yTop), P(x1, z1, yTop), P(x0, z1, yTop)]
    const fr = [P(x0, z1, yBot), P(x1, z1, yBot), P(x1, z1, yTop), P(x0, z1, yTop)]
    const ri = [P(x1, z0, yBot), P(x1, z1, yBot), P(x1, z1, yTop), P(x1, z0, yTop)]
    s += `<polygon points="${poly(fr)}" fill="${shade(fill, -16)}" />`
    s += `<polygon points="${poly(ri)}" fill="${shade(fill, -28)}" />`
    s += `<polygon points="${poly(t)}" fill="${fill}" stroke="${shade(fill, -34)}" stroke-width="0.6" />`
    return s
  }

  if (gavetas) {
    const colW = Math.min(rL - 40, Math.max(260, Number(p.pedW) || Math.min(620, rL - 120)))
    const c0x = main.px1 + (rL - colW) / 2
    const c1x = c0x + colW
    const colDepth = Math.max(120, rD - 100)
    const c0z = ret.pz1 - 60 - colDepth
    const c1z = ret.pz1 - 60
    g += box(c0x, c0z, c1x, c1z, gapMm, tableH - thk, shade(color, -6))
  }

  const drawLeaf = (leaf, fill, tag) => {
    let s = ''
    const frontEdge = leaf.pz1
    const botY = 0
    const yTop = tableH
    const legTop = tableH - thk
    if (p.pernas === 'pernas') {
      const pts = [
        [leaf.px0, leaf.pz0],
        [leaf.px1, leaf.pz0],
        [leaf.px1, leaf.pz1],
        [leaf.px0, leaf.pz1]
      ]
      for (const [px, pz] of pts) {
        const a = P(px, pz, botY)
        const b = P(px, pz, legTop)
        s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${dark}" stroke-width="2" stroke-linecap="round" />`
      }
    } else {
      const outerLeft = Math.min(main.px0, ret.px0)
      const outerRight = Math.max(main.px1, ret.px1)
      const o = {}
      if (leaf.px0 === outerLeft) o.left = true
      if (leaf.px1 === outerRight) o.right = true
      if (o.left) {
        const a = P(leaf.px0 + 4, leaf.pz0, botY)
        const b = P(leaf.px0 + 4, leaf.pz1, botY)
        const c = P(leaf.px0 + 4, leaf.pz1, legTop)
        const d = P(leaf.px0 + 4, leaf.pz0, legTop)
        s += `<polygon points="${poly([a, b, c, d])}" fill="${darker}" />`
      }
      if (o.right) {
        const a = P(leaf.px1 - 4, leaf.pz0, botY)
        const b = P(leaf.px1 - 4, leaf.pz1, botY)
        const c = P(leaf.px1 - 4, leaf.pz1, legTop)
        const d = P(leaf.px1 - 4, leaf.pz0, legTop)
        s += `<polygon points="${poly([a, b, c, d])}" fill="${darker}" />`
      }
    }

    if (p.modesty && saiaMm > 0 && !(gavetas && tag === 'ret')) {
      const syT = legTop
      const syB = Math.max(0, legTop - saiaMm)
      const a = P(leaf.px0, frontEdge, syB)
      const b = P(leaf.px1, frontEdge, syB)
      const c = P(leaf.px1, frontEdge, syT)
      const d = P(leaf.px0, frontEdge, syT)
      s += `<polygon points="${poly([a, b, c, d])}" fill="${fill}" opacity="0.55" />`
    }

    const a = P(leaf.px0, frontEdge, legTop)
    const b = P(leaf.px1, frontEdge, legTop)
    const c = P(leaf.px1, frontEdge, yTop)
    const d = P(leaf.px0, frontEdge, yTop)
    s += `<polygon points="${poly([a, b, c, d])}" fill="${shade(fill, 18)}" />`

    const topPts = [
      P(leaf.px0, leaf.pz0, yTop),
      P(leaf.px1, leaf.pz0, yTop),
      P(leaf.px1, leaf.pz1, yTop),
      P(leaf.px0, leaf.pz1, yTop)
    ]
    s += `<polygon points="${poly(topPts)}" fill="${fill}" />`
    return s
  }

  g += drawLeaf(main, color, 'main')
  g += drawLeaf(ret, side === 'right' ? shade(color, 8) : shade(color, 8), 'ret')

  const silTop = silhouettePts.map(([px, pz]) => P(px, pz, tableH))
  silTop.push(silTop[0])
  g += `<polyline points="${poly(silTop)}" fill="none" stroke="${shade(color, -44)}" stroke-width="1.6" opacity="0.9" />`

  const dLabel = Math.round(side === 'right' ? W + rL : rL + W)
  const label = `perspectiva · retorno ${side === 'right' ? 'à direita' : 'à esquerda'} (${Math.round(rL)} × ${Math.round(rD)} mm) · ${dLabel} × ${Math.round(D)} mm · alt. ${Math.round(tableH)} mm${gavetas ? ' · com gaveteiro' : ''}`

  return `
    <svg viewBox="0 0 ${vbW} ${vbH}" class="schematic-svg" aria-hidden="true">
      <rect x="0" y="0" width="${vbW}" height="${vbH}" fill="#1a1612" rx="12" />
      ${g}
      <text x="${vbW / 2}" y="${vbH - 8}" text-anchor="middle" class="muted">${label}</text>
    </svg>
  `
}

function shade(hex, amt) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const num = parseInt(full, 16)
  const r = Math.max(0, Math.min(255, (num >> 16) + amt))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt))
  const b = Math.max(0, Math.min(255, (num & 0xff) + amt))
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}
