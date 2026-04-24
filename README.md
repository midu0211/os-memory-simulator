# Memory Management Simulator

Bài tập môn Operating Systems — mô phỏng và so sánh 4 kỹ thuật quản lý bộ nhớ.

---

## Thành viên & nhiệm vụ

| Thành viên | Nhiệm vụ | Branch |
|---|---|---|
| Nguyễn Minh Đức | Contiguous Allocation + setup repo | `feat/contiguous` |
| Phạm Đặng Tấn Dũng | Paging | `feat/paging` |
| Nguyễn Nghĩa Hà | Segmentation | `feat/segmentation` |
| Nguyễn Trung Kiên | Virtual Memory + tab Compare | `feat/virtual-memory` |

> Thay tên và branch thật của nhóm vào bảng trên.

---

## Cài đặt

Yêu cầu: **Node.js 18+** — tải tại [nodejs.org](https://nodejs.org) nếu chưa có.

```bash
git clone https://github.com/midu0211/os-memory-simulator.git
cd os-memory-simulator
npm install
npm run dev
```

Mở trình duyệt tại `http://localhost:5173`.

---

## Tech stack

- **React + TypeScript + Vite** — framework chính
- **Tailwind CSS v3** — styling
- **Recharts** — biểu đồ tab Compare
- **Framer Motion** — animation

---

## Quy tắc Git

1. **Không commit thẳng vào `main`.**
2. Mỗi task tạo branch riêng, xong mở Pull Request, cần 1 người review.

```bash
git checkout main && git pull origin main
git checkout -b feat/tên-task
# code xong...
git add . && git commit -m "feat(scope): mô tả ngắn"
git push origin feat/tên-task
# vào GitHub mở Pull Request
```

---

## Lịch 4 tuần

| Tuần | Việc cần làm |
|---|---|
| 1 | Research kỹ thuật của mình, đọc `shared/types.ts`, setup repo |
| 2 | Code logic (`logic.ts`) — chưa cần UI, test bằng console |
| 3 | Làm UI cho tab của mình, tab Compare |
| 4 | Benchmark, viết báo cáo, làm slide |

---

## Cấu trúc thư mục

```
src/
  simulators/
    contiguous/       ← Nguyễn Minh Đức
    paging/           ← Phạm Đặng Tấn Dũng
    segmentation/     ← Nguyễn Nghĩa Hà
    virtualMemory/    ← Nguyễn Trung Kiên
  compare/
  shared/
    types.ts          ← interface chung, sửa phải báo cả nhóm
```

**Mỗi người chỉ sửa file trong thư mục của mình.**