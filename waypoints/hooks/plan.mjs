// Waypoints' plan: the task list Claude keeps through the mod's own tool, and
// what the bar, the ETA, and the goal check read from it. Pure functions: no mods
// API calls here, so the harness tests can drive them directly.

export const SIZES = { S: 1, M: 2, L: 3 }

const STOP = /^(clear|stop|off|cancel|end|none|reset)$/i

export function isStopWord(text) {
  return STOP.test(String(text || '').trim())
}

export function titleOf(condition) {
  const line = String(condition || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) || 'Goal'
  return line.length > 160 ? line.slice(0, 159) + '…' : line
}

// What a plan made outside /goal is named after: the one line Claude gives as "goal",
// else the first task (which names a step, not the whole plan)
export function planSubject(input) {
  const goal = String(input.goal || '').trim()
  return goal ? titleOf(goal) : titleOf(normalizeTasks(input.tasks)[0]?.title)
}

export function newGoal({ sessionId, condition, now, cwd, kind = 'goal' }) {
  return {
    sessionId,
    kind,
    title: titleOf(condition),
    condition: String(condition || '').slice(0, 2000),
    cwd: cwd || '',
    startedAt: now,
    planAt: 0,
    endedAt: 0,
    status: 'running',
    active: true,
    lastTurnEnd: 0,
    interrupted: false,
    tasks: [],
    nextId: 1,
    firstPlan: 0,
    check: null,
    checks: 0,
    updatedAt: now,
  }
}

function clean(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

export function weight(t) {
  return SIZES[t.size] || 2
}

// Tasks still part of the plan: dropped and replaced ones don't count
export function live(goal) {
  return goal.tasks.filter((t) => t.status !== 'dropped' && !t.replaced)
}

// What the numbers count: a parked task is still drawn, but waits on someone outside
// the chat, so it is left out of the total and the plan can finish without it
export function progress(goal) {
  const all = live(goal)
  const parked = all.filter((t) => t.status === 'parked')
  const tasks = all.filter((t) => t.status !== 'parked')
  const total = tasks.reduce((a, t) => a + weight(t), 0)
  const done = tasks.filter((t) => t.status === 'done')
  const doneW = done.reduce((a, t) => a + weight(t), 0)
  return {
    total,
    doneW,
    doneN: done.length,
    n: tasks.length,
    parked,
    active: tasks.filter((t) => t.status === 'active'),
    pct: total ? Math.round((100 * doneW) / total) : 0,
    fraction: total ? doneW / total : 0,
  }
}

// The ETA at this goal's own pace: time since the plan per unit of finished
// work, times the work left. Nothing until two tasks are done.
export function eta(goal, now) {
  const p = progress(goal)
  if (goal.status !== 'running' || p.doneN < 2 || p.doneW <= 0 || p.doneW >= p.total) return null
  const since = goal.planAt || goal.startedAt
  const per = Math.max(0, now - since) / p.doneW
  const ms = Math.round(per * (p.total - p.doneW))
  return { ms, at: now + ms }
}

const MAX_TASKS = 60
const SIZE_WORDS = { S: 'S', M: 'M', L: 'L', SMALL: 'S', MEDIUM: 'M', LARGE: 'L' }

// A bare S, M or L after "size": is the one slip callers make (it is not JSON). Quote it.
const BARE_SIZE = /("size"\s*:\s*)([SMLsml])(?=\s*[,}\]])/g

// JSON text with every bare size quoted, and how many were
function quoteSizes(text) {
  let n = 0
  const fixed = text.replace(BARE_SIZE, (_, key, letter) => {
    n += 1
    return `${key}"${letter.toUpperCase()}"`
  })
  return { fixed, n }
}

// When the model's whole call is not valid JSON, Claude Code does not run the tool on
// it: it passes { __unparsedToolInput: { raw, len } }, with the call's text in `raw`
// (seen live 2026-11-06, claude 2.1.319). Without this the tool finds no action and no
// tasks and answers "no plan in this chat yet", hiding why. Sometimes the wrapper is
// itself a string, the JSON text of { raw, len }, so a wrapper is unwrapped until what is
// left is the call. Returns { input, repaired, error }: the call read as the model meant
// it (after the same bare-size repair), or an error.
export function readCall(input) {
  let wrapped = input && input.__unparsedToolInput
  if (wrapped === undefined || wrapped === null) return { input, repaired: 0, error: '' }
  const bad = (why) => ({
    input,
    repaired: 0,
    error: `the call was not valid JSON, so none of it was read: ${why}. Send it again with every value in quotes, e.g. { "action": "plan", "tasks": [{ "title": "...", "size": "S" }] }.`,
  })
  let parsed
  let repaired = 0
  for (let depth = 0; depth < 4; depth++) {
    const text = String(typeof wrapped === 'string' ? wrapped : wrapped.raw ?? '').trim()
    try {
      parsed = JSON.parse(text)
    } catch (first) {
      const { fixed, n } = quoteSizes(text)
      try {
        parsed = JSON.parse(fixed)
        repaired += n
      } catch {
        return bad(first.message)
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return bad('it is not a JSON object')
    // { raw } with no action is another wrapper, not the call
    if (typeof parsed.raw === 'string' && parsed.action === undefined) wrapped = parsed
    else break
  }
  if (typeof parsed.raw === 'string' && parsed.action === undefined) return bad('it is wrapped too deeply')
  const { __unparsedToolInput, ...rest } = input
  return { input: { ...rest, ...parsed }, repaired, error: '' }
}

// Reads the tasks a caller sent. Returns { list, repaired, error }. A caller is a
// model writing JSON by hand, so bad input is expected and is answered, never guessed:
// anything wrong gives an error naming it and an empty list, so no half-read plan
// is ever made. `repaired` counts the unquoted sizes quoted to make the JSON parse.
export function parseTasks(raw) {
  const bad = (error) => ({ list: [], repaired: 0, error })
  if (raw === undefined || raw === null) return { list: [], repaired: 0, error: '' }
  let items = raw
  let repaired = 0
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (/^[[{]/.test(text)) {
      // meant as JSON: it parses (maybe after the repair), or it is an error
      try {
        items = JSON.parse(text)
      } catch (first) {
        const { fixed, n } = quoteSizes(text)
        try {
          items = JSON.parse(fixed)
          repaired = n
        } catch {
          return bad(`tasks must be a JSON array of { "title": "...", "size": "S" | "M" | "L" }; it could not be read: ${first.message}`)
        }
      }
    } else {
      // plain text: one task per line
      items = text.split(/\r?\n/)
    }
  }
  if (!Array.isArray(items)) return bad('tasks must be a JSON array of { "title": "...", "size": "S" | "M" | "L" }.')

  const list = []
  const problems = []
  items.forEach((item, i) => {
    const n = i + 1
    if (typeof item === 'string') {
      const title = clean(item.replace(/^\s*[-*\d.)\]]+\s*/, ''), 140)
      if (title) list.push({ title, size: 'M' })
      return
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) return problems.push(`task ${n} is not a { title, size } object`)
    const title = clean(item.title ?? item.subject ?? item.name ?? item.task ?? item.description, 140)
    if (!title) return problems.push(`task ${n} needs a non-empty "title"`)
    let size = 'M'
    if (item.size !== undefined && item.size !== null && item.size !== '') {
      size = SIZE_WORDS[String(item.size).trim().toUpperCase()]
      if (!size) return problems.push(`task ${n} ("${clean(title, 30)}") has size ${JSON.stringify(item.size)}; use "S", "M" or "L"`)
    }
    list.push({ title, size })
  })
  if (problems.length) {
    const shown = problems.slice(0, 3).join('; ')
    return bad(`${shown}${problems.length > 3 ? `; and ${problems.length - 3} more` : ''}. Nothing was planned.`)
  }
  return { list: list.slice(0, MAX_TASKS), repaired, error: '', cut: Math.max(0, list.length - MAX_TASKS) }
}

// Just the tasks, for callers that only need the first title
export function normalizeTasks(raw) {
  return parseTasks(raw).list
}

function idsOf(input) {
  const raw = Array.isArray(input.ids) ? input.ids : input.id !== undefined ? [input.id] : []
  return raw.map((v) => Number(String(v).replace(/^#/, ''))).filter((n) => Number.isInteger(n) && n > 0)
}

function addTasks(goal, list, now, origin, rev = false) {
  for (const t of list) {
    goal.tasks.push({ id: goal.nextId++, title: t.title, size: t.size, status: 'pending', by: '', addedAt: now, startedAt: 0, doneAt: 0, origin, note: '', ...(rev ? { rev: true } : {}) })
  }
}

// The task finished last, which a revision of the plan follows from (0 when none is)
function lastDoneId(goal) {
  const done = goal.tasks.filter((t) => t.status === 'done').sort((a, b) => b.doneAt - a.doneAt || b.id - a.id)
  return done.length ? done[0].id : 0
}

const WORD = { pending: 'todo', active: 'running', done: 'done', dropped: 'dropped', parked: 'parked' }

export function listText(goal) {
  const p = progress(goal)
  const parked = p.parked.length ? ` ${p.parked.length} parked (not counted).` : ''
  const lines = [`Plan: ${p.doneN} of ${p.n} tasks done, ${p.pct}% of the work.${parked}`]
  for (const t of goal.tasks) {
    if (t.replaced) continue
    const who = t.status === 'active' && t.by ? ` by ${t.by}` : ''
    const why = t.status === 'parked' && t.note ? `: ${t.note}` : ''
    lines.push(`#${t.id} ${WORD[t.status] || t.status}  ${t.title} (${t.size})${who}${why}`)
  }
  return lines.join('\n')
}

// One call of the task tool. Returns { ok, text } and changes the goal in place.
export function applyAction(goal, input, { now, by = '' } = {}) {
  const action = String(input.action || 'show').toLowerCase()
  const fail = (msg) => ({ ok: false, text: `Waypoints: ${msg}\n${listText(goal)}` })
  let counted = ''
  if (action === 'plan' || action === 'add') {
    const { list, repaired, error, cut } = parseTasks(input.tasks)
    if (error) return fail(error)
    if (!list.length) return fail(`"${action}" needs tasks: [{ "title": "...", "size": "S" | "M" | "L" }].`)
    if (action === 'plan' && goal.planAt) {
      // a new plan replaces the work not started yet; finished and running tasks stay
      for (const t of goal.tasks) if (t.status === 'pending') t.replaced = true
    }
    const first = !goal.planAt
    // a plan changed for a reason: what changed, and after which finished task
    const note = first ? '' : clean(input.note, 140)
    if (note) {
      goal.revisions = [...(goal.revisions || []), { at: now, after: lastDoneId(goal), note }].slice(-20)
    }
    addTasks(goal, list, now, first ? 'plan' : 'later', !!note)
    counted = taskCount(action, list.length, repaired, cut)
    if (first) {
      goal.planAt = now
      goal.firstPlan = list.length
    }
  } else if (action === 'start' || action === 'done' || action === 'drop' || action === 'park') {
    const ids = idsOf(input)
    if (!ids.length) return fail(`"${action}" needs the task's id.`)
    if (action === 'park' && !clean(input.note, 140)) return fail('"park" needs a "note" naming who or what the task waits on.')
    const tasks = ids.map((id) => goal.tasks.find((t) => t.id === id && !t.replaced))
    const missing = ids.filter((id, i) => !tasks[i])
    if (missing.length) return fail(`no task #${missing.join(', #')}.`)
    for (const t of tasks) {
      if (action === 'start') {
        // a parked task taken up again loses its blocker
        if (t.status === 'parked') t.note = ''
        t.status = 'active'
        t.startedAt = t.startedAt || now
        if (by) t.by = clean(by, 32)
      } else if (action === 'park') {
        t.status = 'parked'
        t.note = clean(input.note, 140)
      } else if (action === 'done') {
        t.status = 'done'
        t.startedAt = t.startedAt || now
        t.doneAt = now
        if (input.note) t.note = clean(input.note, 140)
      } else {
        t.status = 'dropped'
        t.doneAt = now
        t.note = clean(input.note || 'no longer needed', 140)
      }
    }
  } else if (action !== 'show') {
    return fail(`unknown action "${action}". Use plan, add, start, done, drop, park, or show.`)
  }
  goal.updatedAt = now
  return { ok: true, text: counted ? `${counted}\n${listText(goal)}` : listText(goal) }
}

// The first line of a plan or add reply: how many tasks were understood, so a caller
// can compare it with what it sent, and a note when its JSON had to be repaired
function taskCount(action, n, repaired, cut) {
  const noun = n === 1 ? 'task' : 'tasks'
  let line = `${action === 'plan' ? 'Planned' : 'Added'} ${n} ${noun}.`
  if (repaired) line += ` Repaired ${repaired} unquoted ${repaired === 1 ? 'size' : 'sizes'} (write "size":"S", with quotes).`
  if (cut) line += ` Kept the first ${MAX_TASKS}; ${cut} more were left out.`
  return line
}

// The goal check's verdict, from the text the engine records for it. The shape
// is not documented, so this reads both a JSON-ish record and plain words.
export function parseCheck(text) {
  const t = String(text || '')
  const notMet = /"met"\s*:\s*false|\bmet\s*[=:]\s*false|\bnot\s+(?:yet\s+)?(?:been\s+)?(?:met|achieved|satisfied|complete)|\bunmet\b|\bnot\s+satisfied\b/i.test(t)
  const met = !notMet && /"met"\s*:\s*true|\bmet\s*[=:]\s*true|\b(?:condition|goal)\b[^.\n]{0,60}\b(?:is|was|has been)\s+(?:met|achieved|satisfied)\b/i.test(t)
  const m = t.match(/"reason"\s*:\s*"((?:[^"\\]|\\.)*)"/) || t.match(/\breason\b[^:\n]{0,20}:\s*([\s\S]+)/i)
  const reason = clean(m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ') : '', 300)
  return { met, notMet, reason }
}

// The text of the task tool's stored result, for the transcript. The tool answers
// { result: string }; the engine may store that record, a bare string, or MCP content
// blocks, so read all three. Anything else is null and the stock renderer draws it.
export function resultText(output) {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) {
    const parts = output.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text)
    return parts.length ? parts.join('\n') : null
  }
  if (output && typeof output === 'object') {
    for (const key of ['result', 'text', 'content']) {
      if (output[key] !== undefined) return resultText(output[key])
    }
  }
  return null
}

export const TOOL_SPEC = {
  name: 'tasks',
  description:
    'Waypoints: the task plan the user watches as a progress bar while a /goal runs. ' +
    'Call action "plan" first with every task needed to meet the goal, in order, each sized S, M, or L. ' +
    'Call "start" with a task id when you begin it (set "by" to a subagent\'s short name when one does it) and "done" when it is finished. ' +
    'Call "add" for work you discover or when the goal check says the goal is not met yet, and "drop" for a task no longer needed. ' +
    'Call "park" with a "note" naming the blocker for a task only someone outside this session can move (another team, a release window, a person who is away): it leaves the bar\'s total, so the plan can finish without it. ' +
    'When a task turns out differently than the plan assumed, fix the tasks still to do ("plan" again replaces the pending ones, or "add" / "drop") with a "note" saying what changed. ' +
    'Keep it accurate: the bar and the ETA come only from this list.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['plan', 'add', 'start', 'done', 'drop', 'park', 'show'] },
      goal: { type: 'string', description: 'For plan: one line naming what the whole plan achieves, shown as its title' },
      tasks: {
        type: 'array',
        description: 'For plan and add: the tasks in order.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'What the task delivers, in a few words' },
            size: { type: 'string', enum: ['S', 'M', 'L'], description: 'S: a few minutes. M: a solid chunk. L: the big piece.' },
          },
          required: ['title'],
        },
      },
      id: { type: 'number', description: 'For start, done, drop, and park: the task number' },
      ids: { type: 'array', items: { type: 'number' }, description: 'Several task numbers at once' },
      by: { type: 'string', description: 'For start: who does it, "main" or the subagent\'s short name' },
      note: { type: 'string', description: 'One short line. For park (required): who or what the task waits on. For plan again or add: what changed. For done or drop: the outcome or why.' },
    },
    required: ['action'],
  },
}

// The two rules both asks carry: keep the later steps true to what happened, and never
// leave the bar on an open task nobody explained
const REVISE = `When a task turns out differently than the plan assumed, check the tasks still to do and fix them ("plan" again, "add" or "drop") with a "note" saying what changed. `
const OPEN_END =
  `Never end your turn with a task still open and unexplained: finish it, "park" it with a "note" naming the blocker when it waits on someone outside this session, ` +
  `or, when you are unsure what it takes, ask the user with concrete options and your recommendation. `

export function instruction(tool) {
  return (
    `Waypoints is on for this goal: the user watches your progress as a bar built from your task plan. ` +
    `Before you start the work, call ${tool} (load it with ToolSearch if it is deferred) with action "plan" and every task needed to meet the goal, in order, each sized S, M, or L. ` +
    `Call "start" with a task's id when you begin it and "done" when it is finished. ` +
    `If you find more work, or the goal check says the goal is not met yet, call "add" with the new tasks. ` +
    REVISE +
    OPEN_END +
    `When a subagent does a task, call "start" with "by" set to its short name, and "done" when it reports back.`
  )
}

// The standing ask, kept in the system prompt: plan any multi-step work, not only
// a /goal. It replaces the line the mod used to need in the global CLAUDE.md.
export function standing(tool) {
  return (
    `Waypoints is installed: the user watches a progress bar built from your task plan. ` +
    `For multi-step work (3 or more steps), call ${tool} (load it with ToolSearch if it is deferred) with action "plan" before you start, with "goal" set to one line naming what the whole plan achieves and every task in order, each sized S, M, or L. ` +
    `Then call "start" with a task's id when you begin it and "done" when it is finished, and "add" work you find along the way. ` +
    REVISE +
    OPEN_END +
    `Skip it for small single-step requests. If you are a subagent, never call "plan": it replaces the main agent's pending tasks.`
  )
}

export function nudge(tool) {
  return `Reminder from Waypoints: this /goal has no task plan yet, so the user's progress bar is empty. Call ${tool} with action "plan" now (every task to meet the goal, in order, sized S, M, or L), then mark tasks as you go.`
}

export function strictDeny(tool) {
  return `Waypoints: plan the goal before changing files. Call ${tool} with action "plan" first, then retry this.`
}
