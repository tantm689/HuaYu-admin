import { GoogleGenAI } from '@google/genai'
import type { ExtractionResult } from './schema'
import { QuizQuestionSchema, GEMINI_QUIZ_RESPONSE_SCHEMA, type QuizQuestion } from './quizSchema'

const QUIZ_PROMPT = `Bạn là công cụ sinh câu hỏi luyện tập (quiz) cho 1 bài học tiếng Trung, dựa trên nội dung bài khoá/từ vựng/ngữ pháp ĐÃ ĐƯỢC DUYỆT dưới đây (không phải trích xuất từ ảnh, mà từ dữ liệu JSON đã có sẵn).

Sinh đúng 30 câu hỏi, chia thành 6 dạng, MỖI dạng đúng 5 câu:

PHẦN 1 (part: 1) - nhận biết từ vựng/phát âm:
1. "pinyin_choice": cho 1 từ chữ Hán, hỏi pinyin đúng (hoặc ngược lại cho pinyin, hỏi chữ Hán đúng) trong 4 lựa chọn. Field: prompt (chữ Hán hoặc pinyin để hỏi), choices (4 lựa chọn), correctIndex (0-3).
2. "listening_choice": chỉ được chọn từ vựng ĐÃ CÓ audioUrl trong dữ liệu vocabulary được cung cấp (KHÔNG được chọn từ chưa có audioUrl, và KHÔNG được tự bịa audioUrl). Field: audioUrl (lấy nguyên văn từ dữ liệu), choices (4 lựa chọn nghĩa hoặc chữ Hán), correctIndex.
3. "tone_choice": cho 1 từ, hiển thị chữ Hán + pinyin KHÔNG dấu thanh điệu, hỏi thanh điệu đúng trong 4 biến thể pinyin có dấu khác nhau. Field: wordZh, pinyinNoTone, choices (4 biến thể pinyin có dấu), correctIndex.

PHẦN 2 (part: 2) - vận dụng câu/ngữ pháp:
4. "matching": MỖI câu hỏi dạng này tự chứa đúng 5 cặp chữ Hán - nghĩa tiếng Việt để nối (không phải chọn từ toàn bộ từ vựng bài). Field: pairs (mảng đúng 5 object {left: chữ Hán, right: nghĩa tiếng Việt}).
5. "fill_blank": dựa trên câu ví dụ ngữ pháp hoặc câu bài khoá có sẵn, đục 1 từ vựng ra khỏi câu, đánh dấu chỗ trống bằng "___". Field: sentence (câu có "___"), choices (4 lựa chọn từ để điền), correctIndex.
6. "sentence_order": lấy 1 câu bài khoá hoặc câu ví dụ có sẵn, xáo trộn các từ/cụm từ của câu đó. Field: words (mảng các từ đã xáo trộn), correctOrder (mảng index để sắp xếp lại "words" theo đúng thứ tự câu gốc, ví dụ nếu words=["thoại","hội","Bài"] và câu đúng là "Bài hội thoại" thì correctOrder=[2,1,0]).

QUAN TRỌNG: mỗi câu hỏi PHẢI có "part", "type", "order" (thứ tự liên tục 1-30 trong toàn bộ danh sách trả về, PHẦN 1 trước PHẦN 2). Chỉ dùng nội dung có trong dữ liệu được cung cấp bên dưới, KHÔNG tự sáng tác từ vựng/câu ngoài phạm vi bài học này.

Trả về đúng theo JSON schema đã cung cấp, không thêm giải thích ngoài JSON.`

export async function generateQuiz(result: ExtractionResult): Promise<QuizQuestion[]> {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

  const response = await client.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${QUIZ_PROMPT}\n\nDữ liệu bài học (JSON):\n${JSON.stringify({
              lesson: result.lesson,
              dialogues: result.dialogues,
              grammarPoints: result.grammarPoints,
            })}`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_QUIZ_RESPONSE_SCHEMA,
    },
  })

  const responseText = response.text

  let parsedJson: unknown
  try {
    if (!responseText) throw new Error('empty response')
    parsedJson = JSON.parse(responseText)
  } catch {
    throw new Error('Gemini response was not valid JSON')
  }

  const { questions } = parsedJson as { questions: unknown[] }
  if (!Array.isArray(questions) || questions.length !== 30) {
    throw new Error(`Expected exactly 30 quiz questions, got ${Array.isArray(questions) ? questions.length : 'invalid'}`)
  }

  return questions.map((q) => QuizQuestionSchema.parse(q))
}
