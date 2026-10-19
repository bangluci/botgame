# BANG! (bản chơi riêng với bạn bè, phi thương mại)

Chạy: bấm đúp `start.bat` (hoặc `node server.js`). Không cần cài thư viện, chỉ cần Node.js.

- **Cùng WiFi/LAN:** bạn bè mở link `Cùng WiFi: http://IP:3001` in ra ở cửa sổ server.
- **Qua Internet:** chạy thêm `cloudflared tunnel --url http://localhost:3001` (hoặc ngrok) rồi gửi link nhận được.
- Tạo phòng → gửi mã 4 chữ hoặc link → chủ phòng chỉnh luật → **Bắt đầu ván**.
- `node bots.js MÃPHÒNG 3` thêm 3 bot để chơi thử một mình. `node test.js 500` cho bot chơi 500 ván kiểm tra luật.

## Tuỳ chỉnh — 3 mức

**1. Ngay trong sảnh (chủ phòng)** — không cần sửa file:
- *Preset*: Chuẩn / Có sự kiện / Nhanh & hỗn loạn / Máu trâu / Súng chiến thuần túy / Hỗn chiến sự kiện.
- *Luật*: máu thưởng, số lá rút, số BANG!/lượt, giới hạn bài, thưởng giết Outlaw, Beer có vô hiệu khi còn 2 người, sát thương Dynamite, chất thoát Jail, chia nhiều nhân vật để chọn, bật/tắt lá sự kiện…
- *Bộ bài*: tăng/giảm/bỏ từng loại lá (0 = bỏ lá đó).
- *Nhân vật*, *Sự kiện*: bật/tắt từng mục.
- *Nâng cao*: dán JSON để thêm/sửa lá bài, nhân vật, sự kiện, vai trò cho riêng phòng đó.

**2. Thư mục `custom/`** — tuỳ chỉnh lâu dài, mọi phòng đều dùng. Xem `custom/README.txt`.

**3. File gốc `config/*.json`** — toàn bộ nội dung game nằm ở đây (cards, characters, events, roles, rules, presets).

## Tự tạo lá bài / nhân vật / sự kiện

Mọi thứ ghép từ các khối dựng sẵn, không cần viết code:

| Loại | Các khối có sẵn |
|---|---|
| Hiệu ứng lá bài (`effect[].type`) | `bang`, `heal` (`amount`, `who:"all"`), `draw` (`n`), `steal` (`mode:"take"/"discard"`), `aoe` (`respond:"bang"/"missed"`, `damage`, `barrel`), `duel`, `store` |
| Đồ trang bị (`equip`) | `weapon` (tầm), `unlimitedBang`, `distIn` (+khoảng cách tới bạn), `distOut` (−khoảng cách bạn nhìn), `barrel`, `dynamite`, `jail` |
| Mục tiêu (`target`, `range`) | `target`: `other`/`self`/bỏ trống; `range`: `"weapon"`, `"any"`, hoặc số |
| Kỹ năng nhân vật (`abilities`) | `bart blackjack janet gringo jesse jourdonnais kit lucky paul pedro rose sid slab suzy vulture willy` |
| Mod sự kiện (`mods`) | `drawSuit reverse noBang drawDelta bangBonus noAbilities beerHeal rangeBonus turnStartDamage turnStartHeal turnStartDraw handcuffs vendetta handLimitDelta missedExtra` |

Ví dụ: một lá "Súng máy" bắn 2 phát liền = `"effect": [{"type":"bang"},{"type":"bang"}]`.
Ghép kỹ năng cho nhân vật mới: `"abilities": ["sid","willy"]`. Xem `custom/cards.example.json`.

`printings` quy định lá nằm trong bộ bài: `"H:5"` (♥5), `"D:2-A"` (♦ từ 2 tới A), `"S:9*2"` (hai lá ♠9).
Chất: S♠ H♥ D♦ C♣.

## Đã có / chưa có
- Bản cơ bản đầy đủ: 80 lá, 16 nhân vật, 4 vai trò, 2–10 người.
- Lá sự kiện kiểu High Noon (15 lá, tự chế thêm được). Chưa có: lá xanh Dodge City, Ghost Town / The River.
- Kỹ năng/hiệu ứng mới ngoài danh sách trên cần thêm code trong `engine.js`.
