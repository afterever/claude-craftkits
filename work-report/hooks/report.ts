// The numbers: day records, totals over a stretch, the estimate, the streak
// and the chart's bars. Pure; register.tsx reads and writes the store.
import type { DayRecord, Kind, Settings, Tab } from '../types'
import { addDays, keyOf, lastDays, MONTHS, MONTHS_LONG, noonOf, WEEKDAYS } from './dates'
import { KINDS } from './kinds'

// ── Day records ──────────────────────────────────────────────────────────

export const emptyDay = (): DayRecord => ({ kinds: {}, models: {} })

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)

/** A record as the store gave it back, made safe: unknown keys and bad numbers are dropped. */
export function normalizeDay(raw: unknown): DayRecord {
  const out = emptyDay()
  if (!raw || typeof raw !== 'object') return out
  const r = raw as { kinds?: unknown; models?: unknown; repos?: unknown }
  if (r.kinds && typeof r.kinds === 'object') {
    for (const k of KINDS) {
      const n = count((r.kinds as Record<string, unknown>)[k])
      if (n > 0) out.kinds[k] = n
    }
  }
  if (r.models && typeof r.models === 'object') {
    for (const [name, v] of Object.entries(r.models as Record<string, unknown>)) {
      const n = count(v)
      if (n > 0) out.models[name] = n
    }
  }
  const repos = countsOf(r.repos)
  if (Object.keys(repos).length > 0) out.repos = repos
  return out
}

/** A name-to-count map as the store gave it back: bad numbers and empty names dropped. */
function countsOf(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = count(v)
    if (n > 0 && name.trim() !== '') out[name] = n
  }
  return out
}

/** How many tasks a day holds. */
export function tasksOf(rec: DayRecord | undefined): number {
  if (!rec) return 0
  return KINDS.reduce((n, k) => n + (rec.kinds[k] ?? 0), 0)
}

/** How many prompts a day holds, over every repo. */
export function promptsOf(rec: DayRecord | undefined): number {
  if (!rec?.repos) return 0
  return Object.values(rec.repos).reduce((n, v) => n + v, 0)
}

/** Two days added together: the counts of each kind, of each model and of each repo summed. */
export function mergeDays(a: DayRecord, b: DayRecord): DayRecord {
  const out = emptyDay()
  for (const k of KINDS) {
    const n = (a.kinds[k] ?? 0) + (b.kinds[k] ?? 0)
    if (n > 0) out.kinds[k] = n
  }
  for (const src of [a.models, b.models]) {
    for (const [name, n] of Object.entries(src)) out.models[name] = (out.models[name] ?? 0) + n
  }
  const repos: Record<string, number> = {}
  for (const src of [a.repos, b.repos]) {
    for (const [name, n] of Object.entries(src ?? {})) repos[name] = (repos[name] ?? 0) + n
  }
  if (Object.keys(repos).length > 0) out.repos = repos
  return out
}

/** One more task on a day. */
export function addTask(rec: DayRecord, kind: Kind, model: string): DayRecord {
  return mergeDays(rec, { kinds: { [kind]: 1 }, models: { [model]: 1 } })
}

/** One more typed prompt on a day, in the named repo. */
export function addPrompt(rec: DayRecord, repo: string): DayRecord {
  return mergeDays(rec, { kinds: {}, models: {}, repos: { [repo]: 1 } })
}

/**
 * Prompts found in saved sessions, folded into a day: for each repo the larger
 * of what the day holds and what was found, so running a backfill twice, or
 * after the live counter has started, never counts a prompt twice.
 */
export function absorbPrompts(rec: DayRecord, found: Readonly<Record<string, number>>): DayRecord {
  const repos: Record<string, number> = { ...(rec.repos ?? {}) }
  for (const [name, n] of Object.entries(found)) {
    const have = repos[name] ?? 0
    if (n > have) repos[name] = n
  }
  const out: DayRecord = { kinds: { ...rec.kinds }, models: { ...rec.models } }
  if (Object.keys(repos).length > 0) out.repos = repos
  return out
}

// ── Totals ───────────────────────────────────────────────────────────────

export type Totals = {
  tasks: number
  kinds: Record<Kind, number>
  models: Record<string, number>
  /** Typed prompts by repo, over the stretch. */
  repos: Record<string, number>
  /** Typed prompts in all, over the stretch. */
  prompts: number
  /** Tasks on each of the given days, in order. */
  perDay: number[]
}

/** The days of `keys` added together. */
export function totalsFor(days: Readonly<Record<string, DayRecord>>, keys: readonly string[]): Totals {
  let sum = emptyDay()
  const perDay: number[] = []
  for (const key of keys) {
    const rec = days[key]
    perDay.push(tasksOf(rec))
    if (rec) sum = mergeDays(sum, rec)
  }
  const kinds = {} as Record<Kind, number>
  for (const k of KINDS) kinds[k] = sum.kinds[k] ?? 0
  return { tasks: KINDS.reduce((n, k) => n + kinds[k], 0), kinds, models: sum.models, repos: sum.repos ?? {}, prompts: promptsOf(sum), perDay }
}

/**
 * The kinds a stretch has tasks of, most first. `other` is the catch-all and
 * stays last however many it holds; a tie keeps the order of KINDS.
 */
export function shownKinds(kinds: Readonly<Record<Kind, number>>): Kind[] {
  const used = KINDS.filter(k => (kinds[k] ?? 0) > 0)
  const named = used.filter(k => k !== 'other').sort((a, b) => (kinds[b] ?? 0) - (kinds[a] ?? 0))
  return used.includes('other') ? [...named, 'other'] : named
}

// ── The estimate ─────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: Settings = {
  rate: 50,
  minutes: { emails: 10, documents: 30, images: 20, code: 20, research: 20, other: 10 },
  band: true,
}

/** Settings as the store gave them back, each value checked, the rest the default. */
export function normalizeSettings(raw: unknown): Settings {
  const out: Settings = { rate: DEFAULT_SETTINGS.rate, minutes: { ...DEFAULT_SETTINGS.minutes }, band: DEFAULT_SETTINGS.band }
  if (!raw || typeof raw !== 'object') return out
  const r = raw as { rate?: unknown; minutes?: unknown; band?: unknown }
  if (typeof r.rate === 'number' && Number.isFinite(r.rate) && r.rate >= 0) out.rate = r.rate
  if (typeof r.band === 'boolean') out.band = r.band
  if (r.minutes && typeof r.minutes === 'object') {
    for (const k of KINDS) {
      const v = (r.minutes as Record<string, unknown>)[k]
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out.minutes[k] = v
    }
  }
  return out
}

export type Estimate = {
  minutes: number
  hours: number
  dollars: number
  /** Minutes and hours of each kind, for the rows. */
  byKind: Record<Kind, { minutes: number; hours: number }>
}

export function estimate(kinds: Readonly<Record<Kind, number>>, settings: Settings): Estimate {
  const byKind = {} as Estimate['byKind']
  let minutes = 0
  for (const k of KINDS) {
    const m = (kinds[k] ?? 0) * settings.minutes[k]
    byKind[k] = { minutes: m, hours: m / 60 }
    minutes += m
  }
  const hours = minutes / 60
  return { minutes, hours, dollars: hours * settings.rate, byKind }
}

// ── Streak, best day, best month ─────────────────────────────────────────

/**
 * Days in a row with at least one task, counted back from today. A day that
 * has not had its first task yet does not break the streak: it counts from
 * yesterday until today has one.
 */
export function streak(days: Readonly<Record<string, DayRecord>>, ms: number): number {
  let cursor = noonOf(ms)
  if (tasksOf(days[keyOf(cursor)]) === 0) cursor = addDays(cursor, -1)
  let n = 0
  while (n < 3700 && tasksOf(days[keyOf(cursor)]) > 0) {
    n += 1
    cursor = addDays(cursor, -1)
  }
  return n
}

// ── The chart ────────────────────────────────────────────────────────────

export type Bar = {
  /** What stands under the bar; empty when this bar carries none. */
  label: string
  value: number
  /** Today, or this month: drawn in gold. */
  isCurrent: boolean
  /** A month that has not come yet: drawn empty. */
  isFuture: boolean
}

/** Tasks in each month of `year`, January first. */
export function monthTotals(days: Readonly<Record<string, DayRecord>>, year: number): number[] {
  const out = new Array<number>(12).fill(0)
  const prefix = `${year}-`
  for (const [key, rec] of Object.entries(days)) {
    if (!key.startsWith(prefix)) continue
    const m = Number(key.slice(5, 7)) - 1
    if (m >= 0 && m < 12) out[m] = (out[m] ?? 0) + tasksOf(rec)
  }
  return out
}

/**
 * The bars a tab draws. Today and Week: the last seven days by weekday. Month:
 * thirty daily bars. Year: January through December, this month current and
 * the months to come empty.
 */
export function chartFor(tab: Tab, days: Readonly<Record<string, DayRecord>>, ms: number): Bar[] {
  if (tab === 'today' || tab === 'week') {
    return lastDays(ms, 7).map((d, i, all) => ({
      label: WEEKDAYS[d.getDay()] ?? '',
      value: tasksOf(days[keyOf(d)]),
      isCurrent: i === all.length - 1,
      isFuture: false,
    }))
  }
  if (tab === 'month') {
    return lastDays(ms, 30).map((d, i, all) => ({
      // every fifth date, and today, carry their number
      label: d.getDate() % 5 === 0 || i === all.length - 1 ? String(d.getDate()) : '',
      value: tasksOf(days[keyOf(d)]),
      isCurrent: i === all.length - 1,
      isFuture: false,
    }))
  }
  const today = noonOf(ms)
  const totals = monthTotals(days, today.getFullYear())
  return MONTHS.map((name, m) => ({
    label: name,
    value: totals[m] ?? 0,
    isCurrent: m === today.getMonth(),
    isFuture: m > today.getMonth(),
  }))
}

export type Summary = {
  text: string
  /** The same in fewer words, for a narrow pane. */
  short: string
  isGood: boolean
}

/** The one line under the chart. */
export function summaryFor(tab: Tab, days: Readonly<Record<string, DayRecord>>, ms: number): Summary {
  if (tab === 'today' || tab === 'week') {
    const n = streak(days, ms)
    if (n === 0) return { text: 'No streak yet. Finish a task today to start one.', short: 'No streak yet', isGood: false }
    return { text: `Streak: ${n} ${n === 1 ? 'day' : 'days'} in a row.`, short: `Streak: ${n} ${n === 1 ? 'day' : 'days'}`, isGood: true }
  }
  if (tab === 'month') {
    const span = lastDays(ms, 30)
    const per = span.map(d => tasksOf(days[keyOf(d)]))
    const active = per.filter(n => n > 0).length
    let best = -1
    per.forEach((n, i) => {
      if (n > 0 && (best < 0 || n > (per[best] ?? 0))) best = i
    })
    const day = best >= 0 ? span[best] : undefined
    if (!day) return { text: `Best day: none yet. 0 active days of ${span.length}.`, short: '0 active days', isGood: false }
    const dayText = `${WEEKDAYS[day.getDay()]} ${day.getDate()} ${MONTHS[day.getMonth()]}`
    const n = per[best] ?? 0
    return {
      text: `Best day: ${dayText}, ${n} ${n === 1 ? 'task' : 'tasks'}. ${active} active ${active === 1 ? 'day' : 'days'} of ${span.length}.`,
      short: `Best ${day.getDate()} ${MONTHS[day.getMonth()]} (${n}), ${active} active`,
      isGood: true,
    }
  }
  const today = noonOf(ms)
  const totals = monthTotals(days, today.getFullYear())
  let bestMonth = -1
  totals.forEach((n, m) => {
    if (n > 0 && (bestMonth < 0 || n > (totals[bestMonth] ?? 0))) bestMonth = m
  })
  let active = 0
  const prefix = `${today.getFullYear()}-`
  for (const [key, rec] of Object.entries(days)) if (key.startsWith(prefix) && tasksOf(rec) > 0) active += 1
  if (bestMonth < 0) return { text: 'Best month: none yet. 0 active days.', short: '0 active days', isGood: false }
  const n = totals[bestMonth] ?? 0
  return {
    text: `Best month: ${MONTHS_LONG[bestMonth]}, ${n} ${n === 1 ? 'task' : 'tasks'}. ${active} active ${active === 1 ? 'day' : 'days'}.`,
    short: `Best ${MONTHS[bestMonth]} (${n}), ${active} active`,
    isGood: true,
  }
}

// ── Names ────────────────────────────────────────────────────────────────

/** "claude-sonnet-5-5" is "Sonnet 5.5"; an id this does not know is shown as it came, less its date. */
export function modelName(id: string | undefined): string {
  if (!id) return 'Unknown model'
  const clean = id.replace(/\[[^\]]*\]$/, '').trim()
  // claude-sonnet-5-5, claude-opus-4-1-20250805, claude-sonnet-4-20250514
  const family = /claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2})(?!\d))?/.exec(clean)
  // claude-3-5-sonnet-20241022
  const old = /claude-(\d+)(?:-(\d{1,2})(?!\d))?-(opus|sonnet|haiku)/.exec(clean)
  const make = (name: string, major: string, minor?: string) => `${name.charAt(0).toUpperCase()}${name.slice(1)} ${major}${minor ? `.${minor}` : ''}`
  if (family) return make(family[1] ?? '', family[2] ?? '', family[3])
  if (old) return make(old[3] ?? '', old[1] ?? '', old[2])
  const bare = clean.replace(/^claude-/, '').replace(/-\d{8}$/, '')
  return bare === '' ? 'Unknown model' : bare
}

// ── Numbers as words ─────────────────────────────────────────────────────

/** "2.5" under ten hours, a whole number from there. */
export function hoursText(hours: number): string {
  if (!(hours > 0)) return '0'
  if (hours < 10) {
    const t = (Math.round(hours * 10) / 10).toFixed(1)
    return t.endsWith('.0') ? t.slice(0, -2) : t
  }
  return String(Math.round(hours))
}

/** 1234567 is "1,234,567". */
export function withCommas(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
