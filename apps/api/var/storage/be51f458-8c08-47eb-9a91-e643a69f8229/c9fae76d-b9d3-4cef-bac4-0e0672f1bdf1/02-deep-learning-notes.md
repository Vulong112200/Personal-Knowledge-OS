# Ghi chú về Deep Learning và Neural Network

Đây là ghi chú cá nhân sau khi đọc một số tài liệu về deep learning.

## Kiến trúc neural network phổ biến

- **CNN (Convolutional Neural Network)**: mạnh cho dữ liệu ảnh, dùng nhiều trong
  computer vision.
- **RNN/LSTM**: xử lý dữ liệu tuần tự, nhưng dần bị thay thế bởi Transformer.
- **Transformer**: nền tảng của các mô hình ngôn ngữ lớn hiện đại, dùng cơ chế
  self-attention để xử lý toàn bộ chuỗi dữ liệu cùng lúc.

## Deep learning trong thực tế

Khi triển khai deep learning vào sản phẩm thực tế, cần quan tâm:
- Chi phí inference (đặc biệt với mô hình lớn).
- Latency — mô hình neural network lớn có thể chậm nếu không tối ưu.
- Chất lượng dữ liệu huấn luyện quyết định phần lớn hiệu năng mô hình.

Deep learning vẫn đang phát triển rất nhanh, đặc biệt là các mô hình neural network
dạng multi-modal có thể xử lý cả text, ảnh và âm thanh.
