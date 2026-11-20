import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { DayRecord, Kind, Settings, Tab } from '../types'
import { keyOf, noonOf } from './dates'
import { classifyTask, KIND_LABEL } from './kinds'
import type { ToolUse } from './kinds'
import { COLORS, fit } from './layout'
import { bucket, humanPrompts } from './history'
import type { Found } from './history'
import { arm, claim, disarm, isTypedPrompt } from './record'
import { repoName } from './repo'
import { absorbPrompts, addPrompt, addTask, DEFAULT_SETTINGS, modelName, normalizeDay, normalizeSettings, tasksOf } from './report'
import { drawPane } from './view'

const PANE = 'work-report'
// Asked for by a command or a button, so it is placed at any width that holds it
const PANE_ARGS = { id: PANE, title: 'Work Report', focus: true, closeOnEscape: true, rows: 46, columns: 72 } as const

// What the drawings read lives in $.state, so a hot reload keeps it; the days
// and the settings are also kept in $.store across sessions
const daysAtom = atom({ plugin: 'work-report', key: 'days' } as const, {})
const settingsAtom = atom({ plugin: 'work-report', key: 'settings' } as const, DEFAULT_SETTINGS)
const tabAtom = atom({ plugin: 'work-report', key: 'tab' } as const, 'today')
// Whether a backfill has ever finished: until it has, the pane points to it
const backfilledAtom = atom({ plugin: 'work-report', key: 'backfilled' } as const, false)

const DAY_PREFIX = 'day:'
const TAB_WORDS: readonly Tab[] = ['today', 'week', 'month', 'year']

// Typed prompts waiting for their turn to start, and the turn being counted.
// A reload drops these: at worst the one task in flight is not counted.
let armed: string[] = []
let active: { turnId: string; uses: ToolUse[] } | null = null
const MAX_USES = 500
// The session id begin() last ran for, and a begin() in flight
let begunFor: string | null = null
let beginning: Promise<void> | null = null
const CLEAR_CHECK_MS = 5000

const plain = (err: unknown) => (err instanceof Error && err.message ? err.message : 'something went wrong')

// ── Reading and writing the store ────────────────────────────────────────

async function loadAll($: EngineInterface) {
  const keys = (await $.store.keys()).filter(k => k.startsWith(DAY_PREFIX))
  const entries = await Promise.all(keys.map(async k => [k.slice(DAY_PREFIX.length), normalizeDay(await $.store.get(k))] as const))
  const days: Record<string, DayRecord> = {}
  for (const [key, rec] of entries) days[key] = rec
  await update($, daysAtom, () => days)
  const settings = normalizeSettings(await $.store.get('settings'))
  await update($, settingsAtom, () => settings)
  const backfilled = (await $.store.get('backfilled')) === true
  await update($, backfilledAtom, () => backfilled)
}

// Every change to a day is a read, an edit and a write; one after another, so a
// task finishing as a prompt is counted cannot overwrite it
let writes: Promise<unknown> = Promise.resolve()
function inTurn<T>(job: () => Promise<T>): Promise<T> {
  const run = writes.then(job, job)
  writes = run.catch(() => undefined)
  return run
}

/** A day's record read back from the store, changed by `edit`, saved, and put in the state the pane draws. */
function changeDay($: EngineInterface, key: string, edit: (rec: DayRecord) => DayRecord): Promise<void> {
  return inTurn(async () => {
    const now = edit(normalizeDay(await $.store.get(`${DAY_PREFIX}${key}`)))
    await $.store.set(`${DAY_PREFIX}${key}`, now)
    await update($, daysAtom, days => ({ ...days, [key]: now }))
  })
}

/** One more finished task, added to today's record. Read back first, so a second session's counts are not lost. */
async function recordTask($: EngineInterface, kind: Kind, model: string) {
  const key = keyOf(noonOf(await $.clock.now()))
  await changeDay($, key, rec => addTask(rec, kind, model))
}

// ── Typed prompts, by repo ───────────────────────────────────────────────

const repoCache = new Map<string, string>()

/** What `git rev-parse <args>` prints, first line; null when git says no, is missing or is slow. */
async function gitLine($: EngineInterface, cwd: string, args: string[]): Promise<string | null> {
  try {
    const r = await $.process.run(['git', 'rev-parse', ...args], { cwd, timeoutMs: 5000 })
    return r.exitCode === 0 ? (r.stdout.split(/\r?\n/)[0]?.trim() || null) : null
  } catch {
    return null
  }
}

/** The repo a folder is in, by name. Asked of git once per folder; a folder git knows nothing of is named by itself. */
async function repoOf($: EngineInterface, folder: string, cache = repoCache): Promise<string> {
  const hit = cache.get(folder)
  if (hit !== undefined) return hit
  const [top, absolute] = await Promise.all([gitLine($, folder, ['--show-toplevel']), gitLine($, folder, ['--path-format=absolute', '--git-common-dir'])])
  // a git older than 2.31 has no --path-format: ask again, and the answer is read against the folder
  const common = absolute ?? (top ? await gitLine($, folder, ['--git-common-dir']) : null)
  const name = repoName(folder, { common, top })
  // only what git confirmed is kept: a slow answer must not stick for the whole session
  if (top !== null || common !== null) cache.set(folder, name)
  return name
}

/** One more typed prompt, on today's record and in the repo the session is in. Never in the way of the prompt. */
async function countPrompt($: EngineInterface): Promise<void> {
  try {
    const repo = await repoOf($, String(await $.session.root()))
    const key = keyOf(noonOf(await $.clock.now()))
    await changeDay($, key, rec => addPrompt(rec, repo))
  } catch {
    // a prompt that cannot be counted is not worth a word
  }
}

let backfilling = false

/**
 * One saved session's text. The engine refuses a file over 4 MiB, and the
 * longest sessions, which hold the most prompts, are the ones that are. Those
 * are filtered by the system's own search down to the lines that mark a human
 * (`findstr` on Windows, `grep` elsewhere), which is all the count reads. The
 * search runs only for such files and answers in tens of milliseconds.
 */
async function sessionText($: EngineInterface, path: string): Promise<string | null> {
  try {
    const text = await $.fs.read(path)
    if (typeof text === 'string') return text
  } catch {
    // too big for the engine to hand over, or not readable: the search below tells which
  }
  try {
    const isWindows = (await $.env.get('OS')) === 'Windows_NT'
    // `.` stands for the quotes in "kind":"human", which a command line cannot carry safely
    const argv = isWindows ? ['findstr', '/R', '/C:kind.:.human', path.replace(/\//g, '\\')] : ['grep', '-E', 'kind.:.human', path]
    const r = await $.process.run(argv, { timeoutMs: 60_000 })
    return r.exitCode === 0 ? r.stdout : null
  } catch {
    return null
  }
}

/**
 * Counts the prompts in the sessions Claude Code has saved and adds them to
 * the days and repos they belong to. Takes the larger of what a day holds and
 * what the files show, so it is safe to run again and never counts twice.
 * Only prompts are touched: tasks, hours and dollars stay as they were.
 */
async function backfill($: EngineInterface): Promise<string> {
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || ''
  const base = ((await $.env.get('CLAUDE_CONFIG_DIR')) || (home ? `${home}/.claude` : '')).replace(/\\/g, '/').replace(/\/+$/, '')
  if (base === '') return 'Work Report could not find the folder Claude Code keeps your sessions in.'
  const projects = `${base}/projects`
  let folders: Awaited<ReturnType<EngineInterface['fs']['list']>>
  try {
    folders = await $.fs.list(projects)
  } catch {
    return `Work Report found no saved sessions in ${projects}.`
  }

  const found: Found[] = []
  let files = 0
  for (const folder of folders.filter(f => f.kind === 'dir' || f.isLink)) {
    let entries: typeof folders = []
    try {
      entries = await $.fs.list(`${projects}/${folder.name}`)
    } catch {
      continue
    }
    for (const file of entries.filter(f => /\.jsonl$/i.test(f.name) && (f.kind === 'file' || f.isLink))) {
      // a file that cannot be read at all is left out
      const text = await sessionText($, `${projects}/${folder.name}/${file.name}`)
      if (text === null) continue
      files += 1
      for (const p of humanPrompts(text)) found.push(p)
    }
  }

  // the repo of each folder a session was in; one that is gone is named by its own folder
  const names = new Map<string, string>()
  const own = new Map<string, string>()
  for (const cwd of new Set(found.map(f => f.cwd))) names.set(cwd, await repoOf($, cwd.replace(/\\/g, '/'), own))
  const days = bucket(found, cwd => names.get(cwd) ?? repoName(cwd, { common: null, top: null }), ms => keyOf(noonOf(ms)))

  const repos = new Set<string>()
  let prompts = 0
  for (const [key, row] of Object.entries(days)) {
    await changeDay($, key, rec => absorbPrompts(rec, row))
    for (const [name, n] of Object.entries(row)) {
      repos.add(name)
      prompts += n
    }
  }
  // it has run: the pane stops pointing to it
  try {
    await $.store.set('backfilled', true)
  } catch {
    // shown for this session still
  }
  await update($, backfilledAtom, () => true)
  if (prompts === 0) return `Work Report read ${files} saved ${files === 1 ? 'session' : 'sessions'} and found no prompts you typed.`
  return (
    `Work Report counted ${prompts} typed ${prompts === 1 ? 'prompt' : 'prompts'} in ${repos.size} ${repos.size === 1 ? 'repo' : 'repos'} over ${Object.keys(days).length} ${Object.keys(days).length === 1 ? 'day' : 'days'}, ` +
    `from ${files} saved ${files === 1 ? 'session' : 'sessions'}. Sessions Claude Code has already deleted cannot be counted. Running it again changes nothing.`
  )
}

// ── The pane ─────────────────────────────────────────────────────────────

/** Opens the pane. A window too narrow for it is the one thing worth a line: the person asked and nothing came. */
async function openPane($: EngineInterface): Promise<void> {
  try {
    const r = await $.ui.open(PANE_ARGS)
    if (!r.isPlaced) $.ui.toast('Work Report needs a wider window to open. Widen the terminal and try /work-report again.')
  } catch {
    // no surface to ask: nothing to show
  }
}

async function openOn($: EngineInterface, tab: Tab | null): Promise<void> {
  if (tab) await update($, tabAtom, () => tab)
  await openPane($)
}

// ── /work-report settings ────────────────────────────────────────────────

const SETTING_ORDER: readonly Kind[] = ['emails', 'code', 'documents', 'images', 'research', 'other']

const SETTING_NAMES: Record<string, Kind | 'rate' | 'band'> = {
  band: 'band',
  chip: 'band',
  button: 'band',
  rate: 'rate',
  emails: 'emails',
  email: 'emails',
  code: 'code',
  coding: 'code',
  commands: 'code',
  documents: 'documents',
  document: 'documents',
  docs: 'documents',
  images: 'images',
  image: 'images',
  video: 'images',
  research: 'research',
  other: 'other',
}

const num = (n: number) => String(Math.round(n * 100) / 100)

const BAND_WORDS: Record<string, boolean> = { on: true, off: false, show: true, hide: false }

function settingsText(s: Settings): string {
  const minutes = SETTING_ORDER.map(k => `${KIND_LABEL[k]} ${num(s.minutes[k])}`).join(', ')
  return (
    `Minutes saved per task: ${minutes}. Hourly rate: $${num(s.rate)}. Chip above the prompt: ${s.band ? 'on' : 'off'}. ` +
    'Hours and dollars are estimates. Change one with /work-report settings rate 75, /work-report settings emails 15 or /work-report settings band off.'
  )
}

/** The settings for this session, and across sessions when the store takes them. */
async function keepSettings($: EngineInterface, next: Settings): Promise<void> {
  await update($, settingsAtom, () => next)
  try {
    await $.store.set('settings', next)
  } catch {
    // changed for this session still
  }
}

async function settingsCommand($: EngineInterface, args: string[]): Promise<string> {
  const current = normalizeSettings(await read($, settingsAtom))
  if (args.length === 0) return settingsText(current)

  const name = SETTING_NAMES[(args[0] ?? '').toLowerCase()]
  if (!name) {
    return `I do not know the setting "${args[0]}". The ones you can change are rate, emails, code, documents, images, research, other and band. For example: /work-report settings rate 75.`
  }
  if (name === 'band') {
    const on = BAND_WORDS[(args[1] ?? '').toLowerCase()]
    if (on === undefined) return 'The chip takes on or off, for example /work-report settings band off.'
    await keepSettings($, { ...current, band: on })
    return on ? 'The Work report chip is back above the prompt.' : 'The Work report chip is hidden. /work-report still opens the pane, and /work-report settings band on brings the chip back.'
  }
  const raw = args[1]
  const value = raw === undefined ? NaN : Number(raw.replace(/^\$/, ''))
  if (!Number.isFinite(value) || value < 0) {
    return name === 'rate' ? 'The rate must be a number, for example /work-report settings rate 75.' : `The minutes must be a number, for example /work-report settings ${name} 15.`
  }
  const limit = name === 'rate' ? 100_000 : 1440
  if (value > limit) {
    return name === 'rate' ? `That rate is too high. Use a number up to ${limit}.` : `That is more than a day. Use a number of minutes up to ${limit}.`
  }
  const next: Settings = name === 'rate' ? { ...current, rate: value } : { ...current, minutes: { ...current.minutes, [name]: value } }
  await keepSettings($, next)
  return name === 'rate'
    ? `Hourly rate is now $${num(value)}. Hours and dollars stay estimates.`
    : `${KIND_LABEL[name]} now save ${num(value)} minutes each. Hours and dollars stay estimates.`
}

const USAGE =
  'Work Report: /work-report opens the pane, /work-report today, week, month or year opens it on that tab, /work-report settings lists the estimate settings, /work-report settings rate 75 or /work-report settings emails 15 changes one, and /work-report backfill counts the prompts in your saved sessions.'

// ── The module ───────────────────────────────────────────────────────────

/** Everything a session needs at its start: the command, and the days and settings read back from the store. */
async function begin($: EngineInterface): Promise<void> {
  armed = []
  active = null
  try {
    begunFor = String(await $.session.id())
  } catch {
    begunFor = null
  }
  try {
    await $.command.register({
      name: 'work-report',
      description: 'Show what Claude has done for you: tasks finished, hours saved and what that is worth',
      argumentHint: '[today | week | month | year | settings | backfill]',
      immediate: true,
    })
  } catch {
    // the recording still works without the command
  }
  try {
    await loadAll($)
  } catch {
    // start empty: the next finished task is still recorded
  }
}

/**
 * /clear goes on under a new session id and raises no session.start, so the
 * command, which is declared per session, and the days read into $.state would
 * be gone. A new id is the clear: begin() again. Not the settings hook's own
 * SessionStart, which a Team or Enterprise plan's guard skips for every mod.
 */
async function beginIfCleared($: EngineInterface): Promise<void> {
  if (beginning) return beginning
  let id: string
  try {
    id = String(await $.session.id())
  } catch {
    return
  }
  if (id === begunFor) return
  beginning = begin($).finally(() => {
    beginning = null
  })
  return beginning
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await begin($)
    // so /work-report is back within seconds of a /clear, before anything is typed
    $.clock.every(CLEAR_CHECK_MS, () => beginIfCleared($).catch(() => undefined))
    return next(e)
  })

  // A typed prompt is armed here and claimed when its turn starts. Anything
  // that fails in this hook lets the prompt through untouched. The first prompt
  // after a /clear sets the session up first, so its task is counted.
  on('prompt.submit', async ($, e, next) => {
    await beginIfCleared($)
    const origin = e.origin as { kind: string; asUser?: boolean }
    const typed = isTypedPrompt(e.text, { kind: origin.kind, asUser: origin.asUser })
    if (typed) armed = arm(armed, e.text)
    const r = await next(e)
    if (typed) {
      if ('drop' in r && r.drop !== undefined) armed = disarm(armed, e.text)
      else {
        if (typeof r.text === 'string' && r.text !== e.text) armed = arm(armed, r.text)
        // a prompt that went through is counted for its repo, after the fact and off the prompt's path
        void countPrompt($)
      }
    }
    return r
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    const hit = claim(armed, e.text)
    armed = hit.queue
    active = hit.found ? { turnId: e.turnId, uses: [] } : null
    return next(e)
  }).catch(($, e, next) => next(e))

  // The tools the counted turn used, helper agents' too: they are part of the work
  on('tool.call', async ($, e, next) => {
    if (active && active.uses.length < MAX_USES) {
      const input = e as unknown as Record<string, unknown>
      const path = [input.file_path, input.path, input.notebook_path].find(v => typeof v === 'string')
      // the start of a command is enough to tell ffmpeg from git; it is not kept past the turn
      const command = typeof input.command === 'string' ? input.command.slice(0, 400) : undefined
      active.uses.push({
        tool: String(e.tool),
        ...(typeof path === 'string' ? { path } : {}),
        ...(command ? { command } : {}),
      })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A finished task: the turn answered, was not cancelled, and is the main loop's
  on('turn.complete', async ($, e, next) => {
    const turn = active
    if (turn && turn.turnId === e.turnId && !e.agentId) {
      active = null
      if (e.reason === 'answer' && !e.isAborted) {
        try {
          await recordTask($, classifyTask(turn.uses), modelName(e.usage?.model))
        } catch {
          // a task that cannot be saved is not worth interrupting the answer for
        }
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Answers at once; the pane opens in the background
  on('command.run', { command: 'work-report' }, async ($, e) => {
    try {
      const raw = String(e.args ?? '').trim()
      const parts = raw === '' ? [] : raw.split(/\s+/)
      const word = (parts[0] ?? '').toLowerCase()
      if (word === 'settings' || word === 'setting') return { text: await settingsCommand($, parts.slice(1)) }
      if (word === 'help' || word === '?') return { text: USAGE }
      if (word === 'backfill') {
        if (backfilling) return { text: 'Work Report is already counting the prompts in your saved sessions.' }
        backfilling = true
        // can take a while: answer now, say how it went when it is done
        void backfill($)
          .then(text => $.ui.toast(text))
          .catch(err => $.ui.toast(`Work Report could not count your saved sessions: ${plain(err)}.`))
          .finally(() => {
            backfilling = false
          })
        return { text: 'Counting the prompts you typed in your saved sessions. This can take a moment; a note shows when it is done.' }
      }
      const tab = TAB_WORDS.find(t => t === word) ?? null
      if (raw === '' || tab) {
        void openOn($, tab).catch(() => undefined)
        return { text: tab ? `Opening the work report on ${tab}. Hours and dollars in it are estimates.` : 'Opening the work report. Hours and dollars in it are estimates.' }
      }
      return { text: `I do not know "${raw}". ${USAGE}` }
    } catch (err) {
      return { text: `Work Report could not do that: ${plain(err)}.` }
    }
  }).catch(() => ({ text: 'Work Report could not do that right now.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const el = $.ui.resolve(e) as unknown as Elements['terminal']
    if (e.surface === 'mobile') {
      const { Text } = el
      return <Text color={COLORS.muted}>Work Report needs the terminal or the desktop app.</Text>
    }
    const days = (await read($, daysAtom)) ?? {}
    const settings = normalizeSettings(await read($, settingsAtom))
    const tab = (await read($, tabAtom)) ?? 'today'
    const backfilled = (await read($, backfilledAtom)) === true
    const now = await $.clock.now()
    const width = Math.max(20, Math.min(110, e.props.bodyColumns || PANE_ARGS.columns))
    const press =
      (fn: () => Promise<unknown>) =>
      () => {
        fn().catch(err => $.ui.toast(`Work Report: ${plain(err)}`))
      }
    // the terminal's table answers Svg too but draws it empty: its figures are text
    const Svg = e.surface === 'terminal' ? undefined : (el as unknown as Partial<Elements['desktop']>).Svg
    return drawPane(el, { width, tab, days, settings, backfilled, now, ...(Svg ? { Svg } : {}) }, { pickTab: t => press(() => update($, tabAtom, () => t))() })
  })

  // The one button: a chip above the prompt that opens the pane. The band is
  // shared, so what the others draw is kept beneath it. `/work-report settings band
  // off` hides it, for one who opens the pane from another mod's menu.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    if (normalizeSettings(await read($, settingsAtom)).band === false) return below
    const { Box, Button, Text } = $.ui.resolve(e)
    const days = (await read($, daysAtom)) ?? {}
    const today = tasksOf(days[keyOf(noonOf(await $.clock.now()))])
    const label = fit(Math.max(0, (e.props.bodyColumns || 80) - 14), [`${today} ${today === 1 ? 'task' : 'tasks'} today`, `${today} today`, ''])
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Button key="work-report-open" plain onPress={() => void openPane($)}>
            <Text backgroundColor={COLORS.hair} color={COLORS.text}>
              {' Work report '}
            </Text>
          </Button>
          {label !== '' && <Text color={COLORS.muted}>{label}</Text>}
        </Box>
        {below}
      </Box>
    )
  })
}
