// The weekly Bug Boss battle: pure turns, so the pane and /pet boss share it and tests can drive it.

import { level, type Boss, type Pet, type Skill } from './pet'

export type Battle = { hp: number; maxHp: number; petHp: number; petMax: number; turn: number; weak: Skill; log: string[]; over: 'won' | 'lost' | null }

const SKILLS: Skill[] = ['power', 'wisdom', 'speed']

export const MOVES: Record<Skill, { name: string; verb: string }> = {
  power: { name: 'Strike', verb: 'strikes' },
  wisdom: { name: 'Outsmart', verb: 'outsmarts' },
  speed: { name: 'Dodge', verb: 'dodges and counters' },
}

const TELLS: Record<Skill, string> = {
  power: 'its shell is cracked: Strike hits hard',
  wisdom: 'it looks confused: Outsmart hits hard',
  speed: 'it is winding up: Dodge hits hard',
}

export function canFight(p: Pet): string | null {
  if (!p.boss) return 'No boss yet. One forms at the start of each week from the last week’s failures.'
  if (p.boss.beaten) return `The ${p.boss.name} is beaten for this week. A new boss forms next week.`
  if (p.stage === 'egg' || p.stage === 'baby') return `${p.name} is too young to fight. Bosses can be fought from the child stage.`
  if (p.energy < 15) return `${p.name} is too tired to fight. Tuck it in or have a coffee.`
  return null
}

export function startBattle(p: Pet, boss: Boss, rnd: () => number): Battle {
  const petMax = 40 + level(p.xp) * 3 + Math.floor((p.skills.power + p.skills.wisdom + p.skills.speed) / 2)
  const weak = SKILLS[Math.floor(rnd() * 3)]!
  return { hp: boss.hp, maxHp: boss.hp, petHp: petMax, petMax, turn: 1, weak, log: [`The ${boss.name} appears! ${cap(TELLS[weak])}.`], over: null }
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function move(b: Battle, p: Pet, boss: Boss, skill: Skill, rnd: () => number): Battle {
  if (b.over) return b
  const stage = p.stage === 'ultimate' ? 1.5 : p.stage === 'adult' ? 1.25 : 1
  const crit = skill === b.weak
  const dmg = Math.round((4 + p.skills[skill] * 0.6 + rnd() * 4) * (crit ? 2 : 1) * stage)
  const hp = Math.max(0, b.hp - dmg)
  const log = [...b.log, `${p.name} ${MOVES[skill].verb} for ${dmg}${crit ? ' (super effective!)' : ''}.`]
  if (hp === 0) return { ...b, hp, log: [...log, `The ${boss.name} is defeated!`].slice(-6), over: 'won' }
  const evade = skill === 'speed' && rnd() < Math.min(0.4, p.skills.speed / 120)
  let hit = Math.round(boss.atk * (0.7 + rnd() * 0.6) * (skill === 'speed' ? 0.5 : 1))
  if (evade) hit = 0
  const petHp = Math.max(0, b.petHp - hit)
  log.push(evade ? `${p.name} evades the counterattack!` : `The ${boss.name} hits back for ${hit}.`)
  if (petHp === 0) return { ...b, hp, petHp, log: [...log, `${p.name} is knocked out…`].slice(-6), over: 'lost' }
  const weak = SKILLS[Math.floor(rnd() * 3)]!
  return { ...b, hp, petHp, turn: b.turn + 1, weak, log: [...log, `Turn ${b.turn + 1}: ${TELLS[weak]}.`].slice(-6), over: null }
}

export function skillOf(word: string): Skill | null {
  const w = word.toLowerCase()
  if (w === 'strike' || w === 'power') return 'power'
  if (w === 'outsmart' || w === 'wisdom') return 'wisdom'
  if (w === 'dodge' || w === 'speed') return 'speed'
  return null
}

