// The monster's card: a pixel-art picture of it and what makes it yours, to share. Drawn as
// pixels (so one picture serves the PNG file and the desktop preview), plus a DNA code that
// another person's mod can turn back into the same monster.

import { SIZE, type Rgb, type Sprite } from './art'
import { LANGS, commitSize, dnaOf, languages, rhythm } from './dna'
import { drawText, textWidth } from './font'
import { seasonOf } from './habitat'
import { BADGES, LINE_NAMES, formName, level, type Line, type Pet, type Stage, type Variant } from './pet'
import { base64, petFrames } from './render'

export const CARD_W = 240
export const CARD_H = 128

const INK = 0x14161f
const PANEL = 0x1f2230
const TEXT = 0xf4f4f4
const DIM = 0x8a90a8
const GOLD = 0xffcd75

// ── The DNA code: a few traits and the seed, in 13 Crockford base-32 characters.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const LANG_NAMES = [...new Set(Object.values(LANGS).map(l => l.name))]
const STAGES: Stage[] = ['egg', 'baby', 'child', 'adult', 'ultimate']
const LINES: (Line | null)[] = [null, 'forge', 'scribe', 'summoner', 'wanderer']
const VARIANTS: (Variant | null)[] = [null, 'bright', 'shadow']
const PATTERN = ['none', 'stripes', 'spots', 'patch'] as const
const MARK = ['none', 'moon', 'sun', 'star'] as const
const BUILD = ['normal', 'slim', 'stout'] as const
const EYES = ['round', 'sharp', 'sleepy'] as const
const EXTRA = ['none', 'glasses', 'scarf'] as const

export type CodeFields = {
  seed: number; lang1: string | null; lang2: string | null
  pattern: (typeof PATTERN)[number]; mark: (typeof MARK)[number]; build: (typeof BUILD)[number]
  armor: boolean; eyes: (typeof EYES)[number]; extra: (typeof EXTRA)[number]; shiny: boolean
  stage: Stage; line: Line | null; variant: Variant | null
}

const FIELDS: [keyof CodeFields, number][] = [
  ['seed', 32], ['lang1', 6], ['lang2', 6], ['pattern', 2], ['mark', 2], ['build', 2], ['armor', 1],
  ['eyes', 2], ['extra', 2], ['shiny', 1], ['stage', 3], ['line', 3], ['variant', 2],
]

function toNumber(f: CodeFields, key: keyof CodeFields): number {
  switch (key) {
    case 'seed': return f.seed >>> 0
    case 'lang1': return f.lang1 ? LANG_NAMES.indexOf(f.lang1) + 1 : 0
    case 'lang2': return f.lang2 ? LANG_NAMES.indexOf(f.lang2) + 1 : 0
    case 'pattern': return PATTERN.indexOf(f.pattern)
    case 'mark': return MARK.indexOf(f.mark)
    case 'build': return BUILD.indexOf(f.build)
    case 'armor': return f.armor ? 1 : 0
    case 'eyes': return EYES.indexOf(f.eyes)
    case 'extra': return EXTRA.indexOf(f.extra)
    case 'shiny': return f.shiny ? 1 : 0
    case 'stage': return STAGES.indexOf(f.stage)
    case 'line': return LINES.indexOf(f.line)
    case 'variant': return VARIANTS.indexOf(f.variant)
  }
}

export function codeFields(p: Pet): CodeFields {
  const dna = dnaOf(p)
  const langs = languages(p)
  return {
    seed: p.seed ?? 0,
    lang1: langs[0]?.name ?? null,
    lang2: langs[1] && langs[1].share >= 0.12 ? langs[1].name : null,
    pattern: dna?.pattern ?? 'none', mark: dna?.mark ?? 'none', build: dna?.build ?? 'normal',
    armor: dna?.armor ?? false, eyes: dna?.eyes ?? 'round', extra: dna?.extra ?? 'none', shiny: p.shiny,
    stage: p.stage, line: p.line, variant: p.variant,
  }
}

/** e.g. BYTE-7K2F-9QXA-M3P1-Z: the name, then 13 characters of DNA in groups of four. */
export function dnaCode(p: Pet): string {
  const f = codeFields(p)
  let n = 0n
  for (const [key, bits] of FIELDS) n = (n << BigInt(bits)) | BigInt.asUintN(bits, BigInt(toNumber(f, key)))
  let s = ''
  for (let i = 0; i < 13; i++) {
    s = B32[Number(n & 31n)]! + s
    n >>= 5n
  }
  const name = p.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PET'
  return `${name}-${s.slice(0, 5)}-${s.slice(5, 9)}-${s.slice(9)}`
}

/** Reads a DNA code back into its fields; null if it is not one. */
export function readCode(code: string): { name: string; fields: CodeFields } | null {
  const m = /^([A-Z0-9]{1,8})-([0-9A-Z-]+)$/.exec(code.trim().toUpperCase())
  if (!m) return null
  const body = m[2]!.replace(/-/g, '')
  if (body.length !== 13 || [...body].some(c => !B32.includes(c))) return null
  let n = 0n
  for (const c of body) n = (n << 5n) | BigInt(B32.indexOf(c))
  const raw: Record<string, number> = {}
  for (const [key, bits] of [...FIELDS].reverse()) {
    raw[key] = Number(n & ((1n << BigInt(bits)) - 1n))
    n >>= BigInt(bits)
  }
  const pick = <T,>(list: readonly T[], i: number): T | undefined => list[i]
  const fields: CodeFields = {
    seed: raw.seed! >>> 0,
    lang1: raw.lang1 ? (LANG_NAMES[raw.lang1 - 1] ?? null) : null,
    lang2: raw.lang2 ? (LANG_NAMES[raw.lang2 - 1] ?? null) : null,
    pattern: pick(PATTERN, raw.pattern!) ?? 'none', mark: pick(MARK, raw.mark!) ?? 'none', build: pick(BUILD, raw.build!) ?? 'normal',
    armor: raw.armor === 1, eyes: pick(EYES, raw.eyes!) ?? 'round', extra: pick(EXTRA, raw.extra!) ?? 'none', shiny: raw.shiny === 1,
    stage: pick(STAGES, raw.stage!) ?? 'egg', line: pick(LINES, raw.line!) ?? null, variant: pick(VARIANTS, raw.variant!) ?? null,
  }
  return { name: m[1]!, fields }
}

// ── The picture.
const SHORT: Record<string, string> = {
  TypeScript: 'TS', JavaScript: 'JS', Python: 'PY', Kotlin: 'KOTLIN', Shell: 'SHELL', Elixir: 'ELIXIR', Haskell: 'HASKEL', Clojure: 'CLOJUR',
}

function langColour(name: string): Rgb {
  const l = Object.values(LANGS).find(x => x.name === name)
  if (!l) return DIM
  const h = l.hue
  const k = (n: number) => (n + h / 30) % 12
  const a = 0.7 * Math.min(0.6, 0.4)
  const f = (n: number) => 0.6 - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255)
}

function fill(px: (Rgb | null)[], x: number, y: number, w: number, h: number, c: Rgb) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const X = x + i
    const Y = y + j
    if (X >= 0 && Y >= 0 && X < CARD_W && Y < CARD_H) px[Y * CARD_W + X] = c
  }
}

function blit(px: (Rgb | null)[], s: Sprite, x: number, y: number, scale: number) {
  for (let j = 0; j < s.h * scale; j++) for (let i = 0; i < s.w * scale; i++) {
    const c = s.px[Math.floor(j / scale) * s.w + Math.floor(i / scale)]
    const X = x + i
    const Y = y + j
    if (c !== null && c !== undefined && X >= 0 && Y >= 0 && X < CARD_W && Y < CARD_H) px[Y * CARD_W + X] = c
  }
}

const SKY: Record<string, [Rgb, Rgb, Rgb]> = {
  spring: [0x9fd3f7, 0x5aa85e, 0x3e8948], summer: [0x73c2fb, 0x6abf54, 0x4a9a3e],
  autumn: [0xf2b27a, 0x9aa04a, 0x7a8a3a], winter: [0xb8c4d0, 0xe8eef2, 0x8aa89a],
}

export function card(p: Pet, now: number): Sprite {
  const px: (Rgb | null)[] = new Array(CARD_W * CARD_H).fill(INK)
  const dna = dnaOf(p)
  const accent = dna?.shiny ? GOLD : (dna?.palette.base ?? 0x5aa85e)
  const text = (s: string, x: number, y: number, c: Rgb = TEXT, scale = 1) => drawText(px, CARD_W, CARD_H, s, x, y, c, scale)

  // Frame.
  fill(px, 0, 0, CARD_W, 2, accent)
  fill(px, 0, CARD_H - 2, CARD_W, 2, accent)
  fill(px, 0, 0, 2, CARD_H, accent)
  fill(px, CARD_W - 2, 0, 2, CARD_H, accent)

  // The monster in its season, three times its size.
  const [sky, hill, grass] = SKY[seasonOf(now)]!
  fill(px, 8, 8, 82, 92, sky)
  fill(px, 8, 66, 82, 6, hill)
  fill(px, 8, 72, 82, 28, grass)
  const sprite = petFrames({ ...p, mood: undefined, asleepUntil: undefined, lastActive: now }, now)[0]!
  blit(px, sprite, 8 + Math.round((82 - SIZE * 3) / 2), 100 - sprite.h * 3 + 2, 3)
  fill(px, 8, 100, 82, 2, accent)
  if (p.shiny) text('✦', 80, 11, GOLD)

  // Who it is.
  const x0 = 98
  const name = p.name.toUpperCase().slice(0, 11)
  text(name, x0, 9, TEXT, 2)
  const form = formName(p).toUpperCase()
  text(`LV ${level(p.xp)} ${form}`, x0, 28, GOLD)
  const lineName = p.line ? LINE_NAMES[p.line].toUpperCase() : 'NO LINE YET'
  text(`${lineName} · ${p.personality.toUpperCase()}${p.generation > 1 ? ` · GEN ${p.generation}` : ''}`, x0, 38, DIM)

  // Languages.
  const langs = languages(p).slice(0, 3)
  if (langs.length) {
    langs.forEach((l, i) => {
      const y = 50 + i * 9
      text(SHORT[l.name] ?? l.name.toUpperCase().slice(0, 6), x0, y, DIM)
      fill(px, x0 + 40, y + 1, 70, 5, PANEL)
      fill(px, x0 + 40, y + 1, Math.max(1, Math.round(70 * l.share)), 5, langColour(l.name))
      text(`${Math.round(l.share * 100)}%`, x0 + 114, y, DIM)
    })
  } else text('LANGUAGES: NOT YET', x0, 50, DIM)

  // Traits and record.
  const r = rhythm(p)
  const size = commitSize(p)
  const traits = [
    r.mark === 'moon' ? 'NIGHT OWL' : r.mark === 'sun' ? 'EARLY BIRD' : r.mark === 'star' ? 'STEADY' : null,
    dna?.build === 'slim' ? 'SMALL COMMITS' : dna?.build === 'stout' ? 'BIG COMMITS' : size !== null ? 'MID COMMITS' : null,
    dna?.armor ? 'ARMOURED' : null,
  ].filter(Boolean).join(' · ')
  text(traits || 'TRAITS: GROWING', x0, 80, TEXT)
  text(`STREAK ${p.streak.days} · TESTS ${p.stats.tests}`, x0, 90, DIM)
  text(`BOSSES ${p.stats.bossWins} · BADGES ${p.badges.length}/${BADGES.length}`, x0, 99, DIM)

  // Footer: the DNA code.
  fill(px, 2, 108, CARD_W - 4, 1, PANEL)
  text(dnaCode(p), 8, 113, accent)
  const tag = 'CLAUDE MONSTER'
  text(tag, CARD_W - 8 - textWidth(tag), 113, DIM)
  return { w: CARD_W, h: CARD_H, px }
}

// ── PNG: palette colour, stored (uncompressed) deflate, so no library is needed.
const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC[(c ^ b) & 255]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function u32(n: number) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
}

function chunk(type: string, data: Uint8Array): number[] {
  const body = new Uint8Array(4 + data.length)
  for (let i = 0; i < 4; i++) body[i] = type.charCodeAt(i)
  body.set(data, 4)
  return [...u32(data.length), ...body, ...u32(crc32(body))]
}

/** A PNG of the sprite at scale, as base64. */
export function pngBase64(s: Sprite, scale: number): string {
  const W = s.w * scale
  const H = s.h * scale
  const colours: Rgb[] = []
  const index = new Map<Rgb, number>()
  const at = (c: Rgb | null) => {
    const v = c ?? INK
    let i = index.get(v)
    if (i === undefined) {
      i = colours.length
      colours.push(v)
      index.set(v, i)
    }
    return i
  }
  const raw = new Uint8Array((W + 1) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (W + 1)] = 0
    for (let x = 0; x < W; x++) raw[y * (W + 1) + 1 + x] = at(s.px[Math.floor(y / scale) * s.w + Math.floor(x / scale)] ?? null)
  }
  if (colours.length > 256) throw new Error('too many colours for a palette PNG')
  // zlib with stored blocks.
  const blocks: number[] = [0x78, 0x01]
  for (let i = 0; i < raw.length; i += 65535) {
    const len = Math.min(65535, raw.length - i)
    blocks.push(i + len >= raw.length ? 1 : 0, len & 255, len >> 8, ~len & 255, (~len >> 8) & 255)
    for (let j = 0; j < len; j++) blocks.push(raw[i + j]!)
  }
  let a = 1
  let b = 0
  for (const v of raw) {
    a = (a + v) % 65521
    b = (b + a) % 65521
  }
  blocks.push(...u32(((b << 16) | a) >>> 0))
  const ihdr = new Uint8Array([...u32(W), ...u32(H), 8, 3, 0, 0, 0])
  const plte = new Uint8Array(colours.flatMap(c => [(c >> 16) & 255, (c >> 8) & 255, c & 255]))
  const bytes = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', ihdr), ...chunk('PLTE', plte), ...chunk('IDAT', new Uint8Array(blocks)), ...chunk('IEND', new Uint8Array()),
  ])
  return base64(bytes)
}
