-- grammar_examples.audio_url dropped: TTS audio for grammar example
-- sentences is no longer needed. The future "Gõ câu" (sentence typing
-- practice) feature in the User app was descoped to only use real
-- dialogue-line sentences (dialogue_lines.audio_url, real recordings, not
-- TTS) - grammar examples are never used for typing practice, so there's no
-- remaining reason to generate or store audio for them.
--
-- NOTE: this migration has not been applied to the live Supabase project -
-- same manual-apply caveat as every prior migration in this project. Must be
-- run via the Supabase SQL Editor before merge.

alter table grammar_examples drop column audio_url;
