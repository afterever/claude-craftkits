import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

import { strWidth } from './layout'
import { VERSION } from './version'

const PLUGIN = 'work-report'
// Tuesday 13 October 2026, half past two in the afternoon, local time
const NOW = new Date(2026, 9, 13, 14, 30).getTime()
const TODAY = 'day:2026-10-13'
const GOLD = '#F2C46D'
const DARK = '#0D1117'
const SLATE = '#262B33'

type Opts = {
  /** Whether the pane can be seated. */
  placed?: boolean
  stored?: Record<string, unknown>
  /** Holds ui.open until this resolves. */
  hold?: Promise<void>
  /** What git answers from a folder: its top level and shared .git folder. Absent: not a repo, git says no. */
  git?: { top: string; common: string } | ((cwd: string) => { top: string; common: string } | null)
  /** The folder the session is in. */
  root?: string
  /** Files on disk by path, for the backfill; present, the mod finds `C:/home/.claude`. */
  disk?: Record<string, string>
  /** A hook after the mod's drops the prompt, as a held prompt is. */
  drops?: boolean
  /** Paths of files the engine refuses to hand over, as one over 4 MiB. */
  big?: string[]
  /** A Windows machine: the search of a big file is `findstr`, else `grep`. */
  windows?: boolean
}

// The world beneath the mod: the store, the pane, the turn, the tools
function world(on: On, o: Opts = {}) {
  const clock = mock.clock(on, { now: NOW })
  const stored: Record<string, unknown> = o.stored ?? {}
  const writes: string[] = []
  const toasts: string[] = []
  const searched: string[][] = []
  const opened: string[] = []
  const declared: string[] = []
  const session = { id: 'sess-1' } // a /clear goes on under another
  let order = 0

  on('store.get', async (_$, e) => ({ value: stored[e.key] }) as any)
  on('store.set', async (_$, e) => {
    stored[e.key] = e.value
    writes.push(e.key)
    return { value: undefined } as any
  })
  on('store.keys', async () => ({ value: Object.keys(stored) }) as any)
  on('session.start', async () => ({ cwd: 'C:/bats' }))
  on('session.id', async () => ({ value: session.id }) as any)
  on('classic.SessionStart', async () => ({}) as any)
  on('command.register', async (_$, e) => {
    declared.push(e.name)
    return { value: { command: 'work-report' } } as any
  })
  on('prompt.submit', async (_$, e) => (o.drops ? { drop: 'held' } : { text: e.text }) as any)
  if (o.git || o.root || o.disk) {
    on('session.root', async () => ({ value: o.root ?? 'C:/bats' }) as any)
    on('process.run', async (_$, e) => {
      if (e.argv[0] === 'findstr' || e.argv[0] === 'grep') {
        searched.push([...e.argv])
        const path = String(e.argv[e.argv.length - 1]).replace(/\\/g, '/')
        const text = o.disk?.[path]
        const hits = text === undefined ? '' : text.split('\n').filter(l => /kind.:.human/.test(l)).join('\n')
        return { value: { exitCode: hits === '' ? 1 : 0, stdout: hits, stderr: '' } } as any
      }
      const flag = e.argv[2]
      const answer = (stdout: string) => ({ value: { exitCode: 0, stdout: `${stdout}\n`, stderr: '' } })
      const git = typeof o.git === 'function' ? o.git(String((e as { init?: { cwd?: string } }).init?.cwd ?? '').replace(/\\/g, '/')) : o.git
      if (!git) return { value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' } } as any
      if (flag === '--show-toplevel') return answer(git.top) as any
      return answer(git.common) as any
    })
  }
  if (o.disk) {
    const disk = o.disk
    const fake = (p: string) => p.replace(/\\/g, '/')
    on('env.get', async (_$, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/home' : e.name === 'OS' && o.windows ? 'Windows_NT' : undefined }) as any)
    on('fs.list', async (_$, e) => {
      const below = `${fake(e.path).replace(/\/+$/, '')}/`
      const entries = new Map<string, 'file' | 'dir'>()
      for (const path of Object.keys(disk)) {
        if (!path.startsWith(below)) continue
        const [first = '', ...more] = path.slice(below.length).split('/')
        entries.set(first, more.length ? 'dir' : 'file')
      }
      if (!entries.size) throw new Error('ENOENT')
      return { value: [...entries].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })) } as any
    })
    on('fs.read', async (_$, e) => {
      const text = disk[fake(e.path)]
      if (text === undefined) throw new Error('ENOENT')
      if (o.big?.includes(fake(e.path))) throw new Error(`$.fs.read: ${e.path} refused: the file is over the 4194304-byte limit`)
      return { value: text } as any
    })
  }
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }) as any)
  on('turn.complete', async (_$, e) => ({ text: e.answer }) as any)
  on('tool.call', async () => ({ result: 'ok', ref: 0, text: 'ok' }) as any)
  on('ui.open', async () => {
    order += 1
    opened.push(`open-${order}`)
    if (o.hold) await o.hold
    return { value: o.placed === false ? { isPlaced: false, reason: 'the terminal is 80 columns wide' } : { isPlaced: true } } as any
  })
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as any
  })
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => h($.ui.resolve(e).Box, {}) as any)
  return { clock, stored, writes, toasts, searched, opened, declared, session }
}

let turns = 0

type Finish = {
  text: string
  tools?: Record<string, unknown>[]
  model?: string
  reason?: 'answer' | 'aborted' | 'error' | 'refusal'
  origin?: Record<string, unknown>
  /** A helper agent's turn finishing inside this one, before it. */
  helper?: boolean
}

/** A prompt submitted, its turn started, its tools called and the turn finished. */
async function finish($: any, o: Finish) {
  const turnId = `turn-${++turns}`
  await $.prompt.submit({ text: o.text, wait: false, origin: o.origin ?? { kind: 'composer' } })
  await $.turn.start({ text: o.text, turnId })
  let i = 0
  for (const t of o.tools ?? []) await $.tool.call({ ...t, tool_use_id: `${turnId}-${i++}` })
  if (o.helper) {
    await $.turn.complete({
      answer: 'helper done',
      durationMs: 3,
      isAborted: false,
      turnId: `${turnId}-helper`,
      agentId: 'agent-1',
      reason: 'answer',
      usage: { model: 'claude-haiku-5-5', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    })
  }
  await $.turn.complete({
    answer: 'Done.',
    durationMs: 5,
    isAborted: o.reason === 'aborted',
    turnId,
    reason: o.reason ?? 'answer',
    usage: { model: o.model ?? 'claude-sonnet-5-5', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  })
}

const start = ($: any) => $.session.start({ cwd: 'C:/bats', surface: 'terminal', isInteractive: true })
const cmd = (args: string) => ({ command: 'work-report', args }) as any
const dayOf = (stored: Record<string, unknown>) => stored[TODAY] as { kinds: Record<string, number>; models: Record<string, number> } | undefined

const paneProps = (bodyColumns: number) => ({
  title: 'Work Report',
  isFocused: true,
  bodyColumns,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 60 },
  view: {},
})

// What a mounted drawing offers, as far as these tests use it
type Found = { key: string | undefined; text: string; props: Record<string, any> }
type Drawing = {
  find: (q: { type?: string; key?: string; text?: string | RegExp }) => Promise<Found | undefined>
  findAll: (q: { type?: string; key?: string; text?: string | RegExp }) => Promise<Found[]>
  press: (t: { key: string }) => Promise<unknown>
  drawn: () => Promise<unknown>
  unmount: () => Promise<void>
}

const mountPane = ($: any, cols = 100, surface: 'terminal' | 'desktop' = 'terminal'): Promise<Drawing> =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: PLUGIN, props: paneProps(cols) })

// A few days of work to draw: today, yesterday, ten days ago and one in March
const SAMPLE: Record<string, unknown> = {
  'day:2026-10-13': { kinds: { emails: 1, research: 1, other: 1 }, models: { 'Sonnet 5.5': 2, 'Opus 5.5': 1 } },
  'day:2026-10-12': { kinds: { documents: 2 }, models: { 'Opus 5.5': 2 } },
  'day:2026-10-03': { kinds: { images: 1 }, models: { 'Sonnet 5.5': 1 } },
  'day:2026-03-02': { kinds: { research: 4 }, models: { 'Haiku 5.5': 4 } },
}

// ── What is recorded ─────────────────────────────────────────────────────

test('one typed request that finishes with an answer is one task, with its model', async ($, on) => {
  const w = world(on)
  await start($)
  await finish($, { text: 'explain this function', model: 'claude-opus-5-5' })
  expect(dayOf(w.stored)).toEqual({ kinds: { other: 1 }, models: { 'Opus 5.5': 1 } })
  await finish($, { text: 'and the next one', model: 'claude-sonnet-5-5' })
  expect(dayOf(w.stored)).toEqual({ kinds: { other: 2 }, models: { 'Opus 5.5': 1, 'Sonnet 5.5': 1 } })
})

test('helper agents, cancelled turns, slash commands and notifications are not tasks', async ($, on) => {
  const w = world(on)
  await start($)

  // a helper agent finishing inside a typed request: one task, not two
  await finish($, { text: 'research the market and summarise', helper: true })
  expect(dayOf(w.stored)!.kinds).toEqual({ other: 1 })

  // cancelled, errored and refused turns
  await finish($, { text: 'write a poem', reason: 'aborted' })
  await finish($, { text: 'write another poem', reason: 'error' })
  await finish($, { text: 'something refused', reason: 'refusal' })
  // slash commands
  await finish($, { text: '/compact' })
  await finish($, { text: '/work-report week' })
  // nobody typed these: a background notification, a schedule, a mod's own words
  await finish($, { text: 'a background task finished', origin: { kind: 'task-notification' } })
  await finish($, { text: 'the nightly check', origin: { kind: 'scheduled-trigger' } })
  await finish($, { text: 'hello from a mod', origin: { kind: 'plugin', name: 'someone-else' } })
  // a turn with no prompt of anyone's behind it
  await $.turn.start({ text: '', turnId: 'turn-continuation' })
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 'turn-continuation', reason: 'answer' })

  expect(dayOf(w.stored)!.kinds).toEqual({ other: 1 })

  // an upgraded prompt a mod sent as the person's own words is their request
  await finish($, { text: 'a clearer version of my prompt', origin: { kind: 'plugin', name: 'prompt-upgrade', asUser: true } })
  expect(dayOf(w.stored)!.kinds).toEqual({ other: 2 })
})

test('each task is sorted by the tools it used', async ($, on) => {
  const w = world(on)
  await start($)
  await finish($, { text: 'reply to the invoice thread', tools: [{ tool: 'mcp__claude_ai_Gmail__search_threads' }, { tool: 'mcp__claude_ai_Gmail__create_draft' }] })
  await finish($, { text: 'make a banner', tools: [{ tool: 'Write', file_path: 'C:/site/banner.png' }] })
  await finish($, { text: 'draft the proposal', tools: [{ tool: 'WebSearch' }, { tool: 'Write', file_path: 'C:/docs/proposal.docx' }] })
  await finish($, { text: 'what is new in postgres', tools: [{ tool: 'WebSearch' }, { tool: 'WebFetch' }] })
  await finish($, { text: 'fix the bug', tools: [{ tool: 'Grep' }, { tool: 'Edit', file_path: 'src/app.ts' }] })
  // only commands: code too; only reading the code to explain it: research
  await finish($, { text: 'run the tests', tools: [{ tool: 'Bash', command: 'npm test' }] })
  await finish($, { text: 'how does the cache work', tools: [{ tool: 'Grep' }, { tool: 'Read', file_path: 'src/cache.ts' }] })
  // an answer from what it already knew used no tools at all
  await finish($, { text: 'what is a mutex' })
  // the command's own words reach the sorting: ffmpeg is video, git is only code
  await finish($, { text: 'trim the intro', tools: [{ tool: 'Bash', command: 'ffmpeg -i intro.mov -ss 3 out.mp4' }] })
  await finish($, { text: 'what changed', tools: [{ tool: 'Bash', command: 'git log --oneline -5' }] })
  expect(dayOf(w.stored)!.kinds).toEqual({ emails: 1, images: 2, code: 3, documents: 1, research: 2, other: 1 })
})

test('a coder sees Code and Research, not rows of kinds they never used', async ($, on) => {
  world(on, {
    stored: {
      [TODAY]: { kinds: { code: 6, research: 2, other: 4 }, models: { 'Opus 5.5': 12 } },
    },
  })
  await start($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountPane($, 100, surface)
    const text = [
      ...(await ui.findAll({ type: 'Text' })).map(t => t.text),
      ...(await ui.findAll({ type: 'Svg' })).map(a => String(a.props.alt)),
    ].join('\n')
    expect(text).toContain('Code')
    expect(text).toContain('Research')
    expect(text).toContain('Other')
    for (const unused of ['Emails', 'Images and video', 'Documents']) expect(`${surface}: ${text.includes(unused) ? `shows ${unused}` : 'ok'}`).toBe(`${surface}: ok`)
    // most first, the catch-all last even though it holds more than Research
    expect(text.indexOf('Code')).toBeLessThan(text.indexOf('Research'))
    expect(text.indexOf('Research')).toBeLessThan(text.indexOf('Other'))
    await ui.unmount()
  }
})

test('settings written before the code kind came in are read with its default', async ($, on) => {
  world(on, { stored: { settings: { rate: 80, minutes: { emails: 12, documents: 30, images: 20, research: 25, other: 10 } } } })
  await start($)
  const reply = await $.command.run(cmd('settings'))
  const text = String((reply as { text?: string }).text)
  // what the person set is kept, and the new kind has its default
  expect(text).toContain('Emails 12')
  expect(text).toContain('Code 20')
  expect(text).toContain('$80')
})

test('counts are added to what the day already holds, and the day rolls over at midnight', async ($, on) => {
  const w = world(on, { stored: { [TODAY]: { kinds: { emails: 4 }, models: { 'Sonnet 5.5': 4 } } } })
  await start($)
  await finish($, { text: 'one more email', tools: [{ tool: 'mcp__claude_ai_Gmail__send_message' }] })
  expect(dayOf(w.stored)).toEqual({ kinds: { emails: 5 }, models: { 'Sonnet 5.5': 5 } })

  // the next calendar day gets its own record
  // just past midnight: a jump much longer runs past what the test clock fires of the 5 s check
  await w.clock.set(new Date(2026, 9, 14, 0, 30).getTime())
  await finish($, { text: 'good morning' })
  expect(w.stored['day:2026-10-14']).toEqual({ kinds: { other: 1 }, models: { 'Sonnet 5.5': 1 } })
  expect(dayOf(w.stored)!.kinds).toEqual({ emails: 5 })
})

test('recording says nothing: no toast, no pane, for a routine task', async ($, on) => {
  const w = world(on)
  await start($)
  await finish($, { text: 'explain this' })
  expect(w.toasts).toEqual([])
  expect(w.opened).toEqual([])
})

// ── The commands ─────────────────────────────────────────────────────────

test('/work-report answers at once and opens the pane in the background', async ($, on) => {
  let release!: () => void
  const hold = new Promise<void>(r => (release = r))
  const w = world(on, { hold })
  await start($)
  // the pane is slow to open; the command still answers
  const r: any = await $.command.run(cmd(''))
  expect(typeof r.text).toBe('string')
  expect(r.text.toLowerCase()).toContain('estimate')
  release()
  await w.clock.settle()
  expect(w.opened).toHaveLength(1)
})

for (const [what, stored] of [['no work yet', {}], ['some work', SAMPLE]] as const) {
  test(`the last row of the pane is the version, with ${what}, on both surfaces`, async ($, on) => {
    const w = world(on, { stored })
    await start($)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await mountPane($, 100, surface)
      expect((await ui.findAll({ type: 'Text' })).slice(-1).map(t => t.text)).toEqual([`work-report v${VERSION}`])
    }
    await w.clock.settle()
  })
}

test('/work-report week opens the pane on that tab', async ($, on) => {
  const w = world(on, { stored: SAMPLE })
  await start($)
  const r: any = await $.command.run(cmd('week'))
  expect(r.text).toContain('week')
  await w.clock.settle()
  const ui = await mountPane($)
  expect(await ui.find({ text: 'LAST 7 DAYS' })).toBeDefined()
})

test('/work-report settings lists the settings, and the rate and the minutes can be changed', async ($, on) => {
  const w = world(on)
  await start($)
  const list: any = await $.command.run(cmd('settings'))
  for (const part of ['Emails 10', 'Code 20', 'Documents 30', 'Images and video 20', 'Research 20', 'Other 10', '$50', 'estimate']) {
    expect(list.text).toContain(part)
  }

  const rate: any = await $.command.run(cmd('settings rate 75'))
  expect(rate.text).toContain('$75')
  expect((w.stored.settings as any).rate).toBe(75)

  const emails: any = await $.command.run(cmd('settings emails 15'))
  expect(emails.text).toContain('15')
  expect((w.stored.settings as any).minutes.emails).toBe(15)

  // code answers to a few names
  for (const name of ['code', 'coding', 'commands']) {
    const code: any = await $.command.run(cmd(`settings ${name} 35`))
    expect(code.text).toContain('Code now save 35 minutes')
    expect((w.stored.settings as any).minutes.code).toBe(35)
  }

  const again: any = await $.command.run(cmd('settings'))
  expect(again.text).toContain('Emails 15')
  expect(again.text).toContain('$75')

  // the estimate follows: the pane's note names the new rate
  await finish($, { text: 'send it', tools: [{ tool: 'mcp__claude_ai_Gmail__send_message' }] })
  const ui = await mountPane($)
  expect((await ui.findAll({ type: 'Text' })).some(t => t.text.includes('$75 an hour'))).toBe(true)
})

test('a setting that cannot be used says so in a sentence and changes nothing', async ($, on) => {
  const w = world(on)
  await start($)
  for (const args of ['settings rate abc', 'settings rate -5', 'settings emails', 'settings flowers 4', 'settings emails 99999', 'whatever']) {
    const r: any = await $.command.run(cmd(args))
    expect(typeof r.text).toBe('string')
    expect(r.text.length).toBeGreaterThan(15)
  }
  expect(w.stored.settings).toBeUndefined()
})

test('every form of the command answers with a sentence, never nothing', async ($, on) => {
  const w = world(on)
  await start($)
  for (const args of ['', 'help', 'today', 'week', 'month', 'year', 'settings', 'settings rate 60']) {
    const r: any = await $.command.run(cmd(args))
    expect(typeof r.text).toBe('string')
    expect(r.text.length).toBeGreaterThan(10)
    await w.clock.settle()
  }
})

test('a window too narrow for the pane is the one thing that is said aloud', async ($, on) => {
  const w = world(on, { placed: false })
  await start($)
  const r: any = await $.command.run(cmd(''))
  expect(r.text).toBeDefined()
  await w.clock.settle()
  expect(w.toasts).toHaveLength(1)
  expect(w.toasts[0]).toContain('wider window')
})

// ── The pane ─────────────────────────────────────────────────────────────

// Every row of coloured segments, as the cells it takes
const strings = (n: any): string => (typeof n === 'string' ? n : Array.isArray(n?.children) ? n.children.flat(Infinity).map(strings).join('') : '')
function rows(n: any, out: { width: number; text: string }[] = []): { width: number; text: string }[] {
  if (typeof n !== 'object' || n === null) return out
  const p = n.props ?? {}
  // a fixed number of cells for a width is what runs off the edge of a narrow pane
  expect(typeof p.width === 'number' ? `a fixed width of ${p.width} on a ${n.type}` : 'none').toBe('none')
  if (n.type === 'Box' && p.overflow === 'hidden' && p.height === 1 && p.flexDirection === 'row') {
    out.push({ width: strWidth(strings(n)), text: strings(n) })
    return out
  }
  const kids: any[] = Array.isArray(n.children) ? n.children.flat(Infinity).filter((k: any) => k !== null && k !== false && k !== undefined) : []
  kids.forEach(k => rows(k, out))
  return out
}

test('Today: the title, the three tiles, the kinds, the models, the chart and the streak', async ($, on) => {
  const w = world(on, { stored: SAMPLE })
  await start($)
  const ui = await mountPane($, 100)

  expect(await ui.find({ text: 'WORK REPORT' })).toBeDefined()
  expect(await ui.find({ text: 'TODAY' })).toBeDefined()
  expect(await ui.find({ text: 'Tue 13 Oct 2026' })).toBeDefined()

  // three tiles, the figures labelled as estimates
  const tiles = (await ui.findAll({ type: 'Box' })).filter(b => (b.key ?? '').startsWith('tile-'))
  expect(tiles.map(t => t.key)).toEqual(['tile-hours', 'tile-tasks', 'tile-worth'])
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(expect.arrayContaining(['est. hours saved', 'tasks done', 'est. worth in $']))
  // three rows of heavy box-drawing numerals in the tasks tile
  expect((await ui.findAll({ type: 'Text' })).filter(t => /^[┏┓┗┛┃━┣┫┻ ]+$/.test(t.text) && t.text.trim() !== '').length).toBeGreaterThanOrEqual(9)

  // one row per kind that has a task today, one per model, and the chart under its own heading
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  for (const kind of ['Emails', 'Research', 'Other']) expect(text).toContain(kind)
  // the kinds with nothing today are not drawn
  for (const kind of ['Images and video', 'Documents', 'Code']) expect(text).not.toContain(kind)
  expect(text).toContain('Sonnet 5.5')
  expect(text).toContain('Opus 5.5')
  expect(text).not.toContain('Haiku 5.5')
  expect(text).toContain('WHERE THE TIME WENT')
  expect(text).toContain('WHO DID THE WORK')
  // a weekday chart of the last seven days, three rows tall, today's bar gold
  expect(text).toContain('Wed')
  const bars = (await ui.findAll({ type: 'Text' })).filter(t => /[▁-█]/.test(t.text) && t.props.color !== '#262B33')
  expect(bars.some(t => t.props.color === GOLD)).toBe(true)
  // today and yesterday: a streak of two
  expect(text).toContain('Streak: 2 days in a row.')
  // nothing was saved by drawing
  expect(w.writes).toEqual([])
})

test('each tab draws its own title, dates and chart', async ($, on) => {
  const w = world(on, { stored: SAMPLE })
  await start($)
  const ui = await mountPane($, 110)
  const texts = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const goldBars = async () => (await ui.findAll({ type: 'Text' })).filter(t => t.props.color === GOLD && /[▁-█]/.test(t.text))

  await ui.press({ key: 'tab-week' })
  let t = (await texts()).join('\n')
  expect(t).toContain('LAST 7 DAYS')
  expect(t).toContain('7 Oct to 13 Oct 2026')
  expect(t).toMatch(/Wed.*Thu.*Fri.*Sat.*Sun.*Mon.*Tue/)
  expect(t).toContain('Streak: 2 days in a row.')
  expect((await goldBars()).length).toBeGreaterThan(0)

  await ui.press({ key: 'tab-month' })
  t = (await texts()).join('\n')
  expect(t).toContain('LAST 30 DAYS')
  expect(t).toContain('14 Sep to 13 Oct 2026')
  // thirty daily bars: the dates are on the axis, and the best day is named
  expect(t).toMatch(/15.*20.*25.*30.*5.*10.*13/)
  expect(t).toContain('Best day: Tue 13 Oct, 3 tasks. 3 active days of 30.')

  await ui.press({ key: 'tab-year' })
  t = (await texts()).join('\n')
  expect(t).toContain('YEAR 2026')
  expect(t).toContain('1 Jan to 13 Oct 2026')
  expect(t).toMatch(/Jan.*Feb.*Mar.*Apr.*May.*Jun.*Jul.*Aug.*Sep.*Oct.*Nov.*Dec/)
  expect(t).toContain('Best month: October, 6 tasks. 4 active days.')
  // October is the current month: gold
  expect((await goldBars()).length).toBeGreaterThan(0)

  await ui.press({ key: 'tab-today' })
  t = (await texts()).join('\n')
  expect(t).toContain('TODAY')
  // choosing a tab changes the pane's state, never the store
  expect(w.writes).toEqual([])
})

test('the chosen tab is a gold chip with dark bold text, the others slate', async ($, on) => {
  world(on, { stored: SAMPLE })
  await start($)
  const ui = await mountPane($, 100)
  for (const [key, label] of [['tab-today', ' Today '], ['tab-week', ' Week '], ['tab-month', ' Month '], ['tab-year', ' Year ']] as const) {
    expect(await ui.find({ key })).toBeDefined()
    expect(await ui.find({ key })).toMatchObject({ text: label })
  }
  const chip = async (label: string) => (await ui.findAll({ type: 'Text', text: label }))[0]!.props
  expect(await chip(' Today ')).toMatchObject({ backgroundColor: GOLD, color: DARK, bold: true })
  expect(await chip(' Week ')).toMatchObject({ backgroundColor: SLATE, color: '#E6EDF3' })

  await ui.press({ key: 'tab-month' })
  expect(await chip(' Month ')).toMatchObject({ backgroundColor: GOLD, color: DARK, bold: true })
  expect(await chip(' Today ')).toMatchObject({ backgroundColor: SLATE })
})

test('the empty state says so plainly on every tab, and draws no numbers', async ($, on) => {
  world(on)
  await start($)
  const ui = await mountPane($, 100)
  const texts = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text)

  expect(await texts()).toContain('Nothing finished yet today. Your first finished task shows up here.')
  expect(await texts()).not.toContain('tasks done')
  for (const [key, words] of [
    ['tab-week', 'in the last 7 days'],
    ['tab-month', 'in the last 30 days'],
    ['tab-year', 'this year'],
  ] as const) {
    await ui.press({ key })
    expect(await texts()).toContain(`Nothing finished yet ${words}. Your first finished task shows up here.`)
  }
})

test('the empty state is for the stretch, not the whole record: an old task does not fill Today', async ($, on) => {
  world(on, { stored: { 'day:2026-10-03': { kinds: { images: 1 }, models: { 'Sonnet 5.5': 1 } } } })
  await start($)
  const ui = await mountPane($, 100)
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toContain('Nothing finished yet today. Your first finished task shows up here.')
  await ui.press({ key: 'tab-month' })
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toContain('tasks done')
})

test('three tiles, then two, then one as the pane narrows, and the rest is not lost', async ($, on) => {
  world(on, { stored: SAMPLE })
  await start($)
  const tileCount = async (cols: number) => {
    const ui = await mountPane($, cols)
    const n = (await ui.findAll({ type: 'Box' })).filter(b => (b.key ?? '').startsWith('tile-')).length
    const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    await ui.unmount()
    return { n, text }
  }
  const wide = await tileCount(110)
  expect(wide.n).toBe(3)
  const mid = await tileCount(50)
  expect(mid.n).toBe(2)
  // the worth that has no tile of its own is still said, in one line
  expect(mid.text).toMatch(/\$\d+/)
  const narrow = await tileCount(30)
  expect(narrow.n).toBe(1)
  expect(narrow.text).toMatch(/tasks.*\$\d+/s)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`every row fits the pane at a narrow width and a wide one on ${surface}`, async ($, on) => {
    world(on, { stored: SAMPLE })
    await start($)
    for (const cols of [24, 30, 40, 50, 60, 72, 90, 110, 160]) {
      const ui = await mountPane($, cols, surface)
      // one cell is held back; the pane is never drawn wider than 110
      const limit = Math.min(110, Math.max(20, cols)) - 1
      for (const tab of ['tab-today', 'tab-week', 'tab-month', 'tab-year']) {
        await ui.press({ key: tab })
        const drawn = rows(await ui.drawn())
        // the check is only worth anything if it saw rows; on the desktop the
        // figures are drawings, so only the note and the summary are text rows
        expect(drawn.length).toBeGreaterThan(surface === 'desktop' ? 1 : 8)
        for (const r of drawn) expect(`${tab} @${cols}: ${r.width <= limit ? 'fits' : `wide ${r.width}: ${r.text}`}`).toBe(`${tab} @${cols}: fits`)
      }
      await ui.unmount()
    }
  })
}

test('the desktop draws the tiles, bars and chart as drawings; the terminal draws them as text', async ($, on) => {
  world(on, { stored: SAMPLE })
  await start($)

  const desktop = await mountPane($, 100, 'desktop')
  const art = await desktop.findAll({ type: 'Svg' })
  // tiles, the kinds, the models and the chart
  expect(art).toHaveLength(4)
  for (const a of art) {
    expect(String(a.props.source)).toMatch(/^<svg /)
    expect(String(a.props.alt).length).toBeGreaterThan(0)
  }
  // no font-dependent glyph is left in a row of the figures
  const words = (await desktop.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  expect(words).not.toMatch(/[█▁▂▃▄▅▆▇┏┓┗┛┃]/)
  expect((await desktop.findAll({ type: 'Box' })).filter(b => (b.key ?? '').startsWith('tile-'))).toHaveLength(0)
  // the figures are still said: the kinds with their counts, the models, the tiles
  const said = art.map(a => String(a.props.alt)).join(' | ')
  expect(said).toMatch(/Emails 1/)
  expect(said).toMatch(/Sonnet 5\.5 2/)
  expect(said).toMatch(/tasks done 3/)
  await desktop.unmount()

  const terminal = await mountPane($, 100, 'terminal')
  expect(await terminal.findAll({ type: 'Svg' })).toHaveLength(0)
  expect(await terminal.find({ text: /█/ })).toBeDefined()
  await terminal.unmount()
})

test('the desktop pane keeps working when a tab is picked', async ($, on) => {
  world(on, { stored: SAMPLE })
  await start($)
  const ui = await mountPane($, 72, 'desktop')
  const sources: string[] = []
  for (const tab of ['tab-week', 'tab-month', 'tab-year', 'tab-today']) {
    await ui.press({ key: tab })
    sources.push((await ui.findAll({ type: 'Svg' })).map(a => String(a.props.source)).join('\n'))
  }
  // each tab has its own chart
  expect(new Set(sources).size).toBe(4)
  await ui.unmount()
})

test('a very wide count and long model name still fit', async ($, on) => {
  world(on, {
    stored: {
      'day:2026-10-13': { kinds: { emails: 12345, research: 987654 }, models: { 'A model with a remarkably long display name': 1000000 } },
    },
  })
  await start($)
  for (const cols of [24, 40, 100]) {
    const ui = await mountPane($, cols)
    const limit = Math.min(110, Math.max(20, cols)) - 1
    for (const r of rows(await ui.drawn())) expect(r.width).toBeLessThanOrEqual(limit)
    await ui.unmount()
  }
})

test('drawing the pane changes nothing: no store write, no state write', async ($, on) => {
  const w = world(on, { stored: SAMPLE })
  await start($)
  const before = JSON.stringify(w.stored)
  for (const cols of [30, 100]) {
    const ui = await mountPane($, cols)
    for (const tab of ['tab-week', 'tab-month', 'tab-year', 'tab-today']) await ui.press({ key: tab })
    await ui.unmount()
  }
  expect(w.writes).toEqual([])
  expect(JSON.stringify(w.stored)).toBe(before)
})

// ── The button ───────────────────────────────────────────────────────────

test('one button above the prompt opens the pane, and shows today in a few words', async ($, on) => {
  const w = world(on, { stored: SAMPLE })
  await start($)
  const band: Drawing = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
  })
  const buttons = await band.findAll({ type: 'Button' })
  expect(buttons.map(b => b.key)).toEqual(['work-report-open'])
  expect(await band.find({ text: '3 tasks today' })).toBeDefined()
  await band.press({ key: 'work-report-open' })
  await w.clock.settle()
  expect(w.opened).toHaveLength(1)
})

test('the band leaves the others alone while a survey holds it', async ($, on) => {
  world(on)
  await start($)
  const band: Drawing = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: true, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
  })
  expect(await band.find({ key: 'work-report-open' })).toBeUndefined()
})

test('/work-report settings band off hides the chip and on brings it back, and the choice is kept', async ($, on) => {
  const w = world(on, { stored: SAMPLE })
  await start($)
  const band = () =>
    $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
    }) as Promise<Drawing>
  expect(await (await band()).find({ key: 'work-report-open' })).toBeDefined()

  const off: any = await $.command.run(cmd('settings band off'))
  expect(off.text).toContain('hidden')
  expect((w.stored.settings as any).band).toBe(false)
  expect(await (await band()).find({ key: 'work-report-open' })).toBeUndefined()
  // the pane is still there for /work-report
  const opened: any = await $.command.run(cmd(''))
  expect(opened.text).toContain('Opening')
  expect((await $.command.run(cmd('settings')) as any).text).toContain('Chip above the prompt: off')

  const back: any = await $.command.run(cmd('settings band on'))
  expect(back.text).toContain('back')
  expect((w.stored.settings as any).band).toBe(true)
  expect(await (await band()).find({ key: 'work-report-open' })).toBeDefined()
})

test('a chip hidden in an earlier session stays hidden, and a word it does not know changes nothing', async ($, on) => {
  const w = world(on, { stored: { settings: { rate: 50, minutes: {}, band: false } } })
  await start($)
  const band: Drawing = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
  })
  expect(await band.find({ key: 'work-report-open' })).toBeUndefined()
  for (const args of ['settings band', 'settings band maybe']) {
    const r: any = await $.command.run(cmd(args))
    expect(r.text).toContain('on or off')
  }
  expect((w.stored.settings as any).band).toBe(false)
})

test('the saved days are read back when a session starts', async ($, on) => {
  const w = world(on, { stored: SAMPLE })
  await start($)
  const ui = await mountPane($, 100)
  expect((await ui.findAll({ type: 'Text' })).some(t => t.text === 'tasks done')).toBe(true)
  // a task finished now is added to what was read, not instead of it
  await finish($, { text: 'one more' })
  expect(dayOf(w.stored)!.kinds).toEqual({ emails: 1, research: 1, other: 2 })
})

test('a /clear starts no session, so the command is declared again and the days are read back within seconds', async ($, on) => {
  const w = world(on, { stored: SAMPLE })
  await start($)
  expect(w.declared).toEqual(['work-report'])
  // the same session: nothing to do
  await w.clock.advance(5000)
  expect(w.declared).toHaveLength(1)
  // a /clear: the process goes on under a new id
  w.stored['day:2026-10-14'] = { kinds: { code: 3 }, models: { 'Sonnet 5.5': 3 } }
  w.session.id = 'sess-2'
  await w.clock.advance(5000)
  expect(w.declared).toEqual(['work-report', 'work-report'])
  const ui = await mountPane($, 100)
  expect((await ui.findAll({ type: 'Text' })).some(t => t.text === 'tasks done')).toBe(true)
  await w.clock.advance(10000)
  expect(w.declared).toHaveLength(2)
})

test('the first prompt after a /clear sets the session up before it is counted', async ($, on) => {
  const w = world(on)
  await start($)
  w.session.id = 'sess-2'
  await finish($, { text: 'draft the reply to Ana' })
  expect(w.declared).toHaveLength(2)
  expect(dayOf(w.stored)!.kinds).toEqual({ other: 1 })
})

test('the settings hook\'s SessionStart, which a managed plan skips, is not needed: it changes nothing', async ($, on) => {
  const w = world(on)
  await start($)
  await $.classic.SessionStart({ source: 'clear' })
  expect(w.declared).toHaveLength(1)
})

// ── Prompts you typed, by repo ───────────────────────────────────────────

const REPO = { top: 'E:/github/claude-mods', common: 'E:/github/claude-mods/.git' }
const reposOf = (stored: Record<string, unknown>, key = TODAY) => (stored[key] as { repos?: Record<string, number> } | undefined)?.repos
// real timers: the mod counts a prompt off the prompt's own path, so a test waits for the store
declare function setTimeout(fn: (...args: unknown[]) => void, ms: number): unknown
const settle = () => new Promise(r => setTimeout(r, 40))
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise(r => setTimeout(r, 5))
}

test('each typed prompt is counted for its repo, even when its turn is cancelled, and tasks are counted as before', async ($, on) => {
  // the session is in a subfolder: the repo is still the one folder git names
  const w = world(on, { git: REPO, root: 'E:/github/claude-mods/work-report/hooks' })
  await start($)
  await finish($, { text: 'one' })
  await finish($, { text: 'two' })
  await finish($, { text: 'three', reason: 'aborted' })
  await until(() => reposOf(w.stored)?.['claude-mods'] === 3)
  expect(reposOf(w.stored)).toEqual({ 'claude-mods': 3 })
  expect(dayOf(w.stored)!.kinds).toEqual({ other: 2 })
})

test('a folder git knows nothing of is counted under its own name', async ($, on) => {
  const w = world(on, { root: 'C:/scratch/notes' })
  await start($)
  await finish($, { text: 'jot this down' })
  await until(() => reposOf(w.stored) !== undefined)
  expect(reposOf(w.stored)).toEqual({ notes: 1 })
})

test('slash commands, notifications, schedules and a mod\'s own words are not prompts; an upgraded prompt is', async ($, on) => {
  const w = world(on, { git: REPO })
  await start($)
  await finish($, { text: '/compact' })
  await finish($, { text: 'a background task finished', origin: { kind: 'task-notification' } })
  await finish($, { text: 'the nightly check', origin: { kind: 'scheduled-trigger' } })
  await finish($, { text: 'hello from a mod', origin: { kind: 'plugin', name: 'someone-else' } })
  await settle()
  expect(reposOf(w.stored)).toBeUndefined()
  await finish($, { text: 'the upgraded prompt', origin: { kind: 'plugin', name: 'prompt-upgrade', asUser: true } })
  await until(() => reposOf(w.stored) !== undefined)
  expect(reposOf(w.stored)).toEqual({ 'claude-mods': 1 })
})

test('a prompt another hook held back is not counted', async ($, on) => {
  const w = world(on, { git: REPO, drops: true })
  await start($)
  await finish($, { text: 'this one is held' })
  await settle()
  expect(reposOf(w.stored)).toBeUndefined()
  expect(w.writes.filter(k => k.startsWith('day:'))).toEqual([])
})

test('counting a prompt never delays it: the prompt goes through before git answers', async ($, on) => {
  const w = world(on, { git: REPO })
  await start($)
  const reply = await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
  expect((reply as { text?: string }).text).toBe('hello')
  await until(() => reposOf(w.stored) !== undefined)
  expect(reposOf(w.stored)).toEqual({ 'claude-mods': 1 })
})

// ── /work-report backfill ────────────────────────────────────────────────

const at = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString()
const row = (o: Record<string, unknown>) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, message: { role: 'user', content: 'a prompt' }, cwd: 'E:/github/claude-mods', promptId: 'p0', timestamp: at(13, 9), ...o })
const SESSIONS = {
  'C:/home/.claude/projects/E--github-claude-mods/s1.jsonl': [
    row({ promptId: 'p1', timestamp: at(12, 10) }),
    row({ promptId: 'p2', timestamp: at(12, 11) }),
    row({ promptId: 'p2', timestamp: at(12, 11) }), // the same prompt twice
    row({ promptId: 'p3' }),
    row({ promptId: 'p4', message: { role: 'user', content: [{ type: 'text', text: 'typed with a pasted part' }] } }),
    // none of these were typed
    row({ promptId: 'n1', message: { role: 'user', content: '<command-name>/compact</command-name>' } }),
    row({ promptId: 'n2', origin: { kind: 'task-notification' } }),
    row({ promptId: 'n3', isMeta: true }),
    row({ promptId: 'n4', isSidechain: true }),
    row({ promptId: 'n5', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } }),
    row({ promptId: 'n6', origin: undefined }),
    'a line that is not JSON but says "human"',
  ].join('\n'),
  'C:/home/.claude/projects/C--bats/s2.jsonl': row({ promptId: 'q1', cwd: 'C:/bats', timestamp: at(13, 10) }),
  'C:/home/.claude/projects/C--bats/notes.txt': 'not a session',
}
const GIT_BY_FOLDER = (cwd: string) => (cwd.startsWith('C:/bats') ? { top: 'C:/bats', common: 'C:/bats/.git' } : REPO)

test('/work-report backfill counts the typed prompts in saved sessions, by day and repo, and touches nothing else', async ($, on) => {
  const w = world(on, { git: GIT_BY_FOLDER, disk: SESSIONS, stored: { [TODAY]: { kinds: { code: 2 }, models: { 'Opus 5.5': 2 } } } })
  await start($)
  const reply = await $.command.run(cmd('backfill'))
  expect(String((reply as { text?: string }).text)).toContain('Counting the prompts you typed')
  await until(() => w.toasts.length > 0)
  expect(w.toasts[0]).toContain('counted 5 typed prompts in 2 repos over 2 days, from 2 saved sessions')
  expect(reposOf(w.stored, 'day:2026-10-12')).toEqual({ 'claude-mods': 2 })
  expect(reposOf(w.stored, TODAY)).toEqual({ 'claude-mods': 2, bats: 1 })
  // the tasks, models and so the hours and dollars are as they were
  expect(dayOf(w.stored)).toMatchObject({ kinds: { code: 2 }, models: { 'Opus 5.5': 2 } })
})

test('a session over the engine\'s 4 MiB limit is searched for its human lines instead: findstr on Windows', async ($, on) => {
  const big = 'C:/home/.claude/projects/E--github-claude-mods/s1.jsonl'
  const w = world(on, { git: GIT_BY_FOLDER, disk: SESSIONS, big: [big], windows: true })
  await start($)
  await $.command.run(cmd('backfill'))
  await until(() => w.toasts.length > 0)
  // the same count as when the file was read whole, from one search of the one big file
  expect(w.toasts[0]).toContain('counted 5 typed prompts')
  expect(w.searched).toHaveLength(1)
  expect(w.searched[0]![0]).toBe('findstr')
  expect(w.searched[0]!.at(-1)).toBe(big.replace(/\//g, '\\'))
})

test('on a machine that is not Windows the big file is searched with grep', async ($, on) => {
  const big = 'C:/home/.claude/projects/E--github-claude-mods/s1.jsonl'
  const w = world(on, { git: GIT_BY_FOLDER, disk: SESSIONS, big: [big] })
  await start($)
  await $.command.run(cmd('backfill'))
  await until(() => w.toasts.length > 0)
  expect(w.toasts[0]).toContain('counted 5 typed prompts')
  expect(w.searched.map(a => a[0])).toEqual(['grep'])
})

test('backfill again, or after the live counter has begun, never counts a prompt twice', async ($, on) => {
  const w = world(on, { git: GIT_BY_FOLDER, disk: SESSIONS, stored: { [TODAY]: { kinds: {}, models: {}, repos: { 'claude-mods': 5 } } } })
  await start($)
  await $.command.run(cmd('backfill'))
  await until(() => w.toasts.length > 0)
  // the live count of 5 is larger than the 2 in the files: it stays; bats had none and gains its one
  expect(reposOf(w.stored, TODAY)).toEqual({ 'claude-mods': 5, bats: 1 })
  const before = JSON.stringify(w.stored)
  await $.command.run(cmd('backfill'))
  await until(() => w.toasts.length > 1)
  expect(JSON.stringify(w.stored)).toBe(before)
})

test('backfill says so when there is nothing to read, and does not run twice at once', async ($, on) => {
  const w = world(on, { git: REPO, disk: { 'C:/home/.claude/other/file.txt': 'x' } })
  await start($)
  const first = await $.command.run(cmd('backfill'))
  const second = await $.command.run(cmd('backfill'))
  expect(String((first as { text?: string }).text)).toContain('Counting')
  expect(String((second as { text?: string }).text)).toContain('already counting')
  await until(() => w.toasts.length > 0)
  expect(w.toasts[0]).toContain('found no saved sessions')
})

// ── Drawn ────────────────────────────────────────────────────────────────

test('the pane lists the repos of the stretch, and says nothing of prompts for a stretch with none', async ($, on) => {
  const w = world(on, {
    stored: {
      ...SAMPLE,
      [TODAY]: { kinds: { emails: 1 }, models: { 'Sonnet 5.5': 1 }, repos: { 'claude-mods': 4, bats: 2 } },
      'day:2026-10-12': { kinds: { documents: 2 }, models: { 'Opus 5.5': 2 }, repos: { 'claude-mods': 3 } },
    },
  })
  await start($)
  const texts = async (ui: Drawing) => (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  const today = await mountPane($, 100)
  const t = await texts(today)
  await today.unmount()
  expect(t).toContain('PROMPTS YOU TYPED')
  expect(t).toContain('6 in all')
  expect(t).toContain('claude-mods')
  expect(t).toContain('bats')
  // Week adds yesterday's three; Today did not
  await $.command.run(cmd('week'))
  const week = await texts(await mountPane($, 100))
  expect(week).toContain('9 in all')
  void w
})

test('a user who has never counted a prompt is pointed to /work-report backfill', async ($, on) => {
  world(on, { stored: SAMPLE })
  await start($)
  const ui = await mountPane($, 100)
  expect((await ui.findAll({ type: 'Text' })).some(t => t.text.includes('/work-report backfill'))).toBe(true)
})

test('a user who has counted prompts is not nagged on a stretch with none', async ($, on) => {
  world(on, { stored: { ...SAMPLE, 'day:2026-03-02': { kinds: { research: 4 }, models: { 'Haiku 5.5': 4 }, repos: { old: 3 } } } })
  await start($)
  const again = await mountPane($, 100)
  const text = (await again.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  // today has none, but an earlier day does: no hint, and no empty block either
  expect(text).not.toContain('/work-report backfill')
  expect(text).not.toContain('PROMPTS YOU TYPED')
})

test('the desktop draws the repo bars as a drawing, the terminal as text', async ($, on) => {
  world(on, { stored: { [TODAY]: { kinds: { emails: 1 }, models: { 'Sonnet 5.5': 1 }, repos: { 'claude-mods': 4 } } } })
  await start($)
  const desktop = await mountPane($, 100, 'desktop')
  expect((await desktop.findAll({ type: 'Svg' })).some(s => String(s.props.alt).includes('claude-mods 4'))).toBe(true)
  await desktop.unmount()
  const terminal = await mountPane($, 100, 'terminal')
  expect((await terminal.findAll({ type: 'Svg' })).length).toBe(0)
  expect((await terminal.findAll({ type: 'Text' })).map(x => x.text).join('\n')).toContain('claude-mods')
})
