# Kiến trúc — BANG! online

## Luồng tổng
1. Trình duyệt long-poll `/api/poll`. Server trả ảnh chụp gồm sảnh và `engine.viewFor` của đúng người đó, kèm giờ server để client đếm ngược.
2. Client vá DOM theo vùng: vùng nào có HTML đổi mới thay. Cách này giữ focus và vị trí cuộn nhật ký — [patch](../public/app.js#L69-L78) `current`.
3. Thao tác gửi `POST /api/action`, rồi server chạy `engine.apply` và `pushAll` để báo cả phòng.

## Engine (4 file)
- `rules.js`: trạng thái chung (PRNG, rút/bỏ bài, khoảng cách, `gear`, `ab`). `combat.js`: rút!, sát thương, chết, đỡ đòn, BANG!, Duel. `abilities.js`: kỹ năng chủ động. `engine.js`: chơi lá, lượt, API, view `current`.
- Mỗi ván là một generator. Mỗi `yield prompt(...)` là một câu hỏi chờ một người trả lời — [main](../engine.js#L380-L392) `current`, [playTurn](../engine.js#L292-L353) `current`.
- Mọi ngẫu nhiên dùng PRNG có seed: [makeRng](../rules.js#L7-L10) `current`. [newGame](../engine.js#L403-L419) nhận `seed`, còn [apply](../engine.js#L420-L438) ghi `g.actions`. Seed + chuỗi action là đủ để dựng lại ván `current`.
- Kỹ năng chủ động khai báo trong [ACTIVE](../abilities.js#L7-L40) (Sid, Chuck, Doc, José) với action `{ type: 'ability', name, cards?, target? }` `current`. Prompt `play`/`discard`/`dying` tự xử lý action này. Kỹ năng dùng "bất cứ lúc nào" (Sid) ngoài các prompt đó chạy ngay trong `apply` `current`.
- [abilitiesFor](../abilities.js#L72-L84) tính kỹ năng dùng được ngay lúc đó, gửi trong `me.abilities` (kèm lá chọn được và mục tiêu). Banner sinh nút theo danh sách này, bot cũng chọn theo nó `current`.
- Kỹ năng bị động chen vào luồng chung: [gear](../rules.js#L25-L28) (Belle Star tắt đồ trên bàn), [apacheSafe](../rules.js#L31) (Apache Kid), [molly](../rules.js#L110-L112) (Molly Stark), [veraPick](../engine.js#L256-L269) (Vera mượn kỹ năng; `ab()` đọc thêm `p.vera`), [vultureSplit](../combat.js#L59-L73) (nhiều Vulture Sam chia bài người chết) `current`.
- Lỗi bất ngờ trong luật được [fault](../engine.js#L286-L290) ghi log rồi chơi tiếp. Lặp quá 20 lần thì dừng ván `current`.
- [playableFor](../engine.js#L450-L470) tính lá nào chơi được và nhắm được ai, gửi trong `me.playable` (kèm `cost` cho lá "+1", `immune` cho Apache Kid) `current`.
- Sự kiện: lật từ vòng 2; lá có `final` nằm đáy chồng và giữ tới hết ván — [nextEvent](../engine.js#L272-L283) `current`.
- Lá xanh lá (`kind: "green"`): đặt xuống ghi `placed = g.turnNo`, [ready](../rules.js#L35) khi đã sang lượt khác. Lá có `use` dùng bằng action `{ type: 'use', card, target?, zone?, cardId? }` qua [planUse](../engine.js#L67-L76) / [execUse](../engine.js#L77-L83); [greensFor](../engine.js#L472-L478) gửi danh sách dùng được trong `me.greens` `current`.
- Lá xanh lá có `react: "missed"` đỡ đòn ngoài lượt ngay từ trên bàn: [respondCards](../combat.js#L131-L139), [defend](../combat.js#L141-L167) (kèm `reactDraw` của Dodge/Bible) `current`.
- Lá "+1" (`cost: 1`): action `play` mang thêm `extra` là id lá bỏ kèm, kiểm trong [planPlay](../engine.js#L9-L32) `current`.
- Luật 3 người Dodge City (`g.threeP`): vai lật ngửa, Deputy đi trước; [threeKill](../combat.js#L76-L86) xử thắng khi tự tay hạ đúng mục tiêu, gọi từ [die](../combat.js#L87-L111) `current`.

## Cấu hình (`config.js`)
- Gộp 3 tầng: `config/*.json` ← `custom/*.json` ← override của phòng. Có cache theo mtime — [loadBase](../config.js#L36-L41) `current`.
- [validate](../config.js#L79-L146) kiểm kiểu và khoảng giá trị, bắt buộc `target:"other"` cho bang/duel/steal, và chặn tổ hợp sai của lá xanh lá (`use`, `react`) / lá "+1" `current`. [resolve](../config.js#L173-L202) giới hạn bộ bài trong khoảng 20–500 lá `current`.

## Bot (`ai.js`)
- Bot chỉ đọc view công khai. [observe](../ai.js#L28-L41) suy vai qua chuyện ai đánh ai, [score](../ai.js#L45-L54) cho điểm mục tiêu theo vai (ván 3 người: ưu tiên đúng mục tiêu của mình), [rank](../ai.js#L129-L193) xếp nước đi, rồi [decide](../ai.js#L213-L216) lấy nước hợp lệ đầu tiên `current`.

## Server (`server.js`)
- Phòng nằm trong RAM, đồng thời được ghi ra `data/rooms.json` (seed + action) qua [save](../server.js#L114-L128), và dựng lại bằng [load](../server.js#L130-L147) `current`.
- Bot và chơi thay dùng chung một cơ chế. [schedule](../server.js#L84-L98) hẹn giờ theo 3 kiểu: bot (khoảng 1 giây), người offline (15 giây), người đứng im (90 giây). Hết giờ thì [autoPlay](../server.js#L99-L109) gọi `ai.decide` `current`.
- Vào lại ghế cũ bằng đúng tên — [join](../server.js#L203-L219) `current`. Các lệnh có phiên nằm trong [command](../server.js#L222-L287) `current`.

## Client (`public/`)
- `store.js` giữ trạng thái chung và gọi API. `lobby.js` vẽ trang chủ + sảnh. `table.js` vẽ bàn chơi. `effects.js` lo âm thanh, vệt đạn, đếm ngược.
- [seatHtml](../public/table.js#L39-L59) xếp ghế trên hình elip theo đúng thứ tự lượt bắt đầu từ người ngồi sau mình. Màn hẹp chuyển sang lưới 2 cột `current`.
- [greenBtns](../public/table.js#L102) sinh nút "Dùng …" từ `me.greens`; lá "+1" chọn thêm lá bỏ kèm ngay trên tay (dấu "BỎ KÈM") `current`.
- [sync](../public/effects.js#L82-L118) so ảnh chụp cũ/mới để chạy hiệu ứng (trúng đạn, tới lượt, thắng) `current`.

## Chưa khớp thực tế
| Claim | Ý định | Trạng thái | Bằng chứng |
|---|---|---|---|
| (trống) | | | |
