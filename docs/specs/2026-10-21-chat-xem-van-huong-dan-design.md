# Spec: Chat chữ, chế độ xem, xem lại ván, hướng dẫn người mới

**Date**: 2026-10-21

## 1. Bối cảnh

**Origin**:

- "Chat chữ trong ván (giờ mới có emote). Chế độ xem: bạn vào sau thì xem ván đang chơi. Xem lại ván đã chơi. Server đã lưu seed + từng nước đi nên làm khá dễ. Hướng dẫn nhanh cho người mới chơi BANG! lần đầu."

**Problem**:

- Chơi với bạn ở xa qua tunnel nhưng chỉ nói được bằng 10 emote. Bạn vào trễ lúc ván đang chạy thì bị chặn ("Phòng đang chơi"), phải chờ ngoài.
- Ván xong là mất, không xem lại được ai chơi lá gì.
- Người mới mở bàn chơi lần đầu không biết nhìn vào đâu: vai mình, tay bài, khoảng cách, nút kết thúc lượt.

**Decisions**:

- Một spec gộp 4 mục, vì mỗi mục nhỏ và độc lập. Chủ dự án chọn ngày 2026-10-21.
- Chat: bong bóng trên ghế vài giây (như emote), cộng thêm tab "Chat" lưu khoảng 50 tin gần nhất. Không chen vào nhật ký ván, vì nhật ký thuộc engine và phải dựng lại được từ seed.
- Người xem chỉ thấy thông tin công khai. Vì vậy người xem chat thoải mái mà không mách nước được.
- Xem lại ván là tua lại cả bàn chơi. Server dựng lại theo từng bước tua.
  - Không chọn "gửi trọn ván một lần", vì lúc mở phải tải lâu.
  - Không chọn "client tự chạy engine", vì phải đóng gói lại engine.
- Xem lại ván không làm cách hiện bài trên mọi ghế. Thay vào đó có ô "Xem từ ghế của …": đổi ghế là thấy bài trên tay người đó, và vai của mọi người đều lật ngửa. Cách này dùng lại nguyên giao diện bàn chơi.
- Hướng dẫn: chỉ tay từng bước trên bàn thật vào lần đầu vào ván. Không làm ván tập có kịch bản, không làm trang hướng dẫn có hình.

## 2. Nguồn dữ liệu chuẩn

**Canonical**:

- Tin chat:
  - nằm trong `room.chat` trên server, giữ tối đa 50 tin;
  - mỗi tin có `id` tăng dần, người gửi, tên, nội dung, thời điểm, và cờ người xem;
  - lưu ra `data/rooms.json` cùng phòng.
- Người xem: thành viên phòng có `spectator: true`. Người xem không có trong `room.gameMembers` của ván đang chơi.
- Ván đã xong:
  - nằm trong `room.history`, giữ tối đa 5 ván gần nhất;
  - mỗi ván lưu thành viên, settings, seed, chuỗi action, kết quả, thời điểm kết thúc;
  - lưu ra `data/rooms.json`.
- Ảnh chụp xem lại ở bước k = dựng lại ván từ seed + k action đầu tiên bằng `engine.newGame` + `engine.apply`, rồi lấy `engine.viewFor` của ghế đang chọn, kèm vai của mọi người.
- Đã xem hướng dẫn chưa: `localStorage` của trình duyệt.

**KHÔNG phải nguồn chuẩn**:

- `g.log` của engine không chứa chat.
- Ảnh chụp xem lại không được cache thành dữ liệu riêng. Nó luôn dựng lại từ seed + action.
- Client không tự đoán người xem được thấy gì. Server quyết bằng `viewFor` khi không có ghế.

## 3. Kiến trúc giải pháp

**Components**:

- **Chat**:
  - Lệnh gửi tin: 1–200 ký tự, cắt khoảng trắng thừa, bỏ ký tự điều khiển, mỗi người tối đa 1 tin/giây.
  - Ảnh chụp chỉ gửi những tin mới hơn tin client đang có (client gửi `id` tin mới nhất nó có, giống cách làm với `defs`).
  - Client:
    - hiện bong bóng chữ trên ghế người gửi khoảng 6 giây;
    - thêm tab "Chat" cạnh "Nhật ký" ở bàn chơi, cộng ô nhập; trên mobile nằm trong modal nhật ký;
    - sảnh có khung chat nhỏ dưới danh sách người chơi;
    - tin của người xem có nhãn 👀;
    - nội dung luôn được escape.
- **Người xem**:
  - Vào phòng đang chơi bằng một tên mới thì thành người xem, thay vì bị chặn. Vào lại bằng đúng tên cũ thì vẫn nhận lại ghế như hiện nay.
  - Người xem nhận `viewFor` không có ghế, tức chỉ thông tin công khai.
  - Giao diện:
    - bàn xếp ghế từ góc của Sheriff;
    - không có tay bài, không có nút hành động;
    - banner ghi "👀 Đang xem — ván sau bạn được chia bài".
  - Về sảnh: người xem thành người chơi theo thứ tự vào phòng, tới khi đủ số ghế tối đa. Người dư vẫn là người xem, không được chia bài.
  - Tối đa 10 người xem mỗi phòng.
  - Chỉ thành người xem khi ván đang chạy. Ở sảnh mà phòng đã đầy thì vẫn báo "Phòng đã đầy" như hiện nay.
  - Người xem chỉ được làm chủ phòng khi không còn người chơi nào online.
- **Lịch sử ván**:
  - Khi ván có người thắng, server cất ván vào `room.history`, giữ 5 ván gần nhất. Ván bị huỷ giữa chừng thì không cất.
- **Xem lại ván**:
  - Lệnh đọc nhận mã ván, bước k và ghế muốn xem; trả tổng số bước, bước k và ảnh chụp.
  - Chỉ thành viên phòng (kể cả người xem) gọi được.
  - Mỗi lần gọi dựng lại từ đầu. Mỗi nước khoảng 0,02 ms nên ván 450 bước mất khoảng 10 ms.
  - Màn xem lại dùng lại vẽ bàn chơi ở chế độ chỉ xem:
    - có ◀ ▶ từng bước, nút tự chạy (khoảng 0,8 giây/bước), thanh kéo;
    - ô "Xem từ ghế của …";
    - nút thoát về sảnh;
    - không âm thanh, không đồng hồ.
  - Mở xem lại từ hai chỗ: màn kết thúc ván ("🎞️ Xem lại ván"), và mục "Ván gần đây" ở sảnh.
- **Hướng dẫn trên bàn**:
  - Lần đầu một người chơi (không phải người xem) vào ván trên trình duyệt đó, hiện lần lượt 6 bước:
    1. vai của bạn và mục tiêu;
    2. tay bài và cách chơi một lá;
    3. ghế, máu, khoảng cách;
    4. banner hành động và đồng hồ chơi thay;
    5. nhật ký và chat;
    6. nút ❓ để xem lại luật.
  - Mỗi bước có "Tiếp" và "Bỏ qua". Xong hoặc bỏ qua thì ghi nhớ vào `localStorage`.
  - Mở lại được bằng nút "Xem hướng dẫn trên bàn" trong modal ❓.
  - Bước nào không có phần tử trên màn hình (ví dụ nhật ký ẩn trên mobile) thì tự bỏ qua.

**Data Flow**:

- Xem lại ván: client gửi lệnh đọc bước k → server lấy ván trong `room.history` → `newGame(seed)` + `apply` k action đầu → `viewFor(ghế đã chọn)` + vai mọi người → client vẽ bàn ở chế độ chỉ xem.
- Người xem: vào phòng → server gắn `spectator` → mỗi lần poll nhận `viewFor` không ghế → client vẽ bàn không có tay bài.

## 4. Failure modes

- Khi dựng lại ván xem lại mà engine ném lỗi (ván ghi bằng phiên bản luật cũ, code đã đổi), hệ thống phải dừng ở bước cuối dựng được. Màn xem lại báo "Ván này ghi bằng phiên bản luật cũ, chỉ xem lại được tới bước N", không sập server.
- Khi gửi chat rỗng, dài quá 200 ký tự, hoặc dồn hơn 1 tin/giây, hệ thống phải từ chối bằng thông báo rõ và không lưu tin.
- Khi đã có 10 người xem mà thêm người vào phòng đang chơi, hệ thống phải từ chối với thông báo "Phòng đã đủ người xem".
- Khi người xem gửi lệnh chơi (`/api/action`), hệ thống phải từ chối vì họ không có ghế, và không làm hỏng ván.
- Khi mã ván xem lại không còn (bị đẩy khỏi 5 ván gần nhất, hoặc phòng đã bị dọn), hệ thống phải báo "Không còn ván này" và đưa về sảnh.
- Khi người chơi đang trong hướng dẫn mà tới lượt, hệ thống vẫn chạy đồng hồ chơi thay như thường. Hướng dẫn chỉ là lớp phủ, bấm "Bỏ qua" là chơi tiếp ngay.
- Khi server khởi động lại, chat, người xem và lịch sử ván phải được khôi phục từ `data/rooms.json` như phòng hiện nay.

## 5. Hoàn thành & Loại trừ

**Done**:

- Hai trình duyệt cùng phòng: tin gửi từ máy A hiện bong bóng trên ghế A ở máy B, và nằm trong tab Chat. Có ở cả sảnh lẫn ván.
- Ván đang chơi, máy thứ ba vào bằng tên mới thì thấy bàn, không thấy bài trên tay ai, không có nút hành động. Về sảnh thì thành người chơi.
- Ván kết thúc: bấm "🎞️ Xem lại ván" tua được từ bước 0 tới bước cuối. Đổi ghế thì thấy bài người đó. Bước cuối trùng kết quả ván.
- Sảnh có "Ván gần đây", tối đa 5 ván, mở xem lại được.
- Lần đầu vào ván hiện 6 bước hướng dẫn. Lần sau không hiện. Mở lại được từ ❓.
- `npm test` có kịch bản mới cho:
  - người xem không thấy bài trên tay;
  - người xem bị chặn khi gửi lệnh chơi;
  - giới hạn chat;
  - ảnh chụp xem lại ở bước cuối khớp với ván gốc.
- Kiểm trên trình duyệt ở cả desktop và mobile.

**Not done**:

- Chat riêng giữa hai người, chặn người, lọc từ bậy.
- Người xem thấy hết bài (chế độ bình luận viên).
- Tải ván về máy, chia sẻ link xem lại ra ngoài phòng.
- Ván tập có kịch bản, trang hướng dẫn có hình.
- Không đổi luật engine và không đổi định dạng action.

## 6. Câu hỏi mở

- **ASSUMPTION**: Người đã chết vẫn chat được. Mặc định vai đã lật khi chết, nên không lộ thêm gì.
- **ASSUMPTION**: Lịch sử ván và chat mất khi phòng bị dọn (sảnh không ai online 1 giờ, hoặc phòng im 12 giờ), giống phòng hiện nay.
- **ASSUMPTION**: Xem lại ván không cần quyền chủ phòng. Ai trong phòng cũng xem được, và không ảnh hưởng người khác.
