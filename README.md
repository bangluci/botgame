# BANG! (bản chơi riêng với bạn bè, phi thương mại)

Chạy: bấm đúp `start.bat` (hoặc `npm start` / `node server.js`). Không cần cài thư viện, chỉ cần Node.js ≥ 18.

- **Cùng WiFi/LAN:** cửa sổ server in ra dòng `Cùng WiFi: http://IP:3001 (tên mạng)`. Bạn bè mở link đó. Link mời trong sảnh tự dùng IP LAN, nên chép gửi luôn được. Bạn bè không vào được thì cho phép Node.js qua Windows Firewall (mạng Private).
- **Qua Internet:** chạy thêm `cloudflared tunnel --url http://localhost:3001` (hoặc ngrok) rồi gửi link nhận được.
- **Chơi một mình:** ở trang chủ bấm **🤖 Chơi nhanh với 3 bot**, hoặc vào sảnh bấm **＋ Thêm bot**. Bot chạy ngay trong server, không cần mở thêm cửa sổ.
- Luồng chơi: tạo phòng → gửi mã 4 chữ hoặc link → chủ phòng chỉnh luật → **Chia bài**.
- **Chat:** khung chat ở sảnh, trong ván thì mở 📜 → tab **💬 Chat**. Tin mới hiện bong bóng trên ghế người gửi, chấm đỏ trên 📜 báo tin chưa đọc.
- **Vào trễ:** bạn vào lúc ván đang chạy (bằng tên mới) thì thành **người xem 👀**. Người xem chỉ thấy những gì cả bàn cùng thấy, chat được, và được chia bài từ ván sau. Mỗi phòng tối đa 10 người xem.
- **Xem lại ván:** ván xong bấm **🎞️ Xem lại ván**, hoặc mở ở mục **Ván gần đây** trong sảnh (giữ 5 ván). Tua từng nước, tự chạy, chọn ghế để xem bài của người đó. Vai mọi người lật ngửa.
- **Người mới:** lần đầu vào ván có 6 bước chỉ tay giới thiệu bàn chơi. Xem lại bằng nút ❓ → **Xem hướng dẫn trên bàn**.

## Khi có người rớt mạng / bỏ đi

- Rớt mạng thì cứ mở lại trang, game tự nối lại. Mất phiên hoặc đổi máy thì vào phòng **bằng đúng tên cũ** để nhận lại ghế.
- Người offline quá 15 giây, hoặc online mà không bấm gì trong 90 giây: máy tự chơi thay nước đó. Đồng hồ ⏱ đếm ngược ngay trên banner. Chủ phòng chỉnh hai mốc này ở tab Luật → **Phòng**.
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
- *Nâng cao*: dán JSON để thêm/sửa lá bài, nhân vật, sự kiện, vai trò cho riêng phòng đó. Lá/nhân vật/sự kiện thêm vào hiện luôn trong các tab Bộ bài, Nhân vật, Sự kiện để bật/tắt.

**2. Thư mục `custom/`**: tuỳ chỉnh lâu dài, mọi phòng đều dùng. Xem `custom/README.txt`.

**3. File gốc `config/*.json`**: toàn bộ nội dung game nằm ở đây (cards, characters, events, roles, rules, presets).

## Tự tạo lá bài / nhân vật / sự kiện

Mọi thứ ghép từ các khối dựng sẵn, không cần viết code:

| Loại | Các khối có sẵn |
|---|---|
| Hiệu ứng lá (`effect[].type`), kỹ năng nhân vật (`abilities`), mod sự kiện (`mods`) | Danh sách kèm mô tả nằm trong sảnh: tab **🧪 Nâng cao** → "Hiệu ứng / kỹ năng / mod có sẵn" (nguồn duy nhất: đầu file `config.js`). Ví dụ `bang`, `heal`, `steal`, `aoe`; kỹ năng `sid`, `willy`; mod `drawDelta`, `noBang`… Sự kiện có `"final": true` thì nằm cuối chồng, lật ra là giữ tới hết ván |
| Đồ trang bị (`equip`) | `weapon` (tầm), `unlimitedBang`, `distIn` (+khoảng cách tới bạn), `distOut` (−khoảng cách bạn nhìn), `barrel`, `dynamite`, `jail` |
| Lá xanh lá (`"kind": "green"`) | Đặt trước mặt, từ lượt sau mới dùng. `"react": "missed"`: bỏ đi để đỡ đòn như Missed! kể cả ngoài lượt. `"use": [...]`: bỏ đi trong lượt mình để chạy hiệu ứng (cùng khối với `effect`) |
| Tuỳ chọn khác của lá | `"cost": 1` (phải bỏ kèm 1 lá khác trên tay), `"free": true` (BANG! không tính giới hạn), `"reactDraw": n` (đỡ đòn bằng lá này xong rút n lá) |
| Mục tiêu (`target`, `range`) | `target`: `other`/`self`/`any` (chọn ai cũng được, bỏ trống là mình)/bỏ trống; `range`: `"weapon"`, `"any"`, hoặc số 1…10. Lá có `bang`/`duel`/`steal` bắt buộc `"target": "other"` |
| Bộ mở rộng (`set`, `extra`) | `"set": "dodgecity"` thì lá/nhân vật chỉ vào ván khi bật luật Dodge City. `"extra": { "dodgecity": ["S:8"] }` thêm bản in cho lá có sẵn |

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
- **15 nhân vật:**
  - Pixie Pete: rút 3 lá.
  - Bill Noface: rút 1 lá + 1 lá cho mỗi máu đã mất.
  - Sean Mallory: giữ tới 10 lá.
  - Tequila Joe: Beer hồi 2 máu.
  - Greg Digger: hồi 2 máu khi có người khác bị loại.
  - Herb Hunter: rút 2 lá khi có người khác bị loại.
  - Elena Fuente: dùng lá bất kỳ như Missed!.
  - Chuck Wengam: trong lượt, mất 1 máu để rút 2 lá, lặp được nhưng không được mất máu cuối.
  - Doc Holyday: mỗi lượt 1 lần, bỏ 2 lá để bắn BANG! vào người trong tầm súng, không tính giới hạn BANG!.
  - José Delgado: tối đa 2 lần mỗi lượt, bỏ 1 lá trang bị (viền xanh) để rút 2 lá.
  - Pat Brennan: pha rút bài có thể lấy 1 lá trên bàn của bất kỳ ai thay cho rút 2.
  - Vera Custer: đầu lượt (sau Dynamite/Jail) mượn kỹ năng 1 nhân vật khác còn sống tới lượt sau. Ở tù mà không thoát thì không có kỹ năng.
  - Belle Star: trong lượt cô, đồ trên bàn người khác mất tác dụng (Barrel, Mustang, súng…).
  - Apache Kid: lá ♦ người khác đánh vào anh không có tác dụng (BANG!, Indians!, Panic!, Cat Balou…), trừ Duel. Đồ viền xanh vẫn dùng được.
  - Molly Stark: ngoài lượt mình, mỗi lần dùng Missed!/Beer/BANG! từ tay thì rút 1 lá. Trong Duel thì rút bù khi Duel xong.
  - Kỹ năng chủ động (Sid, Chuck, Doc, José) hiện thành nút trên banner khi dùng được.
  - Vera mượn Vulture Sam khi Vulture Sam thật còn sống: hai người chia bài người chết theo FAQ.
- **40 lá** (bộ bài thành 120 lá):
  - Binocular: như Scope. Hideout: như Mustang. Hai lá này dùng chung được với Scope/Mustang.
  - 16 bản in thêm của BANG!, Beer, Missed!, Panic!, Cat Balou, General Store, Indians, Barrel, Mustang, Dynamite, Remington, Rev. Carabine.
  - Lá thường: Punch (BANG! tầm 1, không tính giới hạn), Dodge (như Missed!, đỡ xong rút 1).
  - Lá "+1" (bỏ kèm 1 lá): Springfield (BANG! mọi khoảng cách, không tính giới hạn), Whisky (hồi 2), Tequila (hồi 1 cho người bất kỳ), Brawl (mọi người khác bỏ 1 lá), Rag Time (như Panic! mọi khoảng cách).
  - Lá xanh lá, đặt xuống rồi từ lượt sau mới dùng:
    - đỡ đòn như Missed!: Bible (đỡ xong rút 1), Iron Plate, Sombrero, Ten Gallon Hat;
    - dùng trong lượt mình: Canteen (hồi 1), Pony Express (rút 3), Can Can (như Cat Balou), Conestoga (như Panic! mọi khoảng cách), Knife / Derringer (BANG! tầm 1; Derringer rút thêm 1), Pepperbox (BANG! theo tầm súng), Buffalo Rifle (BANG! mọi khoảng cách), Howitzer (như Gatling).
  - Belle Star tắt luôn lá xanh lá; Apache Kid miễn cả lá xanh lá ♦ người khác dùng vào anh.
- **Luật 3 người chính thức** (công tắc riêng, mặc định bật): vai Deputy / Outlaw / Renegade lật ngửa, Deputy đi trước. Mỗi người có một mục tiêu: Deputy → Renegade → Outlaw → Deputy. Tự tay hạ đúng mục tiêu thì thắng ngay; mục tiêu chết vì người khác thì hai người còn lại đấu tới cuối. Hạ ai cũng rút 3 lá.

## Kiểm tra

- `npm test`: chạy 3 phần. Phần đầu là `test-scenarios.js`: kịch bản kiểm từng kỹ năng, lá Dodge City, luật 3 người và cách tính khoảng cách. Phần hai là `test-server.js`: dựng server thật ở cổng ngẫu nhiên với data tạm, kiểm chat, người xem, lịch sử và xem lại ván qua HTTP. Phần cuối là `node test.js 300`: bot ngẫu nhiên chơi 300 ván qua 9 biến thể luật, 2–10 người. Bất biến (số lá, máu) được kiểm sau mỗi nước, và có kiểm dựng lại ván từ seed. Khi lỗi, lệnh in ra seed, chạy lại bằng `node test.js 300 <seed>`.
- `npm run test:ai` (`node test.js ai 200`): bot AI đấu nhau và đấu bot ngẫu nhiên.
- `node bots.js MÃPHÒNG 3 [cổng]`: thêm bot qua HTTP từ máy khác (bình thường dùng nút "Thêm bot" là đủ).

## Đã có / chưa có

- Đã có:
  - bản cơ bản đầy đủ: 80 lá, 16 nhân vật, 4 vai trò, 2–10 người;
  - 15 lá sự kiện (lấy cảm hứng từ High Noon / A Fistful of Cards, cộng vài lá tự chế);
  - bot AI theo vai;
  - Dodge City đầy đủ: 15 nhân vật, 40 lá và luật 3 người chính thức (bật trong sảnh).
- Chưa có:
  - Wild West Show, Gold Rush, The Valley of Shadows, Armed & Dangerous;
  - luật 2 người, và luật 3 người khi không bật Dodge City (hiện là luật tự chế).
- Kỹ năng/hiệu ứng mới ngoài danh sách trên cần thêm code ở 2 nơi: engine (`engine.js`, `rules.js`, `combat.js` hoặc `abilities.js`) và danh sách cho phép trong `config.js`. Kỹ năng chủ động thêm 1 mục vào `ACTIVE` trong `abilities.js` là có nút trên banner và bot dùng thử được.
