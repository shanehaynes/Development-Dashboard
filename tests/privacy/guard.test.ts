// @vitest-environment node
/// <reference types="node" />
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const guardSource = join(root, 'scripts', 'privacy-guard.mjs')

// Planted values are assembled at run time, so this file itself stays clean under `--all` and
// cannot collide with a name on the machine's denylist.
const HOME_PATH = ['', 'Users', 'alice', 'code', 'x.ts'].join('/')
const WIN_PATH = ['C:', 'Users', 'bob', 'x'].join('\\')
const EMAIL = ['jane.doe', 'corp.test'].join('@')
const UUID = '3f2b8c1e-5d4a-4c3b-9a2e-1f0e9d8c7b6a'
const GH_URL = ['https:', '', 'github.com', 'acme-corp', 'tool'].join('/')
const SECRET = ['secret', 'thing'].join('-')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

let tmp = ''
let kit = ''
let env: NodeJS.ProcessEnv = {}

type Files = Record<string, string | Buffer>
type Extra = Record<string, string | null>

function withEnv(extra: Extra = {}) {
  const next = { ...env }
  for (const [key, value] of Object.entries(extra)) {
    if (value === null) delete next[key]
    else next[key] = value
  }
  return next
}
function run(cwd: string, cmd: string, args: string[], extra: Extra = {}) {
  const result = spawnSync(cmd, args, { cwd, env: withEnv(extra), encoding: 'utf8' })
  return { status: result.status, out: `${result.stdout}${result.stderr}` }
}
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim()
const guard = (cwd: string, args: string[], extra: Extra = {}) =>
  run(cwd, process.execPath, [join(kit, 'scripts', 'privacy-guard.mjs'), ...args], extra)
const flagged = (out: string, file: string, kind: string) => [
  ...new Set(
    [...out.matchAll(new RegExp(`^${file}:(\\d+): ${kind}:`, 'gm'))].map((m) => Number(m[1])),
  ),
]

function write(dir: string, files: Files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
}
function repo(name: string, files: Files = {}) {
  const dir = join(tmp, name)
  mkdirSync(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'core.hooksPath', join(kit, '.githooks'))
  write(dir, files)
  return dir
}
function denylist(name: string, entries: string[]) {
  const file = join(tmp, `${name}.json`)
  writeFileSync(file, JSON.stringify(entries))
  return file
}

beforeAll(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'devdash-privacy-')))
  kit = join(tmp, 'kit')
  cpSync(join(root, '.githooks'), join(kit, '.githooks'), { recursive: true })
  mkdirSync(join(kit, 'scripts'))
  cpSync(guardSource, join(kit, 'scripts', 'privacy-guard.mjs'))
  for (const hook of ['pre-commit', 'pre-push']) chmodSync(join(kit, '.githooks', hook), 0o755)
  mkdirSync(join(tmp, 'home'))
  const inherited = Object.entries(process.env).filter(
    ([key]) => !key.startsWith('GIT_') && !key.startsWith('DEVDASH_') && key !== 'GITHUB_ACTIONS',
  )
  env = {
    ...Object.fromEntries(inherited),
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Fixture Bot',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture Bot',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    HOME: join(tmp, 'home'),
    DEVDASH_DENYLIST_FILE: denylist('default', [SECRET]),
  }
})

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
})

describe('scripts/privacy-guard.mjs', () => {
  it('reports each kind of hit at file:line, redacted, and the pre-commit hook refuses it', () => {
    const dir = repo('leaks', {
      'src/a.ts': `export const ok = 1\nexport const p = '${HOME_PATH}'\n`,
      'src/win.ts': `// ${WIN_PATH}\n`,
      'docs/b.md': `# B\n\nmail ${EMAIL}\n`,
      'src/c.json': `{ "id": "${UUID}" }\n`,
      'README.md': `# R\n${GH_URL}\n`,
      'docs/board.png': PNG,
      'notes.txt': `a\nb\nc\nsee ${SECRET} later\n`,
    })
    git(dir, 'add', '-A')
    const scan = guard(dir, ['--staged'])
    expect(scan.status).toBe(1)
    for (const hit of [
      'src/a.ts:2: home-path: /Us…',
      'src/win.ts:1: home-path: C:\\…',
      'docs/b.md:3: email: jan…',
      'src/c.json:1: uuid: 3f2…',
      'README.md:2: github-owner: acm…',
      'docs/board.png: image: boa…',
      'notes.txt:4: denylist: sec…',
    ])
      expect(scan.out).toContain(hit)
    for (const whole of ['alice', 'bob', EMAIL, UUID, 'acme-corp', SECRET])
      expect(scan.out).not.toContain(whole)

    const refused = run(dir, 'git', ['commit', '-qm', 'leak'])
    expect(refused.status).not.toBe(0)
    expect(refused.out).toContain('DEVDASH_ALLOW=1 git commit')
    expect(run(dir, 'git', ['rev-parse', '--verify', '--quiet', 'HEAD']).status).not.toBe(0)

    const allowed = run(dir, 'git', ['commit', '-qm', 'leak'], { DEVDASH_ALLOW: '1' })
    expect(allowed.status).toBe(0)
    expect(allowed.out).toContain('BYPASSED by DEVDASH_ALLOW=1')
    expect(git(dir, 'log', '--format=%s')).toBe('leak')
  }, 30_000)

  it('passes the allowed forms, and drops public names and short entries from the denylist', () => {
    const deny = denylist('public', [
      'apex-training',
      'Development-Dashboard',
      'shanehaynes/apex-training',
      'alpha-notes',
      'abc',
      '2026',
    ])
    const dir = repo('allowed', {
      'docs/ok.md': [
        'Co-Authored-By: Claude <noreply@anthropic.com>',
        '12345+someone@users.noreply.github.com, fixture@example.invalid, a@example.com',
        'b@mail.example.org and c@example.net',
        'https://github.com/shanehaynes/apex-training, https://github.com/actions/checkout',
        'git@github.com:shanehaynes/assignment-tracker.git',
        'apex-training, assignment-tracker, Development-Dashboard, alpha-notes, Fixture Bot',
        '~/Developer/apex-training and ~/.devdash/config.json',
        'abc 2026',
      ].join('\n'),
      'tests/ids.test.ts': `const id = '${UUID}'\n`,
      'fixtures/seed.json': `{ "sessionId": "${UUID}" }\n`,
      'fixtures/shots/board.png': PNG,
      'package-lock.json': `{ "funding": "${GH_URL}", "author": "${EMAIL}" }\n`,
    })
    git(dir, 'add', '-A')
    const extra = { DEVDASH_DENYLIST_FILE: deny }
    expect(guard(dir, ['--staged'], extra)).toEqual({ status: 0, out: '' })
    expect(run(dir, 'git', ['commit', '-qm', 'clean'], extra).status).toBe(0)
    expect(guard(dir, ['--all'], extra)).toEqual({ status: 0, out: '' })
  }, 30_000)

  it('--range scans commit messages and every commit, not only the tip', () => {
    const dir = repo('history', { 'a.txt': 'clean\n' })
    git(dir, 'add', '-A')
    git(dir, 'commit', '-qm', 'init')
    const start = git(dir, 'rev-parse', 'HEAD')
    write(dir, { 'b.txt': `one\n${EMAIL}\n` })
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '--no-verify', '-m', 'add b')
    const leaky = git(dir, 'rev-parse', '--short=7', 'HEAD')
    write(dir, { 'b.txt': 'one\n' })
    git(dir, 'add', '-A')
    git(dir, 'commit', '-qm', `fix b\n\nsee ${HOME_PATH}`)
    const message = git(dir, 'rev-parse', '--short=7', 'HEAD')

    const scan = guard(dir, ['--range', `${start}..HEAD`])
    expect(scan.status).toBe(1)
    expect(scan.out).toContain(`commit ${message}:3: home-path: /Us…`)
    expect(scan.out).toMatch(new RegExp(`^b\\.txt:2: email: jan… .*in commit ${leaky}`, 'm'))
    expect(guard(dir, ['--range', 'HEAD..HEAD']).status).toBe(0)
    for (const bad of [
      ['--range', 'HEAD'],
      ['--range', 'a...b'],
      ['--staged', 'x'],
      ['--bogus'],
      [],
    ])
      expect(guard(dir, bad).status).toBe(64)
    expect(guard(dir, ['--range', 'nope..HEAD']).status).toBe(2)
  }, 30_000)

  it('the pre-push hook scans new commits, falls back to origin/main for a new branch', () => {
    const remote = join(tmp, 'remote.git')
    git(tmp, 'init', '-q', '--bare', remote)
    const dir = repo('pusher', { 'a.txt': 'clean\n' })
    git(dir, 'add', '-A')
    git(dir, 'commit', '-qm', 'init')
    git(dir, 'remote', 'add', 'origin', remote)
    expect(run(dir, 'git', ['push', '-q', 'origin', 'main']).status).toBe(0)

    write(dir, { 'a.txt': 'still clean\n' })
    git(dir, 'commit', '-qam', `note ${HOME_PATH}`)
    const refused = run(dir, 'git', ['push', '-q', 'origin', 'main'])
    expect(refused.status).not.toBe(0)
    expect(refused.out).toContain('home-path: /Us…')
    expect(refused.out).toContain('DEVDASH_ALLOW=1 git push')

    git(dir, 'branch', 'feat/x')
    expect(run(dir, 'git', ['push', '-q', 'origin', 'feat/x']).status).not.toBe(0)
    const allowed = run(dir, 'git', ['push', '-q', 'origin', 'main'], { DEVDASH_ALLOW: '1' })
    expect(allowed.status).toBe(0)
    expect(allowed.out).toContain('BYPASSED by DEVDASH_ALLOW=1')
  }, 30_000)

  it('--all finds nothing in this repo', () => {
    const empty = denylist('empty', [])
    const scan = run(root, process.execPath, [guardSource, '--all'], {
      DEVDASH_DENYLIST_FILE: empty,
    })
    expect(scan).toEqual({ status: 0, out: '' })
  }, 30_000)

  it('a plain lowercase entry matches only as a path or URL segment; phrases match whole', () => {
    const word = ['no', 'tes'].join('')
    const phrase = ['Fix', 'the', 'widget'].join(' ')
    const deny = denylist('short', [word, phrase])
    const dir = repo('short', {
      'f.txt': [
        `Take ${word} here.`,
        `see ~/Developer/${word}/x`,
        `${word}/`,
        `https://github.com/shanehaynes/${word}`,
        word.toUpperCase(),
        `${word}.md and my-${word}`,
        `We ${phrase} today.`,
        `${phrase}s and ${phrase}-ish`,
      ].join('\n'),
    })
    git(dir, 'add', '-A')
    const scan = guard(dir, ['--staged'], { DEVDASH_DENYLIST_FILE: deny })
    expect(flagged(scan.out, 'f.txt', 'denylist')).toEqual([2, 3, 4, 7])
  })

  it('builds the denylist from roots, origin slugs, private gh repos and session names', () => {
    const home = join(tmp, 'machine-home')
    const bin = join(tmp, 'bin')
    const name = (...parts: string[]) => parts.join('-')
    const dirName = name('private', 'proj')
    const remoteName = name('private', 'remote')
    const ghPrivate = name('gh', 'private', 'repo')
    const ghPublic = name('gh', 'public', 'repo')
    const session = name('quiet', 'falcon', 'session')
    const keyName = name('key', 'file', 'name')
    const origin = `${['git', 'github.com'].join('@')}:someorg/${remoteName}.git`
    write(home, {
      [`Developer/${dirName}/.git/config`]: `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${origin}\n`,
      'Developer/apex-training/.git/config': '[core]\n',
      'Developer/loose-folder/readme.txt': 'not a repo\n',
      '.claude/sessions/101.json': JSON.stringify({ pid: 101, name: session }),
      '.claude/sessions/101.abc.key': JSON.stringify({ name: keyName }),
    })
    const listing = [
      { name: ghPrivate, isPrivate: true },
      { name: ghPublic, isPrivate: false },
    ]
    const gh = (body: string) => {
      write(bin, { gh: `#!/bin/sh\n${body}\n` })
      chmodSync(join(bin, 'gh'), 0o755)
    }
    gh(`echo '${JSON.stringify(listing)}'`)
    const extra = {
      HOME: home,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      DEVDASH_DENYLIST_FILE: null,
    }
    const dir = repo('machine', {
      'list.txt': [
        `${dirName} here`,
        `${remoteName} here`,
        `someorg/${remoteName}`,
        `${ghPrivate} here`,
        `${ghPublic} here`,
        `${session} here`,
        `${keyName} here`,
        'apex-training here',
        'loose-folder here',
      ].join('\n'),
    })
    git(dir, 'add', '-A')
    const before = git(dir, 'status', '--porcelain', '--ignored')
    const expected = [1, 2, 3, 4, 6]
    expect(flagged(guard(dir, ['--staged'], extra).out, 'list.txt', 'denylist')).toEqual(expected)

    const cache = join(home, '.devdash', 'cache', 'privacy-denylist.json')
    expect(JSON.parse(readFileSync(cache, 'utf8')).names).toEqual([ghPrivate])
    gh('exit 1')
    expect(flagged(guard(dir, ['--staged'], extra).out, 'list.txt', 'denylist')).toEqual(expected)
    rmSync(cache)
    expect(flagged(guard(dir, ['--staged'], extra).out, 'list.txt', 'denylist')).toEqual([
      1, 2, 3, 6,
    ])
    expect(existsSync(cache)).toBe(false)
    expect(git(dir, 'status', '--porcelain', '--ignored')).toBe(before)
  }, 30_000)

  it('install-githooks.sh sets core.hooksPath in the common git dir, once, from any worktree', () => {
    const dir = repo('install', { 'a.txt': 'clean\n' })
    git(dir, 'config', '--unset', 'core.hooksPath')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-qm', 'init')
    git(dir, 'worktree', 'add', '-q', join(dir, 'lane'), '-b', 'lane')
    const script = join(dir, 'lane', 'scripts', 'install-githooks.sh')
    write(join(dir, 'lane'), {
      'scripts/install-githooks.sh': readFileSync(join(root, 'scripts', 'install-githooks.sh')),
    })
    const first = run(dir, 'bash', [script])
    expect(first.status).toBe(0)
    expect(git(dir, 'config', '--get', 'core.hooksPath')).toBe('.githooks')
    const config = readFileSync(join(dir, '.git', 'config'), 'utf8')
    expect(run(dir, 'bash', [script])).toEqual({
      status: 0,
      out: 'install-githooks: core.hooksPath is already .githooks\n',
    })
    expect(readFileSync(join(dir, '.git', 'config'), 'utf8')).toBe(config)
  }, 30_000)

  it('uses only long-standing Node builtins and Bash 3.2 syntax', () => {
    expect(run(root, process.execPath, ['--check', guardSource]).status).toBe(0)
    const source = readFileSync(guardSource, 'utf8')
    const imports = new Set([...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]))
    expect(imports).toEqual(new Set(['node:child_process', 'node:fs', 'node:os', 'node:path']))
    // JS and Node APIs added in Node 22 or later, a superset of what Node 24 lacks.
    const recent =
      /\b(?:Temporal|RegExp\.escape|Math\.sumPrecise|getOrInsert|fromBase64|toBase64|fromHex|toHex|Iterator\.concat|Error\.isError|Object\.groupBy|Map\.groupBy|Array\.fromAsync|Promise\.try|isSubsetOf|symmetricDifference|parentPath|globSync|styleText|node:sqlite|import\.meta\.dirname|import\.meta\.filename)\b/
    expect(source).not.toMatch(recent)
    const shell = ['.githooks/pre-commit', '.githooks/pre-push', 'scripts/install-githooks.sh']
    for (const file of shell) {
      const text = readFileSync(join(root, file), 'utf8')
      expect(text, file).not.toMatch(/\bmapfile\b|\breadarray\b|declare -A|\$\{\w+(?:,,|\^\^)\}/)
      expect(run(root, 'bash', ['-n', join(root, file)]).status, file).toBe(0)
    }
  })
})
