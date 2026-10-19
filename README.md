# BANG! (bản chơi riêng với bạn bè, phi thương mại)

Chạy: bấm đúp `start.bat` (hoặc `npm start` / `node server.js`). Không cần cài thư viện, chỉ cần Node.js ≥ 18.

- **Cùng WiFi/LAN:** cửa sổ server in ra dòng `Cùng WiFi: http://IP:3001 (tên mạng)`. Bạn bè mở link đó. Link mời trong sảnh tự dùng IP LAN, nên chép gửi luôn được. Bạn bè không vào được thì cho phép Node.js qua Windows Firewall (mạng Private).
- **Qua Internet:** chạy thêm `cloudflared tunnel --url http://localhost:3001` (hoặc ngrok) rồi gửi link nhận được.
- **Chơi một mình:** ở trang chủ bấm **🤖 Chơi nhanh với 3 bot**, hoặc vào sảnh bấm **＋ Thêm bot**. Bot chạy ngay trong server, không cần mở thêm cửa sổ.
- Luồng chơi: tạo phòng → gửi mã 4 chữ hoặc link → chủ phòng chỉnh luật → **Chia bài**.

## Khi có người rớt mạng / bỏ đi

- Rớt mạng thì cứ mở lại trang, game tự nối lại. Mất phiên hoặc đổi máy thì vào phòng **bằng đúng tên cũ** để nhận lại ghế.
- Người offline quá 15 giây, hoặc online mà không bấm gì trong 90 giây: máy tự chơi thay nước đó. Đồng hồ ⏱ đếm ngược ngay trên banner.
- Bấm 🚪 để rời giữa ván: máy chơi thay tới hết ván. Chủ phòng có thể bấm vào ghế một người rồi chọn **🤖 Cho máy chơi thay**, hoặc **⏹ Huỷ ván** để về sảnh.
- Chủ phòng offline 30 giây thì quyền chủ phòng tự chuyển sang người khác.
- Phòng và ván được lưu ở `data/rooms.json`. Tắt server rồi mở lại vẫn chơi tiếp được.

## Tuỳ chỉnh — 3 mức

**1. Ngay trong sảnh (chủ phòng)**, không cần sửa file:
- *Preset*: Chuẩn / Có sự kiện / Nhanh & hỗn loạn / Máu trâu / Súng chiến thuần túy / Hỗn chiến sự kiện.
- *Luật*:
  - máu thưởng, số lá rút, số BANG!/lượt, giới hạn bài;
  - thưởng giết Outlaw, Beer vô hiệu khi còn 2 người;
  - sát thương Dynamite, chất thoát Jail;
  - chia nhiều nhân vật để chọn, bật/tắt lá sự kiện…
- *Bộ bài*: tăng/giảm/bỏ từng loại lá (0 = bỏ lá đó).
- *Nhân vật*, *Sự kiện*: bật/tắt từng mục.
- *Nâng cao*: dán JSON để thêm/sửa lá bài, nhân vật, sự kiện, vai trò cho riêng phòng đó.

**2. Thư mục `custom/`**: tuỳ chỉnh lâu dài, mọi phòng đều dùng. Xem `custom/README.txt`.

**3. File gốc `config/*.json`**: toàn bộ nội dung game nằm ở đây (cards, characters, events, roles, rules, presets).

## Tự tạo lá bài / nhân vật / sự kiện

Mọi thứ ghép từ các khối dựng sẵn, không cần viết code:

| Loại | Các khối có sẵn |
|---|---|
| Hiệu ứng lá bài (`effect[].type`) | `bang`, `heal` (`amount`, `who:"all"`), `draw` (`n`), `steal` (`mode:"take"/"discard"`), `aoe` (`respond:"bang"/"missed"`, `damage`, `barrel`), `duel`, `store` |
| Đồ trang bị (`equip`) | `weapon` (tầm), `unlimitedBang`, `distIn` (+khoảng cách tới bạn), `distOut` (−khoảng cách bạn nhìn), `barrel`, `dynamite`, `jail` |
| Mục tiêu (`target`, `range`) | `target`: `other`/`self`/bỏ trống; `range`: `"weapon"`, `"any"`, hoặc số 1…10. Lá có `bang`/`duel`/`steal` bắt buộc `"target": "other"` |
| Kỹ năng nhân vật (`abilities`) | `bart blackjack janet gringo jesse jourdonnais kit lucky paul pedro rose sid slab suzy vulture willy`, và của Dodge City: `pixie bill sean tequila greg herb elena` |
| Bộ mở rộng (`set`, `extra`) | `"set": "dodgecity"` thì lá/nhân vật chỉ vào ván khi bật luật Dodge City. `"extra": { "dodgecity": ["S:8"] }` thêm bản in cho lá có sẵn |
| Mod sự kiện (`mods`) | `drawSuit reverse noBang drawDelta bangBonus noAbilities beerHeal rangeBonus turnStartDamage turnStartHeal turnStartDraw handcuffs vendetta handLimitDelta missedExtra`, và `"final": true` để lá đó nằm cuối chồng, lật ra là giữ tới hết ván |

Ví dụ:
- Lá "Súng máy" bắn 2 phát liền: `"target": "other", "effect": [{"type":"bang"},{"type":"bang"}]`.
- Ghép kỹ năng cho nhân vật mới: `"abilities": ["sid","willy"]`.
- Xem thêm mẫu trong `custom/cards.example.json`.

`printings` quy định lá nằm trong bộ bài: `"H:5"` (♥5), `"D:2-A"` (♦ từ 2 tới A), `"S:9*2"` (hai lá ♠9, tối đa `*10`). Chất: S♠ H♥ D♦ C♣.

Nếu JSON sai kiểu (máu không phải số nguyên, thiếu `target`…) thì game báo lỗi rõ ràng ngay khi lưu luật, chứ không làm hỏng ván giữa chừng.

## Luật đã chỉnh theo FAQ chính thức

- Duel: người chơi lá Duel luôn là thủ phạm (ảnh hưởng El Gringo, thưởng/phạt khi giết).
- Beer:
  - chơi được cả khi đầy máu hoặc còn 2 người, chỉ là không hồi;
  - sự kiện Prohibition/Happy Hour áp dụng cả lúc uống Beer cứu mạng.
- Vulture Sam nhặt bài trước, sau đó mới tới phạt Sheriff.
- Suzy Lafayette rút bài sau khi lá vừa đánh xong hiệu ứng.
- Sid Ketchum dùng kỹ năng bất cứ lúc nào, kể cả ngoài lượt.
- Renegade thắng: chỉ tính người còn sống.
- Vendetta: lượt thêm không rút! lại.
- Dynamite không chuyền vào người đã có Dynamite.
- Gold Rush chỉ đảo thứ tự lượt; hiệu ứng lá vẫn theo chiều kim đồng hồ.
- Sự kiện lật từ vòng 2. High Noon là lá cuối chồng.

## Bộ mở rộng Dodge City

Bật bằng preset **Dodge City** hoặc công tắc trong tab Luật → nhóm Bộ mở rộng. Mặc định tắt.
- **7 nhân vật:**
  - Pixie Pete: rút 3 lá.
  - Bill Noface: rút 1 lá + 1 lá cho mỗi máu đã mất.
  - Sean Mallory: giữ tới 10 lá.
  - Tequila Joe: Beer hồi 2 máu.
  - Greg Digger: hồi 2 máu khi có người khác bị loại.
  - Herb Hunter: rút 2 lá khi có người khác bị loại.
  - Elena Fuente: dùng lá bất kỳ như Missed!.
- **18 lá:**
  - Binocular: như Scope.
  - Hideout: như Mustang.
  - Hai lá trên dùng chung được với Scope/Mustang.
  - 16 bản in thêm của BANG!, Beer, Missed!, Panic!, Cat Balou, General Store, Indians, Barrel, Mustang, Dynamite, Remington, Rev. Carabine.
  - Bộ bài thành 98 lá.
- **Chưa có:**
  - 8 nhân vật cần kỹ năng chủ động hoặc tắt hiệu lực đồ trên bàn: Apache Kid, Belle Star, Chuck Wengam, Doc Holyday, José Delgado, Molly Stark, Pat Brennan, Vera Custer.
  - 22 lá cần cơ chế mới: lá xanh, bỏ thêm 1 lá để chơi, BANG! không tính giới hạn.

## Kiểm tra

- `npm test`: chạy 2 phần. Phần đầu là `test-scenarios.js`: kịch bản kiểm từng kỹ năng Dodge City và cách tính khoảng cách. Phần sau là `node test.js 300`: bot ngẫu nhiên chơi 300 ván qua 9 biến thể luật, 2–10 người. Bất biến (số lá, máu) được kiểm sau mỗi nước, và có kiểm dựng lại ván từ seed. Khi lỗi, lệnh in ra seed, chạy lại bằng `node test.js 300 <seed>`.
- `npm run test:ai` (`node test.js ai 200`): bot AI đấu nhau và đấu bot ngẫu nhiên.
- `node bots.js MÃPHÒNG 3 [cổng]`: thêm bot qua HTTP từ máy khác (bình thường dùng nút "Thêm bot" là đủ).

## Đã có / chưa có

- Đã có:
  - bản cơ bản đầy đủ: 80 lá, 16 nhân vật, 4 vai trò, 2–10 người;
  - 15 lá sự kiện (lấy cảm hứng từ High Noon / A Fistful of Cards, cộng vài lá tự chế);
  - bot AI theo vai;
  - Dodge City: 7 nhân vật và 18 lá (bật trong sảnh).
- Chưa có:
  - phần còn lại của Dodge City (xem mục trên), Wild West Show, Gold Rush, The Valley of Shadows, Armed & Dangerous;
  - luật 3 người chính thức. Bàn 2–3 người hiện là luật tự chế.
- Kỹ năng/hiệu ứng mới ngoài danh sách trên cần thêm code ở 2 nơi: `engine.js` và danh sách cho phép trong `config.js`.
