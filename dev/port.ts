// The dev-server port for THIS checkout. vite.config.ts reads it, and it
// delegates to parallel-agents' lane.sh so lane creation reports the same port.
// Primary checkout → 4400 (the one real instance); a worktree → a port hashed
// from its directory, where the server reads synthetic fixtures only.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

export const PRIMARY_PORT = 4400

export function devPort(env: NodeJS.ProcessEnv = process.env): number {
  const override = env.DEVDASH_PORT
  if (override) {
    const n = Number(override)
    if (!Number.isInteger(n) || n < 1024 || n > 65535)
      throw new Error(`DEVDASH_PORT must be 1024–65535, got "${override}"`)
    return n
  }
  const lane = join(root, '.claude/skills/parallel-agents/scripts/lane.sh')
  const out = execFileSync('bash', [lane, 'port', root], {
    encoding: 'utf8',
    env: { ...env, LANE_PORT_DEFAULT: String(PRIMARY_PORT) },
  })
  return Number(out.trim())
}
