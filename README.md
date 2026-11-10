# claude-craftkits

Craft kits: a personal toolkit of [Claude Code mods](https://code.claude.com/docs), crafted for my own workflow. They are plugins of function hooks that draw panes, bands and footers inside Claude Code. This repo is also a plugin marketplace, so every computer installs the same mods the same way.

| Mod | What it does |
| --- | --- |
| [`ctx`](./ctx) | Context window details in a pane and a band above the prompt: how full, how fast it is filling, what filled it, compacting on your terms, what each of those costs, and how fast the plan's limits are being spent. How to use it, and how to get the pane on the right: [ctx/README.md](./ctx/README.md). Why each feature exists: [ctx/DESIGN.md](./ctx/DESIGN.md). |
| [`subagent-progress`](./subagent-progress) | A progress bar above the prompt and a live agents panel for any subagent work, each subagent a crab whose costume follows its model and effort, closing into a green Done row. Fork of johnnyvizz's savvy-progress (renamed in 2.0.0); what changed: [subagent-progress/README.md](./subagent-progress/README.md). |
| [`prompt-upgrade`](./prompt-upgrade) | `/prompt-upgrade` turns a rough prompt into a great one before it is sent: a pane asks up to three quick questions, rewrites the prompt and shows original and upgrade side by side, and nothing runs until you press Run. Optional automatic mode. Idea and spec from [tristenobrien.ai](https://tristenobrien.ai/); how to use it: [prompt-upgrade/README.md](./prompt-upgrade/README.md). |
| [`work-report`](./work-report) | `/work-report` shows what Claude has done for you: tasks finished, an estimate of the hours that saved you and what that time is worth, in a pane with Today, Week, Month and Year tabs. Counts only, kept in the mod's own store; no model calls. How to use it: [work-report/README.md](./work-report/README.md). |
| [`agent-pulse`](./agent-pulse) | A box above the prompt that says what Claude is doing right now, in plain English, alive with color and motion: a spinner per phase, a border that flashes when a call ends and breathes while Claude waits on you, a timeline of the turn, and a jellyfish on the desktop. Fork of Tzafrir Rehan's whats-agent-doing; what changed: [agent-pulse/README.md](./agent-pulse/README.md). Why: [agent-pulse/DESIGN.md](./agent-pulse/DESIGN.md). |
| [`arsenal`](./arsenal) | A menu for the tool mods: a `◆ Arsenal ▾` button right above the prompt box opens a menu pane, docked on the right, with a Prompt Upgrade on/off switch, a Sound notifications switch with two sounds (one when you press Enter, one when a reply is done or Claude asks you something, from sounds you drop in a folder), and one-press shortcuts to `/prompt-upgrade` and `/work-report`. USER and PROJECT sections list your own skills and commands, each of which you can turn off. A remote control for the tools, with one thing of its own, the sound notifications; it shows the model and effort but never changes them. Idea from [tristenobrien.ai](https://tristenobrien.ai/); sound notifications idea from [angomedia/claude-mods](https://github.com/angomedia/claude-mods); how to use it: [arsenal/README.md](./arsenal/README.md). Why: [arsenal/DESIGN.md](./arsenal/DESIGN.md). |
| [`waypoints`](./waypoints) | A route for `/goal` and any multi-step work, built from Claude's own task plan: the plan drawn as nodes and legs above the prompt, an ETA at the goal's own pace, a pane that opens by itself with the whole task trail, and every chat's goal in `/waypoints`. Follows Agent-Pulse's palette and animation. The mod itself asks Claude to plan, so nothing goes in the global `CLAUDE.md`. Fork of Nate Herk's goal-meter; what changed: [waypoints/README.md](./waypoints/README.md). |

## Install (each computer)

```
claude plugin marketplace add afterever/claude-craftkits
claude plugin install ctx@afterever-mods
claude plugin install subagent-progress@afterever-mods
claude plugin install prompt-upgrade@afterever-mods
claude plugin install work-report@afterever-mods
claude plugin install agent-pulse@afterever-mods
claude plugin install arsenal@afterever-mods
claude plugin install waypoints@afterever-mods
```

That installs the seven mods in this repo. The whole setup, with the third-party mods and the skins patch and skin, is in [SETUP.md](./SETUP.md).

Pick up new versions with `claude plugin marketplace update afterever-mods` and then `claude plugin update ctx@afterever-mods` (restart Claude Code to apply).

## Also on npm

Each release is published to npm as `@afterever/<mod>` (for example `@afterever/waypoints`), with provenance. The marketplace above is still how you install and update: it reads the mods straight from this repo, so npm is an extra copy, not a dependency. To use one from your own marketplace, give its entry an npm source:

```json
{ "name": "waypoints", "source": { "source": "npm", "package": "@afterever/waypoints" } }
```

The packages are built by `.github/scripts/build-npm-package.mjs` from each mod's `plugin.json` (no mod folder holds a `package.json`), and `.github/workflows/publish-npm.yml` publishes one when a `<mod>-v<version>` tag is pushed. No npm token is stored: each package lists `publish-npm.yml` as a trusted publisher on npmjs.com (user `afterever`, repository `claude-craftkits`), so npm accepts the workflow run's own GitHub identity. A new mod needs that set once on its package page, after its first publish.

## Use ctx

`/ctx` opens the pane and the 📊 button above the prompt toggles it. The commands, the keys inside the pane, and what to do when the pane sits above the prompt instead of docking on the right (it needs the fullscreen layout) are in [ctx/README.md](./ctx/README.md).

## Develop

From the root of this repo, edit a mod in place and load it from disk, which hot-reloads on save:

```
claude --plugin-dir .\ctx
```

Check a mod before committing:

```
claude plugin validate .
claude plugin test .\ctx
```

Claude Code writes `<mod>/.claude-plugin/types/` and `<mod>/tsconfig.json` each time it loads a mod. They are regenerated and git-ignored.

Bump `version` in the mod's `plugin.json` when you change it, or installed copies will not pick the change up.

## Layout

```
.claude-plugin/marketplace.json   the marketplace listing
SETUP.md                          reproduce the whole mod setup on a new computer
.github/scripts/                  check-versions.mjs (CI), build-npm-package.mjs (stages a mod for npm)
.github/workflows/                ci.yml (every pull request), publish-npm.yml (a release tag)
ctx/
  README.md                       install, the fullscreen layout, commands and keys
  DESIGN.md                       why each feature exists and how it is built
  .claude-plugin/plugin.json      name, version, state contract
  hooks/hooks.json                points at register.tsx
  hooks/register.tsx              the mod
  hooks/fmt.ts, fmt.test.ts       pure formatting helpers and their tests
  hooks/usage.ts, usage.test.ts   tool-result sizes, usage counts, the project log
  hooks/compact.ts, compact.test.ts  keep instructions and the auto-compact warning
  hooks/cost.ts, cost.test.ts     per-turn spend, learned prices, carrying and compaction costs
  hooks/render.test.ts            the pane, band and footer drawn on terminal and desktop
  hooks/version.ts                a copy of the version for the pane footer; bump it with plugin.json
  types/index.d.ts                the mod's $.state contract
subagent-progress/
  README.md                       what it does and what changed from savvy-progress
  LICENSE                         MIT, upstream's notice
  .claude-plugin/plugin.json      name, version
  hooks/hooks.json                points at register.tsx
  hooks/register.tsx              the mod: tools, panel, band, state
  hooks/auto.ts, auto.test.ts     the flow derived from spawns and completions
  hooks/crew.ts, crew.test.ts     which costume a model and effort wears
  hooks/render.test.ts            the panel and band drawn on terminal and desktop
  types/index.d.ts                the mod's state contract
prompt-upgrade/
  README.md                       commands, the four steps, automatic mode, credit
  .claude-plugin/plugin.json      name, version, state contract
  hooks/hooks.json                points at register.tsx
  hooks/register.tsx              the mod: commands, automatic mode, model calls, state
  hooks/view.tsx                  the screens
  hooks/logic.ts, logic.test.ts   what is held, reading the model's answers, the prompts
  hooks/layout.ts, layout.test.ts widths, tracker, big numbers
  hooks/svg.ts, svg.test.ts       the three numbers as one drawing on the desktop
  hooks/flow.test.ts              the whole flow, with the model stubbed
  types/index.d.ts                the mod's state contract
work-report/
  README.md                       commands, what counts as a task, the estimate, the tabs
  .claude-plugin/plugin.json      name, version, state contract
  hooks/hooks.json                points at register.tsx
  hooks/register.tsx              the mod: events, commands, the pane and the button
  hooks/view.tsx                  the pane
  hooks/kinds.ts, kinds.test.ts   sorting a task by its tools
  hooks/record.ts, record.test.ts which prompts count, claiming a turn
  hooks/dates.ts, dates.test.ts   local-noon day stepping, ranges, day of the year
  hooks/report.ts, report.test.ts totals, the estimate, the streak, chart bars
  hooks/layout.ts, layout.test.ts widths, big numerals, tiles, bars, the chart
  hooks/svg.ts, svg.test.ts       the tiles, bars and chart as drawings on the desktop
  hooks/flow.test.ts              the whole flow, with the engine's events stubbed
  types/index.d.ts                the mod's state contract
agent-pulse/
  README.md                       what it shows, what changed from whats-agent-doing, settings
  DESIGN.md                       why each addition is built the way it is
  LICENSE                         MIT, upstream's notice and ours
  .claude-plugin/plugin.json      name, version, settings, state contract
  hooks/hooks.json                points at register.tsx
  hooks/register.tsx              the mod: events, settings, timeline, flourishes, chime
  hooks/draw.tsx                  the box on the terminal and on the desktop
  hooks/pulse.tsx                 the terminal's animations (Client surface module)
  hooks/jelly.ts                  the jellyfish, strip and bars as SVG
  hooks/palette.ts, glyphs.ts     palettes, heat, agent colors; spinners, glyphs, meters
  hooks/activity-of.ts, text.ts   tool labels and text helpers (upstream's)
  tests/register.test.tsx         upstream's tests: a whole turn, history, approvals, agents
  tests/pulse.test.tsx            every animation level on terminal and desktop
  sounds/chime.wav                the opt-in approval chime
  media/                          the jellyfish and strip for the README
  types/index.d.ts                the mod's state contract
arsenal/
  README.md                       the menu, its rows, what it leaves alone
  DESIGN.md                       why it is built the way it is, and what was verified
  .claude-plugin/plugin.json      name, version, state contract
  hooks/hooks.json                points at register.tsx
  hooks/register.tsx              the mod: launcher in the footer, menu pane, /arsenal, header
  hooks/menu.ts, menu.test.ts     model and effort labels, which rows, the columns, off lists
  hooks/own.ts, own.test.ts       your own commands: frontmatter, names, the project key
  hooks/render.test.ts            the launcher and pane drawn on terminal and desktop, presses
  types/index.d.ts                the mod's state contract
waypoints/
  README.md                       the route, when Claude plans, settings, commands, what changed
  DESIGN.md                       the 2.0 spec: look, pane, auto-open, colour, tests
  LICENSE                         MIT, upstream's notice and ours
  .claude-plugin/plugin.json      name, version, the palette / animation / pane settings
  hooks/hooks.json                points at register.mjs
  hooks/register.mjs              the hooks: task tool, /waypoints, auto-open, settings, footer
  hooks/draw.mjs                  the band and the pane, terminal and Desktop branches
  hooks/route.mjs                 the route as cells (legs by size, dense mode, mini route)
  hooks/svg.mjs, pulse.mjs        the Desktop route SVG; the terminal's spinner, node pulse, finish sweep
  hooks/palette.mjs, pane.mjs     Agent-Pulse's palettes and the roles; when the pane opens and closes
  hooks/plan.mjs, plan.test.ts    the plan, the bar, the ETA, the words Claude reads
  hooks/fmt.mjs, privacy.mjs      time formatting; masking while Recording Mode is on
  hooks/*.test.ts                 flow, route, palette, draw (band, pane, SVG), surface, auto-open, pulse
  test-runs/                      TEST-RUN-<version>.md: what each release was checked on screen, and what was not
```
