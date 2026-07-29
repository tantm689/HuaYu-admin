import { createServerSupabase } from '@/lib/supabase/server'
import { generateAudio, type TtsVoice } from '@/lib/tts/generateAudio'

const DEFAULT_VOICE: TtsVoice = 'zh-TW-HsiaoChenNeural'

// See lib/db/generateJobAudio.ts for why this is capped rather than firing
// every request via Promise.allSettled at once.
const TTS_CONCURRENCY = 5

async function runWithConcurrency(tasks: (() => Promise<void>)[], concurrency: number): Promise<PromiseSettledResult<void>[]> {
  const results: PromiseSettledResult<void>[] = new Array(tasks.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex++
      try {
        await tasks[index]()
        results[index] = { status: 'fulfilled', value: undefined }
      } catch (err) {
        results[index] = { status: 'rejected', reason: err }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

// See lib/db/generateJobAudio.ts's ttsText for why this strips the
// parenthetical part - e.g. "臺灣 (=台灣)" would otherwise be read twice.
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
  // See lib/db/generateJobAudio.ts's uploadAudio for why this cache-busts.
  return `${data.publicUrl}?v=${Date.now()}`
}

// Same TTS generation as generateJobAudio.ts, but operating directly on the
// live vocabulary table via real row ids instead of a job's raw_json - for
// lessons that were already imported before this feature existed (no
// extraction_job left to route them through the audio page). Idempotent:
// only fills rows where audio_url is still null.
export async function generateLessonAudio(lessonId: string, voice: TtsVoice = DEFAULT_VOICE): Promise<void> {
  const supabase = createServerSupabase()

  const { data: dialogues, error: dialoguesError } = await supabase
    .from('dialogues')
    .select('id')
    .eq('lesson_id', lessonId)
  if (dialoguesError) throw new Error(dialoguesError.message)
  const dialogueIds = (dialogues ?? []).map((d: { id: string }) => d.id)

  const { data: vocabulary, error: vocabError } =
    dialogueIds.length > 0
      ? await supabase.from('vocabulary').select('id, word_zh, audio_url').in('dialogue_id', dialogueIds)
      : { data: [] as { id: string; word_zh: string; audio_url: string | null }[], error: null }
  if (vocabError) throw new Error(vocabError.message)

  const pendingWork: (() => Promise<void>)[] = []

  for (const vocab of vocabulary ?? []) {
    if (vocab.audio_url) continue
    pendingWork.push(async () => {
      const audioUrl = await uploadAudio(supabase, 'vocab', vocab.id, vocab.word_zh, voice)
      const { error } = await supabase.from('vocabulary').update({ audio_url: audioUrl }).eq('id', vocab.id)
      if (error) throw new Error(error.message)
    })
  }

  const outcomes = await runWithConcurrency(pendingWork, TTS_CONCURRENCY)
  const failures = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected')
  if (failures.length > 0) {
    throw new Error(`Sinh audio thất bại cho ${failures.length}/${outcomes.length} mục. Các mục thành công đã được lưu, có thể thử lại.`)
  }
}

// Regenerates the audio for a single vocab word already in the live DB,
// identified by its real row id.
export async function regenerateLessonAudioItem(itemId: string, voice: TtsVoice): Promise<void> {
  const supabase = createServerSupabase()

  const { data: vocab, error } = await supabase.from('vocabulary').select('id, word_zh').eq('id', itemId).single()
  if (error || !vocab) throw new Error('Không tìm thấy từ vựng cần tạo lại audio.')
  const audioUrl = await uploadAudio(supabase, 'vocab', vocab.id, vocab.word_zh, voice)
  const { error: updateError } = await supabase.from('vocabulary').update({ audio_url: audioUrl }).eq('id', itemId)
  if (updateError) throw new Error(updateError.message)
}
