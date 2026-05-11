// simulators/paging/logic.js
// TODO: thành viên phụ trách điền vào
// src/simulators/paging/logic.js

const COLORS = [
  { bg: "#CECBF6", text: "#26215C" },
  { bg: "#9FE1CB", text: "#04342C" },
  { bg: "#F5C4B3", text: "#4A1B0C" },
  { bg: "#F4C0D1", text: "#4B1528" },
  { bg: "#B5D4F4", text: "#0C447C" },
  { bg: "#C0DD97", text: "#173404" },
  { bg: "#FAC775", text: "#412402" },
  { bg: "#F7C1C1", text: "#501313" },
];

let _colorIdx = 0;
function nextColor() {
  return COLORS[_colorIdx++ % COLORS.length];
}
function resetColor() {
  _colorIdx = 0;
}
function uid() {
  return Math.random().toString(36).slice(2, 8);
}

export function createInitialState(totalMemory = 64, pageSize = 4) {
  resetColor();
  const numFrames = Math.floor(totalMemory / pageSize);
  const frames = Array.from({ length: numFrames }, (_, i) => ({
    id: i, // Frame number
    processId: null,
    processName: null,
    pageNumber: null,
    color: null,
  }));

  return {
    totalMemory,
    pageSize,
    frames,
    processes: [],
    events: [],
  };
}

export function allocate(state, processName, size) {
  const neededPages = Math.ceil(size / state.pageSize);
  const freeFrames = state.frames.filter((f) => f.processId === null);

  // Không đủ frame trống -> Fail
  if (freeFrames.length < neededPages) {
    const event = {
      type: "fail",
      processName,
      size,
      reason: `Cần ${neededPages} frames, nhưng chỉ còn ${freeFrames.length} frames trống.`,
      timestamp: Date.now(),
    };
    return { ...state, events: [...state.events, event] };
  }

  const processId = uid();
  const color = nextColor();
  const allocatedFrames = [];
  const newFrames = [...state.frames];
  let pagesAllocated = 0;

  // Cấp phát frame rời rạc (đặc trưng của Paging)
  for (let i = 0; i < newFrames.length; i++) {
    if (newFrames[i].processId === null && pagesAllocated < neededPages) {
      newFrames[i] = {
        ...newFrames[i],
        processId,
        processName,
        pageNumber: pagesAllocated,
        color,
      };
      allocatedFrames.push(i); // Lưu số hiệu frame
      pagesAllocated++;
    }
  }

  // Tính Internal Fragmentation
  const allocatedMemory = neededPages * state.pageSize;
  const internalFrag = allocatedMemory - size;

  const newProcess = {
    id: processId,
    name: processName,
    size,
    allocatedMemory,
    internalFrag,
    pageTable: allocatedFrames, // Index là page, value là frame
    color,
  };

  const event = {
    type: "allocate",
    processId,
    processName,
    size,
    details: `Cấp ${neededPages} pages (Lãng phí nội: ${internalFrag} KB)`,
    timestamp: Date.now(),
  };

  return {
    ...state,
    frames: newFrames,
    processes: [...state.processes, newProcess],
    events: [...state.events, event],
  };
}

export function freeProcess(state, processId) {
  const process = state.processes.find((p) => p.id === processId);
  if (!process) return state;

  const newFrames = state.frames.map((f) =>
    f.processId === processId
      ? { ...f, processId: null, processName: null, pageNumber: null, color: null }
      : f
  );

  const event = {
    type: "free",
    processId,
    processName: process.name,
    size: process.size,
    timestamp: Date.now(),
  };

  return {
    ...state,
    frames: newFrames,
    processes: state.processes.filter((p) => p.id !== processId),
    events: [...state.events, event],
  };
}

export function getMetrics(state) {
  const freeFrames = state.frames.filter((f) => f.processId === null).length;
  const freeMemory = freeFrames * state.pageSize;
  const usedMemory = state.totalMemory - freeMemory;
  
  const totalInternalFrag = state.processes.reduce((sum, p) => sum + p.internalFrag, 0);
  const fragmentationPercent = usedMemory === 0 
    ? 0 
    : Math.round((totalInternalFrag / usedMemory) * 100);

  const totalPages = state.processes.reduce((sum, p) => sum + p.pageTable.length, 0);

  return {
    totalMemory: state.totalMemory,
    usedMemory,
    freeMemory,
    fragmentationPercent, // Ở đây thể hiện cho Internal Fragmentation
    totalInternalFrag,
    totalPages,
    numPageFaults: 0,
    avgAccessSteps: 1, // Paging dùng O(1) tra bảng
  };
}

export function runDemoWorkload(totalMemory, pageSize) {
  let s = createInitialState(totalMemory, pageSize);
  s = allocate(s, "Word", 13);    // Ví dụ: PageSize 4 => 4 pages (16KB) => Nội phân mảnh 3KB
  s = allocate(s, "Excel", 9);    // 3 pages (12KB) => Nội phân mảnh 3KB
  s = allocate(s, "Spotify", 5);  // 2 pages (8KB) => Nội phân mảnh 3KB
  s = freeProcess(s, s.processes[1]?.id); // Xóa Excel để tạo khoảng trống rời rạc
  s = allocate(s, "Chrome", 10);  // Sẽ chen vào các khoảng trống rời rạc (khắc phục Ext Frag)
  return s;
}