import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { resultText } from './plan.mjs'

// The task tool's result block in the terminal's transcript: the stock renderer clips a long plan
// to "... +N lines", so Waypoints draws all of it. Everything it cannot or should not draw falls
// through to the stock renderer, which these tests stand in for with a marker. No /skin is loaded
// in this world: the hook depends on nothing but the engine's own ToolResult, so it works without it.

const TOOL = 'mcp__waypoints__tasks'
const NOW = new Date(2026, 9, 17, 14, 30).getTime()
const LIST = ['Plan: 1 of 3 tasks done, 20% of the work.', '#1 done  one (S)', '#2 running  two (S)', '#3 todo  three (M)'].join('\n')

function world(on: On, o: { rec?: boolean } = {}) {
  mock.clock(on, { now: NOW })
  mock.store(on, {})
  mock.env(on, { USERPROFILE: 'C:/Users/bats' })
  on('session.start', async () => ({ cwd: 'C:/bats' }))
  on('ui.log', async () => ({ value: undefined }) as any)
  on('session.id', async () => ({ value: 'sess-1' }) as any)
  on('session.cwd', async () => ({ value: 'C:/bats' }) as any)
  on('fs.exists', async (_$, e) => ({ value: !!o.rec && String(e.path).endsWith('recording.json') }) as any)
  on('fs.read', async () => ({ value: JSON.stringify({ on: true, strict: false }) }) as any)
  on('fs.write', async () => ({ value: undefined }) as any)
  on('fs.list', async () => ({ value: [] }) as any)
  on('tool.register', async () => ({ value: { tool: TOOL } }) as any)
  on('command.register', async (_$, e) => ({ value: { command: e.name } }) as any)
  on('ui.toast', async () => ({ value: undefined }) as any)
  on('prompt.compose', async () => ({ sections: [] }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => h($.ui.resolve(e).Box, {}) as any)
  // the engine's own result block, clipped
  on('ui.render', { component: 'ToolResult' }, async ($, e) => $.ui.resolve(e).Text({ children: ['STOCK'] }) as any)
}

type Result = { tool?: string; output?: unknown; isErrored?: boolean; isExpanded?: boolean; surface?: 'terminal' | 'desktop' }

async function drawn($: any, r: Result = {}) {
  await $.session.start({ cwd: 'C:/bats', surface: r.surface ?? 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'waypoints',
    surface: r.surface ?? 'terminal',
    component: 'ToolResult',
    props: { tool_use_id: 't1', tool: r.tool ?? TOOL, output: 'output' in r ? r.output : { result: LIST }, isErrored: !!r.isErrored, ...(r.isExpanded === undefined ? {} : { isExpanded: r.isExpanded }) },
  })
  const text = ((await ui.findAll({ type: 'Text' })) as any[]).map((t) => t.text)
  await ui.unmount()
  return text
}

test('the terminal draws every line of the task result', async ($, on) => {
  world(on)
  expect(await drawn($)).toEqual(LIST.split('\n'))
})

test('the result reads the same from a bare string and from content blocks', async ($, on) => {
  world(on)
  expect(await drawn($, { output: LIST })).toEqual(LIST.split('\n'))
  expect(await drawn($, { output: [{ type: 'text', text: LIST }] })).toEqual(LIST.split('\n'))
})

test('another tool, another surface, an error and ctrl+o keep the stock result', async ($, on) => {
  world(on)
  expect(await drawn($, { tool: 'Bash' })).toEqual(['STOCK'])
  expect(await drawn($, { surface: 'desktop' })).toEqual(['STOCK'])
  expect(await drawn($, { isErrored: true })).toEqual(['STOCK'])
  expect(await drawn($, { isExpanded: true })).toEqual(['STOCK'])
})

test('an output with no readable text keeps the stock result', async ($, on) => {
  world(on)
  expect(await drawn($, { output: undefined })).toEqual(['STOCK'])
  expect(await drawn($, { output: { stdout: 'x' } })).toEqual(['STOCK'])
})

test('while a recording masks the screen, the result is masked too', async ($, on) => {
  world(on, { rec: true })
  const out = await drawn($, { output: { result: 'Plan: 0 of 1 tasks done.\n#1 todo  email me@example.com (S)' } })
  expect(out).toHaveLength(2)
  expect(out.join('')).not.toContain('me@example.com')
})

test('resultText reads the shapes the engine may store', () => {
  expect(resultText('a')).toBe('a')
  expect(resultText({ result: 'a' })).toBe('a')
  expect(resultText({ text: 'a' })).toBe('a')
  expect(resultText({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe('a\nb')
  expect(resultText({ stdout: 'a' })).toBeNull()
  expect(resultText(null)).toBeNull()
  expect(resultText([])).toBeNull()
})
