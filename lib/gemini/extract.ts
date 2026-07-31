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
3. "grammarPoints": mỗi điểm ngữ pháp gồm tiêu đề và các đề mục giải thích ("sections"), mỗi đề mục có ví dụ minh hoạ đánh số RIÊNG của chính nó. TUYỆT ĐỐI KHÔNG trích xuất phần luyện tập/bài tập hỏi-đáp (練習/Luyện tập) của ngữ pháp.
   QUAN TRỌNG về "sections": sách chia phần giải thích của MỖI điểm ngữ pháp thành nhiều đề mục với NHÃN KHÔNG CỐ ĐỊNH tuỳ bài/tuỳ quyển (ví dụ "Chức năng", "Cấu trúc", "Khẳng định", "Phủ định", "Câu hỏi", "Thông thường", "Sử dụng", "Cách dùng"...), và MỖI đề mục có các câu ví dụ đánh số RIÊNG của chính nó (không dùng chung ví dụ với đề mục khác trong cùng điểm ngữ pháp) — TUYỆT ĐỐI KHÔNG gộp ví dụ của các đề mục khác nhau vào chung một chỗ. Mỗi đề mục là một phần tử trong mảng "sections", với "label" giữ NGUYÊN VĂN nhãn sách ghi (không dịch, không đổi tên, không tự tóm gọn), "content" là phần giải thích của riêng đề mục đó, và "examples" là ví dụ riêng của đề mục đó. PHẢI giữ ĐÚNG THEO THỨ TỰ các đề mục xuất hiện trong sách (không đảo thứ tự).
   QUAN TRỌNG về đề mục tự chia thành nhiều ý đánh số (1. 2. 3...), ĐẶC BIỆT LÀ đề mục "Cách dùng": đây là lỗi rất hay gặp — PHẢI làm theo đúng quy tắc sau, KHÔNG suy luận thêm.
   Đếm xem đề mục này có bao nhiêu ý đánh số kiểu "1. ... 2. ... " (số có dấu chấm, đứng đầu dòng, là ý giải thích — KHÁC với "(1)(2)" là số thứ tự ví dụ bên trong một ý).
   NẾU đề mục có TỪ 2 Ý ĐÁNH SỐ TRỞ LÊN: LUÔN LUÔN tách "items" — BẤT KỂ ý nào trong số đó CÓ hay KHÔNG CÓ ví dụ riêng đi kèm (không được coi "không có ví dụ ở ý này" là dấu hiệu để gộp chung với ý khác). PHẢI tách mỗi ý đánh số thành MỘT phần tử trong mảng "items" của đề mục đó, với "label" là số thứ tự ý (ví dụ "1", "2"), "content" là nội dung giải thích riêng của ý đó, và "examples" CHỈ gồm đúng các câu ví dụ đánh số (1)(2)(3)... nằm ngay trong đoạn của ý đó (nếu ý đó không có câu ví dụ nào theo sau trước khi ý tiếp theo bắt đầu, để "examples" là mảng RỖNG cho ý đó — TUYỆT ĐỐI KHÔNG mượn ví dụ của ý khác để lấp vào). Để trống "content" và "examples" ở cấp đề mục cha khi đã dùng "items". TUYỆT ĐỐI KHÔNG gộp ví dụ của các ý đánh số khác nhau thành một mảng "examples" duy nhất ở cấp đề mục cha, kể cả khi chỉ một ý có ví dụ còn ý kia không có.
   - CHỈ khi đề mục KHÔNG có ý đánh số nào kiểu "1. 2." (toàn bộ đề mục chỉ là một đoạn giải thích liền mạch không chia ý): giữ "content" là đoạn giải thích đó, "examples" ở cấp đề mục cha là các câu ví dụ đánh số (1)(2)(3) của đề mục, và để mảng "items" rỗng.
   QUAN TRỌNG về câu ví dụ có dấu sao (*) ở đầu: câu ví dụ bắt đầu bằng dấu "*" (ví dụ "*大城市的馬路比鄉下的寬得很。") là câu MINH HOẠ CHO CÁCH DÙNG SAI/KHÔNG ĐÚNG NGỮ PHÁP — sách dùng nó để chỉ ra lỗi cần tránh, KHÔNG PHẢI câu mẫu đúng. PHẢI vẫn trích xuất các câu này bình thường vào đúng "examples" của đề mục/ý tương ứng (giữ nguyên dấu "*" ở đầu "textZh" để đánh dấu đây là câu sai), NHƯNG các câu này chỉ thuộc phần ví dụ minh hoạ ngữ pháp — TUYỆT ĐỐI KHÔNG đưa các câu có dấu "*" này vào bất kỳ phần luyện tập/bài tập nào (vốn đã bị loại bỏ theo quy tắc ở trên).
   QUAN TRỌNG về nội dung bị ngắt qua trang: một điểm ngữ pháp (đặc biệt đề mục cuối cùng như "Cách dùng"/"Sử dụng") có thể bị TRÀN SANG TRANG SAU, kể cả khi trang sau đó bắt đầu bằng ảnh bìa/tiêu đề của một bài học KHÁC chen giữa (ảnh bìa đó không thuộc bài đang trích xuất, chỉ là trang tiếp theo trong tệp PDF). PHẢI đọc lướt qua TẤT CẢ các trang được cung cấp, kể cả sau một ảnh bìa xen giữa, để tìm phần nội dung tiếp nối của điểm ngữ pháp đang dở trước khi coi là đã hết — TUYỆT ĐỐI KHÔNG dừng trích xuất một điểm ngữ pháp/đề mục con/đề mục chỉ vì trang hiện tại hết chữ hoặc trang sau có vẻ là bìa bài khác.
   QUAN TRỌNG về bảng ví dụ nhiều cột: mỗi số thứ tự (①②③ hoặc 1,2,3) trong bảng ví dụ có thể đi kèm NHIỀU CÂU trên cùng một hàng (ví dụ 1 cột câu khẳng định + 1 cột câu nghi vấn tương ứng, mỗi câu có chữ Hán/pinyin/dịch riêng của chính nó). MỖI CÂU trong hàng đó — dù chung một số thứ tự — PHẢI được tách thành MỘT phần tử "examples" RIÊNG BIỆT (KHÔNG được nối/gộp nhiều câu chữ Hán khác nhau vào chung một "textZh", và KHÔNG được nối nhiều pinyin/nhiều bản dịch khác nhau vào chung một "pinyin"/"translationVi"). Số thứ tự dùng chung không có nghĩa là chung một example.
   QUAN TRỌNG về việc không nhầm lẫn nội dung giữa các đề mục con: khi một điểm ngữ pháp có nhiều đề mục con (A, B, C...), MỖI đề mục con có tiêu đề, nội dung giải thích và ví dụ RIÊNG của chính nó, lấy CHÍNH XÁC từ đúng vị trí của đề mục con đó trong sách — TUYỆT ĐỐI KHÔNG lấy nhầm nội dung/ví dụ của đề mục con này gán cho đề mục con khác, và TUYỆT ĐỐI KHÔNG lặp lại/sao chép nội dung của một đề mục con vào đề mục con khác. Trước khi gán label/content/examples cho một subPoint, PHẢI xác định đúng nó nằm ở vị trí chữ cái nào (A, B...) trong sách và chỉ lấy đúng nội dung ngay dưới tiêu đề chữ cái đó cho đến trước tiêu đề chữ cái tiếp theo.
   QUAN TRỌNG về cấu trúc 2 cấp: nếu một mục ngữ pháp có tiêu đề đánh số La Mã (I, II, III...) và bên dưới nó có các đề mục con đánh chữ cái (A, B, C...) MỖI đề mục con có phần giải thích/cấu trúc và ví dụ RIÊNG của nó, thì:
   - Tiêu đề La Mã đó là titleVi của MỘT phần tử duy nhất trong "grammarPoints" — TUYỆT ĐỐI KHÔNG tách mỗi đề mục chữ cái con thành một điểm ngữ pháp riêng ở cấp "grammarPoints".
   - Mỗi đề mục con (A, B...) trở thành MỘT phần tử trong mảng "subPoints" của điểm ngữ pháp đó, với "label" là chữ cái (ví dụ "A"), cùng "sections" RIÊNG của đề mục con đó (áp dụng đúng quy tắc "sections" ở trên cho từng đề mục con).
   - TUYỆT ĐỐI KHÔNG gộp nội dung của các đề mục con vào "sections" ở cấp điểm ngữ pháp cha — để trống mảng đó khi đã dùng "subPoints".
   - Nếu một điểm ngữ pháp KHÔNG có đề mục con chữ cái nào (trường hợp phổ biến nhất), giữ nguyên như bình thường: nội dung nằm ở "sections" cấp cha, "subPoints" để mảng rỗng.

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
