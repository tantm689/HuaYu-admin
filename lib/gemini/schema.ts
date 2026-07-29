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

const GrammarExampleSchema = z.object({
  order: z.number(),
  textZh: z.string(),
  pinyin: nullableString,
  translationVi: nullableString,
})

const GrammarSectionItemSchema = z.object({
  order: z.number(),
  label: z.string(),
  content: nullableString,
  examples: z.array(GrammarExampleSchema),
})

const GrammarSectionSchema = z.object({
  order: z.number(),
  label: z.string(),
  content: nullableString,
  examples: z.array(GrammarExampleSchema),
  items: z.array(GrammarSectionItemSchema).default([]),
})

const GrammarSubPointSchema = z.object({
  order: z.number(),
  label: z.string(),
  titleVi: nullableString,
  sections: z.array(GrammarSectionSchema),
})

const GrammarPointSchema = z.object({
  order: z.number(),
  titleVi: nullableString,
  sections: z.array(GrammarSectionSchema),
  subPoints: z.array(GrammarSubPointSchema).default([]),
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
  grammarPoints: z.array(GrammarPointSchema),
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
    grammarPoints: {
      type: 'array',
      description: 'Toàn bộ các điểm ngữ pháp trong bài, không bao gồm phần luyện tập/bài tập hỏi-đáp.',
      items: {
        type: 'object',
        properties: {
          order: { type: 'integer', description: 'Thứ tự của điểm ngữ pháp trong bài, bắt đầu từ 1.' },
          titleVi: { type: 'string', nullable: true, description: 'Tiêu đề điểm ngữ pháp bằng tiếng Việt nếu có, null nếu không có.' },
          sections: {
            type: 'array',
            description:
              'Sách chia phần giải thích của điểm ngữ pháp thành nhiều đề mục có nhãn riêng, KHÔNG cố định tuỳ bài/tuỳ quyển (ví dụ "Chức năng", "Cấu trúc", "Khẳng định", "Phủ định", "Câu hỏi", "Thông thường", "Sử dụng", "Cách dùng"...), MỖI đề mục có phần nội dung giải thích và các câu ví dụ RIÊNG của chính nó (không dùng chung ví dụ với đề mục khác). Mỗi đề mục là một phần tử trong mảng này, ĐÚNG THEO THỨ TỰ xuất hiện trong sách. Nếu điểm ngữ pháp có các mục con đánh chữ cái (subPoints) thì để mảng này rỗng (nội dung nằm trong sections riêng của từng mục con, không lặp lại ở đây).',
            items: {
              type: 'object',
              properties: {
                order: { type: 'integer', description: 'Thứ tự của đề mục, theo đúng thứ tự xuất hiện trong sách, bắt đầu từ 1.' },
                label: {
                  type: 'string',
                  description:
                    'Nhãn của đề mục, lấy NGUYÊN VĂN như sách ghi (ví dụ "Chức năng", "Cấu trúc", "Khẳng định", "Phủ định", "Câu hỏi", "Thông thường", "Sử dụng", "Cách dùng"...) - không dịch, không đổi tên, không tự tóm gọn.',
                },
                content: {
                  type: 'string',
                  nullable: true,
                  description: 'Nội dung giải thích của riêng đề mục này (KHÔNG bao gồm các câu ví dụ, vốn nằm ở "examples"), null nếu đề mục này không có phần giải thích riêng ngoài các ví dụ. Nếu nội dung được sách đánh số thành nhiều ý (1. 2. 3...), giữ nguyên số thứ tự và xuống dòng (\\n\\n) rõ ràng giữa các ý, không nối thành một đoạn văn liền.',
                },
                examples: {
                  type: 'array',
                  description: 'Các câu ví dụ minh hoạ RIÊNG của đề mục này, đánh số theo đúng thứ tự trong sách. KHÔNG lẫn ví dụ của đề mục khác vào đây. Nếu đề mục này lại được chia thành các ý đánh số 1./2./3... (dùng "items" bên dưới), để mảng này rỗng - ví dụ của từng ý nằm trong "items" tương ứng, không lặp lại ở đây.',
                  items: {
                    type: 'object',
                    properties: {
                      order: { type: 'integer', description: 'Thứ tự của câu ví dụ, bắt đầu từ 1.' },
                      textZh: { type: 'string', description: 'Nội dung câu ví dụ bằng chữ Hán, lấy nguyên văn từ sách.' },
                      pinyin: { type: 'string', nullable: true, description: 'Pinyin của câu ví dụ nếu sách có ghi, null nếu không có.' },
                      translationVi: { type: 'string', nullable: true, description: 'Bản dịch tiếng Việt của câu ví dụ nếu sách có ghi, null nếu không có.' },
                    },
                    required: ['order', 'textZh'],
                  },
                },
                items: {
                  type: 'array',
                  description:
                    'DÙNG KHI đề mục này (thường là "Cấu trúc" hoặc "Cách dùng") tự nó được sách đánh số thành nhiều ý nhỏ (1. 2. 3...) và MỖI ý có các câu ví dụ minh hoạ RIÊNG đi ngay sau nó (không dùng chung ví dụ với ý khác). Mỗi ý đánh số là một phần tử trong mảng này, với "label" là số thứ tự (ví dụ "1", "2"), "content" là nội dung giải thích của riêng ý đó, "examples" là ví dụ riêng của ý đó. Nếu đề mục KHÔNG có ý nào đánh số kèm ví dụ riêng (trường hợp phổ biến nhất - toàn bộ nội dung số hoá chỉ là văn bản giải thích không kèm ví dụ riêng từng ý), để mảng này rỗng và giữ nguyên nội dung trong "content"/"examples" ở cấp đề mục cha như bình thường.',
                  items: {
                    type: 'object',
                    properties: {
                      order: { type: 'integer', description: 'Thứ tự của ý, theo đúng số thứ tự sách ghi, bắt đầu từ 1.' },
                      label: { type: 'string', description: 'Số thứ tự của ý, lấy nguyên văn như sách ghi (ví dụ "1", "2", "3").' },
                      content: {
                        type: 'string',
                        nullable: true,
                        description: 'Nội dung giải thích của riêng ý này (không bao gồm ví dụ), null nếu không có.',
                      },
                      examples: {
                        type: 'array',
                        description: 'Các câu ví dụ minh hoạ RIÊNG của ý này, đánh số theo đúng thứ tự trong sách.',
                        items: {
                          type: 'object',
                          properties: {
                            order: { type: 'integer', description: 'Thứ tự của câu ví dụ, bắt đầu từ 1.' },
                            textZh: { type: 'string', description: 'Nội dung câu ví dụ bằng chữ Hán, lấy nguyên văn từ sách.' },
                            pinyin: { type: 'string', nullable: true, description: 'Pinyin của câu ví dụ nếu sách có ghi, null nếu không có.' },
                            translationVi: { type: 'string', nullable: true, description: 'Bản dịch tiếng Việt của câu ví dụ nếu sách có ghi, null nếu không có.' },
                          },
                          required: ['order', 'textZh'],
                        },
                      },
                    },
                    required: ['order', 'label', 'examples'],
                  },
                },
              },
              required: ['order', 'label', 'examples'],
            },
          },
          subPoints: {
            type: 'array',
            description:
              'Dùng khi điểm ngữ pháp này có tiêu đề đánh số La Mã (I, II, III...) và bên dưới có các đề mục con đánh chữ cái (A, B, C...), MỖI đề mục con có phần giải thích/cấu trúc và ví dụ RIÊNG của nó. Mỗi đề mục con là một phần tử trong mảng này, KHÔNG gộp vào sections ở cấp cha. Nếu điểm ngữ pháp không có cấu trúc 2 cấp như vậy thì để mảng này rỗng.',
            items: {
              type: 'object',
              properties: {
                order: { type: 'integer', description: 'Thứ tự của đề mục con trong điểm ngữ pháp, bắt đầu từ 1.' },
                label: { type: 'string', description: 'Nhãn chữ cái của đề mục con, lấy nguyên văn từ sách (ví dụ "A", "B").' },
                titleVi: { type: 'string', nullable: true, description: 'Tiêu đề đề mục con bằng tiếng Việt nếu có, null nếu không có.' },
                sections: {
                  type: 'array',
                  description:
                    'Các đề mục có nhãn riêng (Chức năng/Cấu trúc/Khẳng định/Phủ định/Câu hỏi/Cách dùng...) THUỘC RIÊNG đề mục con này, mỗi đề mục có nội dung và ví dụ riêng, ĐÚNG THEO THỨ TỰ xuất hiện trong sách. Cùng cấu trúc như "sections" ở cấp điểm ngữ pháp cha.',
                  items: {
                    type: 'object',
                    properties: {
                      order: { type: 'integer', description: 'Thứ tự của đề mục, theo đúng thứ tự xuất hiện trong sách, bắt đầu từ 1.' },
                      label: {
                        type: 'string',
                        description:
                          'Nhãn của đề mục, lấy NGUYÊN VĂN như sách ghi - không dịch, không đổi tên, không tự tóm gọn.',
                      },
                      content: {
                        type: 'string',
                        nullable: true,
                        description: 'Nội dung giải thích của riêng đề mục này (không bao gồm ví dụ), null nếu không có.',
                      },
                      examples: {
                        type: 'array',
                        description: 'Các câu ví dụ minh hoạ RIÊNG của đề mục này, đánh số theo đúng thứ tự trong sách. Nếu đề mục này được chia thành các ý đánh số 1./2./3... (dùng "items" bên dưới), để mảng này rỗng.',
                        items: {
                          type: 'object',
                          properties: {
                            order: { type: 'integer', description: 'Thứ tự của câu ví dụ, bắt đầu từ 1.' },
                            textZh: { type: 'string', description: 'Nội dung câu ví dụ bằng chữ Hán, lấy nguyên văn từ sách.' },
                            pinyin: { type: 'string', nullable: true, description: 'Pinyin của câu ví dụ nếu sách có ghi, null nếu không có.' },
                            translationVi: { type: 'string', nullable: true, description: 'Bản dịch tiếng Việt của câu ví dụ nếu sách có ghi, null nếu không có.' },
                          },
                          required: ['order', 'textZh'],
                        },
                      },
                      items: {
                        type: 'array',
                        description:
                          'DÙNG KHI đề mục này tự nó được sách đánh số thành nhiều ý nhỏ (1. 2. 3...) và MỖI ý có ví dụ minh hoạ RIÊNG đi ngay sau nó. Cùng cấu trúc như "items" ở cấp sections của điểm ngữ pháp cha. Để mảng này rỗng nếu đề mục không có ý đánh số kèm ví dụ riêng.',
                        items: {
                          type: 'object',
                          properties: {
                            order: { type: 'integer', description: 'Thứ tự của ý, theo đúng số thứ tự sách ghi, bắt đầu từ 1.' },
                            label: { type: 'string', description: 'Số thứ tự của ý, lấy nguyên văn như sách ghi (ví dụ "1", "2", "3").' },
                            content: {
                              type: 'string',
                              nullable: true,
                              description: 'Nội dung giải thích của riêng ý này (không bao gồm ví dụ), null nếu không có.',
                            },
                            examples: {
                              type: 'array',
                              description: 'Các câu ví dụ minh hoạ RIÊNG của ý này, đánh số theo đúng thứ tự trong sách.',
                              items: {
                                type: 'object',
                                properties: {
                                  order: { type: 'integer', description: 'Thứ tự của câu ví dụ, bắt đầu từ 1.' },
                                  textZh: { type: 'string', description: 'Nội dung câu ví dụ bằng chữ Hán, lấy nguyên văn từ sách.' },
                                  pinyin: { type: 'string', nullable: true, description: 'Pinyin của câu ví dụ nếu sách có ghi, null nếu không có.' },
                                  translationVi: { type: 'string', nullable: true, description: 'Bản dịch tiếng Việt của câu ví dụ nếu sách có ghi, null nếu không có.' },
                                },
                                required: ['order', 'textZh'],
                              },
                            },
                          },
                          required: ['order', 'label', 'examples'],
                        },
                      },
                    },
                    required: ['order', 'label', 'examples'],
                  },
                },
              },
              required: ['order', 'label', 'sections'],
            },
          },
        },
        required: ['order', 'sections'],
      },
    },
  },
  required: ['lesson', 'dialogues', 'grammarPoints'],
} as const
