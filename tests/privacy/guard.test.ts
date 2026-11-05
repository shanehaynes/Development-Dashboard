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
  symlinkSync,
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
const OWNER = ['acme', 'corp'].join('-')
const GH_URL = ['https:', '', 'github.com', OWNER, 'tool'].join('/')
const SECRET = ['secret', 'thing'].join('-')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const MB3 = 3 * 1024 * 1024

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
function run(cwd: string, cmd: string, args: string[], extra: Extra = {}, input?: string) {
  const result = spawnSync(cmd, args, { cwd, env: withEnv(extra), encoding: 'utf8', input })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    out: `${result.stdout}${result.stderr}`,
  }
}
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim()
const guard = (cwd: string, args: string[], extra: Extra = {}, input?: string) =>
  run(cwd, process.execPath, [join(kit, 'scripts', 'privacy-guard.mjs'), ...args], extra, input)
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const flagged = (out: string, file: string, kind: string) => [
  ...new Set(
    [...out.matchAll(new RegExp(`^${escape(file)}:(\\d+): ${kind}:`, 'gm'))].map((m) =>
      Number(m[1]),
    ),
  ),
]
const short = (cwd: string, rev = 'HEAD') => git(cwd, 'rev-parse', '--short=7', rev)

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
function commit(dir: string, message: string, extra: Extra = {}) {
  git(dir, 'add', '-A')
  const result = run(dir, 'git', ['commit', '-q', '--no-verify', '-m', message], extra)
  expect(result.status, result.out).toBe(0)
  return git(dir, 'rev-parse', 'HEAD')
}
function denylist(name: string, entries: string[]) {
  const file = join(tmp, `${name}.json`)
  writeFileSync(file, JSON.stringify(entries))
  return file
}
function expectClean(result: ReturnType<typeof run>) {
  expect(result.stdout).toBe('')
  expect(result.status, result.out).toBe(0)
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
      'docs/boa….png: image: boa…',
      'notes.txt:4: denylist: sec…',
    ])
      expect(scan.stdout).toContain(hit)
    for (const whole of ['alice', 'bob', EMAIL, UUID, OWNER, SECRET, 'board'])
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

  it('catches the encoded, escaped and look-alike forms', () => {
    const encoded = ['', 'Users', 'alice', 'Developer', 'zebra'].join('-')
    const lines: [string, string][] = [
      [`id local_${UUID}`, 'uuid'],
      [`${UUID}_transcript.jsonl`, 'uuid'],
      [`~/.claude/projects/${encoded}/memory/x.md`, 'home-path'],
      [`/private/tmp/claude-501/${encoded}/scratchpad`, 'home-path'],
      [`C-${encoded}`, 'home-path'],
      [HOME_PATH.replaceAll('/', '\\/'), 'home-path'],
      [HOME_PATH.replaceAll('/', '%2F'), 'home-path'],
      [`/Volumes/Data${HOME_PATH}`, 'home-path'],
      [EMAIL.replace('@', '%40'), 'email'],
      [`https://raw.githubusercontent.com/${OWNER}/x/main/y`, 'github-owner'],
      [`https://gist.github.com/${OWNER}/abc`, 'github-owner'],
      [`https://${OWNER}.github.io/x`, 'github-owner'],
      [`https://api.github.com/repos/${OWNER}/x`, 'github-owner'],
      [`github.com%2F${OWNER}`, 'github-owner'],
      [['data:image', 'png;base64,iVBOR'].join('/'), 'image'],
      [SECRET.toUpperCase(), 'denylist'],
      ['Secret-Thing', 'denylist'],
      [`https://github.com/shanehaynes/${SECRET.toUpperCase()}`, 'denylist'],
    ]
    const fine = [
      'gpg --home-dir x and nav-home-link',
      'https://github.com/settings/tokens and https://github.com/marketplace/actions/x',
      'fetch("/users/me") and https://api.example.com/users/me',
      `x${SECRET}y and ${SECRET}s`,
    ]
    const dir = repo('forms', { 't.txt': [...lines.map(([line]) => line), ...fine].join('\n') })
    git(dir, 'add', '-A')
    const scan = guard(dir, ['--staged'])
    for (const [i, [line, kind]] of lines.entries())
      expect(flagged(scan.stdout, 't.txt', kind), line).toContain(i + 1)
    const reported = [...scan.stdout.matchAll(/^t\.txt:(\d+):/gm)].map((m) => Number(m[1]))
    expect(Math.max(...reported)).toBe(lines.length)
    expect(scan.out).not.toContain('alice')
  }, 30_000)

  it('refuses what it cannot read and scans binaries as strings', () => {
    const latin = (text: string) => Buffer.from(text, 'latin1')
    const utf16 = (text: string) => Buffer.from(text, 'utf16le')
    const dir = repo('binary', {
      'big.log': `${'x'.repeat(MB3)}\n${HOME_PATH}\n`,
      'package-lock.json': `{ "a": "${'x'.repeat(MB3)}" }\n"${HOME_PATH}"\n`,
      'fixtures/shots/huge.png': Buffer.concat([PNG, Buffer.alloc(MB3)]),
      'nul.md': Buffer.concat([Buffer.from([0]), Buffer.from(`\n${HOME_PATH}\n`)]),
      'bom16.txt': Buffer.concat([Buffer.from([0xff, 0xfe]), utf16(`a\n${HOME_PATH}\n`)]),
      'raw16.txt': utf16(`a\n${HOME_PATH}\n`),
      'data.sqlite': Buffer.concat([
        latin('SQLite format 3\0\x10\x00\x01\x01'),
        latin(`\x07\x03${SECRET}\x05${HOME_PATH}\x00${UUID}\x09${EMAIL}\x00\x00`),
      ]),
      'report.bin': `%PDF-1.7\n1 0 obj << /Title (${HOME_PATH}) >>\n`,
      shot: PNG,
      'shot.PNG.bak': PNG,
      'shot.avif': latin('\0\0\0\x1cftypavif'),
      'bundle.zip': latin('PK\x03\x04\x14\x00\x00\x00\x08\x00'),
      'fixtures/shots/meta.png': Buffer.concat([PNG, latin(`tEXtComment\0${HOME_PATH}`)]),
    })
    git(dir, 'add', '-A')
    const scan = guard(dir, ['--staged'])
    for (const hit of [
      'big.log: unscanned: over 2 MB',
      'package-lock.json:2: home-path: /Us…',
      'nul.md (binary): home-path: /Us…',
      'bom16.txt:2: home-path: /Us…',
      'raw16.txt (binary): home-path: /Us…',
      'data.sqlite (binary): denylist: sec…',
      'data.sqlite (binary): home-path: /Us…',
      'data.sqlite (binary): uuid: 3f2…',
      'data.sqlite (binary): email: jan…',
      'rep….bin: image: rep…',
      'rep….bin:2: home-path: /Us…',
      'sho…: image: sho…',
      'sho….bak: image: sho…',
      'sho….avif: image: sho…',
      'bundle.zip: unscanned: compressed archive',
      'fixtures/shots/meta.png (binary): home-path: /Us…',
    ])
      expect(scan.stdout).toContain(hit)
    expect(scan.stdout).not.toMatch(/huge|meta\.png: image/)
    expect(run(dir, 'git', ['commit', '-qm', 'binaries']).status).not.toBe(0)
    commit(dir, 'binaries')
    const tree = guard(dir, ['--all'])
    expect(tree.stdout).toContain('big.log: unscanned: over 2 MB')
    expect(tree.stdout).toContain('data.sqlite (binary): home-path: /Us…')
  }, 60_000)

  it('reports file names with control characters or invalid UTF-8, and redacts names', () => {
    const dir = repo('names', {
      [`docs/${SECRET}/readme.md`]: `${HOME_PATH}\n`,
      'clean.txt': 'clean\n',
    })
    commit(dir, 'init')
    const start = git(dir, 'rev-parse', 'HEAD')
    const blob = (text: string) =>
      execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: dir, env, input: text })
        .toString()
        .trim()
    const index = Buffer.concat([
      Buffer.from(`100644 ${blob(`${HOME_PATH}\n`)}\tnl\nname.md\0`, 'utf8'),
      Buffer.concat([
        Buffer.from(`100644 ${blob(`${EMAIL}\n`)}\tcaf`),
        Buffer.from([0xe9]),
        Buffer.from('.md\0'),
      ]),
    ])
    execFileSync('git', ['update-index', '-z', '--index-info'], { cwd: dir, env, input: index })
    const scan = guard(dir, ['--staged'])
    expect(scan.stdout).toContain('nl\\x0aname.md: bad-path: nl\\…')
    expect(scan.stdout).toContain('nl\\x0aname.md:1: home-path: /Us…')
    expect(scan.stdout).toMatch(/^caf.*\.md: bad-path: caf/m)
    expect(scan.stdout).toMatch(/^caf.*\.md:1: email: jan…/m)
    git(dir, 'commit', '-q', '--no-verify', '-m', 'names')
    const range = guard(dir, ['--range', `${start}..HEAD`])
    expect(range.stdout).toContain('nl\\x0aname.md: bad-path')
    expect(range.stdout).toMatch(/^caf.*\.md:1: email: jan…/m)
    expect(guard(dir, ['--all']).stdout).toContain('nl\\x0aname.md: bad-path')

    const history = guard(dir, ['--history', 'HEAD'])
    expect(history.stdout).toContain('docs/sec…/readme.md: denylist: sec…')
    expect(history.stdout).toContain('docs/sec…/readme.md:1: home-path: /Us…')
    expect(history.out).not.toContain(SECRET)
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
        'git@github.com:shanehaynes/assignment-tracker.git, https://shanehaynes.github.io/x',
        'apex-training, assignment-tracker, Development-Dashboard, alpha-notes, Fixture Bot',
        '~/Developer/apex-training and ~/.devdash/config.json',
        'abc 2026',
      ].join('\n'),
      'tests/ids.test.ts': `const id = '${UUID}'\n`,
      'fixtures/seed.json': `{ "sessionId": "${UUID}" }\n`,
      'fixtures/shots/board.png': PNG,
      'package-lock.json': `{ "funding": "${GH_URL}", "author": "${EMAIL}" }\n`,
      'public/font.woff2': Buffer.from(`wOF2\0\0\0\0${EMAIL}`, 'latin1'),
    })
    git(dir, 'add', '-A')
    const extra = { DEVDASH_DENYLIST_FILE: deny }
    expectClean(guard(dir, ['--staged'], extra))
    expect(run(dir, 'git', ['commit', '-qm', 'clean'], extra).status).toBe(0)
    expectClean(guard(dir, ['--all'], extra))
    expectClean(guard(dir, ['--history', 'HEAD'], extra))
  }, 30_000)

  it('--range scans messages, authors, every commit, merges and type changes', () => {
    const dir = repo('history', { 'a.txt': 'clean\n', link: 'plain\n' })
    const start = commit(dir, 'init')
    write(dir, { 'b.txt': `one\n${EMAIL}\n` })
    const leaky = short(dir, commit(dir, 'add b'))
    write(dir, { 'b.txt': 'one\n' })
    const message = short(dir, commit(dir, `fix b\n\nsee ${HOME_PATH}`))
    write(dir, { 'c.txt': 'clean\n' })
    const author = short(dir, commit(dir, 'by someone', { GIT_AUTHOR_EMAIL: EMAIL }))

    const scan = guard(dir, ['--range', `${start}..HEAD`])
    expect(scan.status).toBe(1)
    expect(scan.stdout).toContain(`commit ${message}:3: home-path: /Us…`)
    expect(scan.stdout).toMatch(new RegExp(`^b\\.txt:2: email: jan… .*in commit ${leaky}`, 'm'))
    expect(scan.stdout).toContain(`commit ${author} author: email: jan…`)

    // A merge whose resolution adds a file, then a commit that removes it.
    const base = git(dir, 'rev-parse', 'HEAD')
    git(dir, 'checkout', '-q', '-b', 'side')
    write(dir, { 's.txt': 'side\n' })
    commit(dir, 'side')
    git(dir, 'checkout', '-q', 'main')
    write(dir, { 'm.txt': 'main\n' })
    commit(dir, 'main')
    git(dir, 'merge', '-q', '--no-ff', '--no-commit', 'side')
    write(dir, { 'evil.txt': `${HOME_PATH}\n` })
    const merge = short(dir, commit(dir, 'merge side'))
    git(dir, 'rm', '-q', 'evil.txt')
    commit(dir, 'drop evil')
    expect(guard(dir, ['--range', `${base}..HEAD`]).stdout).toMatch(
      new RegExp(`^evil\\.txt:1: home-path: /Us… .*in commit ${merge}`, 'm'),
    )

    // A file turned into a symlink to a home path (status T), then back.
    const before = git(dir, 'rev-parse', 'HEAD')
    rmSync(join(dir, 'link'))
    symlinkSync(HOME_PATH, join(dir, 'link'))
    git(dir, 'add', '-A')
    expect(guard(dir, ['--staged']).stdout).toContain('link:1: home-path: /Us…')
    const typechange = short(dir, commit(dir, 'link'))
    rmSync(join(dir, 'link'))
    write(dir, { link: 'plain\n' })
    commit(dir, 'unlink')
    expect(guard(dir, ['--range', `${before}..HEAD`]).stdout).toMatch(
      new RegExp(`^link:1: home-path: /Us… .*in commit ${typechange}`, 'm'),
    )

    expectClean(guard(dir, ['--range', 'HEAD..HEAD']))
    for (const bad of [
      ['--range', 'HEAD'],
      ['--range', 'a...b'],
      ['--history'],
      ['--staged', 'x'],
      ['--bogus'],
      [],
    ])
      expect(guard(dir, bad).status).toBe(64)
    expect(guard(dir, ['--range', 'nope..HEAD']).status).toBe(2)
  }, 60_000)

  it('the pre-push hook scans new commits, tags and ref names', () => {
    const remote = join(tmp, 'remote.git')
    git(tmp, 'init', '-q', '--bare', remote)
    const dir = repo('pusher', { 'a.txt': 'clean\n' })
    commit(dir, 'init')
    git(dir, 'remote', 'add', 'origin', remote)

    // No origin/main yet: the hook scans the branch's whole history.
    git(dir, 'checkout', '-q', '-b', 'first')
    write(dir, { 'a.txt': 'first\n' })
    commit(dir, `note ${HOME_PATH}`)
    const first = run(dir, 'git', ['push', '-q', 'origin', 'first'])
    expect(first.status).not.toBe(0)
    expect(first.out).toContain('home-path: /Us…')
    git(dir, 'checkout', '-q', 'main')
    expect(run(dir, 'git', ['push', '-q', 'origin', 'main']).status).toBe(0)
    git(dir, 'fetch', '-q', 'origin')

    write(dir, { 'a.txt': 'still clean\n' })
    commit(dir, `note ${HOME_PATH}`)
    const refused = run(dir, 'git', ['push', '-q', 'origin', 'main'])
    expect(refused.status).not.toBe(0)
    expect(refused.out).toContain('home-path: /Us…')
    expect(refused.out).toContain('DEVDASH_ALLOW=1 git push')

    git(dir, 'branch', 'feat/x')
    expect(run(dir, 'git', ['push', '-q', 'origin', 'feat/x']).status).not.toBe(0)
    const allowed = run(dir, 'git', ['push', '-q', 'origin', 'main'], { DEVDASH_ALLOW: '1' })
    expect(allowed.status).toBe(0)
    expect(allowed.out).toContain('BYPASSED by DEVDASH_ALLOW=1')
    git(dir, 'fetch', '-q', 'origin')

    git(dir, 'tag', '-a', 'v1', '-m', `release ${HOME_PATH}`)
    const tag = run(dir, 'git', ['push', '-q', 'origin', 'v1'])
    expect(tag.status).not.toBe(0)
    expect(tag.out).toContain('tag object:')

    git(dir, 'branch', `feat/${SECRET}`)
    const branch = run(dir, 'git', ['push', '-q', 'origin', `feat/${SECRET}`])
    expect(branch.status).not.toBe(0)
    expect(branch.out).toContain('pushed ref names:1: denylist: sec…')
    const guardLines = branch.out.split('\n').filter((line) => !line.startsWith('error:'))
    expect(guardLines.join('\n')).not.toContain(SECRET)
  }, 60_000)

  it('--all finds nothing in this repo', () => {
    const empty = denylist('empty', [])
    expectClean(
      run(root, process.execPath, [guardSource, '--all'], { DEVDASH_DENYLIST_FILE: empty }),
    )
  }, 30_000)

  it('a single word matches only as a path or URL segment, any case; phrases match whole', () => {
    const word = ['no', 'tes'].join('')
    const capital = ['Road', 'map'].join('')
    const phrase = ['Fix', 'the', 'widget'].join(' ')
    const deny = denylist('short', [word, capital, phrase])
    const dir = repo('short', {
      'f.txt': [
        `Take ${word} here.`,
        `see ~/Developer/${word}/x`,
        `${word}/`,
        `https://github.com/shanehaynes/${word}`,
        word.toUpperCase(),
        `${word}.md and my-${word} and .${word}/x and '${word}\\n'`,
        `We ${phrase} today.`,
        `${phrase}s and ${phrase}-ish`,
        `The ${capital} says ${capital.toLowerCase()}.`,
        `Capital/${word}/ and docs/${capital}/x`,
        `we ${phrase.toLowerCase()} too`,
      ].join('\n'),
    })
    git(dir, 'add', '-A')
    const scan = guard(dir, ['--staged'], { DEVDASH_DENYLIST_FILE: deny })
    expect(flagged(scan.stdout, 'f.txt', 'denylist')).toEqual([2, 3, 4, 7, 10, 11])
  })

  it('says when the denylist is replaced or off, and honours privacyAllow', () => {
    const dir = repo('notices', { 'f.txt': `${SECRET} here\n` })
    git(dir, 'add', '-A')
    const replaced = guard(dir, ['--staged'])
    expect(replaced.stderr).toContain('denylist replaced by DEVDASH_DENYLIST_FILE (1 name)')
    expect(replaced.stderr).toContain('privacyAllow')
    const ci = guard(dir, ['--staged'], { DEVDASH_DENYLIST_FILE: null, GITHUB_ACTIONS: 'true' })
    expect(ci.stderr).toContain('no denylist under GITHUB_ACTIONS=true')
    expect(ci.status).toBe(0)

    const home = join(tmp, 'allow-home')
    write(home, {
      '.devdash/config.json': JSON.stringify({ privacyAllow: [SECRET.toUpperCase()] }),
    })
    const allowed = guard(dir, ['--staged'], { HOME: home })
    expect(allowed.stderr).toContain('(0 names)')
    expectClean(allowed)
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
    const marker = join(tmp, 'gh-called')
    const gh = (body: string) => {
      write(bin, { gh: `#!/bin/sh\ntouch '${marker}'\n${body}\n` })
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
    const scan = guard(dir, ['--staged'], extra)
    expect(flagged(scan.stdout, 'list.txt', 'denylist')).toEqual(expected)
    expect(scan.stderr).not.toContain('denylist replaced')

    const cache = join(home, '.devdash', 'cache', 'privacy-denylist.json')
    expect(JSON.parse(readFileSync(cache, 'utf8')).names).toEqual([ghPrivate])
    gh('exit 1')
    rmSync(marker)
    expect(flagged(guard(dir, ['--staged'], extra).stdout, 'list.txt', 'denylist')).toEqual(
      expected,
    )
    expect(existsSync(marker)).toBe(false)

    // A failed fetch keeps the last names and is not retried for an hour.
    const stale = JSON.parse(readFileSync(cache, 'utf8'))
    writeFileSync(cache, JSON.stringify({ ...stale, fetchedAt: '2000-01-01T00:00:00.000Z' }))
    expect(flagged(guard(dir, ['--staged'], extra).stdout, 'list.txt', 'denylist')).toEqual(
      expected,
    )
    expect(existsSync(marker)).toBe(true)
    expect(JSON.parse(readFileSync(cache, 'utf8')).failedAt).toEqual(expect.any(String))
    rmSync(marker)
    guard(dir, ['--staged'], extra)
    expect(existsSync(marker)).toBe(false)

    rmSync(cache)
    expect(flagged(guard(dir, ['--staged'], extra).stdout, 'list.txt', 'denylist')).toEqual([
      1, 2, 3, 6,
    ])
    expect(JSON.parse(readFileSync(cache, 'utf8')).names).toEqual([])
    expect(git(dir, 'status', '--porcelain', '--ignored')).toBe(before)
  }, 30_000)

  it('install-githooks.sh sets core.hooksPath in the common git dir, once, from any worktree', () => {
    const dir = repo('install', { 'a.txt': 'clean\n' })
    git(dir, 'config', '--unset', 'core.hooksPath')
    commit(dir, 'init')
    git(dir, 'worktree', 'add', '-q', join(dir, 'lane'), '-b', 'lane')
    const script = join(dir, 'lane', 'scripts', 'install-githooks.sh')
    write(join(dir, 'lane'), {
      'scripts/install-githooks.sh': readFileSync(join(root, 'scripts', 'install-githooks.sh')),
    })
    const first = run(dir, 'bash', [script])
    expect(first.status).toBe(0)
    expect(git(dir, 'config', '--get', 'core.hooksPath')).toBe('.githooks')
    const config = readFileSync(join(dir, '.git', 'config'), 'utf8')
    const second = run(dir, 'bash', [script])
    expect(second.status).toBe(0)
    expect(second.out).toBe('install-githooks: core.hooksPath is already .githooks\n')
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
