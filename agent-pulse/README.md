# Agent Pulse

**See what Claude Code is doing at every step, in plain English, live, and in color.**

Agent Pulse is a fork of Tzafrir Rehan's [whats-agent-doing](https://github.com/tzafrir/whats-agent-doing) 0.4.3 (MIT, see [LICENSE](./LICENSE)), imported with its history, so the original commits keep their author. Everything that makes the box useful is Tzafrir's: the plain-English step names, the command descriptions in place of flags, the timers, the history behind the triangle, the agent rows. This fork adds color, motion and small charts on top, on the terminal and on the desktop app's Code tab, and a jellyfish.

| Thinking | Running a tool | Writing the reply | Waiting for you | Idle |
| :---: | :---: | :---: | :---: | :---: |
| ![The jellyfish thinking, bubbles rising](media/jelly-thinking.svg) | ![The jellyfish running a tool, its bell pulsing](media/jelly-tool.svg) | ![The jellyfish writing, trailing ink](media/jelly-writing.svg) | ![The jellyfish waiting for approval, glowing yellow](media/jelly-approval.svg) | ![The jellyfish idle, asleep](media/jelly-idle.svg) |

The turn so far, as the timeline strip draws it:

![A turn's phases as colored segments: reading, thinking, writing a call, running tools, waiting for approval, writing the reply](media/strip.svg)

## What it shows

The box above the prompt names the step Claude is on and how long it has been on it. Click ▸ (or focus the band with `ctrl+x tab` and press Enter) to see every step it has taken. This is the original's behaviour, unchanged; [its README](https://github.com/tzafrir/whats-agent-doing#what-it-shows) has the full table of states.

```
╭─────────────────────────────────────────────────────────────────
│ ▸ ⠹ ❯ Find the commit that broke fixed-amount coupons ▃ · 1m 48s
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│ ├─ ⠼ Find callers of applyCoupon › Searching for "applyCoupon("
│ └─ ⠧ Check the coupon tests › Reading coupon.test.ts  33s
╰─────────────────────────────────────────────────────────────────
```

## What this fork adds

Every effect carries meaning: nothing moves just to be busy.

| Addition | What it tells you | Terminal | Desktop |
| --- | --- | --- | --- |
| Status glyph | Claude is working, and on what kind of step | a spinner per phase: `◐◓◑◒` reading, `∘○◎●` thinking, `⣀⣤⣶⣿` writing, braille for tools | the jellyfish acts out the phase |
| Jellyfish | The same, at a glance | | bobs, pulses, swings its tentacles; bubbles while thinking, ink while writing, a `!` or `?` while it waits on you, asleep when idle |
| Breathing border | **You are needed**: an approval or a question | the border fades in and out | the glow breathes yellow |
| Flash | A call just finished, and how | the border flashes green ✓, red ✗ or yellow ⊘ | a halo ring |
| Sparkle | The turn is done | `✦ ✧` after the timer | stars around the jellyfish |
| Timer heat | A step is taking long | amber after 30 s, orange after 2 min, red after 5 min | same |
| Tool glyphs | Which tool runs | `◧` Read, `✎` Edit, `✚` Write, `❯` shell, `⌕` Grep, `⌁` web, `◆` agent, `⧉` MCP | same |
| Agent rows | Who is doing what | `├─ └─` tree lines, a color and a spinner per agent | same, a color per agent |
| Timeline strip | Where the turn's time went | colored `━` per phase, under the headline | an SVG strip |
| Duration bars | Which step was slow | `▏▎▍▌▋▊▉█` per history row | SVG bars |
| Meters | How much is being written | `▁▂▃▄▅▆▇█` for the reply's words or a call's size | same |
| Hover cards | The whole label, when the window cuts it | rest the pointer on a row | same |
| Chime | Claude started waiting for your approval | opt-in | opt-in |
| Above the question | Claude asked you something: the dialog covers the band | a still copy of the headline and agents above the question | same |

## Settings

In `/config`, type `Animation` to find the three rows:

| Setting | Values | Default |
| --- | --- | --- |
| Animation | `off`: still, but with the colors and charts. `subtle`: the status glyph, the flash, the jellyfish's swim. `full`: adds the breathing border, bubbles, ink and sparkles | `subtle` |
| Palette | `ember`: Claude's warm orange range, each phase shading from one color into a second. `claude`: follows your theme. `neon`: glowing deep-sea colors, shading the same way. `mono`: color only for what needs you | `ember` |
| Sound | `off`, or `approval`: a soft chime when Claude starts waiting for your approval | `off` |

A change reloads the mod at once; the box keeps its history. On the desktop, the jellyfish also stops moving when your system asks for reduced motion.

## Install

**Uninstall `whats-agent-doing` first**, or you will see two boxes:

```
claude plugin uninstall whats-agent-doing@tzafrir
```

Then, in Claude Code:

```
/plugin marketplace add afterever/claude-craftkits
/plugin install agent-pulse@afterever-mods
```

Or from your shell:

```
claude plugin marketplace add afterever/claude-craftkits
claude plugin install agent-pulse@afterever-mods
```

**Requirements:** Claude Code in a terminal, or in the desktop app's Code tab. The plugin is a [mod](https://github.com/anthropics/claude-code/blob/main/mods/README.md), written with Claude Code's function hooks, which are early access: they load only where function hooks are enabled, and their API may change between releases. Hooks are not loaded in Claude chat or Cowork.

## Data and privacy

- **Stays in the session.** The plugin keeps its headline, history, timeline and last flourish in the session's own state (`$.state`) and nothing else: no files, no network, no processes, no storage across sessions. `claude plugin validate` lists every call it makes: `$.agent.list`, `$.audio.play`, `$.clock`, `$.state` and `$.ui`.
- **Only displays, never changes what Claude does.** Every hook reads its event and passes it on as it came. It never allows, denies or changes a permission request; it only shows that one is waiting, and plays the chime if you turned it on. The chime is a file of the plugin's own (`sounds/chime.wav`), generated for it.
- **Shows what Claude is working on.** The box and its history display your prompts, file paths, URLs, the descriptions of commands (or the command itself when it has none), MCP tool names and, where the model streams it, a line of its thinking. Anyone who can see your screen can read them. Labels are cleaned of control and invisible characters before they are drawn.

## Develop

Load the plugin from a clone; the session reloads it as you edit:

```
claude --plugin-dir agent-pulse
claude plugin validate agent-pulse
claude plugin test agent-pulse
```

The desktop app starts its own sessions, so there the folder goes in `CLAUDE_CODE_PLUGIN_DIRS` (in the `env` block of `~/.claude/settings.json`) instead of a flag.

| File | What it does |
| --- | --- |
| `hooks/register.tsx` | The hooks, as in the original, plus the settings, the timeline, the flourishes and the chime; it hands the drawing to `draw.tsx` |
| `hooks/draw.tsx` | The box: one renderer for the terminal, one for the desktop and every surface that draws SVG |
| `hooks/pulse.tsx` | The terminal's animations, each a fixed-width `Client` on its own frame clock: the spinner and the sparkle |
| `hooks/jelly.ts` | SVG for the desktop: the jellyfish, the strip and the bars, animated by CSS |
| `hooks/palette.ts` | The palettes, timer heat, per-agent colors |
| `hooks/glyphs.ts` | Tool glyphs, spinners, meters and bars |
| `hooks/activity-of.ts` | Turns a tool call, whole or still streaming, into its short label (the original's) |
| `hooks/text.ts` | Printable labels, thought snippets, word counts, sizes, durations (the original's) |
| `types/index.d.ts` | The `$.state` contract |
| `tests/register.test.tsx` | The original's tests: a whole turn state by state, the history, hostile labels, approvals, agents |
| `tests/pulse.test.tsx` | Every animation level on both surfaces, the flash, the breath, the sparkle, the jellyfish's stable source |
| `DESIGN.md` | Why each addition is built the way it is, and what was turned down |

## License

MIT. Copyright (c) 2026 Tzafrir Rehan, and afterever for the Agent Pulse changes.
