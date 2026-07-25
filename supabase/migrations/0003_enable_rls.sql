-- Final-review CRITICAL fix: RLS was never enabled on any table. The browser
-- ships NEXT_PUBLIC_SUPABASE_ANON_KEY (used for login), and with RLS off,
-- PostgREST's default grants let the `anon` role read/write every table
-- directly, completely bypassing the Next.js app and its service-role-gated
-- API routes.
--
-- The admin app itself always talks to Supabase via SUPABASE_SERVICE_ROLE_KEY
-- (see lib/supabase/server.ts), which bypasses RLS entirely, so none of this
-- affects any admin-facing functionality. This only restricts what the
-- public `anon` key (used solely for admin login) can see.
--
-- `books` and `extraction_jobs` are admin-only content (source PDFs, raw
-- Gemini extraction output, in-progress edits) and intentionally get no
-- policy at all for `anon` — with RLS enabled and no policy, all access is
-- denied by default.
--
-- NOTE: this migration has not been applied to the live Supabase project —
-- there is no DB CLI access available in this environment (same caveat as
-- 0001_init.sql and 0002_client_side_slicing.sql). It must be run manually
-- (`supabase db push` or the SQL editor) before merge.

alter table books enable row level security;
alter table lessons enable row level security;
alter table dialogues enable row level security;
alter table dialogue_lines enable row level security;
alter table vocabulary enable row level security;
alter table grammar_points enable row level security;
alter table grammar_examples enable row level security;
alter table extraction_jobs enable row level security;

-- lessons: anon may only read published lessons.
create policy "anon can read published lessons"
  on lessons for select
  to anon
  using (status = 'published');

-- dialogues: anon may only read dialogues belonging to a published lesson.
create policy "anon can read dialogues of published lessons"
  on dialogues for select
  to anon
  using (
    exists (
      select 1 from lessons
      where lessons.id = dialogues.lesson_id
        and lessons.status = 'published'
    )
  );

-- dialogue_lines: anon may only read lines whose parent dialogue belongs to
-- a published lesson.
create policy "anon can read dialogue lines of published lessons"
  on dialogue_lines for select
  to anon
  using (
    exists (
      select 1 from dialogues
      join lessons on lessons.id = dialogues.lesson_id
      where dialogues.id = dialogue_lines.dialogue_id
        and lessons.status = 'published'
    )
  );

-- vocabulary: anon may only read vocabulary belonging to a published lesson.
create policy "anon can read vocabulary of published lessons"
  on vocabulary for select
  to anon
  using (
    exists (
      select 1 from lessons
      where lessons.id = vocabulary.lesson_id
        and lessons.status = 'published'
    )
  );

-- grammar_points: anon may only read grammar points belonging to a
-- published lesson.
create policy "anon can read grammar points of published lessons"
  on grammar_points for select
  to anon
  using (
    exists (
      select 1 from lessons
      where lessons.id = grammar_points.lesson_id
        and lessons.status = 'published'
    )
  );

-- grammar_examples: anon may only read examples whose parent grammar point
-- belongs to a published lesson.
create policy "anon can read grammar examples of published lessons"
  on grammar_examples for select
  to anon
  using (
    exists (
      select 1 from grammar_points
      join lessons on lessons.id = grammar_points.lesson_id
      where grammar_points.id = grammar_examples.grammar_point_id
        and lessons.status = 'published'
    )
  );

-- books and extraction_jobs intentionally have no policies for anon:
-- RLS is enabled with zero grants, so all access is denied by default.
-- The admin app's service-role key bypasses RLS and is unaffected.
