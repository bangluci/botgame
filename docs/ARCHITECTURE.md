# Kiến trúc — BANG! online

## Luồng tổng
1. Trình duyệt long-poll `/api/poll`. Server trả ảnh chụp gồm sảnh và `engine.viewFor` của đúng người đó, kèm giờ server để client đếm ngược.
2. Client vá DOM theo vùng: vùng nào có HTML đổi mới thay. Cách này giữ focus và vị trí cuộn nhật ký — [patch](../public/app.js#L69-L78) `current`.
3. Thao tác gửi `POST /api/action`, rồi server chạy `engine.apply` và `pushAll` để báo cả phòng.

## Engine (`engine.js`)
- Mỗi ván là một generator. Mỗi `yield prompt(...)` là một câu hỏi chờ một người trả lời — [main](../engine.js#L654-L666) `current`, [playTurn](../engine.js#L568-L627) `current`.
- Mọi ngẫu nhiên dùng PRNG có seed: [makeRng](../engine.js#L9-L12) `current`. [newGame](../engine.js#L677-L691) nhận `seed`, còn [apply](../engine.js#L692-L710) ghi `g.actions`. Seed + chuỗi action là đủ để dựng lại ván `current`.
- Kỹ năng chủ động khai báo trong [ACTIVE](../engine.js#L390-L423) (Sid, Chuck, Doc, José) với action `{ type: 'ability', name, cards?, target? }` `current`. Prompt `play`/`discard`/`dying` tự xử lý action này. Kỹ năng dùng "bất cứ lúc nào" (Sid) ngoài các prompt đó chạy ngay trong `apply` `current`.
- [abilitiesFor](../engine.js#L455-L467) tính kỹ năng dùng được ngay lúc đó, gửi trong `me.abilities` (kèm lá chọn được và mục tiêu). Banner sinh nút theo danh sách này, bot cũng chọn theo nó `current`.
- Kỹ năng bị động chen vào luồng chung: [gear](../engine.js#L27-L30) (Belle Star tắt đồ trên bàn), [apacheSafe](../engine.js#L33) (Apache Kid), [molly](../engine.js#L109-L111) (Molly Stark), [veraPick](../engine.js#L532-L546) (Vera mượn kỹ năng; `ab()` đọc thêm `p.vera`) `current`.
- Lỗi bất ngờ trong luật được [fault](../engine.js#L562-L566) ghi log rồi chơi tiếp. Lặp quá 20 lần thì dừng ván `current`.
- [playableFor](../engine.js#L719-L732) tính lá nào chơi được và nhắm được ai, gửi trong `me.playable` `current`.
- Sự kiện: lật từ vòng 2; lá có `final` nằm đáy chồng và giữ tới hết ván — [nextEvent](../engine.js#L548-L559) `current`.

## Cấu hình (`config.js`)
- Gộp 3 tầng: `config/*.json` ← `custom/*.json` ← override của phòng. Có cache theo mtime — [loadBase](../config.js#L33-L41) `current`.
- [validate](../config.js#L76-L119) kiểm kiểu và khoảng giá trị, đồng thời bắt buộc `target:"other"` cho bang/duel/steal `current`. [resolve](../config.js#L146-L173) giới hạn bộ bài trong khoảng 20–500 lá `current`.

## Bot (`ai.js`)
- Bot chỉ đọc view công khai. [observe](../ai.js#L28-L41) suy vai qua chuyện ai đánh ai, [score](../ai.js#L44-L52) cho điểm mục tiêu theo vai, [rank](../ai.js#L104-L157) xếp nước đi, rồi [decide](../ai.js#L177-L180) lấy nước hợp lệ đầu tiên `current`.

## Server (`server.js`)
- Phòng nằm trong RAM, đồng thời được ghi ra `data/rooms.json` (seed + action) qua [save](../server.js#L113-L126), và dựng lại bằng [load](../server.js#L128-L145) `current`.
- Bot và chơi thay dùng chung một cơ chế. [schedule](../server.js#L84-L97) hẹn giờ theo 3 kiểu: bot (khoảng 1 giây), người offline (15 giây), người đứng im (90 giây). Hết giờ thì [autoPlay](../server.js#L99-L110) gọi `ai.decide` `current`.
- Vào lại ghế cũ bằng đúng tên — [join](../server.js#L201-L218) `current`. Các lệnh có phiên nằm trong [command](../server.js#L220-L285) `current`.

## Client (`public/`)
- `store.js` giữ trạng thái chung và gọi API. `lobby.js` vẽ trang chủ + sảnh. `table.js` vẽ bàn chơi. `effects.js` lo âm thanh, vệt đạn, đếm ngược.
- [seatHtml](../public/table.js#L32-L51) xếp ghế trên hình elip theo đúng thứ tự lượt bắt đầu từ người ngồi sau mình. Màn hẹp chuyển sang lưới 2 cột `current`.
- [sync](../public/effects.js#L75-L103) so ảnh chụp cũ/mới để chạy hiệu ứng (trúng đạn, tới lượt, thắng) `current`.

## Chưa khớp thực tế
| Claim | Ý định | Trạng thái | Bằng chứng |
|---|---|---|---|
| (trống) | | | |
