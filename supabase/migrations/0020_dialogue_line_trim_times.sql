-- dialogue_lines gains start_time/end_time (seconds, nullable): the
-- waveform trimmer admin feature needs to remember exactly which region of
-- the dialogue's full audio_url each line was cut from, so re-opening the
-- trimmer page can restore the previously marked region instead of forcing
-- the admin to re-mark every line from scratch just to fix one. The cut
-- audio_url alone can't be reversed back into a position within the
-- original full recording.
--
-- NOTE: this migration has not been applied to the live Supabase project —
-- same manual-apply caveat as every prior migration in this project. Must be
-- run via the Supabase SQL Editor before merge.

alter table dialogue_lines add column start_time numeric;
alter table dialogue_lines add column end_time numeric;
