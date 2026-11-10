# prompt-upgrade

A Claude Code mod that turns a rough prompt into a great one **before it is sent**. `/prompt-upgrade` opens a pane, asks up to three quick multiple-choice questions, rewrites your prompt and shows your original and the upgrade side by side. **Nothing runs until you press Run.**

> **Credit.** The idea, and the Prompt Upgrade spec this mod was built from, come from the original author at **https://tristenobrien.ai/** ([AI Made Easy](https://tristenobrien.ai/)). This is an implementation of that idea as a Claude Code mod; any faults in it are this repo's.

## Use it

| Command | What it does |
| --- | --- |
| `/prompt-upgrade <rough prompt>` | Upgrades that prompt. |
| `/prompt-upgrade` | Opens a box in the pane to type one. |
| `/prompt-upgrade on` / `/prompt-upgrade off` | Turns automatic mode on or off. It starts off, and is remembered between sessions. |
| `/prompt-upgrade history` | Shows your last 20 upgrades. Click one to reopen its review. |
| `/prompt-upgrade help` | One line of usage. |

### The four steps

A tracker across the top shows where you are: finished steps get a green check, the current one is gold, the rest are muted.

1. **Your prompt.** It is shown in a frame while a fast model (`haiku`) picks the questions that would most improve the result.
2. **Questions.** Up to three, each with two to four short options, an **Other (type it)** chip and a quiet **Skip**. A gold badge becomes a green check when a question is answered. **Skip the rest, upgrade now** goes straight on. If no question would help, this step is skipped.
3. **Rewrite.** A second call (`sonnet`) writes the upgraded prompt from what you answered, and lists what it added.
4. **Review.** One line of numbers (words before, words after, details added), then **Run it**, **Edit**, **Copy**, **Cancel**, then what was added, then your prompt on the left and the upgrade on the right with a gold outline. The buttons stay above the cards, so a long rewrite never pushes them off screen.

### What the rewrite does

- Keeps exactly what you meant.
- Adds a clear goal, who it is for, the format, and what "done" looks like, where your prompt or answers support it.
- Uses what you answered and leaves out what you skipped.
- Never invents facts, names, numbers or prices: where something is unknown it leaves a `[placeholder]`.
- Writes it as one request you could have typed yourself, in plain language.

### Automatic mode

With `/prompt-upgrade on`, a prompt you type goes to the pane first instead of being sent. These go straight through untouched:

- slash commands
- prompts with an image or other file attached, and prompts that mention a file with `@`
- messages you send while Claude is working
- short replies such as "yes", "keep going" or "2"
- anything starting with `>`: the `>` is stripped and the rest is sent as it is

The upgrade is sent by the mod itself, and the mod never holds a prompt that did not come from your own Enter, so an upgrade can never loop back into the pane.

### Nothing is lost

- **Cancel**, **Esc** and the pane's close mark all close the pane and put your original back in the prompt box.
- If a model call fails you get a calm card that says your prompt is safe, with **Try again**, **Send my original** and **Cancel**.
- If the pane cannot open because the window is too narrow, your words go back in the prompt box and one line says so.
- If the mod is reloaded in the middle of a step, the step is picked up again instead of leaving the pane stuck.
- If anything fails inside automatic mode, your prompt goes through untouched.
- **Edit** lets you change the upgraded text; Enter runs it.

## Cost

Each upgrade makes up to two model calls on your account: one short `haiku` call for the questions and one `sonnet` call for the rewrite. In automatic mode that is every prompt that is not on the list above, which is why it starts off. The two models are the constants `QUESTION_MODEL` and `REWRITE_MODEL` at the top of `hooks/logic.ts`.

## Install

From a terminal session:

```
claude plugin marketplace add afterever/claude-craftkits
claude plugin install prompt-upgrade@afterever-mods
```

Restart Claude Code to apply. To try it from a checkout without installing:

```
claude --plugin-dir <path to claude-craftkits>\prompt-upgrade
```

## How it is built

- **State** lives in the host's `$.state` (the open upgrade, the view, automatic mode, the history), so a hot reload keeps it. Automatic mode and the history are also kept in the mod's own `$.store`, across sessions. A draw only reads; every change comes from a button, a command or an event. The contract is [`types/index.d.ts`](./types/index.d.ts).
- **Model calls** carry the upgrade's id and a step number, so a late answer after Cancel, a retry or a reload is dropped rather than undoing what you did since.
- **Nothing is given a width in cells.** The pane reports how wide it thinks it is, but the row a surface actually lays out in can be narrower, which cut off titles and numbers. Rules are a long run of glyphs in a box that clips it, text wraps where the surface wraps, and the reported width only chooses between a roomy shape and a tight one (cards side by side from 60 columns, stacked under it).
- **The three numbers** are one vector drawing on the desktop app and the editor, because box-drawing characters do not line up in every font. In a terminal, which is always monospace, they are three rows tall in heavy box-drawing characters inside rounded tiles.
- **Only the heavy box-drawing set** is used for those characters; the half-line glyphs (`╺ ╸ ╻ ╹`) are missing from many fonts.

## Layout

```
.claude-plugin/plugin.json    name, version, state contract
hooks/hooks.json              points at register.tsx
hooks/register.tsx            the mod: commands, automatic mode, model calls, state, resume
hooks/view.tsx                the screens, drawn from state
hooks/logic.ts                what is held, how the model's answers are read, what it is asked
hooks/layout.ts               widths, the tracker, big numbers, the shape choices
hooks/svg.ts                  the three numbers as one drawing, for the desktop
hooks/*.test.ts               logic, layout, svg and the full flow
types/index.d.ts              the mod's $.state contract
```

## Develop

```
claude plugin validate <path to claude-craftkits>
claude plugin test <path to claude-craftkits>\prompt-upgrade
```

The tests stub the model, so running them costs nothing. They cover which prompts are held and which pass through, reading the questions and the rewrite, the whole flow from `/prompt-upgrade` to Run, Cancel putting the prompt back, the on and off switch, a failed call, a reload mid-step, the history, and that no row of the pane is wider than the pane at narrow and wide widths on both the terminal and the desktop.

Bump `version` in `plugin.json` when you change the mod, or installed copies will not pick the change up.

## Credits

- The idea and the spec: the author of [AI Made Easy](https://tristenobrien.ai/), https://tristenobrien.ai/.
- Built as a Claude Code mod for [afterever/claude-craftkits](https://github.com/afterever/claude-craftkits).
