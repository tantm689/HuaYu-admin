# Thiết kế tổng thể: Admin CMS + User App (Đương Đại 1/2/3)

Ngày: 2026-07-28
Trạng thái: **ĐÃ LỖI THỜI Ở NHIỀU MỤC — cập nhật 2026-07-31.** Tài liệu này là bản thiết kế gốc (viết khi CHƯA có code). Từ đó tới nay, phần Admin CMS đã triển khai xong và trải qua nhiều lần đổi hướng thiết kế — mục 3.3/3.4/5/8/10 KHÔNG còn đúng với code thật, xem ghi chú "❌ ĐÃ ĐỔI" cắm ngay dưới mỗi mục bị ảnh hưởng. Tài liệu thẩm quyền hiện tại cho pipeline/Audio/Quiz là `docs/superpowers/specs/2026-07-30-lesson-scoped-audio-quiz-design.md`. Các mục 1/2/4/6/7/9 vẫn còn đúng hướng (chưa triển khai code phần User app nên chưa có gì mâu thuẫn).

Bối cảnh: nội dung sách gốc (`tài_liệu/Giáo trình tiếng Trung đương đại SGK 1.pdf`, 409 trang) đã được đọc trực tiếp (nhiều bài rải khắp sách: Bài 1, 5, 6, 8, 12) để đối chiếu cấu trúc thật với hệ thống đang có, thay vì suy đoán qua ảnh chụp màn hình như trước đây.

---

## 1. Cấu trúc thật của 1 bài học (đã đọc từ sách)

```
Bìa bài — số bài, tiêu đề Hán/Việt, Mục tiêu học tập (學習目標), Chủ đề
對話 Hội thoại I, II... — có mã audio track (ví dụ "01-1")
  生詞 Từ mới I, II... — TÁCH RIÊNG theo từng hội thoại, đi ngay sau nó
    (sách còn phân nhóm nhân vật/từ vựng/tên riêng/cụm từ — cột `category`
     từng tồn tại trong DB, bị xoá theo yêu cầu chủ động của owner trước đây
     — migration 0005 — QUYẾT ĐỊNH GIỮ NGUYÊN, không phục hồi category)
文法 Ngữ pháp I, II... — có thể có đề mục con chữ cái A, B (đã làm: grammar_sub_points)
  mỗi điểm ngữ pháp thường gồm:
    "Chức năng" (mô tả công dụng) + ví dụ đánh số ❶❷❸
    "Cấu trúc" (công thức) — có thể chia thêm "Khẳng định:"/"Phủ định:"/"Câu hỏi:"
       mỗi khối con có ví dụ riêng đánh số riêng
    đôi khi thêm "Thông thường"/"Sử dụng"/"Cách dùng" (nhãn KHÔNG cố định)
  練習 Luyện tập (bài tập điền/sắp câu ngay sau mỗi điểm ngữ pháp)
課室活動 Hoạt động lớp học (Mục tiêu + Nhiệm vụ, hoạt động cặp/nhóm)
文化 Văn hóa (bài đọc + ảnh minh hoạ)
Tự đánh giá (checklist %)
```

**Lưu ý quan trọng — sách có 3 quyển (Đương Đại 1, 2, 3), cấu trúc phần Ngữ pháp khác nhau giữa các quyển:**
- Quyển 1, 2: giống nhau, có Chức năng/Cấu trúc(Khẳng định/Phủ định/Câu hỏi), và các nhãn phụ thay đổi tuỳ bài (Thông thường/Sử dụng/Cách dùng...)
- Quyển 3: đơn giản hơn — chỉ còn Chức năng + Cách dùng

→ Không có bộ nhãn cố định qua cả 3 quyển. Schema không được cứng nhãn theo tên (xem mục 3).

## 2. Phạm vi đã chốt (in/out scope)

**Loại hẳn khỏi hệ thống** (quyết định cũ, vẫn giữ nguyên — xem `project_book_structure_scope` memory):
- Hoạt động lớp học (cần giáo viên/bạn học trực tiếp, không hợp app tự học)
- Văn hóa (bài đọc nền, giá trị thấp so với công sức số hoá)
- Luyện tập gốc của sách (không có đáp án in sẵn, quá nhiều dạng bài — user từng thử và thất bại)
- Bản dịch nguyên đoạn hội thoại dạng field riêng — KHÔNG cần, vì đã có `translation_vi` theo từng dòng thoại (`dialogue_lines`), app User tự ẩn/hiện là đủ

**Bổ sung mới vào Admin, thay cho các phần trên:**
- Quiz tự sinh (6 dạng "dễ", xem mục 5) — thay thế vai trò của Luyện tập gốc nhưng có đáp án rõ ràng, chấm được tự động
- Gõ phản xạ (tái dùng câu hội thoại + ví dụ ngữ pháp có sẵn, xem mục 6)

## 3. Schema thay đổi (Admin CMS DB)

### 3.1 `vocabulary` — tách theo dialogue (đã bàn kỹ, chốt)
- Đổi `lesson_id` (NOT NULL) → `dialogue_id` (NOT NULL, FK → `dialogues(id)` on delete cascade)
- Không phục hồi `category` (đã xoá theo yêu cầu owner ở migration 0005, giữ nguyên quyết định đó)
- Data cũ trong Supabase: xoá hết, extract lại (owner đã đồng ý, vì đằng nào cũng re-extract để lấy grammar_sub_points)
- Lý do: sách không có 1 bảng từ vựng gộp cho cả bài — mỗi hội thoại có bộ Từ mới riêng đi ngay sau nó (生詞一 đi với 對話一, 生詞二 đi với 對話二...). Giữ `lesson_id` làm mất thông tin "từ này thuộc hội thoại nào", khiến app User không tái hiện đúng flow sách và Flashcard không nhóm đúng theo ngữ cảnh câu chuyện.
- App User: Flashcard mặc định nhóm theo dialogue (ví dụ "Từ mới I" ứng với Hội thoại I, "Từ mới II" ứng Hội thoại II), mỗi bộ là 1 flashcard-set riêng.

### 3.2 `dialogue_lines` — thêm `audio_url`
- Audio THẬT, cắt thủ công từ file audio gốc của cả đoạn hội thoại (không phải TTS) — xem mục 7 (waveform trimmer)
- Cần cho: Shadowing chế độ karaoke (dừng từng câu), audio gợi ý trong bài Gõ câu phản xạ

### 3.3 `grammar_points` / `grammar_sub_points` — giữ nguyên `structure_note`

**❌ ĐÃ ĐỔI (migration `0012_grammar_sections.sql`).** `structure_note` bị xoá hẳn, thay bằng bảng `grammar_sections` riêng (mỗi section có `label` + `content` text + `parent_section_id` để lồng nhau) — không còn nhồi hết Chức năng/Cấu trúc/Khẳng định/Phủ định/Câu hỏi/Cách dùng vào 1 field text tự do. Lý do ghi trong migration: 1 chuỗi `structure_note` cộng danh sách example gắn nhãn phẳng (`example_type`) không đại diện được các mục như "Chức năng"/"Cách dùng" (không phải khẳng định/phủ định/câu hỏi) mà mỗi mục lại có ví dụ riêng của nó — cần cấu trúc lồng thật sự, không phải text tự do.

~~Nội dung mục 3.3 gốc bên dưới không còn áp dụng, giữ lại để tham khảo lịch sử:~~
- KHÔNG tách thành field riêng (function/structure/usageNote) vì nhãn sách không cố định qua 3 quyển
- `structure_note` vẫn là 1 field text tự do; Gemini PHẢI giữ nguyên nhãn gốc của sách trong text (ví dụ "Chức năng: ...\n\nCấu trúc:\nKhẳng định: ...\nPhủ định: ...\nCâu hỏi: ...\n\nCách dùng: ..."), xuống dòng rõ ràng giữa các phần — không tự tóm gọn/xoá nhãn
- Đây là thay đổi PROMPT, không phải thay đổi schema

### 3.4 `grammar_examples` — thêm 2 field

**❌ ĐÃ ĐỔI (migration `0012` rồi `0018_drop_grammar_example_audio.sql`).**
- `example_type`: bị xoá cùng lúc với `structure_note` (migration 0012) — thay bằng `grammar_sections`, `grammar_examples` giờ gắn với `grammar_section_id` thay vì `grammar_point_id`/`grammar_sub_point_id` trực tiếp.
- `audio_url`: từng được thêm (migration 0011), sau đó bị xoá hẳn (migration 0018). Nguyên văn lý do trong migration: "Gõ câu" (luyện gõ phản xạ ở app User, mục 4.6) đã bị thu hẹp phạm vi chỉ dùng câu hội thoại thật (`dialogue_lines.audio_url`, ghi âm thật, không phải TTS) — câu ví dụ ngữ pháp không bao giờ dùng cho luyện gõ, nên không còn lý do sinh/lưu audio cho chúng.

~~Nội dung mục 3.4 gốc bên dưới không còn áp dụng, giữ lại để tham khảo lịch sử:~~
- `audio_url` — sinh bằng TTS (không phải audio thật, sách không có audio cho câu ví dụ ngữ pháp)
- `example_type` — enum `'default' | 'negative' | 'question'`, mặc định `'default'`. Áp dụng cho examples ở cả `grammar_point_id` lẫn `grammar_sub_point_id`.
  - Lý do: sách thường chia ví dụ theo Khẳng định/Phủ định/Câu hỏi (rõ nhất ở quyển 1-2, xác nhận qua Bài 1/8/12), đây là kỹ năng thực hành cốt lõi khi học ngoại ngữ (biết chuyển câu sang phủ định/nghi vấn), không phải chi tiết phụ đáng bỏ qua

### 3.5 Bảng Quiz mới — `quiz_questions`

**Đã triển khai (migration `0019_quiz_questions.sql`), có thêm 1 cột so với bản phác thảo ban đầu ở mục 8.** Shape thật: `id, lesson_id, part (1|2), type, order, payload jsonb`. Cột `part` chia 15 câu Phần 1 (nhận biết từ vựng/phát âm) và 15 câu Phần 2 (vận dụng câu/ngữ pháp) — sinh qua 2 lệnh gọi Gemini riêng, xem `docs/superpowers/specs/2026-07-30-lesson-scoped-audio-quiz-design.md`.

~~Nội dung mục 3.5 gốc bên dưới, giữ lại để tham khảo lịch sử:~~
- Gắn với `lesson_id` (không tách theo dialogue/grammar_point — 1 bộ quiz tổng hợp cho cả bài)
- Mỗi câu hỏi có `type` (1 trong 6 dạng đợt 1, xem mục 5), nội dung câu hỏi, các lựa chọn, đáp án đúng
- Cấu trúc field cụ thể: CHƯA thiết kế chi tiết (để lúc viết migration thật)

### 3.6 Bảng User-app mới (cùng Supabase project, RLS riêng cho end-user)
- SRS progress theo `user_id` + `vocabulary_id` (Leitner box, xem mục 4.2)
- Quiz attempts/điểm số theo `user_id`
- Chưa thiết kế chi tiết field — để lúc bắt tay code User app

## 4. Luồng học app User

### 4.1 Điều hướng
```
Trang chủ → Danh sách bài học (chỉ status='published')
  → Chọn 1 bài → Màn hình bài học, 5 khu vực/tab ngang hàng
     (KHÔNG gộp Hội thoại+Từ mới thành 1 luồng liền mạch — quyết định rõ ràng,
      chấp nhận mất tính xen kẽ đúng như sách để giữ UI đơn giản):
       1. Hội thoại (Shadowing)
       2. Từ mới (Flashcard, nhóm theo dialogue)
       3. Ngữ pháp (đọc, gồm sub-points)
       4. Quiz (6 dạng trắc nghiệm)
       5. Gõ phản xạ (2 tab con: Gõ từ / Gõ câu)
  Có "flow đề xuất" gợi ý thứ tự học (không khoá cứng, người dùng tự do bấm tab nào trước)
```
Người dùng LUÔN tự chọn bài từ danh sách (không có "app tự quyết định học gì" ở tầng chọn bài) — quyết định rõ ràng sau khi bàn, ưu tiên đơn giản hơn kiểu "app tự pace".

### 4.2 Flashcard từ vựng — có SRS ngầm
- Mặc định trong màn hình bài học: chỉ từ của bài đó, chia theo dialogue
- SRS (Leitner box đơn giản, theo `user_id`): học/ôn đúng → tăng khoảng cách ôn (1 ngày → 3 → 7 → 14 → 30), sai bất kỳ lúc nào → về lại hộp 1
- Trang chủ có khối nhỏ "Hôm nay có N từ cần ôn lại" — bấm vào vào thẳng phiên ôn trộn nhiều bài đến hạn, không cần tự chọn bài
- Lý do: chỉ ôn trong phạm vi 1 bài không giải quyết được việc quên theo thời gian (đường cong Ebbinghaus) — đây là giá trị gia tăng thật sự của app so với học chay bằng sách giấy

### 4.3 Shadowing hội thoại — 2 bước, 2 chế độ
```
Bước 1: Nghe cảm âm (không ghi âm) — nghe audio thật vài lần cho quen tai
Bước 2: chọn 1 trong 2 chế độ:
  Chế độ 1 — Nói mạch cả bài: nghe/nói theo cả đoạn liền mạch, ghi âm lại,
             nghe lại tự đối chiếu — KHÔNG chấm điểm tự động
  Chế độ 2 — Karaoke từng câu: audio dừng từng dòng thoại (dùng
             dialogue_lines.audio_url đã cắt riêng), người dùng nói, CÓ
             chấm điểm (Web Speech API SpeechRecognition → so khớp text
             nhận diện được với text_zh), tự động chuyển câu tiếp theo
```
Không dùng dịch vụ ASR/chấm phát âm trả phí — dùng SpeechRecognition có sẵn trong Chrome (miễn phí, đủ dùng theo kinh nghiệm cũ của user).

### 4.4 Ngữ pháp
- Hiển thị đúng những gì đã lưu: tiêu đề, `structure_note` (giữ nguyên nhãn gốc sách), ví dụ (nghe audio được), nhóm theo `example_type` nếu có (Khẳng định/Phủ định/Câu hỏi), sub-points lồng bên trong nếu có
- Không thêm field/tính năng gì khác ngoài hiển thị lại đúng dữ liệu đã extract

### 4.5 Quiz tự sinh — ĐỢT 1: 6 dạng "dễ"
Chỉ làm 6 dạng sau (dữ liệu đã có sẵn từ extract, Gemini sinh đáng tin cậy, dễ chấm tự động):
1. Chọn Pinyin cho Chữ Hán / ngược lại (trắc nghiệm 4 lựa chọn)
2. Nghe & chọn đáp án đúng (dùng audio đã có)
3. Nhận biết thanh điệu (chữ Hán + pinyin không dấu → chọn thanh điệu đúng)
4. Ghép nghĩa/nối từ (Hán ↔ Việt)
5. Điền từ vào chỗ trống (dựa trên câu ví dụ ngữ pháp có sẵn)
6. Sắp xếp từ thành câu (xáo trộn từ trong câu hội thoại/ví dụ có sẵn)

**Đợt 2 (ghi nhận, KHÔNG làm ngay)** — 4 dạng "khó", cần Gemini tự sáng tác nội dung mới ngoài phạm vi đã extract, rủi ro chất lượng cao hơn:
- Tìm lỗi sai trong câu, Dịch câu, Phân biệt từ gần nghĩa, Chọn trợ từ/lượng từ phù hợp

Chấm điểm: so khớp chính xác với đáp án đã sinh sẵn, không cần AI chấm lúc user làm bài.

### 4.6 Gõ phản xạ — 2 tab con, tách biệt hoàn toàn
**Tab "Gõ từ"** — dạng bảng/sheet, auto-check từng dòng khi gõ xong (không cần next tuần tự, làm cả bảng cùng lúc). Nguồn: `vocabulary` (ẩn `word_zh`, hiện `meaning_vi`).

**Tab "Gõ câu"** — next từng câu tuần tự. Hiện nghĩa tiếng Việt, gõ chữ Hán, có nút nghe audio gợi ý nếu bí (không hiện pinyin — mục đích ép phản xạ mặt chữ, tránh gõ mò theo pinyin). Nguồn câu: CHỈ `dialogue_lines.text_zh` (câu bài khoá thật, có `audio_url`) — KHÔNG dùng `grammar_examples.text_zh` nữa (quyết định đổi ngày 2026-07-28, sau khi soạn bản đầu tài liệu này: câu ví dụ ngữ pháp thường ngắn/công thức hoá, không đại diện cho văn cảnh giao tiếp thật bằng câu bài khoá, nên loại khỏi phạm vi luyện gõ câu).

Cả 2 tab: dùng ô input text thường, dựa vào IME hệ điều hành có sẵn (không tự xây bộ gõ pinyin→Hán). Chấm: so khớp CHÍNH XÁC với câu/từ gốc — không chấp nhận từ đồng nghĩa khác, không dùng AI chấm (để đảm bảo ôn đúng kiến thức/cấu trúc đang học trong bài, không phải câu bất kỳ cùng nghĩa).

## 5. Pipeline Extraction Job (Admin)

**❌ ĐÃ ĐỔI HOÀN TOÀN (2026-07-30, xem `docs/superpowers/specs/2026-07-30-lesson-scoped-audio-quiz-design.md`).** Bản 5 bước dưới đây từng được code thật (migration `0011` từng thêm `audio_ready`/`quiz_ready` vào `extraction_jobs.status`) nhưng sau đó bị đảo ngược — nhận ra Audio/Quiz không cần "chặn" trong pipeline job vì chúng chỉ phụ thuộc dữ liệu bài khoá/từ vựng/ngữ pháp đã duyệt, một khi đã Import vào DB thật thì có thể sinh Audio/Quiz trực tiếp trên dữ liệu thật, không cần giữ job "sống" thêm 2 bước.

**Pipeline thật hiện tại (3 trạng thái + `failed`):**
```
1. pending   → Gemini đọc PDF → JSON (dialogues+vocab+grammar)
2. reviewed  → Admin sửa text, bấm "Lưu"
3. imported  → Import ngay khi status = reviewed → ghi lesson/dialogues/
               vocabulary/grammar vào DB thật, KHÔNG còn insert quiz_questions
               ở bước này nữa (audio/quiz sinh sau, xem dưới)
   (failed)  → lỗi trích xuất, giữ nguyên như thiết kế cũ
```

**Audio và Quiz giờ là 2 tab trên trang Sửa bài học** (`/lessons/[lessonId]/edit`, tab "Audio" và "Quiz"), không còn là 2 trang riêng trong pipeline job:
- Tab Audio: sinh TTS cho từ vựng (nút "Sinh audio", ghi đè toàn bộ có xác nhận trước) — audio hội thoại thật (dialogue_lines) vẫn chờ waveform trimmer (mục 6, chưa xây)
- Tab Quiz: Gemini sinh 2 phần (15 câu/phần, part 1 = nhận biết từ vựng/phát âm, part 2 = vận dụng câu/ngữ pháp), admin sửa/xoá/sắp xếp lại từng câu, lưu thẳng vào DB ngay khi sửa (không có bước "Lưu" riêng cho quiz)
- Cả 2 tab chỉ sinh/sửa được khi bài học ở trạng thái `draft`; `published` thì chỉ xem

**Lý do tách 5 bước gốc (KHÔNG CÒN ÁP DỤNG, giữ lại để hiểu bối cảnh lịch sử):** nếu sinh audio/quiz dựa trên text CHƯA sửa, khi admin sửa text sau đó thì audio/quiz cũ sẽ lệch khỏi nội dung đã sửa. Giải pháp thật sự chọn không phải "tách 2 bước riêng trong pipeline job" mà là "sinh Audio/Quiz SAU KHI đã Import — trên dữ liệu bài học thật, admin có thể sinh lại bất cứ lúc nào miễn còn ở draft" — đơn giản hơn nhiều so với cố gắng đồng bộ raw_json qua 2 bước trung gian.

## 6. Waveform trimmer (tính năng Admin mới)

Trang cắt audio hội thoại gốc thành từng dòng thoại:
- Hiển thị waveform trực quan của file audio cả đoạn hội thoại (`dialogues.audio_url`)
- Admin kéo đánh dấu điểm đầu/cuối cho từng dòng thoại (đối chiếu với `text_zh` của từng dòng, liệt kê sẵn theo thứ tự)
- Nghe thử đoạn đã cắt trước khi xác nhận
- Xác nhận → hệ thống tự cắt file audio riêng cho dòng đó, lưu `dialogue_lines.audio_url`

Đây là tính năng UI phức tạp (audio waveform + kéo thả chính xác), sẽ cần bàn kỹ thêm về thư viện/kỹ thuật cụ thể khi bắt tay code (chưa chọn thư viện, chưa thiết kế UI chi tiết).

## 7. Kiến trúc kỹ thuật tổng thể 2 repo

- **Cùng 1 Supabase project** cho cả Admin CMS và User app (không tách riêng, không cần đồng bộ dữ liệu qua job/API)
- **App User đọc dữ liệu qua anon key + RLS** đã có sẵn (chỉ đọc được `status='published'`) — không cần xây API trung gian
- **Auth người dùng cuối**: Supabase Auth (email/password hoặc OAuth), tận dụng `auth.uid()` cho RLS kiểm soát ai đọc/ghi được progress của chính mình (SRS, quiz attempts...) — khác hẳn RLS admin hiện tại (admin dùng service-role key, bypass RLS hoàn toàn)

## 8. Quyết định bổ sung (chốt ngày 2026-07-28, sau khi soạn bản đầu tài liệu này)

- **Trạng thái `extraction_jobs.status` mới**: `pending → reviewed → audio_ready → quiz_ready → imported` (+ `failed` giữ nguyên như cũ).
  **❌ ĐÃ ĐỔI — bị đảo ngược lại 2026-07-30.** Pipeline thật hiện tại chỉ còn `pending → reviewed → imported` (+ `failed`), xem mục 5 đã cập nhật ở trên.
- **`quiz_questions` schema**: `id, lesson_id, type, order, payload jsonb`. Cột cố định tối thiểu (id/lesson_id/type/order), toàn bộ nội dung câu hỏi/đáp án của từng dạng nằm trong `payload` (jsonb) — shape khác nhau tuỳ `type` (ví dụ trắc nghiệm: `{question, choices[], correctIndex}`; sắp xếp từ: `{words[], correctOrder[]}`). Cho phép thêm dạng câu hỏi mới (đợt 2) sau này mà không cần migration.
  **Cập nhật nhỏ:** shape thật (migration `0019`) có thêm cột `part` (1|2) so với phác thảo này — xem mục 3.5 đã cập nhật.
- **Waveform trimmer**: thư viện/kỹ thuật cụ thể (khả năng cao `wavesurfer.js` cho waveform+trim trên web) sẽ quyết định lúc thực sự bắt tay code scope đó, không chốt trước. **Vẫn đúng — CHƯA xây, xem mục 10.**
- **Danh sách bài học User app**: nhóm theo quyển (`books`) — người dùng chọn quyển (Đương Đại 1/2/3) trước, rồi thấy danh sách bài của quyển đó. Khớp với model `lessons.book_id` đã có sẵn. **Vẫn đúng hướng — chưa code (User app chưa bắt đầu).**

## 9. Việc CHƯA thiết kế chi tiết (để sau khi Admin ổn định, thuộc phạm vi User app)

- Chi tiết UI/thư viện waveform trimmer (quyết định lúc code)
- Cấu trúc bảng SRS progress + quiz attempts cho User app (field, migration) — thiết kế khi bắt đầu code User app
- Toàn bộ đợt 2 của Quiz (4 dạng "khó": tìm lỗi sai, dịch câu, phân biệt từ gần nghĩa, chọn trợ từ/lượng từ)

## 10. Thứ tự triển khai (scope nhỏ, duyệt từng scope trước khi sang scope tiếp theo)

**Cập nhật trạng thái 2026-07-31** (đối chiếu code/migration thật):

1. ✅ **XONG, nhưng ĐỔI KHÁC** — Schema nền tảng: `vocabulary.dialogue_id` và `dialogue_lines.audio_url` đúng như thiết kế (migration `0010`, `0011`); `grammar_examples.audio_url` + `example_type` đã làm xong rồi sau đó bị xoá/thay bằng `grammar_sections` (migration `0012`, `0018`) — xem mục 3.3/3.4.
2. ✅ **XONG, rồi LÀM NGƯỢC LẠI** — `extraction_jobs.status` từng mở rộng đúng như thiết kế (migration `0011`: thêm `audio_ready`/`quiz_ready`), sau đó bị rút gọn lại còn 3 trạng thái (`pending/reviewed/imported/failed`, commit `8d9eacf`) — xem mục 5.
3. ✅ **XONG, nhưng KHÁC VỊ TRÍ** — không phải "trang Sinh & duyệt Audio" riêng trong pipeline job; là tab "Audio" trên trang Sửa bài học (`lib/db/generateLessonAudio.ts`), sinh trên dữ liệu đã import thật thay vì `raw_json` của job.
4. ✅ **XONG, nhưng KHÁC VỊ TRÍ** — tương tự mục 3: tab "Quiz" trên trang Sửa bài học (`lib/db/generateLessonQuiz.ts`, `quiz_questions` table đã có), không phải trang riêng trong pipeline job.
5. ❌ **CHƯA LÀM** — Waveform trimmer: không có code nào trong repo (đã grep xác nhận), vẫn đúng như trạng thái "chưa xây" của bản thiết kế gốc.
6. ❌ **CHƯA LÀM** — App User: chưa bắt đầu, repo riêng chưa tồn tại.

Tài liệu chi tiết cho mục 3+4 (đã đổi hướng): `docs/superpowers/specs/2026-07-30-lesson-scoped-audio-quiz-design.md`.

Quy tắc làm việc: code xong 1 scope → dừng lại để user kiểm tra/duyệt → mới sang scope tiếp theo. Không code nhiều scope liền một lúc.
