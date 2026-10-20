# Bối cảnh — BANG! online

## Hiện trạng (2026-10-20)
- Game chơi được trọn vẹn từ 2–10 người, có bot AI trong phòng, có máy chơi thay khi rớt mạng hoặc AFK. Phòng được lưu qua lần khởi động lại server — [server.js](../server.js) `current`.
- Giao diện theo hướng "áp phích truy nã · giấy in cũ". Chủ dự án chọn trong 4 mẫu thử và đã duyệt bằng mắt ngày 2026-10-20 — [public/style.css](../public/style.css) `current`, [public/table.css](../public/table.css) `current`.
- Luật cơ bản đã sửa theo FAQ chính thức (Duel, Beer, Vulture, Suzy, Sid, Renegade, Vendetta, Dynamite, Gold Rush, sự kiện) — [engine.js](../engine.js) `current`.

## Đã làm ngày 2026-10-20 (sau đó)
- Dodge City phần 1, bật trong sảnh: 7 nhân vật thụ động và 18 lá — [config/characters.json](../config/characters.json) `current`, [test-scenarios.js](../test-scenarios.js) `current`.
- Dodge City phần 2: khung kỹ năng chủ động chung và 8 nhân vật còn lại (Chuck, Doc, José, Pat, Vera, Belle, Apache, Molly), luật đối chiếu bang.dvgiochi.com và FAQ Dodge City — [abilities.js](../abilities.js) `current`. Đã chơi thử trên trình duyệt (Vera mượn Doc Holyday, bắn bằng nút kỹ năng).
- Vera mượn Vulture Sam khi Vulture Sam thật còn sống: chia bài người chết theo FAQ — [vultureSplit](../combat.js#L59-L73) `current`.
- Tách `engine.js` thành `rules.js` / `combat.js` / `abilities.js` để mỗi file dưới 800 dòng — [ARCHITECTURE.md](ARCHITECTURE.md) `current`.
- Dodge City phần 3: 22 lá còn lại (lá xanh lá, lá "+1", Punch, Dodge, Brawl…) và luật 3 người chính thức (bật mặc định khi chơi Dodge City 3 người, tắt được trong sảnh) — [config/cards.json](../config/cards.json) `current`, [docs/specs/2026-10-20-dodge-city-phan-3-design.md](specs/2026-10-20-dodge-city-phan-3-design.md) `current`. Kiểm chứng: 26 kịch bản, fuzz 300 ván + 3×400 ván, AI 200 ván, chơi thử trên trình duyệt (dùng lá xanh lá, đỡ bằng Bible trên bàn, Springfield/Brawl bỏ kèm, mobile).

- Hoàn thiện + tối ưu:
  - registry khối dựng sẵn có mô tả, kèm kịch bản kiểm registry khớp code — [config.js](../config.js#L9-L46) `current`;
  - lá/nhân vật/sự kiện tự thêm qua "Nâng cao" hiện trong các tab của sảnh `current`;
  - chủ phòng chỉnh giờ máy chơi thay ở tab Luật → Phòng `current`;
  - gzip + chỉ gửi `defs` một lần mỗi ván. Gói poll ván Dodge City 6 người giảm từ 23 KB xuống 2,1 KB. Đo engine: `viewFor` 0,1 ms, bot 0,05 ms mỗi nước nên không cần tối ưu CPU — [server.js](../server.js#L68-L82) `current`.

## Đã làm ngày 2026-10-19 → 2026-10-20
- Audit 6 mảng (luật, engine, nội dung, bot, UX, server) bằng nhiều agent. Kết quả: 8 lỗi P0 (sập server, ván đơ) cùng khoảng 60 mục khác.
- Đã sửa hết P0, phần lớn P1 và các lỗi luật ở P2. Thêm bot AI, viết lại server và UI.
- Kiểm chứng:
  - fuzz 2–10 người qua 9 biến thể, có kiểm dựng lại ván từ seed;
  - mô phỏng AI;
  - smoke test server (restart giữa ván, vào lại, 413, URL dị dạng);
  - chơi thử trên trình duyệt ở cả desktop và mobile.

## Việc tiếp theo `building`
- (trống)

## Cần chủ dự án quyết
- (trống)

## Chưa khớp thực tế
| Claim | Ý định | Trạng thái | Bằng chứng |
|---|---|---|---|
| (trống) | | | |
