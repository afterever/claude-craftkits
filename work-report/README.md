# work-report

A Claude Code mod that shows **what Claude has done for you**: how many tasks it finished, an **estimate** of the hours that saved you, and what that time is worth. `/work-report` opens a pane with four tabs: Today, Week, Month and Year.

Hours and dollars are always **estimates**: the minutes you say a task saves, times your hourly rate. The mod never claims more than that.

## Use it

| Command | What it does |
| --- | --- |
| `/work-report` | Opens the pane. |
| `/work-report today`, `week`, `month`, `year` | Opens the pane on that tab. |
| `/work-report settings` | Lists the minutes saved per kind of task and the hourly rate. |
| `/work-report settings rate 75` | Sets the hourly rate to 75. |
| `/work-report settings emails 15` | Sets the minutes one email task saves to 15. Also `code`, `documents`, `images`, `research` and `other`. |
| `/work-report settings band off` | Hides the chip above the prompt. `on` brings it back. |
| `/work-report help` | One line of usage. |

A **Work report** chip above the prompt, with today's count beside it, opens the pane too. Claude Code has no pressable entry in the status line itself, so the button sits in the band above the prompt and keeps whatever the other mods draw there beneath it.

If another mod already opens the pane for you, such as the [`arsenal`](../arsenal) menu's report rows, the chip is a second button for the same thing. `/work-report settings band off` hides it; `/work-report` and the other mod's buttons still open the pane. The choice is kept between sessions, and the chip is on until you turn it off.

### The pane

Four tabs across the top, the chosen one a gold chip with dark text. The stretch and its dates sit in a title bar under them.

| Tab | Covers | Chart (three rows tall) | Line under the chart |
| --- | --- | --- | --- |
| Today | today | the last seven days by weekday | the streak |
| Week | the last 7 days | the last seven days by weekday | the streak |
| Month | the last 30 days | thirty daily bars | best day, active days |
| Year | January 1 through today | January to December, this month gold, months to come empty | best month, active days |

Under the title bar:

1. **Three tiles** with big numerals: estimated hours saved, tasks done, estimated worth in dollars. A number too wide for big numerals is shown as plain bold text in its tile.
2. **Where the time went**: one row per kind **that has a task in the stretch**, biggest first and Other last, with a coloured bar, the count and the estimated hours. A coder sees Code and Research; someone who makes videos sees Images and video and Documents. There is nothing to set: the rows follow what you did.
3. **Who did the work**: one row per model, with a bar and the count. More than five models: the rest are added up as "Others".
4. **The chart**, then one summary line.

When there is nothing in the stretch yet, the pane says so in one calm sentence: *Nothing finished yet today. Your first finished task shows up here.* On the other tabs *today* becomes *in the last 7 days*, *in the last 30 days* or *this year*.

### Narrow panes

Every row is sized to the pane's width, so nothing wraps. As the pane narrows:

- the three tiles become two, then one; the figures that lost their tile are said in one plain line under the tiles
- long labels shorten (Images and video becomes Images, Documents becomes Docs) and the hours column drops
- sentences swap for a shorter wording, and are cut with an ellipsis only as a last resort
- Month's thirty bars merge in pairs under 30 columns

### What counts as a task

One typed request that finishes with an answer is one task.

- **Counted:** a prompt you typed at the prompt, a message sent from the phone, and an upgraded prompt another mod sent as your own words (for example [`prompt-upgrade`](../prompt-upgrade) after you pressed Run).
- **Not counted:** helper agents and their steps, tool calls, cancelled or failed turns, slash commands, background notifications, scheduled prompts, other sessions' messages and `claude -p` runs.

### How a task is sorted

By the tools it used. A task is one kind. Each kind has **strong** rules and some have **weak** ones, which count only when no strong rule matched.

**Strong rules.** When a task touched several kinds, the first of these wins:

| # | Kind | What puts a task there |
| --- | --- | --- |
| 1 | Code | Writing a source or config file with `Edit`, `Write`, `MultiEdit` or `NotebookEdit` (`.ts`, `.py`, `.go`, `.rs`, `.json`, `.yml`, `.html`, `.css`, `.sql` and so on). |
| 2 | Emails | Any mail tool: Gmail, Outlook, IMAP, SMTP and the like. |
| 3 | Images and video | An image or video tool; writing an image or video file (`.png`, `.jpg`, `.svg`, `.mp4`, `.mov` and so on); or running `ffmpeg`, `magick`, `yt-dlp` and the like. |
| 4 | Documents | A document, slide, spreadsheet or PDF tool that **writes** (update, create, append, batch and so on); or writing a document file (`.md`, `.docx`, `.pdf`, `.pptx`, `.xlsx`, `.csv` and so on). |
| 5 | Research | Web search, fetching a page, reading a page in the browser, transcripts; or a document tool that only **looks something up** (`read_doc`, `query-docs`, `search_apify_docs`, `get_values`). |

**Weak rules**, tried in this order, only when no strong rule matched:

| # | Kind | What puts a task there |
| --- | --- | --- |
| 6 | Code | Running a command with `Bash` or `PowerShell` (builds, tests, git), or writing a file nothing recognised (`Makefile`, `Dockerfile`, `.env`, `.gitignore`). |
| 7 | Images and video | Only looking at an image file with `Read`: a screenshot. |
| 8 | Research | Only reading or searching your own files (`Read`, `Grep`, `Glob`), or using the browser (navigating, clicking). |
| 9 | Other | Everything else, including a task that used no tools. |

What that means in practice:

- **A source file that was written wins.** A change to code and its README is Code; code plus an email sent along the way is Code; code plus a logo written into the project is Code.
- **Commands are weak.** A web search that ran `ls` is Research. A task that read a file and then ran its tests is Code.
- **A screenshot is only a weak signal.** Reading a screenshot to debug a UI and then changing the code is Code. Reading it and nothing else is Images and video.
- **A documents tool is judged by what it does,** from its name: a lookup is Research, a write is Documents, and a name that says neither is Documents.
- **A command's own words are read** only to tell media work from the rest (`ffmpeg` is video, `git` is not). The command text is held in memory until the turn ends and is never stored.

The tools of helper agents working inside your request count toward its kind. The model that finished the turn is recorded by its short name ("Sonnet 5.5"), not its id.

Only counts are stored, not the tools, so tasks finished before these rules existed stay where they were counted (mostly Other and Research). New tasks are sorted by the rules above.

### The estimate

| Kind | Minutes saved per task |
| --- | --- |
| Emails | 10 |
| Code | 20 |
| Documents | 30 |
| Images and video | 20 |
| Research | 20 |
| Other | 10 |

Hourly rate: 50. Hours are minutes divided by 60; dollars are hours times the rate. Change any of them with `/work-report settings`; they are kept between sessions. A kind has one figure whichever rule put a task there, so Code and Research are averages: Code covers a small edit and a long session, Research a web investigation and a quick look through your files. Set them to what a typical task of that kind is worth to you (`/work-report settings code 40`).

### The streak

Days in a row with at least one task, counted back from today. A day that has not had its first task yet does not break the streak: it counts from yesterday until today has one.

## What is stored

Only counts, in the mod's own store: one small record per calendar day (`day:2026-10-13`, the count of each kind and the count per model) and one `settings` record (the rate, the minutes per kind and whether the chip shows). No prompt text, no file names and no answers are kept. Nothing is written inside the mod's folder.

A day's record is read back from the store before each task is added, so two sessions open at once do not overwrite each other's counts.

## Cost

None. The mod makes no model calls: it listens to events and counts. Recording a task shows nothing; it speaks up only when you ask for the pane and the window is too narrow to open it, or a button press fails.

## Install

From a terminal session:

```
claude plugin marketplace add afterever/claude-craftkits
claude plugin install work-report@afterever-mods
```

Restart Claude Code to apply. To try it from a checkout without installing:

```
claude --plugin-dir <path to claude-craftkits>\work-report
```

## How it is built

- **A task is claimed, not guessed.** `prompt.submit` arms a typed prompt, `turn.start` claims it by its words, and `turn.complete` records it only if the turn ended with an answer in the main loop. A turn nobody typed is never claimed, so it is never counted.
- **State** lives in the host's `$.state` (the days, the settings, the tab), so a hot reload keeps it; the days and settings are also kept in the mod's own `$.store`, across sessions. A draw only reads; every change comes from a button, a command or an event. The contract is [`types/index.d.ts`](./types/index.d.ts).
- **Days are stepped at local noon.** Adding 24 hours to midnight lands on the wrong date across a clock change; noon never does. Today, Week, Month and Year are lists of noons, and the day of the year is counted between two of them.
- **Rows are built to the width.** In a terminal the bars and the chart need whole cells, so each row is made to the width the pane reports less one cell, in a one-line box that clips rather than wraps, and the width tests below hold every row to it.
- **On the desktop the figures are drawings.** The tiles, the bars and the chart are each one SVG, because block and box-drawing characters come from whatever font the page falls back to and then do not line up. A drawing places every mark by its own coordinates: the bars start and end in the same place on every row, and the figures are right-aligned at fixed edges. The headings, rules, note and summary stay text. The terminal, which is always monospace, keeps its text rows.
- **Only the heavy box-drawing set** is used for the big numerals in a terminal; the half-line glyphs (`╺ ╸ ╻ ╹`) are missing from many fonts. The decimal point is a plain `.` on the bottom row.
- **A `/clear` is seen by its new session id.** `/clear` goes on under a new id with no `session.start`, and the command and the days in `$.state` go with the old session. The mod checks the id every 5 seconds and when a prompt is submitted, and sets the new session up when it changed. Since 0.4.2 it no longer uses the settings hook's `SessionStart` for this: a Team or Enterprise plan's built-in guard skips that event for every mod you install, which posted `work-report: its classic.SessionStart hook was skipped` at the start of every session there.
- **The command answers first.** `/work-report` returns its sentence at once and opens the pane in the background; every form of it is wrapped so a failure comes back as a plain sentence.

## Layout

```
.claude-plugin/plugin.json    name, version, state contract
hooks/hooks.json              points at register.tsx
hooks/register.tsx            events, commands, the pane and the button
hooks/view.tsx                the pane, drawn from state
hooks/layout.ts               widths, big numerals, tiles, bars, the chart's text
hooks/svg.ts                  the tiles, bars and chart as drawings, for the desktop
hooks/report.ts               totals, the estimate, the streak, chart bars, model names
hooks/dates.ts                local-noon day stepping, ranges, the day of the year
hooks/kinds.ts                sorting a task by its tools
hooks/record.ts               which prompts count, and claiming a turn
hooks/*.test.ts               kinds, typed prompts, dates, totals, layout, drawings and the full flow
types/index.d.ts              the mod's $.state contract
```

## Develop

```
claude plugin validate <path to claude-craftkits>
claude plugin test <path to claude-craftkits>\work-report
```

The tests make no model calls and cost nothing. They cover sorting a task by its tools, counting only typed prompts, the streak, adding days together, the day of the year and stepping across clock changes, each tab drawing its own title, dates and chart, the empty state, three then two then one tiles, that on the desktop the tiles, bars and chart are drawings whose rows share one start, one length and one right edge at every width, and that no row of the pane is wider than the pane at narrow and wide widths on both the terminal and the desktop.

Bump `version` in `plugin.json` when you change the mod, or installed copies will not pick the change up.

## Credits

Built as a Claude Code mod for [afterever/claude-craftkits](https://github.com/afterever/claude-craftkits).
