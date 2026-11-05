#!/usr/bin/env node
// Refuses private data in what git is about to record or publish.
//
//   node scripts/privacy-guard.mjs --staged          staged files (pre-commit hook)
//   node scripts/privacy-guard.mjs --range <a>..<b>  every commit in a..b (message, author, committer,
//                                                    changed files) and the changed files at b
//   node scripts/privacy-guard.mjs --history <rev>   the same for every commit reachable from <rev>
//   node scripts/privacy-guard.mjs --all             every tracked file in the work tree (the gate)
//   node scripts/privacy-guard.mjs --stdin <label>   text on stdin: a PR title and body, a tag, ref names
//
// Exit 0 clean, 1 hits, 2 could not scan, 64 usage. One line per hit:
// `where:line: KIND: tok… (why)`. Tokens, and hits inside a file name, are cut to 3 characters.
//
// Generic checks run everywhere: home-directory paths (also JSON-escaped, URL-encoded and in
// Claude's `-Users-<name>-…` folder names), emails outside the allowed forms, UUIDs outside
// fixtures/ and tests/, GitHub owners outside the allowlist, images, video and PDFs outside
// fixtures/shots/ (by extension or by content), file names with control characters or invalid
// UTF-8, and content the guard cannot read: files over 2 MB (lockfiles are read whole) and
// compressed archives. Other binaries are scanned as strings. Content under fixtures/shots/ is
// trusted: only its text and metadata are checked.
//
// The denylist check runs only on Shane's machine: names of repos under the discovery roots, their
// origin slugs, his private GitHub repos (gh, cached 24 h in ~/.devdash/cache/) and session names
// from ~/.claude/sessions/*.json (never the .key files), minus `privacyAllow` in
// ~/.devdash/config.json. No list is stored in the repo and none is printed.
// DEVDASH_DENYLIST_FILE=<JSON array> replaces the machine's list (tests) and says so on stderr.
// Writes nothing but that cache. Node builtins only.
import { execFileSync } from 'node:child_process'
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const MAX_BYTES = 2 * 1024 * 1024
const SNIFF_BYTES = 8192
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const RETRY_MS = 60 * 60 * 1000
const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
])
const MEDIA_EXT = /\.(?:png|jpe?g|gif|webp|heic|heif|avif|bmp|tiff?|ico|pdf|mov|mp4|m4v|webm)$/i
const SHOTS = 'fixtures/shots/'
const UUID_OK = /^(?:fixtures|tests)\//
// Owners, and GitHub's own first path segments that are not owners.
const OWNERS = new Set([
  'shanehaynes',
  'actions',
  'github',
  'about',
  'apps',
  'collections',
  'contact',
  'customer-stories',
  'enterprise',
  'explore',
  'features',
  'issues',
  'login',
  'marketplace',
  'new',
  'notifications',
  'orgs',
  'pricing',
  'pulls',
  'search',
  'security',
  'settings',
  'site',
  'sponsors',
  'topics',
  'trending',
  'users',
])
const EMAILS = new Set(['noreply@anthropic.com', 'git@github.com', 'noreply@github.com'])
const PUBLIC = new Set([
  'shanehaynes',
  'apex-training',
  'assignment-tracker',
  'development-dashboard',
  'alpha-notes',
  'beta-tracker',
  'gamma-site',
  'fixture bot',
])

const SEP = String.raw`(?:/|\\/|%2[Ff])`
const HOME = [
  new RegExp(String.raw`${SEP}Users${SEP}[\w.-]+|(?<![\w.-])${SEP}home${SEP}[\w.-]+`, 'g'),
  /\b[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'`<>|:*?]+/gi,
  // Claude's encoded folder names: ~/.claude/projects/-Users-<name>-…, C--Users-<name>-…
  /(?<![\w.-])(?:[A-Za-z]-)?-(?:Users|home)-[A-Za-z0-9][\w.-]*/g,
]
const EMAIL =
  /(?<![\w.%+-])[\w.%+-]{1,64}(?:@|%40)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g
const UUID =
  /(?<![0-9A-Fa-f])[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?![0-9A-Fa-f])/gi
const GITHUB = [
  /(?<![\w.-])(?:www\.|gist\.)?github\.com(?:[/:]|%2[Ff])(?:(?:orgs|sponsors|users)\/)?([A-Za-z0-9-]+)(?![\w-])/gi,
  /(?<![\w.-])raw\.githubusercontent\.com\/([A-Za-z0-9-]+)/gi,
  /(?<![\w.-])api\.github\.com\/(?:repos|users|orgs)\/([A-Za-z0-9-]+)/gi,
  /(?<![\w.-])([A-Za-z0-9-]+)\.github\.io\b/gi,
]
const DATA_IMAGE = /data:image\/(?!svg)[\w.+-]+[;,]/gi
const WORD = /[\w-]/

const WHY = {
  'home-path': 'home-directory path',
  email: 'email outside the allowed forms',
  uuid: 'UUID-shaped id, e.g. a session id, outside fixtures/ and tests/',
  'github-owner': 'GitHub owner other than shanehaynes, actions or github',
  image: 'image, video or PDF outside fixtures/shots/',
  unscanned: 'content the guard cannot read; keep it out of the repo',
  'bad-path': 'file name with a control character or invalid UTF-8',
  denylist: "name on this machine's denylist: a repo, an origin slug or a session name",
}

const USAGE =
  'usage: privacy-guard.mjs --staged | --all | --range <a>..<b> | --history <rev> | --stdin <label>'

function git(root, args, input) {
  return execFileSync('git', args, {
    cwd: root,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    input,
    maxBuffer: 1 << 30,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

const notice = (text) => console.error(`privacy-guard: ${text}`)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const redact = (token) => (token.length <= 3 ? token : `${token.slice(0, 3)}…`)
const strings = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [])
const baseName = (path) => path.slice(path.lastIndexOf('/') + 1)

function splitZ(buf) {
  const parts = []
  for (let pos = 0; pos < buf.length;) {
    let end = buf.indexOf(0, pos)
    if (end === -1) end = buf.length
    if (end > pos) parts.push(buf.subarray(pos, end))
    pos = end + 1
  }
  return parts
}

// ---- reading --------------------------------------------------------------------------------

// `git diff --raw -z` and `git diff-tree [-c] --raw -z`: ":<modes> <shas> <status>\0<path>\0".
// With n leading colons there are n+1 modes, then n+1 shas; the last of each is the result.
function rawEntries(buf) {
  const parts = splitZ(buf)
  const out = []
  for (let i = 0; i < parts.length; i++) {
    const header = parts[i].toString('latin1')
    if (!header.startsWith(':')) continue
    const n = /^:+/.exec(header)[0].length
    const fields = header.slice(n).split(' ')
    out.push({ sha: fields[2 * n + 1], path: parts[++i] })
  }
  return out.filter((entry) => entry.path)
}

// `git ls-tree -r -z`: "<mode> <type> <sha>\t<path>".
function treeEntries(buf) {
  return splitZ(buf).flatMap((record) => {
    const tab = record.indexOf(9)
    const [, type, sha] = record.toString('latin1', 0, tab).split(' ')
    return type === 'blob' ? [{ sha, path: record.subarray(tab + 1) }] : []
  })
}

const isLockfile = (path) => LOCKFILES.has(baseName(path.toString('utf8')))

// Reads blobs by object id in two git calls: { data }, { size } when over MAX_BYTES and not a
// lockfile, or { skip } for a submodule or a missing object.
function readBlobs(root, entries) {
  const out = new Map()
  const ids = [...new Set(entries.map((e) => e.sha))].filter(
    (sha) => /^[0-9a-f]{40,64}$/.test(sha) && !/^0+$/.test(sha),
  )
  if (!ids.length) return out
  const whole = new Set(entries.filter((e) => isLockfile(e.path)).map((e) => e.sha))
  const checks = git(root, ['cat-file', '--batch-check'], `${ids.join('\n')}\n`)
    .toString('latin1')
    .split('\n')
  const wanted = []
  ids.forEach((sha, i) => {
    const [, type, size] = (checks[i] ?? '').split(' ')
    if (type !== 'blob') out.set(sha, { skip: true })
    else if (Number(size) > MAX_BYTES && !whole.has(sha)) out.set(sha, { size: Number(size) })
    else wanted.push(sha)
  })
  if (!wanted.length) return out
  const buf = git(root, ['cat-file', '--batch'], `${wanted.join('\n')}\n`)
  let pos = 0
  for (const sha of wanted) {
    const eol = buf.indexOf(10, pos)
    const size = Number(buf.toString('latin1', pos, eol).split(' ')[2])
    out.set(sha, { data: buf.subarray(eol + 1, eol + 1 + size) })
    pos = eol + 1 + size + 1
  }
  return out
}

function readWorkTree(root, path) {
  const full = Buffer.concat([Buffer.from(`${root}/`), path])
  let stat
  try {
    stat = lstatSync(full)
  } catch {
    return { skip: true }
  }
  if (stat.isSymbolicLink()) return { data: readlinkSync(full, { encoding: 'buffer' }) }
  if (!stat.isFile()) return { skip: true }
  if (stat.size > MAX_BYTES && !isLockfile(path)) return { size: stat.size }
  return { data: readFileSync(full) }
}

// ---- denylist -------------------------------------------------------------------------------

function isPublic(lower) {
  return PUBLIC.has(lower) || (lower.includes('/') && lower.split('/').every((p) => PUBLIC.has(p)))
}

// Drops entries under 4 characters, entries with no letter, the public names and privacyAllow.
// Matching ignores case; a single alphabetic word matches only as a path or URL segment.
function compileDenylist(raw, allow) {
  const drop = new Set(allow.map((name) => name.trim().toLowerCase()))
  const seen = new Map()
  for (const item of strings(raw)) {
    const name = item.trim()
    const lower = name.toLowerCase()
    if (name.length < 4 || !/[a-z]/i.test(name) || isPublic(lower) || drop.has(lower)) continue
    if (!seen.has(lower)) seen.set(lower, name)
  }
  return [...seen.values()].map((text) => ({
    re: new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
    plain: /^[A-Za-z]+$/.test(text),
  }))
}

function readConfig(home) {
  try {
    const config = JSON.parse(readFileSync(join(home, '.devdash', 'config.json'), 'utf8'))
    return config && typeof config === 'object' ? config : {}
  } catch {
    return {}
  }
}

function discoveryRoots(home, config) {
  const expand = (root) =>
    root === '~' ? home : root.startsWith('~/') ? join(home, root.slice(2)) : root
  const roots = strings(config.roots)
  return roots.length ? roots.map(expand) : [join(home, 'Developer')]
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

function fromRoots(home, config) {
  const names = []
  for (const root of discoveryRoots(home, config)) {
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
  const tmp = `${file}.${process.pid}.tmp`
  try {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    writeFileSync(tmp, `${JSON.stringify(value)}\n`, { mode: 0o600 })
    renameSync(tmp, file)
  } catch {
    try {
      unlinkSync(tmp)
    } catch {
      // nothing written
    }
  }
}

// Private repo names from gh, cached 24 h. A failure is cached too, so a hung network costs one
// timeout an hour, not one per commit; the last good names stay in use meanwhile.
function fromGh(home) {
  const file = join(home, '.devdash', 'cache', 'privacy-denylist.json')
  let cached = {}
  try {
    cached = JSON.parse(readFileSync(file, 'utf8')) ?? {}
  } catch {
    // no cache yet
  }
  const names = strings(cached.names)
  const age = (stamp) => Date.now() - Date.parse(stamp)
  if (age(cached.fetchedAt) < CACHE_TTL_MS || age(cached.failedAt) < RETRY_MS) return names
  try {
    const out = execFileSync('gh', ['repo', 'list', '--json', 'name,isPrivate', '--limit', '200'], {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
    })
    const fresh = JSON.parse(out)
      .filter((repo) => repo && repo.isPrivate === true && typeof repo.name === 'string')
      .map((repo) => repo.name)
    writeCache(file, { fetchedAt: new Date().toISOString(), names: fresh })
    return fresh
  } catch {
    const failedAt = new Date().toISOString()
    writeCache(file, { fetchedAt: cached.fetchedAt ?? null, names, failedAt })
    return names
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
  const home = homedir()
  const config = readConfig(home)
  const allow = strings(config.privacyAllow)
  const file = process.env.DEVDASH_DENYLIST_FILE
  if (file) {
    const list = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(list)) throw new Error('DEVDASH_DENYLIST_FILE must hold a JSON array')
    const deny = compileDenylist(list, allow)
    notice(`denylist replaced by DEVDASH_DENYLIST_FILE (${plural(deny.length, 'name')})`)
    return deny
  }
  if (process.env.GITHUB_ACTIONS === 'true') {
    notice('no denylist under GITHUB_ACTIONS=true: generic checks only')
    return []
  }
  return compileDenylist(
    [...fromRoots(home, config), ...fromGh(home), ...fromSessions(home)],
    allow,
  )
}

function leftBoundary(line, i) {
  let j = i - 1
  while (j >= 0 && line[j] === '.') j--
  return j < 0 || !WORD.test(line[j])
}

// Whole-token match, ignoring case: a token is a maximal run of [A-Za-z0-9_.-]; a trailing `.git`
// or sentence period does not extend it. A single word needs a `/` next to it (or `\` on a line
// with a drive letter), and a leading dot makes it another name (`.claude` is not `claude`).
function denylistMatches(line, entries) {
  const found = []
  const backslash = /\b[A-Za-z]:\\/.test(line)
  const sep = (c) => c === '/' || (backslash && c === '\\')
  for (const { re, plain } of entries) {
    for (const m of line.matchAll(re)) {
      const rest = line.slice(m.index + m[0].length)
      const dotgit = /^(?:\.git)?/.exec(rest)[0]
      const tail = /^(?:\.git)?\.*/.exec(rest)[0]
      if (WORD.test(rest[tail.length] ?? '')) continue
      if (plain) {
        const before = line[m.index - 1] ?? ''
        if (WORD.test(before) || before === '.') continue
        if (!sep(before) && !sep(rest[dotgit.length] ?? '')) continue
      } else if (!leftBoundary(line, m.index)) continue
      found.push(m[0])
    }
  }
  return found
}

// ---- scanning -------------------------------------------------------------------------------

function emailAllowed(email) {
  const lower = email.toLowerCase().replace('%40', '@')
  const domain = lower.slice(lower.lastIndexOf('@') + 1)
  return (
    EMAILS.has(lower) ||
    domain === 'users.noreply.github.com' ||
    /^(?:[a-z0-9-]+\.)*example\.(?:invalid|com|org|net)$/.test(domain)
  )
}

function context(path, deny) {
  return {
    path,
    deny,
    lockfile: path !== null && LOCKFILES.has(baseName(path)),
    uuidOk: path !== null && UUID_OK.test(path),
    shots: path !== null && path.startsWith(SHOTS),
    emails: true,
  }
}

function scanLine(text, loc, ctx, add) {
  const hit = (kind, token) => add({ loc, path: ctx.path, kind, token })
  for (const re of HOME) for (const m of text.matchAll(re)) hit('home-path', m[0])
  if (ctx.emails && !ctx.lockfile)
    for (const m of text.matchAll(EMAIL)) if (!emailAllowed(m[0])) hit('email', m[0])
  if (!ctx.uuidOk) for (const m of text.matchAll(UUID)) hit('uuid', m[0])
  if (!ctx.lockfile)
    for (const re of GITHUB)
      for (const m of text.matchAll(re))
        if (!OWNERS.has(m[1].toLowerCase())) hit('github-owner', m[1])
  if (!ctx.shots) for (const m of text.matchAll(DATA_IMAGE)) hit('image', m[0])
  for (const token of denylistMatches(text, ctx.deny)) hit('denylist', token)
}

function scanText(text, label, ctx, add) {
  text.split('\n').forEach((line, i) => {
    scanLine(line.endsWith('\r') ? line.slice(0, -1) : line, `${label}:${i + 1}`, ctx, add)
  })
}

// 'media' (image, video, PDF), 'archive' (compressed, unreadable), 'font', 'binary' or null (text).
function sniff(data) {
  const at = (i, magic) => data.toString('latin1', i, i + magic.length) === magic
  const binary = data.subarray(0, SNIFF_BYTES).includes(0)
  const media =
    ['\x89PNG\r\n\x1a\n', '\xff\xd8\xff', 'GIF87a', 'GIF89a', '%PDF-', 'II*\x00', 'MM\x00*'].some(
      (magic) => at(0, magic),
    ) ||
    at(0, '\x1aE\xdf\xa3') ||
    (at(0, 'RIFF') && at(8, 'WEBP')) ||
    (binary && (at(4, 'ftyp') || at(0, 'BM') || at(0, '\x00\x00\x01\x00')))
  if (media) return 'media'
  const archive =
    ['PK\x03\x04', 'PK\x05\x06', '\x1f\x8b', '\xfd7zXZ\x00', "7z\xbc\xaf'\x1c", '(\xb5/\xfd'].some(
      (magic) => at(0, magic),
    ) ||
    at(0, 'Rar!\x1a\x07') ||
    (binary && at(0, 'BZh'))
  if (archive) return 'archive'
  if (!binary) return null
  return ['wOFF', 'wOF2', 'OTTO', '\x00\x01\x00\x00'].some((magic) => at(0, magic))
    ? 'font'
    : 'binary'
}

// Text when there is no NUL in the first 8 KB or a UTF-16 byte-order mark; otherwise null.
function decodeText(data) {
  if (data[0] === 0xff && data[1] === 0xfe) return data.subarray(2).toString('utf16le')
  if (data[0] === 0xfe && data[1] === 0xff) {
    const body = Buffer.from(data.subarray(2, 2 + ((data.length - 2) & ~1)))
    return body.swap16().toString('utf16le')
  }
  return data.subarray(0, SNIFF_BYTES).includes(0) ? null : data.toString('utf8')
}

// Printable runs, as `strings` finds them, once as bytes and once with NULs dropped (UTF-16).
function binaryStrings(data) {
  const runs = (buf) =>
    buf
      .toString('latin1')
      .split(/[^\x20-\x7e\t]+/)
      .filter((run) => run.length >= 4)
  const packed = Buffer.allocUnsafe(data.length)
  let n = 0
  for (const byte of data) if (byte !== 0) packed[n++] = byte
  return [...runs(data), ...runs(packed.subarray(0, n))]
}

// A file name's own hits, and the name as printed: control characters escaped, every hit token
// cut to 3 characters, and an image's base name too (`media`: an image by content).
function scanName(path, name, deny, media) {
  const hits = []
  const ctx = context(name, deny)
  const escaped = [...name]
    .map((c) => {
      const code = c.charCodeAt(0)
      return code < 0x20 || code === 0x7f ? `\\x${code.toString(16).padStart(2, '0')}` : c
    })
    .join('')
  if (escaped !== name || !Buffer.from(name, 'utf8').equals(path))
    hits.push({ kind: 'bad-path', token: escaped })
  scanLine(name, null, ctx, (hit) => hits.push(hit))
  if ((media || MEDIA_EXT.test(name)) && !ctx.shots)
    hits.push({ kind: 'image', token: baseName(name) })
  let shown = escaped
  for (const { kind, token } of hits) {
    if (kind === 'bad-path') continue
    if (kind === 'image') {
      const base = baseName(shown)
      const ext = /\.[^.]*$/.exec(base)?.[0] ?? ''
      shown = `${shown.slice(0, shown.length - base.length)}${redact(base.slice(0, base.length - ext.length))}${ext}`
    } else shown = shown.split(token).join(redact(token))
  }
  return { hits, shown, ctx }
}

function scanFile(path, blob, deny, add) {
  const name = path.toString('utf8')
  const kind = blob?.data ? sniff(blob.data) : null
  const { hits, shown, ctx } = scanName(path, name, deny, kind === 'media')
  const report = (hit) => add({ ...hit, loc: shown, path: name })
  for (const hit of hits) report(hit)
  if (!blob || blob.skip) return
  if (blob.data === undefined) {
    if (!ctx.shots) report({ kind: 'unscanned', note: 'over 2 MB' })
    return
  }
  if (kind === 'archive') report({ kind: 'unscanned', note: 'compressed archive' })
  const text = kind === 'archive' ? null : decodeText(blob.data)
  if (text !== null) return scanText(text, shown, ctx, add)
  const binary = { ...ctx, emails: kind === 'binary' }
  const label = `${shown} (binary)`
  for (const run of binaryStrings(blob.data)) scanLine(run, label, binary, add)
}

function collector() {
  const hits = []
  const keys = new Set()
  const add = (hit) => {
    const key = `${hit.loc}\0${hit.kind}\0${hit.token ?? hit.note}`
    if (keys.has(key)) return
    keys.add(key)
    hits.push(hit)
  }
  return { hits, add }
}

function staged(root, deny, add) {
  const args = ['diff', '--cached', '--raw', '-z', '--no-abbrev', '--no-renames']
  const entries = rawEntries(git(root, [...args, '--diff-filter=ACMRT']))
  const blobs = readBlobs(root, entries)
  for (const { sha, path } of entries) scanFile(path, blobs.get(sha), deny, add)
}

function all(root, deny, add) {
  const seen = new Set()
  for (const path of splitZ(git(root, ['ls-files', '-z']))) {
    const key = path.toString('latin1')
    if (seen.has(key)) continue
    seen.add(key)
    scanFile(path, readWorkTree(root, path), deny, add)
  }
}

// Commits in `from..to`, or every commit reachable from `to` when `from` is null: messages,
// authors and committers; files at the tip; and every commit's own files, so a leak added and
// removed inside the range is still caught (the pushed commits stay public). A merge contributes
// the files that differ from all its parents, which is where a conflict resolution adds text.
function range(root, fromSpec, toSpec, deny, add) {
  const rev = (r) =>
    git(root, ['rev-parse', '--verify', '--quiet', `${r}^{commit}`])
      .toString()
      .trim()
  const to = rev(toSpec)
  const from = fromSpec === null ? null : rev(fromSpec)
  const text = context(null, deny)

  const format = '--format=%H %P%x1f%an <%ae>%x1f%cn <%ce>%x1f%B'
  const log = git(root, ['log', '-z', format, from ? `${from}..${to}` : to, '--'])
  const commits = splitZ(log).map((record) => {
    const [head, author, committer, ...body] = record.toString('utf8').split('\x1f')
    const [sha, ...parents] = head.split(' ').filter(Boolean)
    const label = `commit ${sha.slice(0, 7)}`
    scanText(body.join('\x1f'), label, text, add)
    scanLine(author ?? '', `${label} author`, text, add)
    scanLine(committer ?? '', `${label} committer`, text, add)
    return { sha, merge: parents.length > 1 }
  })

  const filter = ['--no-abbrev', '--no-renames', '--diff-filter=ACMRT']
  let tipEntries
  if (from) {
    let base = from
    try {
      base = git(root, ['merge-base', from, to]).toString().trim()
    } catch {
      // unrelated or shallow history: diff against the range start
    }
    tipEntries = rawEntries(git(root, ['diff-tree', '-r', '-z', '--raw', ...filter, base, to]))
  } else tipEntries = treeEntries(git(root, ['ls-tree', '-r', '-z', '--full-tree', to]))
  const tip = readBlobs(root, tipEntries)
  const key = (hit) => `${hit.path}\0${hit.kind}\0${hit.token ?? hit.note}`
  const atTip = new Set()
  const tipAdd = (hit) => {
    atTip.add(key(hit))
    add(hit)
  }
  for (const { sha, path } of tipEntries) scanFile(path, tip.get(sha), deny, tipAdd)

  const pairs = []
  for (const { sha, merge } of commits) {
    const args = merge
      ? ['diff-tree', '-r', '-z', '-c', '--raw', '--no-abbrev', '--no-commit-id', sha]
      : ['diff-tree', '--root', '-r', '-z', '--raw', '--no-commit-id', ...filter, sha]
    for (const entry of rawEntries(git(root, args))) pairs.push({ ...entry, commit: sha })
  }
  const history = readBlobs(root, pairs)
  const reported = new Set()
  for (const { sha, path, commit } of pairs) {
    scanFile(path, history.get(sha), deny, (hit) => {
      if (atTip.has(key(hit)) || reported.has(key(hit))) return
      reported.add(key(hit))
      add({ ...hit, commit: commit.slice(0, 7) })
    })
  }
}

function main(argv) {
  const [mode, arg, ...extra] = argv
  const takesArg = ['--range', '--history', '--stdin'].includes(mode)
  const known = takesArg || mode === '--staged' || mode === '--all'
  if (!known || (takesArg ? !arg || extra.length : arg !== undefined)) {
    console.error(USAGE)
    return 64
  }
  let ends
  if (mode === '--range') {
    ends = /^([^.].*?)\.\.([^.].*)$/.exec(arg)
    if (!ends || arg.includes('...')) {
      console.error(`privacy-guard: --range wants <a>..<b>, got '${arg}'\n${USAGE}`)
      return 64
    }
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
  try {
    if (mode === '--staged') staged(root, deny, add)
    else if (mode === '--all') all(root, deny, add)
    else if (mode === '--range') range(root, ends[1], ends[2], deny, add)
    else if (mode === '--history') range(root, null, arg, deny, add)
    else scanText(readFileSync(0, 'utf8'), arg, context(null, deny), add)
  } catch (error) {
    const detail = (error.stderr?.toString() || error.message).trim().split('\n')[0]
    console.error(`privacy-guard: could not scan (${mode}): ${detail}`)
    return 2
  }
  for (const { loc, kind, token, note, commit } of hits) {
    const where = commit ? `; in commit ${commit}, still in history` : ''
    console.log(`${loc}: ${kind}: ${note ?? redact(token)} (${WHY[kind]}${where})`)
  }
  if (!hits.length) return 0
  const list = deny.length ? `denylist: ${plural(deny.length, 'name')}` : 'no denylist'
  notice(
    `${plural(hits.length, 'hit')} (${mode}; ${list}). Remove each before it reaches a public ` +
      'commit; a pushed commit cannot be unpublished.',
  )
  if (hits.some((hit) => hit.kind === 'denylist'))
    notice(
      'a denylist name that is public after all: add it to privacyAllow in ~/.devdash/config.json',
    )
  return 1
}

process.exitCode = main(process.argv.slice(2))
