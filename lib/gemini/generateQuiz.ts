import { GoogleGenAI } from '@google/genai'
import { ZodError, type ZodType } from 'zod'
import type { ExtractionResult } from './schema'
import {
  Part1QuestionSchema,
  Part2QuestionSchema,
  GEMINI_QUIZ_PART1_RESPONSE_SCHEMA,
  GEMINI_QUIZ_PART2_RESPONSE_SCHEMA,
  type Part1Question,
  type Part2Question,
} from './quizSchema'

// A bare ZodError's .message is just the raw issues array
// (`[{"code":"invalid_type","path":["choices"],...}]`) with no indication
// of WHICH of the 15 questions failed or what type it was - exactly the
// unreadable error this was built to fix. Re-parses each question
// individually so a failure can be attributed to its index/type before
// rethrowing, instead of losing that context in a single .map() call.
function parseQuestions<T>(questions: unknown[], schema: ZodType<T>): T[] {
  return questions.map((q, index) => {
    const result = schema.safeParse(q)
    if (result.success) return result.data
    const type = (q as { type?: unknown })?.type
    const typeLabel = typeof type === 'string' ? type : 'không xác định'
    throw new Error(
      `Câu hỏi thứ ${index + 1} (dạng "${typeLabel}") thiếu/sai dữ liệu: ${describeZodIssues(result.error)}`
    )
  })
}

function describeZodIssues(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')} - ${issue.message}`).join('; ')
}

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
    grammarMarkdown: result.grammarMarkdown,
  })
}

const PART1_PROMPT = `Bạn là công cụ sinh câu hỏi luyện tập (quiz) cho 1 bài học tiếng Trung, dựa trên nội dung bài khoá/từ vựng/ngữ pháp ĐÃ ĐƯỢC DUYỆT dưới đây (không phải trích xuất từ ảnh, mà từ dữ liệu JSON đã có sẵn).

Sinh đúng 15 câu hỏi thuộc 3 dạng nhận biết từ vựng/phát âm, MỖI dạng đúng 5 câu, "part" luôn là 1:

1. "pinyin_choice": cho 1 từ chữ Hán, hỏi pinyin đúng (hoặc ngược lại cho pinyin, hỏi chữ Hán đúng) trong 4 lựa chọn. Field: prompt (chữ Hán hoặc pinyin để hỏi), choices (4 lựa chọn), correctIndex (0-3).
2. "listening_choice": chỉ được chọn từ vựng ĐÃ CÓ audioUrl trong dữ liệu vocabulary được cung cấp (KHÔNG được chọn từ chưa có audioUrl, và KHÔNG được tự bịa audioUrl). Field: audioUrl (lấy nguyên văn từ dữ liệu), choices (4 lựa chọn nghĩa hoặc chữ Hán), correctIndex.
3. "tone_choice": cho 1 từ, hiển thị chữ Hán + pinyin KHÔNG dấu thanh điệu, hỏi thanh điệu đúng trong 4 biến thể pinyin có dấu khác nhau. Field: wordZh, pinyinNoTone, choices (4 biến thể pinyin có dấu), correctIndex.

QUAN TRỌNG: mỗi câu hỏi PHẢI có "part" (luôn là 1), "type", "order" (thứ tự liên tục 1-15), VÀ BẮT BUỘC PHẢI CÓ "choices" (đúng 4 lựa chọn) và "correctIndex" (0-3) - cả 3 dạng câu hỏi ở trên (pinyin_choice, listening_choice, tone_choice) ĐỀU dùng chung 2 field này, TUYỆT ĐỐI KHÔNG được bỏ trống hay để thiếu "choices"/"correctIndex" ở bất kỳ câu nào dù là dạng nào - thiếu 1 trong 2 field này ở bất kỳ câu nào sẽ khiến toàn bộ 15 câu bị từ chối. Chỉ dùng nội dung có trong dữ liệu được cung cấp bên dưới, KHÔNG tự sáng tác từ vựng ngoài phạm vi bài học này.

Trả về đúng theo JSON schema đã cung cấp, không thêm giải thích ngoài JSON.`

const PART2_PROMPT = `Bạn là một giáo viên tiếng Trung giàu kinh nghiệm, đang tự tay biên soạn 15 câu hỏi luyện tập (quiz) cho 1 bài học, dựa trên nội dung bài khoá/từ vựng/ngữ pháp ĐÃ ĐƯỢC DUYỆT dưới đây (không phải trích xuất từ ảnh, mà từ dữ liệu JSON đã có sẵn). Mục tiêu là bộ câu hỏi CHẤT LƯỢNG THẬT SỰ - tự nhiên, logic, hợp lý - không phải chỉ đúng định dạng kỹ thuật.

Sinh đúng 15 câu hỏi thuộc 3 dạng vận dụng câu/ngữ pháp, MỖI dạng đúng 5 câu, "part" luôn là 2:

1. "matching": MỖI câu hỏi dạng này tự chứa đúng 5 cặp chữ Hán - nghĩa tiếng Việt để nối (không phải chọn từ toàn bộ từ vựng bài). Field: pairs (mảng đúng 5 object {left: chữ Hán, right: nghĩa tiếng Việt}).

2. "fill_blank": LẤY NGUYÊN VĂN 1 câu ví dụ ngữ pháp hoặc câu bài khoá có sẵn trong dữ liệu (KHÔNG tự sáng tác câu mới, KHÔNG sửa đổi câu gốc, KHÁC với 5 câu đã dùng cho "sentence_order" - không lấy trùng câu), đục 1 TỪ CHỨC NĂNG NGỮ PHÁP (trợ từ, phó từ, liên từ, giới từ - ví dụ 了/的/在/就/才/也/都/跟/和/因為/所以/不...) ra khỏi câu, đánh dấu chỗ trống bằng "___". KHÔNG đục danh từ/động từ nội dung chính (tên người, đồ vật, hành động chính).
   TUYỆT ĐỐI KHÔNG đục từ nằm bên trong một CỤM CỐ ĐỊNH mà bản thân cụm đó không thể thay bằng từ khác (ví dụ "要不要", "是不是", "有沒有", "好不好" - những cụm "X不X"/"X沒X" là một khối cố định gắn liền với động từ/tính từ đứng trước nó, không phải một vị trí ngữ pháp có thể điền nhiều lựa chọn khác nhau vào). Chỉ đục từ ở những vị trí mà về mặt ngữ pháp, NHIỀU từ chức năng khác nhau đều có thể đứng được (chỉ khác nhau về ý nghĩa/cách dùng) - đó mới là thứ thật sự kiểm tra được kiến thức ngữ pháp.
   MỖI câu phải có ĐÚNG 1 đáp án đúng duy nhất, không mập mờ. Tự đọc lại toàn bộ 4 lựa chọn đã điền vào câu, xét trong ngữ cảnh (kèm câu ngay trước nó) - nếu từ 2 lựa chọn trở lên đều đọc lên hợp lý, PHẢI đổi câu/đổi chỗ đục khác cho tới khi chỉ còn đúng 1 lựa chọn hợp lý. 4 lựa chọn nên là các từ CÙNG LOẠI/CÙNG CHỨC NĂNG ngữ pháp (ví dụ đều là phó từ phủ định-khẳng định, hoặc đều là trợ từ nghi vấn cuối câu) để việc phân biệt thực sự kiểm tra hiểu ngữ pháp, không phải đoán mò giữa những từ hoàn toàn khác loại.
   BẮT BUỘC lấy kèm câu NGAY TRƯỚC câu bị đục (nguyên văn, không sửa đổi) làm ngữ cảnh - field contextSentence. Nếu câu bị đục là câu ĐẦU TIÊN của đoạn (không có câu đứng trước), chọn câu khác trong dữ liệu có câu đứng trước để dùng thay.
   Mỗi câu dạng này cần đủ field: contextSentence (câu ngay trước, nguyên văn), sentence (câu có "___"), choices (đúng 4 lựa chọn), correctIndex (0-3).

3. "sentence_order": LẤY NGUYÊN VĂN 1 câu bài khoá hoặc câu ví dụ có sẵn trong dữ liệu (KHÔNG tự sáng tác câu mới, KHÁC với 5 câu đã dùng cho "fill_blank" - không lấy trùng câu), ưu tiên câu có ít nhất 5-6 thành phần/cụm từ để xáo trộn (tránh câu ngắn dưới 5 cụm từ, dễ đoán ra ngay không cần hiểu ngữ pháp) - nếu không tìm được câu đủ dài, ghép 2-3 câu liên tiếp trong cùng đoạn thành 1 câu ghép dài hơn (giữ nguyên văn từng câu con). Xáo trộn ở mức từ/cụm từ nhỏ (2-3 chữ mỗi phần tử) thay vì cả cụm lớn, để việc sắp xếp lại thực sự đòi hỏi hiểu ngữ pháp trật tự từ. Giữ nguyên dấu câu cuối câu gốc (。/？/！), gắn liền dấu đó vào phần tử CUỐI CÙNG trong "words" (không tách dấu câu thành 1 phần tử riêng) - ví dụ câu gốc "你去學校。" xáo trộn thành words=["你","學校。","去"], correctOrder=[0,2,1].
   Mỗi câu dạng này cần đủ field: words (mảng các từ/cụm từ đã xáo trộn), correctOrder (mảng index để sắp xếp lại "words" theo đúng thứ tự câu gốc).

QUAN TRỌNG về sự đa dạng của 10 câu "fill_blank" + "sentence_order": đây là 10 câu luyện tập ngữ pháp của TOÀN BỘ bài học, không phải chỉ xoay quanh 1-2 điểm ngữ pháp dễ nhất. Trước khi viết câu, đọc lướt qua toàn bộ grammarMarkdown, liệt kê ra các điểm ngữ pháp riêng biệt của bài (mỗi heading "## Ngữ pháp N: ..." là một điểm - không tính các đề mục con "###" bên dưới nó là điểm riêng). Cố gắng để 10 câu này trải đều qua CÀNG NHIỀU điểm ngữ pháp khác nhau CÀNG TỐT, ưu tiên những câu ví dụ có sẵn ngay trong phần giải thích ngữ pháp của đúng điểm đó (chứng tỏ câu thật sự minh hoạ đúng điểm ngữ pháp, không phải một câu bất kỳ tình cờ gần đó) - nhưng KHÔNG cố ép đủ số lượng bằng câu gượng ép, thà lặp lại một điểm ngữ pháp quan trọng còn hơn dùng một câu không thật sự thể hiện rõ ngữ pháp đang muốn kiểm tra. Tự đánh giá: nếu nhìn lại 10 câu mà thấy quá nửa số câu chỉ xoay quanh cùng 1-2 điểm ngữ pháp trong khi bài có nhiều điểm khác chưa được động tới, hãy viết lại cho đa dạng hơn.

QUAN TRỌNG: mỗi câu hỏi PHẢI có "part" (luôn là 2), "type", "order" (thứ tự liên tục 1-15), và đầy đủ các field bắt buộc của đúng dạng đó theo mô tả ở trên - thiếu field sẽ khiến toàn bộ kết quả bị từ chối. Chỉ dùng nội dung có trong dữ liệu được cung cấp bên dưới, KHÔNG tự sáng tác câu/từ vựng ngoài phạm vi bài học này.

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
  return { questions: parseQuestions(questions, Part1QuestionSchema), usedFallbackModel: false }
}

// Generates Part 2 (15 questions: matching/fill_blank/sentence_order).
export async function generateQuizPart2(result: ExtractionResult): Promise<QuizGenerationResult<Part2Question>> {
  const questions = await callGemini(PART2_PROMPT, lessonDataText(result), GEMINI_QUIZ_PART2_RESPONSE_SCHEMA)
  return { questions: parseQuestions(questions, Part2QuestionSchema), usedFallbackModel: false }
}
