create table books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  volume text,
  pdf_path text not null,
  created_at timestamptz not null default now()
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  lesson_no int not null,
  title_zh text not null,
  title_vi text not null,
  theme text,
  objectives text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'published')),
  created_at timestamptz not null default now(),
  unique (book_id, lesson_no)
);

create table dialogues (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  "order" int not null,
  title_zh text,
  title_vi text,
  audio_code text,
  audio_url text
);

create table dialogue_lines (
  id uuid primary key default gen_random_uuid(),
  dialogue_id uuid not null references dialogues(id) on delete cascade,
  "order" int not null,
  speaker_zh text,
  speaker_pinyin text,
  text_zh text not null,
  pinyin text,
  translation_vi text
);

create table vocabulary (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  "order" int not null,
  category text,
  word_zh text not null,
  pinyin text,
  zhuyin text,
  meaning_vi text,
  audio_url text
);

create table grammar_points (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  "order" int not null,
  title_zh text not null,
  title_vi text,
  structure_note text
);

create table grammar_examples (
  id uuid primary key default gen_random_uuid(),
  grammar_point_id uuid not null references grammar_points(id) on delete cascade,
  "order" int not null,
  text_zh text not null,
  pinyin text,
  translation_vi text
);

create table extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  lesson_no int not null,
  page_start int not null,
  page_end int not null,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'imported', 'failed')),
  raw_json jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public) values ('book-pdfs', 'book-pdfs', false);
insert into storage.buckets (id, name, public) values ('audio', 'audio', true);
