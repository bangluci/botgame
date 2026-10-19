THƯ MỤC CUSTOM — nơi bạn sửa game mà không đụng vào file gốc trong config/

Tạo file cùng tên với file trong config/ (cards.json, characters.json, events.json, roles.json,
rules.json, presets.json) rồi chỉ ghi phần bạn muốn thêm/đổi. Lưu file, rồi bấm "Bắt đầu ván" lại
là có hiệu lực (không cần tắt server). Nếu file sai JSON, game báo lỗi nói rõ file nào.

- cards.json / characters.json / events.json: gộp theo từng key.
    * key mới  = thêm lá/nhân vật/sự kiện mới
    * key cũ   = ghi đè các trường bạn viết (các trường khác giữ nguyên)
    * "key": null = xoá mục đó
- roles.json: ghi đè bảng vai trò theo số người, ví dụ "3": ["sheriff","outlaw","outlaw"]
- rules.json: đổi giá trị mặc định của luật, ví dụ { "drawPerTurn": 3, "sheriffBonusLife": 2 }
- presets.json: mảng các preset mới hiện thành nút ở sảnh (xem config/presets.json để biết cấu trúc)

Xem file custom/cards.example.json để biết mẫu. Đổi tên thành cards.json để dùng thử.
