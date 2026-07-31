-- TTS-generated audio for vocabulary words, added by the new "Sinh & duyệt
-- Audio" admin page (Scope 3 of the 5-step extraction pipeline). Mirrors
-- grammar_examples.audio_url added in migration 0011.
--
-- NOTE: this migration has not been applied to the live Supabase project —
-- same manual-apply caveat as every prior migration in this project. Must be
-- run via the Supabase SQL Editor before merge.

alter table vocabulary add column audio_url text;
