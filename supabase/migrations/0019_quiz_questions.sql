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

alter table quiz_questions enable row level security;

-- quiz_questions: anon may only read quiz questions belonging to a published
-- lesson (same pattern as vocabulary/grammar_points in 0003_enable_rls.sql).
create policy "anon can read quiz questions of published lessons"
  on quiz_questions for select
  to anon
  using (
    exists (
      select 1 from lessons
      where lessons.id = quiz_questions.lesson_id
        and lessons.status = 'published'
    )
  );
