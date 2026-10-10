// The habitat as layers: an animated background (sky, season, weather, decorations, holidays),
// the pet strolling over it, and a boss when one is being fought.

import { DECOR_SPRITES, SIZE, ball, bossSprite, bowl, bush, cake, cookie, heart, mess, note, pumpkin, star, sweat, xmasTree, zz, type Rgb, type Sprite } from './art'
import { face, type BossKind, type Pet } from './pet'
import { FRAME_MS, paths, petFrames, type Hunt } from './render'

export const HAB_W = 72
export const HAB_H = 40
const FRAMES = 4
/** One stroll back and forth. */
export const WALK_MS = 18_000

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type Weather = 'clear' | 'cloudy' | 'rain' | 'snow' | 'petals' | 'leaves'

export type Scene = {
  bg: Sprite[]
  pet: Sprite[]
  petX: number
  petY: number
  /** How far it strolls each way; 0 stands still. */
  walk: number
  boss?: { frames: Sprite[]; x: number; y: number }
  season: Season
  weather: Weather
  holiday: string | null
}

export function seasonOf(at: number): Season {
  const m = new Date(at).getMonth() + 1
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'
}

function hashDay(at: number) {
  const d = new Date(at)
  let h = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

/** Today's weather: the same all day, different each day, fitting the season. */
export function weatherOf(at: number): Weather {
  const s = seasonOf(at)
  const r = hashDay(at)
  if (r < 0.45) return 'clear'
  if (r < 0.7) return 'cloudy'
  if (r < 0.85) return s === 'winter' ? 'snow' : 'rain'
  return s === 'spring' ? 'petals' : s === 'autumn' ? 'leaves' : s === 'winter' ? 'snow' : 'clear'
}

export function holidayOf(p: Pet, at: number): string | null {
  const d = new Date(at)
  const m = d.getMonth() + 1
  const day = d.getDate()
  const born = new Date(p.born)
  if (at - p.born > 24 * 3600_000 && born.getMonth() === d.getMonth() && born.getDate() === day) return 'birthday'
  if (m === 10 && day >= 25) return 'halloween'
  if (m === 12 && day >= 20 && day <= 26) return 'christmas'
  if ((m === 12 && day === 31) || (m === 1 && day === 1)) return 'newyear'
  return null
}

function sky(hour: number, weather: Weather, tucked: boolean): [Rgb, Rgb] {
  if (tucked || hour < 6 || hour >= 20) return weather === 'cloudy' || weather === 'rain' ? [0x1f2433, 0x2d3550] : [0x29366f, 0x3b5dc9]
  if (weather === 'cloudy' || weather === 'rain' || weather === 'snow') return [0x8a9bb0, 0xb8c4d0]
  if (hour >= 17) return [0xef7d57, 0xffcd75]
  return [0x73c2fb, 0xb5e1ff]
}

const GROUND: Record<Season, [Rgb, Rgb, Rgb]> = {
  spring: [0x3e8948, 0x5aa85e, 0x2d6b3a],
  summer: [0x4a9a3e, 0x6abf54, 0x2f7a2c],
  autumn: [0x7a8a3a, 0x9aa04a, 0x5a6a2a],
  winter: [0x6a8a7a, 0x8aa89a, 0x4a6a5a],
}

function blank(c: Rgb | null = null): (Rgb | null)[] {
  return new Array(HAB_W * HAB_H).fill(c)
}

function stamp(px: (Rgb | null)[], s: Sprite, x: number, y: number, w = HAB_W, h = HAB_H) {
  for (let j = 0; j < s.h; j++) {
    for (let i = 0; i < s.w; i++) {
      const c = s.px[j * s.w + i]
      const X = x + i
      const Y = y + j
      if (c !== null && c !== undefined && X >= 0 && Y >= 0 && X < w && Y < h) px[Y * w + X] = c
    }
  }
}

const DECOR_AT: Record<keyof typeof DECOR_SPRITES, [number, number]> = {
  plant: [2, 27], lamp: [66, 26], poster: [2, 18], rug: [30, 34], bed: [52, 30], toybox: [44, 30], desk: [8, 27], fountain: [58, 21],
}

export function habitat(p: Pet, now: number, hour: number, opts: { hunt?: Hunt | null; boss?: { kind: BossKind; hit: boolean } | null } = {}): Scene {
  const tucked = (p.asleepUntil ?? 0) > now
  const season = seasonOf(now)
  const holiday = holidayOf(p, now)
  const weather: Weather = holiday === 'christmas' ? 'snow' : weatherOf(now)
  const night = tucked || hour < 6 || hour >= 20
  const [top, bottom] = sky(hour, weather, tucked)
  const [grass, hill, dark] = GROUND[season]
  const f = face(p, now)

  // The still part of the background.
  const base = blank()
  for (let y = 0; y < HAB_H; y++) for (let x = 0; x < HAB_W; x++) base[y * HAB_W + x] = y < 14 ? top : y < 28 ? bottom : grass
  for (let x = 0; x < HAB_W; x++) {
    const h = Math.round(26 + Math.sin(x / 9) * 2 + Math.sin(x / 4) * 0.8)
    for (let y = h; y < 28; y++) base[y * HAB_W + x] = hill
    for (let y = 28; y < HAB_H; y++) if ((x * 7 + y * 13) % 17 === 0) base[y * HAB_W + x] = dark
    base[28 * HAB_W + x] = dark
    if (weather === 'snow') for (let y = 28; y < HAB_H; y++) if ((x * 5 + y * 11) % 4 !== 0) base[y * HAB_W + x] = 0xe8eef2
  }
  if (season === 'spring') for (const [x, y] of [[6, 33], [17, 37], [49, 35], [63, 38], [27, 31]] as const) base[y * HAB_W + x] = 0xf4a0b0
  if (season === 'autumn') for (const [x, y] of [[9, 35], [21, 32], [40, 38], [55, 33], [67, 36]] as const) base[y * HAB_W + x] = 0xef7d57
  const orb = night ? 0xf4f4f4 : 0xffcd75
  if (weather !== 'cloudy' && weather !== 'rain') for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 9) base[(6 + y) * HAB_W + 62 + x] = orb
  if (night) for (const [x, y] of [[8, 4], [20, 8], [33, 3], [47, 7], [55, 2]] as const) base[y * HAB_W + x] = 0xf4f4f4
  const cloud = weather === 'cloudy' || weather === 'rain' ? 0xd6dce4 : 0xf4f4f4
  const clouds = weather === 'cloudy' || weather === 'rain' ? [[10, 5], [30, 8], [50, 4], [64, 9]] : night ? [] : [[12, 6], [36, 9]]
  for (const [cx, cy] of clouds) for (let i = -5; i <= 5; i++) for (let j = -1; j <= 1; j++) if (Math.abs(i) + Math.abs(j) * 3 < 7) base[(cy! + j) * HAB_W + cx! + i] = cloud

  // Things on the ground.
  const full = (p.cooldowns.feed ?? 0) > now
  stamp(base, bowl(full || p.hunger > 70), 14, 32)
  if ((p.cooldowns.play ?? 0) > now - 10 * 60_000 && p.stats.played > 0) stamp(base, ball(), 22, 34)
  for (let i = 0; i < p.mess; i++) stamp(base, mess(), 34 + i * 6, 35 - (i % 2))
  if (holiday === 'halloween') {
    stamp(base, pumpkin, 24, 31)
    stamp(base, pumpkin, 60, 33)
  }
  if (holiday === 'christmas') stamp(base, xmasTree, 62, 25)
  if (holiday === 'birthday') stamp(base, cake, 26, 32)

  const owned = new Set(p.decor)
  const bg: Sprite[] = []
  for (let i = 0; i < FRAMES; i++) {
    const px = base.slice()
    for (const d of p.decor) {
      const frames = DECOR_SPRITES[d]
      const [x, y] = DECOR_AT[d]
      stamp(px, frames[i % frames.length]!, x, y)
    }
    if (opts.hunt) {
      const h = opts.hunt
      for (let b = 0; b < 3; b++) {
        const bx = 8 + b * 22
        stamp(px, bush(), bx, 22)
        if (h.picked !== null && b === h.treat) stamp(px, cookie(), bx + 2, 17)
        if (h.picked === b && b !== h.treat) for (let k = 0; k < 3; k++) px[(19 + k) * HAB_W + bx + 4 + k] = 0xe24b4a
      }
    }
    particles(px, weather, holiday, night, i)
    bg.push({ w: HAB_W, h: HAB_H, px })
  }

  // The pet, with what it feels drawn beside it.
  const frames = petFrames(p, now)
  const ph = frames[0]!.h
  const pet = frames.map((s, i) => {
    const W = SIZE + 8
    const px = new Array<Rgb | null>(W * ph).fill(null)
    stamp(px, s, 0, 0, W, ph)
    const fx = SIZE - 2
    const fy = 6 - (i % 2)
    if (f === 'sleep' || f === 'sleepy') stamp(px, zz(), fx + (i % 2), fy - i, W, ph)
    else if (f === 'love') stamp(px, heart(), fx, fy - i, W, ph)
    else if (f === 'cheer') stamp(px, note(), fx + (i % 2) * 2, fy - i, W, ph)
    else if (f === 'evolve') for (const [x, y] of [[0, 8 + i], [SIZE, 12 - i], [4, 4 - i]] as const) stamp(px, star(), x, y, W, ph)
    else if (f === 'ouch' || f === 'sick' || f === 'sweat' || f === 'lose') stamp(px, sweat(), 4, 10 + (i % 2), W, ph)
    else if (f === 'win') for (const [x, y] of [[2, 6 - i], [SIZE - 4, 8 - i]] as const) stamp(px, heart(), x, y, W, ph)
    else if (f === 'wave') stamp(px, star(), fx + (i % 2), fy, W, ph)
    return { w: W, h: ph, px }
  })

  const asleep = f === 'sleep'
  const fighting = !!opts.boss
  let petX = Math.round(HAB_W / 2 - SIZE / 2)
  let petY = HAB_H - ph - 4
  let walk = asleep || opts.hunt || fighting ? 0 : 14
  if (asleep && owned.has('bed')) {
    petX = DECOR_AT.bed[0] - 6
    petY = DECOR_AT.bed[1] + 4 - ph
    walk = 0
  }
  if (fighting) petX = 4

  const scene: Scene = { bg, pet, petX, petY, walk, season, weather, holiday }
  if (opts.boss) {
    const bf = [0, 1, 2, 3].map(i => bossSprite(opts.boss!.kind, i, opts.boss!.hit && i % 2 === 1))
    scene.boss = { frames: bf, x: HAB_W - bf[0]!.w - 2, y: HAB_H - bf[0]!.h - 3 }
  }
  return scene
}

function particles(px: (Rgb | null)[], weather: Weather, holiday: string | null, night: boolean, i: number) {
  const set = (x: number, y: number, c: Rgb) => {
    if (x >= 0 && y >= 0 && x < HAB_W && y < HAB_H) px[y * HAB_W + x] = c
  }
  const drops = (n: number, fn: (x: number, y: number, k: number) => void) => {
    for (let k = 0; k < n; k++) {
      const x = (k * 37 + 11) % HAB_W
      const y = ((k * 23 + i * 5) % (HAB_H - 6))
      fn(x, y, k)
    }
  }
  if (weather === 'rain') drops(22, (x, y) => { set(x, y, 0x85b7eb); set(x, y + 1, 0x85b7eb) })
  if (weather === 'snow') drops(18, (x, y, k) => set(x + ((i + k) % 2), y, 0xffffff))
  if (weather === 'petals') drops(10, (x, y, k) => set(x + ((i + k) % 3) - 1, y, 0xf4a0b0))
  if (weather === 'leaves') drops(10, (x, y, k) => set(x + ((i + k) % 3) - 1, y, k % 2 ? 0xef7d57 : 0xe8a33d))
  if (holiday === 'newyear' && night) {
    const bursts = [[14, 8], [40, 5], [58, 10]] as const
    const [bx, by] = bursts[i % bursts.length]!
    const c = [0xffcd75, 0xf4a0b0, 0x73eff7][i % 3]!
    for (const [dx, dy] of [[0, -3], [0, 3], [-3, 0], [3, 0], [-2, -2], [2, 2], [-2, 2], [2, -2]] as const) set(bx + dx, by + dy, c)
  }
}

function walkOffset(scene: Scene, t: number) {
  return scene.walk ? Math.round(Math.sin((t / WALK_MS) * Math.PI * 2) * scene.walk) : 0
}

/** The whole picture at time t: what the terminal draws each frame. */
export function compose(scene: Scene, t: number): Sprite {
  const i = Math.floor(t / FRAME_MS) % FRAMES
  const px = scene.bg[i]!.px.slice()
  const pet = scene.pet[i]!
  stamp(px, pet, scene.petX + walkOffset(scene, t), scene.petY)
  if (scene.boss) stamp(px, scene.boss.frames[i]!, scene.boss.x, scene.boss.y)
  return { w: HAB_W, h: HAB_H, px }
}

/** Four still frames, for tests and for anything that cannot animate the stroll. */
export function habitatFrames(p: Pet, now: number, hour: number, hunt?: Hunt | null): Sprite[] {
  const scene = habitat(p, now, hour, { hunt })
  return [0, 1, 2, 3].map(i => compose(scene, i * FRAME_MS))
}

/** The desktop picture: background frames in turn, the pet strolling smoothly over them. */
export function sceneSvg(scene: Scene, scale: number): string {
  const n = FRAMES
  const dur = n * FRAME_MS
  const times = Array.from({ length: n }, (_, i) => (i / n).toFixed(4)).join(';')
  const cycle = (frames: Sprite[]) =>
    frames
      .map((f, i) => {
        const values = frames.map((_, j) => (j === i ? 'visible' : 'hidden')).join(';')
        return `<g visibility="${i === 0 ? 'visible' : 'hidden'}"><animate attributeName="visibility" values="${values}" keyTimes="${times}" dur="${dur}ms" calcMode="discrete" repeatCount="indefinite"/>${paths(f)}</g>`
      })
      .join('')
  const w = scene.walk
  const stroll = w
    ? `<animateTransform attributeName="transform" type="translate" values="${scene.petX} ${scene.petY};${scene.petX + w} ${scene.petY};${scene.petX} ${scene.petY};${scene.petX - w} ${scene.petY};${scene.petX} ${scene.petY}" keyTimes="0;0.25;0.5;0.75;1" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1" dur="${WALK_MS}ms" repeatCount="indefinite"/>`
    : ''
  const boss = scene.boss ? `<g transform="translate(${scene.boss.x} ${scene.boss.y})">${cycle(scene.boss.frames)}</g>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${HAB_W * scale}" height="${HAB_H * scale}" viewBox="0 0 ${HAB_W} ${HAB_H}" shape-rendering="crispEdges">${cycle(scene.bg)}<g transform="translate(${scene.petX} ${scene.petY})">${stroll}${cycle(scene.pet)}</g>${boss}</svg>`
}
