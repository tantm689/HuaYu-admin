-- Sách "Đương Đại" quyển 2 trở đi có thêm dạng bài khoá "短文/Đoạn văn"
-- (đoạn văn tường thuật, không chia lời thoại theo người nói) bên cạnh dạng
-- "會話/Hội thoại" đã có. Đoạn văn dùng lại đúng bảng dialogues/dialogue_lines
-- hiện có (mỗi câu trong đoạn văn là một "dòng" không có speaker), chỉ khác
-- cách hiển thị cho user: hội thoại hiện từng dòng theo người nói, đoạn văn
-- hiện liền mạch thành một khối văn bản.

alter table dialogues add column kind text not null default 'dialogue'
  check (kind in ('dialogue', 'passage'));
