# Spec: Câu chat nhanh trong khay emote

**Date**: 2026-10-21

## 1. Bối cảnh

**Origin**:

- "Câu chat nhanh bấm 1 phát ("Bắn tao làm gì!", "Tao là Deputy, tin tao") cho người chơi trên điện thoại." Chủ dự án chọn "Câu chat nhanh", đặt trong khay emote 😀.

**Problem**:

- Trên điện thoại, muốn nói một câu thì phải mở ngăn nhật ký, sang tab Chat rồi gõ. Đang tới lượt thì không kịp.

**Decisions**:

- Câu nhanh nằm trong khay 😀, dưới hàng emote. Không đặt thành chíp trên ô chat, vì phải mở ngăn nhật ký trước mới thấy.
- Chạm 1 câu là gửi thành tin chat thường qua `/api/chat`, nên có bong bóng và có trong tab Chat. Không thêm lệnh server mới.
- Danh sách câu cố định trong client. Không cho người chơi tự sửa.

## 2. Nguồn dữ liệu chuẩn

**Canonical**:

- Danh sách 8 câu là hằng số trong `public/chat.js`.
- Tin gửi đi đi đúng đường của chat chữ: `room.chat` trên server.

**KHÔNG phải nguồn chuẩn**:

- Không lưu câu nhanh riêng ở server. Server không phân biệt tin gõ tay với câu nhanh.

## 3. Kiến trúc giải pháp

**Components**:

- **Danh sách câu**:
  - "Bắn tao làm gì!"
  - "Tao là Deputy, tin tao 🤠"
  - "Ai là Renegade?"
  - "Bắn Sheriff đi!"
  - "Cứu tao với 🍺"
  - "Xin lỗi, bắn nhầm 😅"
  - "Đợi tí, đang nghĩ…"
  - "GG 👏"
- **Khay 😀**: thêm vạch ngăn và lưới 2 cột nút câu nhanh dưới hàng emote. Chạm 1 nút thì đóng khay và gửi câu đó.

## 4. Failure modes

- Khi bấm câu nhanh dồn dập hơn 1 tin/giây, hệ thống phải hiện thông báo "Từ từ thôi 😅" từ server và không gửi, giống chat gõ tay.
- Khi gửi lỗi mạng, hệ thống phải hiện thông báo lỗi, khay vẫn đóng, người chơi bấm lại được.

## 5. Hoàn thành & Loại trừ

**Done**:

- Bấm 😀 thấy 8 câu dưới hàng emote. Chạm 1 câu thì máy khác thấy bong bóng trên ghế người gửi và tin trong tab Chat.
- Trên mobile 375px, khay vừa màn hình, nút đủ to để bấm bằng ngón tay (cao từ 40px).

**Not done**:

- Không cho tự thêm hay sửa câu.
- Người xem không có nút 😀, nên dùng ô chat như cũ.
- Sảnh không có khay emote.

## 6. Câu hỏi mở

- **ASSUMPTION**: 8 câu trên là đủ dùng. Muốn đổi câu thì sửa hằng số trong `chat.js`.
