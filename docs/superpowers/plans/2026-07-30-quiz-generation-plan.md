# Quiz Generation Page (Scope 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Sinh & duyệt Quiz" admin page that generates 30 quiz questions (6 types × 5 questions, split into 2 parts of 15) from an extraction job's already-reviewed content, lets the admin edit them, and advances the job to `quiz_ready` on save — following the same job-status-gated, draft-in-`raw_json` pattern already used for text review and audio generation.

**Architecture:** Extend `ExtractionResultSchema` with an optional `quizQuestions` array (mirrors how `vocabulary[].audioUrl` was added). A new Gemini call (`lib/gemini/generateQuiz.ts`) takes the job's already-parsed `ExtractionResult` as plain text input (no PDF) and returns 30 questions in one shot, validated by a new `QuizQuestionSchema`. A new API route (`/api/jobs/[jobId]/quiz`) exposes `POST` (generate, overwriting any existing quiz questions) and `PATCH` (save edited questions + advance status to `quiz_ready`). A new client page (`/books/[bookId]/jobs/[jobId]/quiz`) renders the two parts as flat editable lists, reusing `EditableText`/`BlockActions`/`moveItem`. Import (`importExtractionJob`) gains a step that inserts the job's finalized quiz questions into a new `quiz_questions` table.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod, `@google/genai` (Gemini), Supabase Postgres, Vitest.

## Global Constraints

- Migration files carry the standing caveat comment: "this migration has not been applied to the live Supabase project" (copy the exact wording used in `supabase/migrations/0015_vocabulary_audio_url.sql`) — every migration in this repo is applied manually via the Supabase SQL Editor, never assume it's live.
- 6 question types, exactly 5 questions each, exactly 30 questions per lesson, split into `part` 1 (`pinyin_choice`, `listening_choice`, `tone_choice` — 15 questions) and `part` 2 (`matching`, `fill_blank`, `sentence_order` — 15 questions).
- No tabs per question type in the admin UI — one flat list per part, each question labeled with its type name.
- Regenerating quiz (clicking "Sinh Quiz" when questions already exist) always confirms and replaces all 30 questions; no partial/merge regeneration.
- All UI-facing strings are Vietnamese, matching the rest of the admin app.
- Every new/modified file must pass `npx tsc --noEmit`, `npx eslint`, and `npx vitest run` before a task is considered done — this project has no CI, so these are the only quality gates.

---

## File Structure

- **`supabase/migrations/0019_quiz_questions.sql`** (new) — creates the `quiz_questions` table.
- **`lib/gemini/quizSchema.ts`** (new) — Zod schema for the 6 quiz question payload shapes + `GEMINI_QUIZ_RESPONSE_SCHEMA` (JSON Schema mirror for Gemini structured output), analogous to `lib/gemini/schema.ts`.
- **`lib/gemini/schema.ts`** (modify) — add `quizQuestions: z.array(QuizQuestionSchema).default([])` to `ExtractionResultSchema` so a job's `raw_json` can carry a quiz draft.
- **`lib/gemini/generateQuiz.ts`** (new) — calls Gemini with the lesson's dialogues/vocabulary/grammar (already-reviewed `ExtractionResult`, no PDF) as text input, returns 30 validated quiz questions.
- **`app/api/jobs/[jobId]/quiz/route.ts`** (new) — `POST` generates (overwrites) quiz questions in the job's `raw_json`; `PATCH` saves admin-edited questions and advances `extraction_jobs.status` to `quiz_ready`.
- **`app/(protected)/books/[bookId]/jobs/[jobId]/quiz/page.tsx`** (new) — admin review page, two-part flat list, click-to-edit.
- **`app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx`** (modify) — add a "Sinh & duyệt Quiz" button (shown when `status === 'audio_ready'` or `'quiz_ready'`), same spot as the existing "Sinh & duyệt Audio" button.
- **`lib/db/importJob.ts`** (modify) — after grammar points are inserted, insert the job's `quizQuestions` into the new `quiz_questions` table.
- **`lib/db/types.ts`** (modify) — add `QuizQuestion` interface for the DB row shape.
- **`tests/lib/gemini/quizSchema.test.ts`** (new) — validates the Zod schema accepts/rejects each question type's payload shape.
- **`tests/lib/gemini/generateQuiz.test.ts`** (new) — mocks `@google/genai`, asserts the prompt is built correctly and the response is parsed/validated.
- **`tests/lib/db/importJob.test.ts`** (modify) — add a case asserting quiz questions are inserted on import.

---

### Task 1: `quiz_questions` migration + DB types

**Files:**
- Create: `supabase/migrations/0019_quiz_questions.sql`
- Modify: `lib/db/types.ts`

**Interfaces:**
- Produces: `QuizQuestion` interface (DB row shape) in `lib/db/types.ts`, used by Task 6 (import) and any future lesson-read code.

- [ ] **Step 1: Write the migration file**

```sql
-- quiz_questions: 30 questions per lesson (6 types x 5 questions), generated
-- by the "Sinh & duyệt Quiz" admin page (Scope 4 of the 5-step extraction
-- pipeline). `payload` shape varies by `type` - see
-- docs/superpowers/specs/2026-07-30-quiz-generation-design.md section 4 for
-- the exact shape per type. No FK to dialogues/vocabulary/grammar_points:
-- quiz questions are self-contained snapshots (e.g. `listening_choice`
-- embeds the audio URL directly), so editing/deleting source content later
-- doesn't need to cascade into quiz questions.
--
-- NOTE: this migration has not been applied to the live Supabase project —
-- same manual-apply caveat as every prior migration in this project. Must be
-- run via the Supabase SQL Editor before merge.

create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  part integer not null check (part in (1, 2)),
  type text not null check (type in (
    'pinyin_choice', 'listening_choice', 'tone_choice',
    'matching', 'fill_blank', 'sentence_order'
  )),
  "order" integer not null,
  payload jsonb not null
);

create index quiz_questions_lesson_id_idx on quiz_questions(lesson_id);
```

- [ ] **Step 2: Add the `QuizQuestion` type**

Add to `lib/db/types.ts` (after the `ExtractionJob` interface):

```typescript
export type QuizQuestionType =
  | 'pinyin_choice'
  | 'listening_choice'
  | 'tone_choice'
  | 'matching'
  | 'fill_blank'
  | 'sentence_order'

export interface QuizQuestion {
  id: string
  lesson_id: string
  part: 1 | 2
  type: QuizQuestionType
  order: number
  payload: unknown
}
```

- [ ] **Step 3: Typecheck**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add supabase/migrations/0019_quiz_questions.sql lib/db/types.ts
git commit -m "feat: add quiz_questions table migration and DB type"
```

---

### Task 2: Quiz question Zod schema (payload validation)

**Files:**
- Create: `lib/gemini/quizSchema.ts`
- Test: `tests/lib/gemini/quizSchema.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `QuizQuestionSchema` (Zod discriminated union on `type`), exported from `lib/gemini/quizSchema.ts`
  - `type QuizQuestion = z.infer<typeof QuizQuestionSchema>` (note: this is the **draft/Gemini-output shape**, distinct from the DB row type `QuizQuestion` in `lib/db/types.ts` — no `id`/`lesson_id` here, just `part`/`type`/`order`/`payload`-equivalent fields flattened)
  - `GEMINI_QUIZ_RESPONSE_SCHEMA` (JSON Schema object for Gemini's `responseSchema` config), exported from the same file
  - Both consumed by Task 3 (`generateQuiz.ts`) and Task 4 (extending `ExtractionResultSchema`)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/gemini/quizSchema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { QuizQuestionSchema } from '@/lib/gemini/quizSchema'

describe('QuizQuestionSchema', () => {
  it('accepts a valid pinyin_choice question', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 1,
      type: 'pinyin_choice',
      order: 1,
      prompt: '你好',
      choices: ['nǐ hǎo', 'nī hǎo', 'ní hào', 'nǐ hào'],
      correctIndex: 0,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid listening_choice question', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 1,
      type: 'listening_choice',
      order: 2,
      audioUrl: 'https://x/vocab/a.mp3',
      choices: ['你好', '再見', '謝謝', '對不起'],
      correctIndex: 2,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid tone_choice question', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 1,
      type: 'tone_choice',
      order: 3,
      wordZh: '你好',
      pinyinNoTone: 'ni hao',
      choices: ['nǐ hǎo', 'ní háo', 'nī hāo', 'nì hào'],
      correctIndex: 0,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid matching question with exactly 5 pairs', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 2,
      type: 'matching',
      order: 1,
      pairs: [
        { left: '你好', right: 'xin chào' },
        { left: '謝謝', right: 'cảm ơn' },
        { left: '再見', right: 'tạm biệt' },
        { left: '對不起', right: 'xin lỗi' },
        { left: '請', right: 'xin mời' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects a matching question with fewer than 5 pairs', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 2,
      type: 'matching',
      order: 1,
      pairs: [{ left: '你好', right: 'xin chào' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts a valid fill_blank question', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 2,
      type: 'fill_blank',
      order: 2,
      sentence: '我___去中國學習漢語。',
      choices: ['想', '在', '和', '把'],
      correctIndex: 0,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid sentence_order question', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 2,
      type: 'sentence_order',
      order: 3,
      words: ['我', '喜歡', '吃', '中國菜'],
      correctOrder: [0, 1, 2, 3],
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unknown type', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 1,
      type: 'translation',
      order: 1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a choices array that is not exactly 4 items', () => {
    const result = QuizQuestionSchema.safeParse({
      part: 1,
      type: 'pinyin_choice',
      order: 1,
      prompt: '你好',
      choices: ['a', 'b', 'c'],
      correctIndex: 0,
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/gemini/quizSchema.test.ts`
Expected: FAIL — `Cannot find module '@/lib/gemini/quizSchema'`.

- [ ] **Step 3: Write the schema**

Create `lib/gemini/quizSchema.ts`:

```typescript
import { z } from 'zod'

const choice4 = z.array(z.string()).length(4)

const PinyinChoiceSchema = z.object({
  part: z.literal(1),
  type: z.literal('pinyin_choice'),
  order: z.number(),
  prompt: z.string(),
  choices: choice4,
  correctIndex: z.number().min(0).max(3),
})

const ListeningChoiceSchema = z.object({
  part: z.literal(1),
  type: z.literal('listening_choice'),
  order: z.number(),
  audioUrl: z.string(),
  choices: choice4,
  correctIndex: z.number().min(0).max(3),
})

const ToneChoiceSchema = z.object({
  part: z.literal(1),
  type: z.literal('tone_choice'),
  order: z.number(),
  wordZh: z.string(),
  pinyinNoTone: z.string(),
  choices: choice4,
  correctIndex: z.number().min(0).max(3),
})

const MatchingSchema = z.object({
  part: z.literal(2),
  type: z.literal('matching'),
  order: z.number(),
  pairs: z
    .array(
      z.object({
        left: z.string(),
        right: z.string(),
      })
    )
    .length(5),
})

const FillBlankSchema = z.object({
  part: z.literal(2),
  type: z.literal('fill_blank'),
  order: z.number(),
  sentence: z.string(),
  choices: choice4,
  correctIndex: z.number().min(0).max(3),
})

const SentenceOrderSchema = z.object({
  part: z.literal(2),
  type: z.literal('sentence_order'),
  order: z.number(),
  words: z.array(z.string()).min(2),
  correctOrder: z.array(z.number()),
})

export const QuizQuestionSchema = z.discriminatedUnion('type', [
  PinyinChoiceSchema,
  ListeningChoiceSchema,
  ToneChoiceSchema,
  MatchingSchema,
  FillBlankSchema,
  SentenceOrderSchema,
])

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>

// Gemini responseSchema (JSON Schema subset) mirroring QuizQuestionSchema.
// Gemini's structured output doesn't support Zod discriminated unions
// directly, so each type's shape is expressed as an object with all
// possible fields optional except the ones shared - the Zod schema above is
// the real validation gate applied after parsing the response.
export const GEMINI_QUIZ_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      description: 'Đúng 30 câu hỏi quiz: 5 câu cho mỗi dạng trong 6 dạng, chia thành part 1 (pinyin_choice, listening_choice, tone_choice) và part 2 (matching, fill_blank, sentence_order).',
      items: {
        type: 'object',
        properties: {
          part: { type: 'integer', enum: [1, 2], description: '1 cho pinyin_choice/listening_choice/tone_choice, 2 cho matching/fill_blank/sentence_order.' },
          type: {
            type: 'string',
            enum: ['pinyin_choice', 'listening_choice', 'tone_choice', 'matching', 'fill_blank', 'sentence_order'],
            description: 'Dạng câu hỏi.',
          },
          order: { type: 'integer', description: 'Thứ tự hiển thị trong toàn bộ danh sách câu hỏi, bắt đầu từ 1.' },
          prompt: { type: 'string', nullable: true, description: 'Dùng cho pinyin_choice: chữ Hán hoặc pinyin để hỏi.' },
          audioUrl: { type: 'string', nullable: true, description: 'Dùng cho listening_choice: audio_url của từ vựng đã có sẵn - PHẢI lấy nguyên văn từ dữ liệu được cung cấp, không tự bịa.' },
          wordZh: { type: 'string', nullable: true, description: 'Dùng cho tone_choice: chữ Hán của từ.' },
          pinyinNoTone: { type: 'string', nullable: true, description: 'Dùng cho tone_choice: pinyin không dấu thanh điệu của từ.' },
          choices: {
            type: 'array',
            nullable: true,
            description: 'Dùng cho pinyin_choice/listening_choice/tone_choice/fill_blank: đúng 4 lựa chọn.',
            items: { type: 'string' },
          },
          correctIndex: { type: 'integer', nullable: true, description: 'Dùng cho pinyin_choice/listening_choice/tone_choice/fill_blank: chỉ số (0-3) của đáp án đúng trong choices.' },
          pairs: {
            type: 'array',
            nullable: true,
            description: 'Dùng cho matching: đúng 5 cặp Hán-Việt để nối.',
            items: {
              type: 'object',
              properties: {
                left: { type: 'string', description: 'Chữ Hán.' },
                right: { type: 'string', description: 'Nghĩa tiếng Việt tương ứng.' },
              },
              required: ['left', 'right'],
            },
          },
          sentence: { type: 'string', nullable: true, description: 'Dùng cho fill_blank: câu có chỗ trống đánh dấu bằng "___".' },
          words: {
            type: 'array',
            nullable: true,
            description: 'Dùng cho sentence_order: các từ/cụm từ đã xáo trộn.',
            items: { type: 'string' },
          },
          correctOrder: {
            type: 'array',
            nullable: true,
            description: 'Dùng cho sentence_order: thứ tự index đúng (theo vị trí trong mảng "words") để ghép thành câu hoàn chỉnh.',
            items: { type: 'integer' },
          },
        },
        required: ['part', 'type', 'order'],
      },
    },
  },
  required: ['questions'],
} as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/gemini/quizSchema.test.ts`
Expected: PASS, all 9 test cases.

- [ ] **Step 5: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint lib/gemini/quizSchema.ts tests/lib/gemini/quizSchema.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add lib/gemini/quizSchema.ts tests/lib/gemini/quizSchema.test.ts
git commit -m "feat: add Zod schema and Gemini response schema for quiz questions"
```

---

### Task 3: Gemini quiz generation call

**Files:**
- Create: `lib/gemini/generateQuiz.ts`
- Test: `tests/lib/gemini/generateQuiz.test.ts`

**Interfaces:**
- Consumes: `QuizQuestionSchema`, `GEMINI_QUIZ_RESPONSE_SCHEMA` from `lib/gemini/quizSchema.ts` (Task 2); `ExtractionResult` type from `lib/gemini/schema.ts` (existing, pre-quiz-field shape is enough here since this task only reads `lesson`/`dialogues`/`grammarPoints`).
- Produces: `generateQuiz(result: ExtractionResult): Promise<QuizQuestion[]>` (exactly 30 items), used by Task 5 (API route).

- [ ] **Step 1: Write the failing test**

Create `tests/lib/gemini/generateQuiz.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

const { generateContentMock } = vi.hoisted(() => ({ generateContentMock: vi.fn() }))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock }
  },
}))

import { generateQuiz } from '@/lib/gemini/generateQuiz'
import type { ExtractionResult } from '@/lib/gemini/schema'

function validQuestion(part: 1 | 2, type: string, order: number) {
  if (type === 'matching') {
    return {
      part,
      type,
      order,
      pairs: [
        { left: '你好', right: 'xin chào' },
        { left: '謝謝', right: 'cảm ơn' },
        { left: '再見', right: 'tạm biệt' },
        { left: '對不起', right: 'xin lỗi' },
        { left: '請', right: 'xin mời' },
      ],
    }
  }
  if (type === 'sentence_order') {
    return { part, type, order, words: ['我', '喜歡', '吃', '中國菜'], correctOrder: [0, 1, 2, 3] }
  }
  if (type === 'fill_blank') {
    return { part, type, order, sentence: '我___去。', choices: ['想', '在', '和', '把'], correctIndex: 0 }
  }
  if (type === 'listening_choice') {
    return { part, type, order, audioUrl: 'https://x/vocab/a.mp3', choices: ['你好', '再見', '謝謝', '對不起'], correctIndex: 0 }
  }
  if (type === 'tone_choice') {
    return { part, type, order, wordZh: '你好', pinyinNoTone: 'ni hao', choices: ['nǐ hǎo', 'ní háo', 'nī hāo', 'nì hào'], correctIndex: 0 }
  }
  return { part, type, order, prompt: '你好', choices: ['nǐ hǎo', 'nī hǎo', 'ní hào', 'nǐ hào'], correctIndex: 0 }
}

function thirtyValidQuestions() {
  const part1Types = ['pinyin_choice', 'listening_choice', 'tone_choice']
  const part2Types = ['matching', 'fill_blank', 'sentence_order']
  const questions = []
  let order = 1
  for (const type of part1Types) {
    for (let i = 0; i < 5; i++) questions.push(validQuestion(1, type, order++))
  }
  for (const type of part2Types) {
    for (let i = 0; i < 5; i++) questions.push(validQuestion(2, type, order++))
  }
  return questions
}

function baseResult(): ExtractionResult {
  return {
    lesson: { lessonNo: 1, titleZh: 'A', titleVi: 'B', theme: null, objectives: [] },
    dialogues: [
      {
        order: 1,
        kind: 'dialogue',
        audioCode: null,
        lines: [{ order: 1, speakerZh: null, speakerPinyin: null, textZh: '你好', pinyin: null, translationVi: null }],
        vocabulary: [{ order: 1, wordZh: '你好', pinyin: 'nǐ hǎo', meaningVi: 'xin chào', audioUrl: 'https://x/vocab/a.mp3' }],
      },
    ],
    grammarPoints: [],
  }
}

describe('generateQuiz', () => {
  it('returns 30 validated quiz questions parsed from the Gemini response', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ questions: thirtyValidQuestions() }),
    })

    const questions = await generateQuiz(baseResult())

    expect(questions).toHaveLength(30)
    expect(questions.filter((q) => q.part === 1)).toHaveLength(15)
    expect(questions.filter((q) => q.part === 2)).toHaveLength(15)
  })

  it('throws when Gemini returns invalid JSON', async () => {
    generateContentMock.mockResolvedValue({ text: 'not json' })
    await expect(generateQuiz(baseResult())).rejects.toThrow(/not valid JSON/)
  })

  it('throws when the response fails schema validation', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ questions: [{ part: 1, type: 'pinyin_choice', order: 1 }] }),
    })
    await expect(generateQuiz(baseResult())).rejects.toThrow()
  })

  it('throws when the response does not have exactly 30 questions', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ questions: thirtyValidQuestions().slice(0, 29) }),
    })
    await expect(generateQuiz(baseResult())).rejects.toThrow(/30/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/gemini/generateQuiz.test.ts`
Expected: FAIL — `Cannot find module '@/lib/gemini/generateQuiz'`.

- [ ] **Step 3: Write the implementation**

Create `lib/gemini/generateQuiz.ts`:

```typescript
import { GoogleGenAI } from '@google/genai'
import type { ExtractionResult } from './schema'
import { QuizQuestionSchema, GEMINI_QUIZ_RESPONSE_SCHEMA, type QuizQuestion } from './quizSchema'

const QUIZ_PROMPT = `Bạn là công cụ sinh câu hỏi luyện tập (quiz) cho 1 bài học tiếng Trung, dựa trên nội dung bài khoá/từ vựng/ngữ pháp ĐÃ ĐƯỢC DUYỆT dưới đây (không phải trích xuất từ ảnh, mà từ dữ liệu JSON đã có sẵn).

Sinh đúng 30 câu hỏi, chia thành 6 dạng, MỖI dạng đúng 5 câu:

PHẦN 1 (part: 1) - nhận biết từ vựng/phát âm:
1. "pinyin_choice": cho 1 từ chữ Hán, hỏi pinyin đúng (hoặc ngược lại cho pinyin, hỏi chữ Hán đúng) trong 4 lựa chọn. Field: prompt (chữ Hán hoặc pinyin để hỏi), choices (4 lựa chọn), correctIndex (0-3).
2. "listening_choice": chỉ được chọn từ vựng ĐÃ CÓ audioUrl trong dữ liệu vocabulary được cung cấp (KHÔNG được chọn từ chưa có audioUrl, và KHÔNG được tự bịa audioUrl). Field: audioUrl (lấy nguyên văn từ dữ liệu), choices (4 lựa chọn nghĩa hoặc chữ Hán), correctIndex.
3. "tone_choice": cho 1 từ, hiển thị chữ Hán + pinyin KHÔNG dấu thanh điệu, hỏi thanh điệu đúng trong 4 biến thể pinyin có dấu khác nhau. Field: wordZh, pinyinNoTone, choices (4 biến thể pinyin có dấu), correctIndex.

PHẦN 2 (part: 2) - vận dụng câu/ngữ pháp:
4. "matching": MỖI câu hỏi dạng này tự chứa đúng 5 cặp chữ Hán - nghĩa tiếng Việt để nối (không phải chọn từ toàn bộ từ vựng bài). Field: pairs (mảng đúng 5 object {left: chữ Hán, right: nghĩa tiếng Việt}).
5. "fill_blank": dựa trên câu ví dụ ngữ pháp hoặc câu bài khoá có sẵn, đục 1 từ vựng ra khỏi câu, đánh dấu chỗ trống bằng "___". Field: sentence (câu có "___"), choices (4 lựa chọn từ để điền), correctIndex.
6. "sentence_order": lấy 1 câu bài khoá hoặc câu ví dụ có sẵn, xáo trộn các từ/cụm từ của câu đó. Field: words (mảng các từ đã xáo trộn), correctOrder (mảng index để sắp xếp lại "words" theo đúng thứ tự câu gốc, ví dụ nếu words=["thoại","hội","Bài"] và câu đúng là "Bài hội thoại" thì correctOrder=[2,1,0]).

QUAN TRỌNG: mỗi câu hỏi PHẢI có "part", "type", "order" (thứ tự liên tục 1-30 trong toàn bộ danh sách trả về, PHẦN 1 trước PHẦN 2). Chỉ dùng nội dung có trong dữ liệu được cung cấp bên dưới, KHÔNG tự sáng tác từ vựng/câu ngoài phạm vi bài học này.

Trả về đúng theo JSON schema đã cung cấp, không thêm giải thích ngoài JSON.`

export async function generateQuiz(result: ExtractionResult): Promise<QuizQuestion[]> {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

  const response = await client.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${QUIZ_PROMPT}\n\nDữ liệu bài học (JSON):\n${JSON.stringify({
              lesson: result.lesson,
              dialogues: result.dialogues,
              grammarPoints: result.grammarPoints,
            })}`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_QUIZ_RESPONSE_SCHEMA,
    },
  })

  const responseText = response.text

  let parsedJson: unknown
  try {
    if (!responseText) throw new Error('empty response')
    parsedJson = JSON.parse(responseText)
  } catch {
    throw new Error('Gemini response was not valid JSON')
  }

  const { questions } = parsedJson as { questions: unknown[] }
  if (!Array.isArray(questions) || questions.length !== 30) {
    throw new Error(`Expected exactly 30 quiz questions, got ${Array.isArray(questions) ? questions.length : 'invalid'}`)
  }

  return questions.map((q) => QuizQuestionSchema.parse(q))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/gemini/generateQuiz.test.ts`
Expected: PASS, all 4 test cases.

- [ ] **Step 5: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint lib/gemini/generateQuiz.ts tests/lib/gemini/generateQuiz.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add lib/gemini/generateQuiz.ts tests/lib/gemini/generateQuiz.test.ts
git commit -m "feat: add Gemini quiz generation call"
```

---

### Task 4: Extend `ExtractionResultSchema` with `quizQuestions`

**Files:**
- Modify: `lib/gemini/schema.ts`
- Test: `tests/lib/gemini/schema.test.ts` (existing file — add cases)

**Interfaces:**
- Consumes: `QuizQuestionSchema` from `lib/gemini/quizSchema.ts` (Task 2).
- Produces: `ExtractionResultSchema` now has a `quizQuestions: QuizQuestion[]` field (default `[]`), so `ExtractionResult` (the type used everywhere `raw_json` is parsed — the job PATCH route, `importJob.ts`, `generateJobAudio.ts`) carries the quiz draft without breaking existing parses of older jobs that predate this field.

- [ ] **Step 1: Check the existing schema test file structure**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && cat tests/lib/gemini/schema.test.ts`

Read the file to see the existing test style before adding to it (don't guess the pattern — match it exactly).

- [ ] **Step 2: Write the failing test**

Add this test case to `tests/lib/gemini/schema.test.ts` (in whichever `describe` block covers `ExtractionResultSchema`, following the file's existing structure):

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

- [ ] **Step 3: Run test to verify it fails**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/gemini/schema.test.ts`
Expected: FAIL — `quizQuestions` is `undefined`, not `[]` (schema doesn't have the field yet).

- [ ] **Step 4: Add the field to the schema**

In `lib/gemini/schema.ts`, add the import and extend `ExtractionResultSchema`:

```typescript
import { QuizQuestionSchema } from './quizSchema'
```

Change:

```typescript
export const ExtractionResultSchema = z.object({
  lesson: LessonMetaSchema,
  dialogues: z.array(DialogueSchema),
  grammarPoints: z.array(GrammarPointSchema),
})
```

to:

```typescript
export const ExtractionResultSchema = z.object({
  lesson: LessonMetaSchema,
  dialogues: z.array(DialogueSchema),
  grammarPoints: z.array(GrammarPointSchema),
  quizQuestions: z.array(QuizQuestionSchema).default([]),
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/gemini/schema.test.ts`
Expected: PASS, including the 2 new cases.

- [ ] **Step 6: Run the full test suite to check nothing else broke**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run`
Expected: all tests pass (the `.default([])` means every existing test that builds an `ExtractionResult` without `quizQuestions` still parses successfully).

- [ ] **Step 7: Typecheck**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add lib/gemini/schema.ts tests/lib/gemini/schema.test.ts
git commit -m "feat: add quizQuestions field to ExtractionResultSchema"
```

---

### Task 5: `/api/jobs/[jobId]/quiz` route (generate + save)

**Files:**
- Create: `app/api/jobs/[jobId]/quiz/route.ts`
- Test: `tests/api/jobs/quiz.test.ts` (check existing test conventions for API routes first — see note in Step 1)

**Interfaces:**
- Consumes: `generateQuiz` from `lib/gemini/generateQuiz.ts` (Task 3); `ExtractionResultSchema` from `lib/gemini/schema.ts` (Task 4); `requireAdmin` from `lib/supabase/requireAdmin.ts` (existing).
- Produces: `POST /api/jobs/[jobId]/quiz` (generates 30 questions, overwrites `raw_json.quizQuestions`, returns `{ quizQuestions }`); `PATCH /api/jobs/[jobId]/quiz` (body `{ quizQuestions }`, saves them into `raw_json`, advances `extraction_jobs.status` to `'quiz_ready'` if currently `'audio_ready'`, returns `{ status }`) — both used by Task 6 (UI page).

- [ ] **Step 1: Check for existing API route test conventions**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && find tests -path "*api*" -o -name "*route*"`

If no existing tests directly test route handlers (this project's existing tests are for `lib/db/*` and `lib/gemini/*`, not `app/api/*` routes directly), skip writing a route-level test file and instead rely on: (a) the underlying logic being tested via a new `lib/db/generateJobQuiz.ts` helper (extracted for testability, mirroring how `lib/db/generateJobAudio.ts` holds the logic the audio route calls), and (b) manual verification in Task 9. Re-check this assumption against what you find — if route tests do exist, follow that pattern instead of skipping.

- [ ] **Step 2: Write the failing test for the extracted helper**

Create `tests/lib/db/generateJobQuiz.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { generateQuizMock } = vi.hoisted(() => ({ generateQuizMock: vi.fn() }))

vi.mock('@/lib/gemini/generateQuiz', () => ({
  generateQuiz: generateQuizMock,
}))

let jobStatus = 'audio_ready'
let rawJson: any
const updateMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'extraction_jobs') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'job-1', status: jobStatus, raw_json: rawJson }, error: null }) }) }),
          update: (row: any) => ({
            eq: () => {
              updateMock(row)
              if ('raw_json' in row) rawJson = row.raw_json
              if ('status' in row) jobStatus = row.status
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { generateJobQuiz, saveJobQuiz, JobNotReadyForQuizError } from '@/lib/db/generateJobQuiz'

function baseRawJson() {
  return {
    lesson: { lessonNo: 1, titleZh: 'A', titleVi: 'B' },
    dialogues: [],
    grammarPoints: [],
    quizQuestions: [],
  }
}

const thirtyQuestions = Array.from({ length: 30 }, (_, i) => ({
  part: i < 15 ? 1 : 2,
  type: 'pinyin_choice',
  order: i + 1,
  prompt: 'x',
  choices: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
}))

describe('generateJobQuiz', () => {
  beforeEach(() => {
    jobStatus = 'audio_ready'
    rawJson = baseRawJson()
    updateMock.mockClear()
    generateQuizMock.mockClear()
  })

  it('rejects generating quiz for a job not yet audio_ready or quiz_ready', async () => {
    jobStatus = 'reviewed'
    await expect(generateJobQuiz('job-1')).rejects.toThrow(JobNotReadyForQuizError)
  })

  it('overwrites raw_json.quizQuestions with the generated questions', async () => {
    generateQuizMock.mockResolvedValue(thirtyQuestions)
    const questions = await generateJobQuiz('job-1')
    expect(questions).toHaveLength(30)
    expect(rawJson.quizQuestions).toHaveLength(30)
  })

  it('overwrites existing quiz questions when regenerated', async () => {
    rawJson.quizQuestions = [{ part: 1, type: 'pinyin_choice', order: 1, prompt: 'old', choices: ['a', 'b', 'c', 'd'], correctIndex: 0 }]
    generateQuizMock.mockResolvedValue(thirtyQuestions)
    await generateJobQuiz('job-1')
    expect(rawJson.quizQuestions).toHaveLength(30)
    expect(rawJson.quizQuestions[0].prompt).toBe('x')
  })
})

describe('saveJobQuiz', () => {
  beforeEach(() => {
    jobStatus = 'audio_ready'
    rawJson = baseRawJson()
    updateMock.mockClear()
  })

  it('saves the given questions and advances status to quiz_ready', async () => {
    const status = await saveJobQuiz('job-1', thirtyQuestions)
    expect(rawJson.quizQuestions).toHaveLength(30)
    expect(status).toBe('quiz_ready')
    expect(jobStatus).toBe('quiz_ready')
  })

  it('keeps status as quiz_ready if already there (re-saving edits)', async () => {
    jobStatus = 'quiz_ready'
    const status = await saveJobQuiz('job-1', thirtyQuestions)
    expect(status).toBe('quiz_ready')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/db/generateJobQuiz.test.ts`
Expected: FAIL — `Cannot find module '@/lib/db/generateJobQuiz'`.

- [ ] **Step 4: Write `lib/db/generateJobQuiz.ts`**

```typescript
import { createServerSupabase } from '@/lib/supabase/server'
import { ExtractionResultSchema } from '@/lib/gemini/schema'
import { generateQuiz } from '@/lib/gemini/generateQuiz'
import type { QuizQuestion } from '@/lib/gemini/quizSchema'
import type { JobStatus } from '@/lib/db/types'

export class JobNotReadyForQuizError extends Error {}

async function loadJob(supabase: ReturnType<typeof createServerSupabase>, jobId: string) {
  const { data: job, error } = await supabase.from('extraction_jobs').select().eq('id', jobId).single()
  if (error || !job) throw new Error('extraction job not found')
  return job
}

// Generates a fresh set of 30 quiz questions from the job's reviewed
// content, overwriting any existing quiz draft. Only reachable once audio
// has been generated ('audio_ready' or later), matching the pipeline order:
// text -> audio -> quiz -> import.
export async function generateJobQuiz(jobId: string): Promise<QuizQuestion[]> {
  const supabase = createServerSupabase()
  const job = await loadJob(supabase, jobId)

  if (job.status !== 'audio_ready' && job.status !== 'quiz_ready') {
    throw new JobNotReadyForQuizError('Công việc cần hoàn tất bước "Sinh & duyệt Audio" trước khi sinh quiz.')
  }

  const result = ExtractionResultSchema.parse(job.raw_json)
  const quizQuestions = await generateQuiz(result)

  await supabase
    .from('extraction_jobs')
    .update({ raw_json: { ...result, quizQuestions } })
    .eq('id', jobId)

  return quizQuestions
}

// Saves admin-edited quiz questions into the job's raw_json and advances
// status to 'quiz_ready' (only from 'audio_ready' - re-saving edits on an
// already quiz_ready job is a no-op status-wise, same pattern as the job
// PATCH route for text edits).
export async function saveJobQuiz(jobId: string, quizQuestions: QuizQuestion[]): Promise<JobStatus> {
  const supabase = createServerSupabase()
  const job = await loadJob(supabase, jobId)

  const result = ExtractionResultSchema.parse(job.raw_json)
  const nextStatus: JobStatus = job.status === 'audio_ready' ? 'quiz_ready' : job.status

  await supabase
    .from('extraction_jobs')
    .update({ raw_json: { ...result, quizQuestions }, status: nextStatus })
    .eq('id', jobId)

  return nextStatus
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/db/generateJobQuiz.test.ts`
Expected: PASS, all 5 test cases.

- [ ] **Step 6: Write the API route**

Create `app/api/jobs/[jobId]/quiz/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { generateJobQuiz, saveJobQuiz, JobNotReadyForQuizError } from '@/lib/db/generateJobQuiz'
import { QuizQuestionSchema } from '@/lib/gemini/quizSchema'
import { z } from 'zod'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { jobId } = await params

  try {
    const quizQuestions = await generateJobQuiz(jobId)
    return NextResponse.json({ quizQuestions })
  } catch (err) {
    if (err instanceof JobNotReadyForQuizError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'unknown quiz generation error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const SaveQuizBodySchema = z.object({
  quizQuestions: z.array(QuizQuestionSchema),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { jobId } = await params
  const body = await request.json().catch(() => null)
  const parsed = SaveQuizBodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'quizQuestions is required and must match the quiz question schema' }, { status: 400 })
  }

  try {
    const status = await saveJobQuiz(jobId, parsed.data.quizQuestions)
    return NextResponse.json({ status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error saving quiz'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 7: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint lib/db/generateJobQuiz.ts "app/api/jobs/[jobId]/quiz/route.ts" tests/lib/db/generateJobQuiz.test.ts`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add lib/db/generateJobQuiz.ts "app/api/jobs/[jobId]/quiz/route.ts" tests/lib/db/generateJobQuiz.test.ts
git commit -m "feat: add quiz generation/save API route and DB helper"
```

---

### Task 6: Admin quiz review page UI

**Files:**
- Create: `app/(protected)/books/[bookId]/jobs/[jobId]/quiz/page.tsx`
- Modify: `app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx`

**Interfaces:**
- Consumes: `POST`/`PATCH /api/jobs/[jobId]/quiz` (Task 5); `EditableText` (`components/editable-text.tsx`, existing); `BlockActions` (`components/block-actions.tsx`, existing); `moveItem` (`lib/moveItem.ts`, existing); `BackLink` (`components/back-link.tsx`, existing); `QuizQuestion` type from `lib/gemini/quizSchema.ts` (Task 2/3).
- Produces: the `/books/[bookId]/jobs/[jobId]/quiz` route; a "Sinh & duyệt Quiz" button on the job review page next to the existing "Sinh & duyệt Audio" button.

- [ ] **Step 1: Read the audio page for the exact pattern to mirror**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && cat "app/(protected)/books/[bookId]/jobs/[jobId]/audio/page.tsx"`

This is the direct template: same `use(params)`, `loadJob`/`isLoading`/`loadError` state shape, same `BackLink` full-width wrapper pattern, same "not auto-generate on mount, button-triggered" behavior. Match its structure exactly, adapting only the generate/save calls and the per-question rendering.

- [ ] **Step 2: Write the page**

Create `app/(protected)/books/[bookId]/jobs/[jobId]/quiz/page.tsx`:

```tsx
"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BackLink } from "@/components/back-link"
import { EditableText } from "@/components/editable-text"
import { BlockActions } from "@/components/block-actions"
import { moveItem } from "@/lib/moveItem"
import type { ExtractionJob } from "@/lib/db/types"
import type { QuizQuestion } from "@/lib/gemini/quizSchema"

interface Props {
  params: Promise<{ bookId: string; jobId: string }>
}

const TYPE_LABELS: Record<QuizQuestion["type"], string> = {
  pinyin_choice: "Chọn Pinyin/Chữ Hán",
  listening_choice: "Nghe & chọn đáp án",
  tone_choice: "Nhận biết thanh điệu",
  matching: "Ghép nghĩa",
  fill_blank: "Điền từ vào chỗ trống",
  sentence_order: "Sắp xếp câu",
}

function QuestionCard({
  question,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  question: QuizQuestion
  onChange: (patch: Partial<QuizQuestion>) => void
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
          {TYPE_LABELS[question.type]}
        </span>
        <BlockActions
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onRemove={onRemove}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          removeLabel="Xoá câu hỏi"
          className="group-hover/question:opacity-100"
        />
      </div>

      {question.type === "pinyin_choice" && (
        <>
          <EditableText value={question.prompt} onChange={(prompt) => onChange({ prompt })} className="field-zh" />
          {question.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                checked={question.correctIndex === i}
                onChange={() => onChange({ correctIndex: i })}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChange({ choices: choices as [string, string, string, string] })
                }}
                className="flex-1 text-sm"
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
                checked={question.correctIndex === i}
                onChange={() => onChange({ correctIndex: i })}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChange({ choices: choices as [string, string, string, string] })
                }}
                className="flex-1 text-sm"
              />
            </div>
          ))}
        </>
      )}

      {question.type === "tone_choice" && (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <EditableText value={question.wordZh} onChange={(wordZh) => onChange({ wordZh })} className="field-zh" />
            <EditableText
              value={question.pinyinNoTone}
              onChange={(pinyinNoTone) => onChange({ pinyinNoTone })}
              className="w-auto"
            />
          </div>
          {question.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                checked={question.correctIndex === i}
                onChange={() => onChange({ correctIndex: i })}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChange({ choices: choices as [string, string, string, string] })
                }}
                className="flex-1 text-sm"
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
                  onChange({ pairs: pairs as typeof question.pairs })
                }}
                className="field-zh"
              />
              <EditableText
                value={pair.right}
                onChange={(right) => {
                  const pairs = [...question.pairs]
                  pairs[i] = { ...pairs[i], right }
                  onChange({ pairs: pairs as typeof question.pairs })
                }}
                className="text-sm"
              />
            </div>
          ))}
        </div>
      )}

      {question.type === "fill_blank" && (
        <>
          <EditableText
            value={question.sentence}
            onChange={(sentence) => onChange({ sentence })}
            className="field-zh"
          />
          {question.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                checked={question.correctIndex === i}
                onChange={() => onChange({ correctIndex: i })}
                aria-label={`Đáp án đúng là lựa chọn ${i + 1}`}
              />
              <EditableText
                value={choice}
                onChange={(v) => {
                  const choices = [...question.choices]
                  choices[i] = v
                  onChange({ choices: choices as [string, string, string, string] })
                }}
                className="flex-1 text-sm"
              />
            </div>
          ))}
        </>
      )}

      {question.type === "sentence_order" && (
        <div className="flex flex-wrap gap-2">
          {question.correctOrder.map((wordIdx, position) => (
            <EditableText
              key={position}
              value={question.words[wordIdx]}
              onChange={(v) => {
                const words = [...question.words]
                words[wordIdx] = v
                onChange({ words })
              }}
              className="field-zh w-auto"
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function JobQuizPage({ params }: Props) {
  const { bookId, jobId } = use(params)
  const router = useRouter()

  const [job, setJob] = useState<ExtractionJob | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const loadJob = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Không tải được công việc trích xuất.")
      }
      const jobData: ExtractionJob = await res.json()
      setJob(jobData)
      const rawQuestions = (jobData.raw_json as { quizQuestions?: QuizQuestion[] } | null)?.quizQuestions
      setQuestions(rawQuestions ?? [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Không tải được công việc trích xuất.")
    } finally {
      setIsLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    // loadJob sets state synchronously before its first await - intentional
    // mount-time fetch, not a cascading-render bug.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadJob()
  }, [loadJob])

  async function handleGenerate() {
    if (questions && questions.length > 0) {
      const confirmed = window.confirm(
        "Sẽ xoá toàn bộ 30 câu hỏi hiện tại (kể cả đã sửa tay) và sinh lại từ đầu, tiếp tục?"
      )
      if (!confirmed) return
    }

    setIsGenerating(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/quiz`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Sinh quiz thất bại.")
      }
      const { quizQuestions } = await res.json()
      setQuestions(quizQuestions)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Sinh quiz thất bại.")
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSave() {
    if (!questions) return
    setIsSaving(true)
    setActionError(null)
    setSaveSuccess(false)
    try {
      const res = await fetch(`/api/jobs/${jobId}/quiz`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizQuestions: questions }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Lưu quiz thất bại.")
      }
      setSaveSuccess(true)
      await loadJob()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Lưu quiz thất bại.")
    } finally {
      setIsSaving(false)
    }
  }

  function updateQuestion(index: number, patch: Partial<QuizQuestion>) {
    setQuestions((prev) => {
      if (!prev) return prev
      return prev.map((q, i) => (i === index ? ({ ...q, ...patch } as QuizQuestion) : q))
    })
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => (prev ? prev.filter((_, i) => i !== index) : prev))
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((prev) => (prev ? moveItem(prev, index, direction) : prev))
  }

  if (isLoading) {
    return <main className="mx-auto w-full max-w-3xl px-4 py-10 text-sm text-muted-foreground">Đang tải...</main>
  }

  if (loadError || !job || !questions) {
    return (
      <>
        <div className="w-full px-4 pt-6 sm:px-6">
          <BackLink href={`/books/${bookId}/jobs/${jobId}`} label="Quay lại" />
        </div>
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10">
          <p className="text-sm text-destructive">{loadError ?? "Không tải được dữ liệu."}</p>
        </main>
      </>
    )
  }

  const part1 = questions.filter((q) => q.part === 1)
  const part2 = questions.filter((q) => q.part === 2)

  return (
    <>
      <div className="w-full px-4 pt-6 sm:px-6">
        <BackLink href={`/books/${bookId}/jobs/${jobId}`} label="Quay lại" />
      </div>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Sinh &amp; duyệt Quiz</h1>
            <Badge variant={job.status === "quiz_ready" ? "info" : "pending"} className="mt-1">
              {job.status === "quiz_ready" ? "Đã duyệt quiz" : "Đang chờ sinh quiz"}
            </Badge>
          </div>
          <Button variant="outline" onClick={() => router.push(`/books/${bookId}/jobs/${jobId}`)}>
            Quay lại
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
          <Button type="button" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? "Đang sinh quiz..." : questions.length > 0 ? "Sinh lại Quiz" : "Sinh Quiz"}
          </Button>
          {questions.length > 0 && (
            <Button type="button" variant="outline" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Đang lưu..." : "Lưu"}
            </Button>
          )}
          {saveSuccess && <p className="text-sm text-status-success">Đã lưu.</p>}
        </div>

        {actionError && <p className="text-sm text-destructive">{actionError}</p>}

        {questions.length === 0 && !isGenerating && (
          <p className="text-sm text-muted-foreground">Chưa có câu hỏi quiz nào. Bấm &quot;Sinh Quiz&quot; để bắt đầu.</p>
        )}

        {part1.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-foreground">Phần 1 ({part1.length} câu)</h2>
            {part1.map((q) => {
              const index = questions.indexOf(q)
              return (
                <QuestionCard
                  key={index}
                  question={q}
                  onChange={(patch) => updateQuestion(index, patch)}
                  onRemove={() => removeQuestion(index)}
                  onMoveUp={() => moveQuestion(index, -1)}
                  onMoveDown={() => moveQuestion(index, 1)}
                  canMoveUp={index > 0}
                  canMoveDown={index < questions.length - 1}
                />
              )
            })}
          </section>
        )}

        {part2.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-foreground">Phần 2 ({part2.length} câu)</h2>
            {part2.map((q) => {
              const index = questions.indexOf(q)
              return (
                <QuestionCard
                  key={index}
                  question={q}
                  onChange={(patch) => updateQuestion(index, patch)}
                  onRemove={() => removeQuestion(index)}
                  onMoveUp={() => moveQuestion(index, -1)}
                  onMoveDown={() => moveQuestion(index, 1)}
                  canMoveUp={index > 0}
                  canMoveDown={index < questions.length - 1}
                />
              )
            })}
          </section>
        )}
      </main>
    </>
  )
}
```

Note on the `EditableText` `className` prop for choice inputs: check `components/editable-text.tsx`'s props (read in Task's Step 1 reference or re-check now) to confirm `className` accepts plain Tailwind strings like `"flex-1 text-sm"` — it does, per the existing component signature (`className?: string`, merged via `cn()`).

- [ ] **Step 2: Add the "Sinh & duyệt Quiz" button to the job review page**

Read `app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx` around the existing "Sinh & duyệt Audio" button (search for `Sinh &amp; duyệt Audio` in the file) and add a sibling button right after it:

```tsx
{(job.status === "audio_ready" || job.status === "quiz_ready") && (
  <Button variant="outline" onClick={() => router.push(`/books/${bookId}/jobs/${jobId}/quiz`)}>
    Sinh &amp; duyệt Quiz
  </Button>
)}
```

Place this in the same button group as the existing `Sinh & duyệt Audio`/`Import vào DB` buttons (the `<div className="flex flex-wrap items-center gap-2">` block in the sticky header), positioned between the audio button and the import button so the visual order matches the pipeline order (text → audio → quiz → import).

- [ ] **Step 3: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint "app/(protected)/books/[bookId]/jobs/[jobId]/quiz/page.tsx" "app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx"`
Expected: no errors. If there are TypeScript narrowing errors on the discriminated union in `QuestionCard` (e.g. `question.prompt` not narrowing correctly inside `question.type === "pinyin_choice"` blocks), double-check that `QuizQuestion` from `lib/gemini/quizSchema.ts` is a proper Zod-inferred discriminated union type (`z.infer` of `z.discriminatedUnion`) — TypeScript narrows correctly on those by default; if it doesn't, the issue is more likely a typo in a field access than the union itself.

- [ ] **Step 4: Run the full test suite**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run`
Expected: all tests still pass (this task added no new test files, but must not break existing ones).

- [ ] **Step 5: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add "app/(protected)/books/[bookId]/jobs/[jobId]/quiz/page.tsx" "app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx"
git commit -m "feat: add quiz review page and job-review button"
```

---

### Task 7: Import quiz questions into `quiz_questions` table

**Files:**
- Modify: `lib/db/importJob.ts`
- Test: `tests/lib/db/importJob.test.ts` (existing file — add a case)

**Interfaces:**
- Consumes: `ExtractionResult.quizQuestions` (from Task 4's schema extension).
- Produces: `importExtractionJob` now inserts rows into `quiz_questions` (schema from Task 1) as part of the existing import transaction-like flow (best-effort rollback via lesson delete on failure, same as the rest of the function).

- [ ] **Step 1: Read the existing test file's fixture/mock style**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && cat tests/lib/db/importJob.test.ts`

Match its exact Supabase mock shape (the `from(table)` dispatch, insert/select chain style) when adding the new test case — do not invent a different mocking style.

- [ ] **Step 2: Write the failing test**

Add a test case to `tests/lib/db/importJob.test.ts` (adapt table names/mock wiring to match the file's existing pattern exactly — the sketch below shows the shape of the assertion, not literal code to paste unmodified):

```typescript
it('inserts quiz questions from raw_json.quizQuestions into quiz_questions, tagged with the new lesson id', async () => {
  // Arrange: raw_json includes a `quizQuestions` array with 2 sample questions
  // (one part 1, one part 2), job.status = 'quiz_ready'.
  // Act: await importExtractionJob(jobId)
  // Assert: the mock for `quiz_questions` table's `.insert(...)` was called
  // with an array of 2 rows, each having `lesson_id` equal to the newly
  // inserted lesson's id, and `part`/`type`/`order`/`payload` matching the
  // source quizQuestions entries (payload = everything except part/type/order).
})
```

Write this as real, runnable test code once you've read the existing file's mock structure in Step 1 — the exact mock wiring depends on that file's conventions, which must be read first rather than guessed.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/db/importJob.test.ts`
Expected: FAIL — no `quiz_questions` insert happens yet, or the mock throws `unexpected table quiz_questions` if the mock's `from()` dispatch doesn't yet have a case for it (add that case as part of writing the test).

- [ ] **Step 4: Add the insert to `importJob.ts`**

In `lib/db/importJob.ts`, after the grammar points loop (right before the `} catch (err) {` block), add:

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

This goes inside the existing `try` block, so a failure here still triggers the existing rollback (`await supabase.from('lessons').delete().eq('id', lesson.id)` in the `catch`).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/db/importJob.test.ts`
Expected: PASS, including the new case and all pre-existing cases in the file.

- [ ] **Step 6: Run the full test suite**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint lib/db/importJob.ts tests/lib/db/importJob.test.ts`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add lib/db/importJob.ts tests/lib/db/importJob.test.ts
git commit -m "feat: insert quiz questions into quiz_questions table on import"
```

---

### Task 8: Full verification pass

**Files:** none (verification only)

**Interfaces:** none — this task only runs checks across everything from Tasks 1-7.

- [ ] **Step 1: Full typecheck**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 2: Full lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx eslint .`
Expected: no errors (pre-existing unrelated warnings like unused imports in untouched files are acceptable; anything new introduced by this plan must be clean).

- [ ] **Step 3: Full test suite**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run`
Expected: all tests pass, including every new test file from Tasks 1-7.

- [ ] **Step 4: Production build**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npm run build`
Expected: build succeeds, and the route list includes `/books/[bookId]/jobs/[jobId]/quiz` and `/api/jobs/[jobId]/quiz`.

- [ ] **Step 5: Manual smoke test (report to user, do not attempt to automate)**

This step is a checklist for the human reviewer, not something to script:
1. Run `npm run dev`, open a job at `audio_ready` status.
2. Confirm a "Sinh & duyệt Quiz" button appears next to "Sinh & duyệt Audio".
3. Click it, land on `/books/[bookId]/jobs/[jobId]/quiz`, confirm no auto-generation happens on load.
4. Click "Sinh Quiz", confirm 30 questions appear across "Phần 1" (15) and "Phần 2" (15), grouped and labeled by type.
5. Edit one question's text and one `correctIndex`, click "Lưu", reload the page, confirm the edit persisted and the job's status badge shows "Đã duyệt quiz".
6. Go back to the job review page, confirm "Import vào DB" is available, import, and check the resulting lesson's `quiz_questions` rows in Supabase (via SQL Editor) match what was reviewed.

- [ ] **Step 6: Remind the user about the pending migration**

Tell the user: migration `supabase/migrations/0019_quiz_questions.sql` has NOT been applied to the live Supabase project yet — it must be run manually via the Supabase SQL Editor before this feature can work end-to-end (same as every prior migration in this project).

---

## Self-Review Notes (completed during plan authoring)

- **Spec coverage:** Section 1 (scope/routes/status transition) → Tasks 5, 6. Section 2 (6 question types) → Task 2 payloads, Task 3 prompt. Section 3 (30 questions, 2-part split) → Task 2 (schema enforces exactly 5/type via `.length()` on `choices`, but count-per-type isn't schema-enforced — deliberately left to the Gemini prompt + the `=== 30` total-count check in `generateQuiz`, since per-type counting client-side isn't a hard requirement per the spec, only "5 per type" as the target). Section 4 (schema) → Task 1 (table), Task 2 (payload shapes). Section 5 (data source) → Task 3 (prompt explicitly restricts to provided JSON, no PDF). Section 6 (generate/save/regenerate-confirms/no-tabs UI) → Task 6. Section 7 (post-import display) explicitly out of scope, not planned. Section 8 explicitly out of scope, not planned.
- **Placeholder scan:** no TBD/TODO; all steps have runnable code.
- **Type consistency:** `QuizQuestion` (draft type, from `quizSchema.ts`, used in job `raw_json` and the UI) vs `QuizQuestion` (DB row type, from `lib/db/types.ts`, used in Task 7's import) are two distinct types with the same name in different modules — this is called out explicitly in Task 1 and Task 2's Interfaces sections to prevent confusion during implementation. Field names (`part`, `type`, `order`, plus type-specific fields) are consistent across Tasks 1-7.
