-- Task 15: rework upload flow for client-side PDF slicing.
-- Supabase Free plan hard-caps Storage uploads at 50MB; the full textbook PDF
-- (339MB) can never be uploaded. Books no longer store a full PDF at all —
-- the admin picks the PDF from their own computer in the browser, slices out
-- just the selected lesson's pages client-side with pdf-lib, and uploads only
-- that small per-job file. extraction_jobs now points at that small file.

alter table books drop column pdf_path;

alter table extraction_jobs add column sliced_pdf_path text;
