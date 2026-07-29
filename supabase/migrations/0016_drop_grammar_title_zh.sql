-- Grammar point/sub-point titleZh dropped: usually just a Roman-numeral-
-- prefixed duplicate of titleVi, redundant with it in the editor UI.
-- titleVi alone is kept as the single title field for grammar labeling.
-- lesson.title_zh and dialogues.title_zh are untouched - only grammar_points
-- and grammar_sub_points lose this column.
--
-- NOTE: this migration has not been applied to the live Supabase project —
-- same manual-apply caveat as every prior migration in this project. Must be
-- run via the Supabase SQL Editor before merge.

alter table grammar_points drop column title_zh;
alter table grammar_sub_points drop column title_zh;
