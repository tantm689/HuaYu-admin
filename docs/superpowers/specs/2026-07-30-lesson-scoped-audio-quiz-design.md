# Thiết kế: Chuyển Audio/Quiz từ pipeline job sang trang Lesson

Ngày: 2026-07-30
Trạng thái: đã chốt hướng thiết kế, CHƯA triển khai code.

## 1. Bối cảnh và lý do

Pipeline extraction job hiện tại: `pending → reviewed → audio_ready → quiz_ready → imported`. Admin phải đi qua 2 trang riêng (`/books/[bookId]/jobs/[jobId]/audio`, `/quiz`) trước khi được phép Import — quy trình dài, và cả 2 bước audio/quiz đang thao tác trên bản nháp `extraction_jobs.raw_json` (dùng id tạm sinh thủ công) thay vì dữ liệu thật trong DB.

Nhận xét cốt lõi: Audio và Quiz đều CHỈ phụ thuộc vào Bài khoá/Từ vựng/Ngữ pháp đã trích xuất — một khi 3 phần đó đã được admin duyệt (text review) và Import vào DB thật, Audio/Quiz hoàn toàn có thể sinh trực tiếp trên dữ liệu thật, không cần giữ job "sống" thêm 2 giai đoạn nữa.

**Quyết định:** Import xảy ra ngay sau khi duyệt text (`reviewed`). Audio và Quiz trở thành 2 tab trong trang Lesson (ngang hàng với Bài khoá/Từ vựng/Ngữ pháp), hoạt động trực tiếp trên bảng thật (`vocabulary`, `quiz_questions`).

## 2. Đổi pipeline `extraction_jobs`

- `status`: `pending → reviewed → imported` (bỏ hẳn `audio_ready`, `quiz_ready`)
- `importExtractionJob` (`lib/db/importJob.ts`): guard đổi từ "cho phép từ `audio_ready` trở lên" thành "cho phép từ `reviewed` trở lên"
- Bỏ hẳn field `quizQuestions` khỏi `ExtractionResultSchema` (`lib/gemini/schema.ts`) — quiz không còn là 1 phần của job's raw_json nữa, vì sinh thẳng trên bảng thật sau khi import
- Xoá route/trang job-scoped: `app/(protected)/books/[bookId]/jobs/[jobId]/audio/`, `app/(protected)/books/[bookId]/jobs/[jobId]/quiz/`, `app/api/jobs/[jobId]/audio/route.ts`, `app/api/jobs/[jobId]/quiz/route.ts`
- Xoá các module chỉ phục vụ job-scoped audio/quiz: `lib/db/generateJobAudio.ts`, `lib/db/generateJobQuiz.ts` (giữ nguyên `lib/gemini/generateQuiz.ts` — logic gọi Gemini không đổi, chỉ đổi tầng gọi nó)
- Trang job-review (`app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx`): bỏ nút "Sinh & duyệt Audio"/"Sinh & duyệt Quiz", nút Import hiện ngay khi `status === 'reviewed'`

## 3. Trang Sửa bài học — đổi guard, thêm 2 tab

### 3.1 Guard mới (áp dụng đồng nhất cho cả 5 tab)

Trang `/lessons/[lessonId]/edit` hiện chặn cứng toàn trang nếu `lesson.status !== 'draft'` (redirect kèm thông báo). Đổi thành: trang luôn vào xem được ở mọi trạng thái; mỗi tab tự ẩn nút sửa/thêm/xoá/sinh khi `status !== 'draft'`, chỉ hiển thị nội dung dạng đọc. Đây là quy tắc chung áp dụng thống nhất cho cả 5 tab (Bài khoá/Từ vựng/Ngữ pháp vốn đã có pattern ẩn-nút-theo-điều-kiện tương tự ở nơi khác — nay áp dụng luôn cho toàn trang thay vì chặn cứng).

Trang đọc chỉ-xem `/lessons/[lessonId]` (hiện có) được giữ nguyên song song — không bị thay thế.

### 3.2 Tab Audio

- Tái sử dụng `lib/db/generateLessonAudio.ts` hiện có (`generateLessonAudio` — idempotent, chỉ lấp từ chưa có audio; `regenerateLessonAudioItem` — sinh lại 1 từ) và route `app/api/lessons/[lessonId]/audio/route.ts` (đã tồn tại, không cần sửa)
- **Thêm hàm mới `regenerateAllLessonAudio(lessonId, voice)`**: xoá sạch `audio_url` của mọi từ vựng trong bài rồi sinh lại từ đầu — dùng cho nút "Sinh lại toàn bộ" (có xác nhận trước khi chạy, cảnh báo sẽ ghi đè toàn bộ audio hiện có kể cả đã chỉnh giọng riêng)
- Thêm route tương ứng (hoặc mở rộng route hiện có với 1 flag `mode: 'fill' | 'regenerateAll'`)
- UI tab: y hệt UI trang `/audio` cũ đã làm (chọn giọng chung, nhóm theo hội thoại, mỗi từ có nút "Tạo lại" riêng) — chỉ thêm 1 nút "Sinh lại toàn bộ" mới cạnh nút "Sinh audio còn thiếu" hiện có
- Điều kiện hiển thị nút sinh/sửa: chỉ khi `lesson.status === 'draft'`. Không có điều kiện tiên quyết nào khác (Import xong là đủ để vào tab Audio và sinh ngay)

### 3.3 Tab Quiz

Viết mới `lib/db/generateLessonQuiz.ts`, cấu trúc song song với `generateJobQuiz.ts` cũ nhưng thao tác trên bảng thật:

- `generateLessonQuizPart1(lessonId)` / `generateLessonQuizPart2(lessonId)`: đọc dữ liệu bài học thật qua `getLessonFull(lessonId)` (đã có sẵn, trả về `LessonFullView`), chuyển đổi sang shape `ExtractionResult`-tương-đương để tái sử dụng nguyên vẹn `generateQuizPart1`/`generateQuizPart2` (`lib/gemini/generateQuiz.ts`, không đổi), sau đó **ghi đè hẳn** các câu hỏi cùng `part` trong bảng `quiz_questions` (xoá hết câu cũ của part đó, insert câu mới) — không còn khái niệm "lưu nháp riêng rồi mới lưu chính thức", vì đây là ghi thẳng DB thật. Bấm "Sinh Phần X" khi phần đó đang RỖNG (chưa có câu nào) thì sinh luôn không cần xác nhận; chỉ khi phần đó ĐÃ CÓ câu hỏi (bấm lại = ghi đè) mới hiện confirm cảnh báo trước khi chạy — giữ nguyên hành vi UI đã có ở trang `/quiz` cũ.
- Không có hàm `saveLessonQuiz` riêng để "chốt" — sửa từng câu qua click-to-edit thì `UPDATE` thẳng vào đúng row `quiz_questions`, xoá câu thì `DELETE` thẳng row đó. Không còn 2 bước generate-rồi-save như job cũ.
- **Chuyển đổi dữ liệu cho `listening_choice`**: field `audioUrl` trong prompt Gemini lấy từ `vocabulary.audio_url` thật (qua `getLessonFull`), giống hệt cách job cũ lấy từ `raw_json.dialogues[].vocabulary[].audioUrl`
- **Không chặn cứng** nếu chưa có audio nào — nếu tab Quiz phát hiện `lesson.dialogues.every(d => d.vocabulary.every(v => !v.audioUrl))` (không có từ nào có audio), hiển thị message khuyến nghị "Nên sinh Audio trước để có câu hỏi dạng Nghe" nhưng vẫn cho bấm sinh bình thường — Gemini prompt vẫn giữ nguyên chỉ dẫn tự thay `listening_choice` bằng dạng khác nếu không có từ nào có audio (logic này vốn đã đúng khi tách phần 1/phần 2)
- UI tab: y hệt UI trang `/quiz` cũ (2 khối Phần 1/Phần 2, mỗi câu click-to-edit, nút xoá/di chuyển, nút "Sinh lại" từng phần kèm xác nhận ghi đè)
- Điều kiện hiển thị nút sinh/sửa: chỉ khi `lesson.status === 'draft'`

### 3.4 Migration

Không cần migration mới cho `quiz_questions` (bảng đã đúng shape `lesson_id` trực tiếp từ trước — bảng này vốn được thiết kế sẵn cho lesson-scope, chỉ là trước đây dữ liệu tạm nằm ở `raw_json` trước khi import). Cần 1 migration nhỏ nếu muốn dọn cột không dùng nữa — nhưng vì `quizQuestions` trong `ExtractionResultSchema` chỉ là field JSON (không phải cột DB), việc bỏ nó không cần migration.

## 4. Việc KHÔNG đổi (giữ nguyên)

- `lib/gemini/generateQuiz.ts`, `lib/gemini/quizSchema.ts`, prompt Gemini, cơ chế model chính/fallback (`gemini-3.5-flash`/`gemini-2.5-flash`) — không đổi gì
- `lib/gemini/extract.ts` (model `gemini-3.6-flash`, không fallback) — không đổi
- Trang đọc `/lessons/[lessonId]` (read-only) — giữ nguyên, sẽ được bổ sung Quiz-preview ở 1 công việc riêng sau này (đã ghi trong memory `project_full_design_roadmap`)
- Cấu trúc bảng `quiz_questions` (migration 0019) — giữ nguyên, không cần sửa schema

## 5. Việc CHƯA thiết kế (ngoài phạm vi)

- Hiển thị Quiz-preview ở trang đọc read-only (việc riêng, đã ghi nhận trong memory, chưa lên lịch)
- Waveform trimmer (Scope 5, không liên quan)
