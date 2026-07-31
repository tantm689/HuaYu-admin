-- The objectives column on lessons (bullet-list "Mục tiêu" shown on the
-- lesson detail page) was reviewed by the owner after import and is not
-- needed in the product; it is being dropped entirely per owner request,
-- same treatment as the zhuyin/category removals in 0004/0005.
--
-- NOTE: this migration has not been applied to the live Supabase project —
-- there is no DB CLI access available in this environment (same caveat as
-- every prior migration in this directory). It must be run manually
-- (`supabase db push` or the SQL editor) before merge.

alter table lessons drop column objectives;
