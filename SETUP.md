# Setting up my Claude Code mods on a new computer

One file to reproduce this laptop's Claude Code mod setup elsewhere: which mods to install and the
`/skin` setting and skin that are not in any repository. Each mod has its own section; when the setup changes, change the section, do not add a
file.

## Quick start

Paste this into Claude Code on the new computer:

> Read `SETUP.md` in the `afterever/claude-craftkits` repository and set up my Claude Code mods exactly
> as it says: add the marketplaces and install the plugins, run `/skin words claude`, and
> rebuild the `cupertino` skin. Show me the diff before changing any file, and run the
> checks at the end.

## Mods at a glance

| Mod | Source | Tested | What it is |
| --- | --- | --- | --- |
| `ctx` | `afterever/claude-craftkits` (this repo) | 0.8.6 | Context window pane and band, compacting on your terms, the plan's pace, its look |
| `subagent-progress` | `afterever/claude-craftkits` (this repo) | 2.2.1 | Progress bar and live panel for subagent work |
| `prompt-upgrade` | `afterever/claude-craftkits` (this repo) | 0.2.1 | `/prompt-upgrade` turns a rough prompt into a great one before it is sent |
| `work-report` | `afterever/claude-craftkits` (this repo) | 0.4.1 | `/work-report` shows what Claude has done for you: tasks, hours saved, what that is worth |
| `waypoints` | `afterever/claude-craftkits` (this repo) | 2.4.0 | Task plan shown as a route above the prompt for a `/goal` or any multi-step work, with a pane that opens by itself; replaces `goal-meter` |
| `skins` | `hellosverre/claude-skins` | 0.5.13 | Colour scheme and words for the transcript |
| `superpowers` | `obra/superpowers` | 7.0.0 | Skills library: brainstorming, planning, test-driven development, debugging and review workflows |
| `agent-pulse` | `afterever/claude-craftkits` (this repo) | 1.1.0 | Box above the prompt naming the step Claude is on, in color and motion, with a step history |
| `arsenal` | `afterever/claude-craftkits` (this repo) | 0.4.6 | Button in the footer under the prompt that opens a docked menu: Prompt Upgrade switch, Sound notifications switch with a sound for your Enter and one for Claude, shortcuts to `/prompt-upgrade` and `/work-report`, and your own skills and commands (USER and PROJECT), each of which you can turn off |

## Install

```
claude plugin marketplace add afterever/claude-craftkits
claude plugin marketplace add hellosverre/claude-skins
claude plugin marketplace add obra/superpowers

claude plugin install ctx@afterever-mods
claude plugin install subagent-progress@afterever-mods
claude plugin install prompt-upgrade@afterever-mods
claude plugin install work-report@afterever-mods
claude plugin install agent-pulse@afterever-mods
claude plugin install arsenal@afterever-mods
claude plugin install waypoints@afterever-mods
claude plugin install skins@hellosverre-mods
claude plugin install superpowers@superpowers-dev
```

Restart Claude Code afterwards: an installed plugin is not hot-reloaded. Pick up new versions of
the mods in this repo with `claude plugin marketplace update afterever-mods` and then
`claude plugin update <name>@afterever-mods`.

**Auto-update.** `afterever-mods`, `hellosverre-mods` and `superpowers-dev` check for new versions
by themselves. It is a per-marketplace setting, `"autoUpdate": true` beside `source` in
`extraKnownMarketplaces` in `~/.claude/settings.json`, and the `/plugin` menu toggles the same
thing. A new version still needs a restart to load.

## ctx

My own mod: context window details in a pane and a band above the prompt. Nothing to configure
after installing, except that the pane docks to the right only in the fullscreen layout:
[ctx/README.md](./ctx/README.md#get-the-pane-on-the-right-use-the-fullscreen-layout). What it does
and the commands: [ctx/README.md](./ctx/README.md#use-it). Why each feature exists:
[ctx/DESIGN.md](./ctx/DESIGN.md).

## subagent-progress

My fork of johnnyvizz's `savvy-progress`, renamed in 2.0.0: a progress bar above the prompt and a
live agents panel, each subagent a crab whose costume follows its model and effort. Nothing you
have to configure: its terminal look follows `agent-pulse`'s palette and animation level by default
(set your own in `/config`). What it does and what changed: [subagent-progress/README.md](./subagent-progress/README.md).

**Do not install `savvy-progress` next to it.** Both draw a progress bar above the prompt and an
agents panel, so you would get two of each. The command here is `/subagent-progress` (it was
`/agents-info` until 2.2.0, which is still upstream's).

## prompt-upgrade

My own mod, built from the Prompt Upgrade idea and spec of the author of AI Made Easy
([tristenobrien.ai](https://tristenobrien.ai/)): `/prompt-upgrade` asks up to three quick questions,
rewrites a rough prompt and shows the original and the upgrade side by side. Nothing is sent until
you press Run. Written against 0.1.0. Nothing to configure.

- **It costs tokens only when used:** each upgrade makes two model calls (`haiku` picks the
  questions, `sonnet` writes the rewrite). `/prompt-upgrade on` makes every typed prompt go through the pane
  first; it starts off and is remembered between sessions.
- What it does and the commands: [prompt-upgrade/README.md](./prompt-upgrade/README.md).

## work-report

My own mod: `/work-report` opens a pane with Today, Week, Month and Year tabs showing the tasks Claude
finished, an estimate of the hours that saved and what they are worth. Written against 0.3.0.
Nothing to configure, but the figures are estimates from settings you can change.

- **Set the estimate once:** `/work-report settings` lists the minutes each kind of task saves and the
  hourly rate; `/work-report settings rate 75` changes one.
- **It makes no model calls and sends nothing anywhere.** Counts are kept in the mod's own store on
  this computer. The store belongs to the installed copy, so a `--plugin-dir` run keeps a separate
  count.
- **A chip above the prompt** shows today's count and opens the pane. Other bands above the prompt
  stack under it. With `arsenal` installed the chip is redundant: `/work-report settings band off` hides
  it (kept between sessions), and the Arsenal menu's report rows still open the pane.
- What it counts, how a task is sorted and how the pane narrows:
  [work-report/README.md](./work-report/README.md).

## waypoints

My own mod, a fork of Nate Herk's `goal-meter` 1.0.0 (renamed; imported with its history). It gives
Claude one tool, `mcp__waypoints__tasks`, that holds the task plan the bar shows, and `/waypoints`
opens the pane. Written against 2.1.0. Nothing to add to the global `~/.claude/CLAUDE.md`: the mod
puts one line in the system prompt asking Claude to plan work of 3 or more steps, and a `/goal` asks
for a plan on its own. `/waypoints auto off` removes the line.

- **Settings** (`/config` → Waypoints): Palette and Animation default to `follow`, which takes
  Agent-Pulse's own values (`ember` / `subtle` without it); Pane defaults to `auto`, which opens the
  pane when a plan starts and never takes the prompt's keys. The pane waits below 144 columns.

- **Coming from `goal-meter`:** `claude plugin uninstall goal-meter@nateherk-mods`, delete the
  **Goal meter** bullet from the global `CLAUDE.md` (it names a tool that no longer exists), and open
  a new chat. Both plugins would otherwise run side by side.
- **Trigger:** work of 3 or more steps. Small single-step requests skip it.
- **Subagents:** they are told never to call `plan`, because it replaces the main agent's pending
  tasks.
- **A last step that waits on someone else** (2.2.0): Claude parks it with a note naming the blocker;
  the plan finishes green and the summary row keeps `1 parked: <blocker>`.
- **Background work** (2.3.0): while a turn has ended with a subagent, a background command or a monitor
  still running, the band says `◆ waiting on <name>` in dim, not `⏸ paused, waiting on you`.
- **Where it does not run:** the standing line is a `prompt.compose` hook, which the engine passes
  over in plugins you install where an organization manages Claude Code. A `/goal` still asks for a
  plan there.
- What it does and what changed: [waypoints/README.md](./waypoints/README.md).

## skins

`skins` is third-party, written against 0.5.13. Two things on top of it are mine and live nowhere
else: one setting, `/skin words claude`, and a made skin called `cupertino`. Set the words, then
build the skin.

### Setting: `/skin words claude` keeps Claude Code's own words

**Why.** A made skin can set `spinner` and `done` words, capped at 12 words of 24 characters.
Claude Code's own pool is 185 spinner words and 8 done words, so a skin can never carry them all.
Since 0.5.5 the plugin has a global setting for it: `/skin words claude` makes the spinner and the
turn footer show Claude Code's own word whatever the skin says. `/skin words skin` is the default
and draws the skin's words. Saved skins keep their words either way.

```
/skin words claude
```

- **It replaces my old local patch** to `resolveSkin` in `hooks/custom.ts`. That patch is not
  needed and must not be applied: upstream took the request (issue #37, merged as
  [hellosverre/claude-skins#45](https://github.com/hellosverre/claude-skins/pull/45)) as this
  setting instead. A machine that still has the patched cache loses it on
  `claude plugin update skins@hellosverre-mods`, which replaces the cache directory wholesale.
- **Nothing to patch after an update.** The setting lives with the plugin's other `/skin`
  preferences, not in the cache directory.
- **It applies to every skin, built-in ones too.** `/skin list` shows the current value.

### The `cupertino` skin

A macOS/iOS dark-mode colour scheme on the `noir` base. A made skin is stored in the skins
plugin's own store, **not in git**, so rebuild it from the table below.

**Palette.** Source: Apple Human Interface Guidelines, *Color*, system colours, dark, default
contrast (iOS table), read on 2026-10-10 from
`https://developer.apple.com/tutorials/data/design/human-interface-guidelines/color.json`. The page
is JS-rendered and the swatch values exist only as image alt text (for example `R-255, G-66,
B-69`), so a plain page fetch returns just the title.

| slot | hex | Apple source | used for |
|---|---|---|---|
| user | `#0091FF` | Blue | accent: rail, prompt marker, spinner |
| read | `#3CD3FE` | Cyan | Read |
| write | `#FF9230` | Orange | Edit / Write |
| run | `#FFD600` | Yellow | Bash / PowerShell |
| search | `#FF6165` | Red, increased contrast | Glob / Grep |
| web | `#6D7CFF` | Indigo | WebFetch / WebSearch |
| mcp | `#B78A66` | Brown | MCP tools |
| ok | `#30D158` | Green | finished call |
| err | `#FF4245` | Red | failed call |
| **warn** | `#FF6A00` | *none* | interrupted call |
| fg | `#FFFFFF` | label (white) | body text |
| muted | `#8E8E93` | systemGray | secondary text |
| surface | `#2C2C2E` | systemGray5 | table header band |
| zebra | `#1C1C1E` | systemGray6 | alternate table rows |
| other | `#AEAEB2` | systemGray, increased contrast | anything else |

Words: none set. With `/skin words claude` Claude Code's own 185 spinner and 8 done words show,
so the skin's words are never drawn.

**Rebuild.**

```
mcp__skins__design  action=save  name=cupertino  base=noir
  palette={"user":"#0091FF","fg":"#FFFFFF","muted":"#8E8E93","surface":"#2C2C2E","zebra":"#1C1C1E",
           "ok":"#30D158","err":"#FF4245","warn":"#FF6A00","read":"#3CD3FE","write":"#FF9230",
           "run":"#FFD600","search":"#FF6165","web":"#6D7CFF","mcp":"#B78A66","other":"#AEAEB2"}
```

`save` also applies the skin and overwrites a skin of the same name. `/skin list` then shows
`cupertino` as `●`.

**Applying changes.** A palette save takes effect immediately in the running session, no
restart.

**Decisions worth remembering.**

- **`warn` is the only non-Apple value.** Apple's system colours have no orange-red, and `run`
  (yellow), `write` (orange) and `err` (red) already sit around it. `#FF6A00` maximises the minimum
  CIE76 distance: 21 from `write`, 34 from `err`. The Apple-sourced alternative that is clearly
  distinct is the increased-contrast pink `#FF8AC4`, rejected as odd for "interrupted".
- **`search` is the increased-contrast red, close to `err`.** Apple's Purple (`#DB34F2`) rendered
  as magenta, so `search` took the lighter red `#FF6165`. It is 16 CIE76 from `err` (`#FF4245`),
  the tightest gap in the palette; the default reds are 5 to 9 away and unusable. Revert to
  `#DB34F2` if Grep rows and failed calls get confused.
- **`run` stays yellow** (Terminal/Xcode convention) and `warn` moved, chosen over giving `run` a
  mint or teal, which land 14-29 from `read`.
- **Unverified:** the HIG page lists no numbers for `label`, `secondaryLabel` or `tertiaryLabel`,
  and no numeric macOS table. `fg` and `muted` are judged against the gray scale only. Apple says
  these values change between releases.
- **`zebra` `#1C1C1E`** is a step off a pure black background. On a `#1E1E1E`-style terminal
  background it is nearly invisible; `tables` is `off`, so it is not seen.

## superpowers

Third-party, written against 7.0.0, installed as is. It adds a library of skills for Claude Code
(brainstorming, planning, test-driven development, debugging, code review) and a start-of-session
hook that points Claude at them. Nothing to configure.

- **Install it from the author's marketplace, `obra/superpowers`,** not the copy in
  `claude-plugins-official`: it is the same plugin, and the author's repository is where new
  versions appear first.
- **Coming from the official copy:** `claude plugin uninstall superpowers@claude-plugins-official`
  before installing, or both load.

## agent-pulse

My fork of Tzafrir Rehan's `whats-agent-doing` 0.4.3, imported with its history and renamed: a
box above the prompt that names the step Claude is on in plain English and how long it has been on
it, with color, motion and small charts added on the terminal and the desktop app's Code tab, and a
jellyfish on the desktop. Written against 1.1.0. What changed:
[agent-pulse/README.md](./agent-pulse/README.md); why: [agent-pulse/DESIGN.md](./agent-pulse/DESIGN.md).

**Do not install `whats-agent-doing` next to it,** or two boxes show.

- **Set it in `/config`:** type `Animation` to find its three rows. Mine are **Animation `full`**,
  Palette `ember` (the default since 1.1.0), Sound `off`. `subtle` is the default and calmer; `off` keeps the colors and
  charts but stills everything.
- **Expand the history:** click the triangle, or focus the box with `ctrl+x tab` and press Enter.
  Collapse the whole band with `ctrl+x ctrl+a`.
- **It only displays.** No network, files or model calls, so it costs no tokens, and it never
  answers a permission prompt, only shows that one is waiting (and chimes, if Sound is on).
- **Both it and `subagent-progress` show background agents,** so an agent appears in two places:
  the crabs are the subagents, the jellyfish is Claude.
- **Needs function hooks,** which are early access: it loads in a terminal or the desktop app's
  Code tab, not in Claude chat or Cowork, and its API may change between releases.

## arsenal

My own mod, from an idea in a video by the author of AI Made Easy ([tristenobrien.ai](https://tristenobrien.ai/)):
a `[ ◆ Arsenal ▾ ]` button in Claude's orange, in the footer on the first row under the prompt box, opens a menu pane docked on the
right, with a Prompt Upgrade on/off switch, a Sound notifications switch with a sound for your Enter and one for Claude, one-press shortcuts to
`/prompt-upgrade` and `/work-report`, and two sections for your own commands: **USER**
(`~/.claude/skills` and `~/.claude/commands`) and **PROJECT** (the same two folders in the current
repo). `/arsenal` toggles it from the keyboard. Written against 0.4.6. Nothing to configure. The last
line of the pane says the version.

- **The menu always shows.** The sound notifications need no other mod. It lists the session's
  commands and keeps only the tools' rows whose command exists. Restart Claude Code after
  installing a tool.
- **Sound notifications are off until you turn them on** (`c` in the menu, or `/chime on`). There
  are two sounds, as in iMessage: **You** plays when you press Enter on a prompt (`none` until
  you pick one, `m` in the menu or `/chime sent <name>`), and **Claude's** plays when a reply is
  done, when Claude asks you something and when it needs a permission OK (`o`, or
  `/chime sound <name>`; `/chime test` plays it). Both pick from the `.wav` and `.mp3` files you put in
  `~/.claude/arsenal/sounds/` (made for you, with a `README.txt`, whenever a session starts without it),
  then Windows' own. Apple's two iMessage sounds work as `.mp3`, or
  converted to `.wav` (on a Mac: `afconvert -f WAVE -d LEI16 in.caf out.wav`); they are not in the repo. A Mac
  plays `.caf`, `.aiff` and `.m4a` as they are and has Apple's own sounds, and 0.4.5 was checked on a Mac (Terminal and Desktop). The
  idea is from
  [angomedia/claude-mods](https://github.com/angomedia/claude-mods)' done-chime; the code is
  written fresh.
- **USER and PROJECT list every skill and command you wrote, all on.** `✎ edit` on a section's
  header shows a pill on each row to turn single commands off and on. What is off is saved on
  this machine, so the home PC and the work PC keep separate lists, and a PROJECT list belongs to
  the repo, shared by its worktrees and subfolders. A row runs the command bare; a `…` on a
  command that takes arguments puts `/name ` in an empty prompt box for you to finish. Plugins'
  skills, built-ins and commands in subfolders are not listed.
- **It is a remote control, with one thing of its own: the sound notifications.** Every other row
  runs a slash command that already exists, and it never writes another mod's state or your skill
  files. It shows the model and effort in its header and never changes them.
- **It makes no model calls.** It keeps two things between sessions: which of your commands you
  turned off, and the sound notifications' switch and two sounds.
- What it does, the keys and the rows: [arsenal/README.md](./arsenal/README.md); why:
  [arsenal/DESIGN.md](./arsenal/DESIGN.md).

## Check it worked

- `claude plugin list` shows the nine plugins above.
- A new chat starts with the superpowers skills available (`superpowers:brainstorming` and the
  rest show in the skill list).
- `/ctx` opens the context pane, and the band shows above the prompt.
- Run a few subagents: the progress bar fills and ends in a green Done row; `/subagent-progress` toggles
  the panel.
- `/skin list` shows `words claude`, and `cupertino` as `●`.
- In use, the spinner shows a Claude Code pool word (Clauding, Reticulating...) and the turn
  footer an original done word (Baked, Brewed, Sautéed...).
- A multi-step request makes Claude call `mcp__waypoints__tasks` with `plan` first, and the bar
  above the prompt fills as tasks finish; `/waypoints` opens the pane.
- `/prompt-upgrade` opens a pane that asks for a rough prompt; `/work-report` opens the Work Report pane, and a
  `Work report` chip shows above the prompt.
- A `[ ◆ Arsenal ▾ ]` button shows in the footer on the first row under the prompt box, before the
  `◎ plan` label of `waypoints`; pressing it (or `/arsenal`) opens a pane docked on the right with
  the Prompt Upgrade switch and the Launch rows.
- While Claude works, a box above the prompt names the current step with a spinning glyph and a
  timer, its border flashing as calls end; the triangle expands the history.

## Keeping this file current

- Change a mod's setup, change its section here, in the same commit.
- Record the version a section was written against, and re-check it after the mod updates.
- Mods that belong to this repository keep their design notes in their own folder; this file only
  holds what it takes to reproduce the setup.
- Keep it public-safe: no home paths, emails or secrets, and only the specific `CLAUDE.md` lines
  meant to be shared, never the whole file.
