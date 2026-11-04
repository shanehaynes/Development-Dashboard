// Synthetic repos for dev lanes and tests, so nothing reads Shane's real repos.
//   node fixtures/generate.mjs [--out DIR] [--clean] [--seed N]
// --out defaults to fixtures/out beside this file and must be empty or absent. Never /, $HOME,
// this repo or a parent of one; inside this repo only fixtures/out. Nothing lands outside it.
// --clean first empties a directory holding only an earlier run's output; anything else is refused.
// Same seed, same commit ids and file contents: fixed dates and identity, a seeded PRNG, no user or
// system git config. Two --out dirs differ only in absolute paths and git's index.
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import { devNull, homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const REPO = fs.realpathSync.native(join(import.meta.dirname, '..'))
const HOME = fs.realpathSync.native(homedir())
const DEFAULT_OUT = join(REPO, 'fixtures', 'out')
const MARK = 'Synthetic fixture repos for the development dashboard.'
const USAGE = 'usage: node fixtures/generate.mjs [--out DIR] [--clean] [--seed N]'
const PATHS = { roadmap: 'docs/roadmap.md', backlog: 'docs/backlog.md' }
const START = Date.parse('2026-11-03T14:00:00Z')
const PROC_START = 'Tue Nov  3 14:00:00 2026' // lstart of START in UTC, as the registry writes it
let OUT = ''
let prng = 1

// Contract documents: a box written [x@N] is ticked from commit N on; a line starting "@N " appears
// at commit N. Commit 2 adopts the contract.
const ALPHA_ROADMAP = `# Roadmap

Notes app for one person. File order is priority.

<!-- Synthetic fixture from fixtures/generate.mjs. -->

## Quick capture \`quick-capture\`

@3 - Result: 2026-10-22. A note saves in under 50 ms.
@3 - Learned: **General:** Time the slow path before tuning it. Because the first guess was wrong. Mechanize: none.
- [x@3] Text box with Enter-to-save.
- [x@3] **Shane (verify):** capture three notes in the narrow layout. (Shane 2026-10-22)

## Tag filter \`tag-filter\`

- [x@4] Parse \`#tags\` from note bodies.
- [x@4] Filter chips above the list.
- [-] Tag colours; the chips read fine without them.

## Search index \`search-index\`

Full-text search over every note, local only.

- Aliases: \`full-text-search\`

### M1 — Index builder

- [x@5] Tokenizer with stop words.
- [x@5] Incremental index on save.

### M2 — Search UI · Mac

- [ ] Result list with highlighted matches.
- [ ] **Shane (device):** search 500 notes on the laptop and report the lag. (by 2026-11-06)
- [ ] **Chrome:** compare ranking with the old web app, signed in.

## Sync export \`sync-export\`

- Depends on: \`search-index\`
- [ ] Export every note as one zip.
- [ ] **Shane:** accept the storage provider's terms.
- [ ] **Shane (account):** create the storage bucket and put its key in \`.env\`.
- [ ] **Shane (approve):** approve the first upload. (after 2026-11-10)

## Weekly review \`weekly-review\`

- Order: any
- [ ] **Shane (decide):** pick the review day.
- [ ] Digest of the notes edited this week.
- [ ] **Chrome:** add the digest to the calendar, signed in. (after 2026-11-09) (by 2026-11-14)

## Non-goals

- Sharing notes with other people.
`

const ALPHA_BACKLOG = `# Backlog

One line per idea, appended at the end of its group.

## Features

- \`dark-mode\` Dark theme — reading at night.
- \`note-templates\` Note templates — the same meeting notes every week. (from weekly-review)

## Upkeep

- \`restore-drill\` Restore one backup — never tried. (from quick-capture)
`

// beta writes headings flush against their lists, as hand-edited files do.
const BETA_ROADMAP = `# Roadmap

Habit tracker. Buckets set the horizon; file order inside a bucket is priority.

## Now

### Habit list \`habit-list\`
- Result: 2026-10-23. Converted from the old status table.
- [x@2] Add, rename and archive habits.
- [X@2] Persist habits to \`data/habits.json\`.

### Reminders \`reminders\`
#### M1 — Local notifications · Mac
- [x@3] Schedule one notification per habit per day.
- [x@3] **Shane (device):** confirm one fires on the laptop. (Shane 2026-10-27)
#### M2 — Snooze
- [ ] Snooze for one hour from the notification.
- [ ] **Shane (decide):** the default snooze length. (by 2026-11-07)

## Next

### Calendar import \`calendar-import\`
- Depends on: \`reminders\`
1. [ ] **Chrome:** export the habit calendar from the signed-in calendar site. (after 2026-11-05)
2. [ ] Parse the ICS export into habits.

### Weekly chart \`weekly-chart\`
- Order: any
* [ ] Bar chart of completions per week.
* [ ] **Shane (verify):** the chart matches the paper log for one week.

## Non-goals
- Social features or leaderboards.
`

const BETA_BACKLOG = `# Backlog

## Features
- \`habit-groups\` Group habits by time of day.
- \`csv-export\` CSV export — for the yearly review. (from weekly-chart)

## Upkeep
- \`timezone-tests\` Tests for travel across timezones — streaks broke once.
`

// Tier 0: legacy prose that declares status, so inferred needs and drift have input.
const GAMMA_DOCS = {
  'docs/roadmap.md': `# Roadmap

## Phase 0: Landing page (done 2026-10-20)
- One page with the pitch and a contact link.

## Phase 1: Blog (done 2026-10-27)
- Markdown posts rendered at build time.

## Phase 2: Contact form
- The form posts to the mail service, with a spam check before send.
- [ ] Shane approves the form copy.

## Next up
- **Shane:** pick the domain registrar.
- Export the hero photos at 2x (human).
`,
  'STATUS.md': `# Status

| Workstream   | Branch            | State            | Next step                  |
| ------------ | ----------------- | ---------------- | -------------------------- |
| Landing page | main              | done             | —                          |
| Blog         | feat/blog         | in review        | merge after Shane reads it |
| Contact form | feat/contact-form | blocked on Shane | mail service account       |

## Pending for Shane

- [ ] Create the mail service account and put its key in \`.env\`.
- [ ] Approve the DNS change for the custom domain.
- [x] Picked the colour palette on 2026-10-19.
`,
}

// Repos: commits are [day, subject, extra files].
const REPOS = [
  {
    name: 'alpha-notes',
    contract: { roadmap: ALPHA_ROADMAP, backlog: ALPHA_BACKLOG },
    commits: [
      ['2026-10-20', 'Scaffold the notes app', { 'notes/inbox.md': '# Inbox\n' }],
      ['2026-10-21', 'Adopt the dashboard contract [-] (#1)', {}],
      ['2026-10-22', 'Quick capture [quick-capture] (#2)', { 'src/capture.txt': 'capture\n' }],
      ['2026-10-25', 'Tag filter [tag-filter] (#3)', { 'src/tags.txt': 'tags\n' }],
      ['2026-10-29', 'Search index M1 [search-index.M1] (#4)', { 'src/index.txt': 'index\n' }],
    ],
  },
  {
    name: 'beta-tracker',
    contract: { roadmap: BETA_ROADMAP, backlog: BETA_BACKLOG },
    commits: [
      ['2026-10-21', 'Scaffold the habit tracker', { 'data/habits.json': '[]\n' }],
      ['2026-10-23', 'Adopt the dashboard contract [-] (#1)', {}],
      ['2026-10-27', 'Reminders M1 [reminders.M1] (#2)', { 'src/remind.txt': 'remind\n' }],
    ],
  },
  {
    name: 'gamma-site',
    commits: [
      ['2026-10-18', 'Scaffold the site', {}],
      ['2026-10-20', 'Landing page (#1)', { 'site/index.html': '<h1>gamma</h1>\n' }],
      ['2026-10-27', 'Blog and status board (#2)', GAMMA_DOCS],
    ],
  },
]
const NAMES = ['README.txt', 'remotes', 'sessions', ...REPOS.map((repo) => repo.name)]

// Arguments, the --out guard and --clean.
function die(message, code = 1) {
  console.error(`fixtures: ${message}`)
  process.exit(code)
}

function within(path, dir) {
  const rel = relative(dir, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function parseArgs(argv) {
  const opts = { out: DEFAULT_OUT, clean: false, seed: 1 }
  for (let i = 0; i < argv.length; i++) {
    const [flag, value = ''] = [argv[i], argv[i + 1]]
    if (flag === '--clean') opts.clean = true
    else if (flag === '--out' && value && !value.startsWith('-')) opts.out = argv[++i]
    else if (flag === '--seed' && /^\d+$/.test(value)) opts.seed = Number(argv[++i])
    else die(`${USAGE} (bad argument: ${flag})`, 64)
  }
  return opts
}

// Real path with the on-disk case (macOS folds case), for a path that may not exist yet.
function real(path) {
  const abs = resolve(path)
  return fs.existsSync(abs) ? fs.realpathSync.native(abs) : join(real(dirname(abs)), basename(abs))
}

function guard(out) {
  const target = real(out)
  if (within(HOME, target) || within(REPO, target))
    die(`refusing ${target}: it is /, $HOME, this repo or a parent of one`)
  if (within(target, REPO) && !within(target, DEFAULT_OUT))
    die(`refusing ${target}: inside this repo only fixtures/out is ignored`)
  return target
}

// Removes an earlier run's entries, never the directory itself and never a file it did not write.
function clean(target) {
  if (!fs.existsSync(target)) return
  const entries = fs.readdirSync(target)
  const foreign = entries.find((name) => !NAMES.includes(name))
  if (foreign) die(`refusing to clean ${target}: ${foreign} is not fixture output`)
  const readme = join(target, 'README.txt')
  const ours = fs.existsSync(readme) && fs.readFileSync(readme, 'utf8').startsWith(MARK)
  if (entries.length > 0 && !ours) die(`refusing to clean ${target}: no fixture README.txt`)
  for (const name of entries) fs.rmSync(join(target, name), { recursive: true, force: true })
}

// Seeded PRNG (mulberry32); every time is a fixed day plus a seeded offset.
function rng() {
  prng = (prng + 0x6d2b79f5) | 0
  let t = Math.imul(prng ^ (prng >>> 15), 1 | prng)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (n) => Math.floor(rng() * n)
const hex = (n) => Array.from({ length: n }, () => pick(16).toString(16)).join('')
const uuid = () => [hex(8), hex(4), `4${hex(3)}`, `a${hex(3)}`, hex(12)].join('-')
const moment = (day) => Date.parse(`${day}T13:00:00Z`) + pick(480) * 60_000
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z')

// Git with no user, system or XDG config and no inherited GIT_* (a hook's GIT_DIR). Identity comes
// from the environment: `remote set-head` writes its reflog with the OS account's name otherwise.
const ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Fixture Bot',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture Bot',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  XDG_CONFIG_HOME: devNull,
  LC_ALL: 'C',
  TZ: 'UTC',
}
// Every call carries a date, so commits and reflogs are the same on every run.
function git(cwd, args, ms = START) {
  const date = `@${ms / 1000} +0000`
  const env = { ...ENV, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
  return execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim()
}
function commit(dir, subject, ms) {
  git(dir, ['add', '-A'], ms)
  git(dir, ['commit', '-q', '-m', subject], ms)
}

// Files: every write must land inside --out.
function put(dir, rel, text) {
  const path = join(dir, rel)
  if (!within(path, OUT)) throw new Error(`refusing to write outside --out: ${path}`)
  fs.mkdirSync(dirname(path), { recursive: true })
  fs.writeFileSync(path, text)
}
const json = (value) => `${JSON.stringify(value, null, 2)}\n`
const tsv = (rows) => rows.map((row) => `${row.join('\t')}\n`).join('')
const unstamp = (rest) => rest.replace(/ \(Shane \d{4}-\d\d-\d\d\)$/, '')
const stage = (doc, n) =>
  doc
    .replace(/^@(\d) (.*\n)/gm, (_, from, line) => (n >= Number(from) ? line : ''))
    .replace(/\[([xX])@(\d)\](.*)/g, (_, box, from, rest) =>
      n >= Number(from) ? `[${box}]${rest}` : `[ ]${unstamp(rest)}`,
    )
function tick(worktree, step) {
  const doc = fs.readFileSync(join(worktree, PATHS.roadmap), 'utf8')
  if (!doc.includes(`- [ ] ${step}\n`)) throw new Error(`no open box "${step}" in ${worktree}`)
  put(worktree, PATHS.roadmap, doc.replace(`- [ ] ${step}\n`, `- [x] ${step}\n`))
}

// One repo: commit N writes its files and the contract at stage N; contract repos get an origin.
function build(repo) {
  const dir = join(OUT, repo.name)
  fs.mkdirSync(dir)
  git(dir, ['init', '-q', '-b', 'main'])
  repo.commits.forEach(([day, subject, files], i) => {
    if (i === 0) {
      put(dir, 'README.md', `# ${repo.name}\n\nSynthetic fixture repo; not real data.\n`)
      put(dir, '.gitignore', '.claude/worktrees/\n.claude/state/\nnode_modules/\n')
    }
    if (repo.contract && i > 0) {
      const dashboard = { contract: 1, key: repo.name, github: `fixture/${repo.name}`, ...PATHS }
      put(dir, '.claude/dashboard.json', json(dashboard))
      put(dir, '.gitattributes', `${PATHS.backlog} merge=union\n`)
      put(dir, PATHS.roadmap, stage(repo.contract.roadmap, i + 1))
      put(dir, PATHS.backlog, repo.contract.backlog)
    }
    for (const [rel, text] of Object.entries(files)) put(dir, rel, text)
    commit(dir, subject, moment(day))
  })
  if (repo.contract) {
    const bare = join(OUT, 'remotes', `${repo.name}.git`)
    fs.mkdirSync(bare, { recursive: true })
    git(bare, ['init', '-q', '--bare', '-b', 'main'])
    git(dir, ['remote', 'add', 'origin', bare])
    git(dir, ['push', '-q', '-u', 'origin', 'main'])
    git(dir, ['remote', 'set-head', 'origin', 'main'])
  }
  return dir
}

// Registry entries shaped like ~/.claude/sessions/<pid>.json; the pids never run.
const SESSION = {
  startedAt: START,
  procStart: PROC_START,
  version: '2.1.308',
  peerProtocol: 1,
  kind: 'interactive',
  entrypoint: 'cli',
  nameSince: START,
}
function session(pid, cwd, name, status, updatedAt, waitingFor) {
  const entry = { pid, sessionId: uuid(), cwd, ...SESSION, name, status, waitingFor, updatedAt }
  put(OUT, `sessions/${pid}.json`, json({ ...entry, statusUpdatedAt: updatedAt }))
  return entry
}

// alpha-notes lanes: one with an uncommitted tick, one committed and pushed nowhere.
function addLanes(dir) {
  const dirty = join(dir, '.claude', 'worktrees', 'feat-search-index')
  const ahead = join(dir, '.claude', 'worktrees', 'feat-weekly-review')
  const [claimedDirty, claimedAhead] = [moment('2026-11-01'), moment('2026-11-02')]
  fs.mkdirSync(dirname(dirty), { recursive: true })
  git(dir, ['worktree', 'add', '-q', '-b', 'feat/search-index', dirty, 'main'], claimedDirty)
  git(dir, ['worktree', 'add', '-q', '-b', 'feat/weekly-review', ahead, 'main'], claimedAhead)
  tick(ahead, 'Digest of the notes edited this week.')
  put(ahead, 'src/digest.txt', 'digest\n')
  commit(ahead, 'Weekly digest [weekly-review]', claimedAhead + 45 * 60_000)
  tick(dirty, 'Result list with highlighted matches.')
  const blockedAt = START + (20 + pick(200)) * 60_000
  const askedAt = blockedAt + 60_000
  const waiting = session(999901, dirty, 'search-m2', 'waiting', askedAt, 'permission prompt')
  session(999902, ahead, 'weekly-digest', 'idle', START + (10 + pick(300)) * 60_000)
  const v1 = ['feat/search-index', iso(claimedDirty), dirty, '[search-index] M2 result list']
  const v2 = ['feat/weekly-review', iso(claimedAhead), ahead, '[weekly-review] weekly digest']
  put(dir, '.claude/state/claims.tsv', tsv([v1, [...v2, 5200 + pick(800), 'active', 'branch']]))
  const why = 'the laptop search run decides how much ranking work is worth doing'
  const row = [iso(blockedAt), waiting.sessionId, dirty, 'search-index.M2', 'shane', why]
  put(dir, '.claude/state/blocked.tsv', tsv([row]))
}

const readme = (seed) => `${MARK}
Made by fixtures/generate.mjs --seed ${seed}; regenerate: npm run fixtures -- --clean. No real data.

alpha-notes/   tier 1, H2 items. Lanes under .claude/worktrees/: feat-search-index has an
               uncommitted tick, a 4-column claim, waiting session 999901 and the blocked.tsv
               row; feat-weekly-review has one unpushed commit, a 7-column claim, idle 999902.
beta-tracker/  tier 1: Now/Next buckets, H3 items, H4 milestones, numbered steps. No lanes.
gamma-site/    tier 0: no .claude/dashboard.json; STATUS.md disagrees with docs/roadmap.md.
remotes/       bare origins of alpha-notes and beta-tracker; main is pushed, lanes are not.
sessions/      shaped like ~/.claude/sessions/<pid>.json. The pids never run, so tests inject
               ps output (lstart "${PROC_START}", UTC).
`

// Main: guard --out, optionally clean it, refuse a non-empty one; print one line per repo.
function main() {
  const opts = parseArgs(process.argv.slice(2))
  const target = guard(opts.out)
  if (opts.clean) clean(target)
  fs.mkdirSync(target, { recursive: true })
  OUT = fs.realpathSync.native(target)
  if (fs.readdirSync(OUT).length > 0) die(`${OUT} is not empty; --clean replaces an earlier run`)
  prng = opts.seed
  put(OUT, 'README.txt', readme(opts.seed))
  for (const repo of REPOS) {
    const dir = build(repo)
    if (repo.name === 'alpha-notes') addLanes(dir)
    const list = git(dir, ['worktree', 'list', '--porcelain']).split('\n')
    const lanes = list.filter((line) => line.startsWith('worktree ')).length - 1
    const facts = [`tier ${repo.contract ? 1 : 0}`, `${repo.commits.length} commits`]
    facts.push(`${lanes} lanes`, `main ${git(dir, ['rev-parse', '--short', 'main'])}`)
    if (repo.contract) facts.push(`origin remotes/${repo.name}.git`)
    console.log(`${repo.name}: ${facts.join(', ')}`)
  }
}

try {
  main()
} catch (error) {
  die(error instanceof Error ? error.message : String(error))
}
