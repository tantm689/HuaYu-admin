-- supabase/migrations/0021_grammar_markdown.sql
-- Grammar moves from 4 nested tables (grammar_points -> grammar_sub_points
-- -> grammar_sections -> grammar_examples) to a single markdown string per
-- lesson. The nested structure needed the editor to hand-build add/remove/
-- move UI at 4-5 levels of nesting just to let the admin read/tweak text;
-- a WYSIWYG markdown editor (TipTap) replaces all of that, and the User
-- App's read-only grammar view becomes a plain markdown-to-HTML render
-- instead of walking the same nested shape.
--
-- No backfill: existing rows in these 4 tables are dropped. Lessons that
-- already have grammar content must be re-extracted with the new Gemini
-- prompt after this migration lands.
--
-- NOTE: this migration has not been applied to the live Supabase project -
-- same manual-apply caveat as every prior migration in this project. Must
-- be run via the Supabase SQL Editor before merge.

alter table lessons add column grammar_markdown text;

-- Tables first, then the function: grammar_sections/grammar_examples each
-- have an RLS policy that calls grammar_section_lesson_id(uuid), so
-- Postgres refuses to drop the function first (dependent-object error)
-- unless CASCADE is used. Dropping the tables (which drops their policies
-- along with them) before the function avoids needing CASCADE here.
drop table if exists grammar_examples;
drop table if exists grammar_sections;
drop table if exists grammar_sub_points;
drop table if exists grammar_points;

drop function if exists grammar_section_lesson_id(uuid);
