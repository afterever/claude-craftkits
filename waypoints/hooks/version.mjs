// The host gives a hooks module no way to read its own manifest (not through
// "node:fs", not as a JSON import), so the pane's last row carries a copy.
// Bump it with plugin.json on every release; CI fails a pull request where the
// two differ (.github/scripts/check-versions.mjs).
export const VERSION = '2.7.0'
