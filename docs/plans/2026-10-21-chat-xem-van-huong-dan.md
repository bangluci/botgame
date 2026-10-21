# Plan: Chat chữ, chế độ xem, xem lại ván, hướng dẫn người mới

**Spec**: [2026-10-21-chat-xem-van-huong-dan-design](../specs/2026-10-21-chat-xem-van-huong-dan-design.md)
**Goal**: Thêm chat chữ, người xem vào giữa ván, xem lại 5 ván gần nhất bằng tua bàn chơi, và hướng dẫn chỉ tay lần đầu vào ván.
**Architecture**:

- Engine không đổi. `engine.viewFor` gọi với id không có ghế đã chỉ trả thông tin công khai, nên người xem dùng lại được.
- Chat, người xem và lịch sử ván nằm trong object phòng của [server.js](../../server.js), lưu cùng `data/rooms.json`. Xem lại ván thì server dựng lại từ seed + k action mỗi lần client xin bước k.
- Client thêm 3 module:
  - [chat.js](../../public/chat.js);
  - [replay.js](../../public/replay.js);
  - [tour.js](../../public/tour.js).
- Vẽ bàn chơi dùng lại [table.js](../../public/table.js). `G()` và `meId()` trỏ sang ảnh chụp xem lại khi đang ở chế độ xem lại.

## 1. Kết quả mong đợi

- Chat 2 chiều có bong bóng và tab Chat, ở cả sảnh lẫn ván. Verify bằng:
  - `node test-server.js`, mục chat;
  - kiểm trên trình duyệt.
- Người vào giữa ván bằng tên mới thì thành người xem. Không thấy bài trên tay ai, không gửi được lệnh chơi. Về sảnh thì thành người chơi. Verify bằng:
  - `node test-server.js`, mục người xem;
  - kịch bản `Ảnh chụp không ghế chỉ có thông tin công khai` trong [test-scenarios.js](../../test-scenarios.js).
- Ván xong được cất vào lịch sử (tối đa 5 ván), tua được từ bước 0 tới bước cuối, đổi được ghế xem. Verify bằng:
  - `node test-server.js`, mục xem lại: bước cuối có `winner` trùng ván gốc;
  - kiểm trên trình duyệt.
- Lần đầu vào ván hiện 6 bước hướng dẫn, lần sau không hiện, mở lại được từ ❓. Verify bằng kiểm trên trình duyệt (xoá `localStorage` rồi vào lại).
- `npm test` và `npm run test:ai` vẫn qua hết.

## 2. Nguồn dữ liệu chuẩn

**Canonical data**:

- `room.chat`: 50 tin gần nhất, có `id` tăng theo `room.chatSeq`.
- Thành viên phòng có cờ `spectator`.
- `room.history`: 5 ván gần nhất, mỗi ván gồm id, thời điểm xong, members, settings, seed, actions, winner.
- Seed + action là nguồn duy nhất để dựng ảnh chụp xem lại.

**Lấy từ**: object phòng trên server, đọc và ghi qua `writeRooms` / `load`.

**KHÔNG lấy từ**:

- `g.log`: chat không được nằm trong log engine, vì log phải dựng lại được từ seed.
- `localStorage`: chỉ dùng cho cờ đã xem hướng dẫn.
- Client không tự quyết người xem thấy gì.

## 3. Business rules & invariants

- **Chat hợp lệ**: 1–200 ký tự sau khi bỏ ký tự điều khiển và cắt trắng; mỗi người tối đa 1 tin/giây. Verify bằng `node test-server.js` (rỗng, 201 ký tự, hai tin liền nhau đều bị 400).
- **Chat chỉ gửi phần mới**: poll mang `c=<id tin mới nhất client có>`, server chỉ trả tin có id lớn hơn. Verify bằng `node test-server.js` (poll lần hai với `c` mới nhất thì `chat` rỗng).
- **Người xem không có ghế**: không nằm trong `gameMembers`, `/api/action` trả lỗi "Bạn đang xem". Verify bằng `node test-server.js`.
- **Giới hạn người xem**: tối đa 10. Ở sảnh mà đầy ghế thì vẫn báo "Phòng đã đầy". Verify bằng `node test-server.js`.
- **Lịch sử không trùng**: một ván chỉ cất một lần, kể cả khi server khởi động lại lúc ván đã xong. Khoá chống trùng là seed + số action. Verify bằng `node test-server.js` (`history.length === 1` sau nhiều lần poll).
- **Xem lại không làm sập server**: engine ném lỗi giữa chừng thì trả bước cuối dựng được kèm `error`. Verify bằng `node test-server.js` (ván có action hỏng ở giữa).

## 4. Phạm vi / Ngoài phạm vi

**Làm**:

- Chat ở sảnh và bàn chơi, bong bóng trên ghế, tab Chat.
- Người xem: vào giữa ván, giao diện chỉ xem, về sảnh thì lên ghế.
- Lịch sử 5 ván. Màn xem lại gồm: ◀ ▶, tự chạy, thanh kéo, chọn ghế, thoát.
- Hướng dẫn chỉ tay 6 bước.
- Kịch bản test engine, test tích hợp server mới [test-server.js](../../test-server.js), thêm vào `npm test`.

**KHÔNG làm**:

- Chat riêng, chặn người, lọc từ.
- Người xem thấy hết bài.
- Tải ván về máy, link xem lại công khai.
- Ván tập có kịch bản.
- Đổi luật hay định dạng action của engine.

## 5. Rủi ro & Quyết định còn mở

**Đã chốt có rủi ro**:

- Mỗi lần xin bước k, xem lại dựng lại từ đầu (O(k), khoảng 10 ms với ván 450 bước). Rủi ro: nhiều người tua cùng lúc trên ván rất dài sẽ tốn CPU. Ghi chú `ponytail:` ngay tại đó: cần thì cache ván đã dựng theo từng người xem.
- Ván ghi bằng phiên bản luật cũ có thể dựng lệch mà không ném lỗi. Rủi ro: tua ra ván khác thật. Chấp nhận, vì lịch sử chỉ sống theo phòng (tối đa 12 giờ).
- Hướng dẫn là lớp phủ chặn bấm. Rủi ro: tới lượt người mới lúc đang xem hướng dẫn thì đồng hồ vẫn chạy. Có nút "Bỏ qua", và mặc định 90 giây mới chơi thay.

**Chưa chốt cần resolve**:

- (trống)

## 6. Các task

### Task 1: Server — chat

**File(s)**:

- [server.js](../../server.js)

**Decision**:

- Lệnh `POST /api/chat { text }`.
- Phòng có `chat: []` và `chatSeq: 0`.
- Mỗi tin là `{ id, pid, name, text, t, spec }`.
- Snapshot có `chat`: các tin có `id > c`.
- `writeRooms` / `load` lưu `chat` và `chatSeq`.

**Build**:

- `newRoom` thêm `chat: []` và `chatSeq: 0`.
- Thêm case `/api/chat` trong `command`:
  - làm sạch chữ: thay ký tự điều khiển bằng khoảng trắng, cắt trắng;
  - kiểm 1–200 ký tự;
  - chặn gửi nhanh bằng `m.lastChat` (1000 ms);
  - đẩy tin, cắt còn 50 tin.
- `poll` đọc `c` từ query, `snapshot(room, m, haveDefs, haveChat)` trả `chat`.
- `writeRooms` ghi `chat` và `chatSeq`. `load` đã trải `...r` nên tự khôi phục.

**Verify**:

- `node --check server.js` → không lỗi.
- `node test-server.js` (Task 8), mục chat → in `chat OK`.

---

### Task 2: Client — module chat và sảnh

**File(s)**:

- [chat.js](../../public/chat.js) (mới)
- [app.js](../../public/app.js)
- [lobby.js](../../public/lobby.js)

**Phụ thuộc**: Task 1

**Decision**:

- `chat.js` xuất các hàm sau:
  - `chatHtml()`: danh sách tin + ô nhập `#chat-input`;
  - `chatBubble(pid)`: tin của pid còn trong 6 giây, cắt 60 ký tự;
  - `sendChat()`;
  - `mergeChat(list)`.
- `st.chat` giữ tối đa 50 tin. `st.ui.chatDraft` giữ chữ đang gõ.

**Build**:

- `connect()` gửi thêm `&c=<id tin cuối của st.chat>` và gọi `mergeChat(j.data.chat)`. Vòng poll mới thì reset `st.chat = []`.
- `app.js`:
  - listener `input` lưu `st.ui.chatDraft` khi `id === 'chat-input'`;
  - `keydown` Enter trên `#chat-input` thì gọi `sendChat()`.
- `lobby.js`: panel người chơi thêm khung chat (`chatHtml()`) ở dưới.

**Verify**:

- Kiểm trên trình duyệt với 2 tab cùng phòng: gõ ở tab A, Enter → tab B thấy tin trong khung chat của sảnh trong khoảng 1 giây.

---

### Task 3: Client — chat trên bàn chơi

**File(s)**:

- [table.js](../../public/table.js)
- [table.css](../../public/table.css)

**Phụ thuộc**: Task 2

**Decision**:

- Cột nhật ký có 2 tab: "📜 Nhật ký" và "💬 Chat" (`st.ui.logTab`).
- Tab Chat có chấm báo tin chưa đọc.
- Bong bóng trên ghế và trên mebar hiện tin mới nhất (emote hoặc chat).

**Build**:

- `logHtml()` vẽ đầu tab, tab Chat dùng `chatHtml()`.
- `seatHtml` và `mebarHtml` dùng `chatBubble(p.id)` khi tin chat mới hơn emote.
- Thêm action `log-tab` vào `tableActions`.
- CSS cho `.log-tabs`, `.chat-list`, `.chat-form`, bong bóng chữ (`.bubble.text`: rộng tối đa 180px, xuống dòng).

**Verify**:

- Kiểm trên trình duyệt (desktop + mobile 375px): tin từ tab B hiện bong bóng trên ghế người gửi ở tab A và nằm trong tab Chat. Trên mobile thì nằm trong modal nhật ký.

---

### Task 4: Server — người xem

**File(s)**:

- [server.js](../../server.js)

**Decision**:

- Thành viên có `spectator: true`.
- `MAX_SPECTATORS = 10`.
- Hàm `players(room)` lọc người không phải người xem.

**Build**:

- `join`: không trùng tên mà phòng đang chơi thì kiểm số người xem < 10 rồi tạo thành viên `spectator: true`. Ở sảnh thì kiểm đầy ghế bằng `players(room).length`.
- Các lệnh sửa theo người xem:
  - `/api/action` từ chối người xem: "Bạn đang xem — ván sau mới có ghế";
  - `/api/start`: `gameMembers` và số người tối thiểu tính từ `players(room)`;
  - `/api/addbot` tính đầy ghế bằng `players(room)`.
- `/api/lobby`: người xem lên ghế theo thứ tự vào phòng, tới khi đủ `maxPlayers()`.
- Rời phòng và mời ra:
  - `/api/leave` và `/api/kick` với người xem thì xoá khỏi `members` (không đặt `left`).
- `firstHuman`: ưu tiên người không phải người xem.
- `lobbyView.members` thêm `spectator`. `writeRooms` lưu `spectator`.

**Verify**:

- `node test-server.js`, mục người xem → in `spectator OK`.

---

### Task 5: Client — giao diện người xem

**File(s)**:

- [table.js](../../public/table.js)
- [lobby.js](../../public/lobby.js)

**Phụ thuộc**: Task 4

**Decision**:

- `meP()` trả `null` với người xem.
- Ghế xếp từ Sheriff khi không có ghế.
- Banner người xem: "👀 Đang xem — ván sau bạn được chia bài".

**Build**:

- `seatOrder()` khi không có ghế thì bắt đầu từ người có `role === 'sheriff'`.
- Các vùng của người xem:
  - `mebarHtml()` trả thẻ người xem;
  - `handHtml()` trả rỗng;
  - `bannerHtml()` trả banner người xem;
  - `dockHtml()` trả rỗng.
- `logHtml()` không dùng `meP().name` khi `null`.
- `endModal` cho người xem chỉ hiện nút về sảnh khi ván xong.
- `topbarHtml` ẩn 😀 với người xem. Emote là tín hiệu của người chơi; người xem dùng chat.
- `lobby.js`:
  - danh sách thành viên ghi "👀 xem" cho người xem;
  - đếm `n/max` chỉ tính người chơi.

**Verify**:

- Kiểm trên trình duyệt: tab thứ ba vào phòng đang chơi bằng tên mới → thấy bàn, không có tay bài hay nút hành động, banner người xem. Console không lỗi.

---

### Task 6: Server — lịch sử ván và lệnh xem lại

**File(s)**:

- [server.js](../../server.js)

**Decision**:

- `room.history` giữ tối đa 5 ván, mới nhất đứng đầu.
- `GET /api/replay?room&token&id&step&pid&d` trả `{ total, step, view, error? }`.
- `view` là `viewFor(g_k, pid)`, cộng vai thật của mọi người, cộng `defs` theo khoá `d`.

**Build**:

- `archive(room)` gọi trong `pushAll`:
  - ván có `winner` mà chưa có trong `history` (so seed + số action) thì cất `{ id: rid(), ended, members: room.gameMembers, settings: room.settings, seed, actions: [...g.actions], winner: { text, players } }`;
  - cắt còn 5 ván.
- `replay(req, res, url)`:
  - xác thực bằng `auth`, tìm ván theo `id`, không có thì 400 "Không còn ván này";
  - kẹp `step` vào khoảng 0…total;
  - dựng `newGame(members, settings, seed)` rồi `apply` từng action trong try/catch: lỗi thì dừng, ghi `error` "Ván này ghi bằng phiên bản luật cũ, chỉ xem lại được tới bước N";
  - `pid` mặc định là người đầu tiên;
  - ghi chú `ponytail:` về việc dựng lại từ đầu.
- `lobbyView` thêm `history`: tóm tắt `{ id, ended, text, steps, n }`.
- `writeRooms` lưu `history`.

**Verify**:

- `node test-server.js`, mục xem lại → in `replay OK` (bước cuối có `winner.text` trùng `history[0].text`, bước 0 có `round` bằng 0 hoặc 1).

---

### Task 7: Client — màn xem lại

**File(s)**:

- [replay.js](../../public/replay.js) (mới)
- [app.js](../../public/app.js)
- [cards.js](../../public/cards.js)

**Phụ thuộc**: Task 6

**Decision**:

- `st.replay = { id, total, step, pid, view, playing, error }`.
- `G()` trả `st.replay.view` khi đang xem lại.
- `meId()` trong table.js đọc `st.replay.pid` khi đang xem lại.
- `mine()` luôn `false` khi đang xem lại.

**Build**:

- `replay.js` xuất các hàm sau:
  - `openReplay(id)`, `goStep(k)`, `togglePlay()` (tự chạy mỗi 800 ms), `setSeat(pid)`, `closeReplay()`;
  - `replayBar()`: ◀, ▶, ⏯, `<input type="range">`, `<select>` ghế, ✕;
  - `replayActions`.
- Mỗi lần gọi `/api/replay` gửi khoá `defs` như poll.
- Lỗi trả về:
  - `/api/replay` trả 400 (ví dụ "Không còn ván này") → `toast` lỗi rồi `closeReplay()`;
  - có `error` → hiện dòng cảnh báo trong banner xem lại và chặn thanh kéo ở `step`.
- `app.js render()`:
  - có `st.replay` thì vẽ bàn với `g-top = replayBar()` và `g-banner` = bước k/N + dòng log cuối;
  - bỏ `sync()` để không phát âm thanh;
  - gộp `replayActions` vào bộ phát thao tác;
  - `change` / `input` trên thanh kéo và ô chọn ghế gọi `goStep` / `setSeat`.
- `cards.js`: `G()` xét `st.replay`.
- `table.js`: `meId` / `mine` xét `st.replay`. Phần sửa nhỏ này nằm trong task này.
- `endModal` thêm nút "🎞️ Xem lại ván" mở `history[0]`.
- Sảnh thêm mục "Ván gần đây" với nút "Xem lại" (sửa [lobby.js](../../public/lobby.js), vài dòng).

**Verify**:

- Kiểm trên trình duyệt: ván kết thúc → "Xem lại ván" → kéo tới cuối thì banner thắng trùng kết quả. Đổi ghế thì thấy bài người khác. Tự chạy thì đi từng bước. ✕ thì về sảnh.

---

### Task 8: Test tích hợp server

**File(s)**:

- [test-server.js](../../test-server.js) (mới)
- [package.json](../../package.json)
- [test-scenarios.js](../../test-scenarios.js)

**Phụ thuộc**: Task 1, Task 4, Task 6

**Decision**:

- `test-server.js` spawn `node server.js` với `PORT` ngẫu nhiên 4100–4900, `BANG_DATA` trong thư mục tạm, `BOT_DELAY_MS=0`.
- Gọi API bằng `fetch` của Node 18+, lỗi thì in bước hỏng và thoát mã 1.

**Build**:

- Trước khi spawn, ghi sẵn vào `BANG_DATA` một phòng `HONG` có 1 ván trong `history` với action thứ 3 là rác. Phòng này có sẵn 1 thành viên với token biết trước.
- Kịch bản:
  0. `/api/replay` của phòng `HONG` ở bước cuối → có `error` chứa "phiên bản luật cũ", `step` bằng 2.
  1. A tạo phòng, thêm 3 bot, chia bài.
  2. B vào bằng tên mới → `spectator`. Poll của B có `game.me === null`. `/api/action` của B → 400.
     - Thêm 9 người xem nữa bằng tên khác: được.
     - Người xem thứ 11 → 400 "Phòng đã đủ người xem".
  3. Chat:
     - B gửi "chào" thì được;
     - gửi tiếp ngay thì 400;
     - chuỗi rỗng thì 400;
     - 201 ký tự thì 400;
     - poll với `c` mới nhất thì `chat` rỗng.
  4. A rời ván → máy chơi hết. Poll B tới khi có `winner`, chờ tối đa 60 giây.
  5. `lobby.history.length === 1`.
  6. `/api/replay` ở bước cuối: `view.winner.text` trùng. Ở bước 0 không lỗi. `id` sai → 400.
  7. B về sảnh → không còn `spectator`.
- `package.json`: `"test": "node test-scenarios.js && node test-server.js && node test.js 300"`.
- `test-scenarios.js` thêm kịch bản `Ảnh chụp không ghế chỉ có thông tin công khai`: `viewFor(g, 'người-ngoài')` có `me === null`, tay bài chỉ là số, chỉ lộ vai Sheriff.

**Verify**:

- `node test-server.js` → in `chat OK`, `spectator OK`, `replay OK`, thoát mã 0.
- `npm test` → `OK 28/28 kịch bản` và `OK 300/300 ván`.

---

### Task 9: Hướng dẫn chỉ tay

**File(s)**:

- [tour.js](../../public/tour.js) (mới)
- [app.js](../../public/app.js)
- [table.css](../../public/table.css)

**Decision**:

- 6 bước, mỗi bước là `{ sel, title, text }`:
  1. `.role-card`;
  2. `#g-hand`;
  3. `#g-seats .seat`;
  4. `#g-banner`;
  5. `#g-log`, trên mobile thay bằng `[data-a="log-toggle"]`;
  6. `[data-a="help"]`.
- Lớp phủ nằm ngoài `#app` để các lần vá DOM không xoá nó.
- Cờ `localStorage['bang-tour'] = 'done'`.

**Build**:

- `tour.js` xuất các hàm sau:
  - `maybeStartTour()`: chỉ chạy khi ở màn ván, có ghế, không xem lại, chưa có cờ, sau 600 ms;
  - `startTour()`.
- Lớp phủ:
  - vẽ khung sáng theo `getBoundingClientRect()` + hộp chú thích;
  - nút "Tiếp" và "Bỏ qua";
  - bước không có phần tử thì tự bỏ qua;
  - đặt lại vị trí khi `resize`.
- `app.js render()` gọi `maybeStartTour()` sau khi vá vùng.
- `helpModal` thêm nút "Xem hướng dẫn trên bàn" (data-a `tour`), action gọi `startTour()`. Sửa 2 dòng trong [table.js](../../public/table.js).
- CSS `.tour-mask`, `.tour-spot`, `.tour-tip` theo phong cách áp phích.

**Verify**:

- Kiểm trên trình duyệt: xoá `bang-tour` rồi vào ván → hiện 6 bước. Bấm hết thì không hiện lại sau khi tải lại trang. Mở từ ❓ thì hiện lại. Mobile 375px không tràn màn hình.

---

### Task 10: Tài liệu

**File(s)**:

- [README.md](../../README.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [CONTEXT.md](../CONTEXT.md)

**Phụ thuộc**: Task 1–9

**Build**:

- README: phần chơi cùng bạn bè thêm chat, người xem, xem lại ván, hướng dẫn. Phần kiểm tra thêm `test-server.js`.
- ARCHITECTURE: anchor cho `archive`, `replay`, người xem, `chat.js`, `replay.js`, `tour.js`.
- CONTEXT: thêm mục đã làm.
- Chưa commit trước khi chủ dự án duyệt (D14).

**Verify**:

- Script kiểm link tương đối trong 4 file tài liệu → `bad 0`.
