-- Some grammar points in the textbook have a Roman-numeral heading (I, II...)
-- with lettered sub-points underneath (A, B...), each with its own
-- Chức năng/Cấu trúc explanation and examples. Folding that into a single
-- structure_note string (as the earlier prompt fix did) either produces an
-- unreadable wall of text or loses content when summarized. This adds a
-- proper nested level instead: a grammar_point can have zero sub_points (the
-- common case - unchanged) or several, each with its own examples.
--
-- An example now belongs to exactly one of grammar_point_id / grammar_sub_point_id
-- (grammar_point_id is relaxed to nullable so top-level examples can instead
-- hang off a sub-point).
--
-- NOTE: this migration has not been applied to the live Supabase project —
-- there is no DB CLI access available in this environment (same caveat as
-- every prior migration in this directory). It must be run manually
-- (`supabase db push` or the SQL editor) before merge.

create table grammar_sub_points (
  id uuid primary key default gen_random_uuid(),
  grammar_point_id uuid not null references grammar_points(id) on delete cascade,
  "order" int not null,
  label text not null,
  title_zh text,
  title_vi text,
  structure_note text
);

alter table grammar_examples alter column grammar_point_id drop not null;
alter table grammar_examples add column grammar_sub_point_id uuid references grammar_sub_points(id) on delete cascade;
