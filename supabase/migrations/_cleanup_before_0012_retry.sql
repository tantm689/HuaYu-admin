-- Run this once in the Supabase SQL Editor to undo a previous PARTIAL or
-- OLD-SHAPE run of 0012_grammar_sections.sql before re-running the current
-- version of that file. Safe to run even if some of these objects don't
-- exist (IF EXISTS everywhere) or grammar_examples still has its old
-- grammar_point_id/grammar_sub_point_id columns from before 0012 ran.
-- This file is NOT part of the numbered migration sequence - delete it
-- after use.

drop function if exists grammar_section_lesson_id(uuid);
drop table if exists grammar_sections cascade;

alter table grammar_examples drop column if exists grammar_section_id;

-- Restore the columns 0012 would have dropped, in case an old run got that
-- far. Re-create only if missing (a fresh/never-migrated DB won't need this
-- ALTER since the columns are already there from migration 0009).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'grammar_examples' and column_name = 'grammar_point_id'
  ) then
    alter table grammar_examples add column grammar_point_id uuid references grammar_points(id) on delete cascade;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'grammar_examples' and column_name = 'grammar_sub_point_id'
  ) then
    alter table grammar_examples add column grammar_sub_point_id uuid references grammar_sub_points(id) on delete cascade;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'grammar_points' and column_name = 'structure_note'
  ) then
    alter table grammar_points add column structure_note text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'grammar_sub_points' and column_name = 'structure_note'
  ) then
    alter table grammar_sub_points add column structure_note text;
  end if;
end $$;

-- grammar_examples may be empty (0012 deletes all rows) or may have leftover
-- rows with both point columns null if a partial run got that far - either
-- way there's nothing to re-import, so this is a schema-only cleanup.

drop policy if exists "anon can read grammar examples of published lessons" on grammar_examples;

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
