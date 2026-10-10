// A monster's DNA: how your habits draw it. Languages pick its colours, the hours you keep its
// mark, your commits its build, your tests its armour; a seed from who you are places its
// pattern, so no two monsters come out alike.

import type { Dna, Rgb } from './art'
import { mix, type Pet } from './pet'

export type { Dna }

type Lang = { name: string; hue: number; sat?: number }

/** File extensions to languages. Data and docs (json, yaml, md, lock files) do not count. */
export const LANGS: Record<string, Lang> = {
  ts: { name: 'TypeScript', hue: 214 }, tsx: { name: 'TypeScript', hue: 214 }, mts: { name: 'TypeScript', hue: 214 }, cts: { name: 'TypeScript', hue: 214 },
  js: { name: 'JavaScript', hue: 50 }, jsx: { name: 'JavaScript', hue: 50 }, mjs: { name: 'JavaScript', hue: 50 }, cjs: { name: 'JavaScript', hue: 50 },
  py: { name: 'Python', hue: 207 }, ipynb: { name: 'Python', hue: 207 },
  rs: { name: 'Rust', hue: 22 }, go: { name: 'Go', hue: 186 }, java: { name: 'Java', hue: 8 },
  kt: { name: 'Kotlin', hue: 275 }, kts: { name: 'Kotlin', hue: 275 }, swift: { name: 'Swift', hue: 14 },
  rb: { name: 'Ruby', hue: 352 }, php: { name: 'PHP', hue: 240 }, cs: { name: 'C#', hue: 265 },
  c: { name: 'C', hue: 220, sat: 0.35 }, h: { name: 'C', hue: 220, sat: 0.35 },
  cpp: { name: 'C++', hue: 330 }, cc: { name: 'C++', hue: 330 }, hpp: { name: 'C++', hue: 330 },
  css: { name: 'CSS', hue: 318 }, scss: { name: 'CSS', hue: 318 }, sass: { name: 'CSS', hue: 318 }, less: { name: 'CSS', hue: 318 },
  html: { name: 'HTML', hue: 12 }, vue: { name: 'Vue', hue: 153 }, svelte: { name: 'Svelte', hue: 16 },
  sh: { name: 'Shell', hue: 110 }, bash: { name: 'Shell', hue: 110 }, zsh: { name: 'Shell', hue: 110 }, fish: { name: 'Shell', hue: 110 },
  sql: { name: 'SQL', hue: 196 }, dart: { name: 'Dart', hue: 192 }, ex: { name: 'Elixir', hue: 278 }, exs: { name: 'Elixir', hue: 278 },
  hs: { name: 'Haskell', hue: 258 }, lua: { name: 'Lua', hue: 236 }, zig: { name: 'Zig', hue: 38 }, scala: { name: 'Scala', hue: 0 },
  r: { name: 'R', hue: 205 }, jl: { name: 'Julia', hue: 290 }, ml: { name: 'OCaml', hue: 28 }, clj: { name: 'Clojure', hue: 128 },
}

/** The extension of a path, lowercased, if it names a language; nothing else of the path is kept. */
export function extOf(path: string): string | undefined {
  const m = /\.([A-Za-z0-9]+)$/.exec(path)
  const ext = m?.[1]?.toLowerCase()
  return ext && LANGS[ext] ? ext : undefined
}

function hsl(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255)
}

export type LangShare = { name: string; hue: number; sat: number; share: number }

/** Languages by share of edits, merged by name (ts and tsx are one TypeScript). */
export function languages(p: Pet): LangShare[] {
  const byName = new Map<string, LangShare>()
  let total = 0
  for (const [ext, n] of Object.entries(p.habits.langs)) {
    const l = LANGS[ext]
    if (!l) continue
    total += n
    const cur = byName.get(l.name) ?? { name: l.name, hue: l.hue, sat: l.sat ?? 1, share: 0 }
    cur.share += n
    byName.set(l.name, cur)
  }
  return [...byName.values()].map(l => ({ ...l, share: total ? l.share / total : 0 })).sort((a, b) => b.share - a.share)
}

/** The hour band most of the activity falls in, and how concentrated it is. */
export function rhythm(p: Pet): { mark: Dna['mark']; peak: number; samples: number } {
  const hours = p.habits.hours
  const samples = hours.reduce((a, b) => a + b, 0)
  if (samples < 30) return { mark: 'none', peak: -1, samples }
  const night = [22, 23, 0, 1, 2, 3, 4].reduce((n, h) => n + (hours[h] ?? 0), 0) / samples
  const morning = [5, 6, 7, 8, 9, 10].reduce((n, h) => n + (hours[h] ?? 0), 0) / samples
  const peak = hours.indexOf(Math.max(...hours))
  // Concentrated within a working day: the busiest 9 consecutive hours hold most of it.
  let best = 0
  for (let s = 0; s < 24; s++) {
    let n = 0
    for (let i = 0; i < 9; i++) n += hours[(s + i) % 24] ?? 0
    best = Math.max(best, n)
  }
  const mark: Dna['mark'] = night >= 0.35 ? 'moon' : morning >= 0.35 ? 'sun' : best / samples >= 0.85 ? 'star' : 'none'
  return { mark, peak, samples }
}

/** Average edits per commit, once there are a few commits to go on. */
export function commitSize(p: Pet): number | null {
  return p.stats.commits >= 3 ? p.habits.committedEdits / p.stats.commits : null
}

const PATTERNS: Dna['pattern'][] = ['stripes', 'spots', 'patch']

/** The DNA your habits have written so far; nothing until it has seen enough to say. */
export function dnaOf(p: Pet): Dna | undefined {
  const langs = languages(p)
  const main = langs[0]
  if (!main || p.habits.edits < 10) return undefined
  const seed = p.seed ?? mix(p.born, 1)
  const jitter = ((seed % 1000) / 1000 - 0.5) * 0.08 // a person's own shade, ±4% lightness
  // How dominant the main language is decides how vivid the colour is: 40% is muted, 95% is bold.
  const vivid = 0.35 + Math.min(1, Math.max(0, (main.share - 0.4) / 0.55)) * 0.55
  const s = vivid * main.sat
  const hue = (main.hue + ((seed >> 10) % 17) - 8 + 360) % 360 // and its own tint, ±8°
  const palette = { base: hsl(hue, s, 0.55 + jitter), dark: hsl(hue, s * 0.9, 0.32 + jitter), light: hsl(hue, s * 0.8, 0.76 + jitter) }
  const second = langs[1] && langs[1].share >= 0.12 ? langs[1] : undefined
  const accentHue = second ? second.hue : main.name === 'Python' ? 48 : (main.hue + 150 + (seed % 60)) % 360
  const accent = hsl(accentHue, 0.75, 0.6)
  const pattern: Dna['pattern'] = second || main.name === 'Python' ? PATTERNS[seed % PATTERNS.length]! : 'none'
  const { mark } = rhythm(p)
  const size = commitSize(p)
  const build: Dna['build'] = size === null ? 'normal' : size <= 6 ? 'slim' : size >= 20 ? 'stout' : 'normal'
  const passRate = p.habits.testRuns ? p.stats.tests / p.habits.testRuns : 0
  const armor = p.stats.tests >= 10 && passRate >= 0.7
  const errorRate = p.habits.toolCalls ? p.stats.errors / p.habits.toolCalls : 1
  const eyes: Dna['eyes'] = mark === 'moon' ? 'sleepy' : p.habits.toolCalls >= 100 && errorRate < 0.05 ? 'sharp' : 'round'
  const t = p.traits
  const traitSum = Math.max(1, t.shell + t.code + t.agents + t.web)
  const extra: Dna['extra'] = p.streak.days >= 30 ? 'scarf' : t.web / traitSum >= 0.15 ? 'glasses' : 'none'
  return { palette, accent, pattern, mark, build, armor, eyes, extra, shiny: p.shiny, seed }
}

/** Why it looks the way it does, one line per trait, for the Style tab. */
export function describe(p: Pet): string[] {
  const langs = languages(p)
  const dna = dnaOf(p)
  if (!dna) {
    const need = Math.max(0, 10 - p.habits.edits)
    return [`Its colours appear after ${need} more file edit${need === 1 ? '' : 's'} with Claude.`]
  }
  const pct = (n: number) => `${Math.round(n * 100)}%`
  const main = langs[0]!
  const second = langs[1] && langs[1].share >= 0.12 ? langs[1] : undefined
  const r = rhythm(p)
  const size = commitSize(p)
  const lines = [
    `Colour: ${main.name} ${pct(main.share)}${main.share >= 0.85 ? ' (bold)' : main.share < 0.55 ? ' (muted)' : ''}`,
    `Pattern: ${dna.pattern === 'none' ? 'none (one main language)' : `${dna.pattern}${second ? ` in ${second.name} colours (${pct(second.share)})` : ''}`}, placed by your seed`,
    `Mark: ${dna.mark === 'moon' ? 'moon, a night owl' : dna.mark === 'sun' ? 'sun, an early bird' : dna.mark === 'star' ? 'star, steady hours' : r.samples < 30 ? 'not yet (needs more activity)' : 'none, irregular hours'}${r.peak >= 0 ? ` · busiest at ${r.peak}:00` : ''}`,
    `Build: ${dna.build}${size === null ? ' (after 3 commits)' : ` · ${size.toFixed(1)} edits per commit`}`,
    `Armour: ${dna.armor ? `yes · ${p.stats.tests} test runs passed` : `not yet · needs 10 passing test runs mostly green (${p.stats.tests} so far)`}`,
    `Eyes: ${dna.eyes}${dna.eyes === 'sharp' ? ' · few errors' : dna.eyes === 'sleepy' ? ' · late nights' : ''}`,
    `Extra: ${dna.extra === 'scarf' ? 'scarf, a 30-day streak' : dna.extra === 'glasses' ? 'glasses, lots of research' : 'none yet'}`,
  ]
  if (dna.shiny) lines.push('Shiny: yes! A one-in-256 colouring ✦')
  return lines
}
