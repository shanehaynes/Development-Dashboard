import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { devPort } from './dev/port.ts'

const port = devPort()

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    watch: { ignored: ['**/.claude/**', '**/fixtures/out/**'] },
  },
  preview: { host: '127.0.0.1', port, strictPort: true },
  optimizeDeps: { entries: ['index.html'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: [
      'src/**/*.test.{ts,tsx}',
      'dev/**/*.test.ts',
      'contract/**/*.test.{ts,mjs}',
      'tests/**/*.test.{ts,tsx,mjs}',
    ],
  },
})
