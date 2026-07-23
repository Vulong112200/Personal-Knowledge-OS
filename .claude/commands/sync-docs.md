---
description: Cập nhật documentation framework của PKOS (NestJS + Next.js) dựa trên các thay đổi code gần nhất.
---

Cập nhật documentation framework của project dựa trên các thay đổi code gần nhất.

## Thực hiện theo thứ tự sau:

### Bước 1 — Xác định thay đổi
Chạy `git diff HEAD~1 --name-only` (và `git status --short` nếu có uncommitted changes) để xem file nào đã thay đổi. Phân loại:
- Backend thay đổi: `apps/api/src/<module>/` (module nào? port mới hay feature module thường?)
- Frontend thay đổi: `apps/web/app/`, `apps/web/lib/`
- Shared thay đổi: `packages/contracts/src/` — **nhắc rebuild**: `pnpm --filter @pkos/contracts build`
- Schema/migration thay đổi: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`
- File mới được tạo, file bị xóa hoặc đổi tên

### Bước 2 — Cập nhật CLAUDE.md (root)
Đọc `CLAUDE.md`, sau đó cập nhật các section phù hợp:
- **Key Features Registry**: thêm/sửa row cho feature mới hoặc đổi status (📋→✅), hoặc ❌ nếu bị bỏ khỏi scope (ghi rõ lý do, theo pattern đã có với semantic search/OpenRouter)
- **API Endpoints Summary**: thêm route mới vào đúng bảng (method, path, auth, module)
- **Ports table**: nếu thêm adapter mới cho 1 trong 5 port (`STORAGE_PORT`/`SEARCH_PORT`/`AI_PORT`/`AUTH_PORT`/`QUEUE_PORT`), hoặc thêm port mới hoàn toàn
- **Database models**: nếu thêm/sửa table trong `schema.prisma`
- **Most important files**: nếu có file core mới đáng nhắc (theo tiêu chí: file mà sửa sai sẽ gây lỗi khó debug, hoặc là điểm tích hợp rủi ro cao)

### Bước 3 — Cập nhật .claude/docs/features.md
Đọc file, rồi:
- Tìm section của feature vừa thay đổi (mỗi feature có format: Status/Backend/Frontend/Key logic)
- Nếu feature mới: thêm section mới theo đúng format đó
- Nếu feature hoàn thiện thêm: cập nhật bullet "Key logic" (đặc biệt: quyết định thiết kế, edge case, gotcha — không chỉ liệt kê lại code đã làm gì)
- Cập nhật **Database Tables Status** table nếu thêm/sửa/bỏ dùng table
- Cập nhật **Frontend state — TanStack Query key map** nếu thêm query key mới

### Bước 4 — Cập nhật .claude/docs/structure.md
Đọc file, rồi:
- Thêm entry cho file mới (đúng vị trí trong tree, với comment ngắn mô tả mục đích — không mô tả nội dung hiển nhiên từ tên file)
- Xóa entry cho file đã bị xóa
- Nếu thêm module/thư mục mới: thêm cả thư mục và các file bên trong, theo đúng pattern `<module>.port.ts` / `<adapter>.adapter.ts` / `<module>.module.ts` nếu đó là 1 port mới

### Bước 5 — Cập nhật .claude/docs/callflows.md (chỉ khi cần)
Chỉ cập nhật nếu có thay đổi call flow quan trọng (flow mới — ví dụ thêm 1 stage vào ingestion pipeline, endpoint đổi logic, thêm bước vào flow hiện có). Giữ format hiện có: pseudo-trace với `→` chỉ hướng gọi, kèm tên file/class cụ thể trong `[...]`.

### Bước 6 — Báo cáo
Sau khi xong, tóm tắt ngắn: đã cập nhật file nào, section nào, thay đổi gì.
