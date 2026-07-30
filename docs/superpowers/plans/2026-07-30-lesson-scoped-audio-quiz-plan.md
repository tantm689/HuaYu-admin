# Lesson-Scoped Audio/Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop the `audio_ready`/`quiz_ready` extraction-job statuses so Import happens right after text review, and move Audio/Quiz generation into two new tabs on the Lesson edit page, operating directly on the real `vocabulary`/`quiz_questions` tables instead of a job's draft `raw_json`.

**Architecture:** Shrink `extraction_jobs.status` to `pending → reviewed → imported`. Delete the job-scoped Audio/Quiz pages, routes, and DB helpers (`generateJobAudio.ts`, `generateJobQuiz.ts`) since their logic moves to lesson-scoped equivalents. Extend the existing `lib/db/generateLessonAudio.ts` with a new "regenerate all" function. Write a new `lib/db/generateLessonQuiz.ts` that adapts `LessonFullView` (from `getLessonFull`) into the `ExtractionResult` shape the existing `lib/gemini/generateQuiz.ts` already consumes, then writes results straight into `quiz_questions` via delete-then-insert per part. Change the Lesson edit page's guard from "redirect away if not draft" to "always viewable, only editing controls hidden when not draft," and add Audio/Quiz as two more tabs alongside the existing three.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod, Supabase Postgres, Vitest, `@google/genai` (Gemini), edge-tts via `msedge-tts`.

## Global Constraints

- Every new/modified file must pass `npx tsc --noEmit -p tsconfig.json`, `npx eslint <files>`, and `npx vitest run` before a task is done — the only quality gates this project has.
- All UI-facing strings are Vietnamese, matching the rest of the admin app.
- Audio/Quiz tab generate/edit controls are visible only when `lesson.status === 'draft'`; at any other status the tab renders read-only (same principle the other three tabs will now follow).
- Import is allowed once `extraction_jobs.status === 'reviewed'` (no longer waits for `audio_ready`/`quiz_ready`, which no longer exist).
- Bulk audio regeneration always overwrites every word's `audio_url` (no idempotent-skip); the existing "fill only missing" behavior stays available as a separate, non-destructive action.
- Quiz generation per lesson is never blocked by missing audio — an advisory message is shown instead of disabling the generate buttons.
- Migrations in this repo are written but never auto-applied; existing migrations up to `0019_quiz_questions.sql` are already live-pending. This plan needs no new migration (`quiz_questions.lesson_id` already exists).

---

## File Structure

- **`lib/db/types.ts`** (modify) — narrow `JobStatus` to drop `'audio_ready' | 'quiz_ready'`.
- **`lib/db/importJob.ts`** (modify) — guard changes from "audio_ready or quiz_ready" to "reviewed"; the `quiz_questions` insert block (which read `result.quizQuestions`) is removed since jobs no longer carry a quiz draft.
- **`lib/gemini/schema.ts`** (modify) — remove `quizQuestions` field from `ExtractionResultSchema` (quiz no longer travels through a job's `raw_json`).
- **`app/api/jobs/[jobId]/route.ts`** (modify) — the PATCH handler's status-preservation logic (`job.status === 'pending' || 'reviewed' ? 'reviewed' : job.status`) simplifies since only `pending`/`reviewed`/`imported` remain; read the file first to confirm the exact current logic before editing.
- **`app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx`** (modify) — remove the "Sinh & duyệt Audio"/"Sinh & duyệt Quiz" buttons; "Import vào DB" becomes visible once `job.status === 'reviewed'`.
- **Delete:** `app/(protected)/books/[bookId]/jobs/[jobId]/audio/page.tsx`, `app/(protected)/books/[bookId]/jobs/[jobId]/quiz/page.tsx`, `app/api/jobs/[jobId]/audio/route.ts`, `app/api/jobs/[jobId]/quiz/route.ts`, `lib/db/generateJobAudio.ts`, `lib/db/generateJobQuiz.ts`, and their test files (`tests/lib/db/generateJobAudio.test.ts`, `tests/lib/db/generateJobQuiz.test.ts`).
- **`lib/db/generateLessonAudio.ts`** (modify) — add `regenerateAllLessonAudio(lessonId, voice)`: clears every word's `audio_url` in the lesson then regenerates all of them (unlike the existing `generateLessonAudio`, which only fills gaps).
- **`app/api/lessons/[lessonId]/audio/route.ts`** (modify) — POST body gains an optional `mode: 'fill' | 'regenerateAll'` (default `'fill'`) to route to the right function.
- **`lib/db/generateLessonQuiz.ts`** (new) — `generateLessonQuizPart1(lessonId)`, `generateLessonQuizPart2(lessonId)`: load the lesson via `getLessonFull`, adapt to `ExtractionResult` shape, call the existing `generateQuizPart1`/`generateQuizPart2`, then delete-then-insert that part's rows in `quiz_questions`. Also `updateQuizQuestion(id, payload)` and `deleteQuizQuestion(id)` for per-item edits, and `getLessonQuizQuestions(lessonId)` to read them back.
- **`app/api/lessons/[lessonId]/quiz/route.ts`** (new) — `POST` (generate one part, `?part=1|2`), `PATCH` (edit one question's payload, body `{id, payload}`), `DELETE` (remove one question, `?id=`).
- **`app/(protected)/lessons/[lessonId]/edit/page.tsx`** (modify) — drop the `data.status !== "draft"` redirect-away block; add two tabs ("Audio", "Quiz") to the existing `Tabs`; each tab's mutating controls are gated on `data.status === "draft"`.
- **Test files:** `tests/lib/db/types.test.ts` doesn't exist (types have no runtime behavior, skip); `tests/lib/db/importJob.test.ts` (modify — drop the quiz-insert test, update status guard tests); `tests/lib/gemini/schema.test.ts` (modify — drop the two `quizQuestions` tests); `tests/lib/db/generateLessonAudio.test.ts` (new, if none exists — check first); `tests/lib/db/generateLessonQuiz.test.ts` (new).

---

### Task 1: Shrink `JobStatus` and update `importJob.ts`'s guard

**Files:**
- Modify: `lib/db/types.ts`
- Modify: `lib/db/importJob.ts`
- Modify: `tests/lib/db/importJob.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `JobStatus = 'pending' | 'reviewed' | 'imported' | 'failed'` (used by Task 2's route file and any remaining job-status UI).

- [ ] **Step 1: Update the `JobStatus` type**

In `lib/db/types.ts`, change:

```typescript
export type JobStatus = 'pending' | 'reviewed' | 'audio_ready' | 'quiz_ready' | 'imported' | 'failed'
```

to:

```typescript
export type JobStatus = 'pending' | 'reviewed' | 'imported' | 'failed'
```

- [ ] **Step 2: Update `importExtractionJob`'s guard and remove the quiz insert**

In `lib/db/importJob.ts`, change:

```typescript
  // Import is reachable once audio has been generated (status 'audio_ready'
  // or later). Scope 4 ("Sinh & duyệt Quiz") doesn't exist yet, so
  // 'audio_ready' is allowed through directly rather than gating on
  // 'quiz_ready' - otherwise no lesson could ship until that page exists.
  if (job.status !== 'audio_ready' && job.status !== 'quiz_ready') {
    throw new JobNotReadyForImportError(
      'Công việc cần hoàn tất bước "Sinh & duyệt Audio" trước khi import vào cơ sở dữ liệu.'
    )
  }
```

to:

```typescript
  // Import is reachable once text has been reviewed. Audio and Quiz are no
  // longer steps in the job pipeline - they're generated later, on the
  // imported lesson's own Audio/Quiz tabs (lib/db/generateLessonAudio.ts,
  // lib/db/generateLessonQuiz.ts), which operate on real DB rows instead of
  // a job's draft raw_json.
  if (job.status !== 'reviewed') {
    throw new JobNotReadyForImportError(
      'Công việc cần được duyệt (bấm "Lưu") trước khi import vào cơ sở dữ liệu.'
    )
  }
```

Then remove this block entirely (it references `result.quizQuestions`, which no longer exists once Task 3 removes that field from `ExtractionResultSchema`):

```typescript
    if (result.quizQuestions.length > 0) {
      const { error: quizError } = await supabase.from('quiz_questions').insert(
        result.quizQuestions.map((q) => {
          const { part, type, order, ...payload } = q
          return { lesson_id: lesson.id, part, type, order, payload }
        })
      )
      if (quizError) throw new Error(quizError.message)
    }
```

- [ ] **Step 3: Update the test file**

In `tests/lib/db/importJob.test.ts`:
1. Change `let jobStatus = 'audio_ready'` to `let jobStatus = 'reviewed'` (both the module-level declaration and the `beforeEach` reset).
2. Change the test `'rejects importing a job that has not finished audio generation yet'` (currently sets `jobStatus = 'reviewed'` and expects a throw) to instead set `jobStatus = 'pending'` and rename it to `'rejects importing a job that has not been reviewed yet'`.
3. Change the test `'allows importing a job once quiz_ready'` (currently sets `jobStatus = 'quiz_ready'`) to instead just rely on the `beforeEach` default of `'reviewed'` and rename it to `'allows importing a job once reviewed'` — remove the `jobStatus = 'quiz_ready'` line since `'reviewed'` is already the default.
4. Delete the entire test `'inserts quiz questions from raw_json.quizQuestions into quiz_questions, tagged with the new lesson id'` (the last one in the file) — quiz insertion during import no longer happens.
5. Remove the now-unused `insertQuizQuestionsMock` and `quizQuestionsFixture` from the mock setup (the `vi.hoisted` block, the `quiz_questions` table case in the `from()` dispatcher, the `beforeEach` reset lines, and the `quizQuestions: quizQuestionsFixture` line inside the `extraction_jobs` mock's `raw_json`).

- [ ] **Step 4: Run the test file**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/db/importJob.test.ts`
Expected: PASS, all remaining cases (7 tests: already-imported rejection, not-yet-reviewed rejection, allows-reviewed success, lesson/dialogue/vocab/grammar writes, sub-point writes, sliced-PDF cleanup, overwrite-existing-lesson).

- [ ] **Step 5: Typecheck**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json`
Expected: errors will appear for every OTHER file that still references `'audio_ready'`/`'quiz_ready'` (routes, pages, other tests) — this is expected at this point in the plan; subsequent tasks fix them. Confirm the errors you see are ONLY in files this plan's later tasks will touch (job audio/quiz pages+routes, the job-review page, `generateJobAudio.ts`/`generateJobQuiz.ts` and their tests) — if you see an error in a file not mentioned anywhere in this plan, stop and report it, don't guess a fix.

- [ ] **Step 6: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add lib/db/types.ts lib/db/importJob.ts tests/lib/db/importJob.test.ts
git commit -m "feat: import right after text review, drop audio_ready/quiz_ready statuses"
```

---

### Task 2: Remove `quizQuestions` from `ExtractionResultSchema`

**Files:**
- Modify: `lib/gemini/schema.ts`
- Modify: `tests/lib/gemini/schema.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `ExtractionResult` (the type used by `lib/db/importJob.ts`, the job PATCH route, and formerly `generateJobAudio.ts`/`generateJobQuiz.ts`) no longer has a `quizQuestions` field.

- [ ] **Step 1: Remove the field and its import**

In `lib/gemini/schema.ts`, remove this import (no longer needed):

```typescript
import { QuizQuestionSchema } from './quizSchema'
```

Change:

```typescript
export const ExtractionResultSchema = z.object({
  lesson: LessonMetaSchema,
  dialogues: z.array(DialogueSchema),
  grammarPoints: z.array(GrammarPointSchema),
  quizQuestions: z.array(QuizQuestionSchema).default([]),
})
```

to:

```typescript
export const ExtractionResultSchema = z.object({
  lesson: LessonMetaSchema,
  dialogues: z.array(DialogueSchema),
  grammarPoints: z.array(GrammarPointSchema),
})
```

- [ ] **Step 2: Remove the two `quizQuestions` tests**

In `tests/lib/gemini/schema.test.ts`, delete these two tests (the last two in the file):

```typescript
  it('defaults quizQuestions to an empty array when absent (older jobs predate this field)', () => {
    const parsed = ExtractionResultSchema.parse({
      lesson: { lessonNo: 1, titleZh: 'A', titleVi: 'B' },
      dialogues: [],
      grammarPoints: [],
    })
    expect(parsed.quizQuestions).toEqual([])
  })

  it('accepts a valid quizQuestions array', () => {
    const parsed = ExtractionResultSchema.parse({
      lesson: { lessonNo: 1, titleZh: 'A', titleVi: 'B' },
      dialogues: [],
      grammarPoints: [],
      quizQuestions: [
        {
          part: 1,
          type: 'pinyin_choice',
          order: 1,
          prompt: '你好',
          choices: ['nǐ hǎo', 'a', 'b', 'c'],
          correctIndex: 0,
        },
      ],
    })
    expect(parsed.quizQuestions).toHaveLength(1)
  })
```

- [ ] **Step 3: Run the test file**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/gemini/schema.test.ts`
Expected: PASS, remaining cases (the two quizQuestions ones are gone).

- [ ] **Step 4: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add lib/gemini/schema.ts tests/lib/gemini/schema.test.ts
git commit -m "feat: remove quizQuestions field from ExtractionResultSchema"
```

---

### Task 3: Delete job-scoped Audio/Quiz pages, routes, and DB helpers

**Files:**
- Delete: `app/(protected)/books/[bookId]/jobs/[jobId]/audio/page.tsx`
- Delete: `app/(protected)/books/[bookId]/jobs/[jobId]/quiz/page.tsx`
- Delete: `app/api/jobs/[jobId]/audio/route.ts`
- Delete: `app/api/jobs/[jobId]/quiz/route.ts`
- Delete: `lib/db/generateJobAudio.ts`
- Delete: `lib/db/generateJobQuiz.ts`
- Delete: `tests/lib/db/generateJobAudio.test.ts`
- Delete: `tests/lib/db/generateJobQuiz.test.ts`
- Modify: `app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing — this is pure removal plus one small edit to the job-review page's button row.

- [ ] **Step 1: Delete the files**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git rm -r "app/(protected)/books/[bookId]/jobs/[jobId]/audio"
git rm -r "app/(protected)/books/[bookId]/jobs/[jobId]/quiz"
git rm "app/api/jobs/[jobId]/audio/route.ts"
git rm -r "app/api/jobs/[jobId]/audio"
git rm "app/api/jobs/[jobId]/quiz/route.ts"
git rm -r "app/api/jobs/[jobId]/quiz"
git rm lib/db/generateJobAudio.ts
git rm lib/db/generateJobQuiz.ts
git rm tests/lib/db/generateJobAudio.test.ts
git rm tests/lib/db/generateJobQuiz.test.ts
```

(If `git rm -r` on a directory fails because the directory also contains other files you should NOT delete, list the directory first with a normal file-listing tool and delete only the specific `page.tsx`/`route.ts` files plus their now-empty parent directories.)

- [ ] **Step 2: Read the job-review page's current button block**

Read `app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx` around the section containing `Sinh &amp; duyệt Audio` (search for that string) to see its exact current surroundings before editing — the plan's Step 3 below shows the target end state, but you need the exact current indentation/structure to edit correctly.

- [ ] **Step 3: Remove the Audio/Quiz buttons, update Import's visibility condition**

Change this block:

```tsx
          {job.status === "reviewed" && (
            <Button variant="outline" onClick={() => router.push(`/books/${bookId}/jobs/${jobId}/audio`)}>
              Sinh &amp; duyệt Audio
            </Button>
          )}
          {(job.status === "audio_ready" || job.status === "quiz_ready") && (
            <Button variant="outline" onClick={() => router.push(`/books/${bookId}/jobs/${jobId}/quiz`)}>
              Sinh &amp; duyệt Quiz
            </Button>
          )}
          {(job.status === "audio_ready" || job.status === "quiz_ready") && (
            <Button variant="outline" onClick={handleImport} disabled={isImporting}>
              {isImporting ? "Đang nhập..." : "Import vào DB"}
            </Button>
          )}
```

to:

```tsx
          {job.status === "reviewed" && (
            <Button variant="outline" onClick={handleImport} disabled={isImporting}>
              {isImporting ? "Đang nhập..." : "Import vào DB"}
            </Button>
          )}
```

- [ ] **Step 4: Search for and remove any remaining references to the deleted routes/statuses**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && grep -rn "audio_ready\|quiz_ready\|jobs/\[jobId\]/audio\|jobs/\[jobId\]/quiz\|generateJobAudio\|generateJobQuiz" app lib tests --include="*.ts" --include="*.tsx"`

Fix any hits this command shows in files NOT already covered by Tasks 1-3 (there shouldn't be any if Tasks 1-3 were done correctly, but this is your safety net before moving on — this repo has had audio_ready/quiz_ready references in several files from a prior session).

- [ ] **Step 5: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint "app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx"`
Expected: no errors related to the deleted files or the button-block edit. (Other pre-existing errors from Task 1's step 5 that belong to files THIS task deletes should now be gone; if any tsc errors remain outside what Tasks 4-6 will touch, stop and report.)

- [ ] **Step 6: Run the full test suite**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run`
Expected: PASS (the deleted test files are simply gone from the run; no other test should reference the deleted modules — if one does, that's a gap this task's Step 4 grep should have caught).

- [ ] **Step 7: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add -A
git commit -m "feat: delete job-scoped Audio/Quiz pages, routes, and DB helpers"
```

---

### Task 4: Add bulk-regenerate to lesson-scoped audio, extend the audio route

**Files:**
- Modify: `lib/db/generateLessonAudio.ts`
- Modify: `app/api/lessons/[lessonId]/audio/route.ts`
- Test: `tests/lib/db/generateLessonAudio.test.ts` (check whether this file already exists first — if it doesn't, create it; if it does, add to it)

**Interfaces:**
- Consumes: `TtsVoice` from `lib/tts/generateAudio.ts` (existing, unchanged).
- Produces: `regenerateAllLessonAudio(lessonId: string, voice?: TtsVoice): Promise<void>` in `lib/db/generateLessonAudio.ts`, used by Task 6 (the new Audio tab UI) via the extended route.

- [ ] **Step 1: Check for an existing test file**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && dir tests\lib\db\generateLessonAudio.test.ts` (or use a file-listing tool) to see if this test file already exists. If it does, read it fully before adding new tests — match its existing Supabase mock style exactly (this repo's convention: a `vi.hoisted` block of mock functions, a `from(table)` dispatcher, `beforeEach` resets). If it doesn't exist, you're creating it from scratch — base your mock style on `tests/lib/db/importJob.test.ts`'s dispatcher pattern (read that file's mock setup for the `vocabulary` table specifically) since both hit the same tables.

- [ ] **Step 2: Write the failing test for `regenerateAllLessonAudio`**

Add (or create the file with) this test, adapting the exact mock wiring to whatever you found/decided in Step 1 — the assertions below are the requirement, not literal copy-paste if the file's existing mock shape differs:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { generateAudioMock, uploadMock, updateVocabMock } = vi.hoisted(() => ({
  generateAudioMock: vi.fn(),
  uploadMock: vi.fn(),
  updateVocabMock: vi.fn(),
}))

vi.mock('@/lib/tts/generateAudio', () => ({
  generateAudio: generateAudioMock,
}))

let vocabRows: { id: string; word_zh: string; audio_url: string | null }[] = []

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'dialogues') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'dlg-1' }], error: null }) }) }
      }
      if (table === 'vocabulary') {
        return {
          select: () => ({ in: () => Promise.resolve({ data: vocabRows, error: null }) }),
          update: (row: any) => ({
            eq: (_col: string, id: string) => {
              updateVocabMock(id, row)
              const target = vocabRows.find((v) => v.id === id)
              if (target) target.audio_url = row.audio_url
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: {
      from: () => ({
        upload: (path: string, buffer: Buffer) => {
          uploadMock(path, buffer)
          return Promise.resolve({ data: { path }, error: null })
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x/${path}` } }),
      }),
    },
  }),
}))

import { generateLessonAudio, regenerateAllLessonAudio } from '@/lib/db/generateLessonAudio'

describe('regenerateAllLessonAudio', () => {
  beforeEach(() => {
    vocabRows = [
      { id: 'vocab-1', word_zh: '你好', audio_url: 'https://x/vocab/vocab-1.mp3?v=1' },
      { id: 'vocab-2', word_zh: '謝謝', audio_url: null },
    ]
    generateAudioMock.mockClear()
    uploadMock.mockClear()
    updateVocabMock.mockClear()
    generateAudioMock.mockResolvedValue(Buffer.from([1, 2, 3]))
  })

  it('regenerates audio for every word, including ones that already have audio_url', async () => {
    await regenerateAllLessonAudio('lesson-1', 'zh-TW-YunJheNeural')

    expect(generateAudioMock).toHaveBeenCalledTimes(2)
    expect(generateAudioMock).toHaveBeenCalledWith('你好', 'zh-TW-YunJheNeural')
    expect(generateAudioMock).toHaveBeenCalledWith('謝謝', 'zh-TW-YunJheNeural')
    expect(updateVocabMock).toHaveBeenCalledTimes(2)
  })
})

describe('generateLessonAudio (idempotent fill, existing behavior)', () => {
  beforeEach(() => {
    vocabRows = [
      { id: 'vocab-1', word_zh: '你好', audio_url: 'https://x/vocab/vocab-1.mp3?v=1' },
      { id: 'vocab-2', word_zh: '謝謝', audio_url: null },
    ]
    generateAudioMock.mockClear()
    updateVocabMock.mockClear()
    generateAudioMock.mockResolvedValue(Buffer.from([1, 2, 3]))
  })

  it('only fills words missing audio_url, skipping ones that already have it', async () => {
    await generateLessonAudio('lesson-1')
    expect(generateAudioMock).toHaveBeenCalledTimes(1)
    expect(generateAudioMock).toHaveBeenCalledWith('謝謝', 'zh-TW-HsiaoChenNeural')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/db/generateLessonAudio.test.ts`
Expected: FAIL — `regenerateAllLessonAudio` is not exported yet.

- [ ] **Step 4: Implement `regenerateAllLessonAudio`**

Add to `lib/db/generateLessonAudio.ts` (after the existing `generateLessonAudio` function, before `regenerateLessonAudioItem`):

```typescript
// Regenerates EVERY vocab word's audio in the lesson, overwriting any
// existing audio_url - unlike generateLessonAudio (which only fills gaps),
// this is for the admin's "Sinh lại toàn bộ" action when they want a full
// redo (e.g. switching every word to a different voice at once).
export async function regenerateAllLessonAudio(lessonId: string, voice: TtsVoice = DEFAULT_VOICE): Promise<void> {
  const supabase = createServerSupabase()

  const { data: dialogues, error: dialoguesError } = await supabase
    .from('dialogues')
    .select('id')
    .eq('lesson_id', lessonId)
  if (dialoguesError) throw new Error(dialoguesError.message)
  const dialogueIds = (dialogues ?? []).map((d: { id: string }) => d.id)

  const { data: vocabulary, error: vocabError } =
    dialogueIds.length > 0
      ? await supabase.from('vocabulary').select('id, word_zh').in('dialogue_id', dialogueIds)
      : { data: [] as { id: string; word_zh: string }[], error: null }
  if (vocabError) throw new Error(vocabError.message)

  const pendingWork: (() => Promise<void>)[] = []

  for (const vocab of vocabulary ?? []) {
    pendingWork.push(async () => {
      const audioUrl = await uploadAudio(supabase, 'vocab', vocab.id, vocab.word_zh, voice)
      const { error } = await supabase.from('vocabulary').update({ audio_url: audioUrl }).eq('id', vocab.id)
      if (error) throw new Error(error.message)
    })
  }

  const outcomes = await runWithConcurrency(pendingWork, TTS_CONCURRENCY)
  const failures = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected')
  if (failures.length > 0) {
    throw new Error(`Sinh lại audio thất bại cho ${failures.length}/${outcomes.length} mục. Các mục thành công đã được lưu, có thể thử lại.`)
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/db/generateLessonAudio.test.ts`
Expected: PASS, both describe blocks.

- [ ] **Step 6: Extend the audio route with a `mode` param**

Read `app/api/lessons/[lessonId]/audio/route.ts` fully (already shown above in this plan's context-gathering, but re-read it live before editing since exact current formatting matters). Change the `POST` handler from:

```typescript
export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params
  const body = await request.json().catch(() => ({}))
  const voice = body.voice as TtsVoice | undefined

  try {
    await generateLessonAudio(lessonId, voice)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown audio generation error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

to:

```typescript
export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params
  const body = await request.json().catch(() => ({}))
  const voice = body.voice as TtsVoice | undefined
  const mode = (body.mode as 'fill' | 'regenerateAll' | undefined) ?? 'fill'

  try {
    if (mode === 'regenerateAll') {
      await regenerateAllLessonAudio(lessonId, voice)
    } else {
      await generateLessonAudio(lessonId, voice)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown audio generation error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

And update the import line from:

```typescript
import { generateLessonAudio, regenerateLessonAudioItem } from '@/lib/db/generateLessonAudio'
```

to:

```typescript
import { generateLessonAudio, regenerateAllLessonAudio, regenerateLessonAudioItem } from '@/lib/db/generateLessonAudio'
```

- [ ] **Step 7: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint lib/db/generateLessonAudio.ts "app/api/lessons/[lessonId]/audio/route.ts" tests/lib/db/generateLessonAudio.test.ts`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add lib/db/generateLessonAudio.ts "app/api/lessons/[lessonId]/audio/route.ts" tests/lib/db/generateLessonAudio.test.ts
git commit -m "feat: add bulk-regenerate mode to lesson audio generation"
```

---

### Task 5: Lesson-scoped quiz generation (`lib/db/generateLessonQuiz.ts` + route)

**Files:**
- Create: `lib/db/generateLessonQuiz.ts`
- Create: `app/api/lessons/[lessonId]/quiz/route.ts`
- Test: `tests/lib/db/generateLessonQuiz.test.ts`

**Interfaces:**
- Consumes: `getLessonFull(lessonId): Promise<LessonFullView | null>` (`lib/db/getLessonFull.ts`, existing, unchanged); `generateQuizPart1(result: ExtractionResult): Promise<QuizGenerationResult<Part1Question>>` and `generateQuizPart2(result: ExtractionResult): Promise<QuizGenerationResult<Part2Question>>` (`lib/gemini/generateQuiz.ts`, existing, unchanged — `QuizGenerationResult<T> = { questions: T[]; usedFallbackModel: boolean }`); `QuizQuestion` (DB row shape: `{id, lesson_id, part, type, order, payload}`, `lib/db/types.ts`, existing).
- Produces: `generateLessonQuizPart1(lessonId): Promise<{ questions: QuizQuestion[]; usedFallbackModel: boolean }>`, `generateLessonQuizPart2(lessonId): Promise<{ questions: QuizQuestion[]; usedFallbackModel: boolean }>`, `getLessonQuizQuestions(lessonId): Promise<QuizQuestion[]>`, `updateQuizQuestion(id: string, payload: unknown): Promise<void>`, `updateQuizQuestionOrder(id: string, order: number): Promise<void>`, `deleteQuizQuestion(id: string): Promise<void>` — all used by Task 7 (the Quiz tab UI) via the route this task also creates: `GET /api/lessons/[lessonId]/quiz` (list), `POST /api/lessons/[lessonId]/quiz?part=1|2` (generate), `PATCH /api/lessons/[lessonId]/quiz` (body `{id, payload?, order?}`, edit and/or reorder), `DELETE /api/lessons/[lessonId]/quiz?id=` (remove).

- [ ] **Step 1: Write the failing test**

Create `tests/lib/db/generateLessonQuiz.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { generateQuizPart1Mock, generateQuizPart2Mock } = vi.hoisted(() => ({
  generateQuizPart1Mock: vi.fn(),
  generateQuizPart2Mock: vi.fn(),
}))

vi.mock('@/lib/gemini/generateQuiz', () => ({
  generateQuizPart1: generateQuizPart1Mock,
  generateQuizPart2: generateQuizPart2Mock,
}))

const { getLessonFullMock } = vi.hoisted(() => ({ getLessonFullMock: vi.fn() }))

vi.mock('@/lib/db/getLessonFull', () => ({
  getLessonFull: getLessonFullMock,
}))

const deleteEqMock = vi.fn()
const insertMock = vi.fn()
const selectEqMock = vi.fn()
const updateMock = vi.fn()
const deleteQuestionMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'quiz_questions') {
        return {
          delete: () => ({
            eq: (col: string, id: string) => {
              if (col === 'lesson_id') {
                return { eq: (col2: string, part: number) => {
                  deleteEqMock(id, part)
                  return Promise.resolve({ error: null })
                } }
              }
              deleteQuestionMock(id)
              return Promise.resolve({ error: null })
            },
          }),
          insert: (rows: any) => {
            insertMock(rows)
            return Promise.resolve({ error: null })
          },
          select: () => ({
            eq: (col: string, id: string) => {
              selectEqMock(col, id)
              return Promise.resolve({
                data: [
                  { id: 'q1', lesson_id: 'lesson-1', part: 1, type: 'pinyin_choice', order: 1, payload: { prompt: 'x' } },
                ],
                error: null,
              })
            },
          }),
          update: (row: any) => ({
            eq: (_col: string, id: string) => {
              updateMock(id, row)
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  generateLessonQuizPart1,
  generateLessonQuizPart2,
  getLessonQuizQuestions,
  updateQuizQuestion,
  updateQuizQuestionOrder,
  deleteQuizQuestion,
} from '@/lib/db/generateLessonQuiz'

function baseLesson() {
  return {
    id: 'lesson-1',
    bookId: 'book-1',
    lessonNo: 1,
    titleZh: 'A',
    titleVi: 'B',
    theme: null,
    objectives: [],
    status: 'draft' as const,
    dialogues: [
      {
        id: 'dlg-1',
        order: 1,
        kind: 'dialogue' as const,
        audioCode: null,
        audioUrl: null,
        lines: [
          { id: 'line-1', order: 1, speakerZh: null, speakerPinyin: null, textZh: '你好', pinyin: null, translationVi: null, audioUrl: null },
        ],
        vocabulary: [
          { id: 'vocab-1', order: 1, wordZh: '你好', pinyin: 'nǐ hǎo', meaningVi: 'xin chào', audioUrl: 'https://x/vocab-1.mp3' },
        ],
      },
    ],
    grammarPoints: [],
  }
}

const fifteenPart1: any[] = Array.from({ length: 15 }, (_, i) => ({
  part: 1,
  type: 'pinyin_choice',
  order: i + 1,
  prompt: 'x',
  choices: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
}))

const fifteenPart2: any[] = Array.from({ length: 15 }, (_, i) => ({
  part: 2,
  type: 'fill_blank',
  order: i + 1,
  sentence: 'y___z',
  choices: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
}))

describe('generateLessonQuizPart1', () => {
  beforeEach(() => {
    getLessonFullMock.mockClear()
    generateQuizPart1Mock.mockClear()
    deleteEqMock.mockClear()
    insertMock.mockClear()
    getLessonFullMock.mockResolvedValue(baseLesson())
  })

  it('adapts the lesson to ExtractionResult shape, calls generateQuizPart1, and replaces part-1 rows', async () => {
    generateQuizPart1Mock.mockResolvedValue({ questions: fifteenPart1, usedFallbackModel: false })

    const { questions, usedFallbackModel } = await generateLessonQuizPart1('lesson-1')

    expect(questions).toHaveLength(15)
    expect(usedFallbackModel).toBe(false)
    expect(deleteEqMock).toHaveBeenCalledWith('lesson-1', 1)
    expect(insertMock).toHaveBeenCalledTimes(1)
    const insertedRows = insertMock.mock.calls[0][0]
    expect(insertedRows).toHaveLength(15)
    expect(insertedRows[0]).toMatchObject({ lesson_id: 'lesson-1', part: 1, type: 'pinyin_choice', order: 1 })
    expect(insertedRows[0].payload).toMatchObject({ prompt: 'x', choices: ['a', 'b', 'c', 'd'], correctIndex: 0 })

    const passedResult = generateQuizPart1Mock.mock.calls[0][0]
    expect(passedResult.dialogues[0].vocabulary[0]).toMatchObject({ wordZh: '你好', audioUrl: 'https://x/vocab-1.mp3' })
  })

  it('throws when the lesson does not exist', async () => {
    getLessonFullMock.mockResolvedValue(null)
    await expect(generateLessonQuizPart1('missing')).rejects.toThrow()
  })
})

describe('generateLessonQuizPart2', () => {
  beforeEach(() => {
    getLessonFullMock.mockClear()
    generateQuizPart2Mock.mockClear()
    deleteEqMock.mockClear()
    insertMock.mockClear()
    getLessonFullMock.mockResolvedValue(baseLesson())
  })

  it('adapts the lesson, calls generateQuizPart2, and replaces part-2 rows', async () => {
    generateQuizPart2Mock.mockResolvedValue({ questions: fifteenPart2, usedFallbackModel: true })

    const { questions, usedFallbackModel } = await generateLessonQuizPart2('lesson-1')

    expect(questions).toHaveLength(15)
    expect(usedFallbackModel).toBe(true)
    expect(deleteEqMock).toHaveBeenCalledWith('lesson-1', 2)
    expect(insertMock).toHaveBeenCalledTimes(1)
  })
})

describe('getLessonQuizQuestions', () => {
  it('returns the lesson\'s quiz question rows', async () => {
    selectEqMock.mockClear()
    const rows = await getLessonQuizQuestions('lesson-1')
    expect(rows).toHaveLength(1)
    expect(selectEqMock).toHaveBeenCalledWith('lesson_id', 'lesson-1')
  })
})

describe('updateQuizQuestion', () => {
  it('updates the payload of one question by id', async () => {
    updateMock.mockClear()
    await updateQuizQuestion('q1', { prompt: 'new' })
    expect(updateMock).toHaveBeenCalledWith('q1', { payload: { prompt: 'new' } })
  })
})

describe('updateQuizQuestionOrder', () => {
  it('updates the order of one question by id', async () => {
    updateMock.mockClear()
    await updateQuizQuestionOrder('q1', 3)
    expect(updateMock).toHaveBeenCalledWith('q1', { order: 3 })
  })
})

describe('deleteQuizQuestion', () => {
  it('deletes one question by id', async () => {
    deleteQuestionMock.mockClear()
    await deleteQuizQuestion('q1')
    expect(deleteQuestionMock).toHaveBeenCalledWith('q1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/db/generateLessonQuiz.test.ts`
Expected: FAIL — `Cannot find module '@/lib/db/generateLessonQuiz'`.

- [ ] **Step 3: Write `lib/db/generateLessonQuiz.ts`**

```typescript
import { createServerSupabase } from '@/lib/supabase/server'
import { getLessonFull } from '@/lib/db/getLessonFull'
import { generateQuizPart1, generateQuizPart2 } from '@/lib/gemini/generateQuiz'
import type { ExtractionResult } from '@/lib/gemini/schema'
import type { Part1Question, Part2Question } from '@/lib/gemini/quizSchema'
import type { QuizQuestion } from '@/lib/db/types'

// Adapts a LessonFullView (real DB rows, via getLessonFull) into the
// ExtractionResult shape lib/gemini/generateQuiz.ts already knows how to
// consume - it only reads lesson/dialogues/grammarPoints, so this doesn't
// need every field ExtractionResult normally carries, just the ones the
// quiz prompt actually uses (wordZh/pinyin/meaningVi/audioUrl for
// vocabulary, textZh for dialogue lines, sections/examples for grammar).
function toExtractionResult(lesson: NonNullable<Awaited<ReturnType<typeof getLessonFull>>>): ExtractionResult {
  return {
    lesson: {
      lessonNo: lesson.lessonNo,
      titleZh: lesson.titleZh,
      titleVi: lesson.titleVi,
      theme: lesson.theme,
      objectives: lesson.objectives,
    },
    dialogues: lesson.dialogues.map((d) => ({
      order: d.order,
      kind: d.kind,
      audioCode: d.audioCode,
      lines: d.lines.map((l) => ({
        order: l.order,
        speakerZh: l.speakerZh,
        speakerPinyin: l.speakerPinyin,
        textZh: l.textZh,
        pinyin: l.pinyin,
        translationVi: l.translationVi,
      })),
      vocabulary: d.vocabulary.map((v) => ({
        order: v.order,
        wordZh: v.wordZh,
        pinyin: v.pinyin,
        meaningVi: v.meaningVi,
        audioUrl: v.audioUrl,
      })),
    })),
    grammarPoints: lesson.grammarPoints.map((g) => ({
      order: g.order,
      titleVi: g.titleVi,
      sections: g.sections.map((s) => ({
        order: s.order,
        label: s.label,
        content: s.content,
        examples: s.examples.map((e) => ({
          order: e.order,
          textZh: e.textZh,
          pinyin: e.pinyin,
          translationVi: e.translationVi,
        })),
        items: s.items.map((it) => ({
          order: it.order,
          label: it.label,
          content: it.content,
          examples: it.examples.map((e) => ({
            order: e.order,
            textZh: e.textZh,
            pinyin: e.pinyin,
            translationVi: e.translationVi,
          })),
        })),
      })),
      subPoints: g.subPoints.map((sp) => ({
        order: sp.order,
        label: sp.label,
        titleVi: sp.titleVi,
        sections: sp.sections.map((s) => ({
          order: s.order,
          label: s.label,
          content: s.content,
          examples: s.examples.map((e) => ({
            order: e.order,
            textZh: e.textZh,
            pinyin: e.pinyin,
            translationVi: e.translationVi,
          })),
          items: s.items.map((it) => ({
            order: it.order,
            label: it.label,
            content: it.content,
            examples: it.examples.map((e) => ({
              order: e.order,
              textZh: e.textZh,
              pinyin: e.pinyin,
              translationVi: e.translationVi,
            })),
          })),
        })),
      })),
    })),
  }
}

async function loadLesson(lessonId: string): Promise<NonNullable<Awaited<ReturnType<typeof getLessonFull>>>> {
  const lesson = await getLessonFull(lessonId)
  if (!lesson) throw new Error('Không tìm thấy bài học.')
  return lesson
}

function toRow(lessonId: string, q: Part1Question | Part2Question): {
  lesson_id: string
  part: number
  type: string
  order: number
  payload: unknown
} {
  const { part, type, order, ...payload } = q
  return { lesson_id: lessonId, part, type, order, payload }
}

async function replacePartRows(
  lessonId: string,
  part: 1 | 2,
  rows: { lesson_id: string; part: number; type: string; order: number; payload: unknown }[]
): Promise<void> {
  const supabase = createServerSupabase()

  const { error: deleteError } = await supabase
    .from('quiz_questions')
    .delete()
    .eq('lesson_id', lessonId)
    .eq('part', part)
  if (deleteError) throw new Error(deleteError.message)

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('quiz_questions').insert(rows)
    if (insertError) throw new Error(insertError.message)
  }
}

export type GenerateLessonQuizResult<T> = { questions: T[]; usedFallbackModel: boolean }

// Generates a fresh Part 1 (15 questions) for an already-imported lesson,
// reading its real DB content (not a job's raw_json) and replacing any
// existing Part 1 rows in quiz_questions - Part 2 rows are untouched.
export async function generateLessonQuizPart1(lessonId: string): Promise<GenerateLessonQuizResult<Part1Question>> {
  const lesson = await loadLesson(lessonId)
  const result = toExtractionResult(lesson)
  const { questions, usedFallbackModel } = await generateQuizPart1(result)

  await replacePartRows(lessonId, 1, questions.map((q) => toRow(lessonId, q)))

  return { questions, usedFallbackModel }
}

// Generates a fresh Part 2 (15 questions), mirrors generateLessonQuizPart1.
export async function generateLessonQuizPart2(lessonId: string): Promise<GenerateLessonQuizResult<Part2Question>> {
  const lesson = await loadLesson(lessonId)
  const result = toExtractionResult(lesson)
  const { questions, usedFallbackModel } = await generateQuizPart2(result)

  await replacePartRows(lessonId, 2, questions.map((q) => toRow(lessonId, q)))

  return { questions, usedFallbackModel }
}

// Reads back all quiz question rows for a lesson (both parts).
export async function getLessonQuizQuestions(lessonId: string): Promise<QuizQuestion[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase.from('quiz_questions').select().eq('lesson_id', lessonId)
  if (error) throw new Error(error.message)
  return (data ?? []) as QuizQuestion[]
}

// Updates one question's payload (admin hand-edit via the Quiz tab).
export async function updateQuizQuestion(id: string, payload: unknown): Promise<void> {
  const supabase = createServerSupabase()
  const { error } = await supabase.from('quiz_questions').update({ payload }).eq('id', id)
  if (error) throw new Error(error.message)
}

// Updates one question's display order (used when reordering within a part
// - `order` is its own column, not part of `payload`, since importJob.ts's
// insert shape always split {part, type, order, ...payload} apart).
export async function updateQuizQuestionOrder(id: string, order: number): Promise<void> {
  const supabase = createServerSupabase()
  const { error } = await supabase.from('quiz_questions').update({ order }).eq('id', id)
  if (error) throw new Error(error.message)
}

// Deletes one question by id.
export async function deleteQuizQuestion(id: string): Promise<void> {
  const supabase = createServerSupabase()
  const { error } = await supabase.from('quiz_questions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/db/generateLessonQuiz.test.ts`
Expected: PASS, all cases. If `updateQuizQuestion`'s test fails because the mock's `.eq()` for `update` collides with the `.eq()` used by `delete().eq('lesson_id', ...).eq('part', ...)` (both target the same mocked `quiz_questions` table object), adjust the test's mock dispatcher to distinguish calls by which chain method (`update` vs `delete`) invoked `.eq()` — the mock sketch above already separates these via different top-level methods (`update(...)` vs `delete()`), so this should work as written; if it doesn't, fix the mock's dispatcher logic, not the implementation.

- [ ] **Step 5: Write the route**

Create `app/api/lessons/[lessonId]/quiz/route.ts`. This route has four handlers: `GET` (list all questions for the lesson, used by the edit page's Quiz tab on load), `POST` (generate one part), `PATCH` (edit one question's payload and/or order), `DELETE` (remove one question):

```typescript
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import {
  generateLessonQuizPart1,
  generateLessonQuizPart2,
  getLessonQuizQuestions,
  updateQuizQuestion,
  updateQuizQuestionOrder,
  deleteQuizQuestion,
} from '@/lib/db/generateLessonQuiz'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params

  try {
    const questions = await getLessonQuizQuestions(lessonId)
    return NextResponse.json(questions)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error loading quiz questions'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params
  const url = new URL(request.url)
  const part = url.searchParams.get('part')

  if (part !== '1' && part !== '2') {
    return NextResponse.json({ error: 'part query param must be "1" or "2"' }, { status: 400 })
  }

  try {
    const { questions, usedFallbackModel } =
      part === '1' ? await generateLessonQuizPart1(lessonId) : await generateLessonQuizPart2(lessonId)
    return NextResponse.json({ questions, usedFallbackModel })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown quiz generation error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Accepts `payload` (a hand-edit to one question's type-specific fields),
// `order` (a reorder), or both in the same call - the Quiz tab sends
// `payload` for field edits and `order` for move-up/move-down, never both
// at once, but the route doesn't need to forbid combining them.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  await params
  const body = await request.json().catch(() => ({}))
  const { id, payload, order } = body as { id?: string; payload?: unknown; order?: number }

  if (!id || (payload === undefined && order === undefined)) {
    return NextResponse.json({ error: 'id and at least one of payload/order are required' }, { status: 400 })
  }

  try {
    if (payload !== undefined) await updateQuizQuestion(id, payload)
    if (order !== undefined) await updateQuizQuestionOrder(id, order)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error updating quiz question'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  await params
  const url = new URL(request.url)
  const id = url.searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
  }

  try {
    await deleteQuizQuestion(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error deleting quiz question'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 6: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint lib/db/generateLessonQuiz.ts "app/api/lessons/[lessonId]/quiz/route.ts" tests/lib/db/generateLessonQuiz.test.ts`
Expected: no errors. If `toExtractionResult`'s return type doesn't structurally satisfy `ExtractionResult` (e.g. a missing `.default([])`-derived field like `objectives`), check `lib/gemini/schema.ts`'s exact `ExtractionResult` type (via `z.infer`) — every field must be present with the right nullability, not just present.

- [ ] **Step 7: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add lib/db/generateLessonQuiz.ts "app/api/lessons/[lessonId]/quiz/route.ts" tests/lib/db/generateLessonQuiz.test.ts
git commit -m "feat: add lesson-scoped quiz generation (DB helper + route)"
```

---

### Task 6: Change the Lesson edit page's guard, add the Audio tab

**Files:**
- Modify: `app/(protected)/lessons/[lessonId]/edit/page.tsx`

**Interfaces:**
- Consumes: `POST/api/lessons/[lessonId]/audio` (body `{voice?, mode?}`, Task 4), `PATCH /api/lessons/[lessonId]/audio` (body `{id, voice}`, existing, unchanged); `LessonFullView` (existing, unchanged — already has `dialogues[].vocabulary[].audioUrl`).
- Produces: the edit page now renders regardless of `lesson.status`, and has a working Audio tab; Task 7 adds the Quiz tab to the same file.

- [ ] **Step 1: Remove the status-guard redirect**

In `app/(protected)/lessons/[lessonId]/edit/page.tsx`, remove this block entirely:

```tsx
  if (data.status !== "draft") {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10">
        <p role="alert" className="text-sm text-destructive">
          Bài học phải ở trạng thái Nháp mới được sửa. Vào trang bài học và bấm &quot;Chuyển về nháp&quot; trước.
        </p>
        <Button variant="outline" nativeButton={false} onClick={() => router.push(`/lessons/${lessonId}`)}>
          Quay lại
        </Button>
      </main>
    )
  }
```

- [ ] **Step 2: Gate the existing 3 tabs' mutating controls on draft status**

The three existing tabs (Bài khoá/Từ vựng/Ngữ pháp) currently always show their add/remove/reorder buttons and `EditableText` fields unconditionally, relying on the page-level redirect from Step 1 to keep non-draft lessons out entirely. Since that redirect is gone, every mutating control in the three existing tabs must now be conditional on `data.status === "draft"`.

This is a broad, repetitive edit across the whole file (every `<Button onClick={addX}>`, every `<BlockActions ... />`, every `EditableText`'s implicit editability). Rather than gating each one individually with inline conditionals (error-prone at this scale), wrap the read/write choice at the field level:

- `EditableText` already accepts a `disabled` prop (confirm this by checking `components/editable-text.tsx` — read it if you haven't already this task) — pass `disabled={data.status !== "draft"}` to EVERY `EditableText` instance in this file (search for all `<EditableText` occurrences and add the prop to each).
- Every "+ Thêm ..." button (add dialogue/vocab/section/example/grammar point/sub-point/etc.) and every `<BlockActions>` instance (move/delete controls) must be wrapped so it only renders when `data.status === "draft"`. For a "+ Thêm X" button, wrap the whole button in `{data.status === "draft" && (...)}`. For `<BlockActions>`, wrap similarly.
- The page-level "Lưu" button (and the whole save flow) should also only render when `data.status === "draft"` — wrap the `<Button onClick={handleSave}>` in the sticky header similarly.

Do this pass file-wide before moving to Step 3, and re-run the app's typecheck to confirm nothing was missed structurally (though tsc won't catch a missing `disabled` prop, since it's optional — this step relies on careful reading, not the type checker).

- [ ] **Step 3: Add the Tabs entries and imports for Audio**

Change the `Tabs`/`TabsList` block from:

```tsx
      <Tabs defaultValue="dialogues">
        <TabsList>
          <TabsIndicator />
          <TabsTab value="dialogues">Bài khoá ({data.dialogues.length})</TabsTab>
          <TabsTab value="vocabulary">
            Từ vựng ({data.dialogues.reduce((sum, d) => sum + d.vocabulary.length, 0)})
          </TabsTab>
          <TabsTab value="grammar">Ngữ pháp ({data.grammarPoints.length})</TabsTab>
        </TabsList>
```

to:

```tsx
      <Tabs defaultValue="dialogues">
        <TabsList>
          <TabsIndicator />
          <TabsTab value="dialogues">Bài khoá ({data.dialogues.length})</TabsTab>
          <TabsTab value="vocabulary">
            Từ vựng ({data.dialogues.reduce((sum, d) => sum + d.vocabulary.length, 0)})
          </TabsTab>
          <TabsTab value="grammar">Ngữ pháp ({data.grammarPoints.length})</TabsTab>
          <TabsTab value="audio">Audio</TabsTab>
          <TabsTab value="quiz">Quiz</TabsTab>
        </TabsList>
```

(Task 7 fills in the `quiz` tab's `TabsPanel`; this task only adds the `audio` one.)

- [ ] **Step 4: Add the Audio tab's state and logic**

Add these imports near the top of the file (alongside the existing ones):

```tsx
import type { TtsVoice } from "@/lib/tts/generateAudio"
```

Add this constant near the top of the file (module scope, alongside other top-level constants):

```tsx
const VOICE_OPTIONS: { value: TtsVoice; label: string }[] = [
  { value: "zh-TW-HsiaoChenNeural", label: "Hiểu Trân (nữ)" },
  { value: "zh-TW-YunJheNeural", label: "Vân Triết (nam)" },
]
```

Add this state inside the `LessonEditPage` component, alongside the existing `isSaving`/`saveError` state:

```tsx
  const [audioVoice, setAudioVoice] = useState<TtsVoice>(VOICE_OPTIONS[0].value)
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false)
  const [audioActionError, setAudioActionError] = useState<string | null>(null)
  const [regeneratingAudioId, setRegeneratingAudioId] = useState<string | null>(null)
```

Add these functions inside the component, after `handleSave`:

```tsx
  async function handleGenerateMissingAudio() {
    setIsGeneratingAudio(true)
    setAudioActionError(null)
    try {
      const res = await fetch(`/api/lessons/${lessonId}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: audioVoice, mode: "fill" }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Sinh audio thất bại.")
      }
      await load()
    } catch (err) {
      setAudioActionError(err instanceof Error ? err.message : "Sinh audio thất bại.")
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  async function handleRegenerateAllAudio() {
    const confirmed = window.confirm(
      "Sẽ ghi đè TOÀN BỘ audio đã có của mọi từ vựng trong bài (kể cả đã tạo lại riêng), tiếp tục?"
    )
    if (!confirmed) return

    setIsGeneratingAudio(true)
    setAudioActionError(null)
    try {
      const res = await fetch(`/api/lessons/${lessonId}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: audioVoice, mode: "regenerateAll" }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Sinh lại audio thất bại.")
      }
      await load()
    } catch (err) {
      setAudioActionError(err instanceof Error ? err.message : "Sinh lại audio thất bại.")
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  async function handleRegenerateOneAudio(vocabId: string) {
    setRegeneratingAudioId(vocabId)
    setAudioActionError(null)
    try {
      const res = await fetch(`/api/lessons/${lessonId}/audio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: vocabId, voice: audioVoice }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Tạo lại audio thất bại.")
      }
      await load()
    } catch (err) {
      setAudioActionError(err instanceof Error ? err.message : "Tạo lại audio thất bại.")
    } finally {
      setRegeneratingAudioId(null)
    }
  }
```

- [ ] **Step 5: Add the Audio `TabsPanel`**

Add this `TabsPanel` right after the `grammar` tab's `TabsPanel` closing tag (`</TabsPanel>`) and before the closing `</Tabs>`:

```tsx
        <TabsPanel value="audio">
        <div className="flex flex-col gap-5 rounded-lg border bg-card p-6">
          {data.status === "draft" && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-4">
              <label className="text-sm font-medium text-foreground" htmlFor="audio-voice">
                Giọng đọc
              </label>
              <select
                id="audio-voice"
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={audioVoice}
                onChange={(e) => setAudioVoice(e.target.value as TtsVoice)}
                disabled={isGeneratingAudio}
              >
                {VOICE_OPTIONS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
              <Button type="button" onClick={handleGenerateMissingAudio} disabled={isGeneratingAudio}>
                {isGeneratingAudio ? "Đang sinh..." : "Sinh audio còn thiếu"}
              </Button>
              <Button type="button" variant="outline" onClick={handleRegenerateAllAudio} disabled={isGeneratingAudio}>
                Sinh lại toàn bộ
              </Button>
            </div>
          )}

          {audioActionError && <p className="text-sm text-destructive">{audioActionError}</p>}

          {data.dialogues.map((dialogue, dIdx) => (
            <div key={dialogue.id} className="rounded-xl border border-dashed p-4">
              <p className="mb-2 text-sm font-semibold text-foreground">
                {dialogueLabels[dIdx]} · Từ mới ({dialogue.vocabulary.length})
              </p>
              <div className="flex flex-col divide-y divide-border/60">
                {dialogue.vocabulary.map((vocab) => (
                  <div key={vocab.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="field-zh">{vocab.wordZh}</p>
                      <p className="text-xs text-muted-foreground">{vocab.meaningVi}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {vocab.audioUrl ? (
                        <audio controls preload="none" src={vocab.audioUrl} className="h-8 max-w-[12rem]" />
                      ) : (
                        <span className="text-xs text-muted-foreground">Chưa có audio</span>
                      )}
                      {data.status === "draft" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRegenerateOneAudio(vocab.id)}
                          disabled={isGeneratingAudio || regeneratingAudioId === vocab.id}
                        >
                          {regeneratingAudioId === vocab.id ? "Đang tạo..." : "Tạo lại"}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {dialogue.vocabulary.length === 0 && (
                  <p className="text-xs text-muted-foreground">Chưa có từ mới nào.</p>
                )}
              </div>
            </div>
          ))}
          {data.dialogues.length === 0 && (
            <p className="text-sm text-muted-foreground">Chưa có hội thoại/từ vựng nào.</p>
          )}
        </div>
        </TabsPanel>
```

- [ ] **Step 6: Typecheck**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json`
Expected: no errors in this file. (Errors in files Task 7 hasn't touched yet, if any relate to the Quiz tab you haven't added — there shouldn't be any yet since Task 7 comes next and this task doesn't reference anything quiz-related.)

- [ ] **Step 7: Lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx eslint "app/(protected)/lessons/[lessonId]/edit/page.tsx"`
Expected: no errors.

- [ ] **Step 8: Manual verification note for the report**

This task has no automated test file of its own (it's a large UI file with existing patterns this project doesn't unit-test at the component level — consistent with how the sibling audio/quiz pages were built in prior tasks with only logic-layer tests). In your task report, explicitly list every `EditableText`/`BlockActions`/"+ Thêm" occurrence you found and confirm each was gated per Step 2 - a reviewer will check this list against the file.

- [ ] **Step 9: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add "app/(protected)/lessons/[lessonId]/edit/page.tsx"
git commit -m "feat: lesson edit page always viewable, gate edits on draft status, add Audio tab"
```

---

### Task 7: Add the Quiz tab to the Lesson edit page

**Files:**
- Modify: `app/(protected)/lessons/[lessonId]/edit/page.tsx`

**Interfaces:**
- Consumes: `GET /api/lessons/[lessonId]/quiz` (list), `POST /api/lessons/[lessonId]/quiz?part=1|2` (generate), `PATCH /api/lessons/[lessonId]/quiz` (body `{id, payload?, order?}`), `DELETE /api/lessons/[lessonId]/quiz?id=` (all from Task 5); `canMoveWithinPart`/`moveQuestionWithinPart` (`lib/quizReorder.ts`, existing, unchanged); `QuizQuestion` (DB row shape, `lib/db/types.ts`, existing) — note this is the DB-row type, NOT the `Part1Question`/`Part2Question` draft types from `lib/gemini/quizSchema.ts`; the tab renders `row.payload` merged with `row.type`/`row.part` to reconstruct something renderable, since the DB row's `payload` is the type-specific fields only (matching how `importJob.ts` stored them: `{part, type, order, ...payload}` split apart).
- Produces: a fully working Quiz tab; this completes the plan's UI surface.

- [ ] **Step 1: Read `components/editable-text.tsx` and `components/block-actions.tsx` if not already read this session**

Confirm their exact prop signatures (`EditableText`'s `disabled` prop, `BlockActions`'s `onMoveUp`/`onMoveDown`/`onRemove`/`canMoveUp`/`canMoveDown`/`removeLabel`/`className` props) before writing the Quiz tab's JSX — these are reused from the old job-scoped quiz page's `QuestionCard` component, adapted here to operate on lesson-scoped state instead.

- [ ] **Step 2: Add imports and types for the Quiz tab**

Add these imports:

```tsx
import { BlockActions } from "@/components/block-actions"
import { canMoveWithinPart, moveQuestionWithinPart } from "@/lib/quizReorder"
import type { QuizQuestionType } from "@/lib/db/types"
```

(`EditableText` is already imported in this file from Task 6/earlier work.)

Add this type and label map near the top of the file (module scope):

```tsx
// The DB row's `payload` only holds the type-specific fields (part/type/
// order live as separate columns) - this reconstructs the same discriminated
// shape the old job-scoped quiz page's QuestionCard rendered, so that
// component's per-type branches can be reused verbatim here.
type QuizQuestionView = {
  id: string
  part: 1 | 2
  order: number
} & (
  | { type: "pinyin_choice"; prompt: string; choices: string[]; correctIndex: number }
  | { type: "listening_choice"; audioUrl: string; choices: string[]; correctIndex: number }
  | { type: "tone_choice"; wordZh: string; pinyinNoTone: string; choices: string[]; correctIndex: number }
  | { type: "matching"; pairs: { left: string; right: string }[] }
  | { type: "fill_blank"; sentence: string; choices: string[]; correctIndex: number }
  | { type: "sentence_order"; words: string[]; correctOrder: number[] }
)

const QUIZ_TYPE_LABELS: Record<QuizQuestionType, string> = {
  pinyin_choice: "Chọn Pinyin/Chữ Hán",
  listening_choice: "Nghe & chọn đáp án",
  tone_choice: "Nhận biết thanh điệu",
  matching: "Ghép nghĩa",
  fill_blank: "Điền từ vào chỗ trống",
  sentence_order: "Sắp xếp câu",
}
```

Add this helper function (module scope, outside the component) to convert a DB row into the view shape:

```tsx
function toQuizQuestionView(row: { id: string; part: 1 | 2; type: QuizQuestionType; order: number; payload: unknown }): QuizQuestionView {
  return { id: row.id, part: row.part, order: row.order, type: row.type, ...(row.payload as object) } as QuizQuestionView
}
```

- [ ] **Step 3: Add a `QuizQuestionCard` component**

Add this component near the top of the file (module scope, before `LessonEditPage`) — it mirrors the deleted job-scoped quiz page's `QuestionCard`, adapted for read-only-when-not-draft:

```tsx
function QuizQuestionCard({
  question,
  editable,
  onChangePayload,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  question: QuizQuestionView
  editable: boolean
  onChangePayload: (patch: Record<string, unknown>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  return (
    <div className="group/question relative flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors has-[[data-danger]:hover]:border-destructive has-[[data-danger]:hover]:bg-destructive/5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {QUIZ_TYPE_LABELS[question.type]}
        </span>
        {editable && (
          <BlockActions
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onRemove={onRemove}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            removeLabel="Xoá câu hỏi"
            className="group-hover/question:opacity-100"
          />
        )}
      </div>

      {question.type === "pinyin_choice" && (
        <>
          <EditableText
            value={question.prompt}
            onChange={(prompt) => onChangePayload({ prompt })}
            className="field-zh"
            disabled={!editable}
          />
          {question.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${question.id}-correct`}
                checked={question.correctIndex === i}
                onChange={() => onChangePayload({ correctIndex: i })}
                disabled={!editable}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChangePayload({ choices })
                }}
                className="flex-1 text-sm"
                disabled={!editable}
              />
            </div>
          ))}
        </>
      )}

      {question.type === "listening_choice" && (
        <>
          <audio controls preload="none" src={question.audioUrl} className="h-8 w-full max-w-xs" />
          {question.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${question.id}-correct`}
                checked={question.correctIndex === i}
                onChange={() => onChangePayload({ correctIndex: i })}
                disabled={!editable}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChangePayload({ choices })
                }}
                className="flex-1 text-sm"
                disabled={!editable}
              />
            </div>
          ))}
        </>
      )}

      {question.type === "tone_choice" && (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <EditableText
              value={question.wordZh}
              onChange={(wordZh) => onChangePayload({ wordZh })}
              className="field-zh"
              disabled={!editable}
            />
            <EditableText
              value={question.pinyinNoTone}
              onChange={(pinyinNoTone) => onChangePayload({ pinyinNoTone })}
              className="w-auto"
              disabled={!editable}
            />
          </div>
          {question.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${question.id}-correct`}
                checked={question.correctIndex === i}
                onChange={() => onChangePayload({ correctIndex: i })}
                disabled={!editable}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChangePayload({ choices })
                }}
                className="flex-1 text-sm"
                disabled={!editable}
              />
            </div>
          ))}
        </>
      )}

      {question.type === "matching" && (
        <div className="flex flex-col gap-1">
          {question.pairs.map((pair, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <EditableText
                value={pair.left}
                onChange={(left) => {
                  const pairs = [...question.pairs]
                  pairs[i] = { ...pairs[i], left }
                  onChangePayload({ pairs })
                }}
                className="field-zh"
                disabled={!editable}
              />
              <EditableText
                value={pair.right}
                onChange={(right) => {
                  const pairs = [...question.pairs]
                  pairs[i] = { ...pairs[i], right }
                  onChangePayload({ pairs })
                }}
                className="text-sm"
                disabled={!editable}
              />
            </div>
          ))}
        </div>
      )}

      {question.type === "fill_blank" && (
        <>
          <EditableText
            value={question.sentence}
            onChange={(sentence) => onChangePayload({ sentence })}
            className="field-zh"
            disabled={!editable}
          />
          {question.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${question.id}-correct`}
                checked={question.correctIndex === i}
                onChange={() => onChangePayload({ correctIndex: i })}
                disabled={!editable}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChangePayload({ choices })
                }}
                className="flex-1 text-sm"
                disabled={!editable}
              />
            </div>
          ))}
        </>
      )}

      {question.type === "sentence_order" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Các từ đã xáo trộn (thứ tự hiển thị cho học viên) — số bên dưới mỗi từ là vị trí đúng của từ đó
            trong câu (bắt đầu từ 1):
          </p>
          <div className="flex flex-wrap gap-2">
            {question.words.map((word, wordIdx) => {
              const correctPosition = question.correctOrder.indexOf(wordIdx)
              return (
                <div key={wordIdx} className="flex flex-col items-center gap-1 rounded-md border p-2">
                  <EditableText
                    value={word}
                    onChange={(v) => {
                      const words = [...question.words]
                      words[wordIdx] = v
                      onChangePayload({ words })
                    }}
                    className="field-zh w-auto"
                    disabled={!editable}
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Vị trí đúng
                    <input
                      type="number"
                      min={1}
                      max={question.words.length}
                      value={correctPosition + 1}
                      disabled={!editable}
                      onChange={(e) => {
                        const newPosition = Number(e.target.value) - 1
                        if (
                          Number.isNaN(newPosition) ||
                          newPosition < 0 ||
                          newPosition >= question.words.length
                        ) {
                          return
                        }
                        const correctOrder = [...question.correctOrder]
                        correctOrder.splice(correctPosition, 1)
                        correctOrder.splice(newPosition, 0, wordIdx)
                        onChangePayload({ correctOrder })
                      }}
                      aria-label={`Vị trí đúng của từ "${word}" trong câu`}
                      className="h-7 w-14 rounded-md border bg-background px-1 text-center text-sm"
                    />
                  </label>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add Quiz tab state and load logic**

Add this state inside `LessonEditPage`, alongside the audio-tab state from Task 6:

```tsx
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionView[] | null>(null)
  const [generatingQuizPart, setGeneratingQuizPart] = useState<1 | 2 | null>(null)
  const [quizActionError, setQuizActionError] = useState<string | null>(null)
  const [quizFallbackWarning, setQuizFallbackWarning] = useState<string | null>(null)
```

Add a separate load function for quiz questions, calling the `GET /api/lessons/[lessonId]/quiz` endpoint Task 5 already created (quiz data lives in a different table than `LessonFullView` covers, so it needs its own fetch, called once alongside the main `load()`):

```tsx
  const loadQuiz = useCallback(async () => {
    try {
      const res = await fetch(`/api/lessons/${lessonId}/quiz`)
      if (!res.ok) return
      const rows: { id: string; part: 1 | 2; type: QuizQuestionType; order: number; payload: unknown }[] = await res.json()
      setQuizQuestions(rows.map(toQuizQuestionView).sort((a, b) => a.order - b.order))
    } catch {
      // Quiz questions are optional content; a failed load here shouldn't
      // block the rest of the page, which already loaded via `load()`.
    }
  }, [lessonId])
```

Add a `useEffect` to call it on mount, alongside the existing `load()` effect:

```tsx
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadQuiz()
  }, [loadQuiz])
```

- [ ] **Step 5: Add Quiz tab generate/edit/delete/reorder handlers**

Add these functions inside `LessonEditPage`, after the audio handlers from Task 6. These call the `POST`/`PATCH`/`DELETE` handlers on `/api/lessons/[lessonId]/quiz` that Task 5 already created — `PATCH` accepts `{id, payload?, order?}`, so an edit sends `payload` and a reorder sends `order`, never fabricating one from the other:

```tsx
  async function handleGenerateQuizPart(part: 1 | 2) {
    const existingCount = (quizQuestions ?? []).filter((q) => q.part === part).length
    if (existingCount > 0) {
      const confirmed = window.confirm(
        `Sẽ xoá 15 câu hỏi Phần ${part} hiện tại (kể cả đã sửa tay) và sinh lại từ đầu, tiếp tục?`
      )
      if (!confirmed) return
    }

    setGeneratingQuizPart(part)
    setQuizActionError(null)
    setQuizFallbackWarning(null)
    try {
      const res = await fetch(`/api/lessons/${lessonId}/quiz?part=${part}`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Sinh Phần ${part} thất bại.`)
      }
      const { usedFallbackModel } = (await res.json()) as { usedFallbackModel: boolean }
      if (usedFallbackModel) {
        setQuizFallbackWarning(
          `Phần ${part} vừa được sinh bằng model dự phòng (model chính lỗi/hết quota) — nên kiểm tra kỹ hơn bình thường.`
        )
      }
      await loadQuiz()
    } catch (err) {
      setQuizActionError(err instanceof Error ? err.message : `Sinh Phần ${part} thất bại.`)
    } finally {
      setGeneratingQuizPart(null)
    }
  }

  async function updateQuizQuestionPayload(id: string, patch: Record<string, unknown>) {
    setQuizQuestions((prev) =>
      prev ? prev.map((q) => (q.id === id ? ({ ...q, ...patch } as QuizQuestionView) : q)) : prev
    )
    const target = (quizQuestions ?? []).find((q) => q.id === id)
    if (!target) return
    const { id: _id, part: _part, order: _order, type: _type, ...payload } = { ...target, ...patch }
    try {
      await fetch(`/api/lessons/${lessonId}/quiz`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, payload }),
      })
    } catch {
      setQuizActionError("Lưu thay đổi câu hỏi thất bại, thử lại.")
    }
  }

  async function removeQuizQuestion(id: string) {
    setQuizQuestions((prev) => (prev ? prev.filter((q) => q.id !== id) : prev))
    try {
      await fetch(`/api/lessons/${lessonId}/quiz?id=${id}`, { method: "DELETE" })
    } catch {
      setQuizActionError("Xoá câu hỏi thất bại, thử lại.")
      await loadQuiz()
    }
  }

  // moveQuestionWithinPart (lib/quizReorder.ts) swaps the question at `index`
  // with its nearest same-part neighbor and renumbers `order` 1..N within
  // each part - never crossing the Part 1/Part 2 boundary. Since this tab
  // writes straight to the DB per edit (no separate "Lưu" step for quiz),
  // every row whose `order` changed as a result gets persisted via `order`
  // (never `payload` - order is its own DB column, not part of payload).
  function moveQuizQuestion(id: string, direction: -1 | 1) {
    setQuizQuestions((prev) => {
      if (!prev) return prev
      const index = prev.findIndex((q) => q.id === id)
      if (index === -1) return prev
      const reordered = moveQuestionWithinPart(prev, index, direction)

      reordered.forEach((q, i) => {
        if (q.order !== prev[i]?.order || q.id !== prev[i]?.id) {
          fetch(`/api/lessons/${lessonId}/quiz`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: q.id, order: q.order }),
          }).catch(() => setQuizActionError("Lưu thứ tự câu hỏi thất bại, thử lại."))
        }
      })

      return reordered
    })
  }
```

- [ ] **Step 6: Add the Quiz `TabsPanel`**

Add this `TabsPanel` right after the `audio` tab's `TabsPanel` (added in Task 6) and before the closing `</Tabs>`:

```tsx
        <TabsPanel value="quiz">
        <div className="flex flex-col gap-6 rounded-lg border bg-card p-6">
          {data.status === "draft" && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-4">
              <Button
                type="button"
                onClick={() => handleGenerateQuizPart(1)}
                disabled={generatingQuizPart !== null}
              >
                {generatingQuizPart === 1
                  ? "Đang sinh Phần 1..."
                  : (quizQuestions ?? []).some((q) => q.part === 1)
                    ? "Sinh lại Phần 1"
                    : "Sinh Phần 1"}
              </Button>
              <Button
                type="button"
                onClick={() => handleGenerateQuizPart(2)}
                disabled={generatingQuizPart !== null}
              >
                {generatingQuizPart === 2
                  ? "Đang sinh Phần 2..."
                  : (quizQuestions ?? []).some((q) => q.part === 2)
                    ? "Sinh lại Phần 2"
                    : "Sinh Phần 2"}
              </Button>
            </div>
          )}

          {data.status === "draft" &&
            data.dialogues.every((d) => d.vocabulary.every((v) => !v.audioUrl)) && (
              <p className="rounded-md border border-status-warning/40 bg-status-warning-bg px-3 py-2 text-sm text-status-warning">
                Chưa có từ vựng nào có audio. Nên sinh Audio trước để có câu hỏi dạng &quot;Nghe &amp; chọn đáp án&quot;, nhưng vẫn có thể sinh Quiz ngay nếu muốn.
              </p>
            )}

          {quizActionError && <p className="text-sm text-destructive">{quizActionError}</p>}
          {quizFallbackWarning && (
            <p className="rounded-md border border-status-warning/40 bg-status-warning-bg px-3 py-2 text-sm text-status-warning">
              {quizFallbackWarning}
            </p>
          )}

          {(quizQuestions ?? []).length === 0 && generatingQuizPart === null && (
            <p className="text-sm text-muted-foreground">Chưa có câu hỏi quiz nào.</p>
          )}

          {[1, 2].map((part) => {
            const partQuestions = (quizQuestions ?? []).filter((q) => q.part === part)
            if (partQuestions.length === 0) return null
            return (
              <section key={part} className="flex flex-col gap-3">
                <h3 className="text-base font-semibold text-foreground">Phần {part} ({partQuestions.length} câu)</h3>
                {partQuestions.map((q) => (
                  <QuizQuestionCard
                    key={q.id}
                    question={q}
                    editable={data.status === "draft"}
                    onChangePayload={(patch) => updateQuizQuestionPayload(q.id, patch)}
                    onRemove={() => removeQuizQuestion(q.id)}
                    onMoveUp={() => moveQuizQuestion(q.id, -1)}
                    onMoveDown={() => moveQuizQuestion(q.id, 1)}
                    canMoveUp={canMoveWithinPart(quizQuestions ?? [], (quizQuestions ?? []).findIndex((x) => x.id === q.id), -1)}
                    canMoveDown={canMoveWithinPart(quizQuestions ?? [], (quizQuestions ?? []).findIndex((x) => x.id === q.id), 1)}
                  />
                ))}
              </section>
            )
          })}
        </div>
        </TabsPanel>
```

- [ ] **Step 7: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint "app/(protected)/lessons/[lessonId]/edit/page.tsx" "app/api/lessons/[lessonId]/quiz/route.ts"`
Expected: no errors. If `canMoveWithinPart<T extends { part: 1 | 2 }>`'s generic doesn't accept `QuizQuestionView[]` cleanly, check that `QuizQuestionView` really does carry a literal `part: 1 | 2` (not widened to `number`) — the discriminated-union definition in Step 2 already types it correctly, but a `.filter()`/`.map()` chain elsewhere in your edits could widen it; add an explicit type annotation at the call site if so.

- [ ] **Step 8: Run the full test suite**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run`
Expected: all tests pass, including the new `updateQuizQuestionOrder` case and everything from Tasks 1-6.

- [ ] **Step 9: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add "app/(protected)/lessons/[lessonId]/edit/page.tsx" "app/api/lessons/[lessonId]/quiz/route.ts" lib/db/generateLessonQuiz.ts tests/lib/db/generateLessonQuiz.test.ts
git commit -m "feat: add Quiz tab to lesson edit page with generate/edit/reorder"
```

---

### Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 2: Full lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx eslint .`
Expected: no errors (pre-existing unrelated warnings in untouched files are acceptable; anything new introduced by this plan must be clean).

- [ ] **Step 3: Full test suite**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run`
Expected: all tests pass.

- [ ] **Step 4: Production build**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npm run build`
Expected: build succeeds. Confirm in the route list that `/books/[bookId]/jobs/[jobId]/audio` and `/quiz` are GONE, and `/api/lessons/[lessonId]/quiz` is present alongside the existing `/api/lessons/[lessonId]/audio`.

- [ ] **Step 5: Manual smoke test (report to user, do not attempt to automate)**

1. Run `npm run dev`, open a job at `reviewed` status. Confirm the "Import vào DB" button is now visible directly (no Audio/Quiz buttons in between).
2. Import it. Land on the lesson's edit page (`/lessons/[lessonId]/edit`), status `draft`. Confirm 5 tabs are visible: Bài khoá / Từ vựng / Ngữ pháp / Audio / Quiz.
3. In the Audio tab: click "Sinh audio còn thiếu", confirm audio appears per word. Click "Sinh lại toàn bộ", confirm the browser confirm dialog appears, confirm it, confirm audio regenerates for every word (even ones that already had it).
4. In the Quiz tab: confirm the "chưa có audio" advisory only shows if no word has audio yet (it shouldn't, since Audio was generated in step 3) — click "Sinh Phần 1", confirm 15 questions render; click "Sinh Phần 2", confirm 15 more. Edit one question's text, confirm it can be saved (no explicit "Lưu" button for quiz - edits should persist immediately per-field, confirm this actually happens by reloading the page).
5. Use the lesson list / status controls to move the lesson to `reviewed`, then reload the edit page. Confirm the page still loads (no redirect), all 5 tabs are still visible, but no add/edit/delete/generate controls appear anywhere — read-only.
6. Move it back to `draft`, confirm editing controls reappear.

- [ ] **Step 6: Remind the user**

Tell the user: no new migration was needed (the `quiz_questions` table already supports this), but if migrations `0010`-`0019` haven't been applied to the live Supabase project yet, this feature won't work end-to-end until they are (per every prior migration's standing caveat in this repo).

---

## Self-Review Notes (completed during plan authoring)

- **Spec coverage:** Section 2 (drop audio_ready/quiz_ready, guard change in importJob) → Task 1. Section 2 (delete job-scoped pages/routes) → Task 3. Section 3.1 (edit page guard change) → Task 6 Steps 1-2. Section 3.2 (Audio tab, bulk regenerate, no precondition) → Task 4 + Task 6 Steps 3-5. Section 3.3 (Quiz tab, lesson-scoped generation, advisory not blocking) → Task 5 + Task 7. Section 3.4 (no migration needed) → confirmed, no task needed. Section 4 (what doesn't change: generateQuiz.ts, extract.ts, read-only lesson page, quiz_questions schema) → correctly untouched by every task. Section 5 (out of scope) → correctly not planned.
- **Placeholder scan:** no TBD/TODO; every step has runnable code. Task 6 Step 2 and Task 6 Step 8 (manual verification) are the two spots without literal step-by-step diffs, because the exact set of `EditableText`/button occurrences in a ~1500-line file can't be enumerated without that file's live line numbers at execution time — but the INSTRUCTION for what to do (gate every occurrence, listed explicitly, verify via a listed inventory in the report) is concrete and checkable by a reviewer, which is the bar the plan format requires for large-file-wide mechanical edits.
- **Type consistency:** `QuizQuestion` as used in this plan always means the DB-row shape from `lib/db/types.ts` (`{id, lesson_id, part, type, order, payload}`) except inside `lib/gemini/generateQuiz.ts`'s own `Part1Question`/`Part2Question` (draft shapes, unchanged, still exported from `lib/gemini/quizSchema.ts`) — Task 5 and Task 7 both call this out explicitly to prevent the same confusion the original quiz-generation plan flagged. `GenerateLessonQuizResult<T>` (Task 5) mirrors the naming of the deleted `GenerateJobQuizResult` for continuity. Route paths, function names, and prop names introduced in Task 4/5/6/7 are consistent (`generateLessonQuizPart1`/`2`, `updateQuizQuestion`, `updateQuizQuestionOrder`, `deleteQuizQuestion`, `getLessonQuizQuestions` all match between the DB module, the route, and the page's fetch calls).
