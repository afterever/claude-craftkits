import { test, expect } from 'claude-code/testing'

import type { DayRecord } from '../types'
import { addDays, keyOf, noonOf } from './dates'
import {
  absorbPrompts,
  addPrompt,
  addTask,
  chartFor,
  DEFAULT_SETTINGS,
  emptyDay,
  estimate,
  hoursText,
  mergeDays,
  modelName,
  monthTotals,
  normalizeDay,
  normalizeSettings,
  promptsOf,
  shownKinds,
  streak,
  summaryFor,
  tasksOf,
  totalsFor,
  withCommas,
} from './report'

// Tuesday 13 October 2026
const NOW = new Date(2026, 9, 13, 14, 30).getTime()
const ago = (n: number) => keyOf(addDays(noonOf(NOW), -n))

const day = (kinds: DayRecord['kinds'], models: DayRecord['models'] = {}): DayRecord => ({ kinds, models })

test('adding days together sums each kind and each model', () => {
  const a = day({ emails: 2, research: 1 }, { 'Sonnet 5.5': 3 })
  const b = day({ emails: 1, documents: 4 }, { 'Sonnet 5.5': 1, 'Opus 5.5': 4 })
  expect(mergeDays(a, b)).toEqual({
    kinds: { emails: 3, documents: 4, research: 1 },
    models: { 'Sonnet 5.5': 4, 'Opus 5.5': 4 },
  })
  // neither side is changed, and an empty day is nothing to add
  expect(a.kinds.emails).toBe(2)
  expect(mergeDays(a, emptyDay())).toEqual(a)
  expect(tasksOf(mergeDays(a, b))).toBe(8)
  expect(addTask(a, 'other', 'Haiku 5.5')).toEqual({ kinds: { emails: 2, research: 1, other: 1 }, models: { 'Sonnet 5.5': 3, 'Haiku 5.5': 1 } })
})

test('totals over a stretch add its days and list tasks per day', () => {
  const days = {
    [ago(0)]: day({ emails: 1, other: 2 }, { 'Sonnet 5.5': 3 }),
    [ago(1)]: day({ documents: 1 }, { 'Opus 5.5': 1 }),
    [ago(9)]: day({ research: 5 }, { 'Opus 5.5': 5 }),
  }
  const week = totalsFor(days, [ago(6), ago(5), ago(4), ago(3), ago(2), ago(1), ago(0)])
  expect(week.tasks).toBe(4)
  expect(week.kinds).toEqual({ emails: 1, images: 0, code: 0, documents: 1, research: 0, other: 2 })
  expect(week.models).toEqual({ 'Sonnet 5.5': 3, 'Opus 5.5': 1 })
  expect(week.perDay).toEqual([0, 0, 0, 0, 0, 1, 3])
})

test('prompts are kept by repo on the day, and a day with none reads back exactly as before', () => {
  const a = addPrompt(addPrompt(emptyDay(), 'alpha'), 'alpha')
  expect(a).toEqual({ kinds: {}, models: {}, repos: { alpha: 2 } })
  expect(promptsOf(addPrompt(a, 'beta'))).toBe(3)
  expect(promptsOf(undefined)).toBe(0)
  // a record without repos stays without the key, so a day from before 0.5.0 is untouched
  expect(mergeDays(day({ code: 1 }), day({ code: 1 }))).toEqual({ kinds: { code: 2 }, models: {} })
  expect(mergeDays(a, day({ other: 1 }, { 'Opus 5.5': 1 }))).toEqual({ kinds: { other: 1 }, models: { 'Opus 5.5': 1 }, repos: { alpha: 2 } })
  // a prompt is not a task: a day of prompts alone holds no task
  expect(tasksOf(a)).toBe(0)
})

test('what the store gave back is made safe: bad repo counts and empty names are dropped', () => {
  expect(normalizeDay({ kinds: {}, models: {}, repos: { alpha: 3, beta: -1, gamma: 'x', ' ': 4 } })).toEqual({ kinds: {}, models: {}, repos: { alpha: 3 } })
  expect(normalizeDay({ kinds: { code: 1 }, models: {}, repos: 'nonsense' })).toEqual({ kinds: { code: 1 }, models: {} })
})

test('prompts found in saved sessions raise a day to what the files show, and never add to what it holds', () => {
  const held = { kinds: { code: 1 }, models: { 'Opus 5.5': 1 }, repos: { alpha: 5, beta: 1 } } as DayRecord
  const out = absorbPrompts(held, { alpha: 2, beta: 4, gamma: 1 })
  expect(out.repos).toEqual({ alpha: 5, beta: 4, gamma: 1 })
  // tasks and models are carried over untouched, and the day it was given is not changed
  expect(out.kinds).toEqual({ code: 1 })
  expect(out.models).toEqual({ 'Opus 5.5': 1 })
  expect(held.repos).toEqual({ alpha: 5, beta: 1 })
  // doing it again changes nothing
  expect(absorbPrompts(out, { alpha: 2, beta: 4, gamma: 1 })).toEqual(out)
})

test('totals carry the prompts of the stretch by repo, and the day outside it is left out', () => {
  const days = {
    [ago(0)]: { kinds: { code: 1 }, models: {}, repos: { alpha: 2, beta: 1 } } as DayRecord,
    [ago(1)]: { kinds: {}, models: {}, repos: { alpha: 3 } } as DayRecord,
    [ago(20)]: { kinds: {}, models: {}, repos: { alpha: 9 } } as DayRecord,
  }
  const week = totalsFor(days, [ago(1), ago(0)])
  expect(week.repos).toEqual({ alpha: 5, beta: 1 })
  expect(week.prompts).toBe(6)
  expect(week.tasks).toBe(1)
  expect(totalsFor({}, [ago(0)]).prompts).toBe(0)
})

test('the estimate is minutes per kind, then hours, then dollars at the rate', () => {
  const kinds = { emails: 3, images: 0, code: 5, documents: 2, research: 1, other: 4 }
  const est = estimate(kinds, DEFAULT_SETTINGS)
  // 3x10 + 5x20 + 2x30 + 1x20 + 4x10 = 250 minutes
  const near = (n: number) => Math.round(n * 1e6) / 1e6
  expect(est.minutes).toBe(250)
  expect(near(est.hours)).toBe(near(250 / 60))
  expect(near(est.dollars)).toBe(near((250 / 60) * 50))
  expect(est.byKind.documents.minutes).toBe(60)
  expect(est.byKind.code.minutes).toBe(100)

  const changed = estimate(kinds, { ...DEFAULT_SETTINGS, rate: 75, minutes: { ...DEFAULT_SETTINGS.minutes, emails: 15 } })
  expect(changed.minutes).toBe(265)
  expect(near(changed.dollars)).toBe(near((265 / 60) * 75))
})

test('only the kinds a stretch holds are shown, most first, with other always last', () => {
  const none = { emails: 0, images: 0, code: 0, documents: 0, research: 0, other: 0 }
  expect(shownKinds(none)).toEqual([])
  expect(shownKinds({ ...none, code: 6, research: 2, other: 9 })).toEqual(['code', 'research', 'other'])
  // the biggest first, whatever the fixed order
  expect(shownKinds({ ...none, emails: 1, documents: 4, images: 2 })).toEqual(['documents', 'images', 'emails'])
  // a tie keeps the fixed order: emails, images, code, documents, research
  expect(shownKinds({ ...none, research: 3, code: 3, emails: 3 })).toEqual(['emails', 'code', 'research'])
  // other is not drawn when it holds nothing
  expect(shownKinds({ ...none, other: 0, code: 1 })).toEqual(['code'])
})

test('the defaults are the ones asked for, and damaged settings fall back to them', () => {
  expect(DEFAULT_SETTINGS).toEqual({ rate: 50, minutes: { emails: 10, documents: 30, images: 20, code: 20, research: 20, other: 10 }, band: true })
  expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  // settings and days saved before the code kind existed are read as they were, code at its default
  // and the chip, which they never had a say in, on
  expect(normalizeSettings({ rate: 80, minutes: { emails: 12, documents: 30, images: 20, research: 25, other: 10 } })).toEqual({
    rate: 80,
    minutes: { emails: 12, documents: 30, images: 20, code: 20, research: 25, other: 10 },
    band: true,
  })
  // the chip is only ever a yes or a no
  expect(normalizeSettings({ band: false }).band).toBe(false)
  expect(normalizeSettings({ band: 'off' }).band).toBe(true)
  expect(normalizeDay({ kinds: { emails: 2, other: 5 }, models: { A: 7 } })).toEqual({ kinds: { emails: 2, other: 5 }, models: { A: 7 } })
  expect(normalizeSettings({ rate: 'a lot', minutes: { emails: -4, documents: 45 } })).toEqual({
    rate: 50,
    minutes: { ...DEFAULT_SETTINGS.minutes, documents: 45 },
    band: true,
  })
  expect(normalizeDay({ kinds: { emails: 2, bogus: 9, other: -1 }, models: { A: 1, B: 'x' } })).toEqual({ kinds: { emails: 2 }, models: { A: 1 } })
  expect(normalizeDay('nonsense')).toEqual(emptyDay())
})

test('the streak counts days in a row back from today', () => {
  const days = { [ago(0)]: day({ other: 1 }), [ago(1)]: day({ other: 2 }), [ago(2)]: day({ emails: 1 }), [ago(4)]: day({ other: 1 }) }
  expect(streak(days, NOW)).toBe(3)
  // today has not had its first task yet: yesterday's streak is still alive
  expect(streak({ [ago(1)]: day({ other: 1 }), [ago(2)]: day({ other: 1 }) }, NOW)).toBe(2)
  // missed yesterday and today: no streak
  expect(streak({ [ago(2)]: day({ other: 1 }) }, NOW)).toBe(0)
  expect(streak({}, NOW)).toBe(0)
  // across a month and a year boundary
  const jan = new Date(2027, 0, 2, 10).getTime()
  const crossing = { '2027-01-02': day({ other: 1 }), '2027-01-01': day({ other: 1 }), '2026-12-31': day({ other: 1 }), '2026-12-30': day({ other: 1 }) }
  expect(streak(crossing, jan)).toBe(4)
})

test('the chart: seven weekdays for Today and Week, thirty days for Month, twelve months for Year', () => {
  const days = { [ago(0)]: day({ other: 3 }), [ago(1)]: day({ other: 1 }), '2026-03-04': day({ emails: 9 }), '2026-09-30': day({ other: 2 }) }

  for (const tab of ['today', 'week'] as const) {
    const bars = chartFor(tab, days, NOW)
    expect(bars.map(b => b.label)).toEqual(['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'])
    expect(bars.map(b => b.value)).toEqual([0, 0, 0, 0, 0, 1, 3])
    expect(bars.filter(b => b.isCurrent)).toHaveLength(1)
    expect(bars[6]!.isCurrent).toBe(true)
  }

  const month = chartFor('month', days, NOW)
  expect(month).toHaveLength(30)
  expect(month.map(b => b.value).slice(-2)).toEqual([1, 3])
  expect(month[29]!.isCurrent).toBe(true)
  // every fifth date and today carry their number
  expect(month.filter(b => b.label !== '').map(b => b.label)).toEqual(['15', '20', '25', '30', '5', '10', '13'])

  const year = chartFor('year', days, NOW)
  expect(year.map(b => b.label)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
  expect(year.map(b => b.value)).toEqual([0, 0, 9, 0, 0, 0, 0, 0, 2, 4, 0, 0])
  expect(year.filter(b => b.isCurrent).map(b => b.label)).toEqual(['Oct'])
  expect(year.filter(b => b.isFuture).map(b => b.label)).toEqual(['Nov', 'Dec'])
  expect(monthTotals(days, 2026)[2]).toBe(9)
})

test('the line under the chart: the streak for Today and Week, the best day or month for Month and Year', () => {
  const days = {
    [ago(0)]: day({ other: 2 }),
    [ago(1)]: day({ other: 1 }),
    [ago(5)]: day({ emails: 6 }),
    '2026-03-04': day({ emails: 9 }),
    '2026-03-05': day({ other: 1 }),
  }
  expect(summaryFor('today', days, NOW).text).toBe('Streak: 2 days in a row.')
  expect(summaryFor('week', days, NOW).text).toBe('Streak: 2 days in a row.')
  expect(summaryFor('week', {}, NOW)).toMatchObject({ isGood: false })
  expect(summaryFor('today', { [ago(0)]: day({ other: 1 }) }, NOW).text).toBe('Streak: 1 day in a row.')

  const month = summaryFor('month', days, NOW)
  expect(month.text).toBe('Best day: Thu 8 Oct, 6 tasks. 3 active days of 30.')
  expect(month.isGood).toBe(true)

  const year = summaryFor('year', days, NOW)
  expect(year.text).toBe('Best month: March, 10 tasks. 5 active days.')
  expect(summaryFor('month', {}, NOW).text).toContain('0 active days of 30')
  expect(summaryFor('year', {}, NOW).text).toContain('0 active days')
})

test('a model id becomes a short name', () => {
  expect(modelName('claude-sonnet-5-5')).toBe('Sonnet 5.5')
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-fable-5-1')).toBe('Fable 5.1')
  expect(modelName('claude-sonnet-4-20250514')).toBe('Sonnet 4')
  expect(modelName('claude-opus-4-1-20250805')).toBe('Opus 4.1')
  expect(modelName('claude-3-5-sonnet-20241022')).toBe('Sonnet 3.5')
  expect(modelName('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5')
  expect(modelName(undefined)).toBe('Unknown model')
  expect(modelName('some-other-model-20250101')).toBe('some-other-model')
})

test('hours and dollars are written the short way', () => {
  expect(hoursText(0)).toBe('0')
  expect(hoursText(0.04)).toBe('0')
  expect(hoursText(2.5)).toBe('2.5')
  expect(hoursText(2)).toBe('2')
  expect(hoursText(9.96)).toBe('10')
  expect(hoursText(12.4)).toBe('12')
  expect(withCommas(1234567)).toBe('1,234,567')
  expect(withCommas(999)).toBe('999')
})
