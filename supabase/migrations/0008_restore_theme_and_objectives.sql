-- The owner reversed course: theme ("Chủ đề") and objectives ("Mục tiêu học
-- tập") turned out to be needed after all (visible directly on the book's
-- own lesson intro page, e.g. Bài 3's 學習目標/Chủ đề block), so they are
-- being restored after being dropped in 0006_remove_objectives.sql and
-- 0007_remove_theme.sql.
--
-- NOTE: this migration has not been applied to the live Supabase project —
-- there is no DB CLI access available in this environment (same caveat as
-- every prior migration in this directory). It must be run manually
-- (`supabase db push` or the SQL editor) before merge.

alter table lessons add column theme text;
alter table lessons add column objectives text[] not null default '{}';
