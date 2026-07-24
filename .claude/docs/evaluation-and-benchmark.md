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

> Trạng thái 2026-07-24: mục 1–3, 5 và phần tag-quality của mục 4 ĐÃ LÀM (build/tsc xanh; cần
> `prisma migrate deploy` cho 4 migration mới + 3 migration đang chờ). Phần `bge-m3` của mục 4
> **hoãn** theo quyết định (nặng, lợi ích chưa chắc). Cần validate live bằng Playwright.

- [x] **1. Note authoring** — mở rộng `documents` (`source: upload|note`, cột file nullable),
  `POST /documents/notes`, `PATCH /documents/:id` (chỉ note), worker bỏ qua storage/OCR cho note,
  editor FE (textarea + preview), route `/documents/new` & `/documents/[id]/edit`, badge "Note".
- [x] **2. Backlink `[[...]]`** — thêm edge `links_to` (document↔document thật), `relateByLinks`
  parse `[[Title]]`/`[[Title|alias]]` (resolve theo title bỏ dấu), `GET /documents/:id/backlinks`,
  panel "Linked references" + link `[[..]]` bấm được (search theo tiêu đề).
- [x] **3. Markdown trong chat** — `react-markdown` + `remark-gfm` (KHÔNG `rehype-raw`, an toàn XSS);
  cột `AiChatMessage.sources` (JSONB) lưu citation bền qua reload; component `Markdown` dùng chung.
- [~] **4. Retrieval đa ngữ + tag quality** — ĐÃ: `extract-keywords.ts` fold dấu khi dedup + giữ
  surface form phổ biến, lọc thêm structural words; cột `tags.normalized_name` (unique) gộp biến thể
  có/không dấu (migration merge dup). HOÃN: `bge-m3` (đã tài liệu hoá cách đổi khi cần).
- [x] **5. Theme + hardening** — `disableTransitionOnChange` (chống FOUC) + sửa metadata; CORS
  fail-closed ở prod; `POST /documents/:id/reprocess` (jobId duy nhất, không bị dedup) + prune job;
  cron dọn `processing_jobs`; semaphore giới hạn OCR; guard dimension embeddings trước INSERT.

## Gợi ý mở rộng (định vị dài hạn)
- Mobile/offline (PWA) hoặc app; spaced-repetition/flashcard (đã trong spec gốc, ngoài MVP).
- Multi-workspace thật + chia sẻ/permission (hiện single-owner).
