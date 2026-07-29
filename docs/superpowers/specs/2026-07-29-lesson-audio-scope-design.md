# Thiết kế điều chỉnh: Sinh audio từ vựng (Scope 3) + trang Sửa dạng Tab

Ngày: 2026-07-29
Trạng thái: đã chốt hướng thiết kế, điều chỉnh lại phạm vi Scope 3 đang code dở trên nhánh `admin-pdf-extraction`. Bổ sung cho `docs/superpowers/specs/2026-07-28-full-product-design.md` — không thay thế, chỉ sửa mục 4.6 (đã sửa hôm nay) và mục 5/10 (điều chỉnh ở đây).

## Bối cảnh — vì sao cần điều chỉnh

Khi triển khai Scope 3 ("Sinh & duyệt Audio"), phát sinh 2 vấn đề thực tế:

1. **Bài đã import trước khi tính năng Audio tồn tại** (ví dụ Bài 2) không có `extraction_job` nào để đi qua trang `/jobs/[jobId]/audio` — không có đường nào sinh audio cho các bài này.
2. **Phạm vi TTS quá rộng**: pipeline ban đầu sinh audio cho cả `vocabulary` lẫn `grammar_examples`, khiến số lượng mục cần TTS lớn (ví dụ 96 mục cho 1 bài), chờ lâu. Đồng thời, quyết định thiết kế mới (mục 4.6 đã sửa) là tab "Gõ câu" ở App User chỉ dùng câu bài khoá thật (`dialogue_lines`), không dùng câu ví dụ ngữ pháp nữa — nên audio cho `grammar_examples` không còn cần thiết.

## Quyết định

### 1. Job pipeline (Scope 2) — GIỮ NGUYÊN, không đổi

`extraction_jobs.status`: `pending → reviewed → audio_ready → quiz_ready → imported` (+ `failed`) như đã thiết kế. Trang Job Review (`/books/[bookId]/jobs/[jobId]`) + trang Audio con của nó (`/books/[bookId]/jobs/[jobId]/audio`) vẫn là nơi duy nhất xử lý **job mới extract**, trước khi Import — vì đây là luồng có PDF gốc bên cạnh để đối chiếu, ngữ cảnh làm việc khác hẳn việc sửa bài đã có.

Import vẫn yêu cầu `status` đạt `audio_ready` hoặc `quiz_ready` (guard đã code trong `lib/db/importJob.ts`, giữ nguyên).

### 2. Phạm vi TTS — CHỈ `vocabulary`, bỏ hẳn `grammar_examples`

- Bỏ sinh audio cho `grammar_examples` ở mọi nơi: migration xoá cột `grammar_examples.audio_url`, xoá field `audioUrl`/`id` khỏi `GrammarExampleSchema` (giữ `id` nếu còn dùng nơi khác — kiểm tra trước khi xoá), xoá đệ quy examples trong `lib/db/generateJobAudio.ts` và `lib/db/generateLessonAudio.ts`, xoá `<audio>` player cho ví dụ ngữ pháp ở cả 2 trang editor (job-review + lesson-edit, 4 vị trí lồng nhau mỗi trang).
- `dialogue_lines.audio_url` KHÔNG bị ảnh hưởng — đó là audio thật (thu âm/cắt tay), không phải TTS, thuộc Scope 5 (waveform trimmer), không liên quan tới thay đổi này.
- Trang `/jobs/[jobId]/audio` (job pipeline) chỉ còn liệt kê từ vựng.

### 3. Trang Sửa bài học (`lessons/[lessonId]/edit`) — chuyển sang bố cục Tabs

Đây là đường dành cho **bài đã import rồi** (mọi bài cũ lẫn mới, không cần job/PDF gốc):

- Tab 1 **"Nội dung"** (mặc định, giữ nguyên form hiện tại nguyên vẹn): Thông tin bài học, Bài khoá, Từ vựng, Ngữ pháp — không đổi logic/state, chỉ bọc trong 1 `TabsPanel`.
- Tab 2 **"Audio"** (mới): dùng route đã viết sẵn `app/api/lessons/[lessonId]/audio/route.ts` (POST sinh hàng loạt, PATCH tạo lại 1 từ) và `lib/db/generateLessonAudio.ts` — chỉ cho `vocabulary`. Layout tương tự trang `/jobs/[jobId]/audio` (đã có), nhưng:
  - 1 dropdown chọn giọng (Hiểu Trân/Vân Triết) đặt ở đầu tab, áp dụng cho toàn bộ khi bấm "Sinh audio còn thiếu".
  - Mỗi dòng từ vựng: chữ Hán, nghĩa Việt, player nghe (nếu đã có), nút "Tạo lại" — dùng đúng giọng đã chọn ở đầu tab, không có dropdown giọng riêng từng dòng.
- Dùng component `Tabs` sẵn có (Base UI, `components/ui/tabs.tsx`) — style nhất quán với các Tabs khác trong app (ví dụ trang chi tiết sách).

Tab Audio này **tách bạch hoàn toàn** khỏi tab Nội dung — người chỉ cần sửa text không bị rối bởi giao diện audio, và ngược lại.

### 4. Việc cần dọn (rollback phần đã code sai phạm vi)

- Xoá route/module TTS cho `grammar_examples` (giữ lại phần vocabulary).
- Xoá `<audio>` player + logic liên quan đến `example.audioUrl` ở `app/(protected)/lessons/[lessonId]/edit/page.tsx` và `app/(protected)/books/[bookId]/jobs/[jobId]/page.tsx`.
- Migration mới `0016_drop_grammar_example_audio.sql`: `alter table grammar_examples drop column audio_url;` — migration 0011 (thêm cột này) đã chạy trên Supabase thật, nên PHẢI dùng migration mới để drop, không sửa ngược file 0011 (sẽ gây lệch giữa migration history và trạng thái DB thật).
- Cập nhật lại toàn bộ test liên quan (generateJobAudio.test.ts, generateLessonAudio nếu có test, deleteLesson.test.ts, importJob.test.ts) để bỏ phần grammar-example-audio.

## Không đổi (nhắc lại để tránh nhầm)

- `vocabulary.audio_url` (migration 0015) — giữ nguyên.
- `dialogue_lines.audio_url` — giữ nguyên, không phải TTS, thuộc Scope 5.
- Giọng edge-tts: `zh-TW-HsiaoChenNeural` (nữ) / `zh-TW-YunJheNeural` (nam), 2 lựa chọn.
- Guard Import chỉ từ `audio_ready` trở lên — giữ nguyên trong job pipeline.
