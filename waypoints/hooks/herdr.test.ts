import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { hostBlocker, parseProbe, probeBlocker, shouldMark, markMessage, markScript, markArgv, probeArgv, MARK_DELAY_MS } from './herdr.mjs'

// Herdr status (userConfig herdr). Herdr shows an agent's status only from the program's own
// OSC 7501 reports, and Claude Code's say "done" when a turn ends with a plan task still open.
// With the setting on, Waypoints writes one `blocked` report of its own then, through a
// PowerShell child, after checking every prerequisite: Windows, a terminal session, a Herdr
// terminal, a PowerShell (5 or 7) in FullLanguage mode that finds hc.

const TOOL = 'mcp__waypoints__tasks'
const NOW = new Date(2026, 10, 5, 18, 30).getTime()
const READY = JSON.stringify({ ps: 5, lang: 'FullLanguage', hc: 'C:\\hc.exe' })

type Opts = {
  env?: Record<string, string>
  /** What each shell answers the probe: stdout, or 'missing' to make it reject. */
  probe?: Record<string, string>
}

function world(on: On, o: Opts = {}) {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, {})
  mock.env(on, o.env ?? { USERPROFILE: 'C:/Users/bats', OS: 'Windows_NT', HC_TERMINAL_ID: 't9' })
  const toasts: string[] = []
  const runs: (readonly string[])[] = []
  const probe = o.probe ?? { 'powershell.exe': READY }
  on('session.start', async () => ({ cwd: 'C:/bats' }) as any)
  on('session.surface', async () => ({ value: 'terminal' }) as any)
  on('session.surfaces', async () => ({ value: ['terminal'] }) as any)
  on('ui.log', async () => ({ value: undefined }) as any)
  on('session.id', async () => ({ value: 'sess-1' }) as any)
  on('session.cwd', async () => ({ value: 'C:/bats' }) as any)
  on('fs.exists', async () => ({ value: false }) as any)
  on('fs.read', async () => {
    throw new Error('missing')
  })
  on('fs.write', async () => ({ value: undefined }) as any)
  on('fs.list', async () => ({ value: [] }) as any)
  on('process.run', async (_$, e) => {
    runs.push(e.argv)
    const exe = e.argv[0]
    const script = String(e.argv.at(-1))
    if (script.includes('ConvertTo-Json -Compress') && !script.includes('7501')) {
      const answer = probe[exe]
      if (answer === undefined || answer === 'missing') throw new Error('not found')
      return { value: { exitCode: 0, stdout: answer, stderr: '' } } as any
    }
    return { value: { exitCode: 0, stdout: 'ok 1234', stderr: '' } } as any
  })
  on('tool.register', async () => ({ value: { tool: TOOL } }) as any)
  on('command.register', async (_$, e) => ({ value: { command: e.name } }) as any)
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as any
  })
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }) as any)
  on('turn.complete', async () => ({ text: '' }) as any)
  on('classic.Stop', async () => ({}) as any)
  on('tool.call', async () => ({ result: 'ok', text: 'ok' }) as any)
  const marks = () => runs.filter((a) => String(a.at(-1)).includes('7501'))
  const probes = () => runs.filter((a) => !String(a.at(-1)).includes('7501')).map((a) => a[0])
  return { clock, toasts, runs, marks, probes }
}

const start = ($: any, interactive = true, surface: string | null = 'terminal') => $.session.start({ cwd: 'C:/bats', surface, isInteractive: interactive })
let n = 0
const begin = ($: any) => $.turn.start({ text: 'go', turnId: 'turn-' + ++n } as any)
const end = ($: any, how: Record<string, unknown> = {}) =>
  $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, reason: 'answer', turnId: 'turn-' + n, ...how } as any)
const task = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: TOOL, tool_use_id: 'w' + ++n, ...input } as any)
const STOP = { hook_event_name: 'Stop', session_id: 's', transcript_path: 'C:/bats/t.jsonl', cwd: 'C:/bats', stop_hook_active: false } as const
const ON = { options: { herdr: 'on' } }

// A turn that plans alpha and beta and finishes alpha only
async function pausedTurn($: any, w: ReturnType<typeof world>, opts: { stop?: unknown[] } = {}) {
  await begin($)
  await task($, { action: 'plan', tasks: [{ title: 'alpha', size: 'S' }, { title: 'beta', size: 'S' }] })
  await task($, { action: 'start', id: 1 })
  await task($, { action: 'done', id: 1 })
  await end($)
  if (opts.stop) await $.classic.Stop({ ...STOP, background_tasks: opts.stop } as any)
}

// ---------- the pieces ----------

test('hostBlocker: off, then Windows, a terminal session, a Herdr terminal', async () => {
  const ok = { option: 'on', win: true, interactive: true, surface: 'terminal', terminalId: 't9' }
  expect(hostBlocker(ok)).toBe('')
  expect(hostBlocker({ ...ok, option: 'off' })).toBe('off')
  expect(hostBlocker({ ...ok, option: undefined })).toBe('off')
  expect(hostBlocker({ ...ok, win: false })).toContain('Windows only')
  // the Desktop app (its Code tab) is an SDK host: not interactive, nothing drawn at start
  expect(hostBlocker({ ...ok, interactive: false, surface: null })).toBe('not a terminal session')
  expect(hostBlocker({ ...ok, surface: 'vscode' })).toBe('not a terminal session')
  expect(hostBlocker({ ...ok, terminalId: '' })).toBe('not running in a Herdr terminal')
})

test('the probe needs FullLanguage mode and hc, and survives noise before its JSON line', async () => {
  expect(probeBlocker(parseProbe(READY))).toBe('')
  expect(probeBlocker(parseProbe('Loading profile...\r\n' + READY + '\r\n'))).toBe('')
  expect(probeBlocker(parseProbe(JSON.stringify({ ps: 5, lang: 'ConstrainedLanguage', hc: 'x' })))).toBe('PowerShell runs in ConstrainedLanguage language mode')
  expect(probeBlocker(parseProbe(JSON.stringify({ ps: 7, lang: 'FullLanguage', hc: null })))).toContain('hc is not on PATH')
  expect(probeBlocker(parseProbe('garbage'))).toBe('PowerShell did not answer')
  expect(probeBlocker(null)).toBe('PowerShell did not answer')
  expect(probeArgv('pwsh.exe').slice(0, 4)).toEqual(['pwsh.exe', '-NoProfile', '-NonInteractive', '-Command'])
})

const plan = (tasks: { status: string; title?: string }[], extra: Record<string, unknown> = {}) => ({
  status: 'running',
  active: false,
  lastTurnEnd: NOW,
  tasks: tasks.map((t, i) => ({ id: i + 1, size: 'S', title: t.title ?? 'task ' + (i + 1), status: t.status })),
  ...extra,
})

test('shouldMark: a paused plan with an open task of its own, nothing running, not stopped with Esc', async () => {
  expect(shouldMark(plan([{ status: 'done' }, { status: 'todo' }]), [])).toBe(true)
  expect(shouldMark(plan([{ status: 'done' }, { status: 'todo' }]), ['sleep 50'])).toBe(false)
  expect(shouldMark(plan([{ status: 'done' }, { status: 'parked' }]), [])).toBe(false)
  expect(shouldMark(plan([{ status: 'done' }, { status: 'done' }]), [])).toBe(false)
  expect(shouldMark(plan([{ status: 'todo' }], { interrupted: true }), [])).toBe(false)
  expect(shouldMark(plan([{ status: 'todo' }], { active: true }), [])).toBe(false)
  expect(shouldMark(plan([{ status: 'todo' }], { status: 'met' }), [])).toBe(false)
  expect(shouldMark(null, [])).toBe(false)
})

test('the message names the next open task, masked', async () => {
  const g = plan([{ status: 'done', title: 'alpha' }, { status: 'parked', title: 'ship' }, { status: 'todo', title: 'beta secret' }])
  expect(markMessage(g)).toBe('Waypoints: waiting on you · next beta secret')
  expect(markMessage(g, (s: string) => s.replace('secret', '•••'))).toBe('Waypoints: waiting on you · next beta •••')
})

test('the script carries the message as char codes: no text of the plan is parsed, no double quote anywhere', async () => {
  const evil = `x"; Remove-Item C:\\ -Recurse; '$(calc)' \``
  const script = markScript(evil)
  expect(script).not.toContain('Remove-Item')
  expect(script).not.toContain('"')
  expect(script).toContain([...evil].map((c) => c.charCodeAt(0)).join(','))
  // the checks the script makes before it writes
  for (const step of ["'skip sub-agent'", "'skip no-report'", "'skip not-this-terminal'", 'ParentProcessId', "'skip unsettled'", 'AttachConsole', 'CreateFileW', 'state=blocked:app=claude-code:kind=question']) expect(script).toContain(step)
  // hc's JSON is read as UTF-8 even where the console's code page is not
  expect(script.split('\n')[2]).toBe('[Console]::OutputEncoding = [Text.Encoding]::UTF8')
  expect(markArgv('powershell.exe', 'hi').slice(0, 4)).toEqual(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command'])
})

// ---------- through the hooks ----------

test('off by default: no PowerShell ever runs', async ($, on) => {
  const w = world(on)
  await start($)
  await pausedTurn($, w)
  await w.clock.advance(MARK_DELAY_MS + 1000)
  expect(w.runs).toEqual([])
})

test('on in a Herdr terminal: a turn ending mid-plan marks Herdr once the Stop list has landed', ON, async ($, on) => {
  const w = world(on)
  await start($)
  await pausedTurn($, w)
  expect(w.marks()).toEqual([])
  await w.clock.advance(MARK_DELAY_MS)
  expect(w.marks()).toHaveLength(1)
  expect(w.marks()[0][0]).toBe('powershell.exe')
  expect(w.toasts.filter((t) => t.includes('Herdr'))).toEqual([])
})

test('Windows PowerShell missing: PowerShell 7 does it', { options: { herdr: 'on' } }, async ($, on) => {
  const w = world(on, { probe: { 'powershell.exe': 'missing', 'pwsh.exe': READY } })
  await start($)
  await pausedTurn($, w)
  await w.clock.advance(MARK_DELAY_MS)
  expect(w.probes()).toEqual(['powershell.exe', 'pwsh.exe'])
  expect(w.marks()[0][0]).toBe('pwsh.exe')
})

test('no PowerShell at all, or a locked-down one: one toast, and nothing is marked', ON, async ($, on) => {
  const w = world(on, { probe: { 'powershell.exe': JSON.stringify({ ps: 5, lang: 'ConstrainedLanguage', hc: 'x' }), 'pwsh.exe': 'missing' } })
  await start($)
  await pausedTurn($, w)
  await w.clock.advance(MARK_DELAY_MS)
  expect(w.marks()).toEqual([])
  expect(w.toasts.filter((t) => t.includes('Herdr'))).toEqual(['Waypoints: Herdr status is on, but PowerShell runs in ConstrainedLanguage language mode'])
})

test('neither shell installed: the toast says so', ON, async ($, on) => {
  const w = world(on, { probe: {} })
  await start($)
  await w.clock.advance(1) // the probe runs beside session.start, not in it
  expect(w.toasts.filter((t) => t.includes('Herdr'))).toEqual(['Waypoints: Herdr status is on, but neither powershell.exe nor pwsh.exe runs'])
})

// The setting is shared by every session on the machine, so where it cannot apply it stays quiet
async function quiet($: any, on: On, env: Record<string, string>, interactive = true, surface: string | null = 'terminal') {
  const w = world(on, { env })
  await start($, interactive, surface)
  await pausedTurn($, w)
  await w.clock.advance(MARK_DELAY_MS)
  expect(w.runs).toEqual([])
  expect(w.toasts.filter((t) => t.includes('Herdr'))).toEqual([])
}

test('outside a Herdr terminal: nothing runs and nothing is said', ON, async ($, on) => {
  await quiet($, on, { USERPROFILE: 'C:/Users/bats', OS: 'Windows_NT' })
})

test('on a Mac, even in Herdr: nothing runs and nothing is said', ON, async ($, on) => {
  await quiet($, on, { HOME: '/Users/bats', HC_TERMINAL_ID: 't9' })
})

test('in the Desktop app (an SDK host): nothing runs and nothing is said', ON, async ($, on) => {
  await quiet($, on, { USERPROFILE: 'C:/Users/bats', OS: 'Windows_NT', HC_TERMINAL_ID: 't9' }, false, null)
})

test('background work left running, a plan finished, or a new turn first: no mark', ON, async ($, on) => {
  const w = world(on)
  await start($)
  await pausedTurn($, w, { stop: [{ id: 'b1', type: 'shell', description: 'sleep 50' }] })
  await w.clock.advance(MARK_DELAY_MS)
  expect(w.marks()).toEqual([])
  // the person answers before the delay is up: that turn's mark never runs
  await begin($)
  await end($)
  await begin($)
  await w.clock.advance(MARK_DELAY_MS)
  expect(w.marks()).toEqual([])
  // the plan finishes: nothing waits on the person
  await task($, { action: 'start', id: 2 })
  await task($, { action: 'done', id: 2 })
  await end($)
  await w.clock.advance(MARK_DELAY_MS)
  expect(w.marks()).toEqual([])
})

test('a turn stopped with Esc is not marked: the person is there', ON, async ($, on) => {
  const w = world(on)
  await start($)
  await begin($)
  await task($, { action: 'plan', tasks: [{ title: 'alpha', size: 'S' }, { title: 'beta', size: 'S' }] })
  await end($, { isAborted: true, reason: 'aborted' })
  await w.clock.advance(MARK_DELAY_MS)
  expect(w.marks()).toEqual([])
})
