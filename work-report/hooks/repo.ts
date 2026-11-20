// Which repo a prompt belongs to. The name is the folder of the repo's top
// level, worked out from what `git rev-parse` says, so a repo's worktrees and
// subfolders count as one. Pure; register.tsx runs the git calls.

/** What git said when asked from a folder: the shared `.git` folder and the top level, each null when git had no answer. */
export type GitAnswers = { common: string | null; top: string | null }

const MAX_NAME = 60

/** A path with forward slashes and no trailing slash. */
const clean = (p: string) => p.trim().replace(/\\/g, '/').replace(/\/+$/, '')

const lastPart = (p: string) => clean(p).split('/').pop() ?? ''

const isAbsolute = (p: string) => p.startsWith('/') || /^[A-Za-z]:\//.test(p)

/** `a/b/../c` is `a/c`. */
function collapse(p: string): string {
  const out: string[] = []
  for (const part of p.split('/')) {
    if (part === '..' && out.length > 1) out.pop()
    else if (part !== '.') out.push(part)
  }
  return out.join('/')
}

/**
 * The repo's name: the folder holding the shared `.git`, else the top level,
 * else the folder the session is in (not a git repo). A git older than 2.31
 * answers `--git-common-dir` relative to the folder it ran in, so a relative
 * answer is read against `root`.
 */
export function repoName(root: string, git: GitAnswers): string {
  let name = ''
  const common = git.common ? clean(git.common) : ''
  if (common !== '') {
    const abs = isAbsolute(common) ? common : collapse(`${clean(root)}/${common}`)
    const parent = abs.endsWith('/.git') ? abs.slice(0, -'/.git'.length) : abs.replace(/\.git$/, '')
    name = lastPart(parent)
  }
  if (name === '' && git.top) name = lastPart(git.top)
  if (name === '') name = lastPart(root)
  return name === '' ? 'Unknown' : name.slice(0, MAX_NAME)
}
