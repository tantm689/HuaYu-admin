export type LessonStatus = 'draft' | 'reviewed' | 'published'
export type JobStatus = 'pending' | 'reviewed' | 'imported' | 'failed'

export interface Book {
  id: string
  title: string
  volume: string | null
  created_at: string
}

export interface Lesson {
  id: string
  book_id: string
  lesson_no: number
  title_zh: string
  title_vi: string
  theme: string | null
  objectives: string[]
  status: LessonStatus
  created_at: string
}

export interface Dialogue {
  id: string
  lesson_id: string
  order: number
  title_zh: string | null
  title_vi: string | null
  audio_code: string | null
  audio_url: string | null
}

export interface DialogueLine {
  id: string
  dialogue_id: string
  order: number
  speaker_zh: string | null
  speaker_pinyin: string | null
  text_zh: string
  pinyin: string | null
  translation_vi: string | null
}

export interface VocabularyEntry {
  id: string
  lesson_id: string
  order: number
  word_zh: string
  pinyin: string | null
  meaning_vi: string | null
  audio_url: string | null
}

export interface GrammarPoint {
  id: string
  lesson_id: string
  order: number
  title_zh: string
  title_vi: string | null
  structure_note: string | null
}

export interface GrammarExample {
  id: string
  grammar_point_id: string
  order: number
  text_zh: string
  pinyin: string | null
  translation_vi: string | null
}

export interface ExtractionJob {
  id: string
  book_id: string
  lesson_no: number
  page_start: number
  page_end: number
  sliced_pdf_path: string | null
  status: JobStatus
  raw_json: unknown
  error_message: string | null
  created_at: string
}
