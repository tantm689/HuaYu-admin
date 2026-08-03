import { GoogleGenAI } from '@google/genai'
import { ExtractionResultSchema, GEMINI_RESPONSE_SCHEMA, type ExtractionResult } from './schema'

const EXTRACTION_PROMPT = `Bạn là công cụ trích xuất nội dung sách giáo trình tiếng Trung "Đương Đại" từ ảnh PDF các trang của một bài học.

QUAN TRỌNG về chữ phồn thể/giản thể: đây là giáo trình học chữ Hán PHỒN THỂ (繁體字). CHỈ trích xuất chữ Hán ở bản PHỒN THỂ (bản chính của bài khoá/hội thoại/đoạn văn/từ vựng/ngữ pháp). Một số bài có in thêm khối "課文簡體字版/Bài khóa tiếng Trung giản thể" (bản GIẢN THỂ - 簡體字) của CÙNG nội dung ngay sau bản phồn thể, để đối chiếu — TUYỆT ĐỐI KHÔNG lấy chữ Hán từ khối giản thể này, dù nó nằm liền kề hoặc trông giống hệt bản phồn thể. Nếu gặp khối có nhãn "簡體" hoặc "giản thể", bỏ qua hoàn toàn khối đó và tiếp tục dùng đúng bản phồn thể phía trên nó.

QUAN TRỌNG về việc chép chính xác từng chữ: mọi trường chữ Hán ("textZh", "wordZh", "speakerZh", "titleZh"...) PHẢI là chữ Hán 100% chép nguyên văn từng chữ một từ ảnh trang sách — TUYỆT ĐỐI KHÔNG được lẫn bất kỳ chữ cái Latin/tiếng Anh/tiếng Việt nào vào giữa câu chữ Hán (ví dụ không được viết "所以 she 越來越喜歡" - phải là "所以她越來越喜歡"), và TUYỆT ĐỐI KHÔNG tự ý dịch, đổi, hay thay thế bất kỳ từ nào trong câu chữ Hán sang ngôn ngữ khác. Sau khi trích xuất xong mỗi câu chữ Hán, tự kiểm tra lại xem có chữ cái Latin nào lẫn vào không trước khi trả kết quả.

Chỉ trích xuất đúng 3 phần sau, bỏ qua mọi nội dung khác:
1. "dialogues": TOÀN BỘ các đoạn bài khoá trong bài, giữ đúng thứ tự xuất hiện. Sách có 2 dạng bài khoá khác nhau, PHẢI xác định đúng "kind" cho từng đoạn dựa vào nhãn tiêu đề in trên trang:
   - "會話/Hội thoại" → "kind": "dialogue". Nhiều người nói qua lại, mỗi dòng thoại giữ nguyên người nói, chữ Hán, pinyin, và mã audio track nếu có (ví dụ "01-1") ở cấp độ đoạn hội thoại.
   - "短文/Đoạn văn" → "kind": "passage". Đây là một đoạn văn tường thuật liền mạch, KHÔNG chia người nói. PHẢI tách đoạn văn này thành từng CÂU riêng theo đúng thứ tự xuất hiện (mỗi câu hoàn chỉnh kết thúc bằng dấu câu là một phần tử "lines"), để "speakerZh"/"speakerPinyin" là null cho mọi câu — TUYỆT ĐỐI KHÔNG tự bịa người nói cho đoạn văn.
   Nếu bài chỉ có dạng hội thoại (trường hợp phổ biến ở các quyển đầu) thì mọi phần tử đều có "kind": "dialogue" như trước.
2. "dialogues[].vocabulary": sách chia từ mới (生詞) RIÊNG cho từng đoạn bài khoá (ví dụ "Từ mới I" đi ngay sau "Hội thoại I", "Từ mới II" đi ngay sau "Đoạn văn"). Với mỗi đoạn bài khoá, chỉ lấy đúng bảng từ mới đi kèm NGAY SAU đoạn đó, đặt vào "vocabulary" của đúng phần tử "dialogues" tương ứng — TUYỆT ĐỐI KHÔNG gộp từ vựng của các đoạn khác nhau vào cùng một chỗ, và KHÔNG lấy từ xuất hiện rải rác trong ngữ pháp hay bài tập nếu chúng không nằm trong một bảng Từ mới chính thức. Với MỖI từ vựng, BẮT BUỘC phải trích xuất đầy đủ "meaningVi" (nghĩa tiếng Việt, lấy nguyên văn từ cột nghĩa trong bảng). TUYỆT ĐỐI KHÔNG được để "meaningVi" là null nếu sách có ghi nghĩa cho từ đó.
   QUAN TRỌNG về cột "pinyin" của từ vựng: bảng từ mới trong sách thường có NHIỀU CỘT cho mỗi từ - chữ Hán, pinyin, từ loại viết tắt trong ngoặc (ví dụ "(N)", "(V)", "(Vaux)", "(Vs)", "(Adv)", "(Vi)"...), và nghĩa tiếng Việt. Trường "pinyin" CHỈ được chứa ĐÚNG phần phiên âm La-tinh có dấu thanh điệu (ví dụ "diànshì") — TUYỆT ĐỐI KHÔNG được nối thêm từ loại viết tắt hay bất kỳ phần nghĩa tiếng Việt nào vào "pinyin" (ví dụ KHÔNG được viết "diànshì (N) tivi" — phải tách "pinyin" là "diànshì" và "meaningVi" là "ti vi"). Cột từ loại viết tắt trong ngoặc KHÔNG cần trích xuất và có thể bỏ qua hoàn toàn - không lưu vào bất kỳ trường nào.
3. "grammarMarkdown": toàn bộ phần ngữ pháp của bài dưới dạng MỘT chuỗi Markdown DUY NHẤT. TUYỆT ĐỐI KHÔNG trích xuất phần luyện tập/bài tập hỏi-đáp (練習/Luyện tập) của ngữ pháp.
   QUAN TRỌNG về cấu trúc heading: mỗi điểm ngữ pháp lớn trong sách là một dòng "## Ngữ pháp N: <tiêu đề tiếng Việt>" (N bắt đầu từ 1, theo đúng thứ tự xuất hiện). Nếu điểm ngữ pháp có tiêu đề đánh số La Mã (I, II, III...) với các đề mục con đánh chữ cái (A, B, C...) bên dưới, MỖI đề mục con là một dòng "### <chữ cái>. <tiêu đề đề mục con>" (ví dụ "### A. Câu hỏi với A 不 A") ngay dưới heading "##" của điểm ngữ pháp cha - TUYỆT ĐỐI KHÔNG tách mỗi đề mục con thành một heading "##" riêng.
   QUAN TRỌNG về nhãn đề mục giải thích (Chức năng/Cấu trúc/...): sách chia phần giải thích của MỖI điểm ngữ pháp (hoặc đề mục con) thành nhiều đề mục có NHÃN KHÔNG CỐ ĐỊNH tuỳ bài/tuỳ quyển (ví dụ "Chức năng", "Cấu trúc", "Khẳng định", "Phủ định", "Câu hỏi", "Thông thường", "Sử dụng", "Cách dùng"...). Mỗi nhãn này PHẢI là một dòng in đậm viết HOA TOÀN BỘ (ví dụ "**CHỨC NĂNG**"), lấy nguyên văn nhãn sách ghi rồi viết hoa - không dịch, không đổi tên, không tự tóm gọn, và KHÔNG dùng cú pháp heading ("#") cho các nhãn này (chỉ "##"/"###" mới dùng cho điểm ngữ pháp/đề mục con). Ngay sau dòng nhãn in đậm là đoạn văn giải thích của riêng đề mục đó (nếu sách có).
   QUAN TRỌNG về câu ví dụ: mỗi câu ví dụ minh hoạ là một khối 3 dòng liên tiếp, KHÔNG có tiền tố bullet hay số thứ tự đứng trước: dòng 1 là câu chữ Hán nguyên văn, dòng 2 là pinyin viết NGHIÊNG bằng cú pháp Markdown ("*pinyin ở đây*"), dòng 3 là bản dịch tiếng Việt. Giữa MỖI câu ví dụ và câu ví dụ kế tiếp, để đúng MỘT dòng trắng. Câu ví dụ minh hoạ cách dùng SAI (đánh dấu "*" ở đầu câu trong sách, dùng để chỉ lỗi cần tránh) vẫn viết bình thường vào đúng vị trí ví dụ như các câu khác, PHẢI giữ nguyên dấu "*" ở đầu dòng chữ Hán của nó (không nhầm với cú pháp in nghiêng Markdown - dấu "*" đứng riêng ở đầu dòng chữ Hán, không bọc quanh chữ).
   QUAN TRỌNG về đề mục tự chia thành nhiều ý đánh số (1. 2. 3...), ĐẶC BIỆT LÀ đề mục "Cách dùng": nếu đề mục có TỪ 2 Ý ĐÁNH SỐ TRỞ LÊN theo kiểu "1. ... 2. ..." (khác với "(1)(2)" là số thứ tự ví dụ bên trong một ý), dùng danh sách có số Markdown ("1. <nội dung ý 1>", xuống dòng, "2. <nội dung ý 2>"...) ngay dưới dòng nhãn in đậm của đề mục đó. Mỗi mục trong danh sách chứa cả đoạn giải thích của riêng ý đó LẪN các khối ví dụ 3-dòng riêng của ý đó (nếu ý đó không có ví dụ, chỉ có đoạn giải thích). TUYỆT ĐỐI KHÔNG gộp ví dụ của các ý đánh số khác nhau vào chung một chỗ.
   QUAN TRỌNG về bảng dữ liệu tham khảo (KHÁC với câu ví dụ đánh số - đây là bảng liệt kê từ vựng/công thức/danh mục, ví dụ bảng từ chỉ vị trí kèm hậu tố 面/邊, hoặc bảng địa danh theo nhóm): TUYỆT ĐỐI KHÔNG BỎ QUA loại bảng này - viết lại TOÀN BỘ nội dung bảng thành danh sách gạch đầu dòng Markdown ("- <mục 1>", "- <mục 2>"...) ngay trong đoạn giải thích của đề mục/ý chứa bảng đó, giữ đúng cặp chữ Hán - nghĩa/phiên âm đi kèm trong bảng gốc.
   QUAN TRỌNG về nội dung bị ngắt qua trang: một điểm ngữ pháp (đặc biệt đề mục cuối cùng như "Cách dùng"/"Sử dụng") có thể bị TRÀN SANG TRANG SAU, kể cả khi trang sau đó bắt đầu bằng ảnh bìa/tiêu đề của một bài học KHÁC chen giữa. PHẢI đọc lướt qua TẤT CẢ các trang được cung cấp, kể cả sau một ảnh bìa xen giữa, để tìm phần nội dung tiếp nối của điểm ngữ pháp đang dở trước khi coi là đã hết.
   QUAN TRỌNG về bảng ví dụ nhiều cột: mỗi số thứ tự (①②③ hoặc 1,2,3) trong bảng ví dụ có thể đi kèm NHIỀU CÂU trên cùng một hàng (ví dụ 1 cột câu khẳng định + 1 cột câu nghi vấn tương ứng). MỖI CÂU trong hàng đó - dù chung một số thứ tự - PHẢI là một khối 3-dòng ví dụ RIÊNG BIỆT, không nối/gộp nhiều câu khác nhau vào chung một khối.

Trả về đúng theo JSON schema đã cung cấp, không thêm giải thích ngoài JSON.`

export async function extractLessonFromPdf(
  pdfBytes: Uint8Array,
  lessonNo: number
): Promise<ExtractionResult> {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

  const response = await client.models.generateContent({
    model: 'gemini-3.6-flash',
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
