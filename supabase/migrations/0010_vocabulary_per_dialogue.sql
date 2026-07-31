-- The textbook's own structure groups vocabulary per-dialogue (每對話都有自己
-- 的生詞), not one flat list per lesson. Re-parent `vocabulary` from
-- lesson_id to dialogue_id to match. All existing vocabulary rows are
-- dropped per owner request — lessons are being re-extracted anyway to pick
-- up the grammar_sub_points structure from migration 0009.
--
-- NOTE: this migration has not been applied to the live Supabase project —
-- same manual-apply caveat as every prior migration in this project. Must be
-- run via the Supabase SQL Editor before merge.

drop policy if exists "anon can read vocabulary of published lessons" on vocabulary;

delete from vocabulary;

alter table vocabulary drop column lesson_id;
alter table vocabulary add column dialogue_id uuid not null references dialogues(id) on delete cascade;

create policy "anon can read vocabulary of published lessons"
  on vocabulary for select
  to anon
  using (
    exists (
      select 1 from dialogues
      join lessons on lessons.id = dialogues.lesson_id
      where dialogues.id = vocabulary.dialogue_id
        and lessons.status = 'published'
    )
  );
