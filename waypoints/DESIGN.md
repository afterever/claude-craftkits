# Waypoints 2.0: design notes

Waypoints 1.1 works: Claude plans with `mcp__waypoints__tasks`, the band, footer and pane draw the plan, and the
person confirmed all of it live. 2.0 changes how it *looks*, the way `agent-pulse` was made from
`whats-agent-doing`, and makes the pane come up by itself. No behaviour Claude sees changes.

This document is the spec for the build. A section marked **(builder's call)** was settled by the designer
without asking the person; everything else the person chose.

## What the person asked for

1. The right-hand pane should show automatically when a plan starts, with a setting (default on) to turn that off.
2. A nicer bar than one row of cyan `█░`, in the terminal and in Claude Desktop. (They also see the finished bar
   in red; 1.1 draws it with the theme key `green`, so their skin is probably remapping it. Fixed hex palettes
   remove the question.)
3. A better way to show the task list than a window of up to ~6 rows with `+n more`.

## Principles

Borrowed from `agent-pulse/DESIGN.md`, and they hold here too:

- **Every effect carries meaning.** The pulse says "this task is running", the sweep says "the plan is done".
  Nothing moves just to be busy.
- **The text stays text.** The header, the now/next rows and the pane's rows are `Text`: they truncate, screen
  readers and tests read them. The route is decoration beside the header's numbers, never the only place a fact
  lives.
- **Motion is opt-in by degree** (`off` / `subtle` / `full`); colour and shape are not motion and show at every level.
- **One look across the two mods.** By default Waypoints follows Agent-Pulse's palette and animation level, so
  the two bands never disagree. It still works alone.

## The band (terminal)

### Running

```
◎ Plan: Add band to Settings type…               3 of 6 · 44% · ~2m   all tasks g
●━━━━━━━━●━━━━●━━━━━━━━◉┄┄┄┄┄┄┄┄○┄┄┄┄○┄┄┄┄┄┄┄┄◎ +2
⠋ M  Tests: normalize, command, band on/off           ◆ reviewer · 1m
  next ○ S  README, version bump, marketplace.json
⏸ paused, waiting on you                              (only when it applies)
```

Row by row, top to bottom:

1. **Header.** Left: `◎ Goal:` or `◎ Plan:` and the title, truncated. Right: `n of N · pct%`, then ` · ~ETA` once
   `eta()` has one, then the existing `all tasks` button (hotkey `g`). Numbers in the palette's accent colour
   (see Colour roles), ETA dim. The `stats` row of 1.1 is gone; elapsed time moves to the pane.
2. **Route.** See "The route" below.
3. **Now.** One row per running task, at most 2, then `+n running` folded onto the second. Each row: a spinner
   (terminal `Client`; a still `◉` at `off`), size, title (bold, truncated), then on the right `◆ <by>` in the
   agent's colour when `by` is set, and ` · <running time>`. The running time turns amber (`heat[0]`) once it
   passes twice the plan's own pace for that size (pace = time since `planAt` / done weight, × the task's weight;
   only once `eta()` exists) **(builder's call)**. With no task running, this row shows the last finished task
   dimmed (`✓ M  title  1m`), so the band keeps its height between tasks.
4. **Next.** `next ○ <size>  <title>` for the first pending task, dim. Left out when nothing is pending.
5. **Notable (only when it applies).** One row, the first that holds, in this order:
   goal check not met (`warning` colour, `Goal check: not met yet: <reason>`), `interrupted`,
   `⏸ paused, waiting on you` (2.3.0: with background work still running, the dim
   `◆ waiting on <what>` instead, see "2.3.0"). Otherwise no row.

`plan grew` becomes the dim `+k` after the route (k = live tasks − `firstPlan`). Agents running show as the `◆`
marks on the now rows; the 1.1 "n agents running" text is dropped from the band. Goal-check count moves to the pane.

**Room.** If `e.props.maxRows` is short, rows give way in this order: next, notable, now. Header and route stay.

### Planning (no plan yet)

Header (right side: `planning…`) and one dim row: a spinner and `Waiting for Claude's task plan…`, or 1.1's
"No plan yet: reminded Claude…" after the nudge. No route.

### Finished

When the goal finishes (`finishGoal`):

- **`full`:** for ~1.5 s the route row is a one-shot `Client` (keyed by goal id + `endedAt`) that sweeps the
  palette's `sparkle` colours along the route from start to end and leaves a `✦` on the last node.
- **`subtle` / `off`:** the route draws all solid in the `done` colour with `✦` on the last node, no motion.
- Either way the full band stays **8 s** after the finish, then collapses to one row for the rest of the
  `RECENT_MS`, which 2.0 shortens from 10 minutes to 3 (the person's call) and 2.3.1 to 30 seconds; since 2.4.0 it is the `linger` setting, 1 minute by default **(builder's call: the 8 s)**:

```
✓ Plan: Add band to Settings type…                 6 tasks · done in 14m   all tasks g
```

`✓` in the `ok` outcome colour. A stopped goal collapses at once to `◎ Plan: <title>   stopped`.

### The route

One row and a fixed width: it is computed from `bodyColumns`, so it never needs to truncate.

- **Nodes and legs.** Node 0 (start) is `●`. Each live task (not dropped, not replaced) in id order is a **leg**
  and then the node at its end. A leg's length is proportional to `weight()` (S 1, M 2, L 3), at least 2 cells.
  The last node is `◎` (the destination).
- **By state:**
  - done leg `━` and end node `●`: the `done` role, shaded along the route (see below);
  - running leg `┄` dim, and the node at its **start** is `◉`, pulsing;
  - pending leg `┄` and node `○`: dim.

  Tasks finishing out of order (parallel agents) are fine: each leg draws its own state, and every running
  task's start node pulses.
- **Fit.** Width = `bodyColumns` minus the `+k` tail. If the legs cannot all get 2 cells, drop to 1 cell each.
  If even that does not fit (more than ~width/2 tasks), draw **dense mode**: one glyph per task (`●` done, `◉`
  running, `○` pending), no legs, ending in `…` if still too long.
- **The pulse.** Only the `◉` cells animate: a 1-cell `Client` per running node, cycling `shimmerOf(palette, 'tool')`
  (`subtle`); at `full` the glyph also breathes `◉ → ◎ → ◉`. At `off` it is a plain `Text` in the core colour.
- Everything else in the route is plain `Text`, one per run of same-coloured cells, so tests can read it.
- Layout lives in a **pure function** (`route.mjs`, below) that returns cells `{ ch, role, t }`; the drawing only
  colours them. That is what the tests exercise.

## The band (Desktop)

`e.surface !== 'terminal'` (Desktop and mobile; `Svg` draws empty on the terminal, see `agent-pulse/DESIGN.md`).
The header, now, next and notable rows are the same `Text`. The route row is one `Svg`:

- Width as in agent-pulse's strip (`clamp(140..640, bodyColumns × 8 − 40)`) **(builder's call)**, height 14 px.
- Done legs: a solid line with a `linearGradient` core → glow. Pending legs: dashed, dim. Nodes: circles, filled
  for done, a ring for pending, a double ring for the destination.
- Motion (CSS `@keyframes` in the SVG's `<style>`, plus `@media (prefers-reduced-motion: reduce)` in every SVG):
  `subtle` pulses the running node's glow; `full` also moves a small light along each running leg. On finish,
  `full` sweeps light along the route once and twinkles three stars at the last node.
- **The source must not change between redraws** unless the plan did (agent-pulse's rule: a new source restarts
  the CSS). No time, no ETA, nothing per tick in the SVG. A one-shot (the finish sweep) carries the goal id +
  `endedAt` in an id so it plays once.
- `alt`: `"3 of 6 tasks done, task 4 running"`.
- The now row's spinner is a still `◉` in the accent colour on Desktop; the motion lives in the SVG.

## The pane (`/waypoints`)

Opened by hand (`/waypoints`, `g`) as today, **and now automatically** (see below). Its layout:

```
◎ Plan: Add band to Settings type…
  3 of 6 · 44% · 4m elapsed · ~2m left (≈11:41am) · plan grew 4 → 6 · 1 goal check

  ● M  Parse /report settings band on|off       ▅▅▅▅▅▅ 1m
  ┃
  ● S  Band hook honours the setting            ▅▅ 30s
  ┃
  ● M  Settings type, defaults, normalize       ▅▅▅▅ 1m
  ┃
  ◉ M  Tests: normalize, command, band on/off   ◆ reviewer · running 1m
  ┆
  ○ S  README, version bump, marketplace.json
  ┆
  ◎ M  Validate, type-check, test, commit, push

Last goal check: not met yet: …

Other chats (2)
  agent-pulse: palette work     ●━●━◉┄○┄◎   60% · ~5m
  work-report: band setting     ●━●━●━●━✦   done ✓

auto: on · /waypoints hide|show|clear · look: /config
```

- **Trail.** One row per task (replaced tasks hidden, dropped ones shown dim with `×`, struck through, and the
  note). The node glyph and its colour follow the route's rules (the last task's node is `◎`). Between rows a
  connector: `┃` in the `done` colour below a finished task, `┆` dim otherwise.
  Connectors are left out when the plan has more than 10 tasks **(builder's call)**.
- **Timing.** A done task gets a duration bar `▅` (`doneAt − startedAt`), scaled so the longest done task is 12
  cells, in the `done` colour, then the duration. A running task gets `◆ by · running 3m`. The pane draws no
  `Client`; its running node is a still `◉`, and the existing 15 s tick redraws it.
- **Stats** take the old band stats line plus elapsed and goal-check count.
- **Other chats.** Each row: label and title, a **mini route** (2 cells per task: node + leg, ending with `◎`, or
  `✦` when done; one glyph per task when more than 12), then `pct% · ~ETA`, `done ✓`, `stopped` or `planning`.
  Coloured with the same roles.
- The last row shows `auto`'s state (not the word that would flip it), the commands, and points to `/config` for
  the look and the pane's opening. Past 100 data files, a row above it names the folder and `/waypoints prune`
  (2.1.0, see Pruning).

## Auto-opening the pane

- **Setting** `pane`: `auto` (default) or `off` (`userConfig`, see Settings).
- **When:** when a `plan` action succeeds and this goal had no plan before (its `planAt` was 0 before
  `applyAction` ran): `$.ui.open({ id: 'waypoints', title: 'Waypoints', closeOnEscape: true })`.
  Only then: never on `add`, `start`, `done`, and not on `/goal` before there is a plan.
- **No `focus`.** An unasked pane must never take the keys from the prompt, so `focus` is left out. (The first
  draft of this spec said `focus: false`; the host refuses that: `PaneOpenArgs.focus` is `true` or absent.)
- **Not twice:** skip when `$.ui.panes()` already lists `waypoints`.
- **Respect a close.** When `ui.close` for `waypoints` arrives with `e.origin.kind === 'person'`, remember the
  goal's `startedAt` (in memory) and do not auto-open again for that goal. A new goal or plan may auto-open again.
- **Narrow windows.** The engine only places an unasked pane at ≥144 columns (110 for a pane the person opened
  before and has not closed by hand); otherwise `ui.open` resolves `{ isPlaced: false }` and the pane waits
  undrawn until the window widens. Treat `isPlaced: false` silently: no toast (nobody asked). `g` and
  `/waypoints` still open it at any width.
- **Closing.** A pane that Waypoints opened automatically closes itself (`$.ui.close`) when the band leaves
  (`RECENT_MS` after the finish), unless the person opened it themselves in the meantime **(builder's call)**.
  A pane the person opened is never closed by the mod.
- **Is it open?** Replace the `paneOpen` module flag with `$.ui.panes()` (the engine's own record, which survives
  a reload); keep a cached boolean refreshed by `ui.close` and the 15 s tick if a per-draw await is a problem.
  `ui.close` with `origin.kind === 'unload'` must not count as the person closing it.

## Colour

### Palettes

`hooks/palette.mjs` holds a **copy** of `agent-pulse/hooks/palette.ts`'s four palettes (`ember`, `claude`, `neon`,
`mono`): `hex`, `glow`, `phase` (theme keys for `claude`/`mono`), `outcome`, `sparkle`, `heat`, `agents`, and the
helpers `paletteOf`, `levelOf`, `mix`, `shadeOf`, `shimmerOf`, `agentColorOf`, written as plain JS. A comment at
the top says the values are copied and must be kept in step with Agent-Pulse. A Waypoints test pins a few values
so a drift is a deliberate edit. A cross-mod import is not possible (each mod is installed alone).

### Colour roles

Waypoints draws with these roles, mapped onto Agent-Pulse's phase colours so a palette means the same in both
mods:

| Role | Used for | From the palette |
|---|---|---|
| `done` | done legs, done nodes, connectors, duration bars | `tool` core → `tool` glow, shaded along the route by position (cell index / route width) |
| `active` | the pulsing node, the spinner, header numbers (accent) | `shimmerOf(palette, 'tool')`; still: `phase.tool` |
| `pending` | pending legs and nodes, `next` row | `phase.idle` |
| `attention` | goal check not met, paused, interrupted | `phase.approval` |
| `ok` | `✓` of a finished goal, `done ✓` | `outcome.ok` |
| `sparkle` | finish sweep, `✦` | `sparkle[]` |
| agent | `◆ <by>` | `agentColorOf(palette, by)` (same colour Agent-Pulse gives that agent) |
| heat | a task running long | `heat[0]` |

For `claude` and `mono`, `hex === glow`, so `done` is flat and may be a theme key: that is expected (they follow
the theme). On the Desktop SVG always use `hex`/`glow`.

### Follow Agent-Pulse

Waypoints' `palette` and `animation` settings default to **`follow`**:

- `follow` resolves to Agent-Pulse's own value: read `$.config.list()` and take the row with key
  `agent-pulse.palette` (or `agent-pulse.animation`). If there is no such row (Agent-Pulse not installed or
  disabled), use `ember` / `subtle`.
- An explicit value (`ember`, `claude`, `neon`, `mono`; `off`, `subtle`, `full`) overrides the link.
- **When to resolve:** at `session.start`, on a `config.set` hook whose `key` is `agent-pulse.palette` or
  `agent-pulse.animation` (call `next`, then use the new value and invalidate), and on the existing 15 s tick as a
  fallback. The builder must confirm live that the row key really is `agent-pulse.<field>` and that another
  plugin's `/config` change reaches Waypoints' `config.set` hook; if it doesn't, the 15 s tick still catches it.

## Settings

Added to `waypoints/.claude-plugin/plugin.json` as `userConfig` (shown in `/config`; a change reloads the module,
and `session.start` runs again on a reload, as Arsenal relies on, so `restore()` reloads the plan from its file):

| Field | Title | Values | Default |
|---|---|---|---|
| `palette` | Palette | `follow`, `ember`, `claude`, `neon`, `mono` | `follow` |
| `animation` | Animation | `follow`, `off`, `subtle`, `full` | `follow` |
| `pane` | Pane | `auto`, `off` | `auto` |
| `linger` | Finished plan stays | `30 seconds`, `1 minute`, `3 minutes`, `10 minutes` | `1 minute` |

`register(on)` becomes `register(on, options)`. The existing `/waypoints auto|hide|show|clear` commands and the
`$.store` setting behind `auto` are unchanged: they change behaviour, not the look. A `/goal` refuses file edits
until Claude has planned, always, unless the task tool did not register (2.1.0).

## Pruning (2.1.0)

Every chat that plans writes `~/.claude/mods-data/waypoints/<session>.json`, and nothing removed them. `$.fs` has no
delete, so `/waypoints prune` runs the host's own through `$.process.run` with an argv, no shell and no dialog:
`cmd /d /c del /f /q <paths>` on Windows (`OS` is `Windows_NT`), `rm -f -- <paths>` elsewhere. The person chose
this over Claude Code's Bash tool and its permission dialog: typing the command is the confirmation.

- **What goes** (`pickPrunable` in `prune.mjs`): other chats' finished goals that ended over an hour ago (the ones
  the pane no longer lists), any file untouched for 24 hours (`restore()` never loads one that old again), and an
  unreadable file once it is an hour old (younger, another chat may be writing it). Never this chat's file, never a
  running goal touched within the day. At most 200 a run, oldest first.
- **Each path is its own argv entry**, so a space or a quote in a name is just part of it. `cmd` still parses its
  line, so on Windows a path holding `& | < > ^ % ! "` runs nothing and the toast sends the person to the folder.
- **The toast counts the files really gone** (`$.fs.exists` after the run), never the files picked.
- **Seen live** (Windows 11, 2026-10-18, a throwaway probe mod): `cmd /d /c del /f /q` through `$.process.run`
  deleted `a.json` and `b c.json`, exit code 0.

What a reload loses (agent names, running-agent set, `hidden`, `nudged`, `pendingGoal`, the "person closed it"
memory) is acceptable; that was true of 1.1 too.

## Code layout (builder's call)

Stays plain JavaScript (`.mjs`), as 1.1 is; no TypeScript conversion. A `Client` module is any module file,
`.mjs` included, written with element calls (`surface.elements.Text({...})`) instead of JSX.

| File | What |
|---|---|
| `hooks/register.mjs` | Hooks only: state, tool, commands, settings resolution, auto-open. Drawing moves out. |
| `hooks/draw.mjs` | `drawBand`, `drawPane`, the rows; terminal and Desktop branches |
| `hooks/route.mjs` | Pure: `routeCells(tasks, width)` → `{ cells, dense }`; `miniRoute(g, maxTasks)` |
| `hooks/svg.mjs` | Pure: the Desktop route SVG source from the cells, palette and level |
| `hooks/pulse.mjs` | The terminal `Client`: `spin` (spinner or node pulse) and `sweep` (finish) |
| `hooks/pane.mjs` | Pure: when the pane opens and closes by itself (`createAutoPane`). The test engine cannot raise a `ui.close` with an origin, so the person/plugin/unload rules are tested here |
| `hooks/palette.mjs` | Palettes and helpers copied from Agent-Pulse, the role map, `resolveLook(options, configRows)` |
| `hooks/plan.mjs`, `fmt.mjs`, `privacy.mjs` | Unchanged (a helper may be added to `fmt.mjs` for durations) |

Module state that a drawing reads can stay in module variables as in 1.1 (the plan reloads from its file).

## Left alone on purpose

- **The tool contract.** `TOOL_SPEC`, `instruction()`, `standing()`, `nudge()`, `strictDeny()`: not touched, so
  Claude plans exactly as in 1.1 (2.1.0 only took the option's name out of `strictDeny()`'s words).
- **The data file** (`~/.claude/mods-data/waypoints/<session>.json`): same fields; other chats running 1.1 still
  read and draw.
- **The footer** (`SessionMode`): still `◎ plan 44% · ~2m`. It is a plain label; no colour to add. On the terminal it is
  appended to `modes`. Desktop does not draw the labels in `modes` (seen 2026-10-18, with a plan running and its band
  up: the footer held only `Auto`, Arsenal and the model), only a tree, so from 2.0.3 the label there is a `Text` in a
  `Box` around `await next(e)`, as Arsenal's launcher and ctx's footer do. The band draws the plan on Desktop, so the
  tree shows only while `bandUp()` is false (`/waypoints hide`, or a goal that ended long ago). A hook cannot see the
  engine's own collapse of the band (ctrl+x ctrl+a), so that case stays unlabelled. Seen live on Desktop (2026-10-18, 2.0.3): with a plan and with a `/goal`, `/waypoints hide` puts the label in the footer and `show` takes it out.
- **Privacy.** Every new string that shows a title, a note, a `by` name or a check reason goes through `mask(...)`,
  including the SVG's `alt`.
- **Band order.** Still `[mine, below]`, and `props.hasSurvey` still returns `below` untouched.
- **The goal-check reading** (`lastGoalStatus`, `onCheck`) and the `/goal` flow.

## Tests

Keep the existing 12. Add, with `claude plugin test waypoints`:

- **route:** leg lengths follow S/M/L; minimum 2 cells, then 1; dense mode past the width; running node at the
  start of its leg; out-of-order done; dropped/replaced left out; last node `◎`.
- **palette / follow:** `follow` with an `agent-pulse.palette` row → that palette; with no row → `ember`; an
  explicit value wins; same for animation.
- **band rows:** header right side with and without ETA; now row with `by` and with nothing running (last done);
  next row; notable row priority; `+k` when the plan grew; rows give way under a small `maxRows`; finished →
  route for 8 s then the single summary row; `hasSurvey` still returns `below`.
- **auto-open:** the first `plan` opens the pane without `focus`; a second `plan` or `add` does not; `pane: off`
  never opens; a person's close (`origin.kind: 'person'`) stops it for that goal, a new goal opens again; an
  `unload` close does not count.
- **masking:** with Recording Mode on, titles in the now/next rows, the pane trail and the SVG `alt` are masked.

Each negative test sits beside a positive one. Things the 1.1 session tripped on in the test kit:

- The test's `on(...)` hooks stand for the engine, and a noun call needs one: `session.start`, `session.id`,
  `session.cwd`, `fs.exists/write/list`, `tool.register`, `command.register`, `ui.log`, `ui.toast` (and now
  `ui.open`, `ui.close`, `ui.panes`, `config.list`). Answers to a noun call are `{ value: ... }`.
- `$.prompt.compose(...)` needs the whole input (`model`, `promptModel`, `surfaces`, `tools`, `outputStyle`,
  `traits`). With less, the engine skips the hook, and a "returns nothing" test then passes for the wrong reason.
- `claude plugin test` runs `*.test.ts` against the real engine; a `.test.ts` importing a `.mjs` file needs
  `// @ts-ignore` for the missing types.
- Mods do not hot-reload from the installed copy. Expect two copies registering the same tool and `/waypoints`
  if the installed one is on while loading with `--plugin-dir`; disable it first.

## Checking it live

Load with `claude --plugin-dir E:\github\claude-mods\waypoints` with the installed copy disabled. The person
looks; the builder lists what to look at:

1. Terminal ≥ 144 columns: ask for a 6-task plan. The pane opens on the right **without** taking the cursor; the
   band shows header, route, now, next; the running node pulses; the band height stays steady between tasks.
2. Terminal ~100 columns: the pane does not appear; `g` opens it.
3. Close the pane with Esc mid-plan: it stays closed for that plan; a new plan opens it again.
4. `/config` → Waypoints → Pane `off`: a new plan opens nothing.
5. With Agent-Pulse installed: change its palette in `/config`; Waypoints recolours (within 15 s at worst).
   Set Waypoints' own palette explicitly; it stops following. Disable Agent-Pulse: `follow` falls back to `ember`.
6. Animation `off` / `subtle` / `full`: nothing moves / pulse only / pulse + breathing + finish sweep.
7. Finish a plan: sweep (full), 8 s, then the single summary row; the auto-opened pane closes `linger` after the finish (1 minute by default; 30 seconds in 2.3.1, 3 minutes before).
8. Desktop app: the SVG route, its pulse, no restart of the animation every 15 s, the finish sweep once.
9. Recording Mode on: titles masked everywhere, the SVG `alt` included.
10. A plan of 20+ tasks in an 80-column window: dense route, no wrap.

## Shipping

On a branch `waypoints-2.0`: this DESIGN.md as the first commit, then the code. Version **2.0.0** in
`plugin.json` (a new look and new settings) **(builder's call)**. Update `waypoints/README.md` (settings, the new
look), the marketplace entry, the root `README.md` and `SETUP.md` in the same change. Pull request, as for 1.1.
Run `claude plugin validate waypoints`, `claude plugin validate .` and `claude plugin test waypoints` before the PR.

## What a smaller model can build without more questions

All of it, in this order: `palette.mjs` + tests → `route.mjs` + tests → `draw.mjs` terminal band → pane →
auto-open + settings → `pulse.mjs` → `svg.mjs` (Desktop) → docs. The two facts to confirm live rather than assume
are marked above: the `agent-pulse.<field>` row key and `config.set` reaching Waypoints for another plugin's
change. If either fails, fall back as described and note it in the PR.

## 2.2.0: parked tasks, plan revisions, the finish flag

The case: a 7-task plan, 6 done, the last one ("propose the PR") waiting on another team with no
ETA. The bar sat at `6 of 7` under `⏸ paused, waiting on you` for days, and the person was not the one being waited
on. Three changes, all chosen by the person; the details below marked **(builder's call)** were not asked.

### `park`: a task only an outside party can move

- **The action.** `park` with `id`/`ids` and a **required** `note` naming the blocker (`waiting on the other team`).
  Without a note it fails like any other bad call. The task's status becomes `parked`.
- **Counting.** A parked task leaves the header's total, as a dropped one does: `progress()` counts `live()` tasks
  that are not parked. `live()` keeps it, so it is still drawn. The header adds `· 1 parked`:
  `6 of 6 · 100% · 1 parked`, never `7 of 7`.
- **Finishing.** No new code path: the turn that ends with every counted task done finishes the plan green through
  `finishGoal('tasks')`, as today. The collapsed summary row keeps it: `6 tasks · done in 41m · 1 parked: waiting
  on the other team` (with two or more, `2 parked`, no note). A plan whose tasks are *all* parked does not finish.
- **Un-parking (builder's call).** `start`, `done` and `drop` work on a parked task as on any other; `start` clears
  the note.
- **External only.** `park` always means someone outside this session has the ball. Waiting on the person stays
  an open task, and `⏸ paused, waiting on you` is then true.
- **Drawing.** Route: a parked task's leg stays dashed (even on a finished route) with `⏸` in its middle cell; the
  node at its end is `○` while running, `●` once finished. Dense mode draws `⏸`. Pane: node `⏸`, tail
  `parked: <note>`. Notable row, after `paused, waiting on you`: `⏸ parked: <note>` (`+n` when more). Parked
  cells take the `pending` colour, not `attention`: nothing needs the person **(builder's call)**. Desktop SVG: two
  short bars on the dashed leg. The `alt` adds `, n parked`.
- **Not carried over.** A parked task lives in this chat's plan only; the handoff carries it to a later session.

### Plan revisions: when a step turns out differently

Re-planning already works (`plan` again replaces the pending tasks; `add`, `drop`), but nothing asked Claude to
look at the later steps, and nothing recorded why the route changed.

- **The rule** (tool description, `instruction()`, `standing()`): when a task turns out differently than the plan
  assumed, check the tasks still to do and fix them with `plan`, `add` or `drop`, with a `note` saying what changed.
- **The record.** `plan` (once a plan exists) and `add` take an optional `note`. With one, the goal gains
  `revisions: [{ at, after, note }]`, `after` being the id of the last task finished (0 if none), and the new tasks
  carry `rev: true`.
- **Shown in the pane:** the stats line adds `revised after #3` (the latest); a done task's own note shows dim
  under its row; a pending `rev` task's tail says `revised`; the last three revisions are listed under the trail as
  `revised after #3: <note>`. The band does not change: the route already shows the new shape.

### Never end a turn with an unexplained open task

The mod draws `paused, waiting on you`; Claude never sees it. So the rule goes into the words Claude reads
(`instruction()`, `standing()`), not into a hook: before ending a turn with a task still open, finish it, `park`
it when it waits on someone outside the session, or, when unsure what it takes, ask the person with concrete
options and a recommendation. No reminder hook: the person chose the rule alone.

### The finish flag

The destination was `◎`, one circle among `●`, `◉` and `○`. It is now a flag: `⚐` while the plan runs (in the
`done` colour once the last task is done, else `pending`), `⚑` in `sparkle` when the plan finishes (it replaces
`✦` there). The pane's last task uses the same flag (`⚑` when done). `⚐`/`⚑` (U+2690/2691) are one-cell text
symbols, not emoji, so the route's fit is unchanged. Desktop SVG: a pole and a pennant, outline while pending,
filled at the end; the three finish stars still twinkle. The header's `◎ Plan:` mark and the footer's `◎` stay:
they are the mod's mark, not the destination.

### The running task twinkles

Asked for during the build: the running task is a `✦` that twinkles, on the route and now in the pane too
(2.0's pane drew a still `◉`). The node `Client` (`pulse.mjs`) cycles the `active` shimmer and dips to a hollow `✧`
one frame in eight (≈1 s at 120 ms); at `full` it also flares `✷` once a cycle (it no longer breathes `◉ → ◎`). It
never goes blank, so the route keeps its shape. The pane's running row takes the same `Client`
(`pane-node-<id>`) on the terminal; at `off`, on Desktop and wherever there is no `Client` it is a still `✦`.
Desktop's route draws the node as a four-point star in its glow, with a CSS twinkle (`.run`) at `subtle` and above.
The now row keeps its braille spinner (the person's call): the star says *where* the task is, the spinner that
something is happening. Its still form at `off` and on Desktop is `✦` too.

### The tool contract changes

Unlike 2.0, this release changes what Claude reads: the `park` action, `note` on `plan`/`add`/`park`, and the two
rules. The data file gains `parked`, `rev` and `revisions`; a chat on 2.1 reading a 2.2 file counts a parked task
as pending, which is harmless. Version **2.2.0**.

**Seen live** (Windows Terminal, 2026-10-23, 2.2.0 installed from the release): a 5-task demo plan. The running `✦`
twinkled in the band and the pane, the spinner stayed in the now row, and `⚐` became `⚑` at the finish. A revision
after #3 showed in the pane's stats, under the task and in the list. The parked last task read
`4 of 4 · 100% · 1 parked` with `⏸ parked: <blocker>` and no "waiting on you", and the summary row kept it. With a
last step Claude was unsure of, it asked with options and a recommendation instead of stopping at "paused".

## 2.3.0: waiting on background work, not on you

**The problem.** The host ends the main turn right after it launches background work (a subagent, a shell run
with `run_in_background`, a monitor), so the band drew `⏸ paused, waiting on you` while nothing waited on the
person. `isPaused()` only asks whether the turn ended mid-plan, never who the session is waiting for.

**Seen live** (Windows Terminal, 2026-10-26, 2.2.1): a background haiku agent that slept 90 s, and a background
`sleep 90` in Bash. Both turns ended with the plan open, `lastTurnEnd` was set about 30 s in, and the band drew
the ⏸ row until the work ended. The finished command then started a new turn by itself, with no input from the
person. (On Claude Desktop the band is not drawn at all between turns, so this could not be seen there.)

**The signal.** The classic `Stop` hook's input carries `background_tasks`, the engine's own answer to "is the
session done or paused for background work": one entry per task in flight, with `type` (`shell`, `subagent`,
`monitor`, `workflow`), `status`, `description` and, for a shell, `command`. A headless `claude -p` probe with a
`Stop` hook that dumped its input showed a running shell as `{"type":"shell","status":"running","description":
"Sleep 40 seconds in background","command":"sleep 40"}` and a running agent as `{"type":"subagent","status":
"running","description":"Run sleep 40 and reply ok"}`; the `Stop` of the turn the finished task woke carried `[]`.
So the list is replaced at every turn end, and there is nothing to track by hand.

**What it draws.** `register.mjs` keeps the names from the last `Stop` (`description`, else `command`, else
`type`, clipped to 32) and clears them at `turn.start`. In the notable row, a pause with something waiting draws
the dim `◆ waiting on <name>` (one task) or `◆ waiting on n background tasks`, not in the attention colour,
because nothing needs the person. With nothing waiting, the text is unchanged. The name goes through the privacy
mask, because a command line can hold what Recording Mode hides. `Stop` and the end of the turn can arrive in
either order, so `Stop` asks for a redraw itself.

**Tried and dropped.** A set of running agents kept from `agent.spawn` and `turn.complete`, reconciled with
`$.agent.list()` as Agent-Pulse does. It covered agents only, it was lost when the mod reloaded, and it needed a
backstop for an agent that dies without a `turn.complete`. `Stop` covers shells and monitors as well, from one
source.

**Known gaps.**
- The list is a snapshot from the turn's end. A task killed by hand from `/tasks` ends no turn, so the row stays
  until the next one. A finished task does not have this problem: it wakes the session.
- `session_crons` (`/loop`, `ScheduleWakeup`) sit next to `background_tasks` in the same input and would make a
  fair "waiting on a scheduled wake-up" row. Not done.
- A question that Claude asks the person with `AskUserQuestion` keeps the turn open, so the band looks busy
  there. Not a pause, and not changed.

**Seen live** (Windows Terminal, 2026-10-26, 2.3.0; [TEST-RUN-2.3.0.md](./test-runs/TEST-RUN-2.3.0.md)): the
interactive `Stop` carries the same `background_tasks` as the headless probe, and the row follows it. A background
`sleep 60` drew a dim `◆ waiting on Sleep 60 probe`, an agent drew `◆ waiting on Read hooks`, an agent and a shell
together drew `◆ waiting on 2 background tasks`, and with nothing running the bright `⏸ paused, waiting on you`
stayed. The row belongs to a plan that is still running: a finished plan shows the done band and no waiting row.
One miss, in a session with two tasks running at once, is not explained (the row may have been trimmed for
height); it did not come back in fresh sessions.

Version **2.3.0**; tests in `draw.test.ts` (the row) and `surface.test.ts` (`Stop` through the engine).

## 2.3.1: a finished plan leaves after 30 seconds, and really leaves

**The ask.** The band stayed 3 minutes after a plan finished, and the footer label `◎ plan done ✓` did not go
at all until something else redrew. `RECENT_MS` is now 30 seconds.

**The bug.** The 15 s tick moved `now` first and then asked `isRecent(G)` whether to redraw. On the tick that
crosses `RECENT_MS` the answer is already no, so the one redraw that drops the band and the label was skipped,
and an idle session has no other trigger. The pane did close, because `maybeAutoClose` runs after `now` moves.
Now the tick asks before it moves `now` (`wasUp`), and `finishGoal` and `stopGoal` call `expireAfter`, a
`$.clock.after(RECENT_MS + 200)` that refreshes `now`, closes an auto-opened pane and redraws, so the band does
not wait for the next tick. `finishGoal` already did the same for the 8 s collapse.

Test: `surface.test.ts`, "a finished plan is still on screen just before 30 s and gone just after, with no
other redraw", mounts the band and the footer and checks both at 25 s and 35 s.

**Seen live** (Windows Terminal, 2026-10-26, 2.3.1; [TEST-RUN-2.3.1.md](./test-runs/TEST-RUN-2.3.1.md)): a
finished plan and a stopped plan (`/waypoints clear`) each lost the summary row and the footer label together at
about 30 s, with no keypress. So `$.clock.after` fires in the real engine and `ui.render` does redraw the footer
at idle. The pane that Waypoints opened by itself closed at about 30 s, and with the band hidden mid-plan
(`/waypoints hide`) only the footer label showed and it went at about 30 s. A *new* plan after `hide` shows band,
footer and pane again, because `startGoal` and `serveTool` set `hidden = false`; that is wanted, not a bug. Not
run live: a pane the person opened staying open (unit test only).

Version **2.3.1**; tests in `surface.test.ts` (band and footer at 25 s and 35 s) and `auto.test.ts` (the pane).

## 2.4.0: how long a finished plan stays is a setting

**The ask.** 30 seconds was too short for everyone, so `RECENT_MS` follows a new `linger` setting (`/config` →
Waypoints → Finished plan stays), default **1 minute** (the person's call).

**How.** The setting is a string with a fixed list of options, like the others, so there is nothing to parse or
validate. `register(on, options)` looks the string up in `LINGER` (label to milliseconds) and sets `RECENT_MS`,
now a `let`. A value the table does not list falls back to the default. Nothing else changed: `isRecent`,
`expireAfter` and the tick's `wasUp` check (2.3.1) already read `RECENT_MS`, and a `/config` change reloads the
module, so the new value applies from the next finish with no listener of its own. `FULL_MS`, the 8 s the *full* band
stays, is not part of it.

Version **2.4.0**; tests in `surface.test.ts` (default at 55 s and 65 s, `30 seconds`, `10 minutes`, an unlisted value)
and `auto.test.ts` (the pane at the default).

## 2.4.1: this chat's finished goal leaves the pane after an hour

**The bug.** The pane lists other chats' goals for an hour (`OTHERS_MS`), applied in `loadOthers` and refreshed by the
15 s tick while the pane is open. This chat's own goal, the top section, had no cutoff: `isRecent` ages the band, the
footer label and an auto-opened pane, but `drawPane` drew `G` whatever its age, so a goal finished long ago stayed
until `/waypoints clear` or a new goal. Seen when a second chat started a goal and the first chat's pane still showed its old one.

**How.** `drawPane` treats `v.g` as no goal when it is not running, has an `endedAt`, and ended more than `OTHERS_MS`
ago, so the pane reads "No goal in this chat." The data file is untouched (`restore()` and `prune` keep their own rules). A
running goal never ages out. No new timer: the 15 s tick already redraws an open pane, so the goal goes within 15 s of the hour.

Version **2.4.1**; test in `draw.test.ts` (59 and 61 minutes, met and stopped, a running goal at 5 hours).

## 2.4.2: the pane's hint row fits on one row

The pane's second-to-last row (auto's state, the commands, where the look is set) was 91 characters and wrapped onto a second row in
the pane. It is now 53 (`auto: on · /waypoints hide|show|clear · look: /config`): the `(stop the goal)` gloss,
`& pane` and `→ Waypoints` went (`/config` opens the settings list; the person finds Waypoints in it), and `clear` joined the other commands (the README says what each does). The `Text` also takes `wrap: 'truncate-end'`, so a
pane narrower than the row cuts it instead of wrapping. The pane's width floor is 50, so only a pane under 53 columns cuts the row,
and 57 with `/waypoints-mod` as the name.

Version **2.4.2**; test in `draw.test.ts` (the row's text, its wrap, and at most 60 characters).

## 2.5.0: managed mode, for a plan whose guard skips the mod's hooks

**The problem.** On Team and Enterprise plans `cc-plugin-sec-default@builtin` is seated outermost (the `prepend`
tier) and continues past the whole user tier (`next.to`) on `classic.*`, `prompt.compose` and `session.append`'s
attachment rows (claude-code#102351, hellosverre/claude-skins#94). Waypoints hooks all three, so each never ran there,
and the engine posts `<mod>: its <event> hook was skipped. "cc-plugin-sec-default" runs first and sent the event on
past it.` once per session for each. The standing line, the goal check's verdict and the waiting row were all silently gone.

**Why a /config row.** The obvious fix, not registering those hooks where they cannot run, cannot be decided where it
has to be: `register(on, options)` gets no `$`, so it can read no store, file or setting, and a `Registration` has
only `.catch`, so a hook cannot be taken back later. The one thing `register` reads is `options`. So the decision
is a `userConfig` row, `managed` (`auto`, `on`, `off`), which the mod may set itself with
`$.config.set({ key: 'waypoints.managed', value: 'on' })`. That writes the row to settings (`pluginConfigs`), so it
holds across sessions and restarts, and the change reloads the module, so `register` runs again in managed mode in
the same session.

**Spotting the guard (`auto`).** `judge()` watches one main turn at a time (`seen`), from its `turn.start` to its
`turn.complete`. The `prompt.compose` and `classic.Stop` hooks each mark it. A turn that ended with an answer, not
interrupted, with neither mark is the guard. Both have to be missing: the engine says `prompt.compose` "fires when it
renders a system prompt", not that it does so every turn, while `Stop` fires at the end of every answered turn. `Stop`
can come after `turn.complete`, so the judgement waits 5 s, or until the next main `turn.start` if that comes first.
A turn not seen from its start (the module reloaded mid-turn) is never judged, nor a subagent's. One switch per load
(`switched`); a refused `config.set` gives one toast asking the person to set the row.

**Managed mode (`on`).** `register` leaves out `prompt.compose`, `classic.Stop` and `session.append`:
- *The standing line* goes as `prompt.submit` context beside the first prompt the person types in the session (not
  a slash command, not an `isMeta` delivery, not under `-p`, not with `/waypoints auto off`). `prompt.submit` is not
  held, and Waypoints already hooks it. Unlike a system-prompt section, compaction can drop it; `session.compact` is
  held too, so the mod cannot re-add it. A module reload (a `/config` change) sends it once more.
- *The goal check's verdict.* With no row to wake on, the main `turn.complete` of a running `/goal` calls
  `onCheck($, null, now, LATE_WAITS)`: the same log-tail read, retried at 1.5, 4, 10, 20 and 40 s while the check
  runs. A `null` message also treats the goal's own sentinel record as "not there yet" rather than the end. The
  read runs beside the hook, which does not wait on a process.
- *The waiting row* has no other source: `background_tasks` is on the classic `Stop` input alone. It does not show.
  The log's path stays the one `session.start` works out.

`off` registers everything and never judges. Nothing is keyed on the guard's name, so a renamed or second guard
that does the same is caught the same way. The mod cannot see the guard leave: in managed mode the hooks that would
show it are not there. The README says to set the row back to `auto`.

Version **2.5.0**; tests in `managed.test.ts` (the switch and its toast, the next turn judging first, Stop late, a
compose seen, aborted/failed/unseen and subagent turns, a refused switch, `off`, no section under `on`, the first-prompt
ask and its exclusions, a met verdict at turn end, a verdict found on a later try past the sentinel, an older check's verdict).

## 2.5.1: the first-prompt ask reaches an SDK host that draws

**The problem.** Managed mode sent the standing ask on `prompt.submit` only when `session.start`'s `isInteractive` was
true. The engine defines that as "true under the REPL, false for a `-p` run or the SDK", and the Claude desktop app
starts Claude Code through the Agent SDK (`--input-format stream-json --output-format stream-json`), so on Enterprise
Desktop it was always false and Claude never saw the ask. A fresh session asked to quote the line found nothing, and
planned with its own `TodoWrite`/`TaskCreate`, which the desktop app labels "Plan from before your last message" (its task
card reads only those built-in tools, never an MCP tool).

**The fix.** The gate is "someone watches the bar": `interactive`, or `$.session.surfaces()` is not empty. It is read at
`prompt.submit`, not `session.start`, because an SDK host's surface attaches after the session starts (`surface` is null
in `session.start` there). A `-p` run draws nowhere, so it is still left out, with a `ui.log` line saying why.

**What is deliberately not changed.** Only managed mode reads it. The system-prompt hook still skips the `print` trait
(`-p` and the SDK alike), because no report shows the desktop app on a plan without the guard missing the ask, and a
terminal is `isInteractive: true` in both. The standing line's wording is also unchanged: the cause was that it never
arrived, not that Claude ignored it.

**Not observed.** That the desktop app reports `isInteractive: false` and a non-empty `surfaces()` is read from the
engine's types and the app's spawn flags, not seen in a running session. If the next Enterprise Desktop session still
gets no ask, the `ui.log` line (`claude --debug`) names which side was empty.

Version **2.5.1**; tests in `managed.test.ts` (an SDK host that draws is asked once; one that draws nowhere is not).

## 2.5.2: the system-prompt ask reaches an SDK host that draws

**The problem.** 2.5.1 widened only the managed-mode gate. Where no guard skips the hooks, the standing ask is a section
added by `prompt.compose`, and that hook left the section out for the `print` trait. The engine defines `print` as "a
session with no terminal behind it (`-p`, the SDK)", and the Claude desktop app is an SDK host, so on a plan without the
guard the desktop app was never asked either: a multi-step prompt there ran one step at a time with no plan.
2.5.1 had left this alone because nothing reported it; a test on the desktop app of a personal plan did.

**The fix.** The same test as 2.5.1's, read from the input: `print` leaves the section out only when `e.surfaces` is
empty (`PromptComposeInput.surfaces`: "where the session draws at this render; empty where nothing draws"). `bare` and
`teammate` still leave it out whatever draws. When it is left out for `print`, a `ui.log` line says so (`claude --debug`).

**Not observed.** That the desktop app's compose input carries a non-empty `surfaces` is read from the engine's types,
not seen. A terminal has no `print` trait and is unchanged.

Version **2.5.2**; test in `flow.test.ts` (a print session that draws is asked, one that draws nowhere is not, a teammate
on a surface still is not).

## 2.6.0: Herdr status, a paused plan reported as needing the person

**The problem.** Herdr (a desktop app that hosts terminals) learns an agent's status only from the program's own
OSC 7501 reports, and is told not to guess it from the screen. Claude Code reports `working`, `blocked` (a permission
prompt, a question), `done` and `idle`, from its own state alone: a turn that ends with a plan task still open is `done`,
and `idle` once the person looks, while the band says `⏸ paused, waiting on you`. Seen live on Claude Code 2.1.318: a
session that planned two tasks and finished one read `done` in Herdr with the band paused; an `AskUserQuestion` read
`blocked` within 2 s. No mod call sets the program status (`$.ui.status` is a line under the prompt, `$.ui.notify` a
terminal notification Herdr does not document reading).

**Options weighed.** A Herdr mod reading a label Waypoints sets (`hc label`) works, but fixes only the panels that mod
draws (not the tab and space dots, not the sound) and puts half the change in another repository. A reminder at the end of
the turn so Claude asks with `AskUserQuestion` reverses 2.2.0's "no reminder hook" and puts a dialog over the band. The
person wanted Waypoints alone to do it, opt in.

**The fix.** With `herdr: on`, when a main turn ends on a paused plan that waits on the person (`shouldMark`: an open,
unparked task; not stopped with Esc; nothing in the Stop hook's `background_tasks`), Waypoints writes one report of its
own: `ESC ] 7501 ; state=blocked:app=claude-code:kind=question:msg=<base64> BEL`, the fields Claude Code's own encoder
writes. Claude's next report (the person types, work resumes) replaces it, so nothing clears it; a plan still paused after
that turn is marked again.

The report must reach the console Claude draws in. A child of the Bash tool has a console of its own (its process list
did not hold Claude's pid), and text it writes there goes nowhere; a `$.process.run` child was only seen to work end to
end through the attach below, not measured on its own. So a PowerShell child calls `FreeConsole`, then
`AttachConsole` on the terminal's foreground pid (from `hc get`), and writes the report to `CONOUT$`; a marker written
that way showed on the terminal's screen. Windows PowerShell 5 (.NET Framework) refuses to open a device such as `CONOUT$`
as a `FileStream`, so both shells open it with `CreateFileW` and `WriteFile`.

**Every assumption is checked**, in three places:
- `hostBlocker` at session start: Windows; a terminal session (`isInteractive` and `surface === 'terminal'`; the desktop
  app is an SDK host, neither); a Herdr terminal (`HC_TERMINAL_ID` set). These only log: the setting is one for the machine,
  shared with sessions it cannot apply to.
- The probe at session start, beside `session.start` rather than in it: `powershell.exe`, else `pwsh.exe`, must answer in
  `FullLanguage` mode (`Add-Type` is refused in ConstrainedLanguage) and find `hc`. A Herdr terminal that fails it gets one
  toast naming why.
- The mark script, when it runs: not a sub-agent (a terminal with a `parent` is driven by `hc send`, which refuses a
  `blocked` terminal without `--force`); Claude reports there (`status.app === 'claude-code'`); the terminal's program
  (its root or foreground pid) is one of the script's own ancestors, walked through `Win32_Process.ParentProcessId`
  (`HC_TERMINAL_ID` is inherited: an editor started from a Herdr terminal carries it into its own terminals, and a
  session there would otherwise mark the Herdr one; seen: a mark run from outside Claude's tree says
  `skip not-this-terminal` on both shells); the report has settled
  (the same status record three reads running, a second apart: Claude sends the turn's `msg` a few seconds after `done`,
  with the same `status_ms`, and that report would replace one written earlier); and it is still `done` or `idle`.
  The hook waits `MARK_DELAY_MS` (3 s) first, since `classic.Stop` can land after `turn.complete`, and any later turn
  cancels the mark (`markSeq`).

**Safe with any task text.** The script travels as one argv element with no double quote in it, and the message goes in
as char codes (`[string]::new([char[]](…))`), so no text of the plan is parsed as code. The script sets
`[Console]::OutputEncoding` to UTF-8 first: Windows PowerShell 5 decodes a native program's output in the console's code
page, and on a machine whose code page is not UTF-8 `ConvertFrom-Json` failed on `hc get` once the status message held
`·` or `—` (seen), which Waypoints' own message does, so every re-mark would have failed.

**Seen live** (Windows 11, Claude Code 2.1.318, herdr-core in Herdr): from bash, both shells marked a paused session
`blocked` with a message of quotes, `$`, a backtick and accented text intact; the mark held for 2 minutes with the plan
open and cleared to `working` on a reply. Through the branch's own hook (`--plugin-dir`, `herdr: on`): the probe logged
`Herdr status on (powershell.exe, PowerShell 5)`; the turn read `done` at 14 s, its `msg` at 16 s, `blocked` with
`Waypoints: waiting on you · next beta` at 21 s; a reply turned it `working`, then `done`, then `blocked` again 6 s later.

**Limits.**
- Windows only. macOS and Linux would write the report to the tty of Claude's process, untested here.
- Managed mode has no Stop, so no `background_tasks`: a paused plan with work still running is marked too early there.
- It relies on Claude Code reporting only when its own state changes. A build that repeats `done` would replace the mark,
  and Herdr would show `done` again, as before.
- It reports as `app=claude-code` and `kind=question` with no dialog open: `hc send` then needs `--force`, and Herdr plays
  its "needs you" sound after its "done" one.

**2.2.0 still holds**: Claude is never reminded or asked anything; only Herdr is told.

Version **2.6.0**; tests in `herdr.test.ts` (the gates, the probe, the message, the script's quoting, and through the
hooks: off by default, both shells, no shell, a locked-down one, outside Herdr, macOS, the desktop app, background work,
a new turn first, a finished plan, Esc).
