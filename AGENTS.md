# AGENTS.md — BANG! online

Chỉ ghi phần khác với luật chung.

## Stack & lệnh
- Node.js ≥ 18 thuần, **không dependency**, không build step. Server CommonJS; client là ES module trong `public/`.
- `npm start` chạy server ở cổng 3001 (đổi bằng biến `PORT`).
- `npm test` chạy fuzz luật, `npm run test:ai` chạy bot AI. Lỗi thì lệnh in seed; chạy lại đúng ván đó bằng `node test.js <n> <seed>`.
- Server gửi CSP `script-src 'self'`, nên không được viết script inline, `onclick=`, hay script từ CDN. Font Google thì được.

## Quy ước bắt buộc
- **Engine không dùng `Math.random`**. Mọi ngẫu nhiên phải đi qua `g.rng` (có seed). Mọi thay đổi trạng thái ván phải đi qua `engine.apply` để được ghi vào `g.actions`. Lý do: server lưu phòng bằng seed + chuỗi action rồi dựng lại khi khởi động; test cũng kiểm việc dựng lại này.
- Thêm kỹ năng / hiệu ứng / mod mới thì sửa đủ 3 chỗ:
  - code trong engine: `engine.js` (chơi lá, lượt, view), `rules.js` (trạng thái chung), `combat.js` (đòn đánh, chết), `abilities.js` (kỹ năng chủ động);
  - whitelist `ABILITIES`/`EFFECTS`/`MODS` và phần validate trong `config.js`;
  - bảng khối dựng sẵn trong `README.md`.
- Validate cấu hình phải chặn mọi tổ hợp làm engine ném lỗi giữa ván. Lỗi lọt qua chỉ được `fault()` ghi log, ván vẫn chạy tiếp, nhưng `test.js` coi đó là lỗi.
- Client chỉ tô sáng lá/mục tiêu theo `me.playable` / `me.usable` do server tính. Không tự đoán luật ở client.
- Font: **Alfa Slab One** (tiêu đề, tên lá, wordmark), **Old Standard TT** (nhãn, số), **Spectral** (thân bài). Cả ba có dấu tiếng Việt; font mới phải có bộ `vietnamese` trên Google Fonts (Rye thì không, đừng dùng cho chữ Việt).
- Ngôn ngữ: UI, log, comment, docs viết tiếng Việt; tên lá/nhân vật giữ tiếng Anh như bản gốc.
- `data/` là phòng đang lưu khi chạy, đã gitignore. Đừng commit.
