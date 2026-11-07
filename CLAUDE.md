# claude-mods

## Git workflow

- **Small or documentation-only changes go straight to `master`:** commit and push, no feature
  branch and no pull request. Examples: edits to `SETUP.md`, a README, or any other prose.
- **Use a branch and a pull request for anything larger:** a new mod, a new version of a mod, or
  any change to a mod's code under `hooks/`. This is how `subagent-progress` 2.0.0 and
  `prompt-upgrade` 0.1.0 landed.
- **If unsure which one it is, treat it as larger** and use a branch.
- **A pull request must pass CI to merge:** `.github/workflows/ci.yml` validates the manifests
  and runs every mod's tests. Nobody can force-push to or delete `master`; only the repo admin
  can skip the CI requirement, which is what lets a prose commit go straight to `master`.
- **Once a pull request is ready, merge and release it without asking:** squash-merge it after CI
  passes, tag and publish the release, then update the mod locally. The person always tests the
  new code afterwards in a fresh Claude session, so there is no need to hold the merge for a live
  check; a problem found there becomes the next version.

## Releases

- **Tag a release `<mod>-v<version>`** (for example `waypoints-v2.7.3`).
- **Title it `<mod> <version>` and nothing else** (`waypoints 2.7.3`), never with a summary after
  it. The summary of the change goes in the release body, which then points to the README's
  "What changed in <version>" section.

## Version rows

- **Every mod with a pane ends it with a dim row, `<mod> v<version>`**, read from `VERSION` in
  `hooks/version.ts` (`version.mjs` for waypoints). A hooks module cannot read its own
  `plugin.json`, so that constant is a copy: bump both on every release. CI's
  `.github/scripts/check-versions.mjs` fails a pull request where they differ, and runs by hand
  with `node .github/scripts/check-versions.mjs`. There is no release date in the row.
- **A new mod with a pane gets the same row and a `version.ts`**, or the check skips it.

## Mods that draw in the band

- **A band (`AbovePrompt`) hook draws its own rows first and `await next(e)` after them**
  (`[mine, below]`, never `[below, mine]`). The band is shared, and no API orders the plugins'
  hooks, so this habit is the only thing that keeps one mod's row from landing under another's.
  See "Staying the band's last row" in `arsenal/DESIGN.md`. (`arsenal`'s launcher no longer draws
  in the band: since 0.3.0 it is in the prompt footer, `SessionMode`.)
