-- Two additions to support the new 5-step extraction pipeline (Extract ->
-- review text -> generate/approve Audio -> generate/approve Quiz -> Import):
--
-- 1. dialogue_lines.audio_url: per-line audio, trimmed by hand from the
--    dialogue's original audio_url in a future waveform-trimmer admin page
--    (not TTS - this is the real voice recording from the book).
-- 2. grammar_examples.audio_url: TTS-generated audio for grammar example
--    sentences (the book has no audio for these).
--
-- (Grammar example categorization - Khẳng định/Phủ định/Câu hỏi/Cách dùng/...
-- - is handled by the grammar_sections table added in migration 0012
-- instead of a fixed example_type enum; see that file for why.)
--
-- NOTE: this migration has not been applied to the live Supabase project —
-- same manual-apply caveat as every prior migration in this project. Must be
-- run via the Supabase SQL Editor before merge.

alter table dialogue_lines add column audio_url text;

alter table grammar_examples add column audio_url text;

-- extraction_jobs.status gains two intermediate states for the new pipeline:
-- pending -> reviewed -> audio_ready -> quiz_ready -> imported (failed stays).
alter table extraction_jobs drop constraint if exists extraction_jobs_status_check;
alter table extraction_jobs add constraint extraction_jobs_status_check
  check (status in ('pending', 'reviewed', 'audio_ready', 'quiz_ready', 'imported', 'failed'));
