-- The zhuyin (chú âm/bopomofo) column on vocabulary was never used anywhere
-- in the product (no UI reads or writes it meaningfully beyond the admin
-- edit form, which is also being removed) and is being dropped entirely per
-- owner request.
--
-- NOTE: this migration has not been applied to the live Supabase project —
-- there is no DB CLI access available in this environment (same caveat as
-- 0001_init.sql, 0002_client_side_slicing.sql, and 0003_enable_rls.sql). It
-- must be run manually (`supabase db push` or the SQL editor) before merge.

alter table vocabulary drop column zhuyin;
