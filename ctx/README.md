# ctx

Context window details for Claude Code, in a pane and a band: how full the window is, how fast it
is filling, what filled it, how to compact on your terms, and what each of those costs.

It mirrors the Desktop app's context panel, so the same information is one keypress away in the
terminal. It only observes. It never compacts, rewrites or turns anything off unless you ask.

- **The band** is one line above the prompt: a 🧠 and the word `ctx` in Claude's orange (it breathes near auto-compact), a small bar, the fill, a trend sparkline, the last
  turn's cost, the plan's pace (or an API account's session total) at the right, and a 📊 button
  that opens the pane. Each category in use gets at least one whole cell of the bar, so the split
  reads even on a nearly empty 1M window, and the free space is water (`████≈~~~~~~~~~~░`). The
  bar is 16 cells, 24 from 130 columns, 48 from 160, 64 from 200 and 96 from 240 (8 under 70), so
  the minimum cells overstate a near-empty window less; while an auto-compact warning stands it
  stays at 16 until 240 columns.
- **The pane** is the full breakdown: categories (largest first, the free space after them, the
  deferred ones last), trend, cost, MCP servers, memory files, skills,
  agents, the heaviest results and what has gone unused.
- **The Desktop app** draws the same band, and narrows it with the window the same way.

Why each feature exists and how it is built: [DESIGN.md](./DESIGN.md).

## Install

```
claude plugin marketplace add afterever/claude-craftkits
claude plugin install ctx@afterever-mods
```

Restart Claude Code afterwards: an installed plugin is not hot-reloaded. Pick up new versions with
`claude plugin marketplace update afterever-mods` and then `claude plugin update ctx@afterever-mods`.

## Get the pane on the right: use the fullscreen layout

The pane docks to the right of the transcript only in Claude Code's **fullscreen** (alternate-screen)
layout, and only from 110 columns. In the main-screen layout the engine seats it **above the
prompt**, inside the conversation. The layout belongs to Claude Code, is fixed for the session, and
a mod cannot change where a pane is seated.

Turn fullscreen on with either of these:

- Run `/tui fullscreen`. It saves the setting and relaunches into fullscreen with the conversation
  intact. `/tui` on its own prints the renderer in use, and `/tui default` goes back.
- Or add this key to your global `~/.claude/settings.json`, then restart Claude Code:

  ```json
  "tui": "fullscreen"
  ```

### The pane is still above the prompt

Check these in order:

1. **`/tui` says `default`.** Run `/tui fullscreen`.
2. **The terminal is under 110 columns.** A docked pane has no room below that, so it falls back to
   above the prompt even in fullscreen. Widen the window.
3. **An environment variable is forcing the main screen.** `CLAUDE_CODE_NO_FLICKER=0` and
   `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` both beat the `tui` setting. Unset them.
4. **You are inside tmux, or on SSH to Windows.** Both default to the main-screen layout. The `tui`
   setting is meant to override that default; if `/tui` still reports `default`, start Claude Code
   with `CLAUDE_CODE_NO_FLICKER=1`, which forces fullscreen for that session.

The band is always above the prompt, in both layouts. Only the pane moves.

The pane also tells you where it is: in the main-screen layout it ends with a dim line, "Shown above
the prompt. In the fullscreen layout (110+ columns) this docks beside the transcript."

## Use it

| Command or key | Does |
| --- | --- |
| `/ctx`, or 📊 / `x` on the band | Open the pane, or close it |
| `/ctx show`, `/ctx hide`, `/ctx toggle` | Open, close or flip the pane |
| `/ctx exact`, `/ctx quick` (`e` in the pane) | Count with the token API, or estimate locally (the default) |
| `/ctx compact [focus]` (`c`) | Compact now, telling the summary your focus, the files you edited and your latest requests |
| `/ctx autokeep on` or `off` (`k`) | Give every compaction the same keep list, auto-compact included. Off by default |
| `/ctx cost on` or `off` (`p`) | Show or hide the dollar figures. On by default |
| `/ctx footer on` or `off` | Show `ctx N%` in the footer of Claude Desktop, beside the band's own fill. Off by default; the terminal never shows it |
| `m` `f` `s` `a` `h` `d` in the pane | Open MCP tools, memory files, skills, agents, heaviest results, unused so far |
| `r` in the pane | Count again |
| `Esc` | Close the pane when it has focus |

Whether the pane was open, autokeep and cost are remembered between sessions. Exact mode is not: an
exact count costs a token-count call per change, so each session starts on the estimate.

### The look

ctx shares its look with Agent-Pulse, Waypoints and subagent-progress. Two settings, in `/config` →
ctx:

| Setting | Values | Default |
| --- | --- | --- |
| `palette` | `follow`, `ember`, `claude`, `neon`, `mono` | `follow` |
| `animation` | `follow`, `off`, `subtle`, `full` | `follow` |

`follow` takes Agent-Pulse's own setting (`ember` and `subtle` when it is not installed). In `ember`
and `neon` each category has a colour of its own that shades along its cells, and the free space is
water. `claude` and `mono` keep the engine's category colours and dotted free space, as before 0.8.

Every effect means something:

| Effect | Means | Levels |
| --- | --- | --- |
| The foam at the water's edge laps; at `full` the water drifts | the room left | `subtle`, `full` |
| The cells a turn added shimmer for a moment | what that turn ate | `subtle`, `full` |
| The `ctx` word and the foam breathe amber, then red | auto-compact is near | `subtle`, `full` (`off`: still, in the hot colour) |
| A wave runs back over the freed cells | a compaction gave room back | `full` |
| The trend's newest point pulses | a turn is running | `subtle`, `full` |

On Claude Desktop the band's bar is a small SVG pill with the same meaning, and so is the pane's,
drawn at the pane's own width with the `▲ auto-compact` marker beneath it (0.8.0 drew the pane's bar
as text, which overran the pane and wrapped). Pointing at a category lights its row on the terminal
only. The band's trend takes the pane's colours.

### What to read first

- **The bar and the fill** (`81.9k/1M·8%`): how full the window is. Green below 50%, amber to 80%,
  red above. The `▲` under the bar is where auto-compact starts.
- **`trend` and `~N turns to auto-compact`:** the pace over the last six turns, so you can compact
  on your terms before the engine does it for you.
- **`Heaviest results`:** the tool results that took the most room, with the turn they landed in.
  Any single result over about 15k tokens gets a toast as it lands.
- **`Unused so far`:** MCP servers, skills and agents loaded and never called. A server idle for five
  sessions in a project is a suggestion to turn it off in `/mcp`. ctx never does it for you.
- **`last turn +$1.84`:** what the last turn cost, from the engine's own ledger. Figures with a `~`
  are estimates, priced from the last clean turns of the model in use.
- **`🐾 25% (3h 40m/-2%) · 22% (4d 16h/-11%)`**, at the right of the band on a subscription: the
  share of the 5-hour and 7-day limits used, the time left in each window, and how far ahead of
  (`+`) or behind (`-`) an even spend you are. The figures and colors are claude-hud's pace. It
  narrows with the band (no countdown, then the deltas alone, then nothing), on the Desktop too, by
  the width of its window. An API account sees `session $14.2` there instead, which `/ctx cost off` hides,
  and the pace stays.

## Requirements

- A Claude Code build that loads mods (plugins that register `hooks`).
- Version 0.8.7's tests run on Claude Code 2.1.310. 0.7.0 ran live on 2.1.302, on the terminal and
  Claude Desktop (the pace in the band); 0.8.0's look was seen live on Windows. The engine API ctx uses was checked against build 2.1.288 (see
  [DESIGN.md](./DESIGN.md)); no older minimum has been tried.

## Develop

Load it from disk, which hot-reloads on save:

```
claude --plugin-dir <path to claude-craftkits>/ctx
```

Check it before committing, from the repository root:

```
claude plugin validate .
claude plugin test ctx
```

Bump `version` in `.claude-plugin/plugin.json` **and** `VERSION` in `hooks/version.ts` together.
The host gives a module no way to read its own manifest, so no test can compare them.
