-- The category column on vocabulary (vocabulary group label such as "Tên
-- riêng"/"Cụm từ"/"Danh từ") was reviewed by the owner after import and is
-- not needed in the product; it is being dropped entirely per owner request,
-- same treatment as the zhuyin removal in 0004_remove_zhuyin.sql.
--
-- NOTE: this migration has not been applied to the live Supabase project —
-- there is no DB CLI access available in this environment (same caveat as
-- 0001_init.sql, 0002_client_side_slicing.sql, 0003_enable_rls.sql, and
-- 0004_remove_zhuyin.sql). It must be run manually (`supabase db push` or
-- the SQL editor) before merge.

alter table vocabulary drop column category;
