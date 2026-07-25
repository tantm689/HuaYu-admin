import { GoogleGenAI } from '@google/genai'
import { ExtractionResultSchema, GEMINI_RESPONSE_SCHEMA, type ExtractionResult } from './schema'

const EXTRACTION_PROMPT = `Bạn là công cụ trích xuất nội dung sách giáo trình tiếng Trung "Đương Đại" từ ảnh PDF các trang của một bài học.

Chỉ trích xuất đúng 3 phần sau, bỏ qua mọi nội dung khác:
1. "dialogues": TOÀN BỘ các hội thoại (對話) trong bài, giữ đúng thứ tự dòng thoại, người nói, chữ Hán, pinyin, và mã audio track nếu có (ví dụ "01-1") ở cấp độ hội thoại.
2. "vocabulary": CHỈ các từ nằm trong bảng Từ vựng (生詞) chính thức của bài. KHÔNG lấy từ xuất hiện rải rác trong hội thoại, ngữ pháp, hay bài tập nếu chúng không có trong bảng từ vựng chính thức. Với MỖI từ vựng, BẮT BUỘC phải trích xuất đầy đủ "meaningVi" (nghĩa tiếng Việt, lấy nguyên văn từ cột nghĩa trong bảng) và "category" (tên nhóm từ vựng như in trong sách, ví dụ "Tên riêng", "Cụm từ", "Danh từ", lấy từ tiêu đề nhóm ngay phía trên trong bảng). TUYỆT ĐỐI KHÔNG được để "meaningVi" là null nếu sách có ghi nghĩa cho từ đó, và KHÔNG được để "category" là null nếu từ đó nằm trong một nhóm có tiêu đề rõ ràng trong bảng.
3. "grammarPoints": mỗi điểm ngữ pháp gồm tiêu đề, phần giải thích cấu trúc ("Cấu trúc"), và các ví dụ minh hoạ đánh số. TUYỆT ĐỐI KHÔNG trích xuất phần luyện tập/bài tập hỏi-đáp (練習/Luyện tập) của ngữ pháp.

Trả về đúng theo JSON schema đã cung cấp, không thêm giải thích ngoài JSON.`

export async function extractLessonFromPdf(
  pdfBytes: Uint8Array,
  lessonNo: number
): Promise<ExtractionResult> {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

  const response = await client.models.generateContent({
    model: 'gemini-3.5-flash-lite',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: Buffer.from(pdfBytes).toString('base64') } },
          { text: `${EXTRACTION_PROMPT}\n\nSố bài (lessonNo) là: ${lessonNo}.` },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_RESPONSE_SCHEMA,
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

  return ExtractionResultSchema.parse(parsedJson)
}
