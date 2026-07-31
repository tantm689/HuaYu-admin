import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to the Node environment: it's needed for API route tests that
    // exercise the Fetch API's Request/FormData (jsdom's polyfills hang when
    // parsing multipart FormData bodies containing a File). Component tests
    // that need a DOM can opt in per-file with a `// @vitest-environment jsdom`
    // docblock comment at the top of the test file.
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    // Vitest's default exclude list doesn't know about git worktrees checked
    // out under this repo (e.g. .worktrees/admin-pdf-extraction/) - without
    // this, it happily globs into that sibling checkout too and runs its
    // tests a second time against a different module graph, causing flaky
    // cross-talk (mismatched mocks, missing env vars the worktree's own
    // .env.local would have had).
    exclude: ['**/node_modules/**', '**/.worktrees/**', '**/worktrees/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
