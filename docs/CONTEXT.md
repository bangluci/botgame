# Bối cảnh — BANG! online

## Hiện trạng (2026-10-20)
- Game chơi được trọn vẹn từ 2–10 người, có bot AI trong phòng, có máy chơi thay khi rớt mạng hoặc AFK. Phòng được lưu qua lần khởi động lại server — [server.js](../server.js) `current`.
- Giao diện theo hướng "áp phích truy nã · giấy in cũ". Chủ dự án chọn trong 4 mẫu thử và đã duyệt bằng mắt ngày 2026-10-20 — [public/style.css](../public/style.css) `current`, [public/table.css](../public/table.css) `current`.
- Luật cơ bản đã sửa theo FAQ chính thức (Duel, Beer, Vulture, Suzy, Sid, Renegade, Vendetta, Dynamite, Gold Rush, sự kiện) — [engine.js](../engine.js) `current`.

## Đã làm ngày 2026-10-20 (sau đó)
- Dodge City phần 1, bật trong sảnh: 7 nhân vật thụ động và 18 lá — [config/characters.json](../config/characters.json) `current`, [test-scenarios.js](../test-scenarios.js) `current`.
- Dodge City phần 2: khung kỹ năng chủ động chung và 8 nhân vật còn lại (Chuck, Doc, José, Pat, Vera, Belle, Apache, Molly), luật đối chiếu bang.dvgiochi.com và FAQ Dodge City — [engine.js](../engine.js#L390-L467) `current`. Đã chơi thử trên trình duyệt (Vera mượn Doc Holyday, bắn bằng nút kỹ năng).

## Đã làm ngày 2026-10-19 → 2026-10-20
- Audit 6 mảng (luật, engine, nội dung, bot, UX, server) bằng nhiều agent. Kết quả: 8 lỗi P0 (sập server, ván đơ) cùng khoảng 60 mục khác.
- Đã sửa hết P0, phần lớn P1 và các lỗi luật ở P2. Thêm bot AI, viết lại server và UI.
- Kiểm chứng:
  - fuzz 2–10 người qua 9 biến thể, có kiểm dựng lại ván từ seed;
  - mô phỏng AI;
  - smoke test server (restart giữa ván, vào lại, 413, URL dị dạng);
  - chơi thử trên trình duyệt ở cả desktop và mobile.

## Việc tiếp theo `building`
- Dodge City phần 3: primitive lá xanh / bỏ thêm lá / BANG! miễn giới hạn cho 22 lá còn lại.
- Luật 3 người chính thức của Dodge City (vai lật ngửa, mỗi người một mục tiêu).
- Gom ability/effect/mod vào một registry chung, để thêm kỹ năng chỉ phải sửa một chỗ.
- Lá/nhân vật thêm bằng "Nâng cao" của phòng chưa hiện trong các tab của sảnh.

## Cần chủ dự án quyết
- Đưa lên GitHub: máy chưa đăng nhập `gh`, cần chủ dự án chạy `gh auth login` một lần.
- Thời gian chờ trước khi máy chơi thay (15 giây offline / 90 giây đứng im) đang là hằng số trong `server.js`. Có muốn chỉnh trong sảnh không?

## Chưa khớp thực tế
| Claim | Ý định | Trạng thái | Bằng chứng |
|---|---|---|---|
| (trống) | | | |
