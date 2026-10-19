# Kiến trúc — BANG! online

## Luồng tổng
1. Trình duyệt long-poll `/api/poll`. Server trả ảnh chụp gồm sảnh và `engine.viewFor` của đúng người đó, kèm giờ server để client đếm ngược.
2. Client vá DOM theo vùng: vùng nào có HTML đổi mới thay. Cách này giữ focus và vị trí cuộn nhật ký — [patch](../public/app.js#L69-L78) `current`.
3. Thao tác gửi `POST /api/action`, rồi server chạy `engine.apply` và `pushAll` để báo cả phòng.

## Engine (`engine.js`)
- Mỗi ván là một generator. Mỗi `yield prompt(...)` là một câu hỏi chờ một người trả lời — [main](../engine.js#L513-L525) `current`, [playTurn](../engine.js#L428-L486) `current`.
- Mọi ngẫu nhiên dùng PRNG có seed: [makeRng](../engine.js#L9-L12) `current`. [newGame](../engine.js#L536-L549) nhận `seed`, còn [apply](../engine.js#L551-L568) ghi `g.actions`. Seed + chuỗi action là đủ để dựng lại ván `current`.
- Sid Ketchum dùng kỹ năng ngoài lượt được xử lý ngay trong `apply`, không qua prompt `current`.
- Lỗi bất ngờ trong luật được [fault](../engine.js#L422-L426) ghi log rồi chơi tiếp. Lặp quá 20 lần thì dừng ván `current`.
- [playableFor](../engine.js#L578-L592) tính lá nào chơi được và nhắm được ai, gửi trong `me.playable` `current`.
- Sự kiện: lật từ vòng 2; lá có `final` nằm đáy chồng và giữ tới hết ván — [nextEvent](../engine.js#L408-L419) `current`.

## Cấu hình (`config.js`)
- Gộp 3 tầng: `config/*.json` ← `custom/*.json` ← override của phòng. Có cache theo mtime — [loadBase](../config.js#L33-L41) `current`.
- [validate](../config.js#L76-L119) kiểm kiểu và khoảng giá trị, đồng thời bắt buộc `target:"other"` cho bang/duel/steal `current`. [resolve](../config.js#L146-L173) giới hạn bộ bài trong khoảng 20–500 lá `current`.

## Bot (`ai.js`)
- Bot chỉ đọc view công khai. [observe](../ai.js#L26-L39) suy vai qua chuyện ai đánh ai, [score](../ai.js#L42-L51) cho điểm mục tiêu theo vai, [rank](../ai.js#L90-L135) xếp nước đi, rồi [decide](../ai.js#L155-L158) lấy nước hợp lệ đầu tiên `current`.

## Server (`server.js`)
- Phòng nằm trong RAM, đồng thời được ghi ra `data/rooms.json` (seed + action) qua [save](../server.js#L113-L126), và dựng lại bằng [load](../server.js#L128-L145) `current`.
- Bot và chơi thay dùng chung một cơ chế. [schedule](../server.js#L84-L97) hẹn giờ theo 3 kiểu: bot (khoảng 1 giây), người offline (15 giây), người đứng im (90 giây). Hết giờ thì [autoPlay](../server.js#L99-L110) gọi `ai.decide` `current`.
- Vào lại ghế cũ bằng đúng tên — [join](../server.js#L201-L218) `current`. Các lệnh có phiên nằm trong [command](../server.js#L220-L285) `current`.

## Client (`public/`)
- `store.js` giữ trạng thái chung và gọi API. `lobby.js` vẽ trang chủ + sảnh. `table.js` vẽ bàn chơi. `effects.js` lo âm thanh, vệt đạn, đếm ngược.
- [seatHtml](../public/table.js#L27-L46) xếp ghế trên hình elip theo đúng thứ tự lượt bắt đầu từ người ngồi sau mình. Màn hẹp chuyển sang lưới 2 cột `current`.
- [sync](../public/effects.js#L75-L103) so ảnh chụp cũ/mới để chạy hiệu ứng (trúng đạn, tới lượt, thắng) `current`.

## Chưa khớp thực tế
| Claim | Ý định | Trạng thái | Bằng chứng |
|---|---|---|---|
| (trống) | | | |
