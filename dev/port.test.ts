import { describe, expect, it } from 'vitest'
import { devPort } from './port.ts'

describe('devPort', () => {
  it('returns a usable port for this checkout', () => {
    const port = devPort({})
    expect(Number.isInteger(port)).toBe(true)
    expect(port).toBeGreaterThanOrEqual(1024)
    expect(port).toBeLessThanOrEqual(65535)
  })
  it('honours a valid override and rejects garbage', () => {
    expect(devPort({ DEVDASH_PORT: '4567' })).toBe(4567)
    expect(() => devPort({ DEVDASH_PORT: 'eighty' })).toThrow(/DEVDASH_PORT/)
    expect(() => devPort({ DEVDASH_PORT: '80' })).toThrow(/DEVDASH_PORT/)
  })
})
