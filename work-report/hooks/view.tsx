// The pane, drawn from what the state holds. Nothing here writes: a press
// calls one of the actions register.tsx hands in.
//
// Every row is sized to the width the pane reports, in cells, so nothing wraps:
// text is chosen from wordings that fit, bars and the chart are built to the
// width, and a row is clipped at the edge rather than wrapped should a surface
// be narrower than it said.
import type { Elements, UiPressArgument } from 'claude-code'

import type { DayRecord, Kind, Settings, Tab } from '../types'
import { daysFor, describeDays, keyOf, sinceWords, stretchName, TAB_NAME } from './dates'
import { KIND_LABEL, KIND_SHORT, KINDS } from './kinds'
import { barRow, chartPlan, clip, COLORS, fit, KIND_TONE, padStart, strWidth, tileFace, tilePlan, TITLE } from './layout'
import type { Line, Tone } from './layout'
import { chartFor, estimate, hoursText, promptsOf, shownKinds, summaryFor, totalsFor, withCommas } from './report'
import type { Totals } from './report'
import { barsSvg, chartSvg, drawingWidth, tilesSvg } from './svg'
import { VERSION } from './version'

type El = Elements['terminal']
type SvgEl = Elements['desktop']['Svg']
type Press = (e: UiPressArgument) => void

export type Actions = {
  pickTab: (tab: Tab) => void
}

export type Model = {
  /** What the pane reports it is wide, in cells. */
  width: number
  tab: Tab
  days: Readonly<Record<string, DayRecord>>
  settings: Settings
  /** Now, in milliseconds. */
  now: number
  /**
   * The vector element, where the surface draws one (the desktop, the editor):
   * the tiles, bars and chart are then drawings, which no font can put out of
   * line. Absent on the terminal, which draws them as text.
   */
  Svg?: SvgEl
}

// Far more glyphs than any pane is wide: the box around it clips the rest
const RUN = 400
const TABS: readonly { tab: Tab; hotkey: string }[] = [
  { tab: 'today', hotkey: 't' },
  { tab: 'week', hotkey: 'w' },
  { tab: 'month', hotkey: 'm' },
  { tab: 'year', hotkey: 'y' },
]

// ── Pieces ───────────────────────────────────────────────────────────────

/** One row of coloured segments, at most one line tall: clipped at the edge, never wrapped. */
function lineRow(el: El, line: Line) {
  const { Box, Text } = el
  const segs = line.filter(s => s.t !== '')
  if (segs.length === 0) return <Text> </Text>
  return (
    <Box flexDirection="row" width="100%" height={1} overflow="hidden">
      {segs.map(s => (
        <Text color={COLORS[s.tone]} {...(s.bold ? { bold: true } : {})}>
          {s.t}
        </Text>
      ))}
    </Box>
  )
}

const blank = (el: El) => lineRow(el, [])

/** A rule that fills what is left of its row: clipped at the edge, never wrapped. */
function rule(el: El, color: string = COLORS.hair, glyph = '─') {
  const { Box, Text } = el
  return (
    <Box flexGrow={1} flexShrink={1} minWidth={0} height={1} overflow="hidden">
      <Text color={color}>{glyph.repeat(RUN)}</Text>
    </Box>
  )
}

/** SMALL MUTED CAPITALS with a note at the far end, and a hairline under them across the pane. */
function heading(el: El, width: number, label: string, right?: string) {
  const { Box, Text } = el
  const note = right ? clip(right, Math.max(0, width - strWidth(label) - 2)) : ''
  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" justifyContent="space-between" width="100%" columnGap={2}>
        <Box flexShrink={0}>
          <Text color={COLORS.muted}>{label.toUpperCase()}</Text>
        </Box>
        {note !== '' ? (
          <Box flexShrink={1}>
            <Text color={COLORS.muted}>{note}</Text>
          </Box>
        ) : null}
      </Box>
      <Box flexDirection="row" width="100%">
        {rule(el)}
      </Box>
    </Box>
  )
}

function chip(el: El, o: { key: string; label: string; isMain: boolean; hotkey: string; onPress: Press }) {
  const { Button, Text } = el
  const look = o.isMain
    ? { backgroundColor: COLORS.gold, color: COLORS.dark, bold: true }
    : { backgroundColor: COLORS.hair, color: COLORS.text }
  return (
    <Button key={o.key} plain hotkey={o.hotkey} onPress={o.onPress}>
      <Text {...look}>{` ${o.label} `}</Text>
    </Button>
  )
}

/** The title in bold capitals, a gold rule the width of the title that carries on as a hairline. */
function top(el: El) {
  const { Box, Text } = el
  return [
    <Box flexDirection="row" width="100%">
      <Text bold color={COLORS.text}>
        {TITLE}
      </Text>
    </Box>,
    <Box flexDirection="row" width="100%">
      <Box flexShrink={0}>
        <Text color={COLORS.gold}>{'━'.repeat(TITLE.length)}</Text>
      </Box>
      {rule(el)}
    </Box>,
  ]
}

/** The stretch on the left, its dates on the right, a hairline under. */
function titleBar(el: El, width: number, left: string, right: string) {
  const { Box, Text } = el
  const l = clip(left, width)
  const r = fit(Math.max(0, width - strWidth(l) - 2), [right, right.replace(/ \d{4}$/, ''), ''])
  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" justifyContent="space-between" width="100%" columnGap={2}>
        <Box flexShrink={0}>
          <Text bold color={COLORS.text}>
            {l.toUpperCase()}
          </Text>
        </Box>
        {r !== '' ? (
          <Box flexShrink={1}>
            <Text color={COLORS.muted}>{r}</Text>
          </Box>
        ) : null}
      </Box>
      <Box flexDirection="row" width="100%">
        {rule(el)}
      </Box>
    </Box>
  )
}

// ── Sections ─────────────────────────────────────────────────────────────

function tilesBlock(el: El, width: number, tasks: number, hours: number, dollars: number, Svg?: SvgEl) {
  const { Box, Text } = el
  const plan = tilePlan(width)
  const hoursNum = hoursText(hours)
  const dollarsNum = String(Math.round(dollars))
  const tiles: { id: string; numerals: string; plain: string; tone: Tone; captions: string[] }[] = [
    { id: 'hours', numerals: hoursNum, plain: `${hoursNum} h`, tone: 'gold', captions: ['est. hours saved', 'est. hours', 'hours'] },
    { id: 'tasks', numerals: String(tasks), plain: withCommas(tasks), tone: 'text', captions: ['tasks done', 'tasks'] },
    { id: 'worth', numerals: dollarsNum, plain: `$${withCommas(dollars)}`, tone: 'green', captions: ['est. worth in $', 'est. $', '$'] },
  ]
  const shown = tiles.slice(0, plan.count)
  const hidden = tiles.slice(plan.count)
  const share = plan.count === 3 ? '33%' : plan.count === 2 ? '50%' : '100%'
  const hiddenLine =
    hidden.length > 0 &&
    lineRow(el, [
      { t: fit(width, [hidden.map(t => `${t.captions[0]} ${t.plain}`).join(' · '), hidden.map(t => `${t.captions[t.captions.length - 1]} ${t.plain}`).join(' · ')]), tone: 'muted' },
    ])
  if (Svg) {
    const art = tilesSvg(
      drawingWidth(width + 1),
      shown.map(t => ({ face: t.plain, captions: t.captions, tone: t.tone })),
      shown.map(t => `${t.captions[0]} ${t.plain}`).join(', '),
    )
    return (
      <Box flexDirection="column" width="100%">
        <Svg source={art.source} alt={art.alt} />
        {hiddenLine}
      </Box>
    )
  }
  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" columnGap={1} width="100%">
        {shown.map(t => {
          const face = tileFace(t.numerals, t.plain, plan.inner)
          return (
            <Box key={`tile-${t.id}`} flexDirection="column" alignItems="center" width={share} flexShrink={1} borderStyle="round" borderColor={COLORS.hair}>
              {face.kind === 'big' ? (
                <Box flexDirection="column" alignItems="flex-start">
                  {face.rows.map(row => (
                    <Text bold color={COLORS[t.tone]}>
                      {row}
                    </Text>
                  ))}
                </Box>
              ) : (
                <Text bold color={COLORS[t.tone]}>
                  {face.text}
                </Text>
              )}
              <Text color={COLORS.muted}>{fit(plan.inner, t.captions)}</Text>
            </Box>
          )
        })}
      </Box>
      {hiddenLine}
    </Box>
  )
}

function kindRows(el: El, width: number, kinds: Record<Kind, number>, hours: Record<Kind, number>, Svg?: SvgEl) {
  const isWide = width >= 46
  const names = isWide ? KIND_LABEL : KIND_SHORT
  // only what this stretch holds: a coder is not shown an empty Emails row
  const shown = shownKinds(kinds)
  const max = Math.max(1, ...shown.map(k => kinds[k]))
  const cw = String(max).length
  const hourTexts = shown.map(k => `${hoursText(hours[k])}h`)
  const hw = Math.max(1, ...hourTexts.map(t => t.length))
  const showHours = width >= 30
  if (Svg) {
    const art = barsSvg(
      drawingWidth(width + 1),
      shown.map((k, i) => ({
        label: names[k],
        count: kinds[k],
        max,
        tails: showHours ? [String(kinds[k]), hourTexts[i] ?? ''] : [String(kinds[k])],
        tone: KIND_TONE[k],
      })),
      shown.map(k => `${KIND_LABEL[k]} ${kinds[k]}`).join(', '),
    )
    return [<Svg source={art.source} alt={art.alt} />]
  }
  return shown.map((k, i) =>
    lineRow(
      el,
      barRow(width, isWide ? 16 : 8, {
        label: names[k],
        count: kinds[k],
        max,
        tail: showHours ? `${padStart(String(kinds[k]), cw)}  ${padStart(hourTexts[i] ?? '', hw)}` : padStart(String(kinds[k]), cw),
        tone: KIND_TONE[k],
      }),
    ),
  )
}

const NAMED_ROWS = 5

/** One bar per name, most first, the first five and then the rest added up as Others: the models, and the repos. */
function countRows(el: El, width: number, counts: Record<string, number>, tone: Tone, Svg?: SvgEl) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const top3 = sorted.slice(0, NAMED_ROWS)
  const rest = sorted.slice(NAMED_ROWS).reduce((n, [, c]) => n + c, 0)
  const rows: [string, number][] = rest > 0 ? [...top3, ['Others', rest]] : top3
  const max = Math.max(1, ...rows.map(r => r[1]))
  const cw = String(max).length
  if (Svg) {
    const art = barsSvg(
      drawingWidth(width + 1),
      rows.map(([name, count]) => ({ label: name, count, max, tails: [String(count)], tone })),
      rows.map(([name, count]) => `${name} ${count}`).join(', '),
    )
    return [<Svg source={art.source} alt={art.alt} />]
  }
  const labelWidth = Math.min(16, Math.max(...rows.map(r => strWidth(r[0]))))
  return rows.map(([name, count]) => lineRow(el, barRow(width, labelWidth, { label: name, count, max, tail: padStart(String(count), cw), tone })))
}

/** The prompts you typed, by repo, for the stretch; nothing at all when there are none, bar a hint while none was ever counted. */
function promptsBlock(el: El, width: number, totals: Totals, hasEver: boolean, Svg?: SvgEl) {
  const { Box } = el
  if (totals.prompts === 0) {
    if (hasEver) return null
    const hint = fit(width, ['Prompts you typed are counted from now on. /work-report backfill adds the ones in your saved sessions.', 'Prompts: /work-report backfill adds past ones.', ''])
    return hint === '' ? null : <Box flexDirection="column" width="100%">{lineRow(el, [{ t: hint, tone: 'muted' }])}{blank(el)}</Box>
  }
  return (
    <Box flexDirection="column" width="100%">
      {heading(el, width, 'Prompts you typed', `${withCommas(totals.prompts)} in all`)}
      {countRows(el, width, totals.repos, 'blue', Svg)}
      {blank(el)}
    </Box>
  )
}

// ── The pane ─────────────────────────────────────────────────────────────

/** The pane's whole body for the model. `el` is the terminal's table. */
export function drawPane(el: El, m: Model, a: Actions) {
  const { Box, Text } = el
  // one cell is kept back: a row the surface lays out narrower than it reported is clipped, not wrapped
  const width = Math.max(20, m.width - 1)

  const versionRow = lineRow(el, [{ t: `work-report v${VERSION}`, tone: 'muted' }])
  const days = daysFor(m.tab, m.now)
  const totals = totalsFor(m.days, days.map(keyOf))
  const hasEver = Object.values(m.days).some(d => promptsOf(d) > 0)
  const header = (
    <Box flexDirection="column" width="100%">
      {top(el)}
      {blank(el)}
      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        {TABS.map(t =>
          chip(el, { key: `tab-${t.tab}`, label: TAB_NAME[t.tab], isMain: t.tab === m.tab, hotkey: t.hotkey, onPress: () => a.pickTab(t.tab) }),
        )}
      </Box>
      {blank(el)}
      {titleBar(el, width, stretchName(m.tab, m.now), describeDays(days))}
      {blank(el)}
    </Box>
  )

  if (totals.tasks === 0) {
    return (
      <Box flexDirection="column" width="100%">
        {header}
        <Box flexDirection="column" width="100%" borderStyle="round" borderColor={COLORS.hair} paddingX={1}>
          <Text color={COLORS.text} wrap="wrap">
            {`Nothing finished yet ${sinceWords(m.tab)}. Your first finished task shows up here.`}
          </Text>
        </Box>
        {blank(el)}
        {promptsBlock(el, width, totals, hasEver, m.Svg)}
        {versionRow}
      </Box>
    )
  }

  const est = estimate(totals.kinds, m.settings)
  const hours = {} as Record<Kind, number>
  for (const k of KINDS) hours[k] = est.byKind[k].hours
  const bars = chartFor(m.tab, m.days, m.now)
  const summary = summaryFor(m.tab, m.days, m.now)
  const chart = m.Svg
    ? (() => {
        const { Svg } = m
        const art = chartSvg(drawingWidth(width + 1), bars, `${m.tab === 'year' ? 'Tasks per month' : 'Tasks per day'}: ${bars.map(b => b.value).join(', ')}`)
        return [<Svg source={art.source} alt={art.alt} />]
      })()
    : (() => {
        const plan = chartPlan(bars, width)
        return [...plan.rows.map(line => lineRow(el, line)), lineRow(el, [{ t: plan.axis, tone: 'muted' as const }])]
      })()
  const note = fit(width, [
    `Hours and dollars are estimates: minutes per task at $${m.settings.rate} an hour. /work-report settings changes them.`,
    `Estimates: minutes per task at $${m.settings.rate} an hour. /work-report settings changes them.`,
    `Estimates only. /work-report settings changes them.`,
    'Estimates only.',
  ])

  return (
    <Box flexDirection="column" width="100%">
      {header}
      {tilesBlock(el, width, totals.tasks, est.hours, est.dollars, m.Svg)}
      {lineRow(el, [{ t: note, tone: 'muted' }])}
      {blank(el)}
      {heading(el, width, 'Where the time went', 'estimate')}
      {kindRows(el, width, totals.kinds, hours, m.Svg)}
      {blank(el)}
      {heading(el, width, 'Who did the work')}
      {countRows(el, width, totals.models, 'gold', m.Svg)}
      {blank(el)}
      {promptsBlock(el, width, totals, hasEver, m.Svg)}
      {heading(el, width, 'Tasks', m.tab === 'year' ? 'per month' : 'per day')}
      {chart}
      {blank(el)}
      {lineRow(el, [{ t: fit(width, [summary.text, summary.short]), tone: summary.isGood ? 'green' : 'muted' }])}
      {blank(el)}
      {versionRow}
    </Box>
  )
}
