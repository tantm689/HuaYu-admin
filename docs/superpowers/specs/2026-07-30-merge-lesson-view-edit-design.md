# Thiết kế: Gộp trang xem và trang sửa bài học

Ngày: 2026-07-30
Trạng thái: đã chốt hướng thiết kế, CHƯA triển khai code.

## 1. Bối cảnh và lý do

Hiện tại có 2 trang cho một bài học: `/lessons/[lessonId]` (trang xem, server component, render accordion-style Bài khoá/Ngữ pháp, không có Từ vựng/Audio/Quiz) và `/lessons/[lessonId]/edit` (trang sửa, client component, 5 tab: Bài khoá/Từ vựng/Ngữ pháp/Audio/Quiz). Sau refactor lesson-scoped-audio-quiz vừa hoàn thành, trang edit đã có sẵn cơ chế `isEditable = data.status === "draft"` để tự ẩn/hiện mọi nút sửa/thêm/xoá/sinh theo trạng thái — nghĩa là trang edit đã tự đủ khả năng đóng vai trò cả trang xem lẫn trang sửa. Giữ 2 trang song song giờ là dư thừa, gây lệch nội dung hiển thị (trang xem thiếu Từ vựng/Audio/Quiz) và tăng chi phí bảo trì.

**Quyết định:** Gộp về một trang duy nhất tại `/lessons/[lessonId]/edit`. Trang xem cũ bị xoá, thay bằng redirect sang `/edit`. Giao diện tab hiện có của trang edit trở thành chuẩn duy nhất cho mọi trạng thái (draft/reviewed/published) — khác biệt duy nhất giữa các trạng thái là có/không có nút sửa, không phải giao diện khác nhau.

## 2. Header gộp (sticky, trên cùng)

- Dòng 1: tiêu đề bài học (`Bài N: tên`) + theme — giữ nguyên như trang edit hiện tại.
- Dòng 2 (hàng nút, wrap khi hẹp):
  - Badge trạng thái (từ `LessonStatusControls`, dùng lại y nguyên style/label/variant đã có trong `status-controls.tsx`).
  - Nút chuyển trạng thái theo state machine hiện có, không đổi logic:
    - `draft` → nút "Đánh dấu đã duyệt" (chuyển sang `reviewed`).
    - `reviewed` → nút "Xuất bản" (chuyển sang `published`) + nút "Chuyển về nháp" (lùi về `draft`).
    - `published` → nút "Chuyển về nháp" (lùi về `draft`).
  - Nút "Lưu" — chỉ hiện khi `isEditable` (tức `status === "draft"`), gọi `handleSave` như hiện tại.
- Khi `draft`: cả nút chuyển trạng thái và nút "Lưu" cùng hiển thị — không xung đột chức năng (Lưu ghi nội dung đang sửa vào DB; chuyển trạng thái chỉ đổi cột `status`, không đụng nội dung).
- Khi `reviewed`/`published`: chỉ còn badge + nút chuyển trạng thái, không có Lưu (vì `isEditable` là false, không có gì để lưu).

## 3. Điều hướng

- `app/(protected)/books/[bookId]/book-tabs.tsx:160`: đổi link lesson card từ `href={\`/lessons/${lesson.id}\`}` sang `href={\`/lessons/${lesson.id}/edit\`}`.
- Bỏ nút "Sửa" hiện có trong trang xem cũ — không còn cần điều hướng view→edit riêng vì chỉ còn 1 trang.
- `app/(protected)/lessons/[lessonId]/page.tsx`: thay toàn bộ nội dung hiện tại (accordion, VocabTable, ExampleBlock, SectionBlock, LessonDetailPage) bằng một redirect stub: gọi `redirect(\`/lessons/${lessonId}/edit\`)` từ `next/navigation`. Giữ file này (không xoá hẳn route) để link/bookmark cũ trỏ tới `/lessons/[lessonId]` không bị 404.

## 4. Xoá bỏ / giữ nguyên

- Xoá: toàn bộ JSX/component accordion-style trong `page.tsx` cũ (`VocabTable`, `ExampleBlock`, `SectionBlock`, phần render chính) — không còn dùng ở đâu khác.
- Giữ nguyên: `app/(protected)/lessons/[lessonId]/status-controls.tsx` (`LessonStatusControls`) — component độc lập, import thẳng vào `edit/page.tsx`, không cần sửa logic bên trong.
- Giữ nguyên: `app/api/lessons/[lessonId]/publish/route.ts`, `lib/db/updateLessonFull.ts`'s guard, toàn bộ 5 tab hiện có của trang edit, toàn bộ logic Audio/Quiz.

## 5. Việc KHÔNG đổi

- API routes (`publish`, `route.ts` PATCH, `audio/route.ts`, `quiz/route.ts`) — không đổi gì.
- Cơ chế `isEditable`/gating đã xây trong refactor trước — dùng lại nguyên vẹn.
- `LessonStatusControls`'s state machine (draft↔reviewed↔published, cả 2 chiều lùi về draft) — không đổi.

## 6. Việc CHƯA thiết kế (ngoài phạm vi)

- Không có thay đổi migration/schema nào cần thiết cho việc gộp trang này (thuần UI/routing).
