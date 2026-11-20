// Typed prompts found in the sessions Claude Code has saved, for a backfill.
// Pure: register.tsx reads the files and asks git for each folder's repo.

/** One prompt the person typed: the folder the session was in, when, and an id that is the same on a repeat. */
export type Found = { cwd: string; ms: number; id: string }

// Lines a person did not write, though the file marks some of them as theirs: slash commands and what runs from them
const NOT_TYPED = /^\s*<(command-name|command-message|local-command-[a-z]+|bash-input|bash-stdout|task-notification|system-reminder)[ >]/i

/**
 * The prompts the person typed in one saved session (a .jsonl file of one JSON
 * object per line). A typed prompt is a user line the file marks `human`, not
 * a tool's result, not an injected note (`isMeta`), not a helper agent's and not
 * a slash command. Helper agents, scheduled and background prompts and
 * `claude -p` runs carry another origin or none.
 */
export function humanPrompts(text: string): Found[] {
  const out: Found[] = []
  for (const line of text.split('\n')) {
    // most lines are long answers and tool output: skip them before parsing
    if (!line.includes('"human"')) continue
    let o: Record<string, unknown>
    try {
      o = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    if (o.type !== 'user' || o.isSidechain === true || o.isMeta === true || o.isCompactSummary === true) continue
    if ((o.origin as { kind?: unknown } | undefined)?.kind !== 'human') continue
    const message = o.message as { content?: unknown } | undefined
    const content = message?.content
    let words = ''
    if (typeof content === 'string') words = content
    else if (Array.isArray(content)) {
      const blocks = content as { type?: unknown; text?: unknown }[]
      if (blocks.some(b => b.type === 'tool_result')) continue
      words = blocks.map(b => (b.type === 'text' && typeof b.text === 'string' ? b.text : '')).join('')
    }
    if (words.trim() === '' || NOT_TYPED.test(words)) continue
    const ms = typeof o.timestamp === 'string' ? Date.parse(o.timestamp) : NaN
    const cwd = typeof o.cwd === 'string' ? o.cwd : ''
    const id = typeof o.promptId === 'string' ? o.promptId : typeof o.uuid === 'string' ? o.uuid : ''
    if (!Number.isFinite(ms) || cwd === '' || id === '') continue
    out.push({ cwd, ms, id })
  }
  return out
}

/** Prompts by day and repo. A prompt seen twice (the same id) counts once. */
export function bucket(found: readonly Found[], repoOf: (cwd: string) => string, dayOf: (ms: number) => string): Record<string, Record<string, number>> {
  const seen = new Set<string>()
  const days: Record<string, Record<string, number>> = {}
  for (const f of found) {
    if (seen.has(f.id)) continue
    seen.add(f.id)
    const day = dayOf(f.ms)
    const repo = repoOf(f.cwd)
    const row = (days[day] ??= {})
    row[repo] = (row[repo] ?? 0) + 1
  }
  return days
}
