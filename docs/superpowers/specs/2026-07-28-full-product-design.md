# Thiết kế tổng thể: Admin CMS + User App (Đương Đại 1/2/3)

Ngày: 2026-07-28
Trạng thái: đã chốt hướng thiết kế, CHƯA triển khai code. Đây là tài liệu tham chiếu cho toàn bộ phần còn lại của dự án — bàn kỹ trước, tránh phải sửa schema/pipeline nhiều lần.

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
- KHÔNG tách thành field riêng (function/structure/usageNote) vì nhãn sách không cố định qua 3 quyển
- `structure_note` vẫn là 1 field text tự do; Gemini PHẢI giữ nguyên nhãn gốc của sách trong text (ví dụ "Chức năng: ...\n\nCấu trúc:\nKhẳng định: ...\nPhủ định: ...\nCâu hỏi: ...\n\nCách dùng: ..."), xuống dòng rõ ràng giữa các phần — không tự tóm gọn/xoá nhãn
- Đây là thay đổi PROMPT, không phải thay đổi schema

### 3.4 `grammar_examples` — thêm 2 field
- `audio_url` — sinh bằng TTS (không phải audio thật, sách không có audio cho câu ví dụ ngữ pháp)
- `example_type` — enum `'default' | 'negative' | 'question'`, mặc định `'default'`. Áp dụng cho examples ở cả `grammar_point_id` lẫn `grammar_sub_point_id`.
  - Lý do: sách thường chia ví dụ theo Khẳng định/Phủ định/Câu hỏi (rõ nhất ở quyển 1-2, xác nhận qua Bài 1/8/12), đây là kỹ năng thực hành cốt lõi khi học ngoại ngữ (biết chuyển câu sang phủ định/nghi vấn), không phải chi tiết phụ đáng bỏ qua

### 3.5 Bảng Quiz mới — `quiz_questions`
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

## 5. Pipeline Extraction Job (Admin) — 5 bước, thay pipeline 3 bước cũ

```
1. pending      → Gemini đọc PDF → JSON (dialogues+vocab+grammar), CHƯA sinh audio/quiz
2. reviewed     → Admin sửa text (hội thoại/từ vựng/ngữ pháp), bấm Duyệt
3. (mới)        → trang riêng "Sinh & duyệt Audio": tự động gọi TTS cho vocab +
                  grammar_examples (dựa trên text ĐÃ DUYỆT ở bước 2, nên luôn khớp),
                  admin nghe thử/bấm tạo lại từng audio nếu không ưng.
                  Audio hội thoại (dialogue_lines) dùng waveform trimmer riêng (mục 7),
                  không phải TTS.
4. (mới)        → trang riêng "Sinh & duyệt Quiz": Gemini sinh 6 dạng câu hỏi dựa
                  trên vocab+grammar đã duyệt, admin xem/sửa từng câu hỏi
5. imported     → Import: chỉ ghi tất cả (text+audio+quiz đã duyệt) vào DB,
                  KHÔNG sinh gì thêm ở bước này nữa
```

**Lý do tách 5 bước thay vì sinh audio/quiz ngay lúc extract (bước 1):** nếu sinh audio/quiz dựa trên text CHƯA sửa, khi admin sửa text ở bước 2 thì audio/quiz cũ sẽ lệch khỏi nội dung đã sửa — không có cách tự động phát hiện "câu nào đổi thì sinh lại đúng câu đó" mà không phức tạp hoá logic. Tách hẳn 2 bước audio/quiz thành 2 trang riêng sau khi text đã ổn định, đơn giản và chắc chắn không bị lệch.

**Trạng thái `extraction_jobs.status` cần bổ sung** (chưa chốt tên cụ thể, để lúc viết migration): cần thêm ít nhất 2 trạng thái trung gian giữa `reviewed` và `imported` để phản ánh 2 bước mới (đang sinh/duyệt audio, đang sinh/duyệt quiz).

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
- **`quiz_questions` schema**: `id, lesson_id, type, order, payload jsonb`. Cột cố định tối thiểu (id/lesson_id/type/order), toàn bộ nội dung câu hỏi/đáp án của từng dạng nằm trong `payload` (jsonb) — shape khác nhau tuỳ `type` (ví dụ trắc nghiệm: `{question, choices[], correctIndex}`; sắp xếp từ: `{words[], correctOrder[]}`). Cho phép thêm dạng câu hỏi mới (đợt 2) sau này mà không cần migration.
- **Waveform trimmer**: thư viện/kỹ thuật cụ thể (khả năng cao `wavesurfer.js` cho waveform+trim trên web) sẽ quyết định lúc thực sự bắt tay code scope đó, không chốt trước.
- **Danh sách bài học User app**: nhóm theo quyển (`books`) — người dùng chọn quyển (Đương Đại 1/2/3) trước, rồi thấy danh sách bài của quyển đó. Khớp với model `lessons.book_id` đã có sẵn.

## 9. Việc CHƯA thiết kế chi tiết (để sau khi Admin ổn định, thuộc phạm vi User app)

- Chi tiết UI/thư viện waveform trimmer (quyết định lúc code)
- Cấu trúc bảng SRS progress + quiz attempts cho User app (field, migration) — thiết kế khi bắt đầu code User app
- Toàn bộ đợt 2 của Quiz (4 dạng "khó": tìm lỗi sai, dịch câu, phân biệt từ gần nghĩa, chọn trợ từ/lượng từ)

## 10. Thứ tự triển khai (scope nhỏ, duyệt từng scope trước khi sang scope tiếp theo)

1. Schema nền tảng: `vocabulary.dialogue_id`, `dialogue_lines.audio_url`, `grammar_examples.audio_url` + `example_type`, prompt Gemini giữ nguyên nhãn gốc trong `structure_note`
2. `extraction_jobs.status` mở rộng (pending/reviewed/audio_ready/quiz_ready/imported/failed) + guard theo trạng thái
3. Trang "Sinh & duyệt Audio" (TTS cho vocab+grammar_examples, nghe thử/tạo lại)
4. Trang "Sinh & duyệt Quiz" (bảng `quiz_questions`, Gemini sinh 6 dạng, admin xem/sửa)
5. Waveform trimmer (cắt audio hội thoại thật theo từng dòng)
6. App User (repo mới, sau khi Admin ổn định)

Quy tắc làm việc: code xong 1 scope → dừng lại để user kiểm tra/duyệt → mới sang scope tiếp theo. Không code nhiều scope liền một lúc.
