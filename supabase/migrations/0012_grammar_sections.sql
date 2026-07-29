-- The textbook splits each grammar point's explanation into several labeled
-- sub-sections whose labels are NOT fixed across the book's 3 volumes
-- (Chức năng, Cấu trúc, Khẳng định, Phủ định, Câu hỏi, Thông thường, Sử
-- dụng, Cách dùng, ...), and each of those sub-sections has its OWN
-- numbered examples - not one shared example pool for the whole grammar
-- point. Folding all of that into a single structure_note string plus a
-- flat examples list (tagged only 'default'/'negative'/'question' via the
-- example_type column from migration 0011) can't represent sections like
-- "Chức năng" or "Cách dùng" that have their own examples but aren't
-- affirmative/negative/question - those examples all got the same
-- indistinguishable 'default' tag, losing which section they illustrate.
--
-- grammar_sections replaces structure_note + example_type: each section is
-- one labeled block (label + content text), belonging to exactly one of
-- grammar_point_id / grammar_sub_point_id (mirroring how grammar_examples
-- already splits between those two owners since migration 0009). Examples
-- now belong to a specific section instead of directly to a grammar_point
-- or grammar_sub_point.
--
-- NOTE: this migration has not been applied to the live Supabase project —
-- same manual-apply caveat as every prior migration in this project. Must be
-- run via the Supabase SQL Editor before merge.

-- Some sections (usually "Cấu trúc"/"Cách dùng") are themselves numbered
-- into several sub-points (1. 2. 3...), each with its own explanation AND
-- its own examples - not one example pool shared across all numbered
-- sub-points. grammar_sections is self-referencing via parent_section_id to
-- represent that: a top-level section (parent_section_id null) belongs to a
-- grammar_point or grammar_sub_point same as before, while a numbered
-- sub-point becomes its own grammar_sections row with parent_section_id
-- pointing at the top-level section it belongs to. Nesting is capped at one
-- level (a child section's own parent_section_id children are never
-- created) because the book never goes deeper than this.
create table grammar_sections (
  id uuid primary key default gen_random_uuid(),
  grammar_point_id uuid references grammar_points(id) on delete cascade,
  grammar_sub_point_id uuid references grammar_sub_points(id) on delete cascade,
  parent_section_id uuid references grammar_sections(id) on delete cascade,
  "order" int not null,
  label text not null,
  content text,
  check (
    (
      (grammar_point_id is not null)::int +
      (grammar_sub_point_id is not null)::int +
      (parent_section_id is not null)::int
    ) = 1
  )
);

alter table grammar_points drop column structure_note;
alter table grammar_sub_points drop column structure_note;

alter table grammar_examples add column grammar_section_id uuid references grammar_sections(id) on delete cascade;

-- No existing grammar_examples rows can be backfilled with a grammar_section_id
-- (there's no reliable way to know which section they belonged to), so drop
-- them along with their old point/sub-point columns - lessons are being
-- re-extracted anyway to pick up this structure.
delete from grammar_examples;

-- The 0003 policy referenced grammar_point_id directly; replace it with one
-- that joins through grammar_sections instead, now that grammar_examples no
-- longer has grammar_point_id/grammar_sub_point_id columns.
drop policy if exists "anon can read grammar examples of published lessons" on grammar_examples;

alter table grammar_examples drop column grammar_point_id;
alter table grammar_examples drop column grammar_sub_point_id;
alter table grammar_examples alter column grammar_section_id set not null;

-- Walks a grammar_sections row up to its owning lesson: either directly via
-- grammar_point_id/grammar_sub_point_id, or one hop up through
-- parent_section_id first for a numbered sub-point section. Recursive CTE
-- instead of a fixed-depth OR chain so this stays correct even though
-- nesting is currently capped at one level in application code.
create or replace function grammar_section_lesson_id(section_id uuid)
returns uuid
language sql
stable
as $$
  with recursive chain as (
    select id, grammar_point_id, grammar_sub_point_id, parent_section_id
    from grammar_sections
    where id = section_id
    union all
    select gs.id, gs.grammar_point_id, gs.grammar_sub_point_id, gs.parent_section_id
    from grammar_sections gs
    join chain on chain.parent_section_id = gs.id
  )
  select lessons.id
  from chain
  left join grammar_points on grammar_points.id = chain.grammar_point_id
  left join grammar_sub_points on grammar_sub_points.id = chain.grammar_sub_point_id
  left join grammar_points gp2 on gp2.id = grammar_sub_points.grammar_point_id
  join lessons on lessons.id = coalesce(grammar_points.lesson_id, gp2.lesson_id)
  limit 1
$$;

create policy "anon can read grammar examples of published lessons"
  on grammar_examples for select
  to anon
  using (
    exists (
      select 1 from lessons
      where lessons.id = grammar_section_lesson_id(grammar_examples.grammar_section_id)
        and lessons.status = 'published'
    )
  );

-- anon RLS: grammar_sections readable when its owning lesson is published.
alter table grammar_sections enable row level security;

create policy "anon can read grammar sections of published lessons"
  on grammar_sections for select
  to anon
  using (
    exists (
      select 1 from lessons
      where lessons.id = grammar_section_lesson_id(grammar_sections.id)
        and lessons.status = 'published'
    )
  );
