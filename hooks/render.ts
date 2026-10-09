// Turns the pet into animation frames, and frames into an SVG (desktop) or cells (terminal).

import { SIZE, ball, bowl, bush, cookie, heart, mess, monster, note, star, sweat, zz, type Pose, type Rgb, type Sprite } from './art'
import { face, type Face, type Pet } from './pet'

export const FRAME_MS = 260

function poses(f: Face): { pose: Pose; dy: number }[] {
  const p = (eyes: Pose['eyes'], mouth: Pose['mouth'], squash = false, flicker = false, dy = 0) => ({ pose: { eyes, mouth, squash, flicker }, dy })
  switch (f) {
    case 'cheer':
    case 'evolve':
      return [p('happy', 'open', true), p('happy', 'open', false, true, -3), p('happy', 'open', false, false, -1), p('happy', 'smile', true, true)]
    case 'ouch':
      return [p('x', 'frown', true), p('x', 'frown', true, true), p('x', 'flat'), p('x', 'frown', true, true)]
    case 'eat':
      return [p('happy', 'open'), p('happy', 'flat', true, true), p('happy', 'open'), p('happy', 'flat', true, true)]
    case 'full':
    case 'tired':
      return [p('closed', 'flat'), p('closed', 'flat', false, true), p('closed', 'flat'), p('open', 'flat', false, true)]
    case 'love':
      return [p('happy', 'smile'), p('happy', 'smile', false, true, -1), p('happy', 'smile'), p('happy', 'smile', true, true)]
    case 'sleep':
      return [p('closed', 'flat', true), p('closed', 'flat', true, true), p('closed', 'o'), p('closed', 'flat', true, true)]
    case 'sick':
      return [p('dizzy', 'frown'), p('dizzy', 'frown', true, true), p('dizzy', 'flat'), p('dizzy', 'frown', true, true)]
    case 'hungry':
      return [p('open', 'o'), p('open', 'o', false, true), p('open', 'o'), p('closed', 'o', false, true)]
    case 'sad':
      return [p('open', 'frown'), p('open', 'frown', false, true), p('open', 'frown'), p('closed', 'frown', false, true)]
    case 'happy':
      return [p('open', 'smile'), p('open', 'smile', false, true, -1), p('open', 'smile'), p('closed', 'smile', false, true)]
    case 'wave':
      return [p('happy', 'open', false, false, -1), p('happy', 'smile', false, true), p('happy', 'open', false, false, -1), p('happy', 'smile', false, true)]
    case 'sweat':
      return [p('closed', 'flat', true), p('closed', 'open', false, true, -1), p('closed', 'flat', true), p('closed', 'open', false, true, -1)]
    case 'win':
      return [p('happy', 'open', true), p('happy', 'open', false, true, -4), p('happy', 'open', false, false, -2), p('happy', 'smile', true, true)]
    case 'lose':
      return [p('closed', 'frown'), p('closed', 'frown', true, true), p('open', 'frown'), p('closed', 'frown', true, true)]
    case 'talk':
      return [p('open', 'open'), p('open', 'smile', false, true), p('open', 'open'), p('open', 'flat', false, true)]
    case 'sleepy':
      return [p('closed', 'flat'), p('closed', 'o', false, true), p('closed', 'flat'), p('open', 'flat', false, true)]
  }
}

function blank(w: number, h: number, c: Rgb | null = null): (Rgb | null)[] {
  return new Array(w * h).fill(c)
}

function stamp(px: (Rgb | null)[], w: number, h: number, s: Sprite, x: number, y: number) {
  for (let j = 0; j < s.h; j++) {
    for (let i = 0; i < s.w; i++) {
      const c = s.px[j * s.w + i]
      const X = x + i
      const Y = y + j
      if (c !== null && c !== undefined && X >= 0 && Y >= 0 && X < w && Y < h) px[Y * w + X] = c
    }
  }
}

/** The pet alone, one frame per pose, each in the same box (so it can bob without the box moving). */
export function petFrames(p: Pet, now: number): Sprite[] {
  const f = face(p, now)
  const hatching = p.stage === 'egg' && p.xp >= 6
  const pad = 4
  const H = SIZE + pad
  return poses(f).map(({ pose, dy }) => {
    const px = blank(SIZE, H)
    stamp(px, SIZE, H, monster(p.stage, p.line, pose, { cracked: hatching, variant: p.variant, hat: p.hat }), 0, pad + dy)
    return { w: SIZE, h: H, px }
  })
}

/** One box around every frame's pixels, so frames crop alike; height even for half blocks. */
export function cropAll(frames: Sprite[]): Sprite[] {
  const first = frames[0]
  if (!first) return frames
  let x0 = first.w
  let y0 = first.h
  let x1 = -1
  let y1 = -1
  for (const s of frames) {
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        if (s.px[y * s.w + x] === null) continue
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x)
        y1 = Math.max(y1, y)
      }
    }
  }
  if (x1 < 0) return frames
  if ((y1 - y0 + 1) % 2) y0 = Math.max(0, y0 - 1)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  return frames.map(s => {
    const px: (Rgb | null)[] = []
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px.push(s.px[y * s.w + x] ?? null)
    return { w, h, px }
  })
}

// ── The habitat: sky by the local hour, ground, props, the pet, and what it feels.
export const HAB_W = 72
export const HAB_H = 40

function sky(hour: number): [Rgb, Rgb] {
  if (hour >= 6 && hour < 17) return [0x73c2fb, 0xb5e1ff]
  if (hour >= 17 && hour < 20) return [0xef7d57, 0xffcd75]
  return [0x29366f, 0x3b5dc9]
}

export type Hunt = { round: number; score: number; treat: number; picked: number | null }

export function habitatFrames(p: Pet, now: number, hour: number, hunt?: Hunt | null): Sprite[] {
  const tucked = (p.asleepUntil ?? 0) > now
  const [top, bottom] = tucked ? [0x1a1c2c, 0x29366f] as [Rgb, Rgb] : sky(hour)
  const night = tucked || hour < 6 || hour >= 20
  const f = face(p, now)
  const base = blank(HAB_W, HAB_H)
  for (let y = 0; y < HAB_H; y++) for (let x = 0; x < HAB_W; x++) base[y * HAB_W + x] = y < 14 ? top : y < 28 ? bottom : 0x3e8948
  // Hills, ground texture.
  for (let x = 0; x < HAB_W; x++) {
    const hill = Math.round(26 + Math.sin(x / 9) * 2 + Math.sin(x / 4) * 0.8)
    for (let y = hill; y < 28; y++) base[y * HAB_W + x] = 0x5aa85e
    for (let y = 28; y < HAB_H; y++) if ((x * 7 + y * 13) % 17 === 0) base[y * HAB_W + x] = 0x2d6b3a
    base[28 * HAB_W + x] = 0x2d6b3a
  }
  // Sun or moon.
  const orb = night ? 0xf4f4f4 : 0xffcd75
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 9) base[(6 + y) * HAB_W + 62 + x] = orb
  if (night) for (const [x, y] of [[8, 4], [20, 8], [33, 3], [47, 7], [55, 2]] as const) base[y * HAB_W + x] = 0xf4f4f4
  // Clouds by day.
  if (!night) for (const [cx, cy] of [[12, 6], [36, 9]] as const) for (let i = -4; i <= 4; i++) for (let j = -1; j <= 1; j++) if (Math.abs(i) + Math.abs(j) * 3 < 6) base[(cy + j) * HAB_W + cx + i] = 0xf4f4f4

  const full = (p.cooldowns.feed ?? 0) > now
  stamp(base, HAB_W, HAB_H, bowl(full || p.hunger > 70), 10, 31)
  if ((p.cooldowns.play ?? 0) > now - 10 * 60_000 && p.stats.played > 0) stamp(base, HAB_W, HAB_H, ball(), 56, 32)

  // Messes after meals.
  for (let i = 0; i < p.mess; i++) stamp(base, HAB_W, HAB_H, mess(), 20 + i * 6, 34 - (i % 2))
  // The treat hunt: three bushes, one hiding a cookie once a guess is made.
  if (hunt) {
    for (let b = 0; b < 3; b++) {
      const bx = 8 + b * 22
      stamp(base, HAB_W, HAB_H, bush(), bx, 22)
      if (hunt.picked !== null && b === hunt.treat) stamp(base, HAB_W, HAB_H, cookie(), bx + 2, 17)
      if (hunt.picked === b && b !== hunt.treat) for (let i = 0; i < 3; i++) base[(19 + i) * HAB_W + bx + 4 + i] = 0xe24b4a
    }
  }

  const frames = petFrames(p, now)
  const px0 = Math.round(HAB_W / 2 - SIZE / 2)
  const py0 = HAB_H - frames[0]!.h - 4
  return frames.map((s, i) => {
    const px = base.slice()
    // Shadow under the pet.
    for (let x = px0 + 6; x < px0 + SIZE - 6; x++) px[(HAB_H - 6) * HAB_W + x] = 0x2d6b3a
    stamp(px, HAB_W, HAB_H, s, px0, py0)
    const fx = px0 + SIZE - 2
    const fy = py0 + 2 - (i % 2)
    if (f === 'sleep' || f === 'sleepy') stamp(px, HAB_W, HAB_H, zz(), fx + (i % 2), fy - i)
    else if (f === 'love') stamp(px, HAB_W, HAB_H, heart(), fx, fy - i)
    else if (f === 'cheer') stamp(px, HAB_W, HAB_H, note(), fx + (i % 2) * 2, fy - i)
    else if (f === 'evolve') for (const [x, y] of [[px0, py0 + 4 + i], [px0 + SIZE, py0 + 8 - i], [px0 + 4, py0 - i]] as const) stamp(px, HAB_W, HAB_H, star(), x, y)
    else if (f === 'ouch' || f === 'sick' || f === 'sweat' || f === 'lose') stamp(px, HAB_W, HAB_H, sweat(), px0 + 4, py0 + 6 + (i % 2))
    else if (f === 'win') for (const [x, y] of [[px0 + 2, py0 + 2 - i], [px0 + SIZE - 4, py0 + 4 - i]] as const) stamp(px, HAB_W, HAB_H, heart(), x, y)
    else if (f === 'wave') stamp(px, HAB_W, HAB_H, star(), fx + (i % 2), fy)
    return { w: HAB_W, h: HAB_H, px }
  })
}

// ── SVG: each frame defined once, shown in turn with discrete visibility animation.
const hex = (c: Rgb) => '#' + c.toString(16).padStart(6, '0')

function paths(s: Sprite): string {
  const byColor = new Map<Rgb, string>()
  for (let y = 0; y < s.h; y++) {
    let x = 0
    while (x < s.w) {
      const c = s.px[y * s.w + x]
      if (c === null || c === undefined) {
        x++
        continue
      }
      let run = 1
      while (x + run < s.w && s.px[y * s.w + x + run] === c) run++
      byColor.set(c, (byColor.get(c) ?? '') + `M${x} ${y}h${run}v1h-${run}z`)
      x += run
    }
  }
  return [...byColor].map(([c, d]) => `<path fill="${hex(c)}" d="${d}"/>`).join('')
}

export function framesSvg(frames: Sprite[], scale: number, ms = FRAME_MS): string {
  const s = frames[0]!
  const n = frames.length
  const dur = n * ms
  const times = frames.map((_, i) => (i / n).toFixed(4)).join(';')
  const layers = frames
    .map((f, i) => {
      const values = frames.map((_, j) => (j === i ? 'visible' : 'hidden')).join(';')
      return `<g visibility="${i === 0 ? 'visible' : 'hidden'}"><animate attributeName="visibility" values="${values}" keyTimes="${times}" dur="${dur}ms" calcMode="discrete" repeatCount="indefinite"/>${paths(f)}</g>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w * scale}" height="${s.h * scale}" viewBox="0 0 ${s.w} ${s.h}" shape-rendering="crispEdges">${layers}</svg>`
}

// ── Terminal cells: two pixels per cell; transparent pixels take the terminal's own colour.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const DEFAULT = 0x01000000

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

export function cells(s: Sprite): { columns: number; rows: number; cells: string } {
  const rows = Math.ceil(s.h / 2)
  const words = new Uint32Array(s.w * rows * 3)
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < s.w; x++) {
      const top = s.px[2 * r * s.w + x] ?? null
      const bottom = 2 * r + 1 < s.h ? (s.px[(2 * r + 1) * s.w + x] ?? null) : null
      const n = (r * s.w + x) * 3
      if (top === null && bottom === null) {
        words[n] = 0x20
        words[n + 1] = DEFAULT
        words[n + 2] = DEFAULT
      } else if (top === null) {
        words[n] = 0x2584 // lower half block
        words[n + 1] = bottom!
        words[n + 2] = DEFAULT
      } else {
        words[n] = 0x2580 // upper half block
        words[n + 1] = top
        words[n + 2] = bottom ?? DEFAULT
      }
    }
  }
  return { columns: s.w, rows, cells: base64(new Uint8Array(words.buffer)) }
}

