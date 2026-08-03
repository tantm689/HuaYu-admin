import { z } from 'zod'

const nullableString = z.string().nullable().default(null)

const DialogueLineSchema = z.object({
  order: z.number(),
  speakerZh: nullableString,
  speakerPinyin: nullableString,
  textZh: z.string(),
  pinyin: nullableString,
  translationVi: nullableString,
})

const VocabularyEntrySchema = z.object({
  id: z.string().uuid().optional(),
  order: z.number(),
  wordZh: z.string(),
  pinyin: nullableString,
  meaningVi: nullableString,
  audioUrl: nullableString.optional(),
})

const DialogueSchema = z.object({
  order: z.number(),
  kind: z.enum(['dialogue', 'passage']).default('dialogue'),
  audioCode: nullableString,
  lines: z.array(DialogueLineSchema),
  vocabulary: z.array(VocabularyEntrySchema).default([]),
})

const LessonMetaSchema = z.object({
  lessonNo: z.number(),
  titleZh: z.string(),
  titleVi: z.string(),
  theme: nullableString,
  objectives: z.array(z.string()).default([]),
})

export const ExtractionResultSchema = z.object({
  lesson: LessonMetaSchema,
  dialogues: z.array(DialogueSchema),
  grammarMarkdown: z.string(),
})

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>

// Gemini responseSchema (JSON Schema subset) mirroring ExtractionResultSchema,
// used to force structured output from the model.
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    lesson: {
      type: 'object',
      description: 'Thông tin chung của bài học (metadata), lấy từ tiêu đề đầu bài.',
      properties: {
        lessonNo: { type: 'integer', description: 'Số thứ tự bài học, đúng bằng giá trị lessonNo được cung cấp trong yêu cầu.' },
        titleZh: { type: 'string', description: 'Tiêu đề bài học bằng chữ Hán, lấy nguyên văn từ đầu bài.' },
        titleVi: { type: 'string', description: 'Tiêu đề bài học dịch/ghi bằng tiếng Việt, lấy nguyên văn từ đầu bài nếu có. KHÔNG bao gồm tiền tố "Bài N" hay số thứ tự bài học - chỉ lấy phần tên riêng của bài (ví dụ "Gia đình của tôi", không phải "Bài 2: Gia đình của tôi" hay "Bài 2 - Gia đình của tôi").' },
        theme: { type: 'string', nullable: true, description: 'Chủ đề của bài học nếu sách có ghi rõ (ví dụ chủ đề giao tiếp), null nếu không có.' },
        objectives: { type: 'array', items: { type: 'string' }, description: 'Danh sách mục tiêu học tập của bài (學習目標), nếu sách có liệt kê; mảng rỗng nếu không có.' },
      },
      required: ['lessonNo', 'titleZh', 'titleVi'],
    },
    dialogues: {
      type: 'array',
      description:
        'Toàn bộ các đoạn bài khoá trong bài, gồm CẢ hai dạng "會話/Hội thoại" (nhiều người nói qua lại) và "短文/Đoạn văn" (một đoạn văn tường thuật liền mạch, không chia người nói) nếu sách có, giữ đúng thứ tự xuất hiện trong sách.',
      items: {
        type: 'object',
        properties: {
          order: { type: 'integer', description: 'Thứ tự của đoạn bài khoá trong bài, bắt đầu từ 1.' },
          kind: {
            type: 'string',
            enum: ['dialogue', 'passage'],
            description:
              'Dạng bài khoá: "dialogue" nếu trang có nhãn "會話/Hội thoại" (nhiều người nói qua lại, mỗi dòng có tên người nói); "passage" nếu trang có nhãn "短文/Đoạn văn" (một đoạn văn tường thuật liền mạch, không có người nói). Mặc định "dialogue" nếu không rõ.',
          },
          audioCode: { type: 'string', nullable: true, description: 'Mã audio track của đoạn bài khoá nếu sách có ghi (ví dụ "01-1"), null nếu không có.' },
          lines: {
            type: 'array',
            description:
              'Nếu kind là "dialogue": danh sách các dòng thoại, đúng theo thứ tự xuất hiện, mỗi dòng có người nói riêng. Nếu kind là "passage": TÁCH đoạn văn thành từng CÂU riêng theo đúng thứ tự xuất hiện (mỗi câu hoàn chỉnh, kết thúc bằng dấu câu, là một phần tử "lines"), speakerZh/speakerPinyin luôn để null vì đoạn văn không có người nói.',
            items: {
              type: 'object',
              properties: {
                order: { type: 'integer', description: 'Thứ tự của dòng/câu trong đoạn bài khoá, bắt đầu từ 1.' },
                speakerZh: { type: 'string', nullable: true, description: 'Tên người nói bằng chữ Hán nếu có (chỉ áp dụng cho kind "dialogue"), null nếu không có hoặc kind là "passage".' },
                speakerPinyin: { type: 'string', nullable: true, description: 'Pinyin của tên người nói nếu có (chỉ áp dụng cho kind "dialogue"), null nếu không có hoặc kind là "passage".' },
                textZh: { type: 'string', description: 'Nội dung câu thoại/câu văn bằng chữ Hán PHỒN THỂ, lấy nguyên văn từ sách. KHÔNG lấy từ khối "簡體字版/giản thể" nếu sách có in kèm bản đối chiếu.' },
                pinyin: { type: 'string', nullable: true, description: 'Pinyin của câu nếu sách có ghi, null nếu không có.' },
                translationVi: { type: 'string', nullable: true, description: 'Bản dịch tiếng Việt của câu nếu sách có ghi, null nếu không có.' },
              },
              required: ['order', 'textZh'],
            },
          },
          vocabulary: {
            type: 'array',
            description:
              'Toàn bộ các từ trong bảng Từ mới (生詞) đi kèm NGAY SAU đoạn bài khoá này (sách chia từ mới riêng cho từng đoạn hội thoại/đoạn văn, ví dụ "Từ mới I" đi với "Hội thoại I", "Từ mới II" đi với "Đoạn văn"), giữ đúng thứ tự xuất hiện trong bảng. KHÔNG gộp từ vựng của các đoạn bài khoá khác vào đây.',
            items: {
              type: 'object',
              properties: {
                order: { type: 'integer', description: 'Thứ tự của từ vựng trong bảng từ vựng, bắt đầu từ 1.' },
                wordZh: { type: 'string', description: 'Chữ Hán của từ vựng, lấy nguyên văn từ bảng từ vựng.' },
                pinyin: { type: 'string', nullable: true, description: 'CHỈ phần phiên âm La-tinh có dấu thanh điệu của từ vựng (ví dụ "diànshì"), null nếu không có. TUYỆT ĐỐI KHÔNG nối thêm từ loại viết tắt trong ngoặc (N/V/Vaux/Adv...) hay bất kỳ phần nghĩa tiếng Việt nào vào đây - từ loại có thể bỏ qua hoàn toàn, không lưu vào trường nào.' },
                meaningVi: {
                  type: 'string',
                  nullable: true,
                  description:
                    'Nghĩa tiếng Việt của từ, lấy nguyên văn từ cột nghĩa trong bảng từ vựng — KHÔNG được để trống nếu sách có ghi nghĩa cho từ này.',
                },
              },
              required: ['order', 'wordZh'],
            },
          },
        },
        required: ['order', 'lines'],
      },
    },
    grammarMarkdown: {
      type: 'string',
      description:
        'Toàn bộ phần ngữ pháp của bài, dưới dạng một chuỗi Markdown DUY NHẤT, không bao gồm phần luyện tập/bài tập hỏi-đáp (練習/Luyện tập). Cấu trúc Markdown PHẢI theo đúng quy tắc: "## Ngữ pháp N" (N là số thứ tự thường, bắt đầu từ 1) cho mỗi điểm ngữ pháp lớn - giữ tiêu đề tiếng Việt của điểm đó ngay sau, ví dụ "## Ngữ pháp 1: Cách đặt câu hỏi bằng tiếng Trung". Nếu điểm ngữ pháp có tiêu đề đánh số La Mã (I, II...) với các đề mục con chữ cái (A, B...) bên dưới, mỗi đề mục con là một "### A. <tiêu đề đề mục con>" (chữ cái + dấu chấm + tiêu đề, ví dụ "### A. Câu hỏi với A 不 A") lồng dưới heading "##" của điểm ngữ pháp đó. Trong mỗi điểm ngữ pháp (hoặc đề mục con), mỗi đề mục giải thích có nhãn riêng (Chức năng/Cấu trúc/Khẳng định/Phủ định/Câu hỏi/Cách dùng... - nhãn KHÔNG cố định, lấy nguyên văn từ sách) PHẢI là một dòng in đậm viết hoa toàn bộ, ví dụ "**CHỨC NĂNG**" - không dùng heading cho các nhãn này, để phân biệt cấp với "##"/"###". Ngay sau nhãn in đậm là đoạn văn giải thích (nếu sách có). Mỗi câu ví dụ minh hoạ là một khối 3 dòng liên tiếp không có tiền tố bullet/số: dòng 1 là câu chữ Hán, dòng 2 là pinyin viết NGHIÊNG (bọc trong "*...*"), dòng 3 là nghĩa tiếng Việt - cách nhau với ví dụ kế tiếp bằng đúng MỘT dòng trắng. Nếu một đề mục tự nó được sách đánh số thành nhiều ý (1. 2. 3...), dùng danh sách có số Markdown ("1. ... 2. ...") ngay dưới nhãn in đậm của đề mục đó, mỗi mục danh sách chứa cả đoạn giải thích lẫn các khối ví dụ 3-dòng riêng của ý đó. Câu ví dụ minh hoạ cách dùng SAI (đánh dấu "*" ở đầu câu trong sách) vẫn viết vào đúng vị trí ví dụ như bình thường, giữ nguyên dấu "*" ở đầu dòng chữ Hán. Bảng dữ liệu tham khảo (liệt kê từ vựng/công thức/danh mục, không phải câu ví dụ đánh số) viết thành danh sách gạch đầu dòng Markdown ("- ...") ngay trong đoạn giải thích của đề mục chứa nó.',
    },
  },
  required: ['lesson', 'dialogues', 'grammarMarkdown'],
} as const
