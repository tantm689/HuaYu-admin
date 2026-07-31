import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored pdfjs-dist worker, copied verbatim into public/ for
    // client-side PDF thumbnail rendering (see Task 7 report).
    "public/pdf.worker.min.mjs",
    // Sibling git worktree checkouts of this same repo - not part of this
    // checkout's own source, must not be linted from here (same reasoning
    // as the vitest.config.ts test-exclude for .worktrees/).
    ".worktrees/**",
    "worktrees/**",
    // Per-machine Claude Code tooling (skills, agent config) - not part of
    // the app's source, gitignored, and its own scripts don't follow this
    // project's lint rules.
    ".claude/**",
    ".superpowers/**",
  ]),
  {
    // Test files widely rely on `as any` to satisfy Next.js 16's
    // Promise-wrapped route-handler `params` type when mocking synchronous
    // params objects, and to sidestep incidental Request/NextRequest type
    // mismatches when constructing fetch Requests by hand. A per-file typed
    // helper would need to be threaded through ~8 files for the same
    // handful of call sites each; a scoped override here is less invasive.
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
