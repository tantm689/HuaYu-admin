import { GoogleGenAI } from '@google/genai'
import type { ExtractionResult } from './schema'
import {
  Part1QuestionSchema,
  Part2QuestionSchema,
  GEMINI_QUIZ_PART1_RESPONSE_SCHEMA,
  GEMINI_QUIZ_PART2_RESPONSE_SCHEMA,
  type Part1Question,
  type Part2Question,
} from './quizSchema'

// Separate from gemini-3.6-flash (used by lib/gemini/extract.ts for PDF
// extraction) so quiz generation draws from its own daily request quota.
//
// No fallback model: a weaker model was tried here previously, but it
// followed the response schema's `required` list literally (only
// part/type/order are required - the type-specific fields like choices/
// correctIndex are merely `nullable` to let the schema cover all 6 question
// shapes in one object) and sometimes omitted fields a given question type
// actually needs, failing Zod validation instead of degrading gracefully.
// Simpler to surface the primary model's errors directly than risk that.
const QUIZ_MODEL = 'gemini-3.5-flash'

function lessonDataText(result: ExtractionResult): string {
  return JSON.stringify({
    lesson: result.lesson,
    dialogues: result.dialogues,
    grammarPoints: result.grammarPoints,
  })
}

const PART1_PROMPT = `Bạn là công cụ sinh câu hỏi luyện tập (quiz) cho 1 bài học tiếng Trung, dựa trên nội dung bài khoá/từ vựng/ngữ pháp ĐÃ ĐƯỢC DUYỆT dưới đây (không phải trích xuất từ ảnh, mà từ dữ liệu JSON đã có sẵn).

Sinh đúng 15 câu hỏi thuộc 3 dạng nhận biết từ vựng/phát âm, MỖI dạng đúng 5 câu, "part" luôn là 1:

1. "pinyin_choice": cho 1 từ chữ Hán, hỏi pinyin đúng (hoặc ngược lại cho pinyin, hỏi chữ Hán đúng) trong 4 lựa chọn. Field: prompt (chữ Hán hoặc pinyin để hỏi), choices (4 lựa chọn), correctIndex (0-3).
2. "listening_choice": chỉ được chọn từ vựng ĐÃ CÓ audioUrl trong dữ liệu vocabulary được cung cấp (KHÔNG được chọn từ chưa có audioUrl, và KHÔNG được tự bịa audioUrl). Field: audioUrl (lấy nguyên văn từ dữ liệu), choices (4 lựa chọn nghĩa hoặc chữ Hán), correctIndex.
3. "tone_choice": cho 1 từ, hiển thị chữ Hán + pinyin KHÔNG dấu thanh điệu, hỏi thanh điệu đúng trong 4 biến thể pinyin có dấu khác nhau. Field: wordZh, pinyinNoTone, choices (4 biến thể pinyin có dấu), correctIndex.

QUAN TRỌNG: mỗi câu hỏi PHẢI có "part" (luôn là 1), "type", "order" (thứ tự liên tục 1-15). Chỉ dùng nội dung có trong dữ liệu được cung cấp bên dưới, KHÔNG tự sáng tác từ vựng ngoài phạm vi bài học này.

Trả về đúng theo JSON schema đã cung cấp, không thêm giải thích ngoài JSON.`

const PART2_PROMPT = `Bạn là công cụ sinh câu hỏi luyện tập (quiz) cho 1 bài học tiếng Trung, dựa trên nội dung bài khoá/từ vựng/ngữ pháp ĐÃ ĐƯỢC DUYỆT dưới đây (không phải trích xuất từ ảnh, mà từ dữ liệu JSON đã có sẵn).

Sinh đúng 15 câu hỏi thuộc 3 dạng vận dụng câu/ngữ pháp, MỖI dạng đúng 5 câu, "part" luôn là 2:

1. "matching": MỖI câu hỏi dạng này tự chứa đúng 5 cặp chữ Hán - nghĩa tiếng Việt để nối (không phải chọn từ toàn bộ từ vựng bài). Field: pairs (mảng đúng 5 object {left: chữ Hán, right: nghĩa tiếng Việt}).
2. "fill_blank": LẤY NGUYÊN VĂN 1 câu ví dụ ngữ pháp hoặc câu bài khoá có sẵn trong dữ liệu (KHÔNG tự sáng tác câu mới, KHÔNG sửa đổi câu gốc), đục 1 TỪ CHỨC NĂNG NGỮ PHÁP đã xuất hiện trong bài (trợ từ, phó từ, liên từ, giới từ - ví dụ 了/的/在/就/才/也/都/跟/和/因為/所以...) ra khỏi câu, đánh dấu chỗ trống bằng "___". TUYỆT ĐỐI KHÔNG đục danh từ/động từ nội dung chính của câu (như tên người, đồ vật, hành động chính) - việc đục từ chức năng ngữ pháp bắt buộc người học phải hiểu ĐÚNG NGỮ PHÁP mới chọn được, không phải đoán theo nghĩa từ. 4 lựa chọn PHẢI đều là các từ chức năng ngữ pháp hợp lý về mặt hình thức trong câu đó (cùng loại từ), chỉ có ĐÚNG 1 lựa chọn khớp đúng nghĩa/ngữ pháp của câu gốc - không được để 2 lựa chọn trở lên đều nghe hợp lý. Field: sentence (câu có "___"), choices (4 lựa chọn từ chức năng), correctIndex.
3. "sentence_order": LẤY NGUYÊN VĂN 1 câu bài khoá hoặc câu ví dụ có sẵn trong dữ liệu (KHÔNG tự sáng tác câu mới), ƯU TIÊN CHỌN CÂU CÓ ÍT NHẤT 4-5 THÀNH PHẦN/CỤM TỪ để xáo trộn (TRÁNH câu quá ngắn chỉ 2-3 từ, vì xáo trộn 2-3 từ có thể đoán ra ngay không cần hiểu ngữ pháp trật tự từ) - nếu không tìm được câu đủ dài, được phép ghép 2 câu liên tiếp trong cùng đoạn hội thoại thành 1 câu ghép dài hơn để xáo trộn, miễn là giữ nguyên văn từng câu con. Field: words (mảng các từ/cụm từ đã xáo trộn), correctOrder (mảng index để sắp xếp lại "words" theo đúng thứ tự câu gốc, ví dụ nếu words=["thoại","hội","Bài"] và câu đúng là "Bài hội thoại" thì correctOrder=[2,1,0]).

QUAN TRỌNG: mỗi câu hỏi PHẢI có "part" (luôn là 2), "type", "order" (thứ tự liên tục 1-15). Chỉ dùng nội dung có trong dữ liệu được cung cấp bên dưới, KHÔNG tự sáng tác câu/từ vựng ngoài phạm vi bài học này.

Trả về đúng theo JSON schema đã cung cấp, không thêm giải thích ngoài JSON.`

// `usedFallbackModel` is always false now (no fallback model exists), kept
// on the result shape so callers (the DB layer, the API route, the edit
// page's fallback-warning banner) don't need to change - they simply never
// see it turn true anymore.
export type QuizGenerationResult<T> = { questions: T[]; usedFallbackModel: boolean }

// Gemini has no client-side timeout of its own - a slow/stuck response on
// their end would otherwise hang this call indefinitely. 60s comfortably
// covers a normal ~30s generation while still failing fast instead of
// leaving the admin staring at a spinner with no idea if it's still working.
const GEMINI_TIMEOUT_MS = 60_000

async function callGemini(
  prompt: string,
  dataText: string,
  responseSchema: object
): Promise<unknown[]> {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

  let response
  try {
    response = await client.models.generateContent({
      model: QUIZ_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: `${prompt}\n\nDữ liệu bài học (JSON):\n${dataText}` }],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema,
        abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
    })
  } catch (err) {
    // The @google/genai SDK doesn't reliably preserve AbortSignal.timeout()'s
    // TimeoutError name across its own internal error wrapping (observed:
    // it surfaced as a generic "This operation was aborted" instead) - since
    // this call has no other abort source, any abort-shaped error here can
    // only be our own timeout firing.
    if (err instanceof Error && /abort|timeout/i.test(err.name)) {
      throw new Error(`Gemini không phản hồi sau ${GEMINI_TIMEOUT_MS / 1000}s, thử lại.`)
    }
    throw err
  }

  const responseText = response.text

  let parsedJson: unknown
  try {
    if (!responseText) throw new Error('empty response')
    parsedJson = JSON.parse(responseText)
  } catch {
    throw new Error('Gemini response was not valid JSON')
  }

  const { questions } = parsedJson as { questions: unknown[] }
  if (!Array.isArray(questions) || questions.length !== 15) {
    throw new Error(`Expected exactly 15 quiz questions, got ${Array.isArray(questions) ? questions.length : 'invalid'}`)
  }

  return questions
}

// Generates Part 1 (15 questions: pinyin_choice/listening_choice/tone_choice)
// via its own Gemini call, separate from Part 2 - so each call is smaller/
// faster, and a failure in one part doesn't require redoing the other.
export async function generateQuizPart1(result: ExtractionResult): Promise<QuizGenerationResult<Part1Question>> {
  const questions = await callGemini(PART1_PROMPT, lessonDataText(result), GEMINI_QUIZ_PART1_RESPONSE_SCHEMA)
  return { questions: questions.map((q) => Part1QuestionSchema.parse(q)), usedFallbackModel: false }
}

// Generates Part 2 (15 questions: matching/fill_blank/sentence_order).
export async function generateQuizPart2(result: ExtractionResult): Promise<QuizGenerationResult<Part2Question>> {
  const questions = await callGemini(PART2_PROMPT, lessonDataText(result), GEMINI_QUIZ_PART2_RESPONSE_SCHEMA)
  return { questions: questions.map((q) => Part2QuestionSchema.parse(q)), usedFallbackModel: false }
}
