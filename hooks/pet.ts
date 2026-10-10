// The monster and the rules that raise it. Pure: events in, a new pet out.

import type { Boss, BossKind, Decor, Event, Hat, Item, Legend, Line, Personality, Pet, Secret, Skill, Stage, Variant, Visitor, VisitorDna } from '../types'

export type { Boss, BossKind, Decor, Event, Hat, Item, Legend, Line, Personality, Pet, Secret, Skill, Stage, Variant, Visitor, VisitorDna }

export const HOUR = 3600_000
const MIN = 60_000

const clamp = (n: number) => Math.max(0, Math.min(100, n))

export const PERSONALITIES: Personality[] = ['cheerful', 'lazy', 'curious', 'grumpy']

export function hatch(now: number, name = 'Byte', personality: Personality = 'cheerful'): Pet {
  return normalize({ name, born: now, updatedAt: now, lastActive: now, personality, log: [{ at: now, text: 'An egg appeared.' }] })
}

/** Fills in every field a pet saved by an older version lacks. */
export function normalize(raw: Partial<Pet>): Pet {
  const now = raw.updatedAt ?? 0
  return {
    name: raw.name ?? 'Byte',
    born: raw.born ?? now,
    updatedAt: now,
    lastActive: raw.lastActive ?? now,
    personality: raw.personality ?? 'cheerful',
    stage: raw.stage ?? 'egg',
    line: raw.line ?? null,
    variant: raw.variant ?? null,
    xp: raw.xp ?? 0,
    hunger: raw.hunger ?? 80,
    joy: raw.joy ?? 70,
    stress: raw.stress ?? 0,
    energy: raw.energy ?? 80,
    asleepUntil: raw.asleepUntil,
    mess: raw.mess ?? 0,
    skills: { power: 0, wisdom: 0, speed: 0, ...raw.skills },
    items: { cookie: 1, coffee: 0, gem: 0, bug: 0, ...raw.items },
    hat: raw.hat ?? null,
    hats: raw.hats ?? [],
    badges: raw.badges ?? [],
    streak: raw.streak ?? { days: 0, lastDay: '' },
    care: raw.care ?? { sum: 0, n: 0 },
    traits: { shell: 0, code: 0, agents: 0, web: 0, ...raw.traits },
    stats: {
      tokens: 0, tests: 0, commits: 0, pushes: 0, tasks: 0, errors: 0, fed: 0, meals: 0, played: 0, pats: 0,
      talks: 0, games: 0, wins: 0, trained: 0, cleaned: 0, agents: 0, bossWins: 0, bossTries: 0, cards: 0, visits: 0, spars: 0, ...raw.stats,
    },
    cooldowns: { ...raw.cooldowns },
    mood: raw.mood,
    said: raw.said,
    settings: { sound: false, alerts: true, ...raw.settings },
    week: raw.week ?? { id: '', errors: 0, testFails: 0 },
    boss: raw.boss ?? null,
    secret: raw.secret ?? null,
    ultimateAt: raw.ultimateAt,
    generation: raw.generation ?? 1,
    hall: raw.hall ?? [],
    decor: raw.decor ?? [],
    habits: {
      langs: {}, hours: new Array(24).fill(0), edits: 0, editsSinceCommit: 0, committedEdits: 0, testRuns: 0, toolCalls: 0,
      ...raw.habits,
    },
    seed: raw.seed ?? null,
    shiny: raw.shiny ?? false,
    tour: raw.tour ?? { step: 0, done: false },
    quests: raw.quests ?? [],
    seen: raw.seen ?? [],
    visitor: raw.visitor ?? null,
    alerted: { ...raw.alerted },
    log: raw.log ?? [],
  }
}

export function level(xp: number) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 10))
}

/** XP at which a level begins. */
export function xpFor(lv: number) {
  return lv * lv * 10
}

/** Things you do with it: each wakes it and counts as you being around. */
const INTERACTIONS = new Set<Event['kind']>(['feed', 'play', 'pet', 'talk', 'clean', 'use', 'game', 'train', 'visit-play', 'visit-spar'])

const STAGE_AT: { stage: Stage; level: number }[] = [
  { stage: 'baby', level: 1 },
  { stage: 'child', level: 4 },
  { stage: 'adult', level: 10 },
  { stage: 'ultimate', level: 20 },
]

export const LINE_NAMES: Record<Line, string> = { forge: 'Forge', scribe: 'Scribe', summoner: 'Summoner', wanderer: 'Wanderer' }

/** What each line's adults are called, bright and shadow. */
export const FORM_NAMES: Record<Line, Record<Variant, [string, string]>> = {
  forge: { bright: ['Emberkin', 'Solforge'], shadow: ['Cinderhorn', 'Ashtyrant'] },
  scribe: { bright: ['Quillwisp', 'Lorewraith'], shadow: ['Inkshade', 'Hexscript'] },
  summoner: { bright: ['Callpup', 'Choirlord'], shadow: ['Hollowear', 'Legionmaw'] },
  wanderer: { bright: ['Skylark', 'Zephyrus'], shadow: ['Duskwing', 'Stormcrow'] },
}

export const ITEMS: Record<Item, { name: string; icon: string; what: string }> = {
  cookie: { name: 'Cookie', icon: '🍪', what: '+15 food, +5 joy. Earned from passing tests and daily gifts.' },
  coffee: { name: 'Coffee', icon: '☕', what: '+30 energy. Earned every 50k tokens of work.' },
  gem: { name: 'Gem', icon: '💎', what: '+20 xp, +10 joy. Earned from commits, pushes and streaks.' },
  bug: { name: 'Bug snack', icon: '🐛', what: '+25 food, +5 xp. Earned when a failing test passes again.' },
}

export const SKILL_NAMES: Record<Skill, string> = { power: 'Power', wisdom: 'Wisdom', speed: 'Speed' }

/** Each line trains one skill faster. */
const SKILL_OF: Record<Line, Skill | null> = { forge: 'power', scribe: 'wisdom', wanderer: 'speed', summoner: null }

export const HATS: Record<Hat, string> = {
  party: 'Party hat', cap: 'Cap', headphones: 'Headphones', wizard: 'Wizard hat',
  flower: 'Flower', bow: 'Bow', beanie: 'Beanie', halo: 'Halo',
}

type Badge = { id: string; name: string; what: string; hat?: Hat; earned: (p: Pet) => boolean }

export const BADGES: Badge[] = [
  { id: 'hatched', name: 'Hello, world', what: 'Hatch your egg', earned: p => p.stage !== 'egg' },
  { id: 'lv5', name: 'Growing up', what: 'Reach level 5', hat: 'party', earned: p => level(p.xp) >= 5 },
  { id: 'adult', name: 'All grown up', what: 'Evolve into an adult', earned: p => p.stage === 'adult' || p.stage === 'ultimate' },
  { id: 'ultimate', name: 'Legend', what: 'Reach the ultimate stage', earned: p => p.stage === 'ultimate' },
  { id: 'tests10', name: 'Green light', what: 'Pass 10 test runs', earned: p => p.stats.tests >= 10 },
  { id: 'tests25', name: 'Test whisperer', what: 'Pass 25 test runs', hat: 'halo', earned: p => p.stats.tests >= 25 },
  { id: 'commits10', name: 'Committed', what: 'Make 10 commits', hat: 'cap', earned: p => p.stats.commits >= 10 },
  { id: 'push', name: 'Shipped it', what: 'Push to a remote', earned: p => p.stats.pushes >= 1 },
  { id: 'shell100', name: 'Shell dweller', what: 'Run 100 shell commands', hat: 'headphones', earned: p => p.traits.shell >= 100 },
  { id: 'wisdom20', name: 'Bookworm', what: 'Train Wisdom to 20', hat: 'wizard', earned: p => p.skills.wisdom >= 20 },
  { id: 'fed10', name: 'Well fed', what: 'Feed it 10 times', hat: 'flower', earned: p => p.stats.meals >= 10 },
  { id: 'pats30', name: 'Beloved', what: 'Pat it 30 times', hat: 'bow', earned: p => p.stats.pats >= 30 },
  { id: 'streak7', name: 'Regular', what: 'Work 7 days in a row', hat: 'beanie', earned: p => p.streak.days >= 7 },
  { id: 'wins10', name: 'Treat hunter', what: 'Win 10 treat hunts', earned: p => p.stats.wins >= 10 },
  { id: 'agents10', name: 'Summoner’s call', what: 'Spawn 10 subagents', earned: p => p.stats.agents >= 10 },
  { id: 'tokens1m', name: 'Big eater', what: 'Eat a million tokens', earned: p => p.stats.tokens >= 1_000_000 },
  { id: 'clean5', name: 'Tidy', what: 'Clean up 5 times', earned: p => p.stats.cleaned >= 5 },
  { id: 'talk20', name: 'Chatterbox', what: 'Talk with it 20 times', earned: p => p.stats.talks >= 20 },
  { id: 'boss1', name: 'Bug squasher', what: 'Defeat a weekly Bug Boss', earned: p => p.stats.bossWins >= 1 },
  { id: 'boss5', name: 'Exterminator', what: 'Defeat 5 weekly Bug Bosses', earned: p => p.stats.bossWins >= 5 },
  { id: 'secret', name: 'Hidden path', what: 'Reach a secret form', earned: p => p.secret !== null },
  { id: 'decor4', name: 'Home sweet home', what: 'Own 4 decorations', earned: p => p.decor.length >= 4 },
  { id: 'host3', name: 'Good host', what: 'Host 3 visiting monsters', earned: p => p.stats.visits >= 3 },
  { id: 'spar5', name: 'Sparring partner', what: 'Spar 5 visitors', earned: p => p.stats.spars >= 5 },
  { id: 'legacy', name: 'Legacy', what: 'Retire a monster to the Hall of Fame', earned: p => p.hall.length > 0 },
]

function topLine(p: Pet): Line {
  const t = p.traits
  const ranked: [Line, number][] = [['forge', t.shell], ['scribe', t.code], ['summoner', t.agents * 3], ['wanderer', t.web * 2]]
  ranked.sort((a, b) => b[1] - a[1])
  return ranked[0]![0]
}

export const SECRET_NAMES: Record<Secret, [string, string]> = {
  archivist: ['Archivist', 'High Archivist'],
  bugslayer: ['Bugslayer', 'Bug Sovereign'],
  goldheart: ['Goldheart', 'Sunheart'],
}

export const DECOR: Record<Decor, { name: string; cost: number }> = {
  plant: { name: 'Potted plant', cost: 1 }, lamp: { name: 'Lamp', cost: 1 }, poster: { name: 'Poster', cost: 1 },
  rug: { name: 'Rug', cost: 2 }, bed: { name: 'Bed', cost: 2 }, toybox: { name: 'Toy box', cost: 2 },
  desk: { name: 'Desk and laptop', cost: 3 }, fountain: { name: 'Fountain', cost: 4 },
}

export function formName(p: Pet): string {
  if (p.secret && (p.stage === 'adult' || p.stage === 'ultimate')) return SECRET_NAMES[p.secret][p.stage === 'adult' ? 0 : 1]
  if (!p.line || !p.variant || (p.stage !== 'adult' && p.stage !== 'ultimate')) return p.stage
  return FORM_NAMES[p.line][p.variant][p.stage === 'adult' ? 0 : 1]
}

function note(p: Pet, at: number, text: string) {
  p.log = [...p.log, { at, text }].slice(-40)
}

export function isAsleep(p: Pet, now: number) {
  return (p.asleepUntil ?? 0) > now || now - p.lastActive > 30 * MIN
}

export function isSick(p: Pet) {
  return p.stress >= 80
}

export function dayOf(at: number) {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Time passes: hunger falls, stress eases, energy drains awake and returns asleep. */
export function decay(p: Pet, now: number): Pet {
  const hours = Math.max(0, (now - p.updatedAt) / HOUR)
  if (hours <= 0) return p
  const next = { ...p, updatedAt: now }
  if (p.visitor && p.visitor.until <= now) next.visitor = null
  const sleeping = isAsleep(p, now)
  next.hunger = clamp(p.hunger - hours * (sleeping ? 2 : 4))
  next.stress = clamp(p.stress - hours * (sleeping ? 10 : 6))
  next.energy = clamp(p.energy + hours * (sleeping ? 15 : -3))
  const lonely = now - p.lastActive > 24 * HOUR
  const grubby = p.mess >= 2
  if (next.hunger < 30 || lonely || grubby) next.joy = clamp(p.joy - hours * (grubby ? 4 : 3))
  return next
}

function order(s: Stage) {
  return ['egg', 'baby', 'child', 'adult', 'ultimate'].indexOf(s)
}

function grow(p: Pet, at: number) {
  const lv = level(p.xp)
  for (const s of STAGE_AT) {
    if (lv >= s.level && order(p.stage) < order(s.stage)) {
      if (s.stage === 'child' && !p.line) p.line = topLine(p)
      if (s.stage === 'adult' && !p.variant) {
        const avg = p.care.n ? p.care.sum / p.care.n : p.joy
        p.variant = avg >= 55 && p.stress < 60 ? 'bright' : 'shadow'
      }
      p.stage = s.stage
      if (s.stage === 'ultimate') p.ultimateAt = at
      const what = s.stage === 'baby' ? `${p.name} hatched!` : `${p.name} evolved into ${article(formName(p))}${p.line && s.stage === 'child' ? ` (${LINE_NAMES[p.line]} line)` : ''}!`
      note(p, at, what)
      p.mood = { kind: 'evolve', until: at + 8000 }
    }
  }
}

function article(word: string) {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`
}

function give(p: Pet, item: Item, n = 1) {
  p.items = { ...p.items, [item]: Math.min(99, p.items[item] + n) }
}

const TEST = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bpytest\b|\bjest\b|\bvitest\b|\bcargo\s+test\b|\bgo\s+test\b|\bplugin\s+test\b|\bmake\s+test\b|\brspec\b|\bphpunit\b/
const COMMIT = /\bgit\s+commit\b/
const PUSH = /\bgit\s+push\b/

/** A new day of work: extend or restart the streak, and hand out the daily gift. */
function streak(p: Pet, at: number) {
  const today = dayOf(at)
  if (p.streak.lastDay === today) return
  const yesterday = dayOf(at - 24 * HOUR)
  const days = p.streak.lastDay === yesterday ? p.streak.days + 1 : 1
  p.streak = { days, lastDay: today }
  give(p, 'cookie')
  if (days === 3 || days === 7 || days % 30 === 0) {
    give(p, 'gem')
    note(p, at, `${days}-day streak! A gem for you.`)
  } else if (days > 1) note(p, at, `Day ${days} together. A cookie for you.`)
}

/** The ISO week of a time, e.g. 2026-W41. */
export function weekOf(at: number) {
  const d = new Date(at)
  const day = (d.getDay() + 6) % 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - day + 3)
  const firstThursday = new Date(d.getFullYear(), 0, 4)
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

export const BOSS_NAMES: Record<BossKind, string> = {
  imp: 'Lint Imp', golem: 'Stacktrace Golem', hydra: 'Flaky Hydra', kraken: 'Regression Kraken',
}

/** A boss shaped by a week's failures: more failures, a tougher boss. */
export function makeBoss(week: string, errors: number, testFails: number): Boss {
  const kind: BossKind = errors >= 15 ? 'kraken' : testFails >= 3 && testFails * 2 >= errors ? 'hydra' : errors >= 5 ? 'golem' : 'imp'
  return { week, kind, name: BOSS_NAMES[kind], hp: Math.min(220, 40 + errors * 4), atk: 6 + Math.min(14, Math.floor(errors / 3)), beaten: false, tries: 0 }
}

function rollWeek(p: Pet, at: number) {
  const id = weekOf(at)
  if (p.week.id === id) return
  p.boss = makeBoss(id, p.week.errors, p.week.testFails)
  p.week = { id, errors: 0, testFails: 0 }
}

function active(p: Pet, at: number) {
  rollWeek(p, at)
  const hours = [...p.habits.hours]
  hours[new Date(at).getHours()] = (hours[new Date(at).getHours()] ?? 0) + 1
  p.habits = { ...p.habits, hours }
  p.lastActive = at
  p.care = { sum: p.care.sum + p.joy, n: p.care.n + 1 }
  streak(p, at)
}

/** One thing that happened in some session, applied to the pet. */
export function apply(prev: Pet, e: Event): Pet {
  const d = decay(prev, e.at)
  const p: Pet = {
    ...d, traits: { ...d.traits }, stats: { ...d.stats }, cooldowns: { ...d.cooldowns },
    items: { ...d.items }, skills: { ...d.skills }, hats: [...d.hats], badges: [...d.badges],
  }
  const xp0 = p.xp
  // You are here: caring for it or playing with it wakes it up and counts as being around.
  if (INTERACTIONS.has(e.kind)) {
    if ((p.asleepUntil ?? 0) > e.at) {
      p.asleepUntil = undefined
      p.joy = clamp(p.joy - 2)
      note(p, e.at, `${p.name} woke up, a little grumpy.`)
    }
    p.lastActive = Math.max(p.lastActive, e.at)
  }
  switch (e.kind) {
    case 'tokens': {
      p.hunger = clamp(p.hunger + e.n / 2500)
      p.xp += e.n / 8000
      const coffees = Math.floor((p.stats.tokens + e.n) / 50_000) - Math.floor(p.stats.tokens / 50_000)
      p.stats.tokens += e.n
      if (coffees > 0) give(p, 'coffee', coffees)
      active(p, e.at)
      break
    }
    case 'tool': {
      active(p, e.at)
      habitsOf(p, e)
      if (e.tool === 'Bash') p.traits.shell += 1
      else if (['Read', 'Edit', 'Write', 'Grep', 'Glob', 'NotebookEdit', 'MultiEdit'].includes(e.tool)) p.traits.code += 1
      else if (e.tool === 'Agent') p.traits.agents += 1
      else if (e.tool === 'WebSearch' || e.tool === 'WebFetch') p.traits.web += 1
      if (e.failed) {
        p.stress = clamp(p.stress + 3)
        p.stats.errors += 1
        p.week = { ...p.week, errors: p.week.errors + 1 }
        p.mood = { kind: 'ouch', until: e.at + 4000 }
      } else if ((e.ms ?? 0) > 60_000) {
        p.mood = { kind: 'sweat', until: e.at + 4000 }
      }
      const cmd = e.command ?? ''
      if (e.tool === 'Bash' && TEST.test(cmd)) {
        if (e.failed) {
          p.stress = clamp(p.stress + 5)
          p.stats.lastTestFailed = true
          p.week = { ...p.week, testFails: p.week.testFails + 1 }
        } else {
          p.joy = clamp(p.joy + 8)
          p.xp += 5
          p.stats.tests += 1
          give(p, 'cookie')
          if (p.stats.lastTestFailed) {
            give(p, 'bug')
            note(p, e.at, 'Fixed it! A bug snack for you.')
          } else note(p, e.at, 'Tests passed! A cookie for you.')
          p.stats.lastTestFailed = false
          p.mood = { kind: 'cheer', until: e.at + 5000 }
        }
      }
      if (e.tool === 'Bash' && COMMIT.test(cmd) && !e.failed) {
        p.joy = clamp(p.joy + 5)
        p.xp += 10
        p.stats.commits += 1
        give(p, 'gem')
        p.mood = { kind: 'cheer', until: e.at + 5000 }
        note(p, e.at, 'A commit! A gem for you.')
      }
      if (e.tool === 'Bash' && PUSH.test(cmd) && !e.failed) {
        p.joy = clamp(p.joy + 8)
        p.xp += 10
        p.stats.pushes += 1
        give(p, 'gem')
        p.mood = { kind: 'cheer', until: e.at + 6000 }
        note(p, e.at, 'Shipped! Pushed to the remote.')
      }
      break
    }
    case 'task': {
      p.xp += 5 * e.n
      p.joy = clamp(p.joy + 3 * e.n)
      p.stats.tasks += e.n
      active(p, e.at)
      p.mood = { kind: 'cheer', until: e.at + 4000 }
      break
    }
    case 'agent': {
      p.stats.agents += 1
      p.mood = { kind: 'wave', until: e.at + 4000 }
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
      meal(p)
      p.mood = { kind: 'eat', until: e.at + 4000 }
      note(p, e.at, `You fed ${p.name}.`)
      break
    }
    case 'use': {
      if (p.items[e.item] <= 0) break
      p.items[e.item] -= 1
      if (e.item === 'cookie') {
        p.hunger = clamp(p.hunger + 15)
        p.joy = clamp(p.joy + 5)
        meal(p)
        p.mood = { kind: 'eat', until: e.at + 4000 }
      } else if (e.item === 'bug') {
        p.hunger = clamp(p.hunger + 25)
        p.xp += 5
        meal(p)
        p.mood = { kind: 'eat', until: e.at + 4000 }
      } else if (e.item === 'coffee') {
        p.energy = clamp(p.energy + 30)
        p.asleepUntil = undefined
        p.mood = { kind: 'cheer', until: e.at + 4000 }
      } else if (e.item === 'gem') {
        p.xp += 20
        p.joy = clamp(p.joy + 10)
        p.mood = { kind: 'love', until: e.at + 4000 }
      }
      note(p, e.at, `${p.name} had a ${ITEMS[e.item].name.toLowerCase()}.`)
      break
    }
    case 'play': {
      if ((p.cooldowns.play ?? 0) > e.at || p.energy < 10) {
        p.mood = { kind: 'tired', until: e.at + 3000 }
        break
      }
      p.joy = clamp(p.joy + 15)
      p.stress = clamp(p.stress - 10)
      p.energy = clamp(p.energy - 8)
      p.xp += 2
      p.cooldowns.play = e.at + 30 * MIN
      p.stats.played += 1
      p.mood = { kind: 'cheer', until: e.at + 4000 }
      note(p, e.at, `You played with ${p.name}.`)
      break
    }
    case 'pet': {
      p.joy = clamp(p.joy + 2)
      p.stats.pats += 1
      p.mood = { kind: 'love', until: e.at + 3000 }
      break
    }
    case 'talk': {
      p.joy = clamp(p.joy + 1)
      p.stats.talks += 1
      p.said = { text: e.text, at: e.at }
      p.mood = { kind: 'talk', until: e.at + 5000 }
      break
    }
    case 'clean': {
      if (p.mess === 0) break
      p.mess = 0
      p.joy = clamp(p.joy + 5)
      p.stats.cleaned += 1
      p.mood = { kind: 'cheer', until: e.at + 3000 }
      note(p, e.at, `You tidied up after ${p.name}.`)
      break
    }
    case 'wake': {
      if ((p.asleepUntil ?? 0) <= e.at) break
      p.asleepUntil = undefined
      p.lastActive = Math.max(p.lastActive, e.at)
      p.mood = { kind: 'wave', until: e.at + 3000 }
      note(p, e.at, `Good morning, ${p.name}!`)
      break
    }
    case 'tuck': {
      p.asleepUntil = e.at + 2 * HOUR
      p.stress = clamp(p.stress - 5)
      p.mood = undefined
      note(p, e.at, `${p.name} is tucked in. Good night!`)
      break
    }
    case 'game': {
      p.stats.games += 1
      p.energy = clamp(p.energy - 5)
      p.cooldowns.game = e.at + 5 * MIN
      if (e.won) {
        p.stats.wins += 1
        p.joy = clamp(p.joy + 10)
        p.xp += 4
        if (e.prize) give(p, e.prize)
        p.mood = { kind: 'win', until: e.at + 5000 }
        note(p, e.at, `${p.name} won the treat hunt${e.prize ? ` and found a ${ITEMS[e.prize].name.toLowerCase()}` : ''}!`)
      } else {
        p.joy = clamp(p.joy + 3)
        p.mood = { kind: 'lose', until: e.at + 4000 }
      }
      break
    }
    case 'train': {
      if ((p.cooldowns.train ?? 0) > e.at || p.energy < 10 || p.hunger < 10) {
        p.mood = { kind: 'tired', until: e.at + 3000 }
        break
      }
      const bonus = p.line && SKILL_OF[p.line] === e.skill ? 2 : 0
      p.skills[e.skill] += 3 + bonus
      p.hunger = clamp(p.hunger - 8)
      p.energy = clamp(p.energy - 10)
      p.xp += 3
      p.stats.trained += 1
      p.cooldowns.train = e.at + 15 * MIN
      p.mood = { kind: 'sweat', until: e.at + 4000 }
      note(p, e.at, `${p.name} trained ${SKILL_NAMES[e.skill]} (+${3 + bonus}).`)
      break
    }
    case 'equip': {
      if (e.hat === null || p.hats.includes(e.hat)) p.hat = e.hat
      break
    }
    case 'boss': {
      if (!p.boss || p.boss.beaten) break
      p.boss = { ...p.boss, tries: p.boss.tries + 1 }
      p.stats.bossTries += 1
      p.energy = clamp(p.energy - 15)
      if (e.won) {
        p.boss = { ...p.boss, beaten: true }
        p.stats.bossWins += 1
        give(p, 'gem', 3)
        p.xp += 30
        p.joy = clamp(p.joy + 15)
        p.mood = { kind: 'win', until: e.at + 6000 }
        note(p, e.at, `${p.name} defeated the ${p.boss.name}! +3 gems, +30 xp.`)
      } else {
        p.joy = clamp(p.joy - 5)
        p.mood = { kind: 'lose', until: e.at + 5000 }
        note(p, e.at, `The ${p.boss.name} won this time.`)
      }
      break
    }
    case 'buy': {
      const d = DECOR[e.decor]
      if (!d || p.decor.includes(e.decor) || p.items.gem < d.cost) break
      p.items = { ...p.items, gem: p.items.gem - d.cost }
      p.decor = [...p.decor, e.decor]
      p.mood = { kind: 'cheer', until: e.at + 4000 }
      note(p, e.at, `New for the habitat: ${d.name.toLowerCase()}.`)
      break
    }
    case 'retire': {
      if (!canRetire(p, e.at)) break
      return retire(p, e.at)
    }
    case 'seed': {
      if (p.seed !== null) break
      p.seed = e.value
      // One in 256 monsters is shiny, decided once by who you are and when it hatched.
      p.shiny = mix(e.value, p.born) % 256 === 0
      if (p.shiny) note(p, e.at, `${p.name} has a rare shiny colouring! ✦`)
      break
    }
    case 'visit': {
      p.visitor = { code: e.code, name: e.name, dna: e.dna, arrived: e.at, until: e.at + VISIT_MS, played: false, sparred: false }
      p.stats.visits += 1
      p.mood = { kind: 'wave', until: e.at + 5000 }
      note(p, e.at, `${e.name} came to visit!`)
      break
    }
    case 'visit-play': {
      if (!p.visitor || p.visitor.played) break
      p.visitor = { ...p.visitor, played: true }
      p.joy = clamp(p.joy + 12)
      p.xp += 5
      p.mood = { kind: 'love', until: e.at + 5000 }
      note(p, e.at, `${p.name} and ${p.visitor.name} played together.`)
      break
    }
    case 'visit-spar': {
      if (!p.visitor || p.visitor.sparred) break
      p.visitor = { ...p.visitor, sparred: true }
      p.stats.spars += 1
      p.energy = clamp(p.energy - 8)
      if (e.won) {
        give(p, 'cookie')
        p.xp += 8
        p.mood = { kind: 'win', until: e.at + 5000 }
        note(p, e.at, `${p.name} won a friendly spar against ${p.visitor.name}! 🍪`)
      } else {
        p.joy = clamp(p.joy + 3)
        p.mood = { kind: 'cheer', until: e.at + 4000 }
        note(p, e.at, `${p.visitor.name} won the spar. Good game!`)
      }
      break
    }
    case 'visit-end': {
      if (p.visitor) note(p, e.at, `${p.visitor.name} went home.`)
      p.visitor = null
      break
    }
    case 'seen': {
      if (!p.seen.includes(e.what)) p.seen = [...p.seen, e.what]
      break
    }
    case 'card': {
      p.stats.cards += 1
      break
    }
    case 'tour': {
      p.tour = e.action === 'skip' ? { ...p.tour, done: true } : { step: 0, done: false }
      break
    }
    case 'setting': {
      p.settings = { ...p.settings, [e.key]: e.on }
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
  secrets(p, e.at)
  badges(p, e.at)
  quests(p, e.at)
  advanceTour(p)
  return p
}

// ── Starter quests: small first goals, each rewarded once.
type Quest = { id: string; what: string; reward: Item; done: (p: Pet) => boolean }

export const QUESTS: Quest[] = [
  { id: 'feed', what: 'Feed it once', reward: 'cookie', done: p => p.stats.meals >= 1 },
  { id: 'talk', what: 'Talk with it', reward: 'cookie', done: p => p.stats.talks >= 1 },
  { id: 'hunt', what: 'Win a treat hunt', reward: 'coffee', done: p => p.stats.wins >= 1 },
  { id: 'train', what: 'Train a skill', reward: 'cookie', done: p => p.stats.trained >= 1 },
  { id: 'buy', what: 'Buy a decoration', reward: 'gem', done: p => p.decor.length >= 1 },
  { id: 'card', what: 'Make its card (/pet card)', reward: 'gem', done: p => p.stats.cards >= 1 },
  { id: 'boss', what: 'Fight a weekly Bug Boss', reward: 'coffee', done: p => p.stats.bossTries >= 1 },
]

function quests(p: Pet, at: number) {
  for (const q of QUESTS) {
    if (p.quests.includes(q.id) || !q.done(p)) continue
    p.quests = [...p.quests, q.id]
    give(p, q.reward)
    note(p, at, `Quest done: ${q.what.replace(/ \(.*\)$/, '').toLowerCase()}. ${ITEMS[q.reward].icon} for you.`)
  }
}

// ── The first-run tour: one tip at a time, each moving on once you have done it.
export const TOUR: { tip: string; done: (p: Pet) => boolean }[] = [
  { tip: 'Your egg hatches from Claude’s work: every token feeds it. Just keep coding!', done: p => p.stage !== 'egg' },
  { tip: 'It hatched! Type /pet to visit its habitat.', done: p => p.seen.includes('pane') },
  { tip: 'Say hi: press ♥ or 💬 here, or Feed and Talk in /pet.', done: p => p.stats.pats + p.stats.talks + p.stats.meals > 0 },
  { tip: 'Real work earns treats: passing tests 🍪, commits 💎. See the Items tab.', done: p => p.seen.includes('items') },
  { tip: 'Try the Games tab: a treat hunt, training, and a weekly Bug Boss.', done: p => p.seen.includes('games') || p.stats.games > 0 },
  { tip: 'Your habits shape its looks. See its DNA in Style, and share it with /pet card.', done: p => p.seen.includes('style') || p.stats.cards > 0 },
]

function advanceTour(p: Pet) {
  if (p.tour.done) return
  let step = p.tour.step
  while (step < TOUR.length && TOUR[step]!.done(p)) step++
  p.tour = step >= TOUR.length ? { step, done: true } : { step, done: false }
}

export function tourTip(p: Pet): string | null {
  if (p.tour.done) return null
  const t = TOUR[p.tour.step]
  return t ? `Tip ${p.tour.step + 1}/${TOUR.length}: ${t.tip}` : null
}

/** The single most useful thing to do next, as one line. */
export function nextUp(p: Pet, now: number): string {
  if (isSick(p)) return `${p.name} is sick from errors. Some green test runs and rest will help.`
  if (p.hunger < 25) return `${p.name} is hungry: Feed it, use a 🍪, or give Claude some work.`
  if (p.mess >= 2) return 'It’s messy in here: press Clean.'
  if (p.energy < 15) return `${p.name} is exhausted: Tuck it in, or use a ☕.`
  if (p.boss && !p.boss.beaten && p.stage !== 'egg' && p.stage !== 'baby') return `Your weekly Bug Boss, the ${p.boss.name}, is waiting in Games.`
  const unworn = p.hats.find(h => p.hat === null && h)
  if (unworn) return `You've unlocked the ${HATS[unworn].toLowerCase()}: try it on in Style.`
  const quest = QUESTS.find(q => !p.quests.includes(q.id))
  const lv = level(p.xp)
  const nextStage = STAGE_AT.find(s => order(s.stage) > order(p.stage))
  if (nextStage) {
    const need = Math.ceil(xpFor(nextStage.level) - p.xp)
    const why = nextStage.stage === 'child' ? ', when it picks its line from how you work' : nextStage.stage === 'adult' ? '; care decides bright or shadow' : ''
    if (need <= 40 || !quest) return `${need} xp until it becomes ${article(nextStage.stage)}${why}.`
  }
  if (quest) return `Quest: ${quest.what} (reward ${ITEMS[quest.reward].icon}).`
  const affordable = (Object.keys(DECOR) as Decor[]).find(d => !p.decor.includes(d) && DECOR[d].cost <= p.items.gem)
  if (affordable) return `You have ${p.items.gem} 💎: the ${DECOR[affordable].name.toLowerCase()} is in the Shop.`
  return `Level ${lv + 1} in ${Math.ceil(xpFor(lv + 1) - p.xp)} xp. Keep your ${p.streak.days}-day streak going!`
}

function secretFor(p: Pet): Secret | null {
  if (p.stats.bossWins >= 3) return 'bugslayer'
  if (p.streak.days >= 30) return 'goldheart'
  if (p.line === 'scribe' && p.skills.wisdom >= 50) return 'archivist'
  return null
}

function secrets(p: Pet, at: number) {
  if (p.secret || (p.stage !== 'adult' && p.stage !== 'ultimate')) return
  const s = secretFor(p)
  if (!s) return
  p.secret = s
  p.mood = { kind: 'evolve', until: at + 8000 }
  note(p, at, `${p.name} took a hidden path and became ${article(formName(p))}!`)
}

export const RETIRE_AFTER = 30 * 24 * HOUR
export const VISIT_MS = 24 * HOUR

export function canRetire(p: Pet, now: number) {
  return p.stage === 'ultimate' && p.ultimateAt !== undefined && now - p.ultimateAt >= RETIRE_AFTER
}

/** The monster joins the Hall of Fame; a new egg keeps your treasures and a head start. */
function retire(p: Pet, at: number): Pet {
  const legend: Legend = {
    name: p.name, form: formName(p), level: level(p.xp), days: Math.floor((at - p.born) / (24 * HOUR)), generation: p.generation, retiredAt: at,
  }
  const best = (Object.keys(p.skills) as Skill[]).sort((a, b) => p.skills[b] - p.skills[a])[0]!
  const egg = hatch(at, p.name, p.personality)
  return normalize({
    ...egg,
    generation: p.generation + 1,
    hall: [...p.hall, legend],
    items: p.items, hats: p.hats, hat: p.hat, badges: [...p.badges, ...(p.badges.includes('legacy') ? [] : ['legacy'])],
    decor: p.decor, settings: p.settings, streak: p.streak, week: p.week, boss: p.boss,
    skills: { power: 0, wisdom: 0, speed: 0, [best]: Math.floor(p.skills[best] * 0.25) },
    log: [{ at, text: `${legend.name} retired to the Hall of Fame. A new egg appeared: generation ${p.generation + 1}.` }],
  })
}

function meal(p: Pet) {
  p.stats.meals += 1
  if (p.stats.meals % 3 === 0) p.mess = Math.min(3, p.mess + 1)
}

function badges(p: Pet, at: number) {
  for (const b of BADGES) {
    if (p.badges.includes(b.id) || !b.earned(p)) continue
    p.badges.push(b.id)
    if (b.hat && !p.hats.includes(b.hat)) p.hats.push(b.hat)
    note(p, at, `Badge: ${b.name}${b.hat ? ` (unlocked the ${HATS[b.hat].toLowerCase()})` : ''}`)
  }
}

export function applyAll(p: Pet, events: readonly Event[], now: number): Pet {
  let next = normalize(p)
  for (const e of events) next = apply(next, e)
  return decay(next, now)
}

export type Face = 'happy' | 'sad' | 'sick' | 'sleep' | 'hungry' | 'sleepy' | NonNullable<Pet['mood']>['kind']

/** What the monster looks like it feels right now. */
export function face(p: Pet, now: number): Face {
  if (p.mood && p.mood.until > now) return p.mood.kind
  if (isSick(p)) return 'sick'
  if (isAsleep(p, now)) return 'sleep'
  if (p.hunger < 25) return 'hungry'
  if (p.energy < 20) return 'sleepy'
  if (p.joy < 30) return 'sad'
  return 'happy'
}

export function age(p: Pet, now: number) {
  const d = Math.floor((now - p.born) / (24 * HOUR))
  if (d >= 1) return `${d} day${d === 1 ? '' : 's'}`
  const h = Math.floor((now - p.born) / HOUR)
  return h >= 1 ? `${h}h` : `${Math.max(1, Math.floor((now - p.born) / MIN))}m`
}

const ALERTS = {
  hungry: { when: (p: Pet) => p.hunger < 20, text: (p: Pet) => `${p.name} is very hungry.` },
  sick: { when: (p: Pet) => isSick(p), text: (p: Pet) => `${p.name} feels sick from all the errors.` },
  messy: { when: (p: Pet) => p.mess >= 3, text: (p: Pet) => `${p.name}'s habitat needs a clean.` },
  tired: { when: (p: Pet) => p.energy < 10, text: (p: Pet) => `${p.name} is exhausted. Tuck it in or try a coffee.` },
} as const

/** Alerts that just became true: each fires once, and re-arms when its condition clears. */
export function alerts(p: Pet): { pet: Pet; fire: string[] } {
  const alerted = { ...p.alerted }
  const fire: string[] = []
  for (const [key, a] of Object.entries(ALERTS) as [keyof typeof ALERTS, (typeof ALERTS)[keyof typeof ALERTS]][]) {
    const now = a.when(p)
    if (now && !alerted[key]) fire.push(a.text(p))
    alerted[key] = now
  }
  return { pet: { ...p, alerted }, fire: p.settings.alerts ? fire : [] }
}

/** Mixes two numbers into a well-spread 32-bit value. */
export function mix(a: number, b: number) {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b / 1000) | 0, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

function habitsOf(p: Pet, e: Extract<Event, { kind: 'tool' }>) {
  const h = { ...p.habits, langs: { ...p.habits.langs }, toolCalls: p.habits.toolCalls + 1 }
  if (EDIT_TOOLS.has(e.tool) && e.ext && !e.failed) {
    h.langs[e.ext] = (h.langs[e.ext] ?? 0) + 1
    h.edits += 1
    h.editsSinceCommit += 1
  }
  const cmd = e.command ?? ''
  if (e.tool === 'Bash' && TEST.test(cmd)) h.testRuns += 1
  if (e.tool === 'Bash' && COMMIT.test(cmd) && !e.failed) {
    h.committedEdits += h.editsSinceCommit
    h.editsSinceCommit = 0
  }
  p.habits = h
}

const STAGE_POWER: Record<Stage, number> = { egg: 0, baby: 10, child: 25, adult: 45, ultimate: 70 }

/** A friendly spar: stage and skills against the visitor's stage, with luck. */
export function spar(p: Pet, v: VisitorDna, rnd: () => number): { won: boolean; ours: number; theirs: number } {
  const ours = Math.round(STAGE_POWER[p.stage] + (p.skills.power + p.skills.wisdom + p.skills.speed) / 3 + rnd() * 20)
  const theirs = Math.round(STAGE_POWER[v.stage] + (v.seed % 15) + (v.armor ? 5 : 0) + rnd() * 20)
  return { won: ours >= theirs, ours, theirs }
}
