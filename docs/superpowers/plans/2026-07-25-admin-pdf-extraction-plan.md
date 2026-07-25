# Admin Content Management App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Admin repo — a Next.js app where a single admin uploads the "Đương Đại" textbook PDF, extracts lessons (dialogues, official vocabulary, grammar explanations+examples) via Gemini, reviews/edits the result, imports it into Supabase, and attaches audio (uploaded mp3 for dialogues, edge-tts generated for vocabulary).

**Architecture:** Next.js App Router (TypeScript) talking to Supabase (Postgres + Storage + Auth). Server-side logic lives in small, independently testable `lib/` modules (PDF slicing, Gemini extraction, TTS generation, filename matching, DB writes); route handlers and pages are thin wrappers around them. Client-side PDF thumbnails are rendered in-browser with `pdfjs-dist` to avoid native canvas dependencies on the server.

**Tech Stack:** Next.js 14 (App Router) + TypeScript, Tailwind CSS + shadcn/ui, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), `pdf-lib` (page slicing), `pdfjs-dist` (client-side thumbnails), `@google/genai` (Gemini `gemini-3.5-flash-lite`), `zod` (validation), `msedge-tts` (vocabulary audio), Vitest + React Testing Library.

## Global Constraints

- Single admin user only — no roles/permissions system (per spec).
- Gemini model must be `gemini-3.5-flash-lite` exactly (chosen for free-tier RPM/RPD).
- Extraction scope: dialogues in full; vocabulary **only** from the lesson's official Từ vựng section; grammar **only** structure explanation + examples — grammar exercises are never extracted or stored.
- `lessons.status` is one of `draft | reviewed | published`; only `published` lessons are meant to be read by the User repo (not built in this plan).
- `extraction_jobs.status` is one of `pending | reviewed | imported | failed`.
- Dialogue audio comes from admin-uploaded mp3s matched by `audio_code` (e.g. `01-1`), never AI-generated. Vocabulary audio is always edge-tts generated, never uploaded.
- No automated testing of AI/OCR output quality — correctness is enforced by the human review step, not by tests.

---

## File Structure

```
/app
  /login/page.tsx                        # Supabase Auth login (single admin)
  /(protected)/layout.tsx                # Auth-gated layout wrapping all admin pages
  /(protected)/books/page.tsx            # List books
  /(protected)/books/new/page.tsx        # Upload a new book PDF
  /(protected)/books/[bookId]/page.tsx   # Book detail: lessons + extraction jobs
  /(protected)/books/[bookId]/jobs/new/page.tsx      # Page-range picker → create extraction job
  /(protected)/books/[bookId]/jobs/[jobId]/page.tsx  # Review UI (PDF pages vs extracted JSON)
  /(protected)/books/[bookId]/audio/page.tsx         # Bulk mp3 upload for dialogues
  /(protected)/lessons/[lessonId]/page.tsx           # Lesson detail, publish toggle
  /api/books/route.ts                    # POST create book (upload PDF)
  /api/books/[bookId]/pages/route.ts     # GET signed URL for PDF (thumbnails render client-side)
  /api/jobs/route.ts                     # POST create extraction job
  /api/jobs/[jobId]/run/route.ts         # POST run extraction (slice → Gemini → validate → save)
  /api/jobs/[jobId]/route.ts             # GET job + PATCH edited raw_json
  /api/jobs/[jobId]/import/route.ts      # POST import job into lesson tables (+ vocab TTS)
  /api/books/[bookId]/audio/route.ts     # POST bulk mp3 upload, match to dialogues
  /api/lessons/[lessonId]/publish/route.ts  # PATCH lesson status
/lib
  /supabase/server.ts                    # Server-side Supabase client (service role, route handlers)
  /supabase/browser.ts                   # Browser Supabase client (anon key, client components)
  /supabase/middleware.ts                # Auth session refresh for middleware
  /pdf/slice.ts                          # sliceBookPdf(bytes, start, end) -> Buffer
  /gemini/schema.ts                      # Zod schema + JSON responseSchema for extraction
  /gemini/extract.ts                     # extractLessonFromPdf(pdfBuffer) -> ExtractionResult
  /tts/edgeTts.ts                        # generateVocabAudio(text) -> Buffer (mp3)
  /audio/matchDialogueAudio.ts           # matchFilesToDialogues(files, dialogues) -> MatchResult
  /db/importJob.ts                       # importExtractionJob(jobId) -> { lessonId }
  /db/types.ts                           # Hand-written row types mirroring the schema
/middleware.ts                           # Next.js middleware wiring lib/supabase/middleware.ts
/supabase/migrations/0001_init.sql       # All tables + storage buckets
/vitest.config.ts
/tests/setup.ts
```

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`
- Create: `vitest.config.ts`, `tests/setup.ts`
- Create: `.env.local.example`
- Create: `app/layout.tsx`, `app/page.tsx` (redirect to `/books`)

**Interfaces:**
- Produces: a runnable `npm run dev` Next.js app and a runnable `npm run test` Vitest suite that later tasks add tests into.

- [ ] **Step 1: Scaffold Next.js app**

Run: `npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*"`

When prompted, accept defaults.

- [ ] **Step 2: Install project dependencies**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr pdf-lib pdfjs-dist @google/genai zod msedge-tts
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Add shadcn/ui**

Run: `npx shadcn@latest init -d`

- [ ] **Step 4: Configure Vitest**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

Create `tests/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 5: Write a smoke test to confirm the harness works**

Create `tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `npm run test`
Expected: 1 test passes.

- [ ] **Step 6: Create env var template**

Create `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
```

- [ ] **Step 7: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js admin app with Tailwind, shadcn, Vitest"
```

---

## Task 2: Database schema and storage buckets

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `lib/db/types.ts`

**Interfaces:**
- Produces: all tables from the spec's data model, plus two Storage buckets (`book-pdfs`, `audio`) later tasks read/write. Produces TypeScript row types other tasks import from `lib/db/types.ts`.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0001_init.sql`:
```sql
create table books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  volume text,
  pdf_path text not null,
  created_at timestamptz not null default now()
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  lesson_no int not null,
  title_zh text not null,
  title_vi text not null,
  theme text,
  objectives text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'published')),
  created_at timestamptz not null default now(),
  unique (book_id, lesson_no)
);

create table dialogues (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  "order" int not null,
  title_zh text,
  title_vi text,
  audio_code text,
  audio_url text
);

create table dialogue_lines (
  id uuid primary key default gen_random_uuid(),
  dialogue_id uuid not null references dialogues(id) on delete cascade,
  "order" int not null,
  speaker_zh text,
  speaker_pinyin text,
  text_zh text not null,
  pinyin text,
  translation_vi text
);

create table vocabulary (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  "order" int not null,
  category text,
  word_zh text not null,
  pinyin text,
  zhuyin text,
  meaning_vi text,
  audio_url text
);

create table grammar_points (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  "order" int not null,
  title_zh text not null,
  title_vi text,
  structure_note text
);

create table grammar_examples (
  id uuid primary key default gen_random_uuid(),
  grammar_point_id uuid not null references grammar_points(id) on delete cascade,
  "order" int not null,
  text_zh text not null,
  pinyin text,
  translation_vi text
);

create table extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  lesson_no int not null,
  page_start int not null,
  page_end int not null,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'imported', 'failed')),
  raw_json jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public) values ('book-pdfs', 'book-pdfs', false);
insert into storage.buckets (id, name, public) values ('audio', 'audio', false);
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (requires `supabase/config.toml` linked to the project — if not yet linked, run `npx supabase init` then `npx supabase link` first, using the project's own Supabase project ref/URL).

- [ ] **Step 3: Verify tables exist**

Run: `npx supabase db diff --schema public`
Expected: no diff (migration already applied matches remote).

- [ ] **Step 4: Write hand-written row types**

Create `lib/db/types.ts`:
```ts
export type LessonStatus = 'draft' | 'reviewed' | 'published'
export type JobStatus = 'pending' | 'reviewed' | 'imported' | 'failed'

export interface Book {
  id: string
  title: string
  volume: string | null
  pdf_path: string
  created_at: string
}

export interface Lesson {
  id: string
  book_id: string
  lesson_no: number
  title_zh: string
  title_vi: string
  theme: string | null
  objectives: string[]
  status: LessonStatus
  created_at: string
}

export interface Dialogue {
  id: string
  lesson_id: string
  order: number
  title_zh: string | null
  title_vi: string | null
  audio_code: string | null
  audio_url: string | null
}

export interface DialogueLine {
  id: string
  dialogue_id: string
  order: number
  speaker_zh: string | null
  speaker_pinyin: string | null
  text_zh: string
  pinyin: string | null
  translation_vi: string | null
}

export interface VocabularyEntry {
  id: string
  lesson_id: string
  order: number
  category: string | null
  word_zh: string
  pinyin: string | null
  zhuyin: string | null
  meaning_vi: string | null
  audio_url: string | null
}

export interface GrammarPoint {
  id: string
  lesson_id: string
  order: number
  title_zh: string
  title_vi: string | null
  structure_note: string | null
}

export interface GrammarExample {
  id: string
  grammar_point_id: string
  order: number
  text_zh: string
  pinyin: string | null
  translation_vi: string | null
}

export interface ExtractionJob {
  id: string
  book_id: string
  lesson_no: number
  page_start: number
  page_end: number
  status: JobStatus
  raw_json: unknown
  error_message: string | null
  created_at: string
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_init.sql lib/db/types.ts
git commit -m "feat: add database schema and storage buckets"
```

---

## Task 3: Supabase clients and admin auth

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/browser.ts`, `lib/supabase/middleware.ts`
- Create: `middleware.ts`
- Create: `app/login/page.tsx`
- Create: `app/(protected)/layout.tsx`
- Test: `tests/lib/supabase/middleware.test.ts`

**Interfaces:**
- Produces: `createServerSupabase()` (service-role client for route handlers), `createBrowserSupabase()` (anon client for client components), both used by every later task that touches the DB or Storage.

- [ ] **Step 1: Write server client**

Create `lib/supabase/server.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

export function createServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
```

- [ ] **Step 2: Write browser client**

Create `lib/supabase/browser.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr'

export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Write the failing test for the auth-redirect helper**

Create `tests/lib/supabase/middleware.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { shouldRedirectToLogin } from '@/lib/supabase/middleware'

describe('shouldRedirectToLogin', () => {
  it('redirects when there is no session and path is protected', () => {
    expect(shouldRedirectToLogin(null, '/books')).toBe(true)
  })

  it('does not redirect when there is a session', () => {
    expect(shouldRedirectToLogin({ user: { id: '1' } } as any, '/books')).toBe(false)
  })

  it('does not redirect for the login page itself', () => {
    expect(shouldRedirectToLogin(null, '/login')).toBe(false)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test -- tests/lib/supabase/middleware.test.ts`
Expected: FAIL — `shouldRedirectToLogin` not defined.

- [ ] **Step 5: Implement middleware helper and Next.js middleware**

Create `lib/supabase/middleware.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Session } from '@supabase/supabase-js'

export function shouldRedirectToLogin(session: Session | null, pathname: string): boolean {
  if (pathname.startsWith('/login')) return false
  return session === null
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  if (shouldRedirectToLogin(session, request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}
```

Create `middleware.ts`:
```ts
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- tests/lib/supabase/middleware.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Build the login page**

Create `app/login/page.tsx` — a client component with email/password fields calling `createBrowserSupabase().auth.signInWithPassword({ email, password })`, redirecting to `/books` on success and showing the error message on failure. Use shadcn `Input`, `Button`, `Card`. Invoke the `ui-ux-pro-max` skill to pick the layout/spacing/typography for this single-purpose login screen before writing the JSX.

- [ ] **Step 8: Build the protected layout shell**

Create `app/(protected)/layout.tsx` — server component that renders a shared nav (Books / current page) around `children`; actual access control already happens in `middleware.ts`, so this layout only needs to render the shell, not re-check auth.

- [ ] **Step 9: Commit**

```bash
git add lib/supabase middleware.ts app/login app/\(protected\)/layout.tsx tests/lib/supabase
git commit -m "feat: add Supabase clients and single-admin auth"
```

---

## Task 4: PDF slicing utility

**Files:**
- Create: `lib/pdf/slice.ts`
- Test: `tests/lib/pdf/slice.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `sliceBookPdf(sourceBytes: Uint8Array, pageStart: number, pageEnd: number): Promise<Uint8Array>` — 1-indexed, inclusive page range. Used by Task 6 (extraction runner).

- [ ] **Step 1: Write the failing test**

Create `tests/lib/pdf/slice.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { sliceBookPdf } from '@/lib/pdf/slice'

async function makeTestPdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([100, 100])
    page.drawText(`page ${i + 1}`, { x: 10, y: 50 })
  }
  return doc.save()
}

describe('sliceBookPdf', () => {
  it('returns a PDF with only the requested page range', async () => {
    const source = await makeTestPdf(10)
    const sliced = await sliceBookPdf(source, 3, 5)
    const doc = await PDFDocument.load(sliced)
    expect(doc.getPageCount()).toBe(3)
  })

  it('throws when pageStart is greater than pageEnd', async () => {
    const source = await makeTestPdf(5)
    await expect(sliceBookPdf(source, 4, 2)).rejects.toThrow(/pageStart/)
  })

  it('throws when pageEnd exceeds the document length', async () => {
    const source = await makeTestPdf(5)
    await expect(sliceBookPdf(source, 1, 10)).rejects.toThrow(/pageEnd/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/pdf/slice.test.ts`
Expected: FAIL — `lib/pdf/slice.ts` does not exist.

- [ ] **Step 3: Implement the slicer**

Create `lib/pdf/slice.ts`:
```ts
import { PDFDocument } from 'pdf-lib'

export async function sliceBookPdf(
  sourceBytes: Uint8Array,
  pageStart: number,
  pageEnd: number
): Promise<Uint8Array> {
  if (pageStart > pageEnd) {
    throw new Error(`pageStart (${pageStart}) must be <= pageEnd (${pageEnd})`)
  }

  const source = await PDFDocument.load(sourceBytes)
  const totalPages = source.getPageCount()

  if (pageEnd > totalPages) {
    throw new Error(`pageEnd (${pageEnd}) exceeds document length (${totalPages})`)
  }

  const out = await PDFDocument.create()
  const indices = Array.from({ length: pageEnd - pageStart + 1 }, (_, i) => pageStart - 1 + i)
  const copiedPages = await out.copyPages(source, indices)
  copiedPages.forEach((page) => out.addPage(page))

  return out.save()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/pdf/slice.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/pdf/slice.ts tests/lib/pdf/slice.test.ts
git commit -m "feat: add PDF page-range slicing utility"
```

---

## Task 5: Gemini extraction schema and client

**Files:**
- Create: `lib/gemini/schema.ts`
- Create: `lib/gemini/extract.ts`
- Test: `tests/lib/gemini/schema.test.ts`
- Test: `tests/lib/gemini/extract.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (takes a raw PDF `Buffer`/`Uint8Array` directly, e.g. the output of `sliceBookPdf`).
- Produces: `ExtractionResultSchema` (Zod), `type ExtractionResult`, and `extractLessonFromPdf(pdfBytes: Uint8Array, lessonNo: number): Promise<ExtractionResult>`. Used by Task 6.

- [ ] **Step 1: Write the failing schema test**

Create `tests/lib/gemini/schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { ExtractionResultSchema } from '@/lib/gemini/schema'

const validSample = {
  lesson: { lessonNo: 1, titleZh: '歡迎你來臺灣！', titleVi: 'Chào mừng bạn đến Đài Loan!', theme: 'Giới thiệu bản thân', objectives: ['Học cách chào hỏi đơn giản.'] },
  dialogues: [{
    order: 1, titleZh: '對話一', titleVi: 'Hội thoại I', audioCode: '01-1',
    lines: [{ order: 1, speakerZh: '明華', speakerPinyin: 'Mínghuá', textZh: '請問你是陳月美小姐嗎？', pinyin: 'Qǐngwèn nǐ shì Chén Yuèměi xiǎojiě ma?', translationVi: 'Xin hỏi bạn có phải là cô Trần Nguyệt Mỹ không?' }],
  }],
  vocabulary: [{ order: 19, category: 'Cụm từ', wordZh: '歡迎', pinyin: 'huānyíng', zhuyin: 'ㄏㄨㄢ ㄧㄥˊ', meaningVi: 'hoan nghênh, chào mừng' }],
  grammarPoints: [{
    order: 1, titleZh: 'I. 用「很」+ 狀態動詞', titleVi: 'Dùng 很 với động từ trạng thái', structureNote: 'Chủ ngữ + 很 hěn + Động từ trạng thái.',
    examples: [{ order: 1, textZh: '烏龍茶很好喝。', pinyin: 'Wūlóng chá hěn hǎohē.', translationVi: 'Trà Ô Long uống rất ngon.' }],
  }],
}

describe('ExtractionResultSchema', () => {
  it('accepts a well-formed extraction result', () => {
    expect(() => ExtractionResultSchema.parse(validSample)).not.toThrow()
  })

  it('rejects a result missing lesson.titleZh', () => {
    const bad = { ...validSample, lesson: { ...validSample.lesson, titleZh: undefined } }
    expect(() => ExtractionResultSchema.parse(bad)).toThrow()
  })

  it('defaults missing optional pinyin/translation fields to null instead of failing', () => {
    const sparse = {
      ...validSample,
      vocabulary: [{ order: 1, category: null, wordZh: '你好', pinyin: null, zhuyin: null, meaningVi: null }],
    }
    const parsed = ExtractionResultSchema.parse(sparse)
    expect(parsed.vocabulary[0].pinyin).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/gemini/schema.test.ts`
Expected: FAIL — `lib/gemini/schema.ts` does not exist.

- [ ] **Step 3: Implement the Zod schema**

Create `lib/gemini/schema.ts`:
```ts
import { z } from 'zod'

const nullableString = z.string().nullable().default(null)

const DialogueLineSchema = z.object({
  order: z.number(),
  speakerZh: nullableString,
  speakerPinyin: nullableString,
  textZh: z.string(),
  pinyin: nullableString,
  translationVi: nullableString,
})

const DialogueSchema = z.object({
  order: z.number(),
  titleZh: nullableString,
  titleVi: nullableString,
  audioCode: nullableString,
  lines: z.array(DialogueLineSchema),
})

const VocabularyEntrySchema = z.object({
  order: z.number(),
  category: nullableString,
  wordZh: z.string(),
  pinyin: nullableString,
  zhuyin: nullableString,
  meaningVi: nullableString,
})

const GrammarExampleSchema = z.object({
  order: z.number(),
  textZh: z.string(),
  pinyin: nullableString,
  translationVi: nullableString,
})

const GrammarPointSchema = z.object({
  order: z.number(),
  titleZh: z.string(),
  titleVi: nullableString,
  structureNote: nullableString,
  examples: z.array(GrammarExampleSchema),
})

const LessonMetaSchema = z.object({
  lessonNo: z.number(),
  titleZh: z.string(),
  titleVi: z.string(),
  theme: nullableString,
  objectives: z.array(z.string()).default([]),
})

export const ExtractionResultSchema = z.object({
  lesson: LessonMetaSchema,
  dialogues: z.array(DialogueSchema),
  vocabulary: z.array(VocabularyEntrySchema),
  grammarPoints: z.array(GrammarPointSchema),
})

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>

// Gemini responseSchema (JSON Schema subset) mirroring ExtractionResultSchema,
// used to force structured output from the model.
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    lesson: {
      type: 'object',
      properties: {
        lessonNo: { type: 'integer' },
        titleZh: { type: 'string' },
        titleVi: { type: 'string' },
        theme: { type: 'string', nullable: true },
        objectives: { type: 'array', items: { type: 'string' } },
      },
      required: ['lessonNo', 'titleZh', 'titleVi'],
    },
    dialogues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          order: { type: 'integer' },
          titleZh: { type: 'string', nullable: true },
          titleVi: { type: 'string', nullable: true },
          audioCode: { type: 'string', nullable: true },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                order: { type: 'integer' },
                speakerZh: { type: 'string', nullable: true },
                speakerPinyin: { type: 'string', nullable: true },
                textZh: { type: 'string' },
                pinyin: { type: 'string', nullable: true },
                translationVi: { type: 'string', nullable: true },
              },
              required: ['order', 'textZh'],
            },
          },
        },
        required: ['order', 'lines'],
      },
    },
    vocabulary: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          order: { type: 'integer' },
          category: { type: 'string', nullable: true },
          wordZh: { type: 'string' },
          pinyin: { type: 'string', nullable: true },
          zhuyin: { type: 'string', nullable: true },
          meaningVi: { type: 'string', nullable: true },
        },
        required: ['order', 'wordZh'],
      },
    },
    grammarPoints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          order: { type: 'integer' },
          titleZh: { type: 'string' },
          titleVi: { type: 'string', nullable: true },
          structureNote: { type: 'string', nullable: true },
          examples: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                order: { type: 'integer' },
                textZh: { type: 'string' },
                pinyin: { type: 'string', nullable: true },
                translationVi: { type: 'string', nullable: true },
              },
              required: ['order', 'textZh'],
            },
          },
        },
        required: ['order', 'titleZh', 'examples'],
      },
    },
  },
  required: ['lesson', 'dialogues', 'vocabulary', 'grammarPoints'],
} as const
```

- [ ] **Step 4: Run schema test to verify it passes**

Run: `npm run test -- tests/lib/gemini/schema.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for the extraction client (mocked SDK)**

Create `tests/lib/gemini/extract.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'

const generateContentMock = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}))

import { extractLessonFromPdf } from '@/lib/gemini/extract'

describe('extractLessonFromPdf', () => {
  it('parses a valid Gemini JSON response into an ExtractionResult', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        lesson: { lessonNo: 1, titleZh: 'A', titleVi: 'B', theme: null, objectives: [] },
        dialogues: [],
        vocabulary: [],
        grammarPoints: [],
      }),
    })

    const result = await extractLessonFromPdf(new Uint8Array([1, 2, 3]), 1)
    expect(result.lesson.lessonNo).toBe(1)
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3.5-flash-lite' })
    )
  })

  it('throws a descriptive error when the response is not valid JSON', async () => {
    generateContentMock.mockResolvedValueOnce({ text: 'not json' })
    await expect(extractLessonFromPdf(new Uint8Array([1]), 1)).rejects.toThrow(/Gemini/)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test -- tests/lib/gemini/extract.test.ts`
Expected: FAIL — `lib/gemini/extract.ts` does not exist.

- [ ] **Step 7: Implement the extraction client**

Create `lib/gemini/extract.ts`:
```ts
import { GoogleGenAI } from '@google/genai'
import { ExtractionResultSchema, GEMINI_RESPONSE_SCHEMA, type ExtractionResult } from './schema'

const EXTRACTION_PROMPT = `Bạn là công cụ trích xuất nội dung sách giáo trình tiếng Trung "Đương Đại" từ ảnh PDF các trang của một bài học.

Chỉ trích xuất đúng 3 phần sau, bỏ qua mọi nội dung khác:
1. "dialogues": TOÀN BỘ các hội thoại (對話) trong bài, giữ đúng thứ tự dòng thoại, người nói, chữ Hán, pinyin, và mã audio track nếu có (ví dụ "01-1") ở cấp độ hội thoại.
2. "vocabulary": CHỈ các từ nằm trong bảng Từ vựng (生詞) chính thức của bài. KHÔNG lấy từ xuất hiện rải rác trong hội thoại, ngữ pháp, hay bài tập nếu chúng không có trong bảng từ vựng chính thức.
3. "grammarPoints": mỗi điểm ngữ pháp gồm tiêu đề, phần giải thích cấu trúc ("Cấu trúc"), và các ví dụ minh hoạ đánh số. TUYỆT ĐỐI KHÔNG trích xuất phần luyện tập/bài tập hỏi-đáp (練習/Luyện tập) của ngữ pháp.

Trả về đúng theo JSON schema đã cung cấp, không thêm giải thích ngoài JSON.`

export async function extractLessonFromPdf(
  pdfBytes: Uint8Array,
  lessonNo: number
): Promise<ExtractionResult> {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

  const response = await client.models.generateContent({
    model: 'gemini-3.5-flash-lite',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: Buffer.from(pdfBytes).toString('base64') } },
          { text: `${EXTRACTION_PROMPT}\n\nSố bài (lessonNo) là: ${lessonNo}.` },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_RESPONSE_SCHEMA,
    },
  })

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(response.text)
  } catch {
    throw new Error('Gemini response was not valid JSON')
  }

  return ExtractionResultSchema.parse(parsedJson)
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test -- tests/lib/gemini/extract.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add lib/gemini tests/lib/gemini
git commit -m "feat: add Gemini extraction schema and client"
```

---

## Task 6: Book upload (storage + record)

**Files:**
- Create: `app/api/books/route.ts`
- Create: `app/(protected)/books/new/page.tsx`
- Create: `app/(protected)/books/page.tsx`
- Test: `tests/api/books.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase()` from Task 3.
- Produces: `POST /api/books` accepting `multipart/form-data` (`title`, `volume`, `file`), returning `{ id, title, volume, pdf_path }`. Used by the "Tạo extraction job" UI in Task 7.

- [ ] **Step 1: Write the failing test**

Create `tests/api/books.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'

const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'books/test.pdf' }, error: null })
const insertMock = vi.fn().mockReturnValue({
  select: () => ({ single: () => Promise.resolve({ data: { id: '1', title: 'SGK 1', volume: '1', pdf_path: 'books/test.pdf' }, error: null }) }),
})

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    storage: { from: () => ({ upload: uploadMock }) },
    from: () => ({ insert: insertMock }),
  }),
}))

import { POST } from '@/app/api/books/route'

describe('POST /api/books', () => {
  it('uploads the PDF to storage and creates a book row', async () => {
    const form = new FormData()
    form.set('title', 'SGK 1')
    form.set('volume', '1')
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'test.pdf', { type: 'application/pdf' }))

    const req = new Request('http://localhost/api/books', { method: 'POST', body: form })
    const res = await POST(req as any)
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.title).toBe('SGK 1')
    expect(uploadMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/api/books.test.ts`
Expected: FAIL — `app/api/books/route.ts` does not exist.

- [ ] **Step 3: Implement the route handler**

Create `app/api/books/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const form = await request.formData()
  const title = form.get('title') as string
  const volume = (form.get('volume') as string) || null
  const file = form.get('file') as File

  const supabase = createServerSupabase()
  const path = `books/${Date.now()}-${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('book-pdfs')
    .upload(path, await file.arrayBuffer(), { contentType: 'application/pdf' })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('books')
    .insert({ title, volume, pdf_path: path })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/api/books.test.ts`
Expected: PASS

- [ ] **Step 5: Build the upload UI**

Create `app/(protected)/books/new/page.tsx` — client component with a form (`title`, `volume`, file input accepting `.pdf`) that `POST`s to `/api/books` via `fetch` with `FormData`, then redirects to `/books/[id]`. Invoke `ui-ux-pro-max` for the form layout before writing JSX.

- [ ] **Step 6: Build the books list page**

Create `app/(protected)/books/page.tsx` — server component fetching all `books` rows via `createServerSupabase()`, rendering a card/list with title, volume, created_at, and a link to each book's detail page plus a "Thêm sách mới" link to `/books/new`.

- [ ] **Step 7: Commit**

```bash
git add app/api/books app/\(protected\)/books tests/api/books.test.ts
git commit -m "feat: add book PDF upload"
```

---

## Task 7: Page-range picker and extraction job creation

**Files:**
- Create: `app/api/books/[bookId]/pages/route.ts`
- Create: `app/api/jobs/route.ts`
- Create: `app/(protected)/books/[bookId]/jobs/new/page.tsx`
- Create: `app/(protected)/books/[bookId]/page.tsx`
- Test: `tests/api/jobs.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase()`.
- Produces: `GET /api/books/[bookId]/pages` returning `{ signedUrl: string }` for the stored PDF (used client-side by `pdfjs-dist` to render thumbnails); `POST /api/jobs` accepting `{ bookId, lessonNo, pageStart, pageEnd }`, creating an `extraction_jobs` row with `status: 'pending'`. Used by Task 8 (extraction runner).

- [ ] **Step 1: Write the failing test for job creation**

Create `tests/api/jobs.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'

const insertMock = vi.fn().mockReturnValue({
  select: () => ({
    single: () => Promise.resolve({
      data: { id: 'job-1', book_id: 'book-1', lesson_no: 1, page_start: 27, page_end: 45, status: 'pending' },
      error: null,
    }),
  }),
})

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({ from: () => ({ insert: insertMock }) }),
}))

import { POST } from '@/app/api/jobs/route'

describe('POST /api/jobs', () => {
  it('creates a pending extraction job', async () => {
    const req = new Request('http://localhost/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ bookId: 'book-1', lessonNo: 1, pageStart: 27, pageEnd: 45 }),
    })
    const res = await POST(req as any)
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.status).toBe('pending')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ book_id: 'book-1', lesson_no: 1, page_start: 27, page_end: 45, status: 'pending' })
    )
  })

  it('rejects when pageStart > pageEnd', async () => {
    const req = new Request('http://localhost/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ bookId: 'book-1', lessonNo: 1, pageStart: 45, pageEnd: 27 }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/api/jobs.test.ts`
Expected: FAIL — `app/api/jobs/route.ts` does not exist.

- [ ] **Step 3: Implement job creation route**

Create `app/api/jobs/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { bookId, lessonNo, pageStart, pageEnd } = await request.json()

  if (pageStart > pageEnd) {
    return NextResponse.json({ error: 'pageStart must be <= pageEnd' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('extraction_jobs')
    .insert({ book_id: bookId, lesson_no: lessonNo, page_start: pageStart, page_end: pageEnd, status: 'pending' })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/api/jobs.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Implement the signed-URL route for thumbnails**

Create `app/api/books/[bookId]/pages/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(_request: Request, { params }: { params: { bookId: string } }) {
  const supabase = createServerSupabase()
  const { data: book, error: bookError } = await supabase
    .from('books')
    .select('pdf_path')
    .eq('id', params.bookId)
    .single()

  if (bookError || !book) {
    return NextResponse.json({ error: 'book not found' }, { status: 404 })
  }

  const { data, error } = await supabase.storage
    .from('book-pdfs')
    .createSignedUrl(book.pdf_path, 60 * 10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl })
}
```

- [ ] **Step 6: Build the page-range picker UI**

Create `app/(protected)/books/[bookId]/jobs/new/page.tsx` — client component that:
1. Fetches `{ signedUrl }` from `/api/books/[bookId]/pages`.
2. Loads the PDF with `pdfjs-dist` (`getDocument({ url: signedUrl })`) and renders a scrollable grid of page thumbnails (one `<canvas>` per page, rendered at low scale e.g. `0.3`) with page numbers shown.
3. Lets the admin click a start page and an end page (highlights the selected range) and enter `lessonNo`.
4. On submit, `POST`s `{ bookId, lessonNo, pageStart, pageEnd }` to `/api/jobs`, then redirects to `/books/[bookId]/jobs/[jobId]`.

Invoke `ui-ux-pro-max` for the thumbnail grid and range-selection interaction pattern before writing this component — it is the most visual screen in the app.

- [ ] **Step 7: Build the book detail page**

Create `app/(protected)/books/[bookId]/page.tsx` — server component listing this book's `lessons` (with status) and `extraction_jobs` (with status), plus links to "Tạo bài học mới" (`/books/[bookId]/jobs/new`) and "Gắn audio hội thoại" (`/books/[bookId]/audio`, built in Task 10).

- [ ] **Step 8: Commit**

```bash
git add app/api/books/\[bookId\] app/api/jobs app/\(protected\)/books/\[bookId\] tests/api/jobs.test.ts
git commit -m "feat: add page-range picker and extraction job creation"
```

---

## Task 8: Extraction job runner

**Files:**
- Create: `app/api/jobs/[jobId]/run/route.ts`
- Test: `tests/api/jobs-run.test.ts`

**Interfaces:**
- Consumes: `sliceBookPdf` (Task 4), `extractLessonFromPdf` (Task 5), `createServerSupabase()` (Task 3).
- Produces: `POST /api/jobs/[jobId]/run` — downloads the book PDF, slices the job's page range, runs Gemini extraction, and updates the job row to `status: 'pending'` with `raw_json` set, or `status: 'failed'` with `error_message` set. Used by the review UI (Task 9) which triggers this on job creation or on manual "Thử lại".

- [ ] **Step 1: Write the failing test covering both success and failure paths**

Create `tests/api/jobs-run.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'

const singleJobMock = vi.fn()
const singleBookMock = vi.fn()
const downloadMock = vi.fn()
const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'extraction_jobs') {
        return {
          select: () => ({ eq: () => ({ single: singleJobMock }) }),
          update: updateMock,
        }
      }
      if (table === 'books') {
        return { select: () => ({ eq: () => ({ single: singleBookMock }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: { from: () => ({ download: downloadMock }) },
  }),
}))

const sliceMock = vi.fn().mockResolvedValue(new Uint8Array([9, 9]))
vi.mock('@/lib/pdf/slice', () => ({ sliceBookPdf: sliceMock }))

const extractMock = vi.fn()
vi.mock('@/lib/gemini/extract', () => ({ extractLessonFromPdf: extractMock }))

import { POST } from '@/app/api/jobs/[jobId]/run/route'

describe('POST /api/jobs/[jobId]/run', () => {
  it('slices, extracts, and marks the job pending with raw_json on success', async () => {
    singleJobMock.mockResolvedValue({ data: { id: 'job-1', book_id: 'book-1', lesson_no: 1, page_start: 27, page_end: 45 }, error: null })
    singleBookMock.mockResolvedValue({ data: { pdf_path: 'books/x.pdf' }, error: null })
    downloadMock.mockResolvedValue({ data: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }, error: null })
    extractMock.mockResolvedValue({ lesson: { lessonNo: 1 }, dialogues: [], vocabulary: [], grammarPoints: [] })

    const req = new Request('http://localhost/api/jobs/job-1/run', { method: 'POST' })
    const res = await POST(req as any, { params: { jobId: 'job-1' } })

    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', error_message: null })
    )
  })

  it('marks the job failed with an error message when extraction throws', async () => {
    singleJobMock.mockResolvedValue({ data: { id: 'job-1', book_id: 'book-1', lesson_no: 1, page_start: 27, page_end: 45 }, error: null })
    singleBookMock.mockResolvedValue({ data: { pdf_path: 'books/x.pdf' }, error: null })
    downloadMock.mockResolvedValue({ data: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }, error: null })
    extractMock.mockRejectedValue(new Error('Gemini timeout'))

    const req = new Request('http://localhost/api/jobs/job-1/run', { method: 'POST' })
    const res = await POST(req as any, { params: { jobId: 'job-1' } })

    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error_message: 'Gemini timeout' })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/api/jobs-run.test.ts`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Implement the runner**

Create `app/api/jobs/[jobId]/run/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { sliceBookPdf } from '@/lib/pdf/slice'
import { extractLessonFromPdf } from '@/lib/gemini/extract'

export async function POST(_request: Request, { params }: { params: { jobId: string } }) {
  const supabase = createServerSupabase()

  const { data: job, error: jobError } = await supabase
    .from('extraction_jobs')
    .select()
    .eq('id', params.jobId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }

  const { data: book, error: bookError } = await supabase
    .from('books')
    .select()
    .eq('id', job.book_id)
    .single()

  if (bookError || !book) {
    return NextResponse.json({ error: 'book not found' }, { status: 404 })
  }

  try {
    const { data: pdfFile, error: downloadError } = await supabase.storage
      .from('book-pdfs')
      .download(book.pdf_path)

    if (downloadError || !pdfFile) {
      throw new Error(downloadError?.message ?? 'failed to download book PDF')
    }

    const sourceBytes = new Uint8Array(await pdfFile.arrayBuffer())
    const sliced = await sliceBookPdf(sourceBytes, job.page_start, job.page_end)
    const result = await extractLessonFromPdf(sliced, job.lesson_no)

    await supabase
      .from('extraction_jobs')
      .update({ status: 'pending', raw_json: result, error_message: null })
      .eq('id', job.id)

    return NextResponse.json({ status: 'pending', raw_json: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown extraction error'
    await supabase
      .from('extraction_jobs')
      .update({ status: 'failed', error_message: message })
      .eq('id', job.id)

    return NextResponse.json({ status: 'failed', error_message: message })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/api/jobs-run.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/jobs/\[jobId\]/run tests/api/jobs-run.test.ts
git commit -m "feat: add extraction job runner (slice -> Gemini -> save)"
```

---

## Task 9: Review UI

**Files:**
- Create: `app/api/jobs/[jobId]/route.ts`
- Create: `app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx`
- Test: `tests/api/job-detail.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase()`, the `ExtractionResult` shape from Task 5's `lib/gemini/schema.ts`.
- Produces: `GET /api/jobs/[jobId]` returning the job row; `PATCH /api/jobs/[jobId]` accepting `{ raw_json }` to save admin edits and setting `status: 'reviewed'`. Used by Task 10 (import), which requires `status: 'reviewed'` before importing... actually import should accept `pending` or `reviewed` (see Task 10) — the PATCH here just persists edits.

- [ ] **Step 1: Write the failing test**

Create `tests/api/job-detail.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'

const singleMock = vi.fn().mockResolvedValue({ data: { id: 'job-1', status: 'pending', raw_json: { lesson: { lessonNo: 1 } } }, error: null })
const eqUpdateMock = vi.fn().mockResolvedValue({ error: null })
const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: singleMock }) }),
      update: updateMock,
    }),
  }),
}))

import { GET, PATCH } from '@/app/api/jobs/[jobId]/route'

describe('/api/jobs/[jobId]', () => {
  it('GET returns the job', async () => {
    const res = await GET(new Request('http://localhost') as any, { params: { jobId: 'job-1' } })
    const json = await res.json()
    expect(json.id).toBe('job-1')
  })

  it('PATCH saves edited raw_json and marks the job reviewed', async () => {
    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ raw_json: { lesson: { lessonNo: 1, titleZh: 'edited' } } }),
    })
    const res = await PATCH(req as any, { params: { jobId: 'job-1' } })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'reviewed' })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/api/job-detail.test.ts`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Implement the route**

Create `app/api/jobs/[jobId]/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(_request: Request, { params }: { params: { jobId: string } }) {
  const supabase = createServerSupabase()
  const { data, error } = await supabase.from('extraction_jobs').select().eq('id', params.jobId).single()

  if (error || !data) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }
  return NextResponse.json(data)
}

export async function PATCH(request: Request, { params }: { params: { jobId: string } }) {
  const { raw_json } = await request.json()
  const supabase = createServerSupabase()

  const { error } = await supabase
    .from('extraction_jobs')
    .update({ raw_json, status: 'reviewed' })
    .eq('id', params.jobId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ status: 'reviewed' })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/api/job-detail.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Build the review UI**

Create `app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx` — client component, two-column layout:
- Left column: renders the original PDF pages for `job.page_start..job.page_end` using `pdfjs-dist` against the book's signed URL (reuse the fetch-and-render approach from Task 7's picker), scrollable.
- Right column: an editable form driven by `job.raw_json` (the `ExtractionResult` shape) — editable lesson title/theme/objectives, a repeatable list per dialogue/line, per vocabulary entry, per grammar point/example. Use shadcn `Input`/`Textarea`/`Accordion` to group dialogues/vocabulary/grammar sections.
- If `job.status === 'failed'`, show `error_message` and a "Thử lại" button that calls `POST /api/jobs/[jobId]/run` again and reloads.
- A "Lưu" button `PATCH`es the edited JSON to `/api/jobs/[jobId]`.
- Once saved (`status === 'reviewed'`), show an "Import vào DB" button linking to the import action built in Task 10.

Invoke `ui-ux-pro-max` for this screen's two-column layout, spacing, and form density before writing the JSX — it's the most content-heavy screen in the app.

- [ ] **Step 6: Commit**

```bash
git add app/api/jobs/\[jobId\]/route.ts app/\(protected\)/books/\[bookId\]/jobs/\[jobId\] tests/api/job-detail.test.ts
git commit -m "feat: add extraction review UI"
```

---

## Task 10: Import extraction job into lesson tables

**Files:**
- Create: `lib/db/importJob.ts`
- Create: `app/api/jobs/[jobId]/import/route.ts`
- Test: `tests/lib/db/importJob.test.ts`

**Interfaces:**
- Consumes: `ExtractionResult` type (Task 5), `createServerSupabase()` (Task 3).
- Produces: `importExtractionJob(jobId: string): Promise<{ lessonId: string }>` and `POST /api/jobs/[jobId]/import`. Triggers vocabulary TTS generation (Task 11) as part of the import.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/db/importJob.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: Record<string, any> = {}

function makeChain(resolveValue: any) {
  return {
    select: () => ({ single: () => Promise.resolve({ data: resolveValue, error: null }) }),
    eq: function () { return this },
    single: () => Promise.resolve({ data: resolveValue, error: null }),
  }
}

const insertLessonMock = vi.fn()
const generateVocabAudioMock = vi.fn().mockResolvedValue(new Uint8Array([1]))

vi.mock('@/lib/tts/edgeTts', () => ({ generateVocabAudio: generateVocabAudioMock }))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'lessons') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
          insert: (row: any) => {
            insertLessonMock(row)
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'lesson-1', ...row }, error: null }) }) }
          },
        }
      }
      if (table === 'dialogues') {
        return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'dlg-1' }, error: null }) }) }) }
      }
      if (table === 'dialogue_lines') {
        return { insert: () => Promise.resolve({ error: null }) }
      }
      if (table === 'vocabulary') {
        return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'vocab-1' }, error: null }) }) }), update: () => ({ eq: () => Promise.resolve({ error: null }) }) }
      }
      if (table === 'grammar_points') {
        return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'gp-1' }, error: null }) }) }) }
      }
      if (table === 'grammar_examples') {
        return { insert: () => Promise.resolve({ error: null }) }
      }
      if (table === 'extraction_jobs') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({
            data: {
              id: 'job-1', book_id: 'book-1', status: 'reviewed',
              raw_json: {
                lesson: { lessonNo: 1, titleZh: 'A', titleVi: 'B', theme: null, objectives: [] },
                dialogues: [{ order: 1, titleZh: null, titleVi: null, audioCode: '01-1', lines: [{ order: 1, speakerZh: null, speakerPinyin: null, textZh: 'x', pinyin: null, translationVi: null }] }],
                vocabulary: [{ order: 1, category: null, wordZh: '你好', pinyin: 'nǐ hǎo', zhuyin: null, meaningVi: 'xin chào' }],
                grammarPoints: [{ order: 1, titleZh: 'G1', titleVi: null, structureNote: null, examples: [{ order: 1, textZh: 'e', pinyin: null, translationVi: null }] }],
              },
            },
            error: null,
          }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: { from: () => ({ upload: () => Promise.resolve({ data: { path: 'audio/vocab-1.mp3' }, error: null }), getPublicUrl: () => ({ data: { publicUrl: 'https://x/vocab-1.mp3' } }) }) },
  }),
}))

import { importExtractionJob } from '@/lib/db/importJob'

describe('importExtractionJob', () => {
  beforeEach(() => { insertLessonMock.mockClear(); generateVocabAudioMock.mockClear() })

  it('writes lesson, dialogues, vocabulary (with generated audio), and grammar', async () => {
    const result = await importExtractionJob('job-1')
    expect(result.lessonId).toBe('lesson-1')
    expect(insertLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({ book_id: 'book-1', lesson_no: 1, status: 'draft' })
    )
    expect(generateVocabAudioMock).toHaveBeenCalledWith('你好')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/db/importJob.test.ts`
Expected: FAIL — `lib/db/importJob.ts` does not exist.

- [ ] **Step 3: Implement the importer**

Create `lib/db/importJob.ts`:
```ts
import { createServerSupabase } from '@/lib/supabase/server'
import { generateVocabAudio } from '@/lib/tts/edgeTts'
import { ExtractionResultSchema } from '@/lib/gemini/schema'

export async function importExtractionJob(jobId: string): Promise<{ lessonId: string }> {
  const supabase = createServerSupabase()

  const { data: job, error: jobError } = await supabase
    .from('extraction_jobs')
    .select()
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    throw new Error('extraction job not found')
  }

  const result = ExtractionResultSchema.parse(job.raw_json)

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .insert({
      book_id: job.book_id,
      lesson_no: result.lesson.lessonNo,
      title_zh: result.lesson.titleZh,
      title_vi: result.lesson.titleVi,
      theme: result.lesson.theme,
      objectives: result.lesson.objectives,
      status: 'draft',
    })
    .select()
    .single()

  if (lessonError || !lesson) {
    throw new Error(lessonError?.message ?? 'failed to insert lesson')
  }

  for (const dialogue of result.dialogues) {
    const { data: dlgRow, error: dlgError } = await supabase
      .from('dialogues')
      .insert({
        lesson_id: lesson.id,
        order: dialogue.order,
        title_zh: dialogue.titleZh,
        title_vi: dialogue.titleVi,
        audio_code: dialogue.audioCode,
      })
      .select()
      .single()

    if (dlgError || !dlgRow) throw new Error(dlgError?.message ?? 'failed to insert dialogue')

    if (dialogue.lines.length > 0) {
      const { error: linesError } = await supabase.from('dialogue_lines').insert(
        dialogue.lines.map((line) => ({
          dialogue_id: dlgRow.id,
          order: line.order,
          speaker_zh: line.speakerZh,
          speaker_pinyin: line.speakerPinyin,
          text_zh: line.textZh,
          pinyin: line.pinyin,
          translation_vi: line.translationVi,
        }))
      )
      if (linesError) throw new Error(linesError.message)
    }
  }

  for (const vocab of result.vocabulary) {
    const { data: vocabRow, error: vocabError } = await supabase
      .from('vocabulary')
      .insert({
        lesson_id: lesson.id,
        order: vocab.order,
        category: vocab.category,
        word_zh: vocab.wordZh,
        pinyin: vocab.pinyin,
        zhuyin: vocab.zhuyin,
        meaning_vi: vocab.meaningVi,
      })
      .select()
      .single()

    if (vocabError || !vocabRow) throw new Error(vocabError?.message ?? 'failed to insert vocabulary')

    try {
      const audioBytes = await generateVocabAudio(vocab.wordZh)
      const path = `vocab/${vocabRow.id}.mp3`
      await supabase.storage.from('audio').upload(path, audioBytes, { contentType: 'audio/mpeg' })
      const { data: publicUrl } = supabase.storage.from('audio').getPublicUrl(path)
      await supabase.from('vocabulary').update({ audio_url: publicUrl.publicUrl }).eq('id', vocabRow.id)
    } catch {
      // TTS failure never blocks import; audio_url stays null for the admin to regenerate later.
    }
  }

  for (const gp of result.grammarPoints) {
    const { data: gpRow, error: gpError } = await supabase
      .from('grammar_points')
      .insert({
        lesson_id: lesson.id,
        order: gp.order,
        title_zh: gp.titleZh,
        title_vi: gp.titleVi,
        structure_note: gp.structureNote,
      })
      .select()
      .single()

    if (gpError || !gpRow) throw new Error(gpError?.message ?? 'failed to insert grammar point')

    if (gp.examples.length > 0) {
      const { error: exError } = await supabase.from('grammar_examples').insert(
        gp.examples.map((ex) => ({
          grammar_point_id: gpRow.id,
          order: ex.order,
          text_zh: ex.textZh,
          pinyin: ex.pinyin,
          translation_vi: ex.translationVi,
        }))
      )
      if (exError) throw new Error(exError.message)
    }
  }

  await supabase.from('extraction_jobs').update({ status: 'imported' }).eq('id', jobId)

  return { lessonId: lesson.id }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/db/importJob.test.ts`
Expected: PASS

- [ ] **Step 5: Implement the import route**

Create `app/api/jobs/[jobId]/import/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { importExtractionJob } from '@/lib/db/importJob'

export async function POST(_request: Request, { params }: { params: { jobId: string } }) {
  try {
    const result = await importExtractionJob(params.jobId)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown import error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/db/importJob.ts app/api/jobs/\[jobId\]/import tests/lib/db/importJob.test.ts
git commit -m "feat: import reviewed extraction jobs into lesson tables with vocab TTS"
```

---

## Task 11: Vocabulary TTS generation

**Files:**
- Create: `lib/tts/edgeTts.ts`
- Test: `tests/lib/tts/edgeTts.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (already wired into Task 10 above via a mock; this task fills in the real implementation).
- Produces: `generateVocabAudio(text: string): Promise<Uint8Array>` — mp3 bytes for the given Chinese text, used by `lib/db/importJob.ts`.

- [ ] **Step 1: Write the failing test (mocking `msedge-tts`)**

Create `tests/lib/tts/edgeTts.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'

const toArrayBufferMock = vi.fn().mockResolvedValue(Buffer.from([1, 2, 3]))
const toStreamMock = vi.fn()

vi.mock('msedge-tts', () => ({
  MsEdgeTTS: vi.fn().mockImplementation(() => ({
    setMetadata: vi.fn().mockResolvedValue(undefined),
    toArrayBuffer: toArrayBufferMock,
  })),
  OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'audio-24khz-48kbitrate-mono-mp3' },
}))

import { generateVocabAudio } from '@/lib/tts/edgeTts'

describe('generateVocabAudio', () => {
  it('returns mp3 bytes for the given text', async () => {
    const bytes = await generateVocabAudio('你好')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('rejects empty text', async () => {
    await expect(generateVocabAudio('')).rejects.toThrow(/empty/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/tts/edgeTts.test.ts`
Expected: FAIL — `lib/tts/edgeTts.ts` does not exist.

- [ ] **Step 3: Implement the TTS wrapper**

Create `lib/tts/edgeTts.ts`:
```ts
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

const ZH_TW_VOICE = 'zh-TW-HsiaoChenNeural'

export async function generateVocabAudio(text: string): Promise<Uint8Array> {
  if (!text.trim()) {
    throw new Error('generateVocabAudio: text must not be empty')
  }

  const tts = new MsEdgeTTS()
  await tts.setMetadata(ZH_TW_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const { audio } = await tts.toArrayBuffer(text)
  return new Uint8Array(audio)
}
```

Note: if the installed `msedge-tts` version exposes a different result shape from `toArrayBuffer` (some versions return the `ArrayBuffer` directly rather than `{ audio }`), adjust the return line to match — check the actual type signature in `node_modules/msedge-tts/dist/*.d.ts` after `npm install` and align this function's return statement with it before running the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/tts/edgeTts.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/tts/edgeTts.ts tests/lib/tts/edgeTts.test.ts
git commit -m "feat: add edge-tts vocabulary audio generation"
```

---

## Task 12: Dialogue audio bulk upload

**Files:**
- Create: `lib/audio/matchDialogueAudio.ts`
- Create: `app/api/books/[bookId]/audio/route.ts`
- Create: `app/(protected)/books/[bookId]/audio/page.tsx`
- Test: `tests/lib/audio/matchDialogueAudio.test.ts`
- Test: `tests/api/books-audio.test.ts`

**Interfaces:**
- Consumes: `Dialogue` type (Task 2's `lib/db/types.ts`), `createServerSupabase()`.
- Produces: `matchFilesToDialogues(filenames: string[], dialogues: Pick<Dialogue, 'id' | 'audio_code'>[]): { matched: { dialogueId: string; filename: string }[]; unmatched: string[] }`, and `POST /api/books/[bookId]/audio` (multipart, multiple files) that uploads matched files to Storage and sets `dialogues.audio_url`.

- [ ] **Step 1: Write the failing test for the matcher**

Create `tests/lib/audio/matchDialogueAudio.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { matchFilesToDialogues } from '@/lib/audio/matchDialogueAudio'

describe('matchFilesToDialogues', () => {
  const dialogues = [
    { id: 'd1', audio_code: '01-1' },
    { id: 'd2', audio_code: '01-3' },
  ]

  it('matches filenames to dialogues by audio_code, ignoring extension and case', () => {
    const { matched, unmatched } = matchFilesToDialogues(['01-1.mp3', '01-3.MP3'], dialogues)
    expect(matched).toEqual([
      { dialogueId: 'd1', filename: '01-1.mp3' },
      { dialogueId: 'd2', filename: '01-3.MP3' },
    ])
    expect(unmatched).toEqual([])
  })

  it('lists files with no matching audio_code as unmatched', () => {
    const { matched, unmatched } = matchFilesToDialogues(['99-9.mp3'], dialogues)
    expect(matched).toEqual([])
    expect(unmatched).toEqual(['99-9.mp3'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/audio/matchDialogueAudio.test.ts`
Expected: FAIL — `lib/audio/matchDialogueAudio.ts` does not exist.

- [ ] **Step 3: Implement the matcher**

Create `lib/audio/matchDialogueAudio.ts`:
```ts
interface DialogueForMatch {
  id: string
  audio_code: string | null
}

interface MatchResult {
  matched: { dialogueId: string; filename: string }[]
  unmatched: string[]
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '')
}

export function matchFilesToDialogues(filenames: string[], dialogues: DialogueForMatch[]): MatchResult {
  const byCode = new Map(
    dialogues.filter((d) => d.audio_code).map((d) => [d.audio_code!.toLowerCase(), d.id])
  )

  const matched: MatchResult['matched'] = []
  const unmatched: string[] = []

  for (const filename of filenames) {
    const code = stripExtension(filename).toLowerCase()
    const dialogueId = byCode.get(code)
    if (dialogueId) {
      matched.push({ dialogueId, filename })
    } else {
      unmatched.push(filename)
    }
  }

  return { matched, unmatched }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/audio/matchDialogueAudio.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for the upload route**

Create `tests/api/books-audio.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'

const dialoguesSelectMock = vi.fn().mockResolvedValue({
  data: [{ id: 'd1', audio_code: '01-1' }, { id: 'd2', audio_code: '01-3' }],
  error: null,
})
const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'dialogues/d1.mp3' }, error: null })
const getPublicUrlMock = vi.fn().mockReturnValue({ data: { publicUrl: 'https://x/d1.mp3' } })
const updateEqMock = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'dialogues') {
        return {
          select: () => ({ eq: () => dialoguesSelectMock() }),
          update: () => ({ eq: updateEqMock }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: { from: () => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock }) },
  }),
}))

import { POST } from '@/app/api/books/[bookId]/audio/route'

describe('POST /api/books/[bookId]/audio', () => {
  it('uploads matched files and reports unmatched filenames', async () => {
    const form = new FormData()
    form.append('files', new File([new Uint8Array([1])], '01-1.mp3', { type: 'audio/mpeg' }))
    form.append('files', new File([new Uint8Array([1])], '99-9.mp3', { type: 'audio/mpeg' }))

    const req = new Request('http://localhost', { method: 'POST', body: form })
    const res = await POST(req as any, { params: { bookId: 'book-1' } })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.unmatched).toEqual(['99-9.mp3'])
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test -- tests/api/books-audio.test.ts`
Expected: FAIL — route does not exist.

- [ ] **Step 7: Implement the upload route**

Create `app/api/books/[bookId]/audio/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { matchFilesToDialogues } from '@/lib/audio/matchDialogueAudio'

export async function POST(request: Request, { params }: { params: { bookId: string } }) {
  const form = await request.formData()
  const files = form.getAll('files') as File[]

  const supabase = createServerSupabase()

  const { data: lessonRows } = await supabase
    .from('lessons')
    .select('id')
    .eq('book_id', params.bookId)

  const lessonIds = (lessonRows ?? []).map((l: { id: string }) => l.id)

  const { data: dialogues } = await supabase
    .from('dialogues')
    .select('id, audio_code')
    .in('lesson_id', lessonIds)

  const { matched, unmatched } = matchFilesToDialogues(
    files.map((f) => f.name),
    dialogues ?? []
  )

  for (const { dialogueId, filename } of matched) {
    const file = files.find((f) => f.name === filename)!
    const path = `dialogues/${dialogueId}.mp3`
    await supabase.storage.from('audio').upload(path, await file.arrayBuffer(), {
      contentType: 'audio/mpeg',
      upsert: true,
    })
    const { data: publicUrl } = supabase.storage.from('audio').getPublicUrl(path)
    await supabase.from('dialogues').update({ audio_url: publicUrl.publicUrl }).eq('id', dialogueId)
  }

  return NextResponse.json({ matchedCount: matched.length, unmatched })
}
```

Note: this uses `.in('lesson_id', lessonIds)`, which the route test above stubs away at the `select().eq()` level — align the stub if the real Supabase query builder chain differs once implemented against a live instance (see Task 2's linked project).

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test -- tests/api/books-audio.test.ts`
Expected: PASS

- [ ] **Step 9: Build the bulk upload UI**

Create `app/(protected)/books/[bookId]/audio/page.tsx` — client component with a multi-file input (`accept="audio/mpeg"`, `multiple`), a "Tải lên" button that `POST`s all files as `FormData` to `/api/books/[bookId]/audio`, and a results panel listing matched count and the `unmatched` filenames returned by the API so the admin can rename and retry. Invoke `ui-ux-pro-max` for this screen's layout before writing the JSX.

- [ ] **Step 10: Commit**

```bash
git add lib/audio app/api/books/\[bookId\]/audio app/\(protected\)/books/\[bookId\]/audio tests/lib/audio tests/api/books-audio.test.ts
git commit -m "feat: add bulk dialogue audio upload matched by audio_code"
```

---

## Task 13: Lesson list and publish workflow

**Files:**
- Create: `app/api/lessons/[lessonId]/publish/route.ts`
- Create: `app/(protected)/lessons/[lessonId]/page.tsx`
- Modify: `app/(protected)/books/[bookId]/page.tsx` (link each lesson row to `/lessons/[lessonId]`)
- Test: `tests/api/lessons-publish.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase()`, `LessonStatus` type (Task 2).
- Produces: `PATCH /api/lessons/[lessonId]/publish` accepting `{ status: LessonStatus }`, restricted to `draft -> reviewed -> published` forward transitions (and `published -> draft` to unpublish). This is the last step of the pipeline — no later task depends on it.

- [ ] **Step 1: Write the failing test**

Create `tests/api/lessons-publish.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'

const singleMock = vi.fn().mockResolvedValue({ data: { id: 'lesson-1', status: 'draft' }, error: null })
const eqUpdateMock = vi.fn().mockResolvedValue({ error: null })
const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: singleMock }) }),
      update: updateMock,
    }),
  }),
}))

import { PATCH } from '@/app/api/lessons/[lessonId]/publish/route'

describe('PATCH /api/lessons/[lessonId]/publish', () => {
  it('allows draft -> reviewed', async () => {
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: 'reviewed' }) })
    const res = await PATCH(req as any, { params: { lessonId: 'lesson-1' } })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({ status: 'reviewed' })
  })

  it('rejects draft -> published (must go through reviewed)', async () => {
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: 'published' }) })
    const res = await PATCH(req as any, { params: { lessonId: 'lesson-1' } })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/api/lessons-publish.test.ts`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Implement the route**

Create `app/api/lessons/[lessonId]/publish/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import type { LessonStatus } from '@/lib/db/types'

const ALLOWED_TRANSITIONS: Record<LessonStatus, LessonStatus[]> = {
  draft: ['reviewed'],
  reviewed: ['published', 'draft'],
  published: ['draft'],
}

export async function PATCH(request: Request, { params }: { params: { lessonId: string } }) {
  const { status: nextStatus } = (await request.json()) as { status: LessonStatus }
  const supabase = createServerSupabase()

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select()
    .eq('id', params.lessonId)
    .single()

  if (lessonError || !lesson) {
    return NextResponse.json({ error: 'lesson not found' }, { status: 404 })
  }

  if (!ALLOWED_TRANSITIONS[lesson.status as LessonStatus].includes(nextStatus)) {
    return NextResponse.json(
      { error: `cannot transition from ${lesson.status} to ${nextStatus}` },
      { status: 400 }
    )
  }

  const { error } = await supabase.from('lessons').update({ status: nextStatus }).eq('id', params.lessonId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ status: nextStatus })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/api/lessons-publish.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Build the lesson detail page**

Create `app/(protected)/lessons/[lessonId]/page.tsx` — server component rendering the lesson's dialogues (with lines and audio player if `audio_url` is set), vocabulary (with audio player if `audio_url` is set), and grammar points with examples, read directly from the DB (not `raw_json`). Include a status badge and a client-side control that calls `PATCH /api/lessons/[lessonId]/publish` to move the lesson forward (`draft → reviewed → published`) or back to `draft`. Invoke `ui-ux-pro-max` for this content-review layout before writing the JSX.

- [ ] **Step 6: Link lessons from the book detail page**

Modify `app/(protected)/books/[bookId]/page.tsx`: wrap each lesson row in a `<Link href={`/lessons/${lesson.id}`}>`.

- [ ] **Step 7: Commit**

```bash
git add app/api/lessons app/\(protected\)/lessons app/\(protected\)/books/\[bookId\]/page.tsx tests/api/lessons-publish.test.ts
git commit -m "feat: add lesson detail view and publish workflow"
```

---

## Task 14: Manual end-to-end verification

This task has no automated test — it exercises the full pipeline against the real Supabase project and Gemini API using the actual textbook PDF, per the spec's Testing section ("test thủ công end-to-end với 2-3 bài thật").

- [ ] **Step 1: Set real environment variables**

Fill in `.env.local` (copied from `.env.local.example`) with the real Supabase project URL/keys and a real `GEMINI_API_KEY`.

- [ ] **Step 2: Run the dev server**

Run: `npm run dev`

- [ ] **Step 3: Walk through the full pipeline for 2-3 real lessons**

1. Log in at `/login` with the admin account created in the Supabase dashboard.
2. Upload the real `Giáo trình tiếng Trung đương đại SGK 1.pdf` at `/books/new`.
3. Create an extraction job at `/books/[bookId]/jobs/new` for Bài 1 (pages 27-45 per the earlier page survey), submit, and confirm the job runs (status becomes `pending` with `raw_json` populated, or `failed` with a visible error).
4. On the review screen, verify dialogues/vocabulary/grammar extracted match the PDF (cross-check against the rendered pages), and that no grammar exercises appear.
5. Edit at least one field to confirm `PATCH` persists it, then import.
6. Confirm the lesson appears at `/lessons/[lessonId]` with correct dialogues/vocabulary/grammar and that vocabulary entries have a working `audio_url` (edge-tts).
7. Go to `/books/[bookId]/audio`, upload a couple of real mp3 files named by their track codes, and confirm they attach to the right dialogues and any unmatched ones are reported.
8. Move the lesson through `draft → reviewed → published` and confirm the status updates.
9. Repeat steps 3-8 for a second and third lesson to confirm the pipeline holds up across different page layouts (e.g. a lesson with multiple dialogues, or a longer vocabulary list).

- [ ] **Step 4: Record any extraction quality issues**

If Gemini consistently misreads specific fields (e.g. zhuyin columns), note it — this is the trigger for falling back to Approach B (render pages to images before sending to Gemini) from the spec, which is a follow-up change to `lib/gemini/extract.ts` only, not a redesign.

---

---

## Task 15: Rework upload flow for client-side PDF slicing (Supabase free-tier 50MB limit)

**Discovered during Task 14 manual verification:** Supabase's Free plan has a hard, non-negotiable 50MB per-file Storage limit (confirmed in the dashboard: Free = 50MB, Pro/Team = 500GB, no way to raise it on Free). The real textbook PDF is 339MB. The original design (Task 6: upload the whole book once to Storage, Task 8: download it server-side and slice per job) cannot work on this project's infrastructure. This task reworks the flow so the full book PDF is **never stored in Supabase at all** — only small, already-sliced per-lesson PDFs (a `pdf-lib` slice is done client-side, in the browser, before upload).

**New flow:**
1. "Tạo book" only collects `title`/`volume` metadata — no PDF upload, no Storage write. `books` no longer has a `pdf_path` column.
2. On the "Tạo bài học mới" page, the admin picks the book's PDF **from their own computer** via a plain `<input type="file">` — it is never uploaded anywhere at this point. The browser reads it into an `ArrayBuffer` and renders page thumbnails directly from those local bytes with `pdfjs-dist` (`getDocument({ data: arrayBuffer })` — no signed URL, no server round-trip for thumbnails).
3. When the admin confirms a page range + lesson number, the browser slices out exactly those pages **client-side**, in-browser, using the same `sliceBookPdf` function from `lib/pdf/slice.ts` (Task 4) — it's plain `pdf-lib`, which runs fine in a browser bundle, no changes needed to that function itself. The resulting small PDF (a handful of MB, safely under 50MB) is uploaded as part of the `POST /api/jobs` request; the full original file never leaves the browser.
4. `extraction_jobs` gains a `sliced_pdf_path` column pointing at this small per-job file in the `book-pdfs` Storage bucket. The extraction runner (Task 8's route) now just downloads this small file directly and sends it to Gemini — it no longer downloads a book PDF or calls `sliceBookPdf` itself (slicing already happened client-side).
5. The review UI (Task 9) renders PDF pages from the job's own `sliced_pdf_path` (via a new signed-URL endpoint scoped to the job) instead of from a book-level PDF — since the sliced file already contains only the selected pages, no `page_start`/`page_end` offset math is needed when rendering it; render every page of the sliced file.

**Files:**
- Create: `supabase/migrations/0002_client_side_slicing.sql` — `alter table books drop column pdf_path;` and `alter table extraction_jobs add column sliced_pdf_path text;` (nullable — the app always sets it when creating a job, but Postgres doesn't need a default since these are new/adding-only changes to a table that may already have rows from earlier manual testing).
- Modify: `lib/db/types.ts` — remove `Book.pdf_path`, add `ExtractionJob.sliced_pdf_path: string | null`.
- Modify: `app/api/books/route.ts` — accept a plain JSON body `{ title, volume }` (or a `FormData` without a `file` field — implementer's choice, but no Storage upload happens here anymore), insert into `books` without `pdf_path`.
- Modify: `app/(protected)/books/new/page.tsx` — remove the file input entirely; just `title`/`volume` fields.
- Delete: `app/api/books/[bookId]/pages/route.ts` — no longer needed (there is no book-level stored PDF to sign a URL for).
- Create: `app/api/jobs/[jobId]/pdf/route.ts` — `GET`, returns `{ signedUrl }` for `extraction_jobs.sliced_pdf_path` (404 if the job or its `sliced_pdf_path` doesn't exist yet), mirroring the shape of the old `books/[bookId]/pages` route but scoped to a job. Uses Next.js 16 async `params`.
- Modify: `app/api/jobs/route.ts` (`POST /api/jobs`) — change from a JSON-only body to `multipart/form-data` accepting `bookId`, `lessonNo`, `pageStart`, `pageEnd`, and `file` (the already-client-sliced small PDF). Insert the `extraction_jobs` row first (without `sliced_pdf_path`) to obtain its `id`, upload the file to the `book-pdfs` bucket at `jobs/${id}.pdf`, then update the row's `sliced_pdf_path` to that path, then return the final row with `status: 'pending'`. Update `tests/api/jobs.test.ts` to match the new multipart contract (still keep the `pageStart > pageEnd` validation test).
- Modify: `app/(protected)/books/[bookId]/jobs/new/page.tsx` — replace the "fetch signed URL, load PDF from remote" logic with: local `<input type="file" accept="application/pdf">` → read to `ArrayBuffer` → `pdfjs-dist` renders thumbnails directly from those bytes (same UI/selection interaction already built in Task 7 — keep the anchor/focus range-selection state machine and visual design from that task, just change where the PDF bytes come from). On submit, call `sliceBookPdf` (import from `lib/pdf/slice.ts` — it's plain `pdf-lib`, works client-side) on the local bytes with the selected range, then `POST` the result as `multipart/form-data` to `/api/jobs` along with `bookId`/`lessonNo`/`pageStart`/`pageEnd`.
- Modify: `app/api/jobs/[jobId]/run/route.ts` — remove the book-lookup and `sliceBookPdf` call entirely; instead download `extraction_jobs.sliced_pdf_path` directly from the `book-pdfs` bucket and pass those bytes straight to `extractLessonFromPdf(bytes, job.lesson_no)`. Update `tests/api/jobs-run.test.ts` to drop the `sliceBookPdf`/book-lookup mocks accordingly (keep the success/failure status-update assertions).
- Modify: `app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx` — left column now fetches the signed URL from the new `GET /api/jobs/[jobId]/pdf` route and renders every page of that small file (no `page_start`/`page_end` offset — the file already only contains the selected range).
- Modify: `app/(protected)/books/[bookId]/page.tsx` — no functional change expected, but fix if it references anything from `books.pdf_path`.

**Constraints carried over from earlier tasks (do not violate):**
- Next.js 16 async route `params` pattern, consistently, in every route touched.
- Keep using shadcn components / existing Vietnamese labels / existing visual patterns already established (this task is a plumbing change, not a redesign — no need to re-invoke `ui-ux-pro-max`, just adapt the existing page-range-picker and review-UI layouts to the new data source).
- The live Supabase project already has the OLD schema applied (with `books.pdf_path` and no `sliced_pdf_path`) — the new migration `0002_client_side_slicing.sql` must be handed to the human operator to run in the Supabase SQL Editor the same way `0001_init.sql` was; the implementer cannot run it directly (no DB credentials/CLI access), but should still write it correctly and say so in the report.

**Testing:** update/adapt every existing automated test that touches the changed files (`tests/api/books.test.ts`, `tests/api/jobs.test.ts`, `tests/api/jobs-run.test.ts`) so the full suite passes; add a test for the new `GET /api/jobs/[jobId]/pdf` route mirroring the pattern of the old `books/[bookId]/pages` route test if one existed, or a new simple one (job found → signed URL returned; job/path missing → 404). `npx tsc --noEmit` and `npm run build` must be clean at the end.

---

## Task 16: Fix Gemini extraction dropping vocabulary meaningVi/category

**Discovered during Task 14 live verification against the real textbook and real Gemini API:** ran a real extraction job against Bài 1 (pages 27-45 of the actual PDF). Chữ Hán (`wordZh`), `pinyin`, and `zhuyin` came back 100% correct for all 43 vocabulary entries — but **`meaningVi` and `category` were `null` for every single entry**, even though the source pages clearly have a Vietnamese meaning column and category groupings ("Tên riêng", "Cụm từ", etc. — confirmed visually on the source PDF page for this exact lesson). Dialogues and grammar points extracted correctly with no similar gaps. This is a real, reproducible defect, not a one-off flake — it is systemic across all 43 entries in one real run.

**Root cause (likely):** `lib/gemini/extract.ts`'s `EXTRACTION_PROMPT` tells Gemini what sections to extract (dialogues/vocabulary/grammar) but never explicitly says "capture the Vietnamese meaning and category for each vocabulary entry." `lib/gemini/schema.ts`'s `GEMINI_RESPONSE_SCHEMA` (the JSON Schema passed as `responseSchema` to steer structured output) has no `description` field on any property — Gemini's structured-output mode relies heavily on schema property descriptions to know what each field should actually contain; two fields with no description and no prompt mention are the most likely to be silently left null.

**Fix:**
1. In `lib/gemini/schema.ts`, add a `description` string to every property in `GEMINI_RESPONSE_SCHEMA`, especially (but not only) `vocabulary[].meaningVi` (e.g. "Nghĩa tiếng Việt của từ, lấy nguyên văn từ cột nghĩa trong bảng từ vựng — KHÔNG được để trống nếu sách có ghi nghĩa") and `vocabulary[].category` (e.g. "Tên nhóm từ vựng như in trong sách, ví dụ 'Tên riêng', 'Cụm từ', 'Danh từ' — lấy từ tiêu đề nhóm ngay phía trên trong bảng"). Add descriptions to the other fields too (`wordZh`, `pinyin`, `zhuyin`, dialogue fields, grammar fields) for consistency and to reduce the chance of a similar silent-drop bug elsewhere, even though those fields extracted correctly this run.
2. In `lib/gemini/extract.ts`'s `EXTRACTION_PROMPT`, add an explicit line under the vocabulary instruction requiring every entry to include its Vietnamese meaning (`meaningVi`) and its category/group label (`category`) exactly as printed in the book, and to never leave `meaningVi` null if the book shows a meaning for that word.
3. These are prompt/schema text changes only — no changes to `ExtractionResultSchema` (the Zod validator) or any TypeScript types, since `meaningVi`/`category` were always part of the shape, just not reliably populated by the model.

**Testing:** the existing Vitest tests for `lib/gemini/schema.ts` and `lib/gemini/extract.ts` mock the Gemini SDK entirely, so they will still pass unchanged (this bug can't be caught by mocked unit tests — it's a live-model-behavior issue). No new automated test is expected to catch this category of bug; instead, after this fix lands, the human operator (with the orchestrating session) will re-run a real extraction against the same real lesson pages used to discover the bug and manually confirm `meaningVi`/`category` are now populated for all/most entries before considering Task 14 verification complete. Do still run `npx tsc --noEmit`, the full test suite, and `npm run build` to confirm nothing else broke.

**Files:**
- Modify: `lib/gemini/schema.ts` (add `description` to `GEMINI_RESPONSE_SCHEMA` properties)
- Modify: `lib/gemini/extract.ts` (strengthen `EXTRACTION_PROMPT`)

---

## Task 17: Remove zhuyin (chú âm) field entirely

**User request:** the zhuyin/bopomofo column is not used for anything and should be removed from the whole system — database, Gemini extraction, and every UI screen that shows it.

**Scope:** `zhuyin` currently appears in: `supabase/migrations/0001_init.sql` (`vocabulary.zhuyin` column), `lib/db/types.ts` (`VocabularyEntry.zhuyin`), `lib/gemini/schema.ts` (`VocabularyEntrySchema.zhuyin` in the Zod schema, and the corresponding property + description in `GEMINI_RESPONSE_SCHEMA`), `lib/db/importJob.ts` (writes `zhuyin` into the `vocabulary` insert), `app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx` (review-UI editable field for each vocab entry), `app/(protected)/lessons/[lessonId]/page.tsx` (read-only display in the published lesson view), `tests/lib/db/importJob.test.ts`, `tests/lib/gemini/schema.test.ts`.

**Files:**
- Create: `supabase/migrations/0004_remove_zhuyin.sql` — `alter table vocabulary drop column zhuyin;`. Same caveat as every prior migration: cannot be applied live from this environment (no DB CLI access), human operator must run it in the Supabase SQL Editor.
- Modify: `lib/db/types.ts` — remove `zhuyin` from `VocabularyEntry`.
- Modify: `lib/gemini/schema.ts` — remove `zhuyin` from `VocabularyEntrySchema` (Zod) and from `GEMINI_RESPONSE_SCHEMA`'s vocabulary item properties (including its `description`).
- Modify: `lib/gemini/extract.ts` — if `EXTRACTION_PROMPT` mentions zhuyin/chú âm by name anywhere, remove that mention too (check the current text, added descriptions in Task 16 may reference it).
- Modify: `lib/db/importJob.ts` — remove `zhuyin: vocab.zhuyin` (or equivalent) from the `vocabulary` insert payload.
- Modify: `app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx` — remove the zhuyin input field from the vocabulary edit form, and remove it from the local editable-state shape if one is hand-typed there.
- Modify: `app/(protected)/lessons/[lessonId]/page.tsx` — remove the zhuyin display from the vocabulary list.
- Update: `tests/lib/db/importJob.test.ts`, `tests/lib/gemini/schema.test.ts` — remove `zhuyin` from mock/sample data and any assertions that reference it.

**Testing:** run `npx tsc --noEmit`, full `npm run test`, `npm run build`, `npm run lint` — all clean at the end. No new test is needed beyond updating the existing ones to no longer reference the removed field.

---

## Self-Review Notes

- **Spec coverage:** upload/storage (Task 6), page-range extraction job creation (Task 7), slicing (Task 4), Gemini extraction restricted to dialogues/official-vocab/grammar-without-exercises (Task 5), review+edit UI (Task 9), import with duplicate `lesson_no` handled by the DB's `unique (book_id, lesson_no)` constraint surfacing as a Postgres error the import route returns as a 500 with message (admin sees it and can decide to edit `lessonNo` before retrying), vocabulary TTS (Task 11) wired non-blocking into import (Task 10), dialogue audio bulk upload matched by `audio_code` (Task 12), publish workflow (Task 13), single-admin auth (Task 3), Gemini model pinned to `gemini-3.5-flash-lite` (Task 5). All covered.
- **Placeholder scan:** no TBD/"add error handling later" markers remain; every step has concrete code or a fully specified UI behavior description.
- **Type consistency:** `ExtractionResult` (Task 5) field names (`titleZh`, `wordZh`, etc.) are used identically in Task 9's review UI description, Task 10's importer, and Task 5's own tests. DB column names (`title_zh`, `word_zh`, snake_case) are used consistently across Tasks 2, 6-13. `matchFilesToDialogues` signature defined in Task 12 Step 3 matches its usage in Task 12 Step 7.
