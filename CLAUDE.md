# claude-craftkits

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
- **Tag the squash-merge commit on `master`**, after the version bump has merged
  (`git tag <mod>-v<version> <merge sha>`, `git push origin <tag>`, then
  `gh release create <tag> --verify-tag`). Never tag a branch or an earlier commit: the npm
  package is built from the tag, so it would differ from what the marketplace serves.

### Two separate paths: the marketplace and npm

- **The marketplace is released by the merge to `master`, not by the tag.** Its entries use
  relative `./<mod>` paths, so Claude Code reads the mod from `master`; machines get it on
  `claude plugin marketplace update afterever-mods`.
- **npm is released by pushing the tag.** `.github/workflows/publish-npm.yml` publishes
  `@afterever/<mod>@<version>` with provenance. A failed publish does not block the release
  or the marketplace.
- **The tag's version must equal the mod's `plugin.json` version.** The workflow refuses a
  mismatch and publishes nothing, so bump `plugin.json` (and the version row) first.
- **After every release, check the "Publish to npm" run is green** in the Actions tab (the
  registry can take a few minutes to show the version; each package also lists a `0.0.0-stage`
  stub that npm created at its first publish, which is harmless: leave it). To retry one:
  `gh workflow run publish-npm.yml -f tag=<tag>`.
- **No token is stored anywhere.** Each package lists `publish-npm.yml` as a trusted publisher
  on npmjs.com (user `afterever`, repository `claude-craftkits`, no environment). Never rename
  that file: all seven packages would stop accepting the publish and each needs
  `npm trust github` again. Do not add an `NPM_TOKEN` back.
- **A brand-new mod's first publish is manual**, because a trusted publisher can only be set on
  a package that already exists. Stage it with
  `node .github/scripts/build-npm-package.mjs <mod> <dir>`, then the person runs
  `npm publish --access public` from that folder, and then
  `npm trust github @afterever/<mod> --file publish-npm.yml --repo afterever/claude-craftkits --allow-publish`
  in their own terminal (it needs 2FA and npm 11.15+; Claude cannot answer the prompt). After
  that, tags publish it. Also add the mod to the test matrix in `.github/workflows/ci.yml`.
- **No mod folder holds a `package.json`**: the package is built at publish time from
  `plugin.json` by `.github/scripts/build-npm-package.mjs`, which also leaves tests out.

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
