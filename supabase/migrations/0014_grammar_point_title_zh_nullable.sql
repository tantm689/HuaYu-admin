-- Some grammar points (usually a summary/overview heading spanning multiple
-- lettered sub-points, e.g. "Cách đặt câu hỏi bằng tiếng Trung") only have a
-- Vietnamese title in the book, with no dedicated Chinese-character title of
-- their own. title_zh being NOT NULL forced Gemini to duplicate the
-- Vietnamese title into it. Allow it to be null instead.

alter table grammar_points alter column title_zh drop not null;
