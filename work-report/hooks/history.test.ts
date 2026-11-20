import { test, expect } from 'claude-code/testing'

import { bucket, humanPrompts } from './history'

const line = (o: Record<string, unknown>) =>
  JSON.stringify({
    type: 'user',
    isSidechain: false,
    origin: { kind: 'human' },
    message: { role: 'user', content: 'a prompt' },
    cwd: 'E:/github/a',
    promptId: 'p',
    timestamp: '2026-10-13T06:00:00.000Z',
    ...o,
  })

test('a user line marked human is a typed prompt, with its folder, its time and its id', () => {
  const [p] = humanPrompts(line({ promptId: 'abc' }))
  expect(p).toEqual({ cwd: 'E:/github/a', ms: Date.parse('2026-10-13T06:00:00.000Z'), id: 'abc' })
})

test('text blocks count, and a pasted block is part of what was typed', () => {
  expect(humanPrompts(line({ message: { role: 'user', content: [{ type: 'text', text: 'hello' }] } }))).toHaveLength(1)
  expect(humanPrompts(line({ message: { role: 'user', content: '<pasted>some text</pasted>' } }))).toHaveLength(1)
})

test('what the person did not write is left out: results, injected notes, helpers, commands, other origins', () => {
  const text = [
    line({ message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } }),
    line({ isMeta: true }),
    line({ isSidechain: true }),
    line({ isCompactSummary: true }),
    line({ origin: { kind: 'task-notification' } }),
    line({ origin: { kind: 'plugin' } }),
    line({ origin: undefined }),
    line({ type: 'assistant' }),
    line({ message: { role: 'user', content: '<command-name>/compact</command-name>' } }),
    line({ message: { role: 'user', content: '<command-message>work-report</command-message>' } }),
    line({ message: { role: 'user', content: '<local-command-stdout>done</local-command-stdout>' } }),
    line({ message: { role: 'user', content: '<system-reminder>x</system-reminder>' } }),
    line({ message: { role: 'user', content: '   ' } }),
  ].join('\n')
  expect(humanPrompts(text)).toEqual([])
})

test('a line that is damaged, or lacks a time, a folder or an id, is skipped without a word', () => {
  const text = ['{"origin":{"kind":"human"} not json', line({ timestamp: 'yesterday' }), line({ cwd: undefined }), line({ promptId: undefined, uuid: undefined }), line({ promptId: undefined, uuid: 'u1' })].join('\n')
  expect(humanPrompts(text).map(p => p.id)).toEqual(['u1'])
})

test('prompts are bucketed by day and repo, and one seen twice counts once', () => {
  const at = (h: number) => new Date(2026, 9, 12, h).getTime()
  const found = [
    { cwd: 'a', ms: at(9), id: '1' },
    { cwd: 'a', ms: at(10), id: '2' },
    { cwd: 'a', ms: at(10), id: '2' },
    { cwd: 'b', ms: at(11), id: '3' },
    { cwd: 'a', ms: new Date(2026, 9, 13, 9).getTime(), id: '4' },
  ]
  const days = bucket(found, cwd => (cwd === 'a' ? 'Alpha' : 'Beta'), ms => `oct-${new Date(ms).getDate()}`)
  expect(days).toEqual({ 'oct-12': { Alpha: 2, Beta: 1 }, 'oct-13': { Alpha: 1 } })
})
