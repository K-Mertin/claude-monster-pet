import { expect, test } from 'claude-code/testing'

import { applyAll, decay, face, hatch, level, HOUR } from '../hooks/pet'
import { cells, cropAll, framesSvg, habitatFrames, petFrames } from '../hooks/render'

const T0 = 1_000_000

test('a new egg hatches into a baby once it has eaten enough work', () => {
  let p = hatch(T0)
  expect(p.stage).toBe('egg')
  p = applyAll(p, [{ kind: 'tokens', n: 80_000, at: T0 + 1000 }], T0 + 1000)
  expect(level(p.xp)).toBeGreaterThanOrEqual(1)
  expect(p.stage).toBe('baby')
  expect(p.log.at(-1)?.text).toContain('hatched')
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
