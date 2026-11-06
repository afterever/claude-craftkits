# Waypoints

**A progress bar for a `/goal` and any multi-step work Claude takes on: the task plan as a bar, with elapsed time and an ETA.**

Waypoints is a fork of Nate Herk's [goal-meter](https://github.com/nateherkai/claude-code-mods/tree/main/goal-meter) 1.0.0 (MIT, see [LICENSE](./LICENSE)), imported with its history, so the original commit keeps its author. Everything that makes the meter work is Nate's: the task tool Claude plans with, the band and footer, the ETA at the goal's own pace, the goal check's "not met yet" reason, and the pane with every chat's goal. This fork renames it and builds the plan request into the mod, so nothing has to be added to your global `CLAUDE.md`.

## What it shows

Claude plans the work as tasks sized S, M or L with the mod's own tool, `mcp__waypoints__tasks`, then marks each one started and done. Everything on screen comes from that list.

- **The band above the prompt:** the plan drawn as a **route**, a line of nodes and legs, each leg as long as its task is big (S, M or L). Finished legs are solid and shaded, the task running now is a twinkling `✦` at the start of its leg, a parked task's leg stays dashed with a `⏸`, and the last node is a flag: `⚐` on the way, `⚑` once the plan is done. A long plan in a narrow window drops the legs and draws one glyph per task. Under it: what is running and who runs it, the next task, and one notable row: the goal check's latest "not met yet" reason, `paused, waiting on you`, `◆ waiting on <background task>`, or `⏸ parked: <blocker>`. In the header: tasks done, the percentage, the ETA at this goal's own pace and how many tasks are parked.
- **The footer:** `◎ goal 69% · ~15m`, whether or not the band shows. On Claude Desktop, where the band already draws the plan, it appears in the footer only while the band is hidden with `/waypoints hide`.
- **The pane:** `/waypoints` opens this chat's whole task trail (every task, how long each took, who is running which, what a finished task turned out to be, and why the plan was revised) and your other chats' goals from the last hour (the newest 15; the heading counts them all), each with its own small route. It also **opens by itself** when a goal's first plan starts, without taking the keys from your prompt, unless you closed the pane during that goal.
- **Claude Desktop:** the route is a drawn line instead of characters, with the same states and its own motion. Any surface that is not the terminal gets the drawn line.

```
◎ Goal: Add band to Settings type…               3 of 6 · 50% · ~2m   all tasks g
●━━━━━━━━●━━━━●━━━━━━━━✦┄┄┄┄┄┄┄┄○┄┄┄┄○┄┄┄┄┄┄┄┄⚐ +2
⠋ M  Tests: normalize, command, band on/off           ◆ reviewer · 1m
  next ○ S  README, version bump, marketplace.json
```

The ETA appears after two tasks are done. When a goal finishes the full band stays for 8 seconds, then collapses to one row; a minute after the finish (your choice in `/config`, see Settings) the band goes, and a pane that Waypoints opened closes with it (a pane you opened yourself stays). The mod makes no model calls of its own.

## Settings

In `/config`, under Waypoints:

| Setting | Values | Default |
| --- | --- | --- |
| Palette | `follow`, `ember`, `claude`, `neon`, `mono` | `follow` |
| Animation | `follow`, `off`, `subtle`, `full` | `follow` |
| Pane | `auto`, `off` | `auto` |
| Finished plan stays | `30 seconds`, `1 minute`, `3 minutes`, `10 minutes` | `1 minute` |
| Managed plan | `auto`, `on`, `off` | `auto` |
| Herdr status | `off`, `on` | `off` |

`follow` takes [Agent-Pulse](../agent-pulse)'s own palette or animation, so the two bands never disagree, and falls back to `ember` / `subtle` when Agent-Pulse is not installed. Pick a value to stop following. Colour and shape show at every animation level; `off` keeps everything still, `subtle` pulses the running task, `full` also breathes the node and sweeps the route when the plan finishes. `Finished plan stays` is how long the band and the footer's `done ✓` stay after a plan finishes or is stopped, and when a pane Waypoints opened closes. `Pane: off` opens the pane only when you ask (`/waypoints` or `g`). A window narrower than 144 columns leaves an unasked pane waiting until it widens; `g` and `/waypoints` open it at any width. `Managed plan` is for Team and Enterprise plans; see [On a Team or Enterprise plan](#on-a-team-or-enterprise-plan).

`Herdr status` is for Claude Code running in a Herdr terminal on Windows. Herdr shows an agent as needing you only when the program reports it, and Claude Code reports a turn that ends with a plan task still open as `done`, while the band says `⏸ paused, waiting on you`. With `on`, Waypoints reports that turn as needing you, so Herdr shows **Needs you** (and plays its sound) until you reply. It needs Windows PowerShell 5 or PowerShell 7 and herdr-core's `hc` on the PATH, and checks both when a session starts: if one is missing it says so once in a toast and does nothing. It stays quiet and does nothing in the Claude desktop app, outside Herdr, on macOS and Linux, for a sub-agent another agent runs with `hc`, while background work the turn started is still running, and after a turn stopped with Esc. While the mark is up, `hc send` to that terminal needs `--force`, as it would for a question.

## On a Team or Enterprise plan

On these plans Claude Code runs a built-in guard, `cc-plugin-sec-default`, before every mod you install. It sends three of the events Waypoints listens to on past every mod: the system prompt, the end-of-turn `Stop`, and the goal check's attachment row. Those hooks never run, and Claude Code says so at the start of every session:

```
waypoints: its prompt.compose hook was skipped. "cc-plugin-sec-default" runs first and sent the event on past it.
```

With `Managed plan: auto` (the default), Waypoints spots this the first time a turn ends with neither the system prompt nor its `Stop` reaching it. It then sets the row to `on` by itself and tells you in a toast. The row is saved in your settings, so it holds across new chats, restarts and reboots, on that computer. You see the lines once, in the first session after the update; from its second turn on, Waypoints is already in managed mode.

With `on`, Waypoints leaves those three hooks out, so nothing is skipped and there are no lines. It does their work another way:

| Left out | Instead |
| --- | --- |
| The standing line in the system prompt | The same words go beside the first prompt you type in a session, as context Claude reads and you never see. A long chat's compaction can drop them; a `/goal` still asks for a plan each time. |
| The goal check's attachment row | When a turn of a `/goal` ends, Waypoints reads the check's verdict from the end of the chat's log, trying again for up to a minute while the check runs. |
| `Stop` | Nothing: the `◆ waiting on …` row for background work does not show. |

`off` never switches, for a plan whose guard you know does not skip these. If your organization stops using the guard, set the row back to `auto`.
 is not Claude's to finish

Sometimes everything this chat can do is done and the last task waits on someone else: another team's reply, a release window, a person who is away. Claude **parks** that task with a note naming the blocker. A parked task stays on the route as a dashed leg with a `⏸`, but leaves the header's numbers, so the plan reads `6 of 6 · 100% · 1 parked` and finishes green; the summary row keeps `1 parked: <blocker>`, so green is not read as "all of it is done". `paused, waiting on you` now shows only when an open task really waits on you.

Claude is also asked two things in the same words that ask it to plan: when a task turns out differently than the plan assumed, fix the later tasks and say what changed (the pane shows `revised after #3: <why>`); and never end a turn on an open task without saying why. It finishes the task, parks it, or, when it is unsure what the task takes, asks you with options and a recommendation.

## When Claude plans

| Work | What asks for a plan |
| --- | --- |
| A `/goal` | The mod adds a note to the command asking for a plan. If four tool calls pass with no plan, it reminds Claude once. Until there is a plan, Claude's `Edit`, `Write`, `NotebookEdit` and `MultiEdit` calls are refused, so the bar is full from the start (`Bash` and subagents are not held back, and nothing is refused if the mod's tool did not register). |
| Any other work of 3 or more steps | A standing line in the system prompt (new in 1.1.0). A plan made this way shows the same, named after the one-line `goal` Claude gives it (its first task if it gives none) and labelled *Plan* where a goal is labelled *Goal*. |
| A small, single-step request | Nothing: the line tells Claude to skip it. |

The standing line tells subagents never to call `plan`, because it replaces the main agent's pending tasks; they can `start` and `done` tasks. It is a request, not a rule: the tool does not refuse a subagent's `plan`. The line is also left out of bare and teammate sessions, of a `claude -p` run (nothing draws), and while `/waypoints auto` is off. The Claude desktop app, which runs Claude Code as an SDK host, does get it.

The standing line is the one thing the global `CLAUDE.md` bullet used to do. If you still have that bullet from goal-meter, delete it.

> **Needs function hooks, which are early access.** On a Team or Enterprise plan the standing line goes beside your first prompt instead; see [On a Team or Enterprise plan](#on-a-team-or-enterprise-plan).

## Use it

| Command | What it does |
| --- | --- |
| `/waypoints` | Opens the pane (so does any word it does not know). Where the surface draws none, it prints the plan as text. |
| `/waypoints hide`, `show` | Hides or shows the band, and says so in a toast. The footer stays. A new goal or plan shows it again. |
| `/waypoints auto on`, `off` | Turns the standing line on or off. On by default; the choice is kept between sessions. The pane's last row shows which it is. |
| `/waypoints clear` | Marks this chat's running goal as stopped; the band keeps showing `stopped` for the `Finished plan stays` time (a minute by default). A finished goal is left as it is. |
| `/waypoints prune` | Deletes old files in `~/.claude/mods-data/waypoints/`: other chats' goals that finished over an hour ago, and files untouched for a day. Never this chat's file, never a running goal's. It deletes them straight away, with no dialog: typing the command is the confirmation. Past 100 files the pane names the folder and reminds you. |

For `auto`, anything but `off` turns it on. `/goal clear` (or `stop`, `off`, `cancel`, `end`, `none`, `reset`) stops the goal in the same way. If Claude Code will not give the mod the name `/waypoints`, it registers `/waypoints-mod` instead.

In the band, the **all tasks** button (or `g`) opens the pane. `g` is a button in the band, so it only works while the band shows; `/waypoints` always does.

## What changed in 2.7.0

- **A bad `tasks` list is answered, not guessed.** If Claude sends the list as text that is not valid JSON (the usual slip is an unquoted size, `"size":S`), Waypoints used to make one task titled with the whole text, and the bar read `0 of 1`. Now a bare `S`, `M` or `L` is quoted and the reply says it repaired it; any other mistake is an error naming the task and the field, and nothing is planned. A size such as `XL` is an error too, where it used to become `M`. A plan or add reply now starts with a count (`Planned 7 tasks.`), so Claude can see what was understood.

## What changed in 2.6.0

- **Herdr can show a paused plan as needing you.** A new setting, `Herdr status` (off by default). When a turn ends with a plan task still open, Herdr said the agent was done, then idle, while Waypoints said it was waiting on you. With the setting on, Waypoints reports that turn to Herdr as needing you; your reply clears it, as it does for a question. Windows only; see [Settings](#settings) for what it needs and where it stays off.

## What changed in 2.5.2

- **The Claude desktop app is asked to plan on plans without the guard too.** 2.5.1 fixed this only in managed mode. Elsewhere the ask rides in the system prompt, which Waypoints left out of every "print" session (`claude -p` and the SDK), so the desktop app, an SDK host, never got it and Claude executed multi-step work one step at a time with no plan. Only a print session that draws nowhere is left out now. Terminals are unchanged.

## What changed in 2.5.1

- **On a Team or Enterprise plan, the Claude desktop app is asked to plan.** In managed mode the standing line went only to a session where a person types at a prompt, and the desktop app runs Claude Code as an SDK host, which does not count as one. So Claude there never heard of Waypoints and made its own task list with the built-in tools (the desktop app labels it "Plan from before your last message"). Managed mode now also asks any session that draws on a surface. Terminals and plans without the guard are unchanged.

## What changed in 2.5.0

- **No more "hook was skipped" lines on Team and Enterprise plans.** A new `Managed plan` row in `/config` (`auto`, `on`, `off`) leaves out the three hooks those plans' built-in guard skips, and switches itself on the first time it sees the guard. The standing line rides beside your first prompt, and the goal check is read from the log when a turn ends, so both work on these plans again; the background-work row does not. See [On a Team or Enterprise plan](#on-a-team-or-enterprise-plan).

## What changed in 2.4.2

- **The pane's hint row fits on one row.** It read `auto: on · /waypoints hide|show · clear (stop the goal) · look & pane: /config → Waypoints` and wrapped onto two; it is now `auto: on · /waypoints hide|show|clear · look: /config`, and is cut rather than wrapped in a narrower pane.

## What changed in 2.4.1

- **This chat's finished goal leaves the pane after an hour,** the same cutoff other chats' goals already had. Until now it stayed in its own chat's pane until you cleared it or started a new goal. A goal still running is never aged out.

## What changed in 2.4.0

- **How long a finished plan stays is a setting:** `/config` → Waypoints → `Finished plan stays`, `30 seconds`, `1 minute`, `3 minutes` or `10 minutes`. The default is a minute (30 seconds in 2.3.1). It sets how long the band and the footer's `done ✓` stay, and when an auto-opened pane closes.

## What changed in 2.3.1

- **A finished plan leaves after 30 seconds, not three minutes,** band and footer label (`◎ plan done ✓`) together.
- **The band and the footer label now really go.** The 15-second timer used to check whether the band was still due after moving its own clock, so the tick that ended the stay skipped the redraw, and `plan done ✓` stayed until something else redrew. A finish or a stop now schedules its own redraw just after the 30 seconds.

## What changed in 2.3.0

- **Waiting on background work no longer says "waiting on you".** When a turn ends while a subagent, a background command or a monitor is still running, the band shows a dim `◆ waiting on <name>` (or `◆ waiting on 3 background tasks`) instead of `⏸ paused, waiting on you`. The finished task wakes Claude by itself, so nothing is asked of you. `⏸ paused, waiting on you` stays for a pause with nothing running.

## What changed in 2.2.0

- **Parked tasks.** The tool's new `park` action, with a required note naming the blocker, takes a task that waits on someone outside the chat out of the numbers, so the plan can finish green. The band, the summary row and the pane name it. See "When the last step is not Claude's to finish".
- **Plan revisions.** A new `plan` or `add` takes a note saying what changed. The pane shows `revised after #n`, a finished task's note and the new tasks marked `revised`.
- **Two rules for Claude:** revise the later steps when a step surprises, and never end a turn on an unexplained open task.
- **New look:** the destination is a flag (`⚐`, then `⚑` when done) instead of a `◎` among the circles, and the running task is a twinkling `✦`, in the pane too.

## What changed in 2.1.0

**The options are fewer and say what they do.** `/waypoints hide` and `show` confirm in a toast. The pane's last row shows whether `auto` is on, what `clear` does and that the look and the pane's opening are set in `/config` → Waypoints. Other chats are listed for an hour instead of twelve. `/waypoints prune` deletes old data files, and the pane reminds you once the folder holds more than 100.

A `/goal` now always plans before Claude edits files; the `strict` option is gone.

## What changed in 2.0.3

Fixed: on Claude Desktop the footer's `◎ plan 44%` never showed, so `/waypoints hide` left no sign of a running plan. Desktop does not draw the labels a mod adds to the footer, only what it draws as a tree, so there the label is now a tree around the engine's footer. It shows only while the band is hidden, because the band already shows the plan; the terminal is unchanged.

## What changed in 2.0.2

Fixed: a plan made without `/goal` was named after its first task, so a plan to review the README showed as "Plan: Review README intro". The `plan` action now takes an optional `goal`, one line naming what the whole plan achieves, and the standing line asks Claude for it. The title, the toast and the pane use it; without one the plan is still named after its first task.

## What changed in 2.0.1

Fixed: on the terminal the route row was missing and the running node did not pulse, because the band took the terminal for Desktop. It now goes by the surface the engine names.

## What changed in 2.0

Only how it looks and when the pane opens; what Claude is told and the tool it plans with are the same as in 1.1, and the data files are unchanged, so chats still on 1.1 appear in your pane.

- The one-row bar is now the route; the stats row moved into the pane.
- The pane shows every task as a trail with duration bars, instead of a window of six rows with `+n more`.
- The pane opens when a plan starts (`Pane` setting) and closes with the band.
- Fixed hex palettes copied from Agent-Pulse replace the theme keys 1.1 drew in (`cyan`, `green`), which a skin can remap, so the colours no longer depend on your theme unless you pick `claude` or `mono`.
- The band stays three minutes after a finish instead of ten (30 seconds since 2.3.1).

## What changed from goal-meter

| | goal-meter 1.0.0 | Waypoints |
| --- | --- | --- |
| Plugin | `goal-meter` | `waypoints` |
| Tool | `mcp__goal-meter__tasks` | `mcp__waypoints__tasks` |
| Command | `/goals` | `/waypoints` |
| State folder | `~/.claude/mods-data/goal-meter/` | `~/.claude/mods-data/waypoints/` |
| Plans outside `/goal` | Only with a line in the global `CLAUDE.md` | A standing line in the system prompt, `/waypoints auto off` to remove it |

Switching: uninstall `goal-meter@nateherk-mods`, install `waypoints@afterever-mods`, delete the goal-meter bullet from the global `CLAUDE.md`, and open a new chat. Goals saved by goal-meter are not carried over; they only last a day anyway.

## Files

State is one JSON file per chat in `~/.claude/mods-data/waypoints/`, written so the pane can list other chats; `/waypoints prune` deletes the old ones. When Recording Mode's flag is on, titles and notes are masked before they are drawn.
