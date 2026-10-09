// The monster and the rules that raise it. Pure: events in, a new pet out.

import type { Event, Line, Pet, Stage } from '../types'

export type { Event, Line, Pet, Stage }

export const HOUR = 3600_000

const clamp = (n: number) => Math.max(0, Math.min(100, n))

export function hatch(now: number, name = 'Byte'): Pet {
  return {
    name, born: now, updatedAt: now, lastActive: now,
    stage: 'egg', line: null, xp: 0,
    hunger: 80, joy: 70, stress: 0,
    traits: { shell: 0, code: 0, agents: 0, web: 0 },
    stats: { tokens: 0, tests: 0, commits: 0, tasks: 0, errors: 0, fed: 0, played: 0 },
    cooldowns: {}, log: [{ at: now, text: 'An egg appeared.' }],
  }
}

export function level(xp: number) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 10))
}

/** XP at which a level begins. */
export function xpFor(lv: number) {
  return lv * lv * 10
}

const STAGE_AT: { stage: Stage; level: number }[] = [
  { stage: 'baby', level: 1 },
  { stage: 'child', level: 4 },
  { stage: 'adult', level: 10 },
  { stage: 'ultimate', level: 20 },
]

export const LINE_NAMES: Record<Line, string> = { forge: 'Forge', scribe: 'Scribe', summoner: 'Summoner', wanderer: 'Wanderer' }

function topLine(p: Pet): Line {
  const t = p.traits
  const ranked: [Line, number][] = [['forge', t.shell], ['scribe', t.code], ['summoner', t.agents * 3], ['wanderer', t.web * 2]]
  ranked.sort((a, b) => b[1] - a[1])
  return ranked[0]![0]
}

function note(p: Pet, at: number, text: string) {
  p.log = [...p.log, { at, text }].slice(-30)
}

export function isAsleep(p: Pet, now: number) {
  return now - p.lastActive > 30 * 60_000
}

export function isSick(p: Pet) {
  return p.stress >= 80
}

/** Time passes: hunger falls, stress eases, a hungry or lonely monster loses joy. */
export function decay(p: Pet, now: number): Pet {
  const hours = Math.max(0, (now - p.updatedAt) / HOUR)
  if (hours <= 0) return p
  const next = { ...p, updatedAt: now }
  const sleeping = isAsleep(p, now)
  next.hunger = clamp(p.hunger - hours * (sleeping ? 2 : 4))
  next.stress = clamp(p.stress - hours * 6)
  const lonely = now - p.lastActive > 24 * HOUR
  if (next.hunger < 30 || lonely) next.joy = clamp(p.joy - hours * 3)
  return next
}

function grow(p: Pet, at: number) {
  const lv = level(p.xp)
  for (const s of STAGE_AT) {
    if (lv >= s.level && order(p.stage) < order(s.stage)) {
      if (s.stage === 'child' && !p.line) p.line = topLine(p)
      p.stage = s.stage
      note(p, at, s.stage === 'baby' ? `${p.name} hatched!` : `${p.name} evolved into a ${p.line ? LINE_NAMES[p.line] + ' ' : ''}${s.stage}!`)
      p.mood = { kind: 'evolve', until: at + 8000 }
    }
  }
}

function order(s: Stage) {
  return ['egg', 'baby', 'child', 'adult', 'ultimate'].indexOf(s)
}

const TEST = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bpytest\b|\bjest\b|\bvitest\b|\bcargo\s+test\b|\bgo\s+test\b|\bplugin\s+test\b|\bmake\s+test\b/
const COMMIT = /\bgit\s+commit\b/

/** One thing that happened in some session, applied to the pet. */
export function apply(prev: Pet, e: Event): Pet {
  const p: Pet = { ...decay(prev, e.at), traits: { ...prev.traits }, stats: { ...prev.stats }, cooldowns: { ...prev.cooldowns } }
  const xp0 = p.xp
  switch (e.kind) {
    case 'tokens': {
      p.hunger = clamp(p.hunger + e.n / 2500)
      p.xp += e.n / 8000
      p.stats.tokens += e.n
      p.lastActive = e.at
      break
    }
    case 'tool': {
      p.lastActive = e.at
      if (e.tool === 'Bash') p.traits.shell += 1
      else if (['Read', 'Edit', 'Write', 'Grep', 'Glob', 'NotebookEdit', 'MultiEdit'].includes(e.tool)) p.traits.code += 1
      else if (e.tool === 'Agent') p.traits.agents += 1
      else if (e.tool === 'WebSearch' || e.tool === 'WebFetch') p.traits.web += 1
      if (e.failed) {
        p.stress = clamp(p.stress + 3)
        p.stats.errors += 1
        p.mood = { kind: 'ouch', until: e.at + 4000 }
      }
      const cmd = e.command ?? ''
      if (e.tool === 'Bash' && TEST.test(cmd)) {
        if (e.failed) p.stress = clamp(p.stress + 5)
        else {
          p.joy = clamp(p.joy + 8)
          p.xp += 5
          p.stats.tests += 1
          p.mood = { kind: 'cheer', until: e.at + 5000 }
          note(p, e.at, 'Tests passed! ✦')
        }
      }
      if (e.tool === 'Bash' && COMMIT.test(cmd) && !e.failed) {
        p.joy = clamp(p.joy + 5)
        p.xp += 10
        p.stats.commits += 1
        p.mood = { kind: 'cheer', until: e.at + 5000 }
        note(p, e.at, 'A commit! +10 xp')
      }
      break
    }
    case 'task': {
      p.xp += 5 * e.n
      p.joy = clamp(p.joy + 3 * e.n)
      p.stats.tasks += e.n
      p.lastActive = e.at
      p.mood = { kind: 'cheer', until: e.at + 4000 }
      break
    }
    case 'feed': {
      if ((p.cooldowns.feed ?? 0) > e.at) {
        p.mood = { kind: 'full', until: e.at + 3000 }
        break
      }
      p.hunger = clamp(p.hunger + 25)
      p.cooldowns.feed = e.at + HOUR
      p.stats.fed += 1
      p.mood = { kind: 'eat', until: e.at + 4000 }
      note(p, e.at, `You fed ${p.name}.`)
      break
    }
    case 'play': {
      if ((p.cooldowns.play ?? 0) > e.at) {
        p.mood = { kind: 'tired', until: e.at + 3000 }
        break
      }
      p.joy = clamp(p.joy + 15)
      p.stress = clamp(p.stress - 10)
      p.xp += 2
      p.cooldowns.play = e.at + 30 * 60_000
      p.stats.played += 1
      p.mood = { kind: 'cheer', until: e.at + 4000 }
      note(p, e.at, `You played with ${p.name}.`)
      break
    }
    case 'pet': {
      p.joy = clamp(p.joy + 2)
      p.mood = { kind: 'love', until: e.at + 3000 }
      break
    }
    case 'rename': {
      note(p, e.at, `${p.name} is now called ${e.name}.`)
      p.name = e.name
      break
    }
  }
  if (p.stress >= 80 && prev.stress < 80) note(p, e.at, `${p.name} feels sick from all the errors.`)
  if (level(p.xp) > level(xp0)) {
    note(p, e.at, `${p.name} reached level ${level(p.xp)}.`)
    p.mood ??= { kind: 'cheer', until: e.at + 4000 }
  }
  grow(p, e.at)
  return p
}

export function applyAll(p: Pet, events: readonly Event[], now: number): Pet {
  let next = p
  for (const e of events) next = apply(next, e)
  return decay(next, now)
}

/** What the monster looks like it feels right now. */
export function face(p: Pet, now: number): 'happy' | 'sad' | 'sick' | 'sleep' | 'hungry' | NonNullable<Pet['mood']>['kind'] {
  if (p.mood && p.mood.until > now) return p.mood.kind
  if (isSick(p)) return 'sick'
  if (isAsleep(p, now)) return 'sleep'
  if (p.hunger < 25) return 'hungry'
  if (p.joy < 30) return 'sad'
  return 'happy'
}

export function age(p: Pet, now: number) {
  const d = Math.floor((now - p.born) / (24 * HOUR))
  if (d >= 1) return `${d} day${d === 1 ? '' : 's'}`
  const h = Math.floor((now - p.born) / HOUR)
  return h >= 1 ? `${h}h` : `${Math.max(1, Math.floor((now - p.born) / 60_000))}m`
}
