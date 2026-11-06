import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__waypoints__tasks'
const NOW = new Date(2026, 9, 17, 14, 30).getTime()

type Opts = {
  /** Make tool.register fail, as an engine that refuses the tool would. */
  noTool?: boolean
  stored?: Record<string, unknown>
  /** The data folder's files, as other chats left them. */
  files?: { name: string; mtimeMs: number; body: string }[]
  home?: string
  os?: string
  /** What the host's delete answers; one that throws makes the call reject. */
  run?: (argv: readonly string[]) => any
}

// The world beneath the mod: clock, store, environment, the engine's own prompt
function world(on: On, o: Opts = {}) {
  mock.clock(on, { now: NOW })
  mock.store(on, o.stored ?? {})
  mock.env(on, { USERPROFILE: o.home ?? 'C:/Users/bats', OS: o.os ?? 'Windows_NT' })
  const toasts: string[] = []
  const commands: string[] = []
  const runs: (readonly string[])[] = []
  const files = new Map((o.files ?? []).map((f) => [f.name, f]))
  const nameOf = (path: string) => String(path).split(/[\\/]/).pop()!
  on('session.start', async () => ({ cwd: 'C:/bats' }))
  on('session.surface', async () => ({ value: 'terminal' }) as any)
  on('ui.log', async () => ({ value: undefined }) as any)
  on('session.id', async () => ({ value: 'sess-1' }) as any)
  on('session.cwd', async () => ({ value: 'C:/bats' }) as any)
  on('fs.exists', async (_$, e) => ({ value: files.has(nameOf(e.path)) }) as any)
  on('fs.read', async (_$, e) => {
    const f = files.get(nameOf(e.path))
    if (!f) throw new Error('missing')
    return { value: f.body } as any
  })
  on('fs.write', async () => ({ value: undefined }) as any)
  on('fs.list', async () => ({ value: [...files.values()].map((f) => ({ name: f.name, kind: 'file', size: 1, mtimeMs: f.mtimeMs, isLink: false })) }) as any)
  // the host's delete takes away every file its argv names
  on('process.run', async (_$, e) => {
    runs.push(e.argv)
    const answer = o.run ? o.run(e.argv) : { exitCode: 0, stdout: '', stderr: '' }
    for (const arg of e.argv) files.delete(nameOf(arg))
    return { value: answer } as any
  })
  on('tool.register', async () => {
    if (o.noTool) throw new Error('refused')
    return { value: { tool: TOOL } } as any
  })
  on('command.register', async (_$, e) => {
    commands.push(e.name)
    return { value: { command: e.name } } as any
  })
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as any
  })
  on('prompt.compose', async () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' }] }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => h($.ui.resolve(e).Box, {}) as any)
  on('command.run', { command: 'goal' }, async () => ({}) as any)
  // every other tool answers ok, as the engine's tool would
  on('tool.call', async () => ({ result: 'ok', text: 'ok' }) as any)
  return { toasts, commands, runs }
}

const start = ($: any) => $.session.start({ cwd: 'C:/bats', surface: 'terminal', isInteractive: true })
// The engine always hands a hook the whole input; a test has to say it all
const compose = ($: any, traits: string[] = [], surfaces: string[] = ['terminal']) =>
  $.prompt.compose({ model: 'claude-sonnet-5-5', promptModel: 'claude-sonnet-5-5', surfaces, tools: [], outputStyle: null, traits })
const ids = (r: any) => r.sections.map((s: any) => s.id)
const mine = (r: any) => r.sections.find((s: any) => s.id === 'waypoints:plan')
let n = 0
const edit = ($: any) => $.tool.call({ tool: 'Edit', file_path: 'a.md', old_string: 'a', new_string: 'b', tool_use_id: 'e' + ++n })
const goal = ($: any) => $.command.run({ command: 'goal', args: 'ship the band' } as any)
// a refused call resolves errored, with the reason as its text
const refusal = (r: any) => r.deny ?? r.text

test('the command is /waypoints', async ($, on) => {
  const w = world(on)
  await start($)
  expect(w.commands).toEqual(['waypoints'])
})

test('the system prompt asks Claude to plan multi-step work, after the engine\'s own sections', async ($, on) => {
  world(on)
  await start($)
  const r = await compose($)
  expect(ids(r)).toEqual(['intro', 'waypoints:plan'])
  expect(mine(r).scope).toBe('session')
  expect(mine(r).text).toContain(TOOL)
  expect(mine(r).text).toContain('3 or more steps')
})

test('it asks nothing where no one watches the bar or a teammate must not replace the plan', async ($, on) => {
  world(on)
  await start($)
  for (const trait of ['bare', 'teammate'] as const) {
    const r = await compose($, [trait])
    expect(ids(r)).toEqual(['intro'])
  }
  // a -p run draws nowhere
  expect(ids(await compose($, ['print'], []))).toEqual(['intro'])
})

test('the Desktop app is an SDK host (the print trait) that draws, so it gets the ask', async ($, on) => {
  world(on)
  await start($)
  expect(ids(await compose($, ['print'], ['desktop']))).toEqual(['intro', 'waypoints:plan'])
  // a teammate there still must not replace the lead's plan
  expect(ids(await compose($, ['print', 'teammate'], ['desktop']))).toEqual(['intro'])
})

test('/waypoints auto off removes the ask and auto on brings it back, kept between sessions', async ($, on) => {
  const w = world(on)
  await start($)
  await $.command.run({ command: 'waypoints', args: 'auto off' })
  expect(ids(await compose($))).toEqual(['intro'])
  expect(w.toasts.at(-1)).toContain('off')
  await $.command.run({ command: 'waypoints', args: 'auto on' })
  expect(ids(await compose($))).toEqual(['intro', 'waypoints:plan'])
})

test('a /goal refuses file edits until Claude has planned, with no setting to turn it off', async ($, on) => {
  world(on)
  await start($)
  await goal($)
  expect(refusal(await edit($))).toContain('plan the goal before changing files')
  await $.tool.call({ tool: TOOL, action: 'plan', tasks: [{ title: 'one', size: 'S' }], tool_use_id: 'p1' })
  expect(((await edit($)) as any).text).toBe('ok')
})

test('a strict off saved by 2.0 no longer lets a /goal edit before its plan', async ($, on) => {
  world(on, { stored: { settings: { strict: false, auto: true } } })
  await start($)
  await goal($)
  expect(refusal(await edit($))).toContain('plan the goal before changing files')
})

test('the guard steps aside when the plan tool did not register', async ($, on) => {
  world(on, { noTool: true })
  await start($)
  await goal($)
  expect(((await edit($)) as any).text).toBe('ok')
})

test('edits are never held back outside a /goal', async ($, on) => {
  world(on)
  await start($)
  expect(((await edit($)) as any).text).toBe('ok')
})

test('/waypoints hide and show each say what they did', async ($, on) => {
  const w = world(on)
  await start($)
  await $.command.run({ command: 'waypoints', args: 'hide' } as any)
  expect(w.toasts.at(-1)).toBe('Waypoints band hidden · /waypoints show brings it back')
  await $.command.run({ command: 'waypoints', args: 'show' } as any)
  expect(w.toasts.at(-1)).toBe('Waypoints band shown')
})

test('a session that saved auto off starts without the ask', async ($, on) => {
  world(on, { stored: { settings: { auto: false } } })
  await start($)
  expect(ids(await compose($))).toEqual(['intro'])
})

test('it does not ask for a tool that did not register', async ($, on) => {
  world(on, { noTool: true })
  await start($)
  expect(ids(await compose($))).toEqual(['intro'])
})

test('a plan made without /goal is tracked the same way', async ($, on) => {
  world(on)
  await start($)
  const r: any = await $.tool.call({
    tool: TOOL,
    action: 'plan',
    tasks: [{ title: 'read', size: 'S' }, { title: 'write', size: 'M' }],
    tool_use_id: 't1',
  })
  expect(r.result).toContain('Plan: 0 of 2 tasks done')
  const d: any = await $.tool.call({ tool: TOOL, action: 'done', id: 1, tool_use_id: 't2' })
  expect(d.result).toContain('Plan: 1 of 2 tasks done, 33% of the work.')
})

test('a first plan whose tasks cannot be read gets the parse error, and no plan is started', async ($, on) => {
  world(on)
  await start($)
  const bad: any = await $.tool.call({ tool: TOOL, action: 'plan', tasks: '[{"title":"A","size":"S"},{"title":"B",}]', tool_use_id: 't1' })
  expect(bad.result).toContain('tasks must be a JSON array')
  expect(bad.result).not.toContain('no plan in this chat yet')
  // the repaired form starts a plan, and the reply carries the count
  const ok: any = await $.tool.call({ tool: TOOL, action: 'plan', tasks: '[{"title":"A","size":S},{"title":"B","size":M}]', tool_use_id: 't2' })
  expect(ok.result).toContain('Planned 2 tasks. Repaired 2 unquoted sizes')
  expect(ok.result).toContain('Plan: 0 of 2 tasks done')
})

test('a call the host wrapped as unparsed input is read, repaired and counted, or answered with why not', async ($, on) => {
  world(on)
  await start($)
  const send = (raw: string, n: number) => $.tool.call({ tool: TOOL, tool_use_id: 'u' + n, __unparsedToolInput: { raw, len: raw.length } } as any)
  const bad: any = await send('{"action": "plan", "tasks": [{"title":"A","size":"S"},{"title":"B",}]}', 1)
  expect(bad.result).toContain('the call was not valid JSON, so none of it was read')
  expect(bad.result).not.toContain('no plan in this chat yet')
  const ok: any = await send('{"action": "plan", "goal": "live test", "tasks": [{"title":"Unquoted","size":S},{"title":"Second","size":M}]}', 2)
  expect(ok.result).toContain('Repaired 2 unquoted sizes in the call')
  expect(ok.result).toContain('Planned 2 tasks.')
  expect(ok.result).toContain('Plan: 0 of 2 tasks done')
})

test('a call wrapped as a string holding { raw, len } gets the error, not a plain plan listing', async ($, on) => {
  world(on)
  await start($)
  const send = (raw: string, n: number) => $.tool.call({ tool: TOOL, tool_use_id: 'd' + n, __unparsedToolInput: JSON.stringify({ raw, len: raw.length }) } as any)
  await send('{"action": "plan", "goal": "live test", "tasks": [{"title":"Unquoted","size":S},{"title":"Second","size":M}]}', 1)
  const bad: any = await send('{"action": "add", "tasks": [{"title":"A","size":"S"},{"title":"B",}]}', 2)
  expect(bad.result).toContain('the call was not valid JSON, so none of it was read')
  expect(bad.result).not.toContain('Plan: 0 of 2')
})

const MIN = 60000
const H = 60 * MIN
const finished = (h: number) => JSON.stringify({ status: 'met', endedAt: NOW - h * H, tasks: [] })
const WIN = 'C:\\Users\\bats\\.claude\\mods-data\\waypoints\\'
const prune = ($: any) => $.command.run({ command: 'waypoints', args: 'prune' } as any)

test('/waypoints prune deletes old finished files by full path, with no shell', async ($, on) => {
  const w = world(on, { files: [
    { name: 'sess-1.json', mtimeMs: NOW - 30 * H, body: finished(30) },
    { name: 'a.json', mtimeMs: NOW - 3 * H, body: finished(3) },
    { name: 'c.json', mtimeMs: NOW - 10 * MIN, body: finished(0.1) },
  ] })
  await start($)
  await prune($)
  expect(w.runs).toEqual([['cmd', '/d', '/c', 'del', '/f', '/q', `${WIN}a.json`]])
  expect(w.toasts.at(-1)).toBe('Pruned 1 old file')
})

test('off Windows prune deletes with rm', async ($, on) => {
  const w = world(on, { os: '', home: '/home/bats', files: [{ name: 'a.json', mtimeMs: NOW - 3 * H, body: finished(3) }] })
  await start($)
  await prune($)
  expect(w.runs).toEqual([['rm', '-f', '--', '/home/bats/.claude/mods-data/waypoints/a.json']])
})

test('a delete that cannot start says prune did not run', async ($, on) => {
  const w = world(on, { files: [{ name: 'a.json', mtimeMs: NOW - 3 * H, body: finished(3) }], run: () => { throw new Error('spawn cmd ENOENT') } })
  await start($)
  await prune($)
  // the harness skips a hook that throws, so the call rejects with its own words, not ours
  expect(w.toasts.at(-1)).toMatch(/^Prune did not run: \S/)
})

test('with nothing old prune runs no command', async ($, on) => {
  const w = world(on, { files: [{ name: 'c.json', mtimeMs: NOW - 10 * MIN, body: finished(0.1) }] })
  await start($)
  await prune($)
  expect(w.runs).toEqual([])
  expect(w.toasts.at(-1)).toBe('Nothing to prune')
})

test('a Windows folder cmd cannot take is left for the person, named as Windows writes it', async ($, on) => {
  const w = world(on, { home: 'C:\\Users\\R&D', files: [{ name: 'a.json', mtimeMs: NOW - 3 * H, body: finished(3) }] })
  await start($)
  await prune($)
  expect(w.runs).toEqual([])
  expect(w.toasts.at(-1)).toBe('Prune did not run: delete old files by hand in C:\\Users\\R&D\\.claude\\mods-data\\waypoints\\')
})

test('a turn that ends with only parked work left finishes the plan', async ($, on) => {
  const w = world(on)
  // the engine's own end of the turn, beneath the mod
  on('turn.complete', async () => ({ text: '' }) as any)
  await start($)
  await $.tool.call({ tool: TOOL, action: 'plan', tasks: [{ title: 'fix', size: 'M' }, { title: 'open the PR', size: 'S' }], tool_use_id: 'p1' })
  await $.tool.call({ tool: TOOL, action: 'done', id: 1, tool_use_id: 'p2' })
  const r: any = await $.tool.call({ tool: TOOL, action: 'park', id: 2, note: 'waiting on the other team', tool_use_id: 'p3' })
  expect(r.result).toContain('Plan: 1 of 1 tasks done, 100% of the work. 1 parked (not counted).')
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 'turn-1', reason: 'answer' } as any)
  expect(w.toasts.some((t) => t.startsWith('Plan done in'))).toBe(true)
})
