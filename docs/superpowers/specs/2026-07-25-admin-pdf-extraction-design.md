# Admin Content Management App — Design Spec

Date: 2026-07-25
Status: Approved by user (2026-07-25)

## Context

Người dùng đang học tiếng Trung phồn thể theo giáo trình "Đương Đại" (當代中文課程) để chuẩn bị du học Đài Loan, đã học nội dung qua sách PDF rồi. Mục tiêu là xây 2 repo:

1. **Repo Admin** (spec này) — cho phép admin (chỉ 1 người dùng) upload PDF sách, hệ thống tự động trích xuất nội dung bài học bằng AI, admin xem/sửa lại rồi import vào database dùng chung.
2. **Repo User** (spec riêng, làm sau) — app **ôn tập lại** (không phải học mới): flashcard, tập viết lại câu, shadowing... dựa trên bài khoá/từ vựng/ngữ pháp đã import, đọc dữ liệu từ cùng database.

Vì repo User chỉ dùng để ôn tập (người dùng đã học nội dung trong PDF trước đó rồi), phạm vi dữ liệu cần extract được thu hẹp lại — xem phần "Phạm vi trích xuất nội dung" bên dưới.

Đây cũng là project intern nộp trường của người dùng.

### PDF thực tế đã khảo sát

File mẫu: `Giáo trình tiếng Trung đương đại SGK 1.pdf`, 409 trang, **toàn bộ là ảnh scan** (không có text layer — mỗi trang chỉ chứa 1 ảnh nhúng). Việc trích xuất bắt buộc phải qua AI/Vision, không thể parse text thuần.

Cấu trúc nội dung quan sát được trong sách:
- **Trang bìa bài học**: số bài (BÀI n), tiêu đề chữ Hán + tiêu đề Việt, chủ đề, mục tiêu học tập (danh sách).
- **Hội thoại (對話)**: có thể có nhiều hội thoại/bài (Hội thoại I, II...), mỗi hội thoại gồm nhiều dòng thoại: tên người nói (Hán + pinyin), câu thoại chữ Hán, pinyin, kèm mã audio track (VD "01-1") và hình minh hoạ.
- **Từ vựng (生詞)**: bảng có STT, chữ Hán, pinyin, chú âm (zhuyin/bopomofo), nghĩa tiếng Việt; chia nhóm theo loại từ (Danh từ, Cụm từ, Tên riêng...).
- **Ngữ pháp (文法)**: mỗi điểm ngữ pháp có tiêu đề, phần "Cấu trúc" giải thích, các ví dụ đánh số (Hán + pinyin + Việt), phần luyện tập dạng hỏi-đáp, kèm mã audio track.

## Quyết định hạ tầng

- **Stack**: Next.js + TypeScript (full-stack, dùng API routes/Server Actions).
- **Database + Storage + Auth**: Supabase (Postgres free tier + Storage cho file PDF + Auth cho đăng nhập admin).
- **AI extraction**: Gemini API, model **`gemini-3.5-flash-lite`** — chọn vì free tier có RPM/RPD cao hơn hẳn Gemini 2.5 Flash (15 RPM / 500 RPD so với 5 RPM / 20 RPD), phù hợp sinh viên không có ngân sách.
- **Admin**: chỉ 1 tài khoản admin duy nhất (chính người dùng) — không cần hệ thống role/phân quyền.
- **Audio**: tích hợp trong phạm vi lần này, chỉ cho **bài khoá** và **từ vựng** (ngữ pháp không cần audio):
  - **Bài khoá**: admin đã có sẵn file mp3 gốc của sách (đặt tên theo mã track, vd `01-1.mp3`) → chỉ cần upload lên, hệ thống khớp theo `audio_code` với `dialogues`, không cần AI xử lý.
  - **Từ vựng**: không có sẵn audio gốc → hệ thống tự động generate bằng **edge-tts** (giọng đọc Microsoft Edge TTS, miễn phí) khi import, lưu vào Supabase Storage.

## Phạm vi trích xuất nội dung

Chỉ extract 3 phần, phục vụ đúng nhu cầu ôn tập (flashcard, viết lại câu, shadowing) — không lấy phần bài tập:

- **Bài khoá (hội thoại)**: toàn bộ dòng thoại (Hán, pinyin, người nói, dịch Việt).
- **Từ vựng**: **chỉ** lấy từ trong phần Từ vựng (生詞) chính thức của bài — không lấy thêm từ xuất hiện rải rác ở phần hội thoại/ngữ pháp/bài tập khác.
- **Ngữ pháp**: chỉ lấy tiêu đề điểm ngữ pháp, phần giải thích cấu trúc, và các ví dụ minh hoạ. **Bỏ hoàn toàn phần luyện tập/bài tập hỏi-đáp** của ngữ pháp — không extract, không lưu.

## Kiến trúc trích xuất nội dung

Đã đánh giá 3 hướng, chọn hướng A:

- **A (chọn)**: Admin chọn khoảng trang PDF cho từng bài → backend dùng `pdf-lib` cắt ra file PDF con chỉ chứa các trang đó → gửi thẳng file PDF (không convert ảnh) cho Gemini 3.5 Flash Lite kèm prompt + JSON schema mong muốn → nhận JSON có cấu trúc.
- B (dự phòng): Nếu A đọc sai bảng/chú âm nhỏ quá nhiều, chuyển sang render từng trang thành ảnh PNG (PyMuPDF/pdfjs) trước khi gửi Gemini Vision — kiến trúc tổng thể không đổi, chỉ thay bước tạo input cho Gemini.
- C: Nhập tay hoàn toàn — chỉ dùng làm fallback thủ công khi cần sửa gấp, không phải luồng chính.

## Data model (Postgres/Supabase)

```
books             (id, title, volume, created_at)  -- không còn pdf_path, không lưu bản gốc
lessons           (id, book_id, lesson_no, title_zh, title_vi, theme,
                    objectives text[], status: draft|reviewed|published)
dialogues         (id, lesson_id, order, title_zh, title_vi, audio_code, audio_url)
dialogue_lines    (id, dialogue_id, order, speaker_zh, speaker_pinyin,
                    text_zh, pinyin, translation_vi)
vocabulary        (id, lesson_id, order, category, word_zh, pinyin,
                    zhuyin, meaning_vi, audio_url)
grammar_points    (id, lesson_id, order, title_zh, title_vi, structure_note)
grammar_examples  (id, grammar_point_id, order, text_zh, pinyin, translation_vi)
extraction_jobs   (id, book_id, page_start, page_end, sliced_pdf_path,
                    status: pending|reviewed|imported|failed,
                    raw_json jsonb, error_message, created_at)
```

`lessons.status` cho phép admin làm việc ở chế độ nháp (`draft`) trước khi cho repo User đọc được (`published`).

## Luồng xử lý

> **Lưu ý hạ tầng (cập nhật 2026-07-25):** Supabase free tier giới hạn cứng 50MB/file, không nâng được. File sách gốc (vd 339MB) không thể upload nguyên cuốn lên Storage. Vì vậy **không lưu bản PDF gốc của cả cuốn sách lên Supabase** — chỉ cắt trang phía client và lưu file PDF nhỏ (đã cắt) cho từng bài học.

1. **Tạo book**: Admin chỉ nhập metadata (title, volume) — không upload file PDF ở bước này. `books` không còn cột `pdf_path`.
2. **Tạo extraction job**: Admin chọn file PDF gốc **từ máy tính** (input file, không upload lên server) ở màn "Tạo bài học mới". Trình duyệt dùng `pdfjs-dist` đọc trực tiếp file local để hiển thị thumbnail từng trang, admin chọn khoảng trang (vd 27-45) + nhập `lesson_no`. Khi xác nhận, trình duyệt dùng `pdf-lib` (chạy được trong browser) **cắt ngay tại chỗ** đúng khoảng trang đó thành 1 file PDF nhỏ, rồi upload file nhỏ này (không phải bản gốc) lên Supabase Storage, lưu đường dẫn vào `extraction_jobs.sliced_pdf_path` → tạo `extraction_jobs` với `status = pending`.
3. **Extract**: Server action tải file PDF nhỏ đã cắt (từ `sliced_pdf_path`) → gửi thẳng cho Gemini 3.5 Flash Lite (structured output/responseSchema JSON) với prompt mô tả rõ phạm vi cần lấy (lesson, dialogues, vocabulary **chỉ từ mục Từ vựng chính thức**, grammar **chỉ phần giải thích + ví dụ, không lấy bài tập**) → validate bằng Zod → lưu `raw_json`. Không còn bước cắt PDF phía server nữa (đã cắt ở bước 2).
4. **Review UI**: 2 cột — trái là ảnh các trang từ chính file PDF nhỏ đã cắt của job đó (render bằng `pdfjs-dist`, không cần tải lại từ bản gốc), phải là form editable hiển thị dữ liệu đã extract; admin sửa trực tiếp nếu AI đọc sai. Nút "Thử lại" dùng lại `sliced_pdf_path` đã lưu, không cần chọn lại file.
5. **Import**: Admin bấm "Import vào DB" → transaction ghi vào `lessons`/`dialogues`/`vocabulary`/`grammar_points`/... → với mỗi từ vựng, gọi edge-tts sinh audio và upload lên Supabase Storage, lưu `vocabulary.audio_url` (chạy song song/hàng đợi, không chặn UI import) → `extraction_jobs.status = imported`, bài học tạo ở `status = draft`.
6. **Gắn audio bài khoá**: Admin bulk-upload các file mp3 gốc (đặt tên theo mã track, vd `01-1.mp3`) vào 1 khu vực riêng → hệ thống tự khớp tên file với `dialogues.audio_code`, lưu `audio_url`; file không khớp mã nào thì báo cho admin biết để đổi tên/bỏ qua.
7. **Publish**: Admin duyệt lại trong danh sách bài học, chuyển `draft → published` khi sẵn sàng cho repo User đọc.

## Error handling

- Gemini timeout/lỗi hoặc response không parse được JSON → `extraction_jobs.status = failed` + lưu `error_message`; admin có nút "Thử lại" (re-run cùng khoảng trang, có thể chỉnh prompt).
- Response thiếu field theo schema (Zod validate fail phần nào) → không fail toàn bộ job, để field trống và đánh dấu cho admin tự điền trong review UI.
- Trùng `lesson_no` khi import vào 1 book → cảnh báo cho admin, chọn ghi đè hoặc huỷ import.
- edge-tts gen audio lỗi/timeout cho 1 từ vựng → không chặn import cả bài, để `audio_url = null`, đánh dấu để admin bấm "gen lại" riêng cho từ đó sau.
- File mp3 bulk-upload không khớp `audio_code` nào (sai tên/thiếu bài tương ứng) → liệt kê danh sách file lỗi cho admin, không tự ý bỏ qua âm thầm.

## Testing

- Unit test cho hàm cắt PDF bằng `pdf-lib`, cho Zod schema validate response Gemini, và cho hàm khớp filename mp3 ↔ `audio_code`.
- Test thủ công end-to-end với 2-3 bài thật lấy từ file PDF mẫu đã khảo sát, trước khi coi pipeline là ổn định.
- Không cần (và không thể) test tự động chất lượng OCR/AI — review UI cho sửa tay là lớp an toàn chính.

## Ngoài phạm vi (out of scope)

- Bài tập/luyện tập hỏi-đáp của phần ngữ pháp — không extract, không lưu.
- Từ vựng nằm rải rác ngoài mục Từ vựng chính thức của bài (vd xuất hiện trong hội thoại nhưng không có trong bảng từ vựng) — không lấy.
- Đa admin / phân quyền role.
- Repo User (app ôn tập: flashcard, viết lại câu, shadowing...) — sẽ là spec riêng, dùng chung database này.
