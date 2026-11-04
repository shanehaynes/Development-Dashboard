// @vitest-environment node
/// <reference types="node" />
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const generator = fileURLToPath(new URL('../fixtures/generate.mjs', import.meta.url))
const inherited = Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
const env = {
  ...Object.fromEntries(inherited),
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
}
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim()
const repos = ['alpha-notes', 'beta-tracker', 'gamma-site']
// Plan §2: the anchored actor tag, a box line, the stamp on a ticked human box, banned status text.
const TAG =
  /^\s*(?:[-*]|\d+\.)\s+\[[ xX-]\]\s+\*\*(Shane|Chrome)(?: \((decide|approve|device|account|verify)\))?:\*\*/
const BOX = /^\s*(?:[-*]|\d+\.) \[/
const STEP = /^(?:- |\* |\d+\. )\[[ xX-]\] \S/
const STAMP = /\(Shane \d{4}-\d\d-\d\d\)$/
const MARKER = /@\d|\((?:done|complete|shipped)|\(in progress\)|✅|\*\*Status:/i
let tmp = ''
let out = ''
let twin = ''

// Runs from the temp dir, so a relative-path bug cannot write into this repo.
function generate(dir: string, ...args: string[]) {
  const argv = [generator, '--out', dir, ...args]
  return spawnSync(process.execPath, argv, { cwd: tmp, env, encoding: 'utf8' })
}
const head = (dir: string, name: string, ref = 'main') => git(join(dir, name), 'rev-parse', ref)
const read = (...path: string[]) => readFileSync(join(out, ...path), 'utf8')
const columns = (...path: string[]) =>
  read(...path)
    .trimEnd()
    .split('\n')
    .map((row) => row.split('\t').length)
const sessionIds = (dir: string) =>
  readdirSync(join(dir, 'sessions')).map(
    (file) => JSON.parse(readFileSync(join(dir, 'sessions', file), 'utf8')).sessionId,
  )

beforeAll(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'devdash-fixtures-')))
  out = join(tmp, 'a')
  twin = join(tmp, 'b')
  for (const dir of [out, twin]) {
    const run = generate(dir, '--seed', '7')
    if (run.status !== 0) throw new Error(run.stderr)
  }
}, 60_000)

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
})

describe('fixtures/generate.mjs', () => {
  it('creates two contract repos and one without a contract', () => {
    for (const name of repos) expect(existsSync(join(out, name, '.git')), name).toBe(true)
    const marked = repos.filter((name) => existsSync(join(out, name, '.claude', 'dashboard.json')))
    expect(marked).toEqual(['alpha-notes', 'beta-tracker'])
    expect(read('gamma-site', 'STATUS.md')).toContain('\n## Pending for Shane\n')
  })

  it('writes tier-1 roadmaps in the contract grammar', () => {
    for (const name of ['alpha-notes', 'beta-tracker']) {
      const roadmap = read(name, 'docs', 'roadmap.md')
      expect(roadmap).toMatch(/^#{2,3} .+ `[a-z][a-z0-9]*(?:-[a-z0-9]+)*`$/m)
      for (const line of roadmap.split('\n')) {
        expect(line).not.toMatch(MARKER)
        if (BOX.test(line)) expect(line).toMatch(STEP)
        if (/\*\*(?:Shane|Chrome)/.test(line)) expect(line).toMatch(TAG)
        if (TAG.test(line) && /\[[xX]\]/.test(line)) expect(line).toMatch(STAMP)
      }
    }
  })

  it('gives alpha-notes one lane with an uncommitted tick', () => {
    const lanes = join(out, 'alpha-notes', '.claude', 'worktrees')
    const dirty = readdirSync(lanes).filter(
      (lane) => git(join(lanes, lane), 'status', '--porcelain', '--', 'docs/roadmap.md') !== '',
    )
    expect(dirty).toEqual(['feat-search-index'])
    const diff = git(join(lanes, dirty[0]), 'diff', '--no-color', '--', 'docs/roadmap.md')
    expect(diff).toMatch(/^\+- \[x\] /m)
  })

  it('writes a 4- and a 7-column claim and one blocked.tsv row', () => {
    expect(columns('alpha-notes', '.claude', 'state', 'claims.tsv')).toEqual([4, 7])
    expect(columns('alpha-notes', '.claude', 'state', 'blocked.tsv')).toEqual([6])
  })

  it('writes two registry entries that point into alpha-notes lanes', () => {
    const dir = join(out, 'sessions')
    const files = readdirSync(dir).filter((file) => file.endsWith('.json'))
    expect(files).toHaveLength(2)
    for (const file of files) {
      const entry = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      expect(entry.cwd.startsWith(join(out, 'alpha-notes', '.claude', 'worktrees'))).toBe(true)
    }
  })

  it('repeats itself: same seed, same commits, lane edits and session ids', () => {
    for (const name of repos) expect(head(twin, name)).toBe(head(out, name))
    const ahead = 'feat/weekly-review'
    expect(head(twin, 'alpha-notes', ahead)).toBe(head(out, 'alpha-notes', ahead))
    const lane = ['alpha-notes', '.claude', 'worktrees', 'feat-search-index', 'docs', 'roadmap.md']
    expect(readFileSync(join(twin, ...lane), 'utf8')).toBe(read(...lane))
    expect(sessionIds(twin)).toEqual(sessionIds(out))
  })

  it('writes only the fixture identity into git history and reflogs', () => {
    for (const name of repos) {
      const logs = readdirSync(join(out, name, '.git'), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.parentPath.split(sep).includes('logs'))
        .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
      expect(logs.length, name).toBeGreaterThan(0)
      for (const line of logs.join('').trimEnd().split('\n'))
        expect(line).toMatch(/^\S+ \S+ Fixture Bot <fixture@example\.invalid> \d+ \+0000(\t|$)/)
    }
  })

  it('refuses a non-empty --out, and --clean on anything but fixture output', () => {
    const mixed = join(tmp, 'mixed')
    mkdirSync(mixed)
    writeFileSync(join(mixed, 'README.txt'), read('README.txt'))
    writeFileSync(join(mixed, 'keep.txt'), 'not fixture output\n')
    expect(generate(mixed, '--clean').status).toBe(1)
    expect(existsSync(join(mixed, 'keep.txt'))).toBe(true)
    expect(generate(twin).status).toBe(1)
    expect(generate(twin, '--clean', '--seed', '7').status).toBe(0)
    expect(head(twin, 'alpha-notes')).toBe(head(out, 'alpha-notes'))
  }, 30_000)
})
