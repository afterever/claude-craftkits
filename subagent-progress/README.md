# subagent-progress

A Claude Code mod: a progress bar above the prompt and a live panel of subagents, each drawn as a crab whose costume follows the model and effort it runs on. Forked from johnnyvizz's [savvy-progress](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress) 1.2.0 (MIT, see [LICENSE](./LICENSE)) and renamed from `savvy-progress` in 2.0.0, since it shows any subagent work, with or without the savvy-flow skill.

- **Progress bar**: the flow's title, phase, finished agents out of started, and a button with the crew size that opens the panel (`a` presses it while the band holds the focus). It appears when a subagent of any type starts, or when something reports progress. When the work ends it turns into a green **Done** row that stays until you dismiss it with ✕.
- **Agents panel** (`/subagent-progress` toggles it): running, finished and planned subagents with model, effort, task progress, context, estimated cost and time. It opens by itself whenever a new batch of subagent work starts. **Collapse** shrinks it to one line per agent.
- **Costumes**: working crabs walk, and each costume animates its own prop. On the desktop the crabs are SVG and `prefers-reduced-motion` stops them. In the terminal each card has a small half-block crab beside it (6×2 cells) in the same costumes and colors, and the `animation` setting controls its motion (see [Terminal look](#terminal-look)).

## Costumes

The costume follows what the agent runs on, so every subagent gets one without any special agent definitions:

| Costume | Who | Its prop |
| --- | --- | --- |
| astronaut | Fable at any effort; Opus at `high`, `xhigh` or `max` | floats in a glass dome; the antenna and the star blink |
| detective | Opus at `medium` or `low` | the magnifier sweeps and glints |
| engineer | Sonnet at `high`, `xhigh` or `max` | the wrench turns a bolt |
| chef | Sonnet at `medium` or `low` | tosses the omelette |
| racer | Haiku | runs at double pace; the checkered flag flutters |
| pirate | the `Explore` agent, whatever it runs on | the cutlass fences |
| plain crab | any other model | walks |

- The rule reads the model and effort the run reports (`turn.step`), so a `general-purpose` agent switched to Haiku turns into a racer. An effort not known yet (before the run's first request) or a numeric budget counts as below `high`.
- Model names match by family, so aliases (`sonnet`), full ids and a `[1m]` suffix all work.
- A `savvy-*` agent from upstream's savvy-flow follows the same rule from its model and effort. Only while its model is unknown does it fall back to its tier (`savvy-fable` Fable/high, `savvy-heavy` Opus/xhigh, `savvy-careful` Opus/high, `savvy-medium` Opus/medium, `savvy-light` Opus/low).
- The colors are the old tier colors: purple, orange, amber, blue and green for astronaut, detective, engineer, chef and racer.
- The row under each agent's name shows its agent type (`general-purpose`, `savvy-careful`), then model and effort.

The mapping lives in `hooks/crew.ts`, a pure module with its own tests.

## What this fork changes

Upstream shows the bar only for `savvy-*` workers or an explicit `progress` report. Here:

- Any subagent (`Explore`, `general-purpose`, a custom one, ...) opens an **auto flow** titled "Subagents". Its counters come from spawns and completions, in `hooks/auto.ts`: every start adds to the total, every finish adds to done, and once every agent of the batch has finished the row closes. Only the batch's own agents count, so an agent left "running" by an interrupted earlier batch cannot hold it open.
- The panel auto-opens when each batch starts (and for `savvy-*` workers as before). Close it mid-batch and it stays closed until the next batch; `/subagent-progress` or the crew button reopens it any time.
- A new batch of work starts with a clean list; agents still running stay.
- An orchestrated flow (the `progress` tool, or a `savvy-*` worker) is never touched by this: its counters stay the orchestrator's. Once an explicit report arrives it takes the flow over.
- The costumes follow model and effort, not agent names (2.0.0).

## Terminal look

The desktop gets SVG crabs; the terminal draws its own:

- **A crab per agent.** In the panel's full view a 6×2-cell crab (two pixels to a cell, drawn in half blocks) stands beside each agent's name and model, wearing its costume. A running crab walks and its prop moves; finished, failed and planned crabs stand still and dim. A pane narrower than 24 columns drops the crab and keeps the plain `▣` layout. At most the 8 newest running agents animate.
- **Compact lines spin.** A running agent's `●` is a braille spinner in its costume's color; there is no crab at one row (a crab that small was unreadable).
- **The band's bar is shaded** from the palette's core color to its glow along its length, and its last filled cell pulses while agents run. When the work ends at `full`, a sparkle runs along it once, then it settles into the green Done row. A flow that was already finished when Claude Code started does not sparkle.
- **A glyph per agent** replaces the old `▣` in the band: a spinner while running, then `✓`, `✗` or a dim `○` for planned, in the agent's costume color, up to 8 and then `+n`.
- **Context heat.** For a worker that reports no steps, the context bar turns amber from 70% and red from 90%.

It needs a font with block elements and braille, as Cascadia and Nerd Fonts have. Why it is built this way, and what the spike on a live terminal showed: [DESIGN.md](./DESIGN.md).

## Changes

### 2.2.0: the command is `/subagent-progress`

Anyone who types the command needs the new name: `/agents-info` is gone. It was `savvy-progress`'s command, kept through the 2.0.0 rename; named after the plugin it says where it comes from, like the other mods' commands (`/work-report`, `/prompt-upgrade`).

- **Renamed** `/agents-info` to `/subagent-progress`. It does the same thing: it shows or hides the agents panel. The crew button and the panel's auto-open are unchanged.
- **No longer shares a name with `savvy-progress`.** The two still draw the same bar and panel, so install only one of them.

### 2.1.0: the terminal gets crabs and motion

The desktop drawings are unchanged; this release is the terminal. See [Terminal look](#terminal-look).

- **Crabs in the panel**, **spinners in compact lines**, a **shaded, pulsing band bar** with a one-time finish sparkle, a **glyph per agent** in the band in place of `▣`, and **heat** on the context bar.
- **Two settings**, `palette` and `animation`, both `follow` by default: they take `agent-pulse`'s palette and animation level (ember and subtle when it is not installed), so the mods agree. Set your own to stop following. The palette colors the band's bar, its head, the sparkle and the heat; the crabs, spinners and glyphs keep their costume colors. `animation`: `off` keeps the terminal still, `subtle` walks the crabs and pulses the bar, `full` also moves their props and plays the finish sparkle. It does not reach the desktop, which keeps its own motion and `prefers-reduced-motion`.
- 75 tests (was 46): the sprite, the palette and `follow`, the card, compact, the band's glyphs, shading and sparkle, and a check that the desktop draws no terminal-only element.

### 2.0.1: other mods' bands stay in sight

While a flow was active, the bar took the whole band above the prompt: it never drew what the plugins beneath it draw there, so another mod's box (agent-pulse, say) disappeared under it. The bar now stacks above them.

### 2.0.0: renamed to subagent-progress, costumes by model and effort

A breaking release: the plugin's name is its tool and settings namespace, so see [Moving from savvy-progress](#moving-from-savvy-progress).

- **Renamed** from `savvy-progress` to `subagent-progress`: the plugin, the folder, the tool names (`mcp__subagent-progress__progress`, `mcp__subagent-progress__step`), the state, the pane and the `pluginConfigs` key. The `/agents-info` command is unchanged.
- **Costumes by model and effort** (see [Costumes](#costumes)). In 1.x only `savvy-*` agents got a prop, and with savvy-flow not installed only the `Explore` pirate did. Now every subagent does.
- **The row names the agent type** instead of a savvy tier, in the panel and in the terminal.
- **`progress` takes a model and effort per task**: `tier` is optional now, and a planned task can say `model` (`sonnet`, `haiku`, a model id) and `effort`. Planned rows show "Sonnet · high" and wear the matching costume. A savvy `tier`, or a costume name, still works.
- **Generic tool texts**: `progress` and `step` no longer say they are for savvy-flow, and an untitled report is "Subagents".
- `hooks/crew.test.ts` (15 tests) and four costume render tests in `hooks/render.test.ts`.

### 1.4.0: terminal look

The desktop drawings are unchanged; this release is the terminal's text rendering.

- **The progress bar checks the surface before drawing SVG.** The terminal's element table answers `'Svg' in ui` too, which sent the band down its desktop path; the plugin test kit drew it as `×N ✕` alone. On the terminal it now always draws its text row: title, bar, phase, percent and crew.
- **Time and cost lead each agent's stats line**: `1:20 · ≈$0.42 · ctx 12% · 120k`, then the step count and its note. A line cut at the pane's edge loses the note, not the cost and time. The panel's totals read the same way.
- **Shorter panel**: no blank line after each agent or planned task, and no trailing `◷` on planned rows (they sit under "Planned" already).
- **Compact is one line per agent**: status, name, a small bar where the pane is 40 columns or wider, time and cost. Its **Finished** fold works as in the full view.
- **Finer bars**: one bar for the panel and the band, filled in eighths of a cell (`▏▎▍▌▋▊▉`), so a 6-cell bar moves in about 2% steps. It needs a font with block elements, as Cascadia and Nerd Fonts have.
- **Theme colours**: done and failed agents, the Done row and the `▣` use the theme keys `success`, `error` and `claude`, so they follow the theme and skin. Costume colors stay as they are.
- **Done row**: `✓` in place of `●` once the work ends.
- **Crew button hotkey**: `a`, drawn `a: ×N`.
- **Band widths are measured**: the bar gives up the cells a longer phase label needs (`Tasks 1 running`, or the Russian labels), so the row no longer wraps at 80 columns.
- `hooks/render.test.ts`: the pane and the band drawn on the terminal at several widths, and the band's SVG on desktop (12 tests).

### 1.3.0: any subagent work

The fork itself; see [What this fork changes](#what-this-fork-changes).

## Tools it adds

- `mcp__subagent-progress__progress`: an orchestrator reports the plan, phase and accepted tasks. Optional: without it the bar follows spawns and completions. Each planned task is a `title` (the Agent `description` it will be delegated with) and, optionally, `model`, `effort`, a savvy `tier`, and `after`.
- `mcp__subagent-progress__step`: a worker reports its own steps (`done`, `total`, `note`). A worker that does not report shows its context fill in grey instead. A subagent only calls it if its prompt tells it to.

Cost is a rough estimate from token counts and a built-in per-model price table (`PRICES` in `hooks/register.tsx`), not a bill.

## Settings

All three are in `/config` under this mod.

- `language`: `auto` (default), `en` or `ru`. `auto` follows Claude Code's `language` setting, then the system locale, and falls back to English.
- `palette`: `follow` (default), `ember`, `claude`, `neon` or `mono`. `follow` uses `agent-pulse`'s palette, or `ember` when it is not installed. Colors the terminal band's bar, head and sparkle and the context heat.
- `animation`: `follow` (default), `off`, `subtle` or `full`. `follow` uses `agent-pulse`'s level, or `subtle` without it. Terminal only. `off` keeps the crabs, spinners and bar still; `subtle` walks the crabs and pulses the bar; `full` also moves their props and plays the finish sparkle.

For a mod loaded by hand, set them in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "subagent-progress": { "options": { "language": "ru", "palette": "neon", "animation": "full" } } } }
```

## Install

```
/plugin install subagent-progress --marketplace afterever/claude-craftkits
```

Install instructions for the whole repository are in the [repository README](../README.md).

## Moving from savvy-progress

```
claude plugin uninstall savvy-progress@afterever-mods
claude plugin marketplace update afterever-mods
claude plugin install subagent-progress@afterever-mods
```

Then restart Claude Code.

- **Install only one of this and `savvy-progress`**: both draw a progress bar above the prompt and an agents panel, so you would get two of each. This applies to upstream's `savvy-progress@claude-kit` too. Upstream's command is still `/agents-info`; here it is `/subagent-progress` since 2.2.0.
- **A `language` setting** under `pluginConfigs.savvy-progress` has to move to `pluginConfigs.subagent-progress`.
- **Using upstream's savvy-flow?** Its skill and agents call `mcp__savvy-progress__progress` and `__step`, which no longer exist; they skip those calls silently, so the flow still runs and the bar follows the spawns. To keep its step reporting, change those two tool names in its `skills/` and `agents/` files.
