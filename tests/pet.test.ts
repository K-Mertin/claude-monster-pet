import { expect, mock, test } from 'claude-code/testing'

import { applyAll, decay, face, hatch, level, HOUR } from '../hooks/pet'
import { habitatFrames } from '../hooks/habitat'
import { cells, cropAll, framesSvg, petFrames } from '../hooks/render'

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
import { formName, normalize, type Event, type Pet } from '../hooks/pet'

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
  let p = { ...hatch(T0), hunger: 20, energy: 10, quests: ['feed', 'talk', 'hunt', 'train', 'buy', 'card', 'boss'] }
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
  let p: Pet = { ...hatch(T0), line: 'scribe' }
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
  for (let i = 0; i < 3; i++) last = (await $.command.run(typed('hunt middle'))).text ?? ''
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

import { canFight, move, startBattle } from '../hooks/boss'
import { compose, habitat, sceneSvg, weatherOf } from '../hooks/habitat'
import { canRetire, makeBoss, RETIRE_AFTER } from '../hooks/pet'

test('each week brings a boss shaped by the last week’s failures', () => {
  expect(makeBoss('w', 0, 0).kind).toBe('imp')
  expect(makeBoss('w', 6, 1).kind).toBe('golem')
  expect(makeBoss('w', 6, 4).kind).toBe('hydra')
  expect(makeBoss('w', 20, 2).kind).toBe('kraken')
  let p = applyAll(hatch(T0), [{ kind: 'tool', tool: 'Bash', command: 'ls', failed: true, at: T0 }], T0)
  p = applyAll(p, [{ kind: 'tokens', n: 1, at: T0 + 8 * 24 * HOUR }], T0 + 8 * 24 * HOUR)
  expect(p.boss?.hp).toBe(44)
})

test('a child can beat a boss by using its weaknesses, and is rewarded once', () => {
  let n = 7
  const rnd = () => ((n = (n * 16807) % 2147483647) / 2147483647)
  let p = applyAll(hatch(T0), [{ kind: 'tokens', n: 1, at: T0 }], T0)
  expect(canFight(p)).not.toBeNull()
  p = { ...p, stage: 'child', line: 'forge', xp: 200, skills: { power: 20, wisdom: 5, speed: 5 }, energy: 90 }
  expect(canFight(p)).toBeNull()
  let b = startBattle(p, p.boss!, rnd)
  for (let i = 0; i < 40 && !b.over; i++) b = move(b, p, p.boss!, b.weak, rnd)
  expect(b.over).toBe('won')
  p = applyAll(p, [{ kind: 'boss', won: true, at: T0 + 1 }, { kind: 'boss', won: true, at: T0 + 2 }], T0 + 2)
  expect(p.stats.bossWins).toBe(1)
  expect(p.badges).toContain('boss1')
})

test('gems buy decorations once each', () => {
  let p = { ...hatch(T0), items: { ...hatch(T0).items, gem: 5 }, quests: ['buy'] }
  p = applyAll(p, [{ kind: 'buy', decor: 'desk', at: T0 }, { kind: 'buy', decor: 'desk', at: T0 + 1 }, { kind: 'buy', decor: 'fountain', at: T0 + 2 }], T0 + 2)
  expect(p.decor).toEqual(['desk'])
  expect(p.items.gem).toBe(2)
})

test('an extreme habit unlocks a secret form', () => {
  const p = applyAll({ ...hatch(T0), stage: 'adult', line: 'scribe', variant: 'bright', skills: { power: 0, wisdom: 50, speed: 0 } }, [{ kind: 'pet', at: T0 }], T0)
  expect(p.secret).toBe('archivist')
  expect(formName(p)).toBe('Archivist')
})

test('an ultimate retires after 30 days and the next egg keeps the treasures', () => {
  const u = { ...hatch(T0), stage: 'ultimate' as const, line: 'forge' as const, variant: 'bright' as const, ultimateAt: T0, xp: 4000, decor: ['bed' as const], skills: { power: 40, wisdom: 0, speed: 0 } }
  expect(canRetire(u, T0 + 1000)).toBe(false)
  const r = applyAll(u, [{ kind: 'retire', at: T0 + RETIRE_AFTER }], T0 + RETIRE_AFTER)
  expect(r.stage).toBe('egg')
  expect(r.generation).toBe(2)
  expect(r.hall[0]?.form).toBe('Solforge')
  expect(r.skills.power).toBe(10)
  expect(r.decor).toEqual(['bed'])
})

test('the habitat draws every season, weather, holiday and a boss within limits', () => {
  for (const month of [1, 4, 7, 10, 12]) {
    const at = new Date(2026, month - 1, month === 12 ? 24 : 10, 12).getTime()
    expect(weatherOf(at)).toMatch(/clear|cloudy|rain|snow|petals|leaves/)
    const p = { ...hatch(at - 86400000), stage: 'adult' as const, line: 'summoner' as const, variant: 'shadow' as const, decor: ['plant', 'lamp', 'poster', 'rug', 'bed', 'toybox', 'desk', 'fountain'] as never }
    const scene = habitat(p, at, 12, { boss: { kind: 'kraken', hit: true } })
    expect(compose(scene, 1234).px.length).toBe(72 * 40)
    expect(sceneSvg(scene, 7).length).toBeLessThan(131072)
  }
})

import { describe as dnaLines, dnaOf, extOf, languages } from '../hooks/dna'
import { mix } from '../hooks/pet'

const edits = (ext: string, n: number, at = T0): Event[] =>
  Array.from({ length: n }, (_, i) => ({ kind: 'tool' as const, tool: 'Edit', failed: false, ext, at: at + i }))

test('only a language extension is kept from a path', () => {
  expect(extOf('/Users/me/secret-project/src/App.tsx')).toBe('tsx')
  expect(extOf('notes/README.md')).toBeUndefined()
  expect(extOf('Makefile')).toBeUndefined()
})

test('edits build up languages; no DNA until there are enough', () => {
  let p = applyAll(hatch(T0), edits('ts', 6), T0 + 10)
  expect(dnaOf(p)).toBeUndefined()
  expect(dnaLines(p)[0]).toContain('4 more file edits')
  p = applyAll(p, [...edits('tsx', 12, T0 + 20), ...edits('css', 4, T0 + 40)], T0 + 50)
  const langs = languages(p)
  expect(langs[0]?.name).toBe('TypeScript')
  expect(Math.round((langs[0]?.share ?? 0) * 100)).toBe(82)
  expect(dnaOf(p)?.pattern).not.toBe('none')
})

test('a more dominant language gives a bolder colour', () => {
  const sat = (rgb: number) => { const r = rgb >> 16 & 255, g = rgb >> 8 & 255, b = rgb & 255; return Math.max(r, g, b) - Math.min(r, g, b) }
  const muted = applyAll(hatch(T0), [...edits('ts', 12), ...edits('py', 8, T0 + 100)], T0 + 200)
  const bold = applyAll(hatch(T0), edits('ts', 40), T0 + 100)
  expect(sat(dnaOf(bold)!.palette.base)).toBeGreaterThan(sat(dnaOf(muted)!.palette.base))
})

test('night hours, small commits and green tests show up as moon, slim and armour', () => {
  const night = Array.from({ length: 40 }, (_, i) => ({ kind: 'tokens' as const, n: 10, at: new Date(2026, 9, 1 + (i % 5), 23, i).getTime() }))
  const work: Event[] = []
  for (let c = 0; c < 4; c++) {
    work.push(...edits('rs', 3, T0 + 1000 + c * 10))
    work.push({ kind: 'tool', tool: 'Bash', command: 'git commit -m x', failed: false, at: T0 + 1005 + c * 10 })
  }
  for (let t = 0; t < 12; t++) work.push({ kind: 'tool', tool: 'Bash', command: 'cargo test', failed: false, at: T0 + 2000 + t })
  work.push(...edits('rs', 15, T0 + 3000))
  const p = applyAll(hatch(T0), [...work, ...night], T0 + 10 ** 9)
  const dna = dnaOf(p)!
  expect(dna.mark).toBe('moon')
  expect(dna.eyes).toBe('sleepy')
  expect(dna.build).toBe('slim')
  expect(dna.armor).toBe(true)
})

test('two people with the same habits still look different', () => {
  const habits = [...edits('go', 20), ...edits('js', 8, T0 + 100)]
  const a = applyAll(hatch(T0), [{ kind: 'seed', value: 12345, at: T0 }, ...habits], T0 + 200)
  const b = applyAll(hatch(T0), [{ kind: 'seed', value: 67890, at: T0 }, ...habits], T0 + 200)
  const draw = (p: Pet) => petFrames({ ...p, stage: 'adult', line: 'forge', variant: 'bright' }, T0)[0]!.px.join()
  expect(draw(a)).not.toBe(draw(b))
})

test('shiny is rare and decided once from the seed', () => {
  const born = hatch(T0).born
  let lucky = 0
  while (mix(lucky, born) % 256 !== 0) lucky++
  const p = applyAll(hatch(T0), [{ kind: 'seed', value: lucky, at: T0 }, { kind: 'seed', value: lucky + 1, at: T0 + 1 }], T0 + 1)
  expect(p.shiny).toBe(true)
  expect(p.seed).toBe(lucky)
  let shinies = 0
  for (let v = 0; v < 2560; v++) if (mix(v, born) % 256 === 0) shinies++
  expect(shinies).toBeGreaterThan(2)
  expect(shinies).toBeLessThan(25)
})

test('every DNA combination draws within limits', () => {
  for (const ext of ['ts', 'py', 'rs', 'go', 'rb', 'css']) {
    const p = applyAll(hatch(T0), [{ kind: 'seed', value: ext.length * 977, at: T0 }, ...edits(ext, 20), ...edits('js', 6, T0 + 50)], T0 + 100)
    for (const stage of ['child', 'adult', 'ultimate'] as const) {
      for (const variant of ['bright', 'shadow'] as const) {
        const frames = habitatFrames({ ...p, stage, line: 'wanderer', variant }, T0, 12)
        expect(framesSvg(frames, 7).length).toBeLessThan(131072)
      }
    }
    expect(dnaLines(p).length).toBeGreaterThanOrEqual(7)
  }
})

import { CARD_H, CARD_W, card, dnaCode, pngBase64, readCode } from '../hooks/card'

test('a DNA code reads back to the same traits', () => {
  const p = applyAll(hatch(T0), [{ kind: 'seed', value: 4_000_000_123, at: T0 }, ...edits('rs', 30), ...edits('go', 10, T0 + 100)], T0 + 200)
  const grown = { ...p, stage: 'adult' as const, line: 'forge' as const, variant: 'shadow' as const }
  const code = dnaCode(grown)
  expect(code).toMatch(/^BYTE-[0-9A-Z]{5}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
  const back = readCode(code)!
  expect(back.name).toBe('BYTE')
  expect(back.fields.seed).toBe(4_000_000_123)
  expect(back.fields.lang1).toBe('Rust')
  expect(back.fields.lang2).toBe('Go')
  expect(back.fields.stage).toBe('adult')
  expect(back.fields.variant).toBe('shadow')
  expect(readCode('not a code')).toBeNull()
})

test('the card draws at its size and saves as a palette PNG', () => {
  const p = applyAll(hatch(T0), [...edits('ts', 20), ...edits('css', 5, T0 + 50)], T0 + 100)
  const c = card({ ...p, stage: 'child', line: 'wanderer' }, T0 + 100)
  expect(c.w).toBe(CARD_W)
  expect(c.h).toBe(CARD_H)
  const b64 = pngBase64(c, 3)
  expect(b64.startsWith('iVBORw0KGgo')).toBe(true) // the PNG signature
  expect(framesSvg([c], 2).length).toBeLessThan(131072)
})

test('without a home folder, /pet card answers with the DNA code', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const r = await $.command.run(typed('card'))
  expect(r.text).toMatch(/DNA code: BYTE-/)
})

import { nextUp, tourTip } from '../hooks/pet'

test('the tour moves on as you do each thing, and can be skipped or restarted', () => {
  let p = hatch(T0)
  expect(tourTip(p)).toContain('Tip 1/6')
  p = applyAll(p, [{ kind: 'tokens', n: 80_000, at: T0 + 1 }], T0 + 1)
  expect(tourTip(p)).toContain('Tip 2/6')
  p = applyAll(p, [{ kind: 'seen', what: 'pane', at: T0 + 2 }, { kind: 'pet', at: T0 + 3 }], T0 + 3)
  expect(tourTip(p)).toContain('Tip 4/6')
  p = applyAll(p, [{ kind: 'tour', action: 'skip', at: T0 + 4 }], T0 + 4)
  expect(tourTip(p)).toBeNull()
  p = applyAll(p, [{ kind: 'tour', action: 'restart', at: T0 + 5 }], T0 + 5)
  expect(tourTip(p)).toContain('Tip 4/6')
})

test('starter quests reward once', () => {
  let p = hatch(T0)
  const before = p.items.cookie
  p = applyAll(p, [{ kind: 'talk', text: 'hi', at: T0 }, { kind: 'talk', text: 'hi', at: T0 + 1 }], T0 + 1)
  expect(p.quests).toEqual(['talk'])
  expect(p.items.cookie).toBe(before + 1)
  p = applyAll(p, [{ kind: 'card', at: T0 + 2 }], T0 + 2)
  expect(p.quests).toContain('card')
  expect(p.items.gem).toBe(1)
})

test('next up points at the most useful thing', () => {
  const p = hatch(T0)
  expect(nextUp({ ...p, hunger: 10 }, T0)).toContain('hungry')
  expect(nextUp({ ...p, mess: 3 }, T0)).toContain('Clean')
  expect(nextUp({ ...p, stage: 'child', boss: { week: 'w', kind: 'imp', name: 'Lint Imp', hp: 40, atk: 6, beaten: false, tries: 0 } }, T0)).toContain('Lint Imp')
  expect(nextUp(p, T0)).toMatch(/xp until it becomes a baby|Quest:/)
})

test('/pet help lists the commands by group', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const r = await $.command.run(typed('help'))
  expect(r.text).toContain('Care:')
  expect(r.text).toContain('/pet card')
})
