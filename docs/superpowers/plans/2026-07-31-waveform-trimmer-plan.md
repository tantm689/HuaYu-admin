# Waveform Trimmer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin page that cuts a dialogue's full audio recording into per-line clips, so each `dialogue_lines` row gets its own `audio_url` for the future User app's karaoke Shadowing mode.

**Architecture:** A new per-dialogue route `/lessons/[lessonId]/edit/dialogues/[dialogueId]/trim` renders a waveform (`wavesurfer.js` + its Regions plugin) alongside the dialogue's line list. Admin marks one region per line (restored from `start_time`/`end_time` if already cut), previews it, then hits one "Xác nhận" button that cuts every marked line client-side via the Web Audio API, uploads each clip to Supabase Storage, and a new API route persists `audio_url`/`start_time`/`end_time` per line in one batch call.

**Tech Stack:** Next.js 16 App Router, TypeScript, `wavesurfer.js` (new dependency) + `@wavesurfer/regions` plugin, Web Audio API (`AudioContext`, `OfflineAudioContext`), hand-written WAV encoder (no new dependency for encoding — see Global Constraints), Supabase Storage, Zod, Vitest.

## Global Constraints

- Every new/modified file must pass `npx tsc --noEmit -p tsconfig.json`, `npx eslint <files>`, and `npx vitest run` before a task is done.
- All UI-facing strings are Vietnamese, matching the rest of the admin app.
- Migrations in this repo are written but never auto-applied — the admin must run them via the Supabase SQL Editor. Every migration file must end with the same "NOTE: this migration has not been applied..." caveat comment already used in every prior migration (see `supabase/migrations/0019_quiz_questions.sql` for the exact wording to copy).
- Cutting/mutating trimmer routes require `requireLessonDraft(lessonId)` (from `lib/db/updateLessonFull.ts`, existing, unchanged) — same guard already used by the audio/quiz routes; a published lesson's dialogue audio cannot be re-cut.
- **Encoding format decision:** cut clips are encoded as WAV (`audio/wav`), not mp3. Every other audio upload in this codebase (`generateLessonAudio.ts`, the bulk dialogue-audio route) uses `audio/mpeg`/mp3 because the audio arrives pre-encoded (TTS output or an uploaded mp3 file) — there is no existing mp3-encoding step anywhere in this codebase. Adding a browser-side mp3 encoder means a new dependency (e.g. `lamejs`) with real quality/latency tradeoffs; the spec explicitly left this undecided for plan-writing time. This plan picks WAV because it requires zero new dependencies (a WAV file is a fixed-size header plus raw PCM samples, straightforward to construct by hand from an `AudioBuffer`) and every modern browser plays it natively via `<audio>`. **This is a deliberate deviation from the `audio/mpeg` convention elsewhere — do not "fix" it to match, and do not treat a `.wav` file extension in Storage paths for this feature as a bug.**
- No test framework can run real waveform rendering or Web Audio API decoding/cutting in this project's Vitest setup (jsdom has no real audio decode/HTMLMediaElement support) — those parts are verified by manual browser testing (Task 6). Everything else (the migration, the DB update function, the API route, the WAV-encoding pure function, the region↔line mapping logic) is unit-testable and must have tests.

---

## File Structure

- **`supabase/migrations/0020_dialogue_line_trim_times.sql`** (new) — adds `start_time numeric`, `end_time numeric` to `dialogue_lines`.
- **`package.json`** (modify) — adds `wavesurfer.js` dependency.
- **`lib/audio/encodeWav.ts`** (new) — pure function: given a Web Audio `AudioBuffer`, returns a `Blob` containing a valid WAV file. No DOM/network dependency, fully unit-testable by constructing an in-memory `AudioBuffer`-shaped object.
- **`lib/db/trimDialogueLines.ts`** (new) — `updateDialogueLineTrims(lines: {id: string; audioUrl: string; startTime: number; endTime: number}[]): Promise<void>`, a dedicated batch-update function (mirrors `syncDialogueLines`'s per-row `.update()` pattern in `lib/db/updateLessonFull.ts`, but only ever touches `audio_url`/`start_time`/`end_time` — never routes through `updateLessonFull` itself, since that function's payload schema doesn't carry these fields and this must never risk touching `text_zh`/`speaker_zh`/etc.).
- **`app/api/lessons/[lessonId]/dialogues/[dialogueId]/trim/route.ts`** (new) — `PATCH` (body: `{lines: [{id, audioUrl, startTime, endTime}]}`), guarded by `requireLessonDraft`, calls `updateDialogueLineTrims`.
- **`app/(protected)/lessons/[lessonId]/edit/dialogues/[dialogueId]/trim/page.tsx`** (new) — the trimmer page itself: loads the dialogue + lines, renders wavesurfer + regions, line list, preview, and the single confirm button that cuts+uploads+PATCHes.
- **`app/(protected)/lessons/[lessonId]/edit/page.tsx`** (modify) — adds a "Cắt audio hội thoại" link next to each dialogue's `<audio>` player (only when `dialogue.audioUrl` is present).
- **`lib/db/getLessonFull.ts`** (modify) — `LessonFullView`'s `dialogues[].lines[]` gains `startTime: number | null` and `endTime: number | null`.
- **Test files:** `tests/lib/audio/encodeWav.test.ts` (new), `tests/lib/db/trimDialogueLines.test.ts` (new), `tests/api/dialogue-lines-trim.test.ts` (new).

---

### Task 1: Migration — `start_time`/`end_time` on `dialogue_lines`

**Files:**
- Create: `supabase/migrations/0020_dialogue_line_trim_times.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `dialogue_lines.start_time numeric null`, `dialogue_lines.end_time numeric null` — consumed by Task 2 (`lib/db/getLessonFull.ts`), Task 4 (`lib/db/trimDialogueLines.ts`).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0020_dialogue_line_trim_times.sql`:

```sql
-- dialogue_lines gains start_time/end_time (seconds, nullable): the
-- waveform trimmer admin feature needs to remember exactly which region of
-- the dialogue's full audio_url each line was cut from, so re-opening the
-- trimmer page can restore the previously marked region instead of forcing
-- the admin to re-mark every line from scratch just to fix one. The cut
-- audio_url alone can't be reversed back into a position within the
-- original full recording.
--
-- NOTE: this migration has not been applied to the live Supabase project —
-- same manual-apply caveat as every prior migration in this project. Must be
-- run via the Supabase SQL Editor before merge.

alter table dialogue_lines add column start_time numeric;
alter table dialogue_lines add column end_time numeric;
```

- [ ] **Step 2: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add supabase/migrations/0020_dialogue_line_trim_times.sql
git commit -m "feat: add start_time/end_time columns to dialogue_lines for the waveform trimmer"
```

---

### Task 2: Surface `startTime`/`endTime` through `getLessonFull`

**Files:**
- Modify: `lib/db/types.ts`
- Modify: `lib/db/getLessonFull.ts`
- Test: `tests/lib/db/getLessonFull.test.ts` (check whether this file already exists first — if it does, add a case to it; if not, this task does NOT create one from scratch, since this codebase doesn't have DB-layer read tests for `getLessonFull` elsewhere — verify this by checking `tests/lib/db/` for any existing `getLessonFull` test before deciding)

**Interfaces:**
- Consumes: `dialogue_lines.start_time`/`end_time` (Task 1).
- Produces: `LessonFullView['dialogues'][number]['lines'][number]` gains `startTime: number | null`, `endTime: number | null` — consumed by Task 6 (the trimmer page, to restore previously-marked regions) and Task 3 (the edit page, to decide whether a line has already been cut, though Task 3 only needs `audioUrl` for that).

- [ ] **Step 1: Update `DialogueLine` in `lib/db/types.ts`**

Change (around line 34-44):

```typescript
export interface DialogueLine {
  id: string
  dialogue_id: string
  order: number
  speaker_zh: string | null
  speaker_pinyin: string | null
  text_zh: string
  pinyin: string | null
  translation_vi: string | null
  audio_url: string | null
}
```

to:

```typescript
export interface DialogueLine {
  id: string
  dialogue_id: string
  order: number
  speaker_zh: string | null
  speaker_pinyin: string | null
  text_zh: string
  pinyin: string | null
  translation_vi: string | null
  audio_url: string | null
  start_time: number | null
  end_time: number | null
}
```

- [ ] **Step 2: Update `LessonFullView` and the mapping in `lib/db/getLessonFull.ts`**

In the `LessonFullView` interface (around line 48-57), change:

```typescript
    lines: {
      id: string
      order: number
      speakerZh: string | null
      speakerPinyin: string | null
      textZh: string
      pinyin: string | null
      translationVi: string | null
      audioUrl: string | null
    }[]
```

to:

```typescript
    lines: {
      id: string
      order: number
      speakerZh: string | null
      speakerPinyin: string | null
      textZh: string
      pinyin: string | null
      translationVi: string | null
      audioUrl: string | null
      startTime: number | null
      endTime: number | null
    }[]
```

In the return mapping (around line 249-258), change:

```typescript
      lines: (linesByDialogue.get(d.id) ?? []).map((l) => ({
        id: l.id,
        order: l.order,
        speakerZh: l.speaker_zh,
        speakerPinyin: l.speaker_pinyin,
        textZh: l.text_zh,
        pinyin: l.pinyin,
        translationVi: l.translation_vi,
        audioUrl: l.audio_url,
      })),
```

to:

```typescript
      lines: (linesByDialogue.get(d.id) ?? []).map((l) => ({
        id: l.id,
        order: l.order,
        speakerZh: l.speaker_zh,
        speakerPinyin: l.speaker_pinyin,
        textZh: l.text_zh,
        pinyin: l.pinyin,
        translationVi: l.translation_vi,
        audioUrl: l.audio_url,
        startTime: l.start_time,
        endTime: l.end_time,
      })),
```

- [ ] **Step 3: Typecheck**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json`
Expected: errors will appear in `app/(protected)/lessons/[lessonId]/edit/page.tsx` wherever it builds a `DialogueLine`-shaped object without `startTime`/`endTime` (e.g. the `emptyLine()` helper). This is expected — Task 3 fixes it. Confirm no OTHER file has new errors.

- [ ] **Step 4: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add lib/db/types.ts lib/db/getLessonFull.ts
git commit -m "feat: surface dialogue_lines.start_time/end_time through getLessonFull"
```

---

### Task 3: Fix the edit page's `emptyLine()` helper, add the trim link

**Files:**
- Modify: `app/(protected)/lessons/[lessonId]/edit/page.tsx`

**Interfaces:**
- Consumes: `LessonFullView['dialogues'][number].lines[number].startTime`/`.endTime` (Task 2), `dialogue.audioUrl` (existing, unchanged).
- Produces: nothing new for later tasks — this task only fixes the tsc error from Task 2 and adds the navigation entry point into Task 6's page.

- [ ] **Step 1: Fix `emptyLine()`**

Find the `emptyLine` helper (search for `function emptyLine`). It currently returns a `DialogueLine`-shaped object missing `startTime`/`endTime` after Task 2's type change. Add the two fields as `null`:

```typescript
function emptyLine(order: number): DialogueLine {
  return {
    id: tempId(),
    order,
    speakerZh: null,
    speakerPinyin: null,
    textZh: "",
    pinyin: null,
    translationVi: null,
    audioUrl: null,
    startTime: null,
    endTime: null,
  }
}
```

(This matches the existing function's exact current shape plus the two new fields — read the live file first to confirm the exact current field list/order before editing, since intervening tasks in other work may have touched this file.)

- [ ] **Step 2: Add the "Cắt audio hội thoại" link**

Find the block that renders `dialogue.audioUrl && <audio ... />` inside the `dialogues` tab's `AccordionContent` (search for `{dialogue.audioUrl && (`). Add a link right after the `<audio>` element:

```tsx
                  {dialogue.audioUrl && (
                    <div className="flex items-center gap-3">
                      <audio controls preload="none" src={dialogue.audioUrl} className="h-8 w-full max-w-sm" />
                      <Link
                        href={`/lessons/${lessonId}/edit/dialogues/${dialogue.id}/trim`}
                        className="text-sm whitespace-nowrap text-primary underline-offset-4 hover:underline"
                      >
                        Cắt audio hội thoại
                      </Link>
                    </div>
                  )}
```

Add the import if not already present (check the top of the file first — `next/link` may already be imported for another purpose in this file; if so, don't duplicate the import):

```tsx
import Link from "next/link"
```

- [ ] **Step 3: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint "app/(protected)/lessons/[lessonId]/edit/page.tsx"`
Expected: no errors (the Task 2 error from `emptyLine()` is now fixed; the new `/trim` route doesn't exist yet, but a `Link href` to a not-yet-existing route is not a type error in Next.js — it'll simply 404 until Task 6 lands, which is fine mid-plan).

- [ ] **Step 4: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add "app/(protected)/lessons/[lessonId]/edit/page.tsx"
git commit -m "feat: fix emptyLine() for new trim fields, add link to the trimmer page"
```

---

### Task 4: WAV encoder + dialogue-line trim DB update function

**Files:**
- Create: `lib/audio/encodeWav.ts`
- Create: `lib/db/trimDialogueLines.ts`
- Test: `tests/lib/audio/encodeWav.test.ts`
- Test: `tests/lib/db/trimDialogueLines.test.ts`

**Interfaces:**
- Consumes: nothing new (Task 1's migration is a live-DB dependency, not a code dependency for this task).
- Produces: `encodeAudioBufferAsWav(buffer: AudioBufferLike): Blob` (`lib/audio/encodeWav.ts`) and `updateDialogueLineTrims(lines: {id: string; audioUrl: string; startTime: number; endTime: number}[]): Promise<void>` (`lib/db/trimDialogueLines.ts`) — both consumed by Task 5 (the API route) and Task 6 (the trimmer page, for the encoder).

- [ ] **Step 1: Write the failing test for `encodeAudioBufferAsWav`**

Create `tests/lib/audio/encodeWav.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { encodeAudioBufferAsWav, type AudioBufferLike } from '@/lib/audio/encodeWav'

function fakeBuffer(channelData: Float32Array[], sampleRate: number): AudioBufferLike {
  return {
    sampleRate,
    numberOfChannels: channelData.length,
    length: channelData[0].length,
    getChannelData: (channel: number) => channelData[channel],
  }
}

describe('encodeAudioBufferAsWav', () => {
  it('produces a Blob with the correct MIME type', () => {
    const buffer = fakeBuffer([new Float32Array([0, 0.5, -0.5, 1, -1])], 44100)
    const blob = encodeAudioBufferAsWav(buffer)
    expect(blob.type).toBe('audio/wav')
  })

  it('produces a file with a valid RIFF/WAVE header and correct byte length', async () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1])
    const buffer = fakeBuffer([samples], 44100)
    const blob = encodeAudioBufferAsWav(buffer)
    const bytes = new Uint8Array(await blob.arrayBuffer())

    // "RIFF" magic
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
    // "WAVE" format
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE')
    // "fmt " subchunk id
    expect(String.fromCharCode(...bytes.slice(12, 16))).toBe('fmt ')
    // "data" subchunk id
    expect(String.fromCharCode(...bytes.slice(36, 40))).toBe('data')

    // 44-byte header + 5 samples * 2 bytes (16-bit PCM) * 1 channel
    expect(bytes.length).toBe(44 + 5 * 2)
  })

  it('clamps sample values to the valid 16-bit PCM range instead of overflowing', async () => {
    // 1.5 and -1.5 are out of the valid [-1, 1] float range a real
    // AudioBuffer would never produce, but the encoder must not wrap/corrupt
    // adjacent bytes if it ever receives one - clamp instead of trusting input.
    const buffer = fakeBuffer([new Float32Array([1.5, -1.5])], 44100)
    const blob = encodeAudioBufferAsWav(buffer)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer)

    const firstSample = view.getInt16(44, true)
    const secondSample = view.getInt16(46, true)
    expect(firstSample).toBe(32767)
    expect(secondSample).toBe(-32768)
  })

  it('interleaves multiple channels correctly', async () => {
    const left = new Float32Array([1, 0])
    const right = new Float32Array([-1, 0])
    const buffer = fakeBuffer([left, right], 44100)
    const blob = encodeAudioBufferAsWav(buffer)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer)

    // interleaved order: L0, R0, L1, R1
    expect(view.getInt16(44, true)).toBe(32767) // L0 = 1
    expect(view.getInt16(46, true)).toBe(-32768) // R0 = -1
    expect(view.getInt16(48, true)).toBe(0) // L1 = 0
    expect(view.getInt16(50, true)).toBe(0) // R1 = 0
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/audio/encodeWav.test.ts`
Expected: FAIL — `Cannot find module '@/lib/audio/encodeWav'`.

- [ ] **Step 3: Write `lib/audio/encodeWav.ts`**

```typescript
// A minimal subset of AudioBuffer's shape - lets encodeAudioBufferAsWav be
// unit-tested with a plain object instead of a real browser AudioBuffer
// (which doesn't exist in Vitest's jsdom environment).
export interface AudioBufferLike {
  sampleRate: number
  numberOfChannels: number
  length: number
  getChannelData(channel: number): Float32Array
}

// Encodes a decoded/cut audio buffer as a 16-bit PCM WAV file. No external
// dependency (see the plan's Global Constraints for why WAV over mp3) - a
// WAV file is just a 44-byte RIFF/WAVE header followed by raw interleaved
// PCM samples, simple enough to build by hand.
export function encodeAudioBufferAsWav(buffer: AudioBufferLike): Blob {
  const { sampleRate, numberOfChannels, length } = buffer
  const bytesPerSample = 2 // 16-bit
  const blockAlign = numberOfChannels * bytesPerSample
  const dataSize = length * blockAlign
  const headerSize = 44
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(arrayBuffer)

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numberOfChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true) // bits per sample
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  const channelData: Float32Array[] = []
  for (let ch = 0; ch < numberOfChannels; ch++) channelData.push(buffer.getChannelData(ch))

  let offset = headerSize
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const clamped = Math.max(-1, Math.min(1, channelData[ch][i]))
      const intSample = clamped < 0 ? clamped * 32768 : clamped * 32767
      view.setInt16(offset, Math.round(intSample), true)
      offset += bytesPerSample
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/audio/encodeWav.test.ts`
Expected: PASS, all 4 cases.

- [ ] **Step 5: Write the failing test for `updateDialogueLineTrims`**

Create `tests/lib/db/trimDialogueLines.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateMock = vi.fn()
const eqMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table === 'dialogue_lines') {
        return {
          update: (row: any) => {
            updateMock(row)
            return { eq: (col: string, id: string) => { eqMock(col, id); return Promise.resolve({ error: null }) } }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { updateDialogueLineTrims } from '@/lib/db/trimDialogueLines'

describe('updateDialogueLineTrims', () => {
  beforeEach(() => {
    updateMock.mockClear()
    eqMock.mockClear()
  })

  it('updates audio_url/start_time/end_time for each line, and nothing else', async () => {
    await updateDialogueLineTrims([
      { id: 'line-1', audioUrl: 'https://x/a.wav', startTime: 1.5, endTime: 3.2 },
      { id: 'line-2', audioUrl: 'https://x/b.wav', startTime: 4, endTime: 5.8 },
    ])

    expect(updateMock).toHaveBeenCalledTimes(2)
    expect(updateMock).toHaveBeenNthCalledWith(1, {
      audio_url: 'https://x/a.wav',
      start_time: 1.5,
      end_time: 3.2,
    })
    expect(eqMock).toHaveBeenNthCalledWith(1, 'id', 'line-1')
    expect(updateMock).toHaveBeenNthCalledWith(2, {
      audio_url: 'https://x/b.wav',
      start_time: 4,
      end_time: 5.8,
    })
    expect(eqMock).toHaveBeenNthCalledWith(2, 'id', 'line-2')
  })

  it('does nothing when given an empty list', async () => {
    await updateDialogueLineTrims([])
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('throws when the DB update fails, instead of silently succeeding', async () => {
    updateMock.mockImplementationOnce(() => {})
    eqMock.mockImplementationOnce(() => {})
    const { createServerSupabase } = await import('@/lib/supabase/server')
    // Re-mock this one call to return an error - simplest is to swap the
    // whole module mock's behavior via a local override:
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabase: () => ({
        from: () => ({
          update: () => ({ eq: () => Promise.resolve({ error: { message: 'connection reset' } }) }),
        }),
      }),
    }))
    vi.resetModules()
    const { updateDialogueLineTrims: freshFn } = await import('@/lib/db/trimDialogueLines')
    await expect(
      freshFn([{ id: 'line-1', audioUrl: 'https://x/a.wav', startTime: 0, endTime: 1 }])
    ).rejects.toThrow('connection reset')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/db/trimDialogueLines.test.ts`
Expected: FAIL — `Cannot find module '@/lib/db/trimDialogueLines'`.

- [ ] **Step 7: Write `lib/db/trimDialogueLines.ts`**

```typescript
import { createServerSupabase } from '@/lib/supabase/server'

export interface DialogueLineTrim {
  id: string
  audioUrl: string
  startTime: number
  endTime: number
}

// Updates ONLY audio_url/start_time/end_time for each given dialogue_lines
// row. Deliberately separate from lib/db/updateLessonFull.ts's
// syncDialogueLines - that function's payload schema (LessonFullUpdate)
// carries text_zh/speaker_zh/etc and has no notion of these trim fields, so
// routing trims through it would risk either silently dropping trim data or
// requiring every future edit-page save to also carry trim state around.
// This function is the only place that ever writes these three columns.
export async function updateDialogueLineTrims(lines: DialogueLineTrim[]): Promise<void> {
  const supabase = createServerSupabase()

  for (const line of lines) {
    const { error } = await supabase
      .from('dialogue_lines')
      .update({ audio_url: line.audioUrl, start_time: line.startTime, end_time: line.endTime })
      .eq('id', line.id)
    if (error) throw new Error(error.message)
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/lib/db/trimDialogueLines.test.ts`
Expected: PASS, all 3 cases.

- [ ] **Step 9: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint lib/audio/encodeWav.ts lib/db/trimDialogueLines.ts tests/lib/audio/encodeWav.test.ts tests/lib/db/trimDialogueLines.test.ts`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add lib/audio/encodeWav.ts lib/db/trimDialogueLines.ts tests/lib/audio/encodeWav.test.ts tests/lib/db/trimDialogueLines.test.ts
git commit -m "feat: add WAV encoder and dialogue-line trim DB update function"
```

---

### Task 5: API route — `PATCH /api/lessons/[lessonId]/dialogues/[dialogueId]/trim`

**Files:**
- Create: `app/api/lessons/[lessonId]/dialogues/[dialogueId]/trim/route.ts`
- Test: `tests/api/dialogue-lines-trim.test.ts`

**Interfaces:**
- Consumes: `updateDialogueLineTrims(lines: DialogueLineTrim[]): Promise<void>` (`lib/db/trimDialogueLines.ts`, Task 4); `requireLessonDraft(lessonId: string): Promise<void>` and `LessonNotEditableError` (`lib/db/updateLessonFull.ts`, existing, unchanged); `requireAdmin(request: Request)` (`lib/supabase/requireAdmin.ts`, existing, unchanged).
- Produces: `PATCH /api/lessons/[lessonId]/dialogues/[dialogueId]/trim` — consumed by Task 6 (the trimmer page's confirm handler).

- [ ] **Step 1: Write the failing test**

Create `tests/api/dialogue-lines-trim.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/requireAdmin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ authorized: true }),
}))

const requireLessonDraftMock = vi.fn()
const updateDialogueLineTrimsMock = vi.fn()

vi.mock('@/lib/db/updateLessonFull', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/updateLessonFull')>('@/lib/db/updateLessonFull')
  return { ...actual, requireLessonDraft: requireLessonDraftMock }
})

vi.mock('@/lib/db/trimDialogueLines', () => ({
  updateDialogueLineTrims: updateDialogueLineTrimsMock,
}))

import { PATCH } from '@/app/api/lessons/[lessonId]/dialogues/[dialogueId]/trim/route'
import { LessonNotEditableError } from '@/lib/db/updateLessonFull'

function makeRequest(body: unknown) {
  return new Request('http://localhost', { method: 'PATCH', body: JSON.stringify(body) }) as any
}

const params = Promise.resolve({ lessonId: 'lesson-1', dialogueId: 'dlg-1' })

describe('PATCH /api/lessons/[lessonId]/dialogues/[dialogueId]/trim', () => {
  beforeEach(() => {
    requireLessonDraftMock.mockReset()
    requireLessonDraftMock.mockResolvedValue(undefined)
    updateDialogueLineTrimsMock.mockReset()
    updateDialogueLineTrimsMock.mockResolvedValue(undefined)
  })

  it('requires the lesson to be a draft, then updates the given lines', async () => {
    const body = {
      lines: [{ id: 'line-1', audioUrl: 'https://x/a.wav', startTime: 1, endTime: 2 }],
    }
    const res = await PATCH(makeRequest(body), { params })
    expect(res.status).toBe(200)
    expect(requireLessonDraftMock).toHaveBeenCalledWith('lesson-1')
    expect(updateDialogueLineTrimsMock).toHaveBeenCalledWith(body.lines)
  })

  it('returns 400 when lines is missing or not an array', async () => {
    const res = await PATCH(makeRequest({}), { params })
    expect(res.status).toBe(400)
    expect(updateDialogueLineTrimsMock).not.toHaveBeenCalled()
  })

  it('returns 400 with the Vietnamese message when the lesson is not a draft', async () => {
    requireLessonDraftMock.mockRejectedValue(new LessonNotEditableError('Bài học phải ở trạng thái Nháp mới được sửa. Hãy "Chuyển về nháp" trước.'))
    const res = await PATCH(makeRequest({ lines: [] }), { params })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Nháp')
  })

  it('returns 500 on an unexpected error from the update function', async () => {
    updateDialogueLineTrimsMock.mockRejectedValue(new Error('connection reset'))
    const res = await PATCH(makeRequest({ lines: [{ id: 'line-1', audioUrl: 'x', startTime: 0, endTime: 1 }] }), { params })
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/api/dialogue-lines-trim.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/lessons/[lessonId]/dialogues/[dialogueId]/trim/route'`.

- [ ] **Step 3: Write the route**

Create `app/api/lessons/[lessonId]/dialogues/[dialogueId]/trim/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { requireLessonDraft, LessonNotEditableError } from '@/lib/db/updateLessonFull'
import { updateDialogueLineTrims, type DialogueLineTrim } from '@/lib/db/trimDialogueLines'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ lessonId: string; dialogueId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params
  const body = await request.json().catch(() => ({}))
  const lines = body.lines as DialogueLineTrim[] | undefined

  if (!Array.isArray(lines)) {
    return NextResponse.json({ error: 'lines must be an array' }, { status: 400 })
  }

  try {
    await requireLessonDraft(lessonId)
    await updateDialogueLineTrims(lines)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof LessonNotEditableError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'unknown error saving trimmed audio'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/api/dialogue-lines-trim.test.ts`
Expected: PASS, all 4 cases.

- [ ] **Step 5: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint "app/api/lessons/[lessonId]/dialogues/[dialogueId]/trim/route.ts" tests/api/dialogue-lines-trim.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add "app/api/lessons/[lessonId]/dialogues/[dialogueId]/trim/route.ts" tests/api/dialogue-lines-trim.test.ts
git commit -m "feat: add PATCH route to save trimmed dialogue-line audio"
```

---

### Task 6: The trimmer page (waveform UI + client-side cutting)

**Files:**
- Create: `app/(protected)/lessons/[lessonId]/edit/dialogues/[dialogueId]/trim/page.tsx`
- Modify: `package.json` (add `wavesurfer.js`)

**Interfaces:**
- Consumes: `encodeAudioBufferAsWav(buffer: AudioBufferLike): Blob` (`lib/audio/encodeWav.ts`, Task 4); `PATCH /api/lessons/[lessonId]/dialogues/[dialogueId]/trim` (Task 5); `GET /api/lessons/[lessonId]` (existing, unchanged — reused here to load the lesson and find the one dialogue by id, since there's no single-dialogue GET endpoint and adding one is unnecessary for a page that already needs the full lesson to know `lessonId`/`isEditable` context).
- Produces: the page itself — this is the last task in the plan besides final verification.

- [ ] **Step 1: Install `wavesurfer.js`**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npm install wavesurfer.js`

Confirm `package.json`'s `dependencies` gained a `wavesurfer.js` entry and `package-lock.json` updated.

- [ ] **Step 2: Read `wavesurfer.js`'s Regions plugin API before writing the page**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && node -e "console.log(require.resolve('wavesurfer.js/dist/plugins/regions.js'))"` to confirm the plugin's import path exists in the installed version, then check `node_modules/wavesurfer.js/dist/types.d.ts` (or the package's published TypeScript types) for `RegionsPlugin`'s exact exported API (`addRegion`, the `region-updated`/`region-created` event names, `Region.start`/`Region.end`) — the exact method/event names matter and must be read from the installed package's own types rather than assumed, since plugin APIs vary across major versions.

- [ ] **Step 3: Write the trimmer page**

Create `app/(protected)/lessons/[lessonId]/edit/dialogues/[dialogueId]/trim/page.tsx`. This is a Client Component. Structure:

```tsx
"use client"

import { use, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import WaveSurfer from "wavesurfer.js"
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js"
import { Button } from "@/components/ui/button"
import { BackLink } from "@/components/back-link"
import { encodeAudioBufferAsWav } from "@/lib/audio/encodeWav"
import type { LessonFullView } from "@/lib/db/getLessonFull"

interface Props {
  params: Promise<{ lessonId: string; dialogueId: string }>
}

type DialogueLineView = LessonFullView["dialogues"][number]["lines"][number]

interface LineRegion {
  lineId: string
  start: number
  end: number
}

export default function TrimDialogueAudioPage({ params }: Props) {
  const { lessonId, dialogueId } = use(params)
  const router = useRouter()

  const [lesson, setLesson] = useState<LessonFullView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [regionsByLine, setRegionsByLine] = useState<Record<string, LineRegion>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsPluginRef = useRef<RegionsPlugin | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/lessons/${lessonId}`)
        if (!res.ok) throw new Error("Không tải được bài học.")
        const json: LessonFullView = await res.json()
        setLesson(json)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Không tải được bài học.")
      }
    }
    load()
  }, [lessonId])

  const dialogue = lesson?.dialogues.find((d) => d.id === dialogueId) ?? null

  useEffect(() => {
    if (!dialogue?.audioUrl || !containerRef.current) return

    const regionsPlugin = RegionsPlugin.create()
    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#9ca3af",
      progressColor: "#1e3a5f",
      url: dialogue.audioUrl,
      plugins: [regionsPlugin],
    })
    wavesurferRef.current = wavesurfer
    regionsPluginRef.current = regionsPlugin

    wavesurfer.on("decode", () => {
      // Restore previously-saved regions once the audio is decoded and its
      // duration is known - dialogue.lines is captured from the outer
      // closure at effect-setup time, which is fine since this effect only
      // depends on dialogueId/dialogue.audioUrl (re-running the whole
      // waveform load if a line's saved trim times changed some other way
      // isn't a case that happens within a single page visit).
      for (const line of dialogue.lines) {
        if (line.startTime !== null && line.endTime !== null) {
          regionsPlugin.addRegion({
            id: line.id,
            start: line.startTime,
            end: line.endTime,
            color: "rgba(30, 58, 95, 0.15)",
          })
        }
      }
    })

    regionsPlugin.on("region-updated", (region) => {
      setRegionsByLine((prev) => ({
        ...prev,
        [region.id]: { lineId: region.id, start: region.start, end: region.end },
      }))
    })

    return () => {
      wavesurfer.destroy()
      wavesurferRef.current = null
      regionsPluginRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogue?.audioUrl, dialogueId])

  function handleSelectLine(line: DialogueLineView) {
    setSelectedLineId(line.id)
    const regionsPlugin = regionsPluginRef.current
    const wavesurfer = wavesurferRef.current
    if (!regionsPlugin || !wavesurfer) return

    const existing = regionsPlugin.getRegions().find((r) => r.id === line.id)
    if (existing) {
      existing.play()
      return
    }

    // No region yet for this line: create a short default region at the
    // current playhead position so the admin has something to drag from,
    // rather than an empty timeline with no starting point.
    const duration = wavesurfer.getDuration()
    const start = wavesurfer.getCurrentTime()
    const end = Math.min(duration, start + 2)
    regionsPlugin.addRegion({ id: line.id, start, end, color: "rgba(30, 58, 95, 0.15)" })
    setRegionsByLine((prev) => ({ ...prev, [line.id]: { lineId: line.id, start, end } }))
  }

  function handlePreview(lineId: string) {
    const regionsPlugin = regionsPluginRef.current
    if (!regionsPlugin) return
    const region = regionsPlugin.getRegions().find((r) => r.id === lineId)
    region?.play()
  }

  async function handleConfirm() {
    if (!dialogue?.audioUrl) return
    const entries = Object.values(regionsByLine)
    if (entries.length === 0) return

    setIsSaving(true)
    setSaveError(null)
    try {
      const response = await fetch(dialogue.audioUrl)
      const arrayBuffer = await response.arrayBuffer()
      const audioContext = new AudioContext()
      const fullBuffer = await audioContext.decodeAudioData(arrayBuffer)

      const linesPayload = []
      for (const region of entries) {
        const sampleRate = fullBuffer.sampleRate
        const startSample = Math.floor(region.start * sampleRate)
        const endSample = Math.floor(region.end * sampleRate)
        const frameCount = endSample - startSample
        if (frameCount <= 0) continue

        const offlineContext = new OfflineAudioContext(fullBuffer.numberOfChannels, frameCount, sampleRate)
        const source = offlineContext.createBufferSource()
        source.buffer = fullBuffer
        source.connect(offlineContext.destination)
        source.start(0, region.start, region.end - region.start)
        const renderedBuffer = await offlineContext.startRendering()

        const wavBlob = encodeAudioBufferAsWav(renderedBuffer)
        const path = `dialogue-lines/${region.lineId}.wav`
        const uploadForm = new FormData()
        uploadForm.append("file", wavBlob, `${region.lineId}.wav`)
        uploadForm.append("path", path)

        const uploadRes = await fetch(`/api/lessons/${lessonId}/dialogues/${dialogueId}/trim/upload`, {
          method: "POST",
          body: uploadForm,
        })
        if (!uploadRes.ok) throw new Error("Tải lên audio đã cắt thất bại.")
        const { publicUrl } = (await uploadRes.json()) as { publicUrl: string }

        linesPayload.push({ id: region.lineId, audioUrl: publicUrl, startTime: region.start, endTime: region.end })
      }

      const patchRes = await fetch(`/api/lessons/${lessonId}/dialogues/${dialogueId}/trim`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: linesPayload }),
      })
      if (!patchRes.ok) {
        const body = await patchRes.json().catch(() => ({}))
        throw new Error(body.error ?? "Lưu audio đã cắt thất bại.")
      }

      router.push(`/lessons/${lessonId}/edit`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Cắt/lưu audio thất bại.")
    } finally {
      setIsSaving(false)
    }
  }

  if (loadError) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p role="alert" className="text-sm text-destructive">{loadError}</p>
      </main>
    )
  }

  if (!lesson || !dialogue) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </main>
    )
  }

  return (
    <>
      <div className="w-full px-4 pt-6 sm:px-6">
        <BackLink href={`/lessons/${lessonId}/edit`} label="Quay lại bài học" />
      </div>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 pb-16">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Cắt audio hội thoại</h1>

        {saveError && <p className="text-sm text-destructive">{saveError}</p>}

        <div ref={containerRef} className="rounded-lg border bg-card p-4" />

        <div className="flex flex-col gap-2">
          {dialogue.lines.map((line) => (
            <div
              key={line.id}
              className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                selectedLineId === line.id ? "border-primary" : ""
              }`}
            >
              <button type="button" className="field-zh flex-1 text-left" onClick={() => handleSelectLine(line)}>
                {line.textZh}
              </button>
              <Button type="button" variant="ghost" size="sm" onClick={() => handlePreview(line.id)}>
                Nghe thử
              </Button>
            </div>
          ))}
        </div>

        <Button type="button" onClick={handleConfirm} disabled={isSaving}>
          {isSaving ? "Đang xử lý..." : "Xác nhận"}
        </Button>
      </main>
    </>
  )
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint "app/(protected)/lessons/[lessonId]/edit/dialogues/[dialogueId]/trim/page.tsx"`
Expected: no errors. If `wavesurfer.js`'s bundled types don't match the exact method names used above (`getRegions`, `region-updated`, `RegionsPlugin.create`), fix the calls to match what Step 2's type inspection found — the code above is based on the plugin's documented public API as of the version being installed in Step 1, but the plan cannot pin an exact version's type signatures without having run `npm install` first.

- [ ] **Step 5: Manual browser verification (report to user, cannot be automated)**

No test framework in this project can render a real waveform or run actual Web Audio API decoding - this step is manual only:

1. Run `npm run dev`. Open a lesson with a dialogue that has `audioUrl` set (needs a book with dialogue audio already bulk-uploaded via the existing `/books/[bookId]/audio` page - use an existing one, or upload a test mp3 there first).
2. From the lesson edit page's Bài khoá tab, click "Cắt audio hội thoại" on that dialogue.
3. Confirm the waveform renders.
4. Click a line in the list, confirm a default region appears; drag its edges to adjust.
5. Click "Nghe thử" on that line, confirm only the marked region plays.
6. Repeat for at least 2 more lines.
7. Click "Xác nhận". Confirm no errors, confirm redirect back to the edit page.
8. Reload the edit page's Bài khoá tab, confirm the dialogue's lines now show `<audio>` players with the newly cut clips (this requires the DialogueLineBlock component to render `audioUrl` when present if it doesn't already - check `components/dialogue-line-block.tsx` for whether it already renders a line's `audioUrl`; if not, note this as a followup, since this plan's scope is the trimmer page itself, not necessarily surfacing the result elsewhere).
9. Go back into the trimmer page for the same dialogue, confirm the previously-marked regions are restored at the correct positions (validates `startTime`/`endTime` round-trip).

- [ ] **Step 6: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add package.json package-lock.json "app/(protected)/lessons/[lessonId]/edit/dialogues/[dialogueId]/trim/page.tsx"
git commit -m "feat: add the waveform trimmer page (wavesurfer.js + client-side cutting)"
```

---

### Task 7: Upload route for cut clips

**Files:**
- Create: `app/api/lessons/[lessonId]/dialogues/[dialogueId]/trim/upload/route.ts`
- Test: `tests/api/dialogue-lines-trim-upload.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (existing), `requireLessonDraft` (existing, `lib/db/updateLessonFull.ts`).
- Produces: `POST /api/lessons/[lessonId]/dialogues/[dialogueId]/trim/upload` (multipart form: `file`, `path`) → `{publicUrl: string}` — consumed by Task 6's `handleConfirm` (already written to call this route; this task is what makes that call actually work, since a Client Component cannot use the Supabase service-role key directly to upload cut clips to Storage).

**Note on task ordering:** this task is placed after Task 6 in this plan's numbering because Task 6's `handleConfirm` was easiest to write in one pass referencing this route by its final path, but there is no execution-order dependency preventing this task from being done before Task 6 - an implementer/reviewer encountering this plan should not be surprised that Task 6's code references a route this task creates.

- [ ] **Step 1: Write the failing test**

Create `tests/api/dialogue-lines-trim-upload.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/requireAdmin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ authorized: true }),
}))

const requireLessonDraftMock = vi.fn()
vi.mock('@/lib/db/updateLessonFull', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/updateLessonFull')>('@/lib/db/updateLessonFull')
  return { ...actual, requireLessonDraft: requireLessonDraftMock }
})

const uploadMock = vi.fn()
const getPublicUrlMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
  }),
}))

import { POST } from '@/app/api/lessons/[lessonId]/dialogues/[dialogueId]/trim/upload/route'

const params = Promise.resolve({ lessonId: 'lesson-1', dialogueId: 'dlg-1' })

describe('POST /api/lessons/[lessonId]/dialogues/[dialogueId]/trim/upload', () => {
  beforeEach(() => {
    requireLessonDraftMock.mockReset()
    requireLessonDraftMock.mockResolvedValue(undefined)
    uploadMock.mockReset()
    uploadMock.mockResolvedValue({ error: null })
    getPublicUrlMock.mockReset()
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://x/dialogue-lines/line-1.wav' } })
  })

  function makeFormDataRequest(path: string) {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }), 'line-1.wav')
    form.append('path', path)
    return new Request('http://localhost', { method: 'POST', body: form }) as any
  }

  it('uploads the file to Storage and returns its public URL', async () => {
    const res = await POST(makeFormDataRequest('dialogue-lines/line-1.wav'), { params })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.publicUrl).toBe('https://x/dialogue-lines/line-1.wav')
    expect(uploadMock).toHaveBeenCalledWith(
      'dialogue-lines/line-1.wav',
      expect.anything(),
      expect.objectContaining({ contentType: 'audio/wav', upsert: true })
    )
  })

  it('returns 400 when file or path is missing', async () => {
    const form = new FormData()
    const res = await POST(new Request('http://localhost', { method: 'POST', body: form }) as any, { params })
    expect(res.status).toBe(400)
  })

  it('returns 500 when the Storage upload fails', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'storage quota exceeded' } })
    const res = await POST(makeFormDataRequest('dialogue-lines/line-1.wav'), { params })
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/api/dialogue-lines-trim-upload.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the route**

Create `app/api/lessons/[lessonId]/dialogues/[dialogueId]/trim/upload/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/requireAdmin'
import { requireLessonDraft, LessonNotEditableError } from '@/lib/db/updateLessonFull'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string; dialogueId: string }> }
) {
  const authorized = await requireAdmin(request)
  if (!authorized.authorized) return authorized.response

  const { lessonId } = await params
  const form = await request.formData()
  const file = form.get('file') as File | null
  const path = form.get('path') as string | null

  if (!file || !path) {
    return NextResponse.json({ error: 'file and path are required' }, { status: 400 })
  }

  try {
    await requireLessonDraft(lessonId)

    const supabase = createServerSupabase()
    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(path, await file.arrayBuffer(), { contentType: 'audio/wav', upsert: true })
    if (uploadError) throw new Error(uploadError.message)

    const { data } = supabase.storage.from('audio').getPublicUrl(path)
    return NextResponse.json({ publicUrl: data.publicUrl })
  } catch (err) {
    if (err instanceof LessonNotEditableError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'unknown error uploading trimmed audio'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run tests/api/dialogue-lines-trim-upload.test.ts`
Expected: PASS, all 3 cases.

- [ ] **Step 5: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint "app/api/lessons/[lessonId]/dialogues/[dialogueId]/trim/upload/route.ts" tests/api/dialogue-lines-trim-upload.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add "app/api/lessons/[lessonId]/dialogues/[dialogueId]/trim/upload/route.ts" tests/api/dialogue-lines-trim-upload.test.ts
git commit -m "feat: add upload route for trimmed dialogue-line audio clips"
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
Expected: build succeeds. Confirm the route list includes `/lessons/[lessonId]/edit/dialogues/[dialogueId]/trim`, `/api/lessons/[lessonId]/dialogues/[dialogueId]/trim`, and `/api/lessons/[lessonId]/dialogues/[dialogueId]/trim/upload`.

- [ ] **Step 5: Remind the user**

Tell the user: this plan requires running migration `0020_dialogue_line_trim_times.sql` on the live Supabase project via the SQL Editor before the feature works end-to-end (standing caveat for every migration in this repo). Also remind them that Task 6 Step 5's manual browser verification (waveform rendering, drag-to-trim, actual audio cutting) has not been run automatically and should be done before considering this feature done.

---

## Self-Review Notes (completed during plan authoring)

- **Spec coverage:** Section 2 (page location, opened from Bài khoá tab) → Task 3. Section 3 (mark all lines, single confirm) → Task 6. Section 3 point 3 (text list, click-to-focus) → Task 6. Section 3 point 4 (restore previous region) → Task 2 (data) + Task 6 (restore-on-decode logic). Section 3 point 5 (preview) → Task 6's `handlePreview`. Section 4 (client-side cutting via Web Audio API, no FFmpeg) → Task 4 (encoder) + Task 6 (decode/cut/render pipeline). Section 5 (start_time/end_time columns) → Task 1 + Task 2. Section 6 (dialogues.audio_url/bulk-upload unchanged) → correctly untouched by every task.
- **Placeholder scan:** no TBD/TODO; every step has runnable code. Task 6 Step 2 (reading the installed wavesurfer.js package's exact type signatures) is the one spot without a literal diff, because the exact plugin API can't be pinned without having run `npm install` first — but the instruction is concrete (read the installed package's own `.d.ts`) and Step 4's fallback instruction tells the implementer exactly what to do if the assumed API doesn't match.
- **Type consistency:** `DialogueLineTrim` (Task 4, `lib/db/trimDialogueLines.ts`) is the one shape used consistently across Task 5's route body parsing, Task 6's `linesPayload` construction, and Task 7's design note — same field names (`id`/`audioUrl`/`startTime`/`endTime`) throughout, matching the camelCase-in-TS/snake_case-in-DB convention already used everywhere else in this codebase (`lib/db/getLessonFull.ts`'s mapping functions). `updateDialogueLineTrims` (Task 4) is the single function both Task 5's route and no other task calls directly — confirmed no duplicate/conflicting function name introduced elsewhere.
