# agent-pulse: design notes

Agent Pulse is a fork of Tzafrir Rehan's [whats-agent-doing](https://github.com/tzafrir/whats-agent-doing) 0.4.3 (MIT), imported with its history. The original's job is unchanged: a box above the prompt that always says what Claude is doing right now, and behind its triangle what it has done. This fork adds color, motion and small charts on top, on the terminal and on the desktop app's Code tab. This document says why each addition is built the way it is, for whoever changes the mod next, including a future Claude session.

## Principles

- **Every effect carries meaning.** The original's border color already changed with the phase; nothing here moves or changes color just to be busy. A spinner says "working", a breathing border says "you are needed", a flash says "that call finished, and how", the timer's heat says "this step is taking long".
- **The text stays text.** The headline, the history and the agent rows are `Text` in the hook's tree on every surface: they truncate, they are read by screen readers and by the tests. Decoration sits beside them, never in place of them.
- **Motion is opt-in by degree.** `userConfig.animation` is `off`, `subtle` (the default) or `full`. Data (palette, heat, glyphs, timeline, bars) is not motion and shows at every level.
- **The data model is shared; drawing is per surface.** One set of `$.state` atoms. The `AbovePrompt` hook draws the terminal's tree or the desktop's from it, chosen by `e.surface`.

## How each surface animates

The two surfaces animate in opposite ways, and each addition is built for both.

| | Terminal | Desktop |
|---|---|---|
| Engine | A `Client` (`hooks/pulse.tsx`) and its frame clock, `surface.every`. It runs on the drawing thread; the hooks never run per frame. | An `Svg` whose `<style>` holds CSS `@keyframes`. The browser runs the loop; the mod draws again only when the state changes. |
| Where | Fixed-width regions only: the status glyph, the "Claude" word, the sparkle. A `Client` region is as wide as it draws, so a truncating label cannot live in one. | The jellyfish, the timeline strip, the duration bars. |
| Reduced motion | `animation: off` | `animation: off`, and `@media (prefers-reduced-motion: reduce)` in every SVG |

`Svg` exists only on `desktop` and `mobile`. The terminal's element table answers `'Svg' in ui` too but draws it empty (found in `subagent-progress`), so the test is `e.surface !== 'terminal'`. A `Client`'s own element table has no `Svg` on any surface (`ClientElements` is the terminal's table), which is why the desktop animates through plain SVG and not through a `Client`.

An SVG source must not change on every redraw: the 1 s ticker redraws the band, and a new source restarts its CSS animations. So no SVG carries the elapsed time or anything else that changes each second; one-shot animations (a flash, a sparkle) carry the id of their event, so they play once and then drop out.

## The additions

| # | Addition | off | subtle | full | Terminal | Desktop |
|---|---|---|---|---|---|---|
| 1 | Animated status glyph per phase | static `●` | ✓ | ✓ | `Client`: braille spinner (tool), pulsing `∴` (thinking), `✎` with flowing dots (writing) | the jellyfish acts the phase |
| 2 | ~~Shimmer on the "Claude" word~~ | | | | removed in 1.0.1 with the word itself: the headline is the step alone | |
| 3 | Breathing border while waiting on you (approval, question) | | | ✓ | the hook redraws at 8 fps during the wait only | the jellyfish's glow breathes |
| 4 | Flash when a call ends: green ✓, red ✗, yellow ⊘ | | ✓ | ✓ | border in the outcome color for 360 ms | a halo ring expands once |
| 5 | Palettes (`ember`, `claude`, `neon`, `mono`) on theme keys and hex; `ember` and `neon` give each phase two colors | ✓ | ✓ | ✓ | both | both |
| 6 | Timer heat: dim, amber after 30 s, orange after 2 min, red after 5 min | ✓ | ✓ | ✓ | `Text` color | `Text` color, tabular digits |
| 7 | A glyph per tool (◧ Read, ✎ Edit, ❯ Bash, ⌕ Grep, ⌁ Web, ◆ Agent, ⧉ MCP) | ✓ | ✓ | ✓ | both | both |
| 8 | A color per agent, tree connectors, a spinner each | colors | + spinners | + spinners | `├─ └─` | same |
| 9 | Turn timeline strip: the turn's phases as colored blocks | ✓ | ✓ | ✓ | block characters | `Svg` bar |
| 10 | Duration bars in the history | ✓ | ✓ | ✓ | `▏▎▍▌▋▊▉█` | `Svg` bars |
| 11 | Micro-meters for the reply's words and a call's size | ✓ | ✓ | ✓ | `▁▂▃▄▅▆▇█` on a log scale | same |
| 12 | Turn-end sparkle | | | ✓ | `Client`, 1.6 s | stars twinkle once |
| 13 | Hover cards with the whole label | ✓ | ✓ | ✓ | absolute `Box`, `hover: { display: 'flex' }` | same |
| 14 | A chime when Claude starts waiting on you | `userConfig.sound` | | | `$.audio.play` | same |
| 15 | The settings: `animation`, `palette`, `sound` | | | | | |

## The jellyfish

The desktop gets a mascot: a small jellyfish next to the headline that acts out the phase. Jellyfish pulse and glow, which is the mod's name. `subagent-progress` draws its subagents as crabs; with both mods installed, the crabs are the subagents and the jellyfish is Claude itself.

| Phase | The jellyfish |
|---|---|
| idle | sinks a little and dims; eyes closed |
| requesting | bobs; eyes up |
| thinking | drifts slowly; bubbles rise (full) |
| writing | trails ink dots (full) |
| composing | tentacles wiggle quickly |
| tool, agent | the bell pulses; tentacles swing |
| approval, question | the glow breathes yellow; eyes wide; a `!` or `?` above |
| compacting | squishes wide, slowly |

`off` draws it still in its pose; `subtle` keeps the bob and the pulse; `full` adds bubbles, ink, the halo and the sparkle. The terminal has no room for a character; its glyph is the jellyfish's stand-in.

## Settings

| Field | Values | Default |
|---|---|---|
| `animation` | `off`, `subtle`, `full` | `subtle` |
| `palette` | `ember`, `claude`, `neon`, `mono` | `ember` |
| `sound` | `off`, `approval` | `off` |

A change in the config menu reloads the module with the new `options`; the state atoms survive the reload.

## The question dialog (1.0.1)

The AskUserQuestion dialog takes the prompt's place and covers the band. Its own render site, `ui.render` on `AskUserQuestion`, takes a tree that holds the engine's dialog node once with nothing below it, in 12 rows on the terminal (a row per 40 columns of text) and 48 elsewhere, and no `Client`, size, place or hover. So the box draws a still copy of itself there, above the dialog: the headline and up to three agents, each cut to one row.

## Two-color palettes (1.1.0)

`claude` mostly takes the theme's own keys, so it looked like Claude Code's default colors with orange only while a tool ran. 1.0's `neon` used colors where one RGB channel is 255 and another near 0, where the old 16-color ANSI palette sits, so it read as a 16-color terminal. Its lightness also ran from 0.55 to 0.92 in OKLCH, and two pairs of phases shared a color.

In 1.1.0 a palette gives each phase a second color, `glow`, beside its `hex`. `ember` (the new default: Claude's coral, honey, rose and orchid) and `neon` (now glowing deep-sea colors: cyan, aqua and violet, with amber kept for what needs you) set it. `claude` and `mono` set it to `hex`, so they draw exactly as before and still follow the theme. The two colors drive:

| | Terminal | Desktop |
|---|---|---|
| Status glyph | the spinner's color cycles core → glow → core, 12 steps on the spinner's own clock | the jellyfish's bell sheen and tentacle tips take the glow |
| Timeline strip | a `Text` per cell, each run shading core → glow | a `linearGradient` per segment |
| Waiting border | breathes from the dimmed glow up to the core, so the hue shifts too | same |

Each phase in `ember` and `neon` has a color of its own (the tests check it), and both palettes are fixed hex: they look the same under any skin. A palette that follows the theme cannot shade, since a theme key cannot be mixed. The history's reply and compact marks take the palette's `writing` and `compacting` colors, where they used to take fixed theme keys.

## Team and Enterprise plans (1.1.1)

On these plans Claude Code seats a built-in guard, `cc-plugin-sec-default`, before every installed mod. It sends every `classic.*` event past them, and the engine posts `agent-pulse: its classic.<Event> hook was skipped` once per session for each skipped hook. 1.1.1 drops `classic.SubagentStop`: `turn.complete` with an `agentId` already ends a subagent with its outcome (`finish()` runs once per agent), and `agent.list`'s sweep catches one that ends without it. Three classic hooks remain and do nothing on these plans: `PermissionRequest` (the "Waiting for your approval" label) and `PreCompact`/`PostCompact` (the compacting phase). `session.compact` would replace the compaction pair if the guard lets mods run there, which is still to be checked on such a plan. No unskipped event says a permission prompt is up: `tool.check`'s `ask` is often settled by auto mode with no prompt shown.

## Agents the engine does not list (1.1.2)

A call that carries an `agentId` the box never saw spawn takes that agent up as a placeholder (`Agent › Getting started`, then its last call), so an agent whose spawn came before a reload still shows. The sweep let such an agent go only when `agent.list` named it with a status other than `running`; one the engine never listed had no stop to wait for, and its row and timer ran for the rest of the session. 1.1.2 lets an unlisted agent go, as interrupted, once it has made no call for a minute (`UNLISTED_AGENT_MS`). A listed agent is never let go on silence, since a running one may think a long time between calls, and an agent let go in error is taken up again by its next call.

## Alternatives turned down

- **The whole box in one `Client`.** It would animate the border without the hook redrawing, but the label could no longer truncate to the window, the tests could no longer read the box's text, and the toggle would need a round trip through `ui.message`. The border breathes by a hook redraw at 8 fps instead, and only while Claude waits on the person.
- **A shimmer on the label.** A `Client` region takes the width of what it draws, so a shimmering label could not give way in a narrow window, which the original fixed in 0.4.3. The shimmer runs over the fixed-width "Claude" word.
- **A glowing border on the desktop.** A `Box` border cannot glow, and an absolute `Svg` behind the box depends on the desktop's layout. The jellyfish's glow carries the phase color instead.

## Release check (1.1.3)

No behaviour change. 1.1.3 is a test release that went out to all three places a mod is published: the marketplace, npm as `@afterever/agent-pulse`, and GitHub Packages (the "Packages" box on the repository homepage).
