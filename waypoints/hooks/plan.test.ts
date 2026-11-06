import { test, expect } from 'claude-code/testing'

// @ts-ignore the plan is plain JavaScript, shared with the module
import { newGoal, applyAction, parseTasks, readCall, progress, eta, instruction, nudge, standing, strictDeny, planSubject, listText, TOOL_SPEC } from './plan.mjs'

const TOOL = 'mcp__waypoints__tasks'

function planned() {
  const g = newGoal({ sessionId: 's1', condition: 'ship the thing', now: 0, cwd: 'C:/bats' })
  applyAction(g, { action: 'plan', tasks: [{ title: 'one', size: 'S' }, { title: 'two', size: 'M' }, { title: 'three', size: 'L' }] }, { now: 1000 })
  return g
}

test('the bar counts finished work by size, not by task', async () => {
  const g = planned()
  applyAction(g, { action: 'done', id: 1 }, { now: 2000 })
  // S is 1 of 6 units of work
  expect(progress(g).pct).toBe(17)
  applyAction(g, { action: 'done', ids: [2, 3] }, { now: 3000 })
  expect(progress(g).pct).toBe(100)
  expect(progress(g).doneN).toBe(3)
})

test('the ETA waits for two finished tasks, then follows the goal\'s own pace', async () => {
  const g = planned()
  applyAction(g, { action: 'done', id: 1 }, { now: 61000 })
  expect(eta(g, 61000)).toBe(null)
  applyAction(g, { action: 'done', id: 2 }, { now: 181000 })
  // 3 units done in 180 s after the plan: 60 s a unit, 3 units left
  expect(eta(g, 181000)).toEqual({ ms: 180000, at: 361000 })
})

test('a new plan replaces the work not started yet and keeps what is running or done', async () => {
  const g = planned()
  applyAction(g, { action: 'start', id: 1 }, { now: 2000 })
  applyAction(g, { action: 'plan', tasks: [{ title: 'four', size: 'S' }] }, { now: 3000 })
  const live = g.tasks.filter((t: any) => !t.replaced).map((t: any) => t.title)
  expect(live).toEqual(['one', 'four'])
})

test('every word Claude reads names Waypoints and the tool', async () => {
  expect(TOOL_SPEC.description).toStartWith('Waypoints:')
  expect(applyAction(planned(), { action: 'nope' }, { now: 1 }).text).toStartWith('Waypoints:')
  for (const text of [instruction(TOOL), nudge(TOOL), strictDeny(TOOL), standing(TOOL)]) {
    expect(text).toContain(TOOL)
    expect(text.toLowerCase()).not.toContain('goal meter')
    expect(text.toLowerCase()).not.toContain('goal-meter')
  }
  // strict is no longer an option, so the refusal does not name one
  expect(strictDeny(TOOL)).not.toContain('strict')
})

test('the standing line asks for a plan on multi-step work and keeps subagents out of it', async () => {
  const text = standing(TOOL)
  expect(text).toContain('3 or more steps')
  expect(text).toContain('ToolSearch')
  expect(text).toContain('action "plan"')
  expect(text).toContain('single-step')
  expect(text).toContain('subagent')
})

test('a plan outside /goal is named after the goal Claude gives, else its first task', async () => {
  const tasks = [{ title: 'Review README intro', size: 'S' }]
  expect(planSubject({ action: 'plan', goal: 'Review the README for stale claims', tasks })).toBe('Review the README for stale claims')
  expect(planSubject({ action: 'plan', tasks })).toBe('Review README intro')
  expect(planSubject({ action: 'plan', goal: '   ', tasks })).toBe('Review README intro')
  expect(planSubject({ action: 'plan', goal: 'x'.repeat(200), tasks })).toHaveLength(160)
})

test('the plan tool takes an optional goal, and the standing line asks for it', async () => {
  expect(TOOL_SPEC.inputSchema.properties.goal.type).toBe('string')
  expect(TOOL_SPEC.inputSchema.required).toEqual(['action'])
  expect(standing(TOOL)).toContain('"goal"')
})

// ---------- park: a task only someone outside the chat can move ----------

test('park needs a note naming the blocker', async () => {
  const g = planned()
  const r = applyAction(g, { action: 'park', id: 3 }, { now: 2000 })
  expect(r.ok).toBe(false)
  expect(r.text).toContain('"park" needs a "note"')
  expect(g.tasks[2].status).toBe('pending')
  expect(applyAction(g, { action: 'park', id: 3, note: '   ' }, { now: 2000 }).ok).toBe(false)
})

test('a parked task leaves the total, so the rest of the plan can reach 100%', async () => {
  const g = planned()
  applyAction(g, { action: 'done', ids: [1, 2] }, { now: 2000 })
  // without parking: 3 of 6 units
  expect(progress(g).pct).toBe(50)
  applyAction(g, { action: 'park', id: 3, note: 'waiting on the other team' }, { now: 3000 })
  const p = progress(g)
  expect(p.pct).toBe(100)
  expect(p.doneN).toBe(2)
  expect(p.n).toBe(2)
  expect(p.parked.map((t: any) => t.id)).toEqual([3])
  expect(g.tasks[2].note).toBe('waiting on the other team')
})

test('Claude reads a parked task with its blocker, and that it is not counted', async () => {
  const g = planned()
  applyAction(g, { action: 'park', id: 2, note: 'release window' }, { now: 2000 })
  const text = listText(g)
  expect(text).toContain('1 parked (not counted)')
  expect(text).toContain('#2 parked  two (M): release window')
})

test('a parked task taken up again loses its blocker and counts again', async () => {
  const g = planned()
  applyAction(g, { action: 'park', id: 3, note: 'away' }, { now: 2000 })
  applyAction(g, { action: 'start', id: 3 }, { now: 3000 })
  expect(g.tasks[2]).toMatchObject({ status: 'active', note: '' })
  expect(progress(g).n).toBe(3)
  expect(progress(g).parked).toHaveLength(0)
})

test('a new plan keeps a parked task: it is not work waiting to start', async () => {
  const g = planned()
  applyAction(g, { action: 'park', id: 2, note: 'away' }, { now: 2000 })
  applyAction(g, { action: 'plan', tasks: [{ title: 'four', size: 'S' }] }, { now: 3000 })
  expect(g.tasks[1].replaced).toBeUndefined()
  expect(g.tasks[2].replaced).toBe(true)
})

// ---------- revisions: a step turned out differently ----------

test('a new plan or add with a note records what changed, after the task last finished', async () => {
  const g = planned()
  applyAction(g, { action: 'done', id: 1 }, { now: 2000 })
  applyAction(g, { action: 'done', id: 2 }, { now: 3000 })
  applyAction(g, { action: 'plan', tasks: [{ title: 'page the API', size: 'M' }], note: 'the API pages its results' }, { now: 4000 })
  expect(g.revisions).toEqual([{ at: 4000, after: 2, note: 'the API pages its results' }])
  const fresh = g.tasks.find((t: any) => t.title === 'page the API')
  expect(fresh.rev).toBe(true)
  applyAction(g, { action: 'add', tasks: [{ title: 'retry' }], note: 'it times out' }, { now: 5000 })
  expect(g.revisions).toHaveLength(2)
})

test('the first plan and a plain add are not revisions', async () => {
  const g = newGoal({ sessionId: 's1', condition: 'x', now: 0, cwd: '' })
  applyAction(g, { action: 'plan', tasks: [{ title: 'one' }], note: 'why not' }, { now: 1000 })
  applyAction(g, { action: 'add', tasks: [{ title: 'two' }] }, { now: 2000 })
  expect(g.revisions).toBeUndefined()
  expect(g.tasks.some((t: any) => t.rev)).toBe(false)
})

// ---------- tasks that are not valid: answered, never guessed ----------

function fresh() {
  return newGoal({ sessionId: 's1', condition: 'x', now: 0, cwd: '' })
}

test('tasks given as JSON text with an unquoted size are repaired, and the reply says so', async () => {
  const g = fresh()
  const r = applyAction(g, { action: 'plan', tasks: '[{"title":"A","size":S},{"title":"B","size":m}]' }, { now: 1000 })
  expect(r.ok).toBe(true)
  expect(g.tasks.map((t: any) => [t.title, t.size])).toEqual([['A', 'S'], ['B', 'M']])
  expect(r.text.split('\n')[0]).toBe('Planned 2 tasks. Repaired 2 unquoted sizes (write "size":"S", with quotes).')
})

test('tasks that cannot be read as JSON are an error, not one task titled with the text', async () => {
  const g = fresh()
  const r = applyAction(g, { action: 'plan', tasks: '[{"title":"A","size":"S"},{"title":"B",}]' }, { now: 1000 })
  expect(r.ok).toBe(false)
  expect(r.text).toContain('tasks must be a JSON array')
  expect(r.text).toContain('could not be read')
  expect(g.tasks).toHaveLength(0)
  expect(g.planAt).toBe(0)
  // a JSON object is not a list either
  expect(applyAction(g, { action: 'plan', tasks: '{"title":"A"}' }, { now: 1000 }).ok).toBe(false)
})

test('each task is checked, and the error names the task and the field, and plans nothing', async () => {
  const g = fresh()
  const r = applyAction(g, { action: 'plan', tasks: [{ title: 'fine', size: 'S' }, { title: 'big', size: 'XL' }, { size: 'S' }, 5] }, { now: 1000 })
  expect(r.ok).toBe(false)
  expect(r.text).toContain('task 2 ("big") has size "XL"; use "S", "M" or "L"')
  expect(r.text).toContain('task 3 needs a non-empty "title"')
  expect(r.text).toContain('task 4 is not a { title, size } object')
  expect(r.text).toContain('Nothing was planned.')
  expect(g.tasks).toHaveLength(0)
})

test('a missing size is M, the size words work, and a plan or add reply starts with the count', async () => {
  const g = fresh()
  const r = applyAction(g, { action: 'plan', tasks: [{ title: 'a' }, { title: 'b', size: 'large' }, 'c'] }, { now: 1000 })
  expect(g.tasks.map((t: any) => t.size)).toEqual(['M', 'L', 'M'])
  expect(r.text.split('\n')[0]).toBe('Planned 3 tasks.')
  expect(applyAction(g, { action: 'add', tasks: [{ title: 'd' }] }, { now: 2000 }).text.split('\n')[0]).toBe('Added 1 task.')
  // the other actions have no count line
  expect(applyAction(g, { action: 'done', id: 1 }, { now: 3000 }).text.startsWith('Plan:')).toBe(true)
})

test('plain text is still one task a line, and the first-task title still names a plan', async () => {
  const g = fresh()
  applyAction(g, { action: 'plan', tasks: '- first step\n- second step' }, { now: 1000 })
  expect(g.tasks.map((t: any) => t.title)).toEqual(['first step', 'second step'])
  expect(planSubject({ tasks: '[{"title":"Named","size":S}]' })).toBe('Named')
})

// the shape Claude Code hands the tool when the model's whole call is not valid JSON
const wrapped = (raw: string, extra: object = {}) => ({ tool: TOOL, tool_use_id: 'x', ...extra, __unparsedToolInput: { raw, len: raw.length } })

test('a call the host could not parse is read, repairing a bare size, and keeps the host\'s own fields', async () => {
  const raw = '{"action": "plan", "goal": "live test", "tasks": [{"title":"Unquoted","size":S},{"title":"Second","size":M}]}'
  const r = readCall(wrapped(raw, { agentId: 'a1' }))
  expect(r.error).toBe('')
  expect(r.repaired).toBe(2)
  expect(r.input.action).toBe('plan')
  expect(r.input.goal).toBe('live test')
  expect(r.input.agentId).toBe('a1')
  expect(r.input.__unparsedToolInput).toBeUndefined()
  expect(parseTasks(r.input.tasks).list.map((t: any) => t.size)).toEqual(['S', 'M'])
})

test('a call that is wrapped and valid JSON is read without a repair, and a plain call is left alone', async () => {
  const ok = readCall(wrapped('{"action":"done","id":2}'))
  expect(ok.input.action).toBe('done')
  expect(ok.repaired).toBe(0)
  const plain = { tool: TOOL, action: 'show' }
  expect(readCall(plain)).toEqual({ input: plain, repaired: 0, error: '' })
})

test('a wrapped call that cannot be read is an error saying so, not "no plan yet"', async () => {
  const r = readCall(wrapped('{"action": "add", "tasks": [{"title":"A","size":"S"},{"title":"B",}]}'))
  expect(r.error).toContain('the call was not valid JSON, so none of it was read')
  expect(r.error).toContain('every value in quotes')
  expect(readCall(wrapped('[1,2]')).error).toContain('not a JSON object')
})

test('a plan over 60 tasks keeps the first 60 and says so', async () => {
  const g = fresh()
  const many = Array.from({ length: 63 }, (_, i) => ({ title: 't' + i, size: 'S' }))
  const r = applyAction(g, { action: 'plan', tasks: many }, { now: 1000 })
  expect(g.tasks).toHaveLength(60)
  expect(r.text.split('\n')[0]).toBe('Planned 60 tasks. Kept the first 60; 3 more were left out.')
})

// ---------- what Claude is asked ----------

test('the tool offers park, and every ask carries the two rules', async () => {
  expect(TOOL_SPEC.inputSchema.properties.action.enum).toContain('park')
  expect(TOOL_SPEC.description).toContain('"park"')
  expect(TOOL_SPEC.description).toContain('turns out differently')
  for (const text of [instruction(TOOL), standing(TOOL)]) {
    // revise the later steps when a step surprises
    expect(text).toContain('turns out differently')
    expect(text).toContain('"note" saying what changed')
    // never leave an open task unexplained: finish, park, or ask with a recommendation
    expect(text).toContain('Never end your turn with a task still open')
    expect(text).toContain('"park"')
    expect(text).toContain('your recommendation')
  }
})
