-- dialogues.title_zh/title_vi dropped: turned out to always be a purely
-- mechanical "對話一"/"Hội thoại I" label derived from kind+position, never
-- a genuine unique title. Display name is now computed at render time from
-- kind + a per-kind 1-based counter (see lib/dialogueDisplayName.ts) instead
-- of being stored/edited as free text.
--
-- NOTE: this migration has not been applied to the live Supabase project -
-- same manual-apply caveat as every prior migration in this project. Must be
-- run via the Supabase SQL Editor before merge.

alter table dialogues drop column title_zh;
alter table dialogues drop column title_vi;
