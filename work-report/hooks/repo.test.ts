import { test, expect } from 'claude-code/testing'

import { repoName } from './repo'

test('the repo is the folder that holds the shared .git, however deep the session is', () => {
  expect(repoName('E:/github/claude-mods/work-report', { top: 'E:/github/claude-mods', common: 'E:/github/claude-mods/.git' })).toBe('claude-mods')
  expect(repoName('E:\\github\\claude-mods', { top: 'E:\\github\\claude-mods', common: 'E:\\github\\claude-mods\\.git' })).toBe('claude-mods')
})

test('a worktree is its main repo: the shared .git is the main checkout\'s', () => {
  expect(repoName('E:/work/feature-x', { top: 'E:/work/feature-x', common: 'E:/github/claude-mods/.git' })).toBe('claude-mods')
})

test('a git older than 2.31 answers relative to the folder: it is read against the session\'s folder', () => {
  expect(repoName('E:/github/claude-mods/work-report/hooks', { top: 'E:/github/claude-mods', common: '../../.git' })).toBe('claude-mods')
  expect(repoName('E:/github/claude-mods', { top: 'E:/github/claude-mods', common: '.git' })).toBe('claude-mods')
})

test('a bare repo is named without its .git, and a missing .git answer falls back to the top level, then the folder', () => {
  expect(repoName('/srv/git/proj.git', { top: null, common: '/srv/git/proj.git' })).toBe('proj')
  expect(repoName('E:/a/b', { top: 'E:/a/top', common: null })).toBe('top')
  expect(repoName('C:/scratch/notes/', { top: null, common: null })).toBe('notes')
})

test('nothing to name it by is Unknown, and a very long name is cut', () => {
  expect(repoName('', { top: null, common: null })).toBe('Unknown')
  expect(repoName('/x/' + 'a'.repeat(200), { top: null, common: null })).toHaveLength(60)
})
