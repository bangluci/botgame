# Dodge City phần 3: 22 lá mới và luật 3 người

Ngày: 2026-10-20 · Trạng thái: **đã duyệt 2026-10-20** · Tiếp nối phần 1 (`ba8f522`) và phần 2 (`9c49e2d`).

## Mục tiêu
Hoàn thiện bộ mở rộng Dodge City: thêm 22 lá còn thiếu (bộ bài lên 120 lá khi bật luật `dodgeCity`) và luật 3 người chính thức. Giữ đúng các quy ước của repo: engine dạng generator, mọi ngẫu nhiên qua `g.rng`, mọi thay đổi qua `engine.apply`, client chỉ tô sáng theo dữ liệu server tính.

## Nguồn luật
- Sách luật Dodge City chính thức (PDF của dvGiochi): lá viền xanh lá, ký hiệu "bỏ kèm 1 lá", luật 3 người, luật 8 người.
- Danh sách lá chính thức (bang.dvgiochi.com, `cardslist.php?id=3`): chất/số và số bản in.
- Hiệu ứng từng lá: blog "The BANG! Card Game Blog" (mục Card Explanations). Lá nào blog không có thì theo ký hiệu in trên lá.

## 22 lá mới

Chú thích: **Nâu** = chơi từ tay như lá hành động. **Xanh lá** = đặt trước mặt, từ lượt sau mới bỏ nó đi để lấy hiệu ứng. **+1** = phải bỏ kèm 1 lá bất kỳ khác trên tay.

| Lá | Chất/số | Loại | Hiệu ứng |
|---|---|---|---|
| Punch | ♠10 | Nâu | BANG! vào người ở khoảng cách 1. Không tính vào giới hạn 1 BANG!/lượt |
| Dodge ×2 | ♦7, ♥K | Nâu | Như Missed! (đỡ mọi đòn có ký hiệu BANG!), đỡ xong rút 1 lá |
| Springfield | ♠K | Nâu +1 | BANG! vào người ở bất kỳ khoảng cách nào, không tính giới hạn |
| Tequila | ♣9 | Nâu +1 | Chọn 1 người bất kỳ (kể cả mình) hồi 1 máu |
| Whisky | ♥Q | Nâu +1 | Mình hồi 2 máu |
| Brawl | ♠J | Nâu +1 | Mọi người khác bỏ 1 lá: mình chọn với từng người (1 lá ngẫu nhiên trên tay hoặc 1 lá trên bàn) |
| Rag Time | ♥9 | Nâu +1 | Như Panic! nhưng không giới hạn khoảng cách |
| Bible | ♥10 | Xanh lá | Như Missed!, dùng xong rút 1 lá |
| Ten Gallon Hat | ♦J | Xanh lá | Như Missed! |
| Iron Plate ×2 | ♦A, ♠Q | Xanh lá | Như Missed! |
| Sombrero | ♣7 | Xanh lá | Như Missed! |
| Canteen | ♥7 | Xanh lá | Hồi 1 máu |
| Pony Express | ♦Q | Xanh lá | Rút 3 lá |
| Can Can | ♣J | Xanh lá | Như Cat Balou, không giới hạn khoảng cách |
| Conestoga | ♦9 | Xanh lá | Như Panic!, không giới hạn khoảng cách |
| Knife | ♥8 | Xanh lá | BANG! vào người ở khoảng cách 1 |
| Derringer | ♠7 | Xanh lá | BANG! vào người ở khoảng cách 1, rồi rút 1 lá |
| Pepperbox | ♥A | Xanh lá | BANG! vào người trong tầm súng |
| Buffalo Rifle | ♣Q | Xanh lá | BANG! vào người ở bất kỳ khoảng cách nào |
| Howitzer | ♠9 | Xanh lá | Như Gatling |

Luật chung theo sách:
- Chỉ **lá BANG!** bị giới hạn 1 lá/lượt. Các lá khác có ký hiệu BANG! (Punch, Springfield, Knife…) không tính vào giới hạn đó.
- Lúc mất máu cuối, chỉ Beer cứu được. Canteen, Tequila, Whisky, Saloon không dùng ngoài lượt được.
- Đỡ được bằng Missed!/Dodge/lá xanh có Missed!/Barrel: mọi lá có ký hiệu BANG!, kể cả Punch, Knife, Derringer, Howitzer. Không đỡ được: Indians!, Duel, Dynamite.

## Cơ chế mới trong engine

### 1. Lá viền xanh lá (`kind: "green"`)
- Chơi từ tay giống lá trang bị: đặt trước mặt mình, mỗi người không có 2 lá trùng tên. Lá được ghi lại lượt nó được đặt xuống.
- Dùng: bỏ lá đó khỏi bàn để lấy hiệu ứng trong trường `use`. **Không dùng được ngay trong lượt vừa đặt**: Missed! dùng được từ lượt người kế tiếp, các lá khác dùng từ lượt sau của mình.
- Chỉ lá có ký hiệu Missed! (Bible, Ten Gallon Hat, Iron Plate, Sombrero) dùng được ngoài lượt, khi đang phải đỡ đòn. Các lá còn lại chỉ dùng trong lượt mình, ở pha chơi bài.
- Panic!, Cat Balou, Can Can, Conestoga, Brawl, Pat Brennan lấy/bỏ được lá xanh lá như lá xanh dương. Lá xanh lá bị lấy về tay thì phải đặt lại và chờ lượt sau mới dùng.
- Belle Star: trong lượt cô, lá xanh lá của người khác không dùng được (đi chung đường với `gear()` hiện có).
- Apache Kid: lá xanh lá chất ♦ dùng nhắm vào anh không có tác dụng (FAQ Q10 nêu tên Conestoga), trừ Duel.

### 2. Lá "bỏ kèm 1 lá" (`cost: 1`)
Action chơi lá thêm trường `extra`: id 1 lá khác trên tay để bỏ cùng. Engine kiểm tra lá đó có thật và khác lá đang chơi. `me.playable[id].cost = 1` để client biết phải hỏi thêm 1 lá.

### 3. Hiệu ứng và trường mới (thêm vào whitelist trong `config.js`)
- `free: true` trên lá có hiệu ứng `bang`: không tính và không bị chặn bởi giới hạn BANG! (Punch, Springfield, các lá xanh có BANG!).
- `reactDraw: 1`: lá đỡ đòn (Dodge, Bible) đỡ xong thì rút thêm.
- `heal` có `who: "target"` và lá `target: "any"`: chọn bất kỳ ai còn sống, kể cả mình (Tequila).
- Hiệu ứng `brawl`: lần lượt từng người khác theo chiều kim đồng hồ, người chơi lá chọn 1 lá ngẫu nhiên trên tay hoặc 1 lá trên bàn của họ để bỏ (prompt `choice` kind `brawl`).
- Lá xanh lá: `use` (danh sách hiệu ứng như `effect`), cùng `target`/`range` cho hiệu ứng dùng.

### 4. Action và dữ liệu cho client
- Chơi lá: `{ type: "play", card, extra?, target?, zone?, cardId? }`.
- Dùng lá xanh lá trong lượt: `{ type: "use", card: idLáTrênBàn, target?, zone?, cardId? }`.
- Đỡ đòn bằng lá xanh lá: `{ type: "respond", card: idLáTrênBàn }`. `me.usable` liệt kê cả lá trên bàn đỡ được.
- `me.greens`: danh sách lá xanh lá dùng được ngay lúc đó, mỗi mục gồm `{ id, targets?, self? }`. Banner sinh nút "Dùng <tên lá>" theo danh sách này, giống nút kỹ năng.

### 5. Giao diện
- Lá "+1": chọn lá, dock ghi "Chọn thêm 1 lá để bỏ kèm", tô sáng các lá còn lại trên tay; chọn xong thì chơi hoặc chọn mục tiêu như thường.
- Lá xanh lá trên bàn có viền xanh lá (khác viền xanh dương của trang bị). Lá vừa đặt có dấu mờ "lượt sau".
- Banner có nút dùng lá xanh lá trong lượt mình. Khi bị bắn thì có nút "Đỡ bằng <tên lá>".

### 6. AI (`ai.js`)
- Đỡ đòn: ưu tiên lá xanh lá trên bàn trước để giữ bài trên tay.
- Lá "+1": chỉ chơi khi có lá rẻ để bỏ kèm (lá rẻ nhất theo `val`).
- Dùng lá xanh lá tấn công/rút/hồi máu theo cùng ưu tiên như lá nâu tương ứng. Đặt lá xanh lá sớm.
- Tequila: hồi cho mình hoặc đồng minh đang ít máu nhất. Brawl: chơi khi kẻ địch nhiều hơn đồng minh.

## Luật 3 người chính thức (Dodge City)
Luật `dodgeCity3p` (mặc định bật cùng Dodge City, chỉ áp khi đúng 3 người):
- Vai: Deputy, Outlaw, Renegade, **lật ngửa** cho cả bàn thấy. Không có Sheriff, Deputy đi trước.
- Mục tiêu: Deputy hạ Renegade, Renegade hạ Outlaw, Outlaw hạ Deputy. Phải **tự tay** hạ mục tiêu mới thắng ngay.
- Nếu mục tiêu của mình bị người khác hạ, 2 người còn lại đấu tới người cuối cùng.
- Hạ bất kỳ ai cũng được rút 3 lá. Jail đặt lên ai cũng được. Beer vẫn vô hiệu khi còn 2 người.
- Bàn 2 người và luật 3 người cũ (khi không bật Dodge City) giữ nguyên như hiện tại.

## Kiểm thử
- `test-scenarios.js`: mỗi cơ chế ít nhất 1 kịch bản, gồm lá xanh lá không dùng được ngay lượt đặt, Missed! xanh lá đỡ ngoài lượt, lá "+1", Dodge rút 1, Tequila cho người khác, Brawl chọn tay/bàn, Punch không tính giới hạn, Belle Star tắt lá xanh lá, Apache với Conestoga ♦, và luật 3 người (thắng khi tự tay hạ; mục tiêu bị người khác hạ thì đấu tới cuối).
- Fuzz `test.js`: thêm ứng viên `use`, `extra`, respond bằng lá trên bàn; giữ bất biến đếm lá (lá xanh lá nằm trên bàn) và dựng lại ván từ seed.
- `npm run test:ai`: bot không kẹt, có dùng lá xanh lá.
- Chơi thử trên trình duyệt: chụp lá "+1", nút dùng lá xanh lá, đỡ đòn bằng lá xanh lá, ván 3 người.

## Quyết định (chủ dự án duyệt 2026-10-20)
1. **Whisky** dùng **Q♥**: trang danh sách chính thức ghi Q♦, trùng với Pony Express; blog và bản in phổ biến ghi Q♥.
2. **Luật 3 người** bật mặc định khi chơi Dodge City với 3 người, vẫn có công tắc trong sảnh.

## Ngoài phạm vi
High Noon và A Fistful of Cards bản chính thức (hiện là sự kiện tự chế), cùng các bộ mở rộng khác.
