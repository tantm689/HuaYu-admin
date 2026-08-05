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

const PART2_PROMPT = `Bạn là công cụ sinh câu hỏi luyện tập (quiz) cho 1 bài học tiếng Trung, dựa trên nội dung bài khoá/từ vựng/ngữ pháp ĐÃ ĐƯỢC DUYỆT dưới đây (không phải trích xuất từ ảnh, mà từ dữ liệu JSON đã có sẵn).

Sinh đúng 15 câu hỏi thuộc 3 dạng vận dụng câu/ngữ pháp, MỖI dạng đúng 5 câu, "part" luôn là 2:

1. "matching": MỖI câu hỏi dạng này tự chứa đúng 5 cặp chữ Hán - nghĩa tiếng Việt để nối (không phải chọn từ toàn bộ từ vựng bài). Field: pairs (mảng đúng 5 object {left: chữ Hán, right: nghĩa tiếng Việt}).
2. "fill_blank": LẤY NGUYÊN VĂN 1 câu ví dụ ngữ pháp hoặc câu bài khoá có sẵn trong dữ liệu (KHÔNG tự sáng tác câu mới, KHÔNG sửa đổi câu gốc, KHÁC với 5 câu gốc đã dùng cho "sentence_order" ở mục 3 - không lấy trùng câu), đục 1 TỪ CHỨC NĂNG NGỮ PHÁP đã xuất hiện trong bài (trợ từ, phó từ, liên từ, giới từ - ví dụ 了/的/在/就/才/也/都/跟/和/因為/所以...) ra khỏi câu, đánh dấu chỗ trống bằng "___". TUYỆT ĐỐI KHÔNG đục danh từ/động từ nội dung chính của câu (như tên người, đồ vật, hành động chính) - việc đục từ chức năng ngữ pháp bắt buộc người học phải hiểu ĐÚNG NGỮ PHÁP mới chọn được, không phải đoán theo nghĩa từ.
   BẮT BUỘC lấy kèm câu NGAY TRƯỚC câu bị đục trong cùng đoạn hội thoại/ví dụ (nguyên văn, không sửa đổi) làm ngữ cảnh - field contextSentence. Đây là điều kiện BẮT BUỘC để đảm bảo chỉ có ĐÚNG 1 đáp án đúng: nhiều phó từ/trợ từ (ví dụ 不 và 也) nếu chỉ xét riêng câu bị đục thì ĐỀU đúng ngữ pháp, chỉ có 1 trong số đó khớp đúng NGHĨA khi đọc liền mạch với câu trước - PHẢI tự kiểm tra lại: đọc contextSentence + sentence (với từng lựa chọn điền vào chỗ trống) liền mạch như một đoạn hội thoại thật, chỉ giữ lại lựa chọn nào khiến đoạn đó hợp lý làm đáp án đúng, 3 lựa chọn còn lại phải khiến đoạn đọc lên vô lý/sai nghĩa khi đặt cạnh câu ngữ cảnh (dù bản thân chúng vẫn đúng ngữ pháp nếu xét câu bị đục một mình). Nếu câu bị đục là câu ĐẦU TIÊN của đoạn hội thoại/ví dụ (không có câu nào đứng trước), chọn một câu bài khoá/ví dụ khác trong dữ liệu có câu đứng trước để dùng thay.
   Mỗi câu dạng này BẮT BUỘC PHẢI có đủ 5 field sau, không được thiếu field nào: contextSentence (câu ngay trước, nguyên văn), sentence (câu có "___"), choices (đúng 4 lựa chọn), correctIndex (0-3), grammarPointUsed (xem quy tắc phân bổ điểm ngữ pháp bên dưới).
3. "sentence_order": LẤY NGUYÊN VĂN 1 câu bài khoá hoặc câu ví dụ có sẵn trong dữ liệu (KHÔNG tự sáng tác câu mới, KHÁC với 5 câu gốc sẽ dùng cho "fill_blank" ở mục 2 - không lấy trùng câu), ƯU TIÊN CHỌN CÂU CÓ ÍT NHẤT 5-6 THÀNH PHẦN/CỤM TỪ để xáo trộn (TRÁNH câu ngắn dưới 5 cụm từ, vì xáo trộn ít cụm từ có thể đoán ra ngay không cần hiểu ngữ pháp trật tự từ) - nếu không tìm được câu đủ dài, BẮT BUỘC ghép 2-3 câu liên tiếp trong cùng đoạn hội thoại thành 1 câu ghép dài hơn để xáo trộn (giữ nguyên văn từng câu con, không tự viết thêm). Xáo trộn ở mức từ/cụm từ nhỏ (2-3 chữ mỗi phần tử trong "words") thay vì cả cụm lớn, để việc sắp xếp lại thực sự đòi hỏi hiểu ngữ pháp trật tự từ, không phải chỉ ghép 2-3 khối lớn theo trực giác. BẮT BUỘC giữ nguyên dấu câu cuối câu gốc (。/？/！) và gắn liền dấu đó vào phần tử CUỐI CÙNG trong "words" (không tách dấu câu thành 1 phần tử riêng) - ví dụ câu gốc "你去學校。" xáo trộn thành words=["你","學校。","去"] (dấu 。 dính liền vào "學校" vì đó là cụm cuối câu), correctOrder=[0,2,1].
   Mỗi câu dạng này BẮT BUỘC PHẢI có đủ 3 field sau, không được thiếu field nào: words (mảng các từ/cụm từ đã xáo trộn, phần tử ở vị trí cuối câu gốc mang theo dấu câu), correctOrder (mảng index để sắp xếp lại "words" theo đúng thứ tự câu gốc, ví dụ nếu words=["thoại","hội","Bài"] và câu đúng là "Bài hội thoại" thì correctOrder=[2,1,0]), grammarPointUsed (xem quy tắc phân bổ điểm ngữ pháp bên dưới).

QUAN TRỌNG - QUY TẮC PHÂN BỔ ĐIỂM NGỮ PHÁP cho "fill_blank" và "sentence_order" (10 câu tổng cộng, 5 câu mỗi dạng): đây là lỗi rất hay gặp nếu bỏ qua - PHẢI làm theo đúng quy tắc sau, KHÔNG tự suy luận thêm.
Trước tiên, đếm số điểm ngữ pháp lớn của bài (mỗi heading "## Ngữ pháp N: ..." trong grammarMarkdown là 1 điểm - không tính các đề mục con "###" bên dưới nó là điểm riêng, cả 1 khối "## Ngữ pháp N" kể cả các đề mục con của nó chỉ tính là 1 điểm duy nhất).
- NẾU bài có TỪ 5 điểm ngữ pháp TRỞ XUỐNG: với MỖI dạng ("fill_blank" và "sentence_order" tính riêng), PHẢI dùng đủ MỌI điểm ngữ pháp của bài ít nhất 1 lần trong 5 câu của dạng đó trước khi được lặp lại điểm nào - ví dụ bài có 4 điểm ngữ pháp (A, B, C, D) thì 5 câu fill_blank PHẢI là A, B, C, D, và 1 câu lặp lại (điểm nào cũng được), KHÔNG được để trống bất kỳ điểm nào trong 4 điểm đó.
- NẾU bài có TRÊN 5 điểm ngữ pháp: chọn ra 5 điểm KHÁC NHAU (ưu tiên các điểm ngữ pháp chính, quan trọng của bài) để mỗi điểm dùng đúng 1 câu trong 5 câu - các điểm ngữ pháp còn lại không dùng tới cũng không sao, KHÔNG bắt buộc phải nhét đủ.
- Câu chọn để minh hoạ 1 điểm ngữ pháp PHẢI thực sự thể hiện rõ điểm ngữ pháp đó (ví dụ nếu điểm ngữ pháp là về câu hỏi "A 不 A" thì câu ví dụ/câu bài khoá được chọn phải có cấu trúc "A 不 A" thật sự trong câu, không chỉ là câu bất kỳ tình cờ nằm gần đoạn giải thích ngữ pháp đó) - PHẢI ưu tiên lấy trực tiếp các câu ví dụ đã có sẵn trong grammarMarkdown của đúng điểm ngữ pháp đó, hơn là câu bài khoá chỉ liên quan gián tiếp.
Ghi tên/tiêu đề điểm ngữ pháp đã dùng (nguyên văn phần tiêu đề tiếng Việt sau dấu ":" trong heading "## Ngữ pháp N: ...") vào field "grammarPointUsed" của câu đó - field này chỉ để tự kiểm soát nội bộ, không hiển thị cho người học.

QUAN TRỌNG: mỗi câu hỏi PHẢI có "part" (luôn là 2), "type", "order" (thứ tự liên tục 1-15), và ĐẦY ĐỦ các field bắt buộc của đúng dạng đó theo mô tả ở trên - thiếu field sẽ khiến toàn bộ kết quả bị từ chối. Chỉ dùng nội dung có trong dữ liệu được cung cấp bên dưới, KHÔNG tự sáng tác câu/từ vựng ngoài phạm vi bài học này.

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
