import { randomUUID } from 'crypto'
import { createServerSupabase } from '@/lib/supabase/server'
import { ExtractionResultSchema } from '@/lib/gemini/schema'
import { generateAudio, type TtsVoice } from '@/lib/tts/generateAudio'

export class JobNotEditableForAudioError extends Error {}

// Textbook vocab sometimes lists an alternate character variant in
// parentheses, e.g. "臺灣 (=台灣)" - both spellings share the same
// pronunciation, so TTS only needs the part before the parenthesis. Reading
// the parenthetical too made the audio say the word twice.
function ttsText(wordZh: string): string {
  return wordZh.replace(/\s*[（(].*$/, '').trim() || wordZh
}

async function uploadAudio(
  supabase: ReturnType<typeof createServerSupabase>,
  kind: 'vocab',
  id: string,
  text: string,
  voice: TtsVoice
): Promise<string> {
  const buffer = await generateAudio(ttsText(text), voice)
  const path = `${kind}/${id}.mp3`
  const { error } = await supabase.storage.from('audio').upload(path, buffer, {
    contentType: 'audio/mpeg',
    upsert: true,
  })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('audio').getPublicUrl(path)
  // Cache-bust: the storage path (and thus public URL) is stable across
  // regenerations (upsert overwrites the same file), so browsers/CDNs that
  // cached the old audio by URL would otherwise keep playing stale content
  // even though the server-side file was replaced with a new voice.
  return `${data.publicUrl}?v=${Date.now()}`
}

async function loadJob(supabase: ReturnType<typeof createServerSupabase>, jobId: string) {
  const { data: job, error } = await supabase.from('extraction_jobs').select().eq('id', jobId).single()
  if (error || !job) throw new Error('extraction job not found')
  return job
}

// Generates (or regenerates) the audio for a single vocab word identified by
// its position - the UI drives generation one word at a time (to show live
// progress) instead of the old fire-and-forget batch call, so this has to
// work whether the word already has a synthetic id (regenerating) or not
// (its first-ever generation). Does not touch job status; the caller flips
// status to 'audio_ready' once every word in the job has been covered.
export async function generateJobAudioItem(
  jobId: string,
  dialogueIndex: number,
  vocabIndex: number,
  voice: TtsVoice
): Promise<string> {
  const supabase = createServerSupabase()
  const job = await loadJob(supabase, jobId)

  if (job.status === 'pending' || job.status === 'failed') {
    throw new JobNotEditableForAudioError('Công việc phải ở trạng thái đã duyệt text mới sinh được audio.')
  }

  const result = ExtractionResultSchema.parse(job.raw_json)

  const dialogue = result.dialogues[dialogueIndex]
  const vocab = dialogue?.vocabulary[vocabIndex]
  if (!vocab) throw new Error('Không tìm thấy mục cần sinh audio.')

  vocab.id = vocab.id ?? randomUUID()
  vocab.audioUrl = await uploadAudio(supabase, 'vocab', vocab.id, vocab.wordZh, voice)

  await supabase.from('extraction_jobs').update({ raw_json: result }).eq('id', jobId)

  return vocab.audioUrl
}

// Flips the job's status to 'audio_ready' once every vocab word has audio.
// Called by the client after it finishes driving one-word-at-a-time
// generation to completion; safe to call redundantly.
export async function markJobAudioReady(jobId: string): Promise<void> {
  const supabase = createServerSupabase()
  const job = await loadJob(supabase, jobId)
  const result = ExtractionResultSchema.parse(job.raw_json)

  const allDone = result.dialogues.every((d) => d.vocabulary.every((v) => v.audioUrl))
  if (!allDone) throw new Error('Vẫn còn từ vựng chưa có audio.')

  if (job.status === 'reviewed') {
    await supabase.from('extraction_jobs').update({ status: 'audio_ready' }).eq('id', jobId)
  }
}
