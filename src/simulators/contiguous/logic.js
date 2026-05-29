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
  const c = COLORS[_colorIdx % COLORS.length];
  _colorIdx++;
  return c;
}

function resetColor() {
  _colorIdx = 0;
}

function uid() {
  return Math.random().toString(36).slice(2, 8);
}

function getFreeBlocks(blocks) {
  return blocks.filter((b) => !b.processId);
}

function pickBlock(freeBlocks, size, strategy) {
  const candidates = freeBlocks.filter((b) => b.size >= size);
  if (!candidates.length) return null;

  if (strategy === "first-fit")
    return candidates.reduce((a, b) => (a.start < b.start ? a : b));

  if (strategy === "best-fit")
    return candidates.reduce((a, b) => (a.size < b.size ? a : b));

  if (strategy === "worst-fit")
    return candidates.reduce((a, b) => (a.size > b.size ? a : b));

  return null;
}

function mergeAdjacentFree(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const merged = [];
  for (const block of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && !prev.processId && !block.processId) {
      prev.size += block.size;
    } else {
      merged.push({ ...block });
    }
  }
  return merged;
}

export function createInitialState(totalMemory = 64, strategy = "first-fit") {
  resetColor();
  return {
    totalMemory,
    strategy,
    blocks: [
      {
        id: uid(),
        start: 0,
        size: totalMemory,
        processId: null,
        processName: null,
        color: null,
      },
    ],
    processes: [],
    events: [],
  };
}

export function allocate(state, processName, size) {
  const freeBlocks = getFreeBlocks(state.blocks);
  const chosen = pickBlock(freeBlocks, size, state.strategy);

  if (!chosen) {
    const event = {
      type: "fail",
      processId: "",
      processName,
      size,
      reason: `Không tìm được block đủ ${size} KB (${state.strategy})`,
      timestamp: Date.now(),
    };
    return { ...state, events: [...state.events, event] };
  }

  const processId = uid();
  const color = nextColor();
  const newProcess = { id: processId, name: processName, size, color };

  const newBlocks = state.blocks.flatMap((b) => {
    if (b.id !== chosen.id) return [b];
    const allocated = {
      id: uid(),
      start: b.start,
      size,
      processId,
      processName,
      color,
    };
    if (b.size === size) return [allocated];
    const remaining = {
      id: uid(),
      start: b.start + size,
      size: b.size - size,
      processId: null,
      processName: null,
      color: null,
    };
    return [allocated, remaining];
  });

  const event = {
    type: "allocate",
    processId,
    processName,
    size,
    blockStart: chosen.start,
    strategy: state.strategy,
    timestamp: Date.now(),
  };

  return {
    ...state,
    blocks: newBlocks,
    processes: [...state.processes, newProcess],
    events: [...state.events, event],
  };
}

export function freeProcess(state, processId) {
  const process = state.processes.find((p) => p.id === processId);
  if (!process) return state;

  let newBlocks = state.blocks.map((b) =>
    b.processId === processId
      ? { ...b, processId: null, processName: null, color: null }
      : b
  );
  newBlocks = mergeAdjacentFree(newBlocks);

  const event = {
    type: "free",
    processId,
    processName: process.name,
    size: process.size,
    timestamp: Date.now(),
  };

  return {
    ...state,
    blocks: newBlocks,
    processes: state.processes.filter((p) => p.id !== processId),
    events: [...state.events, event],
  };
}

export function getMetrics(state) {
  const free = getFreeBlocks(state.blocks);
  const freeTotal = free.reduce((s, b) => s + b.size, 0);
  const usedMemory = state.totalMemory - freeTotal;
  const largestFree = free.reduce((m, b) => Math.max(m, b.size), 0);
  const fragmentationPercent =
    freeTotal === 0
      ? 0
      : Math.round(((freeTotal - largestFree) / freeTotal) * 100);

  return {
    totalMemory: state.totalMemory,
    usedMemory,
    freeMemory: freeTotal,
    fragmentationPercent,
    numFreeBlocks: free.length,
    numProcesses: state.processes.length,
    largestFreeBlock: largestFree,
    numPageFaults: 0,
    avgAccessSteps: state.events.filter((e) => e.type === "allocate").length,
  };
}

export function compact(state) {
  const allocated = state.blocks
    .filter((b) => b.processId)
    .sort((a, b) => a.start - b.start);

  if (allocated.length === 0) return state;

  const newBlocks = [];
  let cursor = 0;

  for (const block of allocated) {
    newBlocks.push({
      ...block,
      id: uid(),
      start: cursor,
    });
    cursor += block.size;
  }

  if (cursor < state.totalMemory) {
    newBlocks.push({
      id: uid(),
      start: cursor,
      size: state.totalMemory - cursor,
      processId: null,
      processName: null,
      color: null,
    });
  }

  const freed = state.totalMemory - cursor;
  const event = {
    type: "compact",
    processId: "",
    processName: "",
    size: 0,
    reason: `Compaction: gom ${allocated.length} blocks, tạo free block ${freed} KB liên tục`,
    timestamp: Date.now(),
  };

  return {
    ...state,
    blocks: newBlocks,
    events: [...state.events, event],
  };
}

export function runFragmentationDemo(totalMemory = 64, strategy = "first-fit") {
  let s = createInitialState(totalMemory, strategy);
  for (const [name, size] of [
    ["P1", 8], ["P2", 4], ["P3", 8], ["P4", 4], ["P5", 8],
  ]) {
    s = allocate(s, name, size);
  }
  [s.processes[0], s.processes[2], s.processes[4]].forEach((p) => {
    if (p) s = freeProcess(s, p.id);
  });
  return s;
}

export function runRandomWorkload(totalMemory = 64, strategy = "first-fit") {
  let s = createInitialState(totalMemory, strategy);
  for (const [name, size] of [
    ["Chrome", 8], ["VSCode", 6], ["Node", 4], ["Figma", 8], ["Slack", 4],
  ]) {
    s = allocate(s, name, size);
  }
  return s;
}