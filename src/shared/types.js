// shared/types.js
// Interface chung cho tất cả 4 simulator
// SỬA FILE NÀY PHẢI BÁO CẢ NHÓM

export const STRATEGIES = {
  FIRST_FIT: "first-fit",
  BEST_FIT:  "best-fit",
  WORST_FIT: "worst-fit",
};

export const EVENT_TYPES = {
  ALLOCATE: "allocate",
  FREE:     "free",
  FAIL:     "fail",
};

// Mỗi simulator phải trả về object có dạng này để tab Compare dùng được
// {
//   fragmentationPercent: number,   // 0-100
//   usedMemory:           number,   // KB
//   freeMemory:           number,   // KB
//   numPageFaults:        number,   // 0 với contiguous/paging/seg
//   avgAccessSteps:       number,   // số bước tìm block trung bình
// }
