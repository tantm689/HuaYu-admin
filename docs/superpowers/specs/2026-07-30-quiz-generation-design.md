# Thiết kế: Trang "Sinh & duyệt Quiz" (Scope 4)

Ngày: 2026-07-30
Trạng thái: đã chốt hướng thiết kế, CHƯA triển khai code.

Đây là spec chi tiết cho Scope 4 của `2026-07-28-full-product-design.md` (mục 4.5, 8, 10) — bước "Sinh & duyệt Quiz" trong pipeline extraction job, đứng sau bước Audio (Scope 3, đã xong) và trước Import.

## 1. Phạm vi

Trang Admin để sinh và duyệt Quiz cho 1 extraction job, theo đúng mẫu đã làm ở trang "Sinh & duyệt Audio":

- Route UI: `/books/[bookId]/jobs/[jobId]/quiz`
- Route API: `/api/jobs/[jobId]/quiz`
- Chuyển `extraction_jobs.status`: `audio_ready → quiz_ready` sau khi admin lưu quiz đã duyệt
- Import (`quiz_ready → imported`) ghi toàn bộ `quiz_questions` đã duyệt vào DB, không sinh gì thêm ở bước Import

Không đổi guard hiện tại cho phép import từ `audio_ready` trở lên (đã có từ Scope 2/3) — quiz là bước tuỳ chọn thêm, KHÔNG bắt buộc phải quiz_ready mới import được, vì Scope 4 này build sau khi guard đó đã tồn tại và người dùng chưa yêu cầu đổi lại thành bắt buộc.

## 2. 6 dạng câu hỏi (đợt 1, "dễ") — giữ nguyên theo spec gốc mục 4.5

1. **Chọn Pinyin↔Chữ Hán** (`pinyin_choice`) — trắc nghiệm 4 đáp án
2. **Nghe & chọn đáp án đúng** (`listening_choice`) — trắc nghiệm 4 đáp án, dùng `audio_url` đã sinh ở Scope 3
3. **Nhận biết thanh điệu** (`tone_choice`) — trắc nghiệm 4 đáp án (4 pinyin có dấu khác nhau)
4. **Ghép nghĩa/nối từ** (`matching`) — dạng nối cặp, không phải trắc nghiệm
5. **Điền từ vào chỗ trống** (`fill_blank`) — trắc nghiệm 4 đáp án
6. **Sắp xếp từ thành câu** (`sentence_order`) — chọn thứ tự đúng trong các từ đã xáo trộn

**Đợt 2 (4 dạng "khó": tìm lỗi sai, dịch câu, phân biệt từ gần nghĩa, chọn trợ từ/lượng từ) KHÔNG làm ở scope này** — giữ nguyên quyết định gốc.

## 3. Số lượng câu hỏi & cách chia phần

- Mỗi dạng: **5 câu cố định** mỗi bài học (không tuỳ chỉnh theo số từ vựng/ngữ pháp thực tế của bài)
- Tổng: 6 dạng × 5 câu = **30 câu/bài**
- Chia thành **2 phần** để học sinh không làm 1 lần quá tải:
  - **Phần 1** (15 câu): `pinyin_choice`, `listening_choice`, `tone_choice` — thiên về nhận biết từ vựng/phát âm
  - **Phần 2** (15 câu): `matching`, `fill_blank`, `sentence_order` — thiên về vận dụng câu/ngữ pháp

## 4. Schema `quiz_questions` (migration mới)

```sql
create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  part integer not null check (part in (1, 2)),
  type text not null check (type in (
    'pinyin_choice', 'listening_choice', 'tone_choice',
    'matching', 'fill_blank', 'sentence_order'
  )),
  "order" integer not null,
  payload jsonb not null
);
```

`part` xác định câu hỏi thuộc Phần 1 hay Phần 2 (khớp với nhóm 3 dạng ở mục 3). `order` là thứ tự hiển thị trong toàn bộ danh sách (không tách riêng theo dạng).

### Payload theo từng `type`

- **`pinyin_choice`**: `{ prompt: string, choices: string[4], correctIndex: number }` — `prompt` là chữ Hán hoặc pinyin tuỳ chiều Gemini chọn cho câu đó (hỏi pinyin của chữ, hoặc hỏi chữ ứng với pinyin)
- **`listening_choice`**: `{ audioUrl: string, choices: string[4], correctIndex: number }` — `audioUrl` lấy từ `vocabulary.audio_url` đã có sẵn từ Scope 3, không tự sinh audio mới ở bước này
- **`tone_choice`**: `{ wordZh: string, pinyinNoTone: string, choices: string[4], correctIndex: number }` — `choices` là 4 biến thể pinyin có dấu khác nhau của cùng âm không dấu
- **`matching`**: `{ pairs: { left: string, right: string }[5] }` — `left` là chữ Hán, `right` là nghĩa tiếng Việt; đây là 1 câu hỏi quiz duy nhất chứa sẵn 5 cặp để nối, không lấy thêm từ ngoài
- **`fill_blank`**: `{ sentence: string, choices: string[4], correctIndex: number }` — `sentence` chứa placeholder `___` đánh dấu chỗ trống cần điền
- **`sentence_order`**: `{ words: string[], correctOrder: number[] }` — `words` là các từ/cụm từ đã xáo trộn, `correctOrder` là hoán vị index đúng để ghép lại thành câu hoàn chỉnh

Việc dùng `payload jsonb` (thay vì cột riêng cho từng dạng) cho phép thêm dạng câu hỏi mới ở đợt 2 sau này mà không cần migration thêm cột.

## 5. Nguồn dữ liệu cho Gemini

Gemini sinh quiz dựa trên `raw_json` của job (đã ở trạng thái `audio_ready`, nghĩa là Bài khoá/Từ vựng/Ngữ pháp đã được admin duyệt xong ở bước `reviewed`, và audio từ vựng đã sinh xong ở bước Audio) — không dựa trên dữ liệu gốc PDF, đảm bảo quiz luôn khớp với nội dung admin đã chốt.

- `pinyin_choice`, `tone_choice`, `matching`: dựa trên `dialogues[].vocabulary[]` (word_zh, pinyin, meaning_vi)
- `listening_choice`: cũng dựa trên `vocabulary[]`, cần `audio_url` đã có (nếu vocab nào chưa có audio_url thì Gemini không được chọn từ đó cho dạng này)
- `fill_blank`, `sentence_order`: dựa trên câu ví dụ có sẵn — ưu tiên `dialogues[].lines[].text_zh` (câu bài khoá thật) và `grammarPoints[].sections[].examples[]`/`items[].examples[]` (câu ví dụ ngữ pháp), Gemini chọn câu phù hợp độ dài để tạo câu hỏi

## 6. Quy trình sinh & UI trang Admin

Theo đúng pattern đã dùng ở trang Audio (Scope 3):

- Khi vào trang, **không tự động sinh** — hiển thị nút "Sinh Quiz" để admin chủ động bấm
- Gemini được gọi **1 lần duy nhất** (không phải vòng lặp từng câu như TTS) — trả về đủ 30 câu hỏi (cả 2 phần) trong 1 response, dùng Zod schema mirror giống cách `ExtractionResultSchema` đang làm
- Sau khi sinh xong, hiển thị theo 2 khối rõ ràng: "Phần 1" và "Phần 2", mỗi khối liệt kê tuần tự các câu hỏi theo `order`, mỗi câu có nhãn nhỏ ghi tên dạng (vd "Chọn Pinyin", "Nghe & chọn đáp án") ngay phía trên nội dung câu hỏi — không chia tab theo dạng (đã cân nhắc, quyết định để chung 1 danh sách vì đọc câu hỏi là nhận biết được dạng ngay)
- Mỗi câu hỏi: đọc-là-mặc-định, bấm để sửa (`EditableText`/click-to-edit pattern đã dùng toàn hệ thống) — sửa được các field trong payload tuỳ dạng (prompt/sentence/choices/correctIndex/pairs/words/correctOrder)
- Có nút xoá câu hỏi (`BlockActions`, kèm delete-scope preview như các trang khác) và thêm câu hỏi mới cùng dạng
- **Sinh lại**: nếu admin bấm "Sinh Quiz" khi đã có quiz từ lần trước, hiện confirm cảnh báo sẽ xoá toàn bộ 30 câu hiện tại (kể cả đã sửa tay) và sinh lại từ đầu — không có chế độ merge/giữ một phần
- Nút "Lưu" ghi toàn bộ `quiz_questions` hiện tại (đã qua sửa tay nếu có) vào `raw_json` của job (theo cùng cơ chế lưu nháp trong job như Bài khoá/Từ vựng/Ngữ pháp — quiz cũng chỉ thực sự ghi vào bảng `quiz_questions` thật lúc Import, không ghi thẳng DB ở bước review) và chuyển status job sang `quiz_ready`

## 7. Trang đọc/sửa sau khi import

Ngoài phạm vi Scope 4 (ghi nhận để nhất quán, làm sau khi Import đã hỗ trợ quiz):

- Trang đọc bài học (`lessons/[lessonId]/page.tsx`): hiển thị Quiz dạng preview (chỉ xem câu hỏi + đáp án đúng, không tương tác) — theo quyết định đã chốt trong `project_full_design_roadmap` memory
- Trang Sửa bài học (`lessons/[lessonId]/edit/page.tsx`): thêm tab "Quiz" (theo quyết định 5 tab: Bài khoá/Từ vựng/Ngữ pháp/Audio/Quiz), cho sửa trực tiếp các câu quiz đã import

## 8. Việc CHƯA thiết kế (ngoài phạm vi spec này)

- UI thực tế học sinh làm quiz (App User, Scope 6) — bao gồm việc chấm điểm tương tác, không phải preview
- Đợt 2 của Quiz (4 dạng "khó")
- Chi tiết migration/cập nhật `getLessonFull`/`updateLessonFull`/`importJob` cho `quiz_questions` — để lúc viết implementation plan
