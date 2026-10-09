import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { LINE_NAMES, age, applyAll, face, hatch, isAsleep, isSick, level, xpFor, type Event, type Pet } from './pet'
import { FRAME_MS, cells, cropAll, framesSvg, habitatFrames, petFrames } from './render'

const PANE = 'monster'
const FLUSH_MS = 5000

const petAtom = atom({ plugin: 'monster', key: 'pet' } as const, null)
const hiddenAtom = atom({ plugin: 'monster', key: 'isHidden' } as const, false)

// ── The shared pet lives in one file every session reads and writes; each session queues
// what happened and folds it in on a short timer.
let file = ''
let pending: Event[] = []
const todoDone = new Map<string, number>()

function bar(n: number, width = 8) {
  const k = Math.round((Math.max(0, Math.min(100, n)) / 100) * width)
  return '█'.repeat(k) + '░'.repeat(width - k)
}

async function load($: EngineInterface): Promise<Pet> {
  try {
    if (file && (await $.fs.exists(file))) return JSON.parse(await $.fs.read(file)) as Pet
  } catch {}
  const kept = (await $.store.get('pet')) as Pet | undefined
  return kept ?? hatch(await $.clock.now())
}

async function flush($: EngineInterface) {
  const events = pending
  pending = []
  const now = await $.clock.now()
  const pet = applyAll(await load($), events, now)
  try {
    if (file) await $.fs.write(file, JSON.stringify(pet))
    else await $.store.set('pet', pet)
  } catch {}
  await update($, petAtom, () => pet)
}

function queue(e: Event) {
  pending.push(e)
  if (pending.length > 500) pending.splice(0, pending.length - 500)
}

function title(p: Pet) {
  const line = p.line ? `${LINE_NAMES[p.line]} ` : ''
  return `${p.name} · Lv ${level(p.xp)} ${line}${p.stage}`
}

function status(p: Pet, now: number) {
  const f = face(p, now)
  const last = p.log.at(-1)
  if (last && now - last.at < 15000) return last.text
  switch (f) {
    case 'sleep': return 'zzz… (sleeping while you are away)'
    case 'sick': return 'feeling sick from all the errors'
    case 'hungry': return 'hungry… give Claude some work, or feed it'
    case 'sad': return 'a bit lonely'
    case 'cheer': return '♪'
    case 'ouch': return 'ouch!'
    case 'eat': return 'nom nom'
    default: return `${age(p, now)} old · ${Math.round(p.stats.tokens / 1000)}k tokens eaten`
  }
}

export const register: Register = on => {
  let ticker: Timer | undefined
  let animator: Timer | undefined
  let frame = 0
  let bandFrames: string[] = []
  let paneFrames: string[] = []
  let bandId = ''

  on('session.start', async ($, e, next) => {
    const home = await $.env.get('HOME')
    file = home ? `${home}/.claude/monster/pet.json` : ''
    await $.command.register({ name: 'pet', description: 'See and care for your monster', argumentHint: '[feed|play|name <name>|hide|show]' })
    ticker?.cancel()
    ticker = $.clock.every(FLUSH_MS, () => void flush($))
    // Animate the terminal drawings: swap their frames in place.
    animator?.cancel()
    animator = $.clock.every(FRAME_MS, () => {
      frame++
      const b = bandFrames[frame % Math.max(1, bandFrames.length)]
      if (b && bandId) void $.ui.blit({ requestId: bandId, key: 'pet', cells: b })
      const p = paneFrames[frame % Math.max(1, paneFrames.length)]
      if (p) void $.ui.blit({ requestId: PANE, key: 'habitat', cells: p })
    })
    void flush($)
    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const [verb, ...rest] = e.args.trim().split(/\s+/)
    const now = await $.clock.now()
    if (verb === 'feed') queue({ kind: 'feed', at: now })
    else if (verb === 'play') queue({ kind: 'play', at: now })
    else if (verb === 'name' && rest.length) queue({ kind: 'rename', name: rest.join(' ').slice(0, 24), at: now })
    else if (verb === 'hide' || verb === 'show') await update($, hiddenAtom, () => verb === 'hide')
    await flush($)
    const p = await read($, petAtom)
    if (!verb) await $.ui.open({ id: PANE, title: p ? p.name : 'Monster', rows: 34 })
    return { text: p ? `${title(p)} — ${status(p, now)}` : 'Your monster is on its way.' }
  })

  // ── What it eats and learns from.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const u = r.usage
    if (u) queue({ kind: 'tokens', n: u.input_tokens + u.output_tokens + u.cache_creation_input_tokens, at: Date.now() })
    return r
  })

  on('tool.call', async ($, e, next) => {
    let r: Awaited<ReturnType<typeof next>> | undefined
    try {
      r = await next(e)
      return r
    } finally {
      const input = e as unknown as Record<string, unknown>
      const tool = String(e.tool)
      const failed = !r || r.isError === true || r.deny !== undefined
      queue({ kind: 'tool', tool, command: typeof input.command === 'string' ? input.command : undefined, failed, at: Date.now() })
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
    const { Box, Text } = $.ui.resolve(e)
    const info = (
      <Box flexDirection="column">
        <Text color="#FFCD75" bold>{title(p)}</Text>
        <Text>
          <Text color="#EF7D57">food {bar(p.hunger)}</Text> <Text color="#A7F070">joy {bar(p.joy)}</Text>{' '}
          <Text color="#73EFF7">xp {bar(((p.xp - xpFor(level(p.xp))) / (xpFor(level(p.xp) + 1) - xpFor(level(p.xp)))) * 100)}</Text>
          {isSick(p) && <Text color="#E24B4A"> sick</Text>}
        </Text>
        <Text dimColor>{status(p, now)}</Text>
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
    const hour = new Date(now).getHours()
    const frames = habitatFrames(p, now, hour)
    const t = p.traits
    const tsum = Math.max(1, t.shell + t.code + t.agents * 3 + t.web * 2)
    const lv = level(p.xp)
    const next = xpFor(lv + 1)
    const care = (
      <Box flexDirection="row" gap={1}>
        <Button key="feed" label={(p.cooldowns.feed ?? 0) > now ? 'Feed (full)' : 'Feed'} hotkey="f" onPress={async () => { queue({ kind: 'feed', at: Date.now() }); await flush($) }} />
        <Button key="play" label={(p.cooldowns.play ?? 0) > now ? 'Play (tired)' : 'Play'} hotkey="p" onPress={async () => { queue({ kind: 'play', at: Date.now() }); await flush($) }} />
        <Button key="pat" label="Pat ♥" hotkey="h" onPress={async () => { queue({ kind: 'pet', at: Date.now() }); await flush($) }} />
        <Button key="band" label={(await read($, hiddenAtom)) ? 'Show band' : 'Hide band'} onPress={() => update($, hiddenAtom, h => !h)} />
      </Box>
    )
    const stats = (
      <Box flexDirection="column">
        <Text color="#FFCD75" bold>{title(p)} · {age(p, now)} old{isAsleep(p, now) ? ' · asleep' : ''}{isSick(p) ? ' · sick' : ''}</Text>
        <Text><Text color="#EF7D57">food   {bar(p.hunger, 16)}</Text>  <Text color="#A7F070">joy    {bar(p.joy, 16)}</Text></Text>
        <Text><Text color="#E24B4A">stress {bar(p.stress, 16)}</Text>  <Text color="#73EFF7">xp     {Math.floor(p.xp)}/{next} to Lv {lv + 1}</Text></Text>
        <Text dimColor>
          shell {Math.round((t.shell / tsum) * 100)}% · code {Math.round((t.code / tsum) * 100)}% · agents {Math.round(((t.agents * 3) / tsum) * 100)}% · web {Math.round(((t.web * 2) / tsum) * 100)}%
          {p.line ? `  → ${LINE_NAMES[p.line]} line` : '  → line chosen at Lv 4'}
        </Text>
        <Text dimColor>
          eaten {Math.round(p.stats.tokens / 1000)}k tokens · {p.stats.tests} test runs passed · {p.stats.commits} commits · {p.stats.tasks} tasks done · {p.stats.errors} errors
        </Text>
      </Box>
    )
    const log = (
      <Box flexDirection="column">
        {p.log.slice(-5).reverse().map((l, i) => (
          <Text key={`log-${i}`} color="#94B0C2">· {l.text}</Text>
        ))}
      </Box>
    )
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      paneFrames = frames.map(f => cells(f).cells)
      const first = cells(frames[0]!)
      return (
        <Box flexDirection="column" gap={1}>
          <Raster key="habitat" columns={first.columns} rows={first.rows} cells={first.cells} />
          {stats}
          {care}
          {log}
        </Box>
      )
    }
    if (e.surface === 'desktop') {
      const { Svg } = $.ui.resolve(e)
      return (
        <Box flexDirection="column" gap={1}>
          <Svg source={framesSvg(frames, 7)} alt={`${p.name} in its habitat`} />
          {stats}
          {care}
          {log}
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        {stats}
        {care}
        {log}
      </Box>
    )
  })

  on('ui.close', { id: PANE }, ($, e, next) => {
    paneFrames = []
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    ticker?.cancel()
    animator?.cancel()
    await flush($)
    return next(e)
  }).catch(($, e, next) => next(e))
}
