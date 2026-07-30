# Merge Lesson View/Edit Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the read-only lesson view page (`/lessons/[lessonId]`) and the lesson edit page (`/lessons/[lessonId]/edit`) into a single page at `/edit`, since the edit page already has a complete `isEditable`-gated read/write mode for every tab and the separate view page is now redundant and out of sync (missing Từ vựng/Audio/Quiz).

**Architecture:** Relocate `LessonStatusControls` (the draft↔reviewed↔published state-machine buttons) from the old view page into the edit page's existing sticky header, alongside the "Lưu" button. Replace the old view page's file contents with a redirect stub to `/edit`. Update the one other place that links to the old view page (the Book's lesson-list cards) to point at `/edit` directly.

**Tech Stack:** Next.js 16 App Router, TypeScript, React Client Components.

## Global Constraints

- Every modified file must pass `npx tsc --noEmit -p tsconfig.json` and `npx eslint <files>` — this codebase has no component-level UI tests for these particular pages (consistent with the sibling pages touched in the prior lesson-scoped-audio-quiz refactor), so verification here is tsc/eslint plus a manual smoke-test checklist, not new automated tests, except where noted.
- All UI-facing strings are Vietnamese, matching the rest of the admin app.
- No new migration, no new API route, no schema change — this is a UI/routing-only change.
- `LessonStatusControls` (`app/(protected)/lessons/[lessonId]/status-controls.tsx`) keeps its current internal logic unchanged (both `reviewed→draft` and `published→draft` stay possible) — it is relocated by import, not rewritten.

---

## File Structure

- **`app/(protected)/lessons/[lessonId]/page.tsx`** (rewrite) — becomes a thin Server Component that redirects to `/lessons/[lessonId]/edit`. All the current accordion/table rendering (`VocabTable`, `ExampleBlock`, `SectionBlock`, `LessonDetailPage`) is deleted; nothing else in the codebase imports these functions.
- **`app/(protected)/lessons/[lessonId]/edit/page.tsx`** (modify) — sticky header gains the status badge and transition buttons via `<LessonStatusControls lessonId={data.id} status={data.status} />`; the header's "Quay lại" button target changes from `/lessons/${lessonId}` (now a redirect, would just bounce back) to `/books/${data.bookId}` (skips the redirect entirely, goes straight to the book).
- **`app/(protected)/lessons/[lessonId]/status-controls.tsx`** (no changes) — reused as-is.
- **`app/(protected)/books/[bookId]/book-tabs.tsx`** (modify) — the lesson-list card's `<Link href={...}>` target changes from `/lessons/${lesson.id}` to `/lessons/${lesson.id}/edit`.

---

### Task 1: Relocate `LessonStatusControls` into the edit page's header

**Files:**
- Modify: `app/(protected)/lessons/[lessonId]/edit/page.tsx`

**Interfaces:**
- Consumes: `LessonStatusControls` (`app/(protected)/lessons/[lessonId]/status-controls.tsx`, existing, unchanged) — props `{ lessonId: string; status: LessonStatus }`. `LessonFullView`'s `id`/`status`/`bookId` fields (`lib/db/getLessonFull.ts`, existing, unchanged).
- Produces: the edit page's sticky header now shows a status badge and transition buttons (Đánh dấu đã duyệt / Xuất bản / Chuyển về nháp, depending on current status) alongside the existing "Lưu" button; used by no other task (this plan's only remaining tasks touch different files).

- [ ] **Step 1: Add the import**

In `app/(protected)/lessons/[lessonId]/edit/page.tsx`, add this import alongside the other component imports near the top of the file (after the existing `import { EditableText } from "@/components/editable-text"` line, matching this file's existing import ordering — component imports grouped together):

```tsx
import { LessonStatusControls } from "@/app/(protected)/lessons/[lessonId]/status-controls"
```

- [ ] **Step 2: Insert `LessonStatusControls` into the header, fix "Quay lại"'s target**

In `app/(protected)/lessons/[lessonId]/edit/page.tsx`, change this block (currently at line 1587-1603):

```tsx
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Sửa Bài {data.lessonNo}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          {saveSuccess && <p className="text-sm text-status-success">Đã lưu.</p>}
          <Button variant="outline" nativeButton={false} onClick={() => router.push(`/lessons/${lessonId}`)}>
            Quay lại
          </Button>
          {isEditable && (
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Đang lưu..." : "Lưu"}
            </Button>
          )}
        </div>
      </div>
```

to:

```tsx
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Bài {data.lessonNo}: {data.titleVi || data.titleZh}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          {saveSuccess && <p className="text-sm text-status-success">Đã lưu.</p>}
          <LessonStatusControls lessonId={data.id} status={data.status} />
          <Button variant="outline" nativeButton={false} onClick={() => router.push(`/books/${data.bookId}`)}>
            Quay lại
          </Button>
          {isEditable && (
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Đang lưu..." : "Lưu"}
            </Button>
          )}
        </div>
      </div>
```

Two changes beyond adding `LessonStatusControls`: the `<h1>` now shows the lesson's title (`Bài N: tên`, matching the old view page's header wording) instead of the edit-only "Sửa Bài N" — since this header is now shown at every status, not just while editing, "Sửa" ("Edit") as a permanent label would be misleading when the lesson is read-only. And "Quay lại" now goes straight to `/books/${data.bookId}` instead of `/lessons/${lessonId}` (which after Task 2 is just a redirect back to this same page — sending the button there would work but adds a pointless round-trip).

- [ ] **Step 3: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint "app/(protected)/lessons/[lessonId]/edit/page.tsx"`
Expected: no errors. (`LessonStatus` typing for `data.status` already matches `LessonStatusControls`'s prop type since both derive from the same `lib/db/types.ts` — if tsc reports a mismatch, read `lib/db/types.ts`'s `LessonStatus` export and `getLessonFull.ts`'s `LessonFullView.status` field to confirm they're the same union before assuming a deeper bug.)

- [ ] **Step 4: Manual smoke-test note for the report**

This task has no automated test (matching this project's convention for these page-level files). In the task report, confirm by reading the final file: the header renders `LessonStatusControls` between the save-status messages and the "Quay lại" button, the `<h1>` shows the lesson title, and "Quay lại"'s `onClick` targets `/books/${data.bookId}`.

- [ ] **Step 5: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add "app/(protected)/lessons/[lessonId]/edit/page.tsx"
git commit -m "feat: show lesson status controls in the edit page's header"
```

---

### Task 2: Replace the old view page with a redirect stub

**Files:**
- Modify: `app/(protected)/lessons/[lessonId]/page.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: visiting `/lessons/[lessonId]` now redirects to `/lessons/[lessonId]/edit`; no other task depends on this file's contents.

- [ ] **Step 1: Replace the file's entire contents**

Replace the entire contents of `app/(protected)/lessons/[lessonId]/page.tsx` (currently ~294 lines: `VocabTable`, `ExampleBlock`, `SectionBlock`, and the `LessonDetailPage` component with its accordion-based rendering — none of these are imported anywhere else, confirmed via `grep -rn "VocabTable\|ExampleBlock\|SectionBlock" app lib` returning only this file) with:

```tsx
import { redirect } from "next/navigation"

interface Props {
  params: Promise<{ lessonId: string }>
}

// The dedicated read-only lesson page was merged into the edit page, which
// already renders every tab read-only via its isEditable gate whenever the
// lesson isn't a draft. This redirect keeps old bookmarks/links working.
export default async function LessonPage({ params }: Props) {
  const { lessonId } = await params
  redirect(`/lessons/${lessonId}/edit`)
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint "app/(protected)/lessons/[lessonId]/page.tsx"`
Expected: no errors.

- [ ] **Step 3: Confirm no other file imports the deleted components**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && grep -rn "VocabTable\|ExampleBlock\|SectionBlock" app lib --include="*.tsx" --include="*.ts"`
Expected: zero hits, OR hits only inside `components/grammar-editor.tsx` (which exports its own unrelated `SectionBlock` used by the edit page — confirm by reading the matched line: if the hit is an import of `SectionBlock` FROM `components/grammar-editor.tsx`, that's the edit page's own existing import and is fine; a hit would only be a problem if something still imports these names from the now-rewritten `app/(protected)/lessons/[lessonId]/page.tsx`).

- [ ] **Step 4: Run the full test suite**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run`
Expected: PASS, same count as before this task (this page had no dedicated test file, so no tests are lost).

- [ ] **Step 5: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add "app/(protected)/lessons/[lessonId]/page.tsx"
git commit -m "feat: redirect the old lesson view page to the merged edit page"
```

---

### Task 3: Point the Book's lesson-list cards straight at `/edit`

**Files:**
- Modify: `app/(protected)/books/[bookId]/book-tabs.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing further downstream — this is the last task in the plan.

- [ ] **Step 1: Update the lesson card's link target**

In `app/(protected)/books/[bookId]/book-tabs.tsx`, change (currently at line 160):

```tsx
              <Link key={lesson.id} href={`/lessons/${lesson.id}`}>
```

to:

```tsx
              <Link key={lesson.id} href={`/lessons/${lesson.id}/edit`}>
```

This is the only navigational link to the old view page's URL outside the edit page itself (confirmed via `grep -rn "lessons/\$\{" app --include="*.tsx"` — the only other matches are `/api/lessons/${...}` fetch calls, which are unrelated API endpoints, not page navigation, and the edit page's own "Quay lại" button already fixed in Task 1).

- [ ] **Step 2: Typecheck and lint**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx tsc --noEmit -p tsconfig.json && npx eslint "app/(protected)/books/[bookId]/book-tabs.tsx"`
Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npx vitest run`
Expected: PASS, same count as Task 2.

- [ ] **Step 4: Production build**

Run: `cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction && npm run build`
Expected: build succeeds. Confirm in the route list that `/lessons/[lessonId]` is still present (now serving the redirect) and `/lessons/[lessonId]/edit` is unchanged.

- [ ] **Step 5: Manual smoke test (report to user, do not attempt to automate)**

1. Run `npm run dev`. From a Book's page, click a lesson card — confirm it goes straight to `/lessons/[lessonId]/edit`, not through a visible redirect hop.
2. Manually visit `/lessons/[lessonId]` for an existing lesson (typing the old URL) — confirm it redirects to `/edit` and the page loads correctly (this exercises the Task 2 redirect stub directly, since Task 3's card link now bypasses it).
3. On the edit page, confirm the header shows the lesson title, a status badge, the appropriate transition button(s) for the current status, and (only when `draft`) a "Lưu" button.
4. Click "Quay lại" — confirm it goes to the book's page (`/books/[bookId]`), not back through `/lessons/[lessonId]`.
5. For a `draft` lesson: click "Đánh dấu đã duyệt" — confirm status changes to `reviewed`, the "Lưu" button disappears, and all 5 tabs become read-only (no add/edit/delete/generate controls, matching the gating already built in the prior refactor).
6. For a `reviewed` lesson: confirm both "Xuất bản" and "Chuyển về nháp" are visible; click "Chuyển về nháp" — confirm it returns to `draft` and every tab's editing controls reappear.
7. For a `published` lesson: confirm only "Chuyển về nháp" is visible; click it — confirm it returns to `draft`.

- [ ] **Step 6: Commit**

```bash
cd E:\TaiwaneseEasy\.worktrees\admin-pdf-extraction
git add "app/(protected)/books/[bookId]/book-tabs.tsx"
git commit -m "feat: link lesson cards directly to the edit page"
```

---

## Self-Review Notes (completed during plan authoring)

- **Spec coverage:** Section 2 (header layout: badge + transition buttons + Lưu coexisting) → Task 1. Section 3 (navigation: book-tabs link, removing the "Sửa" button, redirect stub) → Tasks 1 (Quay lại target)/2 (redirect stub)/3 (book-tabs link). Section 4 (deletions: accordion components; keep `status-controls.tsx` unchanged) → Task 2 (deletion), Task 1 (reuse unchanged). Section 5/6 (no migration, no other changes) → correctly no task needed.
- **Placeholder scan:** no TBD/TODO; every step has runnable code or an exact grep command with an expected result.
- **Type consistency:** `LessonStatusControls`'s existing prop names (`lessonId`, `status`) are used exactly as already defined in `status-controls.tsx` (unchanged in this plan) — Task 1 doesn't invent new prop names. `data.bookId`/`data.id`/`data.status`/`data.lessonNo`/`data.titleVi`/`data.titleZh` all come from the existing `LessonFullView` type (`lib/db/getLessonFull.ts`), unchanged, already used elsewhere in this same file (e.g. `data.lessonNo` already appears at the original line 1589, `data.titleZh`/`data.titleVi` already appear later in the file's form fields) — no new fields invented.
