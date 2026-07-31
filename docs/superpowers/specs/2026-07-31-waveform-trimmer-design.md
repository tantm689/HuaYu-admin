# Thiết kế: Waveform Trimmer (cắt audio hội thoại theo từng dòng)

Ngày: 2026-07-31
Trạng thái: đã chốt hướng thiết kế, CHƯA triển khai code.

## 1. Bối cảnh và lý do

Sách gốc có audio thật cho mỗi đoạn hội thoại (không phải TTS), nhưng đó là 1 file duy nhất cho cả đoạn — chưa cắt theo từng dòng thoại. Tính năng Shadowing chế độ karaoke ở app User (kế hoạch tương lai, chưa code) cần audio riêng cho từng dòng (`dialogue_lines.audio_url`) để dừng đúng lúc, phát đúng câu.

Luồng bulk-upload audio hội thoại theo `audio_code` đã có sẵn và hoạt động (`app/api/books/[bookId]/audio/route.ts`, `lib/audio/matchDialogueAudio.ts`) — admin upload nhiều file mp3, hệ thống tự khớp tên file với `dialogues.audio_code`, lưu vào `dialogues.audio_url`. Waveform trimmer là bước tiếp theo: cắt file đó thành từng đoạn nhỏ theo dòng thoại.

## 2. Vị trí trong luồng điều hướng

Trang riêng theo từng dialogue: `/lessons/[lessonId]/edit/dialogues/[dialogueId]/trim`.

Mở từ tab "Bài khoá" trên trang Sửa bài học (`/lessons/[lessonId]/edit`) — thêm nút/link "Cắt audio hội thoại" trong khối accordion của mỗi dialogue đã có `audio_url` gốc (dialogue chưa có audio gốc thì không hiện nút này, vì chưa có gì để cắt).

## 3. Luồng UX

1. Trang tải file `dialogues.audio_url` (audio gốc cả đoạn), vẽ waveform bằng `wavesurfer.js` + plugin Regions.
2. Danh sách `dialogue_lines` theo `order` có sẵn hiển thị cố định bên cạnh waveform, mỗi dòng hiện `text_zh`.
3. Click 1 dòng trong danh sách → waveform tạo (nếu chưa có) hoặc focus vào 1 region tương ứng dòng đó. Admin kéo 2 mép region để chỉnh điểm đầu/cuối.
4. Nếu dòng đã có `start_time`/`end_time` từ lần cắt trước, region tự hiện lại đúng vị trí cũ ngay khi vào trang (không mất công đánh dấu lại từ đầu khi chỉ muốn sửa 1 dòng).
5. Nút "Nghe thử" phát riêng đúng đoạn đã đánh dấu cho dòng đang chọn, trước khi xác nhận.
6. Nút "Xác nhận" duy nhất ở cuối trang: xử lý mọi dòng có region hợp lệ (start < end) trong phiên hiện tại — không có xác nhận riêng từng dòng.

## 4. Xử lý cắt audio — client-side

Cắt bằng Web Audio API ngay trên trình duyệt khi bấm "Xác nhận":
- Decode file audio gốc (`AudioContext.decodeAudioData`) một lần.
- Với mỗi dòng có region: cắt đoạn `AudioBuffer` theo `start_time`/`end_time`, encode lại thành file (WAV hoặc mp3 tuỳ thư viện encode chọn lúc code — quyết định kỹ thuật nhỏ, không chốt trước).
- Upload từng file lên Supabase Storage bucket `audio`, path `dialogue-lines/{dialogueLineId}.mp3`.
- `UPDATE dialogue_lines SET audio_url = ..., start_time = ..., end_time = ...` cho từng dòng đã xử lý.

Lý do chọn client-side (không dùng FFmpeg server-side): hạ tầng hiện tại là Next.js serverless (Vercel), không có sẵn binary FFmpeg; Web Audio API xử lý được nhu cầu này (cắt đơn giản theo thời gian, không cần xử lý codec phức tạp) mà không cần thêm dependency hạ tầng nặng.

## 5. Schema — thêm 2 cột vào `dialogue_lines`

Migration mới: `start_time numeric`, `end_time numeric` (đơn vị giây, nullable — dòng chưa cắt thì cả 2 là null).

Lý do bắt buộc phải lưu 2 cột này (không chỉ lưu file đã cắt): để khôi phục đúng vùng đã đánh dấu khi admin quay lại sửa — không thể suy ngược vị trí gốc trong file đầy đủ chỉ từ file đã cắt ra.

## 6. Việc KHÔNG đổi

- `dialogues.audio_url` và luồng bulk-upload theo `audio_code` — giữ nguyên, đã hoạt động tốt, là nguồn input cho trang trimmer.
- Audio từ vựng/ví dụ ngữ pháp (TTS) — không liên quan, không đổi gì.
- Không có validate "đã cắt đủ hết mọi dòng chưa" — admin có thể cắt một phần, quay lại sau; không chặn gì ở tầng khác vì tính năng Shadowing dùng nó (app User) chưa tồn tại.

## 7. Việc CHƯA thiết kế (ngoài phạm vi)

- Thư viện/format encode cụ thể khi ghi file đã cắt (WAV vs mp3-encode-in-browser) — quyết định lúc code, không ảnh hưởng thiết kế tổng thể.
- Toàn bộ tính năng Shadowing karaoke ở app User (nơi thực sự dùng `dialogue_lines.audio_url`/`start_time`/`end_time`) — thuộc phạm vi App User, chưa bắt đầu.
