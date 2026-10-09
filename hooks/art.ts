// Draws the monster procedurally: a body, its line's features, eyes and mouth for its mood,
// then an outline and shading. Every stage and line comes out in one consistent style.

import type { Line, Stage } from './pet'

export type Rgb = number
export type Sprite = { readonly w: number; readonly h: number; readonly px: readonly (Rgb | null)[] }

export const INK = 0x1a1c2c
const WHITE = 0xf4f4f4
const GOLD = 0xffcd75
const GOLD_DARK = 0xe8a33d
const PINK = 0xf4a0b0
const SILVER = 0x94b0c2
const RED = 0xe24b4a

type Palette = { base: Rgb; dark: Rgb; light: Rgb }

const PALETTES: Record<Line | 'baby', Palette> = {
  baby: { base: 0x8fd694, dark: 0x3e8948, light: 0xc9f2b5 },
  forge: { base: 0xef7d57, dark: 0xb13e53, light: 0xffcd75 },
  scribe: { base: 0x9b59d0, dark: 0x5d275d, light: 0xd9b8f0 },
  summoner: { base: 0x41a6f6, dark: 0x3b5dc9, light: 0x73eff7 },
  wanderer: { base: 0x38b764, dark: 0x257179, light: 0xa7f070 },
}

export type Eyes = 'open' | 'closed' | 'happy' | 'x' | 'dizzy'
export type Mouth = 'smile' | 'open' | 'frown' | 'flat' | 'o'
export type Pose = { eyes: Eyes; mouth: Mouth; squash: boolean; flicker: boolean }

class Grid {
  px: (Rgb | null)[]
  constructor(readonly w: number, readonly h: number) {
    this.px = new Array(w * h).fill(null)
  }
  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x]! : null
  }
  set(x: number, y: number, c: Rgb | null) {
    x = Math.round(x)
    y = Math.round(y)
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Rgb) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx
        const dy = (y + 0.5 - cy) / ry
        if (dx * dx + dy * dy <= 1) this.set(x, y, c)
      }
    }
  }
  tri(x: number, y: number, h: number, dir: 1 | -1, c: Rgb) {
    // A small upward spike: h rows, widening by one each row.
    for (let j = 0; j < h; j++) for (let i = 0; i <= j; i++) this.set(x + dir * i, y + j, c)
  }
  outline() {
    const add: [number, number][] = []
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== null) continue
        const near = [this.get(x - 1, y), this.get(x + 1, y), this.get(x, y - 1), this.get(x, y + 1)]
        if (near.some(c => c !== null && c !== INK)) add.push([x, y])
      }
    }
    for (const [x, y] of add) this.set(x, y, INK)
  }
  sprite(): Sprite {
    return { w: this.w, h: this.h, px: this.px }
  }
}

export const SIZE = 24

const BODY: Record<Stage, { rx: number; ry: number }> = {
  egg: { rx: 5, ry: 6.5 },
  baby: { rx: 4.5, ry: 4 },
  child: { rx: 5.5, ry: 5 },
  adult: { rx: 7, ry: 6.5 },
  ultimate: { rx: 8, ry: 7.5 },
}

function egg(pose: Pose, cracked: boolean): Sprite {
  const g = new Grid(SIZE, SIZE)
  const cx = 12
  const cy = 14 + (pose.squash ? 0.5 : 0)
  g.ellipse(cx, cy, 5, 6.5, WHITE)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (g.get(x, y) === WHITE && (x - cx) / 5 + (y - cy) / 6.5 > 0.8) g.set(x, y, 0xc2c3c7)
    }
  }
  for (const [x, y] of [[10, 11], [11, 11], [14, 14], [15, 14], [15, 15], [9, 16], [10, 16], [13, 18]] as const) g.set(x, y, GOLD)
  if (cracked) for (const [x, y] of [[9, 13], [10, 12], [11, 13], [12, 12], [13, 13], [14, 12], [15, 13]] as const) g.set(x, y, INK)
  g.outline()
  return g.sprite()
}

export function monster(stage: Stage, line: Line | null, pose: Pose, opts: { cracked?: boolean } = {}): Sprite {
  if (stage === 'egg') return egg(pose, opts.cracked ?? false)
  const pal = PALETTES[stage === 'baby' || !line ? 'baby' : line]
  const g = new Grid(SIZE, SIZE)
  const { rx, ry: ry0 } = BODY[stage]
  const ry = pose.squash ? ry0 - 0.6 : ry0
  const rxs = pose.squash ? rx + 0.5 : rx
  const floats = line === 'scribe' && stage !== 'baby'
  const cx = 12
  const cy = SIZE - 2 - ry - (floats ? 2 : 1)
  const big = stage === 'adult' || stage === 'ultimate'
  const top = Math.round(cy - ry)

  // Behind the body.
  if (line === 'wanderer' && stage !== 'baby') {
    // Wings: soft white blobs tucked against each side, flapping on the flicker frame.
    const wy = cy - (pose.flicker ? 1.5 : 0.5)
    const wr = big ? 2.5 : 2.1
    g.ellipse(cx - rxs - wr * 0.4, wy, wr, wr * 0.8, WHITE)
    g.ellipse(cx + rxs + wr * 0.4, wy, wr, wr * 0.8, WHITE)
    g.set(Math.round(cx - rxs - wr * 0.6), Math.round(wy + 1), SILVER)
    g.set(Math.round(cx + rxs + wr * 0.6), Math.round(wy + 1), SILVER)
  }
  if (line === 'forge' && stage !== 'baby') {
    const tx = Math.round(cx + rxs)
    const ty = Math.round(cy + ry * 0.4)
    g.set(tx + 1, ty, pal.base)
    g.set(tx + 2, ty - 1, pal.light)
    g.set(tx + 2, ty - 2 - (pose.flicker ? 1 : 0), GOLD)
    if (big) {
      g.set(tx + 3, ty - 2, pal.light)
      g.set(tx + 3, ty - 3 - (pose.flicker ? 0 : 1), GOLD)
    }
  }

  // Body with shading.
  g.ellipse(cx, cy, rxs, ry, pal.base)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (g.get(x, y) !== pal.base) continue
      const dx = (x + 0.5 - cx) / rxs
      const dy = (y + 0.5 - cy) / ry
      if (dx * 0.6 + dy > 0.75) g.set(x, y, pal.dark)
      else if (dx < -0.25 && dy < -0.35 && dx * dx + dy * dy < 0.75) g.set(x, y, pal.light)
    }
  }
  // Belly.
  if (stage !== 'baby') g.ellipse(cx, cy + ry * 0.35, rxs * 0.45, ry * 0.35, pal.light)

  // Line features on top.
  if (line === 'forge' && stage !== 'baby') {
    const h = big ? 3 : 2
    g.tri(cx - rxs * 0.5, top - h + 1, h, -1, GOLD)
    g.tri(cx + rxs * 0.5 - 1, top - h + 1, h, 1, GOLD)
  } else if (line === 'summoner' && stage !== 'baby') {
    const h = big ? 4 : 3
    g.tri(Math.round(cx - rxs + 1), top - h + 2, h, -1, pal.base)
    g.tri(Math.round(cx + rxs - 2), top - h + 2, h, 1, pal.base)
  } else if (line === 'scribe' && stage !== 'baby') {
    // A quill on the head, and a wisp instead of feet.
    g.set(cx + 2, top - 1, WHITE)
    g.set(cx + 3, top - 2, WHITE)
    g.set(cx + 4, top - 3, SILVER)
    const by = Math.round(cy + ry)
    for (let i = -2; i <= 2; i++) g.set(cx + i, by + 1 + (Math.abs(i + (pose.flicker ? 1 : 0)) % 2), pal.base)
  } else if (line === 'wanderer' && stage !== 'baby') {
    g.set(cx - 1, top - 1, pal.light)
    g.set(cx, top - 2, pal.light)
    g.set(cx + 1, top - 1, pal.light)
  } else if (stage === 'baby') {
    g.set(cx, top - 1, pal.base)
    g.set(cx + 1, top - 2, pal.light)
  }

  // Feet.
  if (!floats) {
    const fy = Math.round(cy + ry)
    for (const fx of [cx - Math.round(rxs * 0.5), cx + Math.round(rxs * 0.5) - 1]) {
      g.set(fx, fy, pal.dark)
      g.set(fx + 1, fy, pal.dark)
    }
  }

  // Face.
  const ey = Math.round(cy - ry * 0.2)
  const ex = Math.max(2, Math.round(rxs * 0.42))
  for (const side of [-1, 1] as const) {
    const x = cx + side * ex - (side < 0 ? 1 : 0)
    eye(g, x, ey, pose.eyes, stage === 'baby' ? 1 : 2)
    if (pose.eyes === 'happy' || pose.mouth === 'smile') g.set(x + (side < 0 ? -1 : 2), ey + 2, PINK)
  }
  mouth(g, cx, Math.round(cy + ry * 0.3), line === 'wanderer' && stage !== 'baby' ? 'beak' : pose.mouth)

  // Ultimate: an aura of sparkles and a crown.
  if (stage === 'ultimate') {
    const spots = pose.flicker ? [[2, 6], [21, 9], [4, 18], [20, 19]] : [[3, 10], [20, 5], [2, 15], [21, 16]]
    for (const [x, y] of spots) {
      if (g.get(x!, y!) !== null) continue
      g.set(x!, y!, GOLD)
      g.set(x! - 1, y!, 0xfff3c4)
      g.set(x! + 1, y!, 0xfff3c4)
      g.set(x!, y! - 1, 0xfff3c4)
      g.set(x!, y! + 1, 0xfff3c4)
    }
    const y = top - 3
    for (let i = -2; i <= 2; i++) g.set(cx + i, y + 2, GOLD)
    for (const i of [-2, 0, 2]) g.set(cx + i, y + 1, GOLD)
    g.set(cx, y, GOLD_DARK)
  }

  g.outline()
  return g.sprite()
}

function eye(g: Grid, x: number, y: number, kind: Eyes, size: 1 | 2) {
  switch (kind) {
    case 'open':
      if (size === 1) {
        g.set(x, y, INK)
        g.set(x, y + 1, INK)
      } else {
        g.set(x, y, WHITE)
        g.set(x + 1, y, INK)
        g.set(x, y + 1, INK)
        g.set(x + 1, y + 1, INK)
      }
      break
    case 'closed':
      g.set(x, y + 1, INK)
      if (size === 2) g.set(x + 1, y + 1, INK)
      break
    case 'happy':
      g.set(x, y + 1, INK)
      if (size === 2) {
        g.set(x + 1, y, INK)
        g.set(x + 2, y + 1, INK)
      }
      break
    case 'x':
      g.set(x, y, INK)
      g.set(x + 1, y + 1, INK)
      if (size === 2) {
        g.set(x + 1, y, INK)
        g.set(x, y + 1, INK)
      }
      break
    case 'dizzy':
      g.set(x, y, INK)
      g.set(x + 1, y, INK)
      g.set(x + 1, y + 1, INK)
      break
  }
}

function mouth(g: Grid, cx: number, y: number, kind: Mouth | 'beak') {
  switch (kind) {
    case 'smile':
      g.set(cx - 1, y, INK)
      g.set(cx, y + 1, INK)
      g.set(cx + 1, y, INK)
      break
    case 'open':
      g.set(cx - 1, y, INK)
      g.set(cx, y, INK)
      g.set(cx + 1, y, INK)
      g.set(cx, y + 1, RED)
      g.set(cx - 1, y + 1, INK)
      g.set(cx + 1, y + 1, INK)
      break
    case 'frown':
      g.set(cx - 1, y + 1, INK)
      g.set(cx, y, INK)
      g.set(cx + 1, y + 1, INK)
      break
    case 'flat':
      g.set(cx, y, INK)
      g.set(cx + 1, y, INK)
      break
    case 'o':
      g.set(cx, y, INK)
      g.set(cx, y + 1, INK)
      break
    case 'beak':
      g.set(cx - 1, y, GOLD)
      g.set(cx, y, GOLD)
      g.set(cx, y + 1, GOLD_DARK)
      break
  }
}

// ── Small props for the habitat.
export function heart(): Sprite {
  const rows = ['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..']
  return fromRows(rows, { r: RED })
}
export function note(): Sprite {
  return fromRows(['..kk', '..k.', '..k.', 'kkk.', 'kk..'], { k: WHITE })
}
export function zz(): Sprite {
  return fromRows(['kkk', '..k', '.k.', 'kkk'], { k: WHITE })
}
export function sweat(): Sprite {
  return fromRows(['.b', 'bb', 'bb'], { b: 0x73eff7 })
}
export function star(): Sprite {
  return fromRows(['.y.', 'yyy', '.y.'], { y: GOLD })
}
export function bowl(full: boolean): Sprite {
  return fromRows([full ? '.oyoy.' : '......', 'kkkkkk', 'kbbbbk', '.kkkk.'], { o: 0xef7d57, y: GOLD, k: INK, b: 0x3b5dc9 })
}
export function ball(): Sprite {
  return fromRows(['.kk.', 'krwk', 'kwrk', '.kk.'], { k: INK, r: RED, w: WHITE })
}

function fromRows(rows: string[], key: Record<string, Rgb>): Sprite {
  const w = Math.max(...rows.map(r => r.length))
  const px: (Rgb | null)[] = []
  for (const r of rows) for (let x = 0; x < w; x++) px.push(key[r[x] ?? '.'] ?? null)
  return { w, h: rows.length, px }
}

/** The smallest box holding every drawn pixel, padded to an even height for half-block cells. */
export function crop(s: Sprite): Sprite {
  let x0 = s.w
  let y0 = s.h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      if (s.px[y * s.w + x] === null) continue
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
  }
  if (x1 < 0) return s
  if ((y1 - y0 + 1) % 2) y0 = Math.max(0, y0 - 1)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const px: (Rgb | null)[] = []
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px.push(s.px[y * s.w + x] ?? null)
  return { w, h, px }
}
