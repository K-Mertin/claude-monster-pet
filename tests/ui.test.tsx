import type { CommandRunInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const typed = (args: string): CommandRunInput => ({ command: 'pet', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
const scroll = { offset: 0, bodyRows: 30 }
const BAND = { component: 'AbovePrompt' as const, props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 110, scroll, view: {} } }
const PANE = { component: 'Pane' as const, requestId: 'monster', props: { title: 'Byte', isFocused: true, bodyColumns: 120, placement: 'dock' as const, scroll, view: {} } }

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band shows the monster and a tour tip on the ${surface}`, async ($, on) => {
    mock.clock(on)
    mock.store(on)
    await $.command.run(typed('talk'))
    const band = await $.ui.mount({ plugin: 'monster', surface, ...BAND })
    expect(await band.find({ type: 'Text', text: /Byte · Lv/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /Tip 1\/6/ })).toBeDefined()
    await band.press({ key: 'band-skip' })
    expect(await band.find({ type: 'Text', text: /Tip 1\/6/ })).toBeUndefined()
    await band.unmount()
  })

  test(`the pane's tabs draw and respond on the ${surface}`, async ($, on) => {
    mock.clock(on)
    mock.store(on)
    await $.command.run(typed('talk'))
    const pane = await $.ui.mount({ plugin: 'monster', surface, ...PANE })
    expect(await pane.find({ type: 'Text', text: /Next up:/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /Quests 1\/7/ })).toBeDefined()
    await pane.press({ key: 'tab-items' })
    expect(await pane.find({ key: 'use-cookie' })).toBeDefined()
    await pane.press({ key: 'tab-games' })
    expect(await pane.find({ key: 'hunt-start' })).toBeDefined()
    await pane.press({ key: 'hunt-start' })
    expect(await pane.find({ key: 'bush-0' })).toBeDefined()
    await pane.press({ key: 'tab-style' })
    expect(await pane.find({ type: 'Text', text: /^DNA/ })).toBeDefined()
    await pane.press({ key: 'tab-badges' })
    expect(await pane.find({ type: 'Text', text: /Hall of Fame/ })).toBeDefined()
    await pane.unmount()
  })
}
