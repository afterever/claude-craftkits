// Waypoints: a progress bar for /goal, built from Claude's own task plan.
// (A fork of Nate Herk's goal-meter 1.0.0.)
// - /goal starts it. The mod asks Claude to plan the goal as sized tasks (S, M, L)
//   with the mod's tool, mcp__waypoints__tasks, then mark each task started and
//   done. Claude Code stopped shipping a task-list tool after 2.1.229, so the mod
//   brings its own. A plan made outside a /goal shows the same way.
// - The band above the prompt: the route (the plan as nodes and legs, weighted by
//   size), the ETA at this goal's own pace, what's running and who runs it, the next
//   task, and the goal check's latest "not met yet" reason. The drawing is in draw.mjs.
// - The footer: "◎ goal 69% · ~15m" in every view, terminal and Desktop.
// - /waypoints: a pane with this chat's whole task trail and every other chat's goal.
//   It opens by itself when a plan starts (userConfig pane: auto|off).
//   /waypoints hide|show (the band), /waypoints auto on|off, /waypoints clear.
// - In a /goal, file edits wait until Claude has planned.
// - The look (userConfig palette, animation) follows Agent-Pulse's by default.
// - A standing line in the system prompt asks Claude to plan any multi-step work,
//   not only a /goal; /waypoints auto off removes it.
// - Managed mode (userConfig managed: auto|on|off) leaves out the hooks a Team or
//   Enterprise plan's guard skips, and switches itself on when it sees the guard.
// - Each chat writes ~/.claude/mods-data/waypoints/<session>.json for /waypoints.
//   The mod sends no model requests of its own.

import { minutes, clip, bar, basename } from './fmt.mjs'
import { makeMasker } from './privacy.mjs'
import { newGoal, applyAction, progress, eta, parseCheck, isStopWord, normalizeTasks, planSubject, TOOL_SPEC, instruction, standing, nudge, strictDeny } from './plan.mjs'
import { rolesOf, resolveLook } from './palette.mjs'
import { drawBand, drawPane, statsLine, label, FULL_MS } from './draw.mjs'
import { createAutoPane } from './pane.mjs'
import { OTHERS_MS, shownPath, pickPrunable, deleteArgv } from './prune.mjs'
import { SHELLS, MARK_DELAY_MS, hostBlocker, probeArgv, parseProbe, probeBlocker, shouldMark, markMessage, markArgv } from './herdr.mjs'

const DIR = '/.claude/mods-data/waypoints'
const PANE = 'waypoints'
const LINGER = { '30 seconds': 30000, '1 minute': 60000, '3 minutes': 180000, '10 minutes': 600000 } // the `linger` setting
const LINGER_DEFAULT = '1 minute'
let RECENT_MS = LINGER[LINGER_DEFAULT] // a finished goal stays on screen this long
const REOPEN_MS = 5 * 60000 // a goal closed on its tasks reopens if Claude carries on this soon
const NUDGE_AFTER = 4 // tool calls into a goal with no plan before the reminder
const WRITERS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])

let G = null
let sessionId = ''
let home = ''
let win = false // the host is Windows: prune deletes with cmd's del
let cwd = ''
let now = 0
let toolName = 'mcp__waypoints__tasks'
let commandName = 'waypoints'
let settings = { auto: true }
let toolFailed = false
let hidden = false
let nudged = false
let callsWithoutPlan = 0
let pendingGoal = null
let paneUp = false // the pane is open (placed or waiting), from $.ui.panes() and ui.close
const autoPane = createAutoPane() // when the pane opens and closes by itself
let options = { palette: 'follow', animation: 'follow', pane: 'auto', linger: LINGER_DEFAULT, managed: 'auto', herdr: 'off' }
let herdr = { ready: false, exe: '' } // the herdr setting: ready once the PowerShell probe passed (herdr.mjs)
let markSeq = 0 // bumped by each turn: a pending Herdr mark whose turn is gone does nothing
let interactive = true // session.start's isInteractive: false under -p and in an SDK host (the Desktop app); then only a drawing surface means someone watches the bar
let asked = false // managed mode: the standing ask went out with a prompt this session
let seen = null // the main turn watched for a managed plan's guard: { compose, stop, done }
let switched = false // this load already asked to switch to managed mode
let look = { palette: 'ember', level: 'subtle' }
let roles = rolesOf('ember')
let others = []
let fileCount = 0 // the data folder's .json files, this chat's included
let transcriptPath = ''
const agentNames = new Map()
let waiting = [] // what the last turn left running in the background, named, from the Stop hook
let rec = { on: false, strict: false }
let mask = (s) => s

function goalFile(id) {
  return `${home}${DIR}/${id}.json`
}

function isRecent(g) {
  return g && g.status !== 'running' && g.endedAt && now - g.endedAt < RECENT_MS
}

async function save($) {
  if (!G || !sessionId) return
  G.updatedAt = now
  try {
    await $.fs.write(goalFile(sessionId), JSON.stringify({ ...G, label: basename(cwd) }))
  } catch {
    // the pane falls back to this chat alone
  }
}

async function restore($) {
  try {
    const path = goalFile(sessionId)
    if (!(await $.fs.exists(path))) return
    const saved = JSON.parse(await $.fs.read(path))
    if (saved && Array.isArray(saved.tasks) && now - (saved.updatedAt || 0) < 24 * 3600000) G = saved
  } catch {
    G = null
  }
}

async function loadOthers($) {
  const dir = home + DIR
  const list = []
  let count = 0
  try {
    for (const entry of await $.fs.list(dir)) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
      count += 1
      if (entry.name === sessionId + '.json') continue
      if (now - (entry.mtimeMs || 0) > OTHERS_MS) continue
      try {
        const g = JSON.parse(await $.fs.read(dir + '/' + entry.name))
        if (!g || !Array.isArray(g.tasks)) continue
        if (g.status !== 'running' && now - (g.endedAt || 0) > OTHERS_MS) continue
        list.push(g)
      } catch {
        // a file another chat is writing right now; next refresh reads it
      }
    }
  } catch {
    // no folder yet
  }
  fileCount = count
  others = list.sort((a, b) => (a.status === 'running' ? 0 : 1) - (b.status === 'running' ? 0 : 1) || b.updatedAt - a.updatedAt)
}

// /waypoints prune: deletes what pickPrunable picks with the host's own delete ($.fs has
// none), no shell and no dialog. Says what happened in words for a toast; the count is the
// files really gone.
async function prune($) {
  const dir = home + DIR
  const items = []
  try {
    for (const entry of await $.fs.list(dir)) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
      let goal = null
      try {
        goal = JSON.parse(await $.fs.read(dir + '/' + entry.name))
      } catch {
        // unreadable: pickPrunable keeps it while it is young
      }
      items.push({ name: entry.name, mtimeMs: entry.mtimeMs, goal })
    }
  } catch {
    // no folder yet
  }
  const paths = pickPrunable(items, { now, self: sessionId + '.json' }).map((name) => dir + '/' + name)
  if (!paths.length) return 'Nothing to prune'
  const argv = deleteArgv(win, paths)
  if (!argv) return `Prune did not run: delete old files by hand in ${shownPath(dir)}`
  let r
  try {
    r = await $.process.run(argv)
  } catch (err) {
    return `Prune did not run: ${clip(String(err && err.message ? err.message : err), 80)}`
  }
  let gone = 0
  for (const p of paths) if (!(await $.fs.exists(p))) gone += 1
  await loadOthers($)
  $.ui.invalidate('ui.render')
  if (!gone) return `Prune did not run: ${clip(r.stderr || 'exit ' + r.exitCode, 80)}`
  return `Pruned ${gone} old file${gone === 1 ? '' : 's'}`
}

async function readRecording($) {
  try {
    const path = (home || '.') + '/.claude/mods-data/recording.json'
    if (!(await $.fs.exists(path))) rec = { on: false, strict: false }
    else {
      const flag = JSON.parse(await $.fs.read(path))
      rec = { on: !!flag.on, strict: !!flag.on && !!flag.strict }
    }
  } catch {
    rec = { on: false, strict: false }
  }
  mask = rec.on ? makeMasker({ strict: rec.strict }) : (s) => s
}

// The palette and animation to draw with: this mod's own setting, or 'follow' Agent-Pulse's row
async function refreshLook($) {
  let rows = []
  try {
    rows = await $.config.list()
  } catch {
    // no rows: follow falls back to ember / subtle
  }
  const next = resolveLook(options, rows)
  if (next.palette === look.palette && next.level === look.level) return
  look = next
  roles = rolesOf(next.palette)
  $.ui.invalidate('ui.render')
}

// Whether the pane is open: the engine's own record, which survives a reload
async function refreshPanes($) {
  try {
    paneUp = (await $.ui.panes()).some((p) => p.id === PANE)
  } catch {
    // keep the last answer
  }
}

// The first plan of a goal opens the pane, unasked: it never takes the keys from the
// prompt, waits undrawn on a narrow window, and stays shut once the person closed it
async function maybeAutoOpen($) {
  await refreshPanes($)
  if (!autoPane.canOpen(options.pane, G, paneUp)) return
  try {
    await loadOthers($)
    // no `focus`: the pane never asks for the prompt's keys
    await $.ui.open({ id: PANE, title: 'Waypoints', closeOnEscape: true })
    paneUp = true
    autoPane.opened()
  } catch (err) {
    // nobody asked, so no toast; the log keeps the reason
    $.ui.log(`waypoints: the pane did not open (${err && err.message ? err.message : err})`)
  }
}

// A pane the mod opened leaves with the band; one the person opened stays
async function maybeAutoClose($) {
  if (!autoPane.shouldClose(paneUp, !!G && (G.status === 'running' || isRecent(G)))) return
  autoPane.takenOver()
  try {
    await $.ui.close({ id: PANE })
  } catch {
    // already gone
  }
  paneUp = false
}

async function registerCommand($) {
  const spec = { name: 'waypoints', description: 'Waypoints: this chat\'s goal task list and every chat\'s goal (/waypoints hide|show|auto on|off|clear|prune)', argumentHint: '[hide|show|auto on|off|clear|prune]', immediate: true }
  try {
    await $.command.register(spec)
    return 'waypoints'
  } catch {
    try {
      await $.command.register({ ...spec, name: 'waypoints-mod' })
      return 'waypoints-mod'
    } catch {
      return null
    }
  }
}

async function startGoal($, condition) {
  G = newGoal({ sessionId, condition, now, cwd })
  hidden = false
  nudged = false
  callsWithoutPlan = 0
  pendingGoal = null
  await save($)
  $.ui.invalidate('ui.render')
}

// The band and the footer's `done ✓` go when RECENT_MS is up. Nothing else redraws an idle
// session, so draw again just after rather than on the next 15 s tick
function expireAfter($) {
  $.clock.after(RECENT_MS + 200, async () => {
    now = await $.clock.now()
    await maybeAutoClose($)
    $.ui.invalidate('ui.render')
  })
}

async function stopGoal($, status) {
  if (!G || G.status !== 'running') return
  G.status = status
  G.endedAt = now
  G.active = false
  await save($)
  $.ui.invalidate('ui.render')
  expireAfter($)
}

async function finishGoal($, how) {
  if (!G || G.status !== 'running') return
  G.status = 'met'
  G.endedAt = now
  G.active = false
  G.finishedBy = how
  await save($)
  const took = minutes(G.endedAt - G.startedAt)
  $.ui.toast(`${G.kind === 'plan' ? 'Plan' : 'Goal'} done in ${took}: ${clip(mask(G.title), 60)}`)
  $.ui.invalidate('ui.render')
  // the full band keeps FULL_MS, then it is one row: draw again just after
  $.clock.after(FULL_MS + 200, async () => {
    now = await $.clock.now()
    $.ui.invalidate('ui.render')
  })
  expireAfter($)
}

async function serveTool($, e) {
  now = await $.clock.now()
  const action = String(e.action || 'show').toLowerCase()
  const first = normalizeTasks(e.tasks)[0]
  if (!G || (G.status !== 'running' && (action === 'plan' || action === 'add'))) {
    if (!first) return { result: `Waypoints: no plan in this chat yet. Call action "plan" with the tasks first, each { "title": "...", "size": "S" | "M" | "L" }.` }
    // a plan outside /goal: tracked the same way, named after its goal line, else its first task
    G = newGoal({ sessionId, condition: planSubject(e), now, cwd, kind: 'plan' })
    hidden = false
  }
  const by = e.by ? String(e.by) : e.agentId ? agentNames.get(e.agentId) || 'agent' : ''
  const firstPlan = action === 'plan' && !G.planAt
  const r = applyAction(G, e, { now, by })
  if (r.ok) {
    await save($)
    $.ui.invalidate('ui.render')
    if (firstPlan && G.planAt) await maybeAutoOpen($)
  }
  return { result: r.text }
}

// The goal check's verdict. Its row reaches session.append with no content (the
// payload is stored beside it, seen live 2026-10-02), so read the record from
// the end of the chat's log: a few lines, never the whole file (logs reach 200 MB).
async function lastGoalStatus($, since) {
  const path = transcriptPath
  if (!path) return null
  const windows = /^[A-Za-z]:/.test(path)
  const argv = windows
    ? ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', `Get-Content -LiteralPath '${path.replace(/'/g, "''")}' -Tail 12 -Encoding UTF8`]
    : ['tail', '-n', '12', path]
  let out = ''
  try {
    const r = await $.process.run(argv, { timeoutMs: 15000 })
    out = r.stdout || ''
  } catch {
    return null
  }
  const lines = out.split(/\r?\n/).filter((l) => l.includes('"goal_status"')).reverse()
  for (const line of lines) {
    try {
      const row = JSON.parse(line)
      const a = row.attachment
      if (!a || a.type !== 'goal_status') continue
      // an older check's record is not this check's verdict
      const ts = Date.parse(row.timestamp || '') || 0
      return ts && since && ts < since - 3000 ? null : a
    } catch {
      // a line cut by the tail
    }
  }
  return null
}

// The log is written a moment after the row reaches the hook: read it now, and
// again after 1.5 and 4 seconds when the verdict isn't there yet. Managed mode has
// no row to wake on (message null): it reads from the end of the turn, while the
// check may still be running, so it waits longer.
const WAITS = [1500, 4000]
const LATE_WAITS = [1500, 4000, 10000, 20000, 40000]
async function onCheck($, message, at, waits = WAITS) {
  if (!G || G.kind !== 'goal' || G.status !== 'running') return
  let verdict = await lastGoalStatus($, at)
  if (!verdict && message) {
    // a build that renders the verdict into the row itself
    const blocks = Array.isArray(message.content) ? message.content : []
    const c = parseCheck(blocks.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n'))
    verdict = c.met ? { met: true } : c.notMet ? { met: false, reason: c.reason } : null
  }
  // with no row to wake on, the newest record can still be the one the goal wrote
  if ((!verdict || (!message && verdict.sentinel)) && waits.length) {
    $.clock.after(waits[0], async () => {
      now = await $.clock.now()
      await onCheck($, message, at, waits.slice(1)).catch(() => {})
    })
    return
  }
  if (!verdict || verdict.sentinel) return // the row written when the goal is set
  if (verdict.met) return finishGoal($, 'check')
  G.check = { met: false, reason: clip(verdict.reason || 'no reason given', 300), at: now }
  G.checks += 1
  await save($)
  $.ui.invalidate('ui.render')
}

// On Team and Enterprise plans a built-in guard (cc-plugin-sec-default) runs before
// every mod and sends some events on past them: the system prompt, the classic
// settings-hook events, the attachment rows. Those hooks never run, and the engine
// posts a "hook was skipped" line for each, every session. A main turn seen whole
// with neither the system prompt nor its Stop reaching the mod is that guard: the
// mod sets its own /config row to managed, which reloads it without those hooks.
// Both must be missing: the engine does not promise a system prompt every turn.
async function judge($) {
  const s = seen
  if (!s || !s.done) return
  seen = null
  if (s.compose || s.stop || switched) return
  switched = true
  let r
  try {
    r = await $.config.set({ key: 'waypoints.managed', value: 'on' })
  } catch (err) {
    r = { deny: String(err && err.message ? err.message : err) }
  }
  if (r && !r.deny) $.ui.toast('Waypoints: a Team or Enterprise guard skips some of its hooks, so it switched to managed mode (/config, Managed plan)')
  else $.ui.toast('Waypoints: a Team or Enterprise guard skips some of its hooks. Set Managed plan to on in /config to stop the notices')
}

// Herdr status (herdr.mjs): at session start, check every prerequisite once. The host's
// own (Windows, a terminal session, a Herdr terminal) only go to the log: the setting is
// shared with sessions it cannot apply to. A Herdr terminal whose PowerShell cannot do it
// gets one toast, since the person asked for this there.
async function checkHerdr($, e) {
  herdr = { ready: false, exe: '' }
  const terminalId = await $.env.get('HC_TERMINAL_ID')
  const host = hostBlocker({ option: options.herdr, win, interactive, surface: e.surface, terminalId })
  if (host === 'off') return
  if (host) {
    $.ui.log(`waypoints: Herdr status left out (${host})`)
    return
  }
  let why = ''
  for (const exe of SHELLS) {
    let p = null
    try {
      const r = await $.process.run(probeArgv(exe), { timeoutMs: 15000 })
      p = parseProbe(r.stdout)
    } catch {
      // not installed: try the next one
    }
    const blocker = probeBlocker(p)
    if (!blocker) {
      herdr = { ready: true, exe }
      $.ui.log(`waypoints: Herdr status on (${exe}, PowerShell ${p.ps})`)
      return
    }
    if (p && !why) why = blocker
  }
  why = why || 'neither powershell.exe nor pwsh.exe runs'
  $.ui.log(`waypoints: Herdr status left out (${why})`)
  $.ui.toast(`Waypoints: Herdr status is on, but ${why}`)
}

// A paused plan's turn just ended: mark Herdr once the Stop hook's background list has
// landed, unless another turn started or the plan moved on meanwhile
function markHerdr($) {
  const seq = markSeq
  $.clock.after(MARK_DELAY_MS, async () => {
    if (seq !== markSeq || !herdr.ready || !shouldMark(G, waiting)) return
    try {
      const r = await $.process.run(markArgv(herdr.exe, markMessage(G, mask)), { timeoutMs: 30000 })
      const out = String(r.stdout || '').trim()
      if (out !== 'ok' && !out.startsWith('ok ')) $.ui.log(`waypoints: Herdr status not marked (${clip(out || `exit ${r.exitCode}`, 120)})`)
    } catch (err) {
      $.ui.log(`waypoints: Herdr status not marked (${clip(String(err && err.message ? err.message : err), 120)})`)
    }
  })
}

export function register(on, opts) {
  options = { palette: 'follow', animation: 'follow', pane: 'auto', linger: LINGER_DEFAULT, managed: 'auto', herdr: 'off', ...(opts || {}) }
  // on: leave out the hooks a managed plan's guard skips; auto: watch for it; off: neither
  const managed = options.managed === 'on'
  const watching = options.managed !== 'on' && options.managed !== 'off'
  RECENT_MS = LINGER[options.linger] ?? LINGER[LINGER_DEFAULT]
  look = resolveLook(options, [])
  roles = rolesOf(look.palette)

  on('session.start', async ($, e, next) => {
    now = await $.clock.now()
    interactive = e.isInteractive !== false
    asked = false
    home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || ''
    win = (await $.env.get('OS')) === 'Windows_NT'
    sessionId = await $.session.id()
    cwd = await $.session.cwd()
    // where Claude Code keeps this chat's log; a settings-hook event confirms it below
    transcriptPath = `${home}/.claude/projects/${String(cwd).replace(/[^A-Za-z0-9]/g, '-')}/${sessionId}.jsonl`
    const saved = await $.store.get('settings')
    if (saved && typeof saved === 'object') settings = { ...settings, ...saved }
    await readRecording($)
    try {
      const reg = await $.tool.register(TOOL_SPEC)
      if (reg && reg.tool) toolName = reg.tool
    } catch (err) {
      toolFailed = true
      $.ui.log(`waypoints: the task tool did not register (${err && err.message ? err.message : err})`)
    }
    commandName = (await registerCommand($)) || commandName
    await restore($)
    await refreshLook($)
    await refreshPanes($)
    $.clock.every(15000, async () => {
      // asked before `now` moves: the tick that ends a finished goal's stay must still redraw
      const wasUp = !!G && (G.status === 'running' || isRecent(G))
      now = await $.clock.now()
      // the fallback for a /config change of Agent-Pulse's that never reached config.set
      await refreshLook($)
      await refreshPanes($)
      if (paneUp) await loadOthers($)
      await maybeAutoClose($)
      if (paneUp || wasUp || (G && (G.status === 'running' || isRecent(G)))) $.ui.invalidate('ui.render')
    })
    $.clock.every(10000, () => readRecording($).catch(() => {}))
    checkHerdr($, e).catch(() => {})
    return next(e)
  })

  // The standing ask for multi-step work outside a /goal, so the global CLAUDE.md
  // needs no line for it. A session section: it sits after the cache boundary and
  // reads the same every request. Left out where no one watches the bar (-p, the
  // bare prompt), for teammates (they must not replace the lead's plan), and when
  // the tool did not register or /waypoints auto off. In managed mode the ask rides
  // on the first prompt instead (prompt.submit). `print` is a session with no terminal
  // behind it: -p, or an SDK host like the Desktop app. Only one that draws nowhere
  // has no one watching the bar.
  if (!managed) {
    on('prompt.compose', async ($, e, next) => {
      if (seen) seen.compose = true
      const r = await next(e)
      const traits = e.traits || []
      const unwatched = traits.includes('print') && !(e.surfaces && e.surfaces.length)
      if (unwatched) $.ui.log('waypoints: the system prompt got no standing ask (a print session that draws nowhere)')
      if (!settings.auto || toolFailed || unwatched || traits.some((t) => t === 'bare' || t === 'teammate')) return r
      return { sections: [...r.sections, { id: 'waypoints:plan', text: standing(toolName), scope: 'session' }] }
    })
  }

  // /goal <condition> starts the meter and asks Claude to plan. The ask rides as
  // the command's hidden note, so the cached prefix is untouched.
  on('command.run', { command: 'goal' }, async ($, e, next) => {
    const args = String(e.args || '').trim()
    const r = await next(e)
    now = await $.clock.now()
    pendingGoal = null
    if (!args) return r
    if (isStopWord(args)) {
      await stopGoal($, 'stopped')
      return r
    }
    await startGoal($, args)
    const notes = r && Array.isArray(r.context) ? r.context : []
    return { ...(r || {}), context: [...notes, instruction(toolName)] }
  })

  // Fallback when /goal reaches the session without a command.run: remember it
  // here and start at turn.start, asking for the plan with an appended note.
  // Managed mode: the standing ask goes beside the first prompt typed this session,
  // context the model reads and the person never sees.
  on('prompt.submit', async ($, e, next) => {
    const m = String(e.text || '').match(/^\s*\/goal\s+([\s\S]+)$/)
    if (m && !isStopWord(m[1])) pendingGoal = { args: m[1].trim(), at: await $.clock.now() }
    if (managed && !asked && !e.command && !e.isMeta && settings.auto && !toolFailed) {
      // someone watches the bar at a terminal, or where the session draws: the Desktop
      // app runs Claude Code as an SDK host, so isInteractive is false and a surface
      // attaches after session.start; only a -p run draws nowhere. Only managed mode
      // (a Team or Enterprise plan) reads this: elsewhere the system prompt carries the ask
      const watched = interactive || ((await $.session.surfaces().catch(() => [])) || []).length > 0
      if (!watched) $.ui.log(`waypoints: managed mode left out the standing ask (isInteractive ${interactive}, nothing draws)`)
      else {
        asked = true
        return next({ ...e, context: [...(e.context || []), standing(toolName)] })
      }
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    now = await $.clock.now()
    if (watching && !e.agentId) {
      if (seen && seen.done) await judge($)
      seen = switched ? null : { compose: false, stop: false, done: false }
    }
    if (pendingGoal && (!G || G.startedAt < pendingGoal.at)) {
      const args = pendingGoal.args
      await startGoal($, args)
      try {
        await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: instruction(toolName) }] } })
      } catch {
        // the nudge after a few tool calls is the second chance
      }
    }
    pendingGoal = null
    // closed on its tasks, but the goal loop carries on without a new prompt: reopen
    if (G && G.status === 'met' && G.finishedBy === 'tasks' && G.kind === 'goal' && !String(e.text || '').trim() && now - G.endedAt < REOPEN_MS) {
      G.status = 'running'
      G.endedAt = 0
      G.finishedBy = ''
    }
    waiting = []
    if (!e.agentId) markSeq += 1
    if (G && G.status === 'running') {
      G.active = true
      G.interrupted = false
    }
    return next(e)
  })

  // The settings hooks' events carry the log's real path, and the background work the
  // turn left running: shells, monitors, subagents. A finished one wakes the session, and
  // the next turn's Stop replaces the list, so it only goes stale if one is killed by hand.
  // Managed mode has no Stop: the log's path stays the one worked out at session.start,
  // and no background work is shown.
  if (!managed) {
    on('classic.Stop', async ($, e, next) => {
      if (seen) seen.stop = true
      if (e && typeof e.transcript_path === 'string' && e.transcript_path) transcriptPath = e.transcript_path
      waiting = Array.isArray(e && e.background_tasks) ? e.background_tasks.map((t) => clip(t.description || t.command || t.type || 'task', 32)) : []
      if (G && G.status === 'running') $.ui.invalidate('ui.render')
      return next(e)
    })
  }

  on('tool.call', async ($, e, next) => {
    if (e.tool === toolName) return serveTool($, e)
    if (G && G.status === 'running' && G.kind === 'goal' && !G.planAt && !e.agentId) {
      // always on, but never asks for a tool that did not register
      if (!toolFailed && WRITERS.has(e.tool)) return { deny: strictDeny(toolName) }
      if (e.tool !== 'ToolSearch') callsWithoutPlan += 1
      if (callsWithoutPlan >= NUDGE_AFTER && !nudged) {
        nudged = true
        try {
          await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: nudge(toolName) }] } })
        } catch {
          // the band says the plan is missing either way
        }
        $.ui.invalidate('ui.render')
      }
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r && r.agentId) {
      agentNames.set(r.agentId, clip(e.name || e.description || e.subagentType || 'agent', 32))
      if (G && G.status === 'running') $.ui.invalidate('ui.render')
    }
    return r
  })

  // The goal check writes its verdict as an attachment row. Managed mode reads the
  // verdict from the log when the turn ends instead (turn.complete).
  if (!managed) {
    on('session.append', { door: 'attachment' }, async ($, e, next) => {
      const r = await next(e)
      if (!e.agentId && e.message && e.message.name === 'goal_status') {
        now = await $.clock.now()
        try {
          await onCheck($, e.message, now)
        } catch {
          // the row is stored whatever the parser makes of it
        }
      }
      return r
    })
  }

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    now = await $.clock.now()
    if (e.agentId) {
      if (G && G.status === 'running') $.ui.invalidate('ui.render')
      return r
    }
    if (seen) {
      // Stop can come a moment after the end of the turn: judge then, or at the next turn's start
      if (e.reason === 'answer' && !e.isAborted) {
        seen.done = true
        $.clock.after(5000, () => judge($).catch(() => {}))
      } else seen = null
    }
    if (G && G.status === 'running') {
      G.active = false
      G.lastTurnEnd = now
      if (e.isAborted) G.interrupted = true
      const p = progress(G)
      // the turn ended with every task done: finished (the goal check's own
      // verdict, read from the log, usually closed it a moment earlier)
      if (e.reason === 'answer' && !e.isAborted && p.n > 0 && p.doneN === p.n) await finishGoal($, 'tasks')
      else await save($)
      // managed mode: no attachment row says the check ran, so look for its verdict now
      if (managed && G.status === 'running' && G.kind === 'goal' && !e.isAborted) onCheck($, null, now, LATE_WAITS).catch(() => {})
      $.ui.invalidate('ui.render')
      if (herdr.ready && shouldMark(G, waiting)) markHerdr($)
    }
    return r
  })

  on('command.run', { command: ['waypoints', 'waypoints-mod'] }, async ($, e) => {
    now = await $.clock.now()
    const [key, value] = String(e.args || '').trim().toLowerCase().split(/\s+/)
    if (key === 'auto') {
      settings.auto = value !== 'off'
      await $.store.set('settings', settings)
      $.ui.toast(`Standing plan ask ${settings.auto ? 'on: Claude plans any multi-step work' : 'off: only a /goal asks for a plan'}`)
      return {}
    }
    if (key === 'hide' || key === 'show') {
      hidden = key === 'hide'
      $.ui.invalidate('ui.render')
      $.ui.toast(hidden ? `Waypoints band hidden · /${commandName} show brings it back` : 'Waypoints band shown')
      return {}
    }
    if (key === 'clear') {
      await stopGoal($, 'stopped')
      return {}
    }
    if (key === 'prune') {
      const msg = await prune($)
      if (!(await $.session.surface())) return { text: msg }
      $.ui.toast(msg)
      return {}
    }
    const surface = await $.session.surface()
    if (!surface) return { text: plainText() }
    await openPane($)
    return {}
  })

  // The pane closing: a close by the person is remembered for this goal, so the next plan
  // does not reopen it; the engine dropping it (unload) is not the person's doing
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      paneUp = false
      autoPane.closed(e.origin, G)
    }
    return next(e)
  })

  // Another plugin's /config change that Waypoints follows: the new value is in the rows
  // once the change has gone through
  // (literals, so the engine can read the matcher off the source; FOLLOW_KEYS names the same two)
  on('config.set', { key: ['agent-pulse.palette', 'agent-pulse.animation'] }, async ($, e, next) => {
    const r = await next(e)
    if (!r || !r.deny) await refreshLook($)
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props && e.props.hasSurvey) return below
    if (!bandUp()) return below
    const el = $.ui.resolve(e)
    // a Client names its module as a literal here, where the engine reads it from
    const pulse = el.Client ? (key, props, width) => el.Client({ key, module: './pulse.mjs', props, width, height: 1 }) : undefined
    const view = {
      g: G,
      now,
      waiting,
      mask,
      roles,
      level: look.level,
      width: Math.max(40, (e.props && e.props.bodyColumns) || 100),
      maxRows: e.props && e.props.maxRows,
      nudged,
      pulse,
      svg: e.surface !== 'terminal',
      open: () => openPane($),
    }
    const mine = drawBand(el, view)
    return el.Box({ flexDirection: 'column', children: below ? [mine, below] : [mine] })
  })

  // The footer shows even when the band is hidden or collapsed. Desktop does not
  // draw the labels in `modes` (this one never showed there), only a tree, so
  // there the engine's footer is wrapped, as arsenal's launcher and ctx do. The
  // band shows the plan on Desktop, so the label is drawn only while it is away
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const label = footerLabel()
    if (!label) return next(e)
    if (e.surface !== 'terminal') {
      if (bandUp()) return next(e)
      const footer = await next(e)
      const { Box, Text } = $.ui.resolve(e)
      return Box({ key: 'waypoints-footer', children: [Text({ children: [label] }), Text({ children: [' '] }), footer] })
    }
    const modes = Array.isArray(e.props && e.props.modes) ? e.props.modes : []
    return next({ ...e, props: { ...e.props, modes: [...modes, label] } })
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const el = $.ui.resolve(e)
    const width = Math.max(50, (e.props && e.props.bodyColumns) || 100)
    const files = { count: fileCount, dir: shownPath(home + DIR) }
    // the running task twinkles in the pane too: the same Client as the band's route
    const pulse = el.Client ? (key, props, w) => el.Client({ key, module: './pulse.mjs', props, width: w, height: 1 }) : undefined
    return drawPane(el, { g: G, now, mask, roles, level: look.level, width, others, sessionId, commandName, settings, files, pulse, svg: e.surface !== 'terminal' })
  })
}

async function openPane($) {
  now = await $.clock.now()
  await loadOthers($)
  autoPane.takenOver() // the person asked: it is theirs now
  paneUp = true
  await $.ui.open({ id: PANE, title: 'Waypoints', focus: true, closeOnEscape: true })
}

// ---------- words ----------

// Whether the band draws: a goal that runs or ended lately, and not hidden
function bandUp() {
  return !!G && !hidden && (G.status === 'running' || isRecent(G))
}

function footerLabel() {
  if (!G) return ''
  const word = G.kind === 'plan' ? 'plan' : 'goal'
  if (G.status === 'running') {
    if (!G.planAt) return `◎ ${word} · planning`
    const p = progress(G)
    const t = eta(G, now)
    return `◎ ${word} ${p.pct}%` + (t ? ` · ~${minutes(t.ms)}` : ` · ${p.doneN}/${p.n}`)
  }
  if (isRecent(G)) return G.status === 'met' ? `◎ ${word} done ✓` : `◎ ${word} stopped`
  return ''
}

const ICON = { done: '✓', active: '▶', pending: '○', dropped: '×', parked: '⏸' }

function taskTail(t) {
  if (t.status === 'done') return t.doneAt > t.startedAt ? minutes(t.doneAt - t.startedAt) : ''
  if (t.status === 'active') return (t.by ? t.by + ' · ' : '') + 'running ' + minutes(now - t.startedAt)
  if (t.status === 'dropped') return 'dropped' + (t.note ? ': ' + t.note : '')
  if (t.status === 'parked') return 'parked: ' + (t.note || '')
  return ''
}

// /waypoints where no surface can draw a pane (a -p run)
function plainText() {
  if (!G) return 'No goal in this chat.'
  const p = progress(G)
  const lines = [`${label(G)}: ${mask(G.title)}`, `${statsLine(G, p, now, mask)}  ${bar(p.fraction, 30)}`]
  for (const t of G.tasks.filter((x) => !x.replaced)) lines.push(`${ICON[t.status] || '○'} ${t.size}  ${mask(t.title)}  ${mask(taskTail(t))}`)
  return lines.filter(Boolean).join('\n')
}
