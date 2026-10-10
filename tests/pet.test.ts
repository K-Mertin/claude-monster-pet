import { expect, mock, test } from 'claude-code/testing'

import { applyAll, decay, face, hatch, level, HOUR } from '../hooks/pet'
import { cells, cropAll, framesSvg, habitatFrames, petFrames } from '../hooks/render'

const T0 = 1_000_000

test('a new egg hatches into a baby once it has eaten enough work', () => {
  let p = hatch(T0)
  expect(p.stage).toBe('egg')
  p = applyAll(p, [{ kind: 'tokens', n: 80_000, at: T0 + 1000 }], T0 + 1000)
  expect(level(p.xp)).toBeGreaterThanOrEqual(1)
  expect(p.stage).toBe('baby')
  expect(p.log.some(l => l.text.includes('hatched'))).toBe(true)
  expect(p.badges).toContain('hatched')
})

test('how you work picks the evolution line', () => {
  const shellHeavy = Array.from({ length: 40 }, (_, i) => ({ kind: 'tool' as const, tool: 'Bash', command: 'ls', failed: false, at: T0 + i }))
  const p = applyAll(hatch(T0), [...shellHeavy, { kind: 'tokens', n: 1_300_000, at: T0 + 100 }], T0 + 100)
  expect(p.stage).toBe('child')
  expect(p.line).toBe('forge')

  const agents = Array.from({ length: 20 }, (_, i) => ({ kind: 'tool' as const, tool: 'Agent', failed: false, at: T0 + i }))
  const q = applyAll(hatch(T0), [...shellHeavy.slice(0, 10), ...agents, { kind: 'tokens', n: 1_300_000, at: T0 + 100 }], T0 + 100)
  expect(q.line).toBe('summoner')
})

test('passing tests and commits cheer it up; failures stress it', () => {
  let p = hatch(T0)
  p = applyAll(p, [{ kind: 'tool', tool: 'Bash', command: 'npm test', failed: false, at: T0 + 1 }], T0 + 1)
  expect(p.stats.tests).toBe(1)
  expect(face(p, T0 + 2)).toBe('cheer')
  p = applyAll(p, [{ kind: 'tool', tool: 'Bash', command: 'git commit -m x', failed: false, at: T0 + 2 }], T0 + 2)
  expect(p.stats.commits).toBe(1)
  const before = p.stress
  p = applyAll(p, [{ kind: 'tool', tool: 'Bash', command: 'pytest', failed: true, at: T0 + 3 }], T0 + 3)
  expect(p.stress).toBe(before + 8)
  expect(face(p, T0 + 4)).toBe('ouch')
})

test('time makes it hungry, and it sleeps while you are away', () => {
  const p = hatch(T0)
  const later = decay(p, T0 + 10 * HOUR)
  expect(later.hunger).toBeLessThan(p.hunger)
  expect(face(later, T0 + 10 * HOUR)).toBe('sleep')
})

test('feeding has a cooldown', () => {
  let p = { ...hatch(T0), hunger: 10 }
  p = applyAll(p, [{ kind: 'feed', at: T0 + 1 }], T0 + 1)
  expect(Math.round(p.hunger)).toBe(35)
  p = applyAll(p, [{ kind: 'feed', at: T0 + 2 }], T0 + 2)
  expect(p.hunger).toBeLessThan(36)
  expect(p.stats.fed).toBe(1)
})

test('every stage and line draws, in frames of one size, in both renderers', () => {
  for (const stage of ['egg', 'baby', 'child', 'adult', 'ultimate'] as const) {
    for (const line of [null, 'forge', 'scribe', 'summoner', 'wanderer'] as const) {
      const p = { ...hatch(T0), stage, line }
      const frames = cropAll(petFrames(p, T0))
      expect(frames.length).toBe(4)
      expect(new Set(frames.map(f => `${f.w}x${f.h}`)).size).toBe(1)
      expect(frames[0]!.h % 2).toBe(0)
      const c = cells(frames[0]!)
      expect(c.rows).toBe(frames[0]!.h / 2)
      const hab = habitatFrames(p, T0, 12)
      expect(framesSvg(hab, 7).length).toBeLessThan(131072)
    }
  }
})

import { talkLine } from '../hooks/lines'
import { formName, normalize } from '../hooks/pet'

test('work earns items: tests give cookies, a fixed failure a bug snack, commits gems, tokens coffee', () => {
  let p = hatch(T0)
  const c0 = p.items.cookie
  p = applyAll(p, [
    { kind: 'tool', tool: 'Bash', command: 'npm test', failed: true, at: T0 + 1 },
    { kind: 'tool', tool: 'Bash', command: 'npm test', failed: false, at: T0 + 2 },
    { kind: 'tool', tool: 'Bash', command: 'git commit -m x', failed: false, at: T0 + 3 },
    { kind: 'tokens', n: 120_000, at: T0 + 4 },
  ], T0 + 4)
  expect(p.items.bug).toBe(1)
  expect(p.items.cookie).toBeGreaterThan(c0)
  expect(p.items.gem).toBe(1)
  expect(p.items.coffee).toBe(2)
})

test('using an item spends it and does its job', () => {
  let p = { ...hatch(T0), hunger: 20, energy: 10 }
  p = applyAll(p, [{ kind: 'use', item: 'cookie', at: T0 + 1 }], T0 + 1)
  expect(p.items.cookie).toBe(0)
  expect(Math.round(p.hunger)).toBe(35)
  p = applyAll(p, [{ kind: 'use', item: 'coffee', at: T0 + 2 }], T0 + 2)
  expect(Math.round(p.energy)).toBe(10)
})

test('a daily streak grows on consecutive days and gives gifts', () => {
  const day = 24 * HOUR
  let p = hatch(T0)
  p = applyAll(p, [{ kind: 'tokens', n: 10, at: T0 }], T0)
  p = applyAll(p, [{ kind: 'tokens', n: 10, at: T0 + day }], T0 + day)
  p = applyAll(p, [{ kind: 'tokens', n: 10, at: T0 + 2 * day }], T0 + 2 * day)
  expect(p.streak.days).toBe(3)
  expect(p.items.gem).toBe(1)
  p = applyAll(p, [{ kind: 'tokens', n: 10, at: T0 + 5 * day }], T0 + 5 * day)
  expect(p.streak.days).toBe(1)
})

test('badges unlock hats, and only unlocked hats can be worn', () => {
  let p = hatch(T0)
  p = applyAll(p, [{ kind: 'equip', hat: 'wizard', at: T0 }], T0)
  expect(p.hat).toBeNull()
  p = applyAll(p, Array.from({ length: 30 }, (_, i) => ({ kind: 'pet' as const, at: T0 + i })), T0 + 30)
  expect(p.badges).toContain('pats30')
  expect(p.hats).toContain('bow')
  p = applyAll(p, [{ kind: 'equip', hat: 'bow', at: T0 + 31 }], T0 + 31)
  expect(p.hat).toBe('bow')
})

test('training raises a skill, faster on its line, then needs rest', () => {
  let p = { ...hatch(T0), line: 'scribe' as const }
  p = applyAll(p, [{ kind: 'train', skill: 'wisdom', at: T0 }], T0)
  expect(p.skills.wisdom).toBe(5)
  p = applyAll(p, [{ kind: 'train', skill: 'power', at: T0 + 1000 }], T0 + 1000)
  expect(p.skills.power).toBe(0)
})

test('a won treat hunt gives its prize; meals leave messes that can be cleaned', () => {
  let p = hatch(T0)
  p = applyAll(p, [{ kind: 'game', won: true, prize: 'gem', at: T0 }], T0)
  expect(p.stats.wins).toBe(1)
  expect(p.items.gem).toBe(1)
  p = applyAll(p, [{ kind: 'use', item: 'cookie', at: T0 + 1 }, { kind: 'feed', at: T0 + 2 }, { kind: 'use', item: 'gem', at: T0 + 3 }], T0 + 3)
  p = applyAll({ ...p, items: { ...p.items, cookie: 2 } }, [{ kind: 'use', item: 'cookie', at: T0 + 4 }], T0 + 4)
  expect(p.mess).toBe(1)
  p = applyAll(p, [{ kind: 'clean', at: T0 + 5 }], T0 + 5)
  expect(p.mess).toBe(0)
})

test('good care makes a bright adult, neglect a shadow one', () => {
  const grow = (joy: number) =>
    applyAll({ ...hatch(T0), stage: 'child' as const, line: 'forge' as const, xp: 990, joy, care: { sum: joy * 10, n: 10 } }, [{ kind: 'task', n: 2, at: T0 + 1 }], T0 + 1)
  const bright = grow(90)
  expect(bright.stage).toBe('adult')
  expect(formName(bright)).toBe('Emberkin')
  expect(formName(grow(20))).toBe('Cinderhorn')
})

test('a pet saved by the first version loads with every new field', () => {
  const old = { name: 'Byte', born: T0, updatedAt: T0, lastActive: T0, stage: 'baby', line: null, xp: 12, hunger: 50, joy: 50, stress: 0,
    traits: { shell: 1, code: 2, agents: 0, web: 0 }, stats: { tokens: 5, tests: 0, commits: 0, tasks: 0, errors: 0, fed: 0, played: 0 }, cooldowns: {}, log: [] }
  const p = normalize(old as never)
  expect(p.items.cookie).toBe(1)
  expect(p.skills.wisdom).toBe(0)
  expect(p.stats.pats).toBe(0)
  expect(p.xp).toBe(12)
})

test('it always has something to say', () => {
  let n = 0
  const rnd = () => ((n = (n * 9301 + 49297) % 233280) / 233280)
  for (const stage of ['egg', 'baby', 'child', 'adult'] as const) {
    for (const personality of ['cheerful', 'lazy', 'curious', 'grumpy'] as const) {
      const line = talkLine({ ...hatch(T0), stage, personality, line: stage === 'egg' || stage === 'baby' ? null : 'wanderer' }, T0, rnd)
      expect(line.length).toBeGreaterThan(3)
    }
  }
})

test('every hat and variant draws', () => {
  for (const hat of ['party', 'cap', 'headphones', 'wizard', 'flower', 'bow', 'beanie', 'halo'] as const) {
    for (const variant of ['bright', 'shadow'] as const) {
      const p = { ...hatch(T0), stage: 'adult' as const, line: 'summoner' as const, variant, hat, mess: 2 }
      const frames = habitatFrames(p, T0, 21, { round: 1, score: 0, treat: 1, picked: 0 })
      expect(frames.length).toBe(4)
      expect(framesSvg(frames, 7).length).toBeLessThan(131072)
    }
  }
})

import type { CommandRunInput } from 'claude-code'
import { alerts } from '../hooks/pet'

test('an alert fires once, and again only after its condition clears', () => {
  let p = { ...hatch(T0), hunger: 10 }
  const first = alerts(p)
  expect(first.fire).toEqual(['Byte is very hungry.'])
  expect(alerts(first.pet).fire).toEqual([])
  const fed = alerts({ ...first.pet, hunger: 60 })
  expect(alerts({ ...fed.pet, hunger: 10 }).fire.length).toBe(1)
  p = { ...first.pet, settings: { ...first.pet.settings, alerts: false }, alerted: {} }
  expect(alerts(p).fire).toEqual([])
})

const typed = (args: string): CommandRunInput => ({ command: 'pet', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

test('a treat hunt can be played by typing', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const start = await $.command.run(typed('hunt'))
  expect(start.text).toContain('Round 1/3')
  let last = ''
  for (let i = 0; i < 3; i++) last = (await $.command.run(typed('hunt middle'))).text
  expect(last).toMatch(/Won|Found \d\/3/)
  const again = await $.command.run(typed('hunt'))
  expect(again.text).toContain('resting')
})

test('typed commands say what happened', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const r = await $.command.run(typed('clean'))
  expect(r.text).toContain('Nothing to clean yet')
  const h = await $.command.run(typed('hat wizard'))
  expect(h.text).toContain("hasn't unlocked")
})
