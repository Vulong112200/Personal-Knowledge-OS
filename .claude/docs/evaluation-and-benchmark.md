# PKOS — Đánh giá vận hành & Benchmark

> Nguồn: phiên kiểm thử Playwright ngày 2026-07-24 với tài khoản test `pkos-test@example.com`
> (~300 tài liệu seed, 12 loại file). Artifact bản đẹp:
> https://claude.ai/code/artifact/7c727f38-4e1a-4f85-ac7e-fb9e051920d0

## Định vị

PKOS hiện giống **"NotebookLM (chat có trích dẫn) + Obsidian (đồ thị tri thức)"** đóng gói self-host.
Vượt đa số đối thủ ở: nạp đa định dạng (code/Excel/OCR), tiếng Việt bỏ dấu, embeddings local miễn phí.
Thiếu hai năng lực lõi mà mọi PKM khác đều có: **soạn/sửa ghi chú** và **backlink thủ công**.

## Đã kiểm thử chạy thật (Playwright, không lỗi runtime)

- **Documents** — danh sách đủ loại, dung lượng KB, badge `Processed`, xóa từng mục.
- **Tags** — pill + số đếm; bigram EN/VI (`campaign audience` ×23, `chi phí` ×17, `báo cáo` ×11).
- **Graph** — force 2D/3D, "500/554 nodes", phân cụm theo danh mục.
- **Search** — `ngan sach` (không dấu) → 30 kết quả có dấu; bấm được; xác thực extraction `.xlsx` & `.py`.
- **Doc detail** — đọc nội dung (VI đúng), ego-graph, chat theo tài liệu, tải & xóa.
- **Chat toàn kho** — RAG trích dẫn `[#n]`, trả lời cross-document, từ chối khi không có; panel Sources bấm được.

## Hạn chế phát hiện (ưu tiên xử lý)

| # | Vấn đề | Mức | Hướng sửa |
|---|---|---|---|
| 1 | Truy hồi đa ngôn ngữ yếu (VI query không kéo được doc EN; e5 thiên vị cùng ngôn ngữ) | Trung bình | `bge-m3` hoặc dịch/chuẩn hoá truy vấn trước retrieval |
| 2 | Chat chưa render Markdown (`**`, `[#1]`, list hiện thô) | Trung bình | thêm `react-markdown`; nguồn bền theo từng message |
| 3 | Chất lượng tag: trùng có/không dấu; structural words thành tag | Thấp | fold dấu khi normalize tag; lọc structural words; TF-IDF |
| 4 | Lệch theme (nội dung sáng, sidebar tối; FOUC) | Thấp | rà `defaultTheme`/`suppressHydrationWarning` next-themes |

## So sánh năng lực (● đủ · ◐ một phần/plugin · ○ thiếu)

| Năng lực | PKOS | Obsidian | Logseq | Notion | Mem | Reflect | NotebookLM |
|---|---|---|---|---|---|---|---|
| Nạp đa định dạng (PDF/DOCX/XLSX/HTML/code) | ● rộng | ◐ md | ◐ md | ◐ import | ◐ | ◐ | ● |
| OCR PDF scan | ● | ◐ | ◐ | ○ | ○ | ○ | ● |
| Full-text tiếng Việt (bỏ dấu) | ● hiếm | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| Chat AI trích dẫn nguồn toàn KB | ● | ◐ | ◐ | ● | ● | ● | ● chuẩn mực |
| Semantic/hybrid RAG | ● local free | ◐ | ◐ | ● | ● | ● | ● |
| Đồ thị tri thức | ● 2D/3D | ● đỉnh cao | ● | ○ | ◐ | ◐ | ○ |
| Tự phân loại/tag | ◐ keyword | ○ | ○ | ○ | ● AI | ◐ | ○ |
| **Soạn/sửa ghi chú trong app** | ○ **thiếu** | ● lõi | ● lõi | ● lõi | ● | ● | ◐ |
| **Backlink / [[note]]** | ○ **thiếu** | ● lõi | ● lõi | ● | ● | ● | ○ |
| Self-host/riêng tư | ● | ● local | ● local | ○ cloud | ○ | ○ | ○ |
| Mobile/offline | ○ | ● | ● | ● | ● | ● | ◐ |

## Checklist ưu tiên sửa (theo tác động)

- [ ] **1. Note authoring** — trình soạn Markdown + tạo/sửa note trong app (thiếu sót số 1).
  Cần: schema note (khác document upload), endpoint CRUD, editor FE, đưa note vào pipeline
  index/chunk/embed như document.
- [ ] **2. Backlink `[[...]]`** — parse wiki-link khi lưu note, tạo cạnh document↔document thật;
  graph hiển thị cạnh link (không chỉ shared-tag); panel "Linked references".
- [ ] **3. Markdown trong chat** — thêm `react-markdown` (an toàn XSS: không HTML thô);
  lưu `sources` theo từng `AiChatMessage` (thêm cột JSON) để hiển thị bền qua reload.
- [ ] **4. Retrieval đa ngữ + tag quality** — cân nhắc `bge-m3` (1024d, đổi vector dim + migration)
  hoặc dịch truy vấn; trong `extract-keywords.ts`: fold dấu khi dedup tag, lọc structural words.
- [ ] **5. Theme + mục hoãn từ review source** — sửa FOUC theme; các mục đã ghi:
  CORS fail-closed ở prod, tránh `jobId` dedup cho endpoint reprocess tương lai, dọn `processing_jobs`,
  giới hạn concurrency khi OCR, chú ý dimension-config drift embeddings.

## Gợi ý mở rộng (định vị dài hạn)
- Mobile/offline (PWA) hoặc app; spaced-repetition/flashcard (đã trong spec gốc, ngoài MVP).
- Multi-workspace thật + chia sẻ/permission (hiện single-owner).
