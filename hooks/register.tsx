import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, Timer } from 'claude-code'

import { talkLine } from './lines'
import {
  BADGES, DECOR, HATS, ITEMS, LINE_NAMES, PERSONALITIES, RETIRE_AFTER, SKILL_NAMES, canRetire,
  age, alerts, applyAll, face, formName, hatch, isAsleep, isSick, level, normalize, xpFor,
  type Decor, type Event, type Hat, type Item, type Pet, type Skill,
} from './pet'
import { MOVES, canFight, move, skillOf, startBattle, type Battle } from './boss'
import { card, dnaCode, pngBase64 } from './card'
import { describe, extOf } from './dna'
import { compose, habitat, sceneSvg, type Scene } from './habitat'
import { FRAME_MS, cells, cropAll, framesSvg, petFrames } from './render'

const PANE = 'monster'
const FLUSH_MS = 5000
const TABS = ['home', 'items', 'games', 'shop', 'style', 'badges'] as const
type Tab = (typeof TABS)[number]

const petAtom = atom({ plugin: 'monster', key: 'pet' } as const, null)
const hiddenAtom = atom({ plugin: 'monster', key: 'isHidden' } as const, false)
const tabAtom = atom({ plugin: 'monster', key: 'tab' } as const, 'home')
const huntAtom = atom({ plugin: 'monster', key: 'hunt' } as const, null)
const battleAtom = atom({ plugin: 'monster', key: 'battle' } as const, null)
let lastMoveAt = 0

// ── The shared pet lives in one file every session reads and writes; each session queues
// what happened and folds it in on a short timer.
let file = ''
let pending: Event[] = []
const todoDone = new Map<string, number>()

function bar(n: number, width = 8) {
  const k = Math.round((Math.max(0, Math.min(100, n)) / 100) * width)
  return '█'.repeat(k) + '░'.repeat(width - k)
}

function xpPct(p: Pet) {
  const lv = level(p.xp)
  return ((p.xp - xpFor(lv)) / (xpFor(lv + 1) - xpFor(lv))) * 100
}

async function load($: EngineInterface): Promise<Pet> {
  try {
    if (file && (await $.fs.exists(file))) return normalize(JSON.parse(await $.fs.read(file)) as Partial<Pet>)
  } catch {}
  const kept = (await $.store.get('pet')) as Partial<Pet> | undefined
  if (kept) return normalize(kept)
  const now = await $.clock.now()
  return hatch(now, 'Byte', PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)]!)
}

async function flush($: EngineInterface) {
  const events = pending
  pending = []
  const now = await $.clock.now()
  const before = await load($)
  const raised = alerts(applyAll(before, events, now))
  const pet = raised.pet
  try {
    if (file) await $.fs.write(file, JSON.stringify(pet))
    else await $.store.set('pet', pet)
  } catch {}
  // Announce what this session's events earned.
  for (const id of pet.badges.filter(b => !before.badges.includes(b))) {
    const b = BADGES.find(x => x.id === id)
    if (b) $.ui.toast(`🏅 ${pet.name} earned “${b.name}”${b.hat ? ` · new hat: ${HATS[b.hat]}` : ''}`)
  }
  if (pet.stage !== before.stage) $.ui.toast(`✨ ${pet.name} evolved into ${formName(pet)}!`)
  for (const text of raised.fire) $.ui.toast(`⚠ ${text}`)
  if (pet.stage !== before.stage) void sound($, pet, 'evolve')
  else if (pet.badges.length > before.badges.length) void sound($, pet, 'badge')
  else if (raised.fire.length) void sound($, pet, 'alert')
  await update($, petAtom, () => pet)
}

async function sound($: EngineInterface, p: Pet, name: 'evolve' | 'badge' | 'win' | 'alert') {
  if (!p.settings.sound) return
  try {
    await $.audio.play({ asset: `sounds/${name}.wav` }, { gain: 0.5 })
  } catch {}
}

// ── The treat hunt, played from the pane's buttons or typed as /pet hunt.
const BUSHES = ['left', 'middle', 'right'] as const

async function huntStart($: EngineInterface): Promise<string> {
  const p = await read($, petAtom)
  const wait = (p?.cooldowns.game ?? 0) - Date.now()
  if (wait > 0) return `${p?.name ?? 'Your monster'} is resting. Try again in ${since(wait)}.`
  if (p && p.energy < 10) return `${p.name} is too tired to play. Tuck it in or give it a coffee.`
  await update($, huntAtom, () => ({ round: 1, score: 0, treat: Math.floor(Math.random() * 3), picked: null }))
  return `${p?.name ?? 'It'} hid a cookie. Round 1/3: left, middle or right? (/pet hunt <bush>)`
}

async function huntPick($: EngineInterface, b: number, advance: boolean): Promise<string> {
  const h = await read($, huntAtom)
  if (!h) return 'No hunt running. Start one with /pet hunt.'
  if (h.picked !== null) return advance ? huntNext($) : 'Already picked. Press Next round.'
  const found = b === h.treat
  const next = { ...h, picked: b, score: h.score + (found ? 1 : 0) }
  await update($, huntAtom, () => next)
  const said = found ? `Found it under the ${BUSHES[b]} bush!` : `Not there… it was under the ${BUSHES[h.treat]} bush.`
  return advance ? `${said} ${await huntNext($)}` : said
}

async function huntNext($: EngineInterface): Promise<string> {
  const h = await read($, huntAtom)
  if (!h) return ''
  if (h.round < 3) {
    await update($, huntAtom, () => ({ round: h.round + 1, score: h.score, treat: Math.floor(Math.random() * 3), picked: null }))
    return `Round ${h.round + 1}/3: left, middle or right?`
  }
  const won = h.score >= 2
  const prize = won ? PRIZES[Math.floor(Math.random() * PRIZES.length)] : undefined
  await update($, huntAtom, () => null)
  await act($, { kind: 'game', won, prize, at: Date.now() })
  const p = await read($, petAtom)
  if (won && p) void sound($, p, 'win')
  return won ? `Won ${h.score}/3! Prize: ${prize ? ITEMS[prize].icon + ' ' + ITEMS[prize].name : 'none'}.` : `Found ${h.score}/3. Better luck next time!`
}

// ── The weekly Bug Boss, fought from the pane or typed as /pet boss <move>.
async function bossStart($: EngineInterface): Promise<string> {
  const p = await load($)
  const why = canFight(p)
  if (why || !p.boss) return why ?? 'No boss yet.'
  const b = startBattle(p, p.boss, Math.random)
  await update($, battleAtom, () => b)
  return `${b.log.at(-1)} Your move: /pet boss strike, outsmart or dodge. ${p.name} ${b.petHp} HP · boss ${b.hp} HP.`
}

async function bossMove($: EngineInterface, skill: Skill): Promise<string> {
  const b = await read($, battleAtom)
  const p = await load($)
  if (!b || b.over) return 'No fight running. Start one with /pet boss.'
  if (!p.boss) return 'The boss has gone.'
  const next: Battle = move(b, p, p.boss, skill, Math.random)
  lastMoveAt = Date.now()
  await update($, battleAtom, () => next)
  const turn = next.log.slice(b.log.length > 0 ? -3 : 0).join(' ')
  if (next.over) {
    await act($, { kind: 'boss', won: next.over === 'won', at: Date.now() })
    const q = await read($, petAtom)
    if (next.over === 'won' && q) void sound($, q, 'win')
    return `${turn} ${next.over === 'won' ? 'Victory! +3 💎, +30 xp.' : 'Defeated… rest up and try again.'}`
  }
  return `${turn} ${p.name} ${next.petHp}/${next.petMax} HP · boss ${next.hp}/${next.maxHp} HP.`
}

async function buy($: EngineInterface, d: Decor): Promise<string> {
  const p = await load($)
  if (p.decor.includes(d)) return `You already have the ${DECOR[d].name.toLowerCase()}.`
  if (p.items.gem < DECOR[d].cost) return `The ${DECOR[d].name.toLowerCase()} costs ${DECOR[d].cost} 💎; you have ${p.items.gem}.`
  await act($, { kind: 'buy', decor: d, at: Date.now() })
  return `Bought the ${DECOR[d].name.toLowerCase()}! It's in the habitat now.`
}

async function retireNow($: EngineInterface): Promise<string> {
  const p = await load($)
  const now = Date.now()
  if (!canRetire(p, now)) {
    if (p.stage !== 'ultimate') return `${p.name} can retire after 30 days as an ultimate.`
    return `${p.name} can retire in ${Math.ceil(((p.ultimateAt ?? now) + RETIRE_AFTER - now) / 86400000)} days.`
  }
  await act($, { kind: 'retire', at: now })
  return `${p.name} retired to the Hall of Fame. A new egg appeared, keeping your badges, hats, items and decorations.`
}

const WEATHER_ICON = { clear: '☀', cloudy: '☁', rain: '🌧', snow: '❄', petals: '🌸', leaves: '🍂' } as const
const HOLIDAY_NAME: Record<string, string> = { birthday: '🎂 birthday!', halloween: '🎃 Halloween', christmas: '🎄 Christmas', newyear: '🎆 New Year' }

/** Draws the card and saves it as a PNG beside the pet's file, then opens it. */
async function makeCard($: EngineInterface): Promise<string> {
  const p = await load($)
  const dir = file ? file.replace(/\/pet\.json$/, '') : ''
  if (!dir) return `Your card's DNA code: ${dnaCode(p)}`
  const b64 = `${dir}/card.b64`
  const png = `${dir}/card.png`
  await $.fs.write(b64, pngBase64(card(p, Date.now()), 3))
  const decoders = [
    ['base64', '-D', '-i', b64, '-o', png],
    ['python3', '-c', 'import base64,sys;open(sys.argv[2],"wb").write(base64.b64decode(open(sys.argv[1]).read()))', b64, png],
  ]
  let saved = false
  for (const argv of decoders) {
    try {
      if ((await $.process.run(argv)).exitCode === 0) {
        saved = true
        break
      }
    } catch {}
  }
  if (!saved) return `Couldn't write the PNG. Your DNA code: ${dnaCode(p)}`
  try {
    await $.process.run(['open', png])
  } catch {}
  return `Card saved to ${png} · DNA ${dnaCode(p)}`
}

/** A number from who you are: a hash of your git email (or your home folder). The email is never stored. */
async function seed($: EngineInterface, home: string | undefined) {
  let id = ''
  try {
    const r = await $.process.run(['git', 'config', '--global', 'user.email'])
    if (r.exitCode === 0) id = r.stdout.trim().toLowerCase()
  } catch {}
  if (!id) id = home ?? 'monster'
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  queue({ kind: 'seed', value: h >>> 0, at: Date.now() })
}

/** What a typed /pet command did, told plainly. */
function reply(verb: string, arg: string, before: Pet | null, after: Pet, now: number): string | undefined {
  const name = after.name
  switch (verb) {
    case 'feed':
      if (before && (before.cooldowns.feed ?? 0) > now) return `${name} is still full. Feed again in ${since((before.cooldowns.feed ?? 0) - now)}, or use a cookie.`
      return `You fed ${name}. Food ${Math.round(after.hunger)}%.`
    case 'play':
      if (before && (before.cooldowns.play ?? 0) > now) return `${name} is tired of playing. Again in ${since((before.cooldowns.play ?? 0) - now)}.`
      if (before && before.energy < 10) return `${name} is too tired to play.`
      return `You played with ${name}. Joy ${Math.round(after.joy)}%.`
    case 'clean':
      return before && before.mess === 0 ? 'Nothing to clean yet. Messes appear after every third meal.' : `All clean! ${name} is happier.`
    case 'tuck':
      return `${name} is tucked in for two hours. Good night!`
    case 'talk':
      return after.said ? `“${after.said.text}”` : undefined
    case 'use': {
      if (!(arg in ITEMS)) return `Use what? ${Object.keys(ITEMS).join(', ')}.`
      const item = arg as Item
      if (before && before.items[item] <= 0) return `No ${ITEMS[item].name.toLowerCase()}s left. ${ITEMS[item].what}`
      return `${name} had a ${ITEMS[item].name.toLowerCase()} ${ITEMS[item].icon}. ${after.items[item]} left.`
    }
    case 'train': {
      if (!(arg in SKILL_NAMES)) return 'Train what? power, wisdom or speed.'
      const skill = arg as Skill
      if (before && (before.cooldowns.train ?? 0) > now) return `${name} is resting. Train again in ${since((before.cooldowns.train ?? 0) - now)}.`
      if (before && after.skills[skill] === before.skills[skill]) return `${name} is too tired or hungry to train.`
      return `${name} trained ${SKILL_NAMES[skill]}: now ${after.skills[skill]}.`
    }
    case 'hat':
      if (!arg || arg === 'none') return `${name} took its hat off.`
      if (!after.hats.includes(arg as Hat)) return `${name} hasn't unlocked that. Unlocked: ${after.hats.length ? after.hats.join(', ') : 'none yet'}.`
      return `${name} is wearing the ${HATS[arg as Hat].toLowerCase()}.`
    case 'sound':
    case 'alerts':
      return `${verb === 'sound' ? 'Sounds' : 'Alerts'} ${after.settings[verb] ? 'on' : 'off'}.`
  }
  return undefined
}

function queue(e: Event) {
  pending.push(e)
  if (pending.length > 500) pending.splice(0, pending.length - 500)
}

async function act($: EngineInterface, e: Event) {
  queue(e)
  await flush($)
}

function title(p: Pet) {
  const line = p.line && p.stage === 'child' ? `${LINE_NAMES[p.line]} ` : ''
  return `${p.name} · Lv ${level(p.xp)} ${line}${formName(p)}`
}

function said(p: Pet, now: number) {
  return p.said && now - p.said.at < 60_000 ? p.said.text : undefined
}

function status(p: Pet, now: number) {
  const words = said(p, now)
  if (words && now - p.said!.at < 15_000) return `“${words}”`
  const last = p.log.at(-1)
  if (last && now - last.at < 15000) return last.text
  switch (face(p, now)) {
    case 'sleep': return (p.asleepUntil ?? 0) > now ? 'zzz… tucked in' : 'zzz… (sleeping while you are away)'
    case 'sick': return 'feeling sick from all the errors'
    case 'hungry': return 'hungry… give Claude some work, or feed it'
    case 'sleepy': return 'sleepy… a coffee would help'
    case 'sad': return 'a bit lonely'
    case 'wave': return 'waves at the new agent 👋'
    case 'sweat': return 'working hard…'
    case 'cheer': return '♪'
    case 'ouch': return 'ouch!'
    case 'eat': return 'nom nom'
    default:
      if (p.mess >= 2) return 'it’s getting messy in here'
      return `${age(p, now)} old · ${p.streak.days > 1 ? `🔥 ${p.streak.days}-day streak · ` : ''}${Math.round(p.stats.tokens / 1000)}k tokens eaten`
  }
}

function since(ms: number) {
  const m = Math.ceil(ms / 60_000)
  return m >= 60 ? `${Math.ceil(m / 60)}h` : `${m}m`
}

const PRIZES: Item[] = ['cookie', 'cookie', 'cookie', 'coffee', 'coffee', 'gem']

async function petCommand($: EngineInterface, args: string): Promise<{ text: string }> {
  const [verb = '', ...rest] = args.trim().split(/\s+/)
  const arg = rest.join(' ').toLowerCase()
  const now = await $.clock.now()
  const before = await load($)
  if (verb === 'boss') {
    if (!arg) return { text: await bossStart($) }
    const skill = skillOf(arg)
    return { text: skill ? await bossMove($, skill) : 'Use strike, outsmart or dodge.' }
  }
  if (verb === 'buy') {
    const d = (Object.keys(DECOR) as Decor[]).find(k => k === arg || DECOR[k].name.toLowerCase().startsWith(arg))
    return { text: d ? await buy($, d) : `Buy what? ${(Object.keys(DECOR) as Decor[]).map(k => `${k} (${DECOR[k].cost}💎)`).join(', ')}` }
  }
  if (verb === 'retire') return { text: await retireNow($) }
  if (verb === 'card') return { text: await makeCard($) }
  if (verb === 'hunt') {
    const b = BUSHES.indexOf(arg as (typeof BUSHES)[number])
    const text = !arg ? await huntStart($) : b < 0 ? 'Pick left, middle or right.' : await huntPick($, b, true)
    return { text }
  }
  switch (verb) {
    case 'feed': queue({ kind: 'feed', at: now }); break
    case 'play': queue({ kind: 'play', at: now }); break
    case 'clean': queue({ kind: 'clean', at: now }); break
    case 'tuck': queue({ kind: 'tuck', at: now }); break
    case 'talk': if (before) queue({ kind: 'talk', text: talkLine(before, now), at: now }); break
    case 'use': if (arg in ITEMS) queue({ kind: 'use', item: arg as Item, at: now }); break
    case 'train': if (arg in SKILL_NAMES) queue({ kind: 'train', skill: arg as Skill, at: now }); break
    case 'hat': queue({ kind: 'equip', hat: arg === 'none' || !arg ? null : (arg as Hat), at: now }); break
    case 'name': if (arg) queue({ kind: 'rename', name: rest.join(' ').slice(0, 24), at: now }); break
    case 'sound':
    case 'alerts': queue({ kind: 'setting', key: verb, on: arg !== 'off', at: now }); break
    case 'hide':
    case 'show': await update($, hiddenAtom, () => verb === 'hide'); break
  }
  await flush($)
  const p = await read($, petAtom)
  if (!verb) await $.ui.open({ id: PANE, title: p ? p.name : 'Monster', rows: 40 })
  if (!p) return { text: 'Your monster is on its way.' }
  return { text: `${title(p)} — ${reply(verb, arg, before, p, now) ?? status(p, now)}` }
}

export const register: Register = on => {
  let ticker: Timer | undefined
  let animator: Timer | undefined
  let frame = 0
  let bandFrames: string[] = []
  let paneScene: Scene | null = null
  const started = Date.now()
  let bandId = ''

  on('session.start', async ($, e, next) => {
    const home = await $.env.get('HOME')
    file = home ? `${home}/.claude/monster/pet.json` : ''
    await $.command.register({
      name: 'pet',
      description: 'See and care for your monster',
      argumentHint: '[card|feed|play|talk|clean|tuck|hunt [bush]|boss [move]|buy <decor>|retire|use <item>|train <skill>|hat <hat>|name <name>|sound on|off|alerts on|off|hide|show]',
    })
    void seed($, home)
    ticker?.cancel()
    ticker = $.clock.every(FLUSH_MS, () => void flush($))
    // Animate the terminal drawings: swap their frames in place.
    animator?.cancel()
    animator = $.clock.every(FRAME_MS, () => {
      frame++
      const b = bandFrames[frame % Math.max(1, bandFrames.length)]
      if (b && bandId) void $.ui.blit({ requestId: bandId, key: 'pet', cells: b })
      if (paneScene) void $.ui.blit({ requestId: PANE, key: 'habitat', cells: cells(compose(paneScene, Date.now() - started)).cells })
    })
    void flush($)
    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    try {
      return await petCommand($, e.args)
    } catch (err) {
      return { text: `DEBUG ${String(err)} ${(err as Error).stack ?? ''}`.slice(0, 600) }
    }
  })

  // ── What it eats and learns from.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const u = r.usage
    if (u) queue({ kind: 'tokens', n: u.input_tokens + u.output_tokens + u.cache_creation_input_tokens, at: Date.now() })
    return r
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.agentId) queue({ kind: 'agent', at: Date.now() })
    return r
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const started = Date.now()
    let r: Awaited<ReturnType<typeof next>> | undefined
    try {
      r = await next(e)
      return r
    } finally {
      const input = e as unknown as Record<string, unknown>
      const tool = String(e.tool)
      const failed = !r || r.isError === true || r.deny !== undefined
      const command = typeof input.command === 'string' ? input.command : undefined
      const path = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
      queue({ kind: 'tool', tool, command, failed, ms: Date.now() - started, ext: extOf(path), at: Date.now() })
      if (tool === 'TodoWrite' && r && 'result' in r) {
        const todos = ((r.result ?? {}) as { newTodos?: { status: string }[] }).newTodos ?? []
        const done = todos.filter(t => t.status === 'completed').length
        const key = e.agentId ?? 'main'
        const before = todoDone.get(key) ?? 0
        if (done > before) queue({ kind: 'task', n: done - before, at: Date.now() })
        todoDone.set(key, done)
      }
      if (tool === 'TaskUpdate' && !failed && input.status === 'completed') queue({ kind: 'task', n: 1, at: Date.now() })
    }
  }).catch(($, e, next) => next(e))

  // ── The band above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await read($, petAtom)
    if (e.props.hasSurvey || !p || (await read($, hiddenAtom))) {
      bandFrames = []
      return next(e)
    }
    const now = await $.clock.now()
    const frames = cropAll(petFrames(p, now))
    const { Box, Button, Text } = $.ui.resolve(e)
    const info = (
      <Box flexDirection="column">
        <Text color="#FFCD75" bold>{title(p)}{p.streak.days > 1 ? ` · 🔥${p.streak.days}` : ''}</Text>
        <Text>
          <Text color="#EF7D57">food {bar(p.hunger)}</Text> <Text color="#A7F070">joy {bar(p.joy)}</Text>{' '}
          <Text color="#FFCD75">nrg {bar(p.energy, 5)}</Text> <Text color="#73EFF7">xp {bar(xpPct(p))}</Text>
          {isSick(p) && <Text color="#E24B4A"> sick</Text>}
        </Text>
        <Box flexDirection="row" gap={1}>
          <Button key="band-pat" label="♥" plain onPress={() => act($, { kind: 'pet', at: Date.now() })} />
          <Button key="band-talk" label="💬" plain onPress={async () => {
            const q = await read($, petAtom)
            if (q) await act($, { kind: 'talk', text: talkLine(q, Date.now()), at: Date.now() })
          }} />
          <Text dimColor>{status(p, now)}</Text>
        </Box>
      </Box>
    )
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      bandFrames = frames.map(f => cells(f).cells)
      bandId = e.requestId
      const first = cells(frames[0]!)
      return (
        <Box flexDirection="row" gap={1}>
          <Raster key="pet" columns={first.columns} rows={first.rows} cells={first.cells} />
          {info}
        </Box>
      )
    }
    if (e.surface === 'desktop') {
      const { Svg } = $.ui.resolve(e)
      return (
        <Box flexDirection="row" gap={2} alignItems="center">
          <Svg source={framesSvg(frames, 3)} alt={`${p.name}, your monster`} />
          {info}
        </Box>
      )
    }
    return <Box>{info}</Box>
  })

  // ── The /pet pane.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const p = await read($, petAtom)
    const { Box, Button, Text } = $.ui.resolve(e)
    if (!p) return <Text dimColor>Your monster is on its way…</Text>
    const now = await $.clock.now()
    const tab = (await read($, tabAtom)) as Tab
    const hunt = await read($, huntAtom)
    let preview: RenderElement | null = null
    if (e.surface === 'desktop' && tab === 'style') {
      const { Svg } = $.ui.resolve(e)
      preview = <Svg source={framesSvg([card(p, now)], 2)} alt={`${p.name}'s card`} />
    }
    const battle = await read($, battleAtom)
    const fighting = battle && p.boss && tab === 'games' ? { kind: p.boss.kind, hit: !battle.over && now - lastMoveAt < 1200 } : null
    const scene = habitat(p, now, new Date(now).getHours(), { hunt: tab === 'games' && !battle ? hunt : null, boss: fighting })
    const lv = level(p.xp)

    const header = (
      <Box flexDirection="column">
        <Text color="#FFCD75" bold>
          {title(p)} · {p.personality} · {age(p, now)} old{p.streak.days > 1 ? ` · 🔥 ${p.streak.days}-day streak` : ''}
          {isAsleep(p, now) ? ' · asleep' : ''}{isSick(p) ? ' · sick' : ''}
        </Text>
        <Text>
          <Text color="#EF7D57">food {bar(p.hunger, 10)}</Text>  <Text color="#A7F070">joy {bar(p.joy, 10)}</Text>  <Text color="#FFCD75">energy {bar(p.energy, 10)}</Text>  <Text color="#E24B4A">stress {bar(p.stress, 10)}</Text>
        </Text>
        <Text color="#73EFF7">xp {bar(xpPct(p), 20)} {Math.floor(p.xp)}/{xpFor(lv + 1)} → Lv {lv + 1}</Text>
        <Text dimColor>
          {WEATHER_ICON[scene.weather]} {scene.season} · {scene.weather}{scene.holiday ? ` · ${HOLIDAY_NAME[scene.holiday]}` : ''}{p.generation > 1 ? ` · generation ${p.generation}` : ''}
        </Text>
        {said(p, now) && <Text color="#F4F4F4">💬 “{said(p, now)}”</Text>}
      </Box>
    )

    const tabs = (
      <Box flexDirection="row" gap={1}>
        {TABS.map(t => (
          <Button
            key={`tab-${t}`}
            label={t === 'items' ? `Items ${Object.values(p.items).reduce((a, b) => a + b, 0)}` : t === 'shop' ? `Shop 💎${p.items.gem}` : t === 'badges' ? `Badges ${p.badges.length}/${BADGES.length}` : t[0]!.toUpperCase() + t.slice(1)}
            variant={t === tab ? 'primary' : 'secondary'}
            onPress={() => update($, tabAtom, () => t)}
          />
        ))}
      </Box>
    )

    const body = await (async () => {
      if (tab === 'items') {
        return (
          <Box flexDirection="column">
            {(Object.keys(ITEMS) as Item[]).map(item => (
              <Box key={`it-${item}`} flexDirection="row" gap={1}>
                <Button key={`use-${item}`} label={p.items[item] > 0 ? `Use ${ITEMS[item].name}` : `${ITEMS[item].name}: none`} onPress={() => act($, { kind: 'use', item, at: Date.now() })} />
                <Text>
                  {ITEMS[item].icon} ×{p.items[item]}  <Text dimColor>{ITEMS[item].what}</Text>
                </Text>
              </Box>
            ))}
          </Box>
        )
      }
      if (tab === 'games') {
        const wait = (p.cooldowns.game ?? 0) - now
        const huntRow = !hunt ? (
          <Box flexDirection="row" gap={1}>
            <Button
              key="hunt-start"
              label={wait > 0 ? `Treat hunt (rest ${since(wait)})` : 'Start treat hunt'}
              hotkey="t"
              onPress={async () => {
                await huntStart($)
              }}
            />
            <Text dimColor>{p.name} hides a cookie in one of three bushes. Find it in 2 of 3 rounds to win a prize.</Text>
          </Box>
        ) : hunt.picked === null ? (
          <Box flexDirection="row" gap={1}>
            <Text>Round {hunt.round}/3 · found {hunt.score} · which bush?</Text>
            {(['Left', 'Middle', 'Right'] as const).map((label, b) => (
              <Button key={`bush-${b}`} label={label} hotkey={String(b + 1)} onPress={async () => { await huntPick($, b, false) }} />
            ))}
          </Box>
        ) : (
          <Box flexDirection="row" gap={1}>
            <Text color={hunt.picked === hunt.treat ? '#A7F070' : '#EF7D57'}>
              {hunt.picked === hunt.treat ? 'Found it!' : 'Not there…'} Round {hunt.round}/3 · found {hunt.score}
            </Text>
            <Button
              key="hunt-next"
              label={hunt.round < 3 ? 'Next round' : 'Finish'}
              variant="primary"
              hotkey="n"
              onPress={async () => {
                await huntNext($)
              }}
            />
          </Box>
        )
        const trainWait = (p.cooldowns.train ?? 0) - now
        const hpBar = (n: number, max: number) => bar((n / Math.max(1, max)) * 100, 12)
        const bossRow = !p.boss ? (
          <Text dimColor>No Bug Boss yet. One forms at the start of each week from the last week’s failures.</Text>
        ) : battle ? (
          <Box flexDirection="column">
            <Text>
              <Text color="#A7F070">{p.name} {hpBar(battle.petHp, battle.petMax)} {battle.petHp}</Text>  vs  <Text color="#E24B4A">{p.boss.name} {hpBar(battle.hp, battle.maxHp)} {battle.hp}</Text>
            </Text>
            {battle.log.slice(-3).map((l, i) => (
              <Text key={`bl-${i}`} color="#94B0C2">· {l}</Text>
            ))}
            {battle.over ? (
              <Button key="boss-done" label={battle.over === 'won' ? 'Victory! Done' : 'Retreat'} variant="primary" onPress={() => update($, battleAtom, () => null)} />
            ) : (
              <Box flexDirection="row" gap={1}>
                {(['power', 'wisdom', 'speed'] as const).map((sk, i) => (
                  <Button key={`mv-${sk}`} label={`${MOVES[sk].name} (${SKILL_NAMES[sk]} ${p.skills[sk]})`} hotkey={String(i + 1)} variant={battle.weak === sk ? 'primary' : 'secondary'} onPress={async () => { await bossMove($, sk) }} />
                ))}
              </Box>
            )}
          </Box>
        ) : (
          <Box flexDirection="row" gap={1}>
            <Button key="boss-fight" label={p.boss.beaten ? `${p.boss.name}: beaten ✓` : `Fight the ${p.boss.name}`} hotkey="b" onPress={async () => { await bossStart($) }} />
            <Text dimColor>
              {p.boss.beaten ? 'A new boss forms next week.' : (canFight(p) ?? `${p.boss.hp} HP · attack ${p.boss.atk} · built from last week’s failures · ${p.boss.tries} tries`)}
            </Text>
          </Box>
        )
        return (
          <Box flexDirection="column" gap={1}>
            <Text color="#FFCD75" bold>Weekly Bug Boss</Text>
            {bossRow}
            <Text color="#FFCD75" bold>Treat hunt</Text>
            {huntRow}
            <Text color="#FFCD75" bold>Training</Text>
            <Box flexDirection="row" gap={1}>
              {(Object.keys(SKILL_NAMES) as Skill[]).map(skill => (
                <Button key={`train-${skill}`} label={`Train ${SKILL_NAMES[skill]} (${p.skills[skill]})`} onPress={() => act($, { kind: 'train', skill, at: Date.now() })} />
              ))}
              <Text dimColor>{trainWait > 0 ? `resting ${since(trainWait)}` : 'costs food and energy'}{p.line ? ` · ${LINE_NAMES[p.line]}s learn ${p.line === 'forge' ? 'Power' : p.line === 'scribe' ? 'Wisdom' : p.line === 'wanderer' ? 'Speed' : 'everything'} faster` : ''}</Text>
            </Box>
            <Text dimColor>Treat hunts: {p.stats.wins} won of {p.stats.games} · trained {p.stats.trained} times</Text>
          </Box>
        )
      }
      if (tab === 'shop') {
        return (
          <Box flexDirection="column">
            <Text dimColor>Spend 💎 gems (from commits, pushes, streaks and Bug Bosses) on things for the habitat. You have {p.items.gem}.</Text>
            {(Object.keys(DECOR) as Decor[]).map(d => (
              <Box key={`shop-${d}`} flexDirection="row" gap={1}>
                <Button
                  key={`buy-${d}`}
                  label={p.decor.includes(d) ? `${DECOR[d].name} ✓` : `Buy ${DECOR[d].name} · ${DECOR[d].cost}💎`}
                  variant={p.decor.includes(d) ? 'secondary' : p.items.gem >= DECOR[d].cost ? 'primary' : 'secondary'}
                  onPress={async () => { await buy($, d) }}
                />
              </Box>
            ))}
          </Box>
        )
      }
      if (tab === 'style') {
        return (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
              <Text color="#FFCD75" bold>DNA{p.shiny ? ' ✦ shiny' : ''}</Text>
              {describe(p).map((line, i) => (
                <Text key={`dna-${i}`}>{line}</Text>
              ))}
              <Text dimColor>Only counts are kept: languages by file extension, active hours, commit sizes, test results, and a hash of your git email. No paths, code or messages.</Text>
            </Box>
            <Box flexDirection="column">
              <Text color="#FFCD75" bold>Card</Text>
              {preview}
              <Box flexDirection="row" gap={1}>
                <Button key="card" label="Save card as PNG" hotkey="k" onPress={async () => { $.ui.toast(await makeCard($)) }} />
                <Text dimColor>DNA {dnaCode(p)}</Text>
              </Box>
            </Box>
            <Text color="#FFCD75" bold>Hats</Text>
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Button key="hat-none" label="No hat" variant={p.hat === null ? 'primary' : 'secondary'} onPress={() => act($, { kind: 'equip', hat: null, at: Date.now() })} />
              {p.hats.map(h => (
                <Button key={`hat-${h}`} label={HATS[h]} variant={p.hat === h ? 'primary' : 'secondary'} onPress={() => act($, { kind: 'equip', hat: h, at: Date.now() })} />
              ))}
            </Box>
            {(Object.keys(HATS) as Hat[])
              .filter(h => !p.hats.includes(h))
              .map(h => {
                const b = BADGES.find(x => x.hat === h)
                return <Text key={`locked-${h}`} dimColor>🔒 {HATS[h]}: {b ? b.what.toLowerCase() : 'secret'}</Text>
              })}
          </Box>
        )
      }
      if (tab === 'badges') {
        const retireIn = p.stage === 'ultimate' && p.ultimateAt ? Math.ceil((p.ultimateAt + RETIRE_AFTER - now) / 86400000) : null
        return (
          <Box flexDirection="column">
            <Text color="#FFCD75" bold>Hall of Fame{p.hall.length ? '' : ': empty'}</Text>
            {p.hall.map((l, i) => (
              <Text key={`hof-${i}`} color="#FFCD75">👑 Gen {l.generation}: {l.name} the {l.form} · Lv {l.level} · {l.days} days</Text>
            ))}
            {canRetire(p, now) ? (
              <Button key="retire" label={`Retire ${p.name} to the Hall of Fame`} onPress={async () => { await retireNow($) }} />
            ) : (
              <Text dimColor>{retireIn !== null ? `${p.name} can retire in ${retireIn} days.` : 'An ultimate can retire after 30 days; the next egg keeps your treasures and a head start.'}</Text>
            )}
            <Text color="#FFCD75" bold>Badges</Text>
            {BADGES.map(b => (
              <Text key={`b-${b.id}`} color={p.badges.includes(b.id) ? '#FFCD75' : undefined} dimColor={!p.badges.includes(b.id)}>
                {p.badges.includes(b.id) ? '🏅' : '○ '} {b.name}: {b.what}{b.hat ? ` (unlocks ${HATS[b.hat].toLowerCase()})` : ''}
              </Text>
            ))}
          </Box>
        )
      }
      // Home.
      const tucked = (p.asleepUntil ?? 0) > now
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Button key="feed" label={(p.cooldowns.feed ?? 0) > now ? 'Feed (full)' : 'Feed'} hotkey="f" onPress={() => act($, { kind: 'feed', at: Date.now() })} />
            <Button key="play" label={(p.cooldowns.play ?? 0) > now ? 'Play (tired)' : 'Play'} hotkey="p" onPress={() => act($, { kind: 'play', at: Date.now() })} />
            <Button key="pat" label="Pat ♥" hotkey="h" onPress={() => act($, { kind: 'pet', at: Date.now() })} />
            <Button key="talk" label="Talk" hotkey="t" onPress={async () => {
              const q = await read($, petAtom)
              if (q) await act($, { kind: 'talk', text: talkLine(q, Date.now()), at: Date.now() })
            }} />
            {p.mess > 0 && <Button key="clean" label={`Clean (${p.mess})`} hotkey="c" onPress={() => act($, { kind: 'clean', at: Date.now() })} />}
            <Button key="tuck" label={tucked ? 'Sleeping…' : 'Tuck in'} hotkey="z" onPress={() => act($, { kind: 'tuck', at: Date.now() })} />
            <Button key="band" label={(await read($, hiddenAtom)) ? 'Show band' : 'Hide band'} onPress={() => update($, hiddenAtom, h => !h)} />
            <Button key="sound" label={p.settings.sound ? 'Sound: on' : 'Sound: off'} onPress={() => act($, { kind: 'setting', key: 'sound', on: !p.settings.sound, at: Date.now() })} />
            <Button key="alerts" label={p.settings.alerts ? 'Alerts: on' : 'Alerts: off'} onPress={() => act($, { kind: 'setting', key: 'alerts', on: !p.settings.alerts, at: Date.now() })} />
          </Box>
          <Box flexDirection="column">
            {p.log.slice(-5).reverse().map((l, i) => (
              <Text key={`log-${i}`} color="#94B0C2">· {l.text}</Text>
            ))}
          </Box>
        </Box>
      )
    })()

    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      paneScene = scene
      const first = cells(compose(scene, Date.now() - started))
      return (
        <Box flexDirection="column" gap={1}>
          <Raster key="habitat" columns={first.columns} rows={first.rows} cells={first.cells} />
          {header}
          {tabs}
          {body}
        </Box>
      )
    }
    if (e.surface === 'desktop') {
      const { Svg } = $.ui.resolve(e)
      return (
        <Box flexDirection="column" gap={1}>
          <Svg source={sceneSvg(scene, 7)} alt={`${p.name} in its habitat`} />
          {header}
          {tabs}
          {body}
        </Box>
      )
    }
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {tabs}
        {body}
      </Box>
    )
  })

  on('ui.close', { id: PANE }, ($, e, next) => {
    paneScene = null
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    ticker?.cancel()
    animator?.cancel()
    await flush($)
    return next(e)
  }).catch(($, e, next) => next(e))
}
