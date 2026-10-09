// What the monster says when you talk to it: picked from its needs, the hour, recent work,
// its line and its personality. Offline and canned: no model calls.

import { FORM_NAMES, ITEMS, LINE_NAMES, isAsleep, isSick, level, xpFor, type Item, type Pet } from './pet'

type Pool = string[]

const NEEDS = {
  hungry: ['My tummy is rumbling… got any tokens?', 'Food? Food. Food!', 'I could eat a whole diff right now.', 'Feed me and I’ll debug anything.'],
  sleepy: ['*yawn* Can we take a nap?', 'My eyes keep closing…', 'A coffee would really help right now.', 'Five more minutes…'],
  sick: ['I don’t feel so good… too many red errors.', 'Can we try green tests for a while?', 'My head is full of stack traces.'],
  messy: ['Um… it’s a bit messy in here.', 'Could you clean up? I stepped in something.', 'The habitat needs a tidy-up!'],
  sad: ['I missed you.', 'It’s been quiet. Want to play?', 'Pat me? Just once?'],
}

const HOURS: [number, number, Pool][] = [
  [5, 11, ['Good morning! Fresh day, fresh bugs.', 'Morning! What are we building today?', 'Coffee first, then commits.']],
  [11, 17, ['Afternoon push! You’ve got this.', 'Halfway through the day already?', 'Lunch break for me too?']],
  [17, 22, ['Evening coding is the best coding.', 'The sky is so orange right now.', 'One more feature, then rest?']],
  [22, 29, ['It’s late… don’t forget to sleep.', 'The stars are out. So are the bugs.', 'Night owl mode activated.']],
]

const CHEERS: Pool = [
  'I believe in you!', 'Every bug you fix makes me stronger.', 'Let’s ship something great today.',
  'You type so fast!', 'I like it when the tests turn green.', 'We make a good team.',
]

const QUIPS: Pool = [
  'Did you know? Rubber ducks are great listeners. So am I.', 'It works on my machine. I live on your machine!',
  'A commit a day keeps the merge conflicts away.', 'Naming things is hard. You named me well, though.',
  'I dreamt about semicolons.', 'Have you tried turning it off and on again?', 'Small PRs are tasty PRs.',
  'Off-by-one errors are my natural enemy.', 'I read the logs so you don’t have to. Mostly.',
  'Today’s forecast: 100% chance of refactoring.', 'Caches are just memories with an expiry date.',
]

const LINE_TALK: Record<string, Pool> = {
  forge: ['Let’s run something loud in the shell!', 'I love the smell of a fresh build.', 'Pipes! Greps! Fire!'],
  scribe: ['I read every line you edit.', 'Good code reads like a story.', 'Let me float over that file with you.'],
  summoner: ['More agents! More friends!', 'I can hear the subagents humming.', 'Delegate, delegate, delegate.'],
  wanderer: ['What’s out there on the web today?', 'I flew past three docs pages this morning.', 'Let’s go look something up!'],
}

const FLAVOR: Record<Pet['personality'], (s: string) => string> = {
  cheerful: s => (s.endsWith('!') || s.endsWith('?') ? s : s.replace(/\.$/, '') + '!'),
  lazy: s => `*yawn* ${s.charAt(0).toLowerCase()}${s.slice(1)}`,
  curious: s => (s.endsWith('?') ? s : `${s} …what are you working on?`),
  grumpy: s => `Hmph. ${s}`,
}

function pick<T>(pool: readonly T[], rnd: () => number): T {
  return pool[Math.floor(rnd() * pool.length) % pool.length]!
}

export function talkLine(p: Pet, now: number, rnd: () => number = Math.random): string {
  if (p.stage === 'egg') return pick(['*wobble*', '*tap tap*', '…(something stirs inside)', '*the egg feels warm*'], rnd)
  if (isAsleep(p, now) && (p.asleepUntil ?? 0) > now) return pick(['Zzz…', '*snore*', 'mmh… five more minutes…'], rnd)
  if (isSick(p)) return pick(NEEDS.sick, rnd)
  if (p.hunger < 25) return FLAVOR[p.personality](pick(NEEDS.hungry, rnd))
  if (p.energy < 20) return pick(NEEDS.sleepy, rnd)
  if (p.mess >= 2) return pick(NEEDS.messy, rnd)
  if (p.joy < 30) return pick(NEEDS.sad, rnd)

  const options: string[] = []
  const hour = new Date(now).getHours()
  const h = hour < 5 ? hour + 24 : hour
  for (const [from, to, pool] of HOURS) if (h >= from && h < to) options.push(pick(pool, rnd))
  if (p.streak.days >= 2) options.push(`Day ${p.streak.days} in a row together!`)
  const lv = level(p.xp)
  const toNext = Math.ceil(xpFor(lv + 1) - p.xp)
  if (toNext <= 15) options.push(`Only ${toNext} xp until level ${lv + 1}!`)
  if (p.line) options.push(pick(LINE_TALK[p.line]!, rnd))
  if (p.stage === 'child' && p.line) {
    const v = p.care.n && p.care.sum / p.care.n >= 55 ? 'bright' : 'shadow'
    options.push(`When I grow up I want to be ${FORM_NAMES[p.line][v][0]}!`)
  }
  const stash = (Object.keys(p.items) as Item[]).filter(i => p.items[i] > 0)
  if (stash.length) {
    const i = pick(stash, rnd)
    options.push(`We have ${p.items[i]} ${ITEMS[i].name.toLowerCase()}${p.items[i] === 1 ? '' : 's'} saved up ${ITEMS[i].icon}`)
  }
  if (p.stats.tests > 0) options.push(`You’ve passed ${p.stats.tests} test run${p.stats.tests === 1 ? '' : 's'} with me.`)
  if (p.line) options.push(`I’m a ${LINE_NAMES[p.line]}. It suits us, right?`)
  options.push(pick(CHEERS, rnd), pick(QUIPS, rnd), pick(QUIPS, rnd))
  return FLAVOR[p.personality](pick(options, rnd))
}
