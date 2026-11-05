#!/usr/bin/env node
// Refuses private data in what git is about to record or publish.
//
//   node scripts/privacy-guard.mjs --staged            staged files (pre-commit hook)
//   node scripts/privacy-guard.mjs --range <a>..<b>    messages and files of every commit in a..b,
//                                                      plus changed files at b (pre-push hook, CI)
//   node scripts/privacy-guard.mjs --all               every tracked file in the work tree (the gate)
//   node scripts/privacy-guard.mjs --stdin <label>     text on stdin, e.g. a PR title and body (CI)
//
// Exit 0 clean, 1 hits, 2 could not scan, 64 usage. One line per hit:
// `where:line: KIND: tok… (why)`, the token cut to its first 3 characters.
//
// Generic checks run everywhere: home-directory paths, emails outside the allowed forms, UUIDs
// outside fixtures/ and tests/, github.com owners outside the allowlist, images outside
// fixtures/shots/. The denylist check runs only on Shane's machine: names of repos under the
// discovery roots, their origin slugs, his private GitHub repos (gh, cached 24 h in
// ~/.devdash/cache/) and session names from ~/.claude/sessions/*.json (never the .key files).
// No list is stored in the repo and none is printed. DEVDASH_DENYLIST_FILE=<JSON array>
// replaces the machine's list (tests). Writes nothing but that cache. Node builtins only.
import { execFileSync } from 'node:child_process'
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const MAX_BYTES = 2 * 1024 * 1024
const SNIFF_BYTES = 8192
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
])
const IMAGE = /\.(?:png|jpe?g|gif|webp|heic|bmp|tiff?)$/i
const SHOTS = 'fixtures/shots/'
const UUID_OK = /^(?:fixtures|tests)\//
const OWNERS = new Set(['shanehaynes', 'actions', 'github'])
const EMAILS = new Set(['noreply@anthropic.com', 'git@github.com', 'noreply@github.com'])
const PUBLIC = new Set(
  [
    'shanehaynes',
    'apex-training',
    'assignment-tracker',
    'development-dashboard',
    'alpha-notes',
    'beta-tracker',
    'gamma-site',
    'fixture bot',
  ].map((name) => name.toLowerCase()),
)

const HOME_UNIX = /(?<![\w.-])\/(?:Users|home)\/[\w.-]+/g
const HOME_WIN = /\b[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'`<>|:*?]+/gi
const EMAIL = /[\w.%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
const GITHUB = /(?<![\w.-])(?:www\.)?github\.com[/:]([A-Za-z0-9-]+)(?![\w-])/gi
const WORD = /[\w-]/

const WHY = {
  'home-path': 'absolute home-directory path',
  email: 'email outside the allowed forms',
  uuid: 'UUID-shaped id, e.g. a session id, outside fixtures/ and tests/',
  'github-owner': 'github.com owner other than shanehaynes, actions or github',
  image: 'image outside fixtures/shots/',
  denylist: "name on this machine's denylist: a private repo, an origin slug or a session name",
}

const USAGE = 'usage: privacy-guard.mjs --staged | --range <a>..<b> | --all | --stdin <label>'

class UsageError extends Error {}

function git(root, args, input) {
  return execFileSync('git', args, {
    cwd: root,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    input,
    maxBuffer: 1 << 30,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

const splitZ = (buf) => buf.toString('utf8').split('\0').filter(Boolean)
const redact = (token) => (token.length <= 3 ? token : `${token.slice(0, 3)}…`)
const isBinary = (buf) => buf.subarray(0, SNIFF_BYTES).includes(0)

// Reads `<rev>:<path>` specs in two git calls. Missing objects, submodules and blobs over
// MAX_BYTES come back as { skip }.
function readBlobs(root, specs) {
  const out = new Map()
  const usable = [...new Set(specs)].filter((spec) => !/[\r\n]/.test(spec))
  if (!usable.length) return out
  const input = `${usable.join('\n')}\n`
  const checks = git(root, ['cat-file', '--batch-check=%(objecttype) %(objectsize)'], input)
    .toString('utf8')
    .split('\n')
  const wanted = []
  usable.forEach((spec, i) => {
    const [type, size] = (checks[i] ?? '').split(' ')
    if (type !== 'blob') out.set(spec, { skip: 'not a file' })
    else if (Number(size) > MAX_BYTES) out.set(spec, { skip: 'over 2 MB' })
    else wanted.push(spec)
  })
  if (!wanted.length) return out
  const buf = git(root, ['cat-file', '--batch'], `${wanted.join('\n')}\n`)
  let pos = 0
  for (const spec of wanted) {
    const eol = buf.indexOf(10, pos)
    const size = Number(buf.toString('utf8', pos, eol).split(' ')[2])
    out.set(spec, { data: buf.subarray(eol + 1, eol + 1 + size) })
    pos = eol + 1 + size + 1
  }
  return out
}

function readWorkTree(root, path) {
  const full = join(root, path)
  let stat
  try {
    stat = lstatSync(full)
  } catch {
    return { skip: 'missing' }
  }
  if (stat.isSymbolicLink()) return { data: Buffer.from(readlinkSync(full)) }
  if (!stat.isFile()) return { skip: 'not a file' }
  if (stat.size > MAX_BYTES) return { skip: 'over 2 MB' }
  return { data: readFileSync(full) }
}

// ---- denylist -------------------------------------------------------------------------------

function isPublic(name) {
  const lower = name.toLowerCase()
  return PUBLIC.has(lower) || (lower.includes('/') && lower.split('/').every((p) => PUBLIC.has(p)))
}

// Drops entries under 4 characters, entries with no letter, and the public names. A single plain
// lowercase word matches only as a path or URL segment.
function compileDenylist(raw) {
  const seen = new Set()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const name = item.trim()
    if (name.length < 4 || !/[A-Za-z]/.test(name) || isPublic(name)) continue
    seen.add(name)
  }
  return [...seen].map((text) => ({ text, plain: /^[a-z]+$/.test(text) }))
}

function discoveryRoots(home) {
  const expand = (root) =>
    root === '~' ? home : root.startsWith('~/') ? join(home, root.slice(2)) : root
  try {
    const config = JSON.parse(readFileSync(join(home, '.devdash', 'config.json'), 'utf8'))
    const roots = Array.isArray(config.roots)
      ? config.roots.filter((r) => typeof r === 'string')
      : []
    if (roots.length) return roots.map(expand)
  } catch {
    // no config: the default root
  }
  return [join(home, 'Developer')]
}

function originUrl(repo, dotgit, stat) {
  let config = join(dotgit, 'config')
  if (stat.isFile()) {
    const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotgit, 'utf8'))
    if (!pointer) return null
    let gitdir = resolve(repo, pointer[1].trim())
    try {
      gitdir = resolve(gitdir, readFileSync(join(gitdir, 'commondir'), 'utf8').trim())
    } catch {
      // not a linked worktree
    }
    config = join(gitdir, 'config')
  }
  let inOrigin = false
  for (const raw of readFileSync(config, 'utf8').split('\n')) {
    const line = raw.trim()
    if (line.startsWith('[')) inOrigin = /^\[remote\s+"origin"\]$/.test(line)
    else if (inOrigin) {
      const url = /^url\s*=\s*(.+)$/i.exec(line)
      if (url) return url[1].trim().replace(/^"(.*)"$/, '$1')
    }
  }
  return null
}

function slugOf(url) {
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/[^/]+\/|[^@\s/]+@[^:\s/]+:)(.+?)(?:\.git)?\/?$/i.exec(url)
  const parts = m ? m[1].split('/').filter(Boolean) : []
  return parts.length >= 2 ? parts.slice(-2).join('/') : null
}

function fromRoots(home) {
  const names = []
  for (const root of discoveryRoots(home)) {
    let entries
    try {
      entries = readdirSync(root)
    } catch {
      continue
    }
    for (const name of entries) {
      const repo = join(root, name)
      const dotgit = join(repo, '.git')
      try {
        const stat = statSync(dotgit)
        names.push(name)
        const slug = slugOf(originUrl(repo, dotgit, stat) ?? '')
        if (slug) names.push(slug, slug.slice(slug.indexOf('/') + 1))
      } catch {
        // not a repo, or an unreadable config: the directory name is enough
      }
    }
  }
  return names
}

function writeCache(file, value) {
  try {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, `${JSON.stringify(value)}\n`, { mode: 0o600 })
    renameSync(tmp, file)
  } catch {
    // the cache is an optimisation
  }
}

function fromGh(home) {
  const file = join(home, '.devdash', 'cache', 'privacy-denylist.json')
  let cached = null
  try {
    cached = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(cached.names)) cached = null
  } catch {
    // no cache yet
  }
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS) return cached.names
  try {
    const out = execFileSync('gh', ['repo', 'list', '--json', 'name,isPrivate', '--limit', '200'], {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
    })
    const names = JSON.parse(out)
      .filter((repo) => repo && repo.isPrivate === true && typeof repo.name === 'string')
      .map((repo) => repo.name)
    writeCache(file, { fetchedAt: new Date().toISOString(), names })
    return names
  } catch {
    return cached ? cached.names : []
  }
}

function fromSessions(home) {
  const dir = join(home, '.claude', 'sessions')
  let files
  try {
    files = readdirSync(dir).filter((file) => file.endsWith('.json'))
  } catch {
    return []
  }
  const names = []
  for (const file of files) {
    try {
      const entry = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      if (typeof entry.name === 'string') names.push(entry.name)
    } catch {
      // a registry entry mid-write
    }
  }
  return names
}

function loadDenylist() {
  const file = process.env.DEVDASH_DENYLIST_FILE
  if (file) {
    const list = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(list)) throw new Error('DEVDASH_DENYLIST_FILE must hold a JSON array')
    return compileDenylist(list)
  }
  if (process.env.GITHUB_ACTIONS === 'true') return []
  const home = homedir()
  return compileDenylist([...fromRoots(home), ...fromGh(home), ...fromSessions(home)])
}

function leftBoundary(line, i) {
  let j = i - 1
  while (j >= 0 && line[j] === '.') j--
  return j < 0 || !WORD.test(line[j])
}

// Whole-token match: a token is a maximal run of [A-Za-z0-9_.-]; a trailing `.git` or sentence
// period does not extend it.
function denylistMatches(line, entries) {
  const found = []
  for (const { text, plain } of entries) {
    for (let i = line.indexOf(text); i !== -1; i = line.indexOf(text, i + 1)) {
      const rest = line.slice(i + text.length)
      const tail = /^(?:\.git)?\.*/.exec(rest)[0]
      if (!leftBoundary(line, i) || WORD.test(rest[tail.length] ?? '')) continue
      if (plain && line[i - 1] !== '/' && line[i - 1] !== '\\' && !/^(?:\.git)?[/\\]/.test(rest))
        continue
      found.push(text)
    }
  }
  return found
}

// ---- scanning -------------------------------------------------------------------------------

function emailAllowed(email) {
  const lower = email.toLowerCase()
  const domain = lower.slice(lower.lastIndexOf('@') + 1)
  return (
    EMAILS.has(lower) ||
    domain === 'users.noreply.github.com' ||
    /^(?:[a-z0-9-]+\.)*example\.(?:invalid|com|org|net)$/.test(domain)
  )
}

function scanLine(text, loc, path, deny, add) {
  const base = path ? path.slice(path.lastIndexOf('/') + 1) : ''
  const lockfile = LOCKFILES.has(base)
  const hit = (kind, token) => add({ loc, path, kind, token })
  for (const m of text.matchAll(HOME_UNIX)) hit('home-path', m[0])
  for (const m of text.matchAll(HOME_WIN)) hit('home-path', m[0])
  if (!lockfile) for (const m of text.matchAll(EMAIL)) if (!emailAllowed(m[0])) hit('email', m[0])
  if (!(path && UUID_OK.test(path))) for (const m of text.matchAll(UUID)) hit('uuid', m[0])
  if (!lockfile)
    for (const m of text.matchAll(GITHUB))
      if (!OWNERS.has(m[1].toLowerCase())) hit('github-owner', m[1])
  for (const token of denylistMatches(text, deny)) hit('denylist', token)
}

function scanText(text, label, path, deny, add) {
  text.split('\n').forEach((line, i) => {
    scanLine(line.endsWith('\r') ? line.slice(0, -1) : line, `${label}:${i + 1}`, path, deny, add)
  })
}

function scanPath(path, deny, add) {
  if (IMAGE.test(path) && !path.startsWith(SHOTS))
    add({ loc: path, path, kind: 'image', token: path.slice(path.lastIndexOf('/') + 1) })
  scanLine(path, path, path, deny, add)
}

function scanFile(path, blob, deny, add, skipped) {
  scanPath(path, deny, add)
  if (!blob || blob.skip) {
    if (blob?.skip === 'over 2 MB') skipped.push(path)
    return
  }
  if (!isBinary(blob.data)) scanText(blob.data.toString('utf8'), path, path, deny, add)
}

function collector() {
  const hits = []
  const keys = new Set()
  const add = (hit) => {
    const key = `${hit.loc}\0${hit.kind}\0${hit.token}`
    if (keys.has(key)) return
    keys.add(key)
    hits.push(hit)
  }
  return { hits, add }
}

function staged(root, deny, add, skipped) {
  const args = ['diff', '--cached', '--name-only', '-z', '--no-renames', '--diff-filter=ACMR']
  const paths = splitZ(git(root, args))
  const blobs = readBlobs(
    root,
    paths.map((p) => `:0:${p}`),
  )
  for (const path of paths) scanFile(path, blobs.get(`:0:${path}`), deny, add, skipped)
}

function all(root, deny, add, skipped) {
  const paths = [...new Set(splitZ(git(root, ['ls-files', '-z'])))]
  for (const path of paths) scanFile(path, readWorkTree(root, path), deny, add, skipped)
}

function range(root, spec, deny, add, skipped) {
  const m = /^([^.].*?)\.\.([^.].*)$/.exec(spec)
  if (!m || spec.includes('...')) throw new UsageError(`--range wants <a>..<b>, got '${spec}'`)
  const rev = (r) =>
    git(root, ['rev-parse', '--verify', '--quiet', `${r}^{commit}`])
      .toString()
      .trim()
  const [from, to] = [rev(m[1]), rev(m[2])]

  // Commit messages.
  const log = splitZ(git(root, ['log', '-z', '--format=%H %P%n%B', `${from}..${to}`, '--']))
  const commits = log.map((record) => {
    const eol = record.indexOf('\n')
    const [sha, ...parents] = record.slice(0, eol).split(' ').filter(Boolean)
    scanText(record.slice(eol + 1), `commit ${sha.slice(0, 7)}`, null, deny, add)
    return { sha, merge: parents.length > 1 }
  })

  // Files changed on this side of the range, at its tip.
  let base = from
  try {
    base = git(root, ['merge-base', from, to]).toString().trim()
  } catch {
    // unrelated or shallow history: diff against the range start
  }
  const diff = ['diff', '--name-only', '-z', '--no-renames', '--diff-filter=ACMR', base, to, '--']
  const tipPaths = splitZ(git(root, diff))
  const tip = readBlobs(
    root,
    tipPaths.map((p) => `${to}:${p}`),
  )
  const key = (hit) => `${hit.path}\0${hit.kind}\0${hit.token}`
  const atTip = new Set()
  const tipAdd = (hit) => {
    atTip.add(key(hit))
    add(hit)
  }
  for (const path of tipPaths) scanFile(path, tip.get(`${to}:${path}`), deny, tipAdd, skipped)

  // Every commit's files, so a leak added and removed inside the range is still caught: the
  // pushed commits stay public even when the tip is clean.
  const pairs = []
  for (const { sha, merge } of commits) {
    if (merge) continue
    const tree = ['diff-tree', '--root', '-r', '--no-commit-id', '--name-only', '-z']
    for (const path of splitZ(git(root, [...tree, '--no-renames', '--diff-filter=ACMR', sha])))
      pairs.push({ sha, path })
  }
  const history = readBlobs(
    root,
    pairs.map(({ sha, path }) => `${sha}:${path}`),
  )
  const reported = new Set()
  const historyAdd = (sha) => (hit) => {
    if (atTip.has(key(hit)) || reported.has(key(hit))) return
    reported.add(key(hit))
    add({ ...hit, commit: sha.slice(0, 7) })
  }
  for (const { sha, path } of pairs)
    scanFile(path, history.get(`${sha}:${path}`), deny, historyAdd(sha), [])
}

function stdin(label, deny, add) {
  scanText(readFileSync(0, 'utf8'), label, null, deny, add)
}

function main(argv) {
  const [mode, arg, ...extra] = argv
  const needsArg = mode === '--range' || mode === '--stdin'
  const known = ['--staged', '--all', '--range', '--stdin'].includes(mode)
  if (!known || (needsArg ? !arg || extra.length : arg !== undefined)) {
    console.error(USAGE)
    return 64
  }
  let root
  let deny
  try {
    root = mode === '--stdin' ? process.cwd() : git(process.cwd(), ['rev-parse', '--show-toplevel'])
    root = root.toString().trim()
    deny = loadDenylist()
  } catch (error) {
    console.error(`privacy-guard: could not start: ${error.message.split('\n')[0]}`)
    return 2
  }
  const { hits, add } = collector()
  const skipped = []
  try {
    if (mode === '--staged') staged(root, deny, add, skipped)
    else if (mode === '--all') all(root, deny, add, skipped)
    else if (mode === '--range') range(root, arg, deny, add, skipped)
    else stdin(arg, deny, add)
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`privacy-guard: ${error.message}\n${USAGE}`)
      return 64
    }
    const detail = (error.stderr?.toString() || error.message).trim().split('\n')[0]
    console.error(`privacy-guard: could not scan (${mode}): ${detail}`)
    return 2
  }
  for (const path of skipped) console.error(`privacy-guard: not scanned, over 2 MB: ${path}`)
  for (const { loc, kind, token, commit } of hits) {
    const where = commit ? `; in commit ${commit}, still in history` : ''
    console.log(`${loc}: ${kind}: ${redact(token)} (${WHY[kind]}${where})`)
  }
  if (!hits.length) return 0
  const denylist = deny.length
    ? `denylist: ${deny.length} name${deny.length === 1 ? '' : 's'}`
    : 'no denylist'
  console.error(
    `privacy-guard: ${hits.length} hit${hits.length === 1 ? '' : 's'} (${mode}; ${denylist}). ` +
      'Remove each before it reaches a public commit; a pushed commit cannot be unpublished.',
  )
  return 1
}

process.exitCode = main(process.argv.slice(2))
