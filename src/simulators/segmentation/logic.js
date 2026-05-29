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
function nextColor() { const c = COLORS[_colorIdx % COLORS.length]; _colorIdx++; return c; }
function resetColor() { _colorIdx = 0; }
function uid() { return Math.random().toString(36).slice(2, 8); }

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

// ─── Core ────────────────────────────────────────────────────

export function createInitialState(totalMemory = 128, strategy = "first-fit") {
  resetColor();
  return {
    totalMemory,
    strategy,
    blocks: [{ id: uid(), start: 0, size: totalMemory, processId: null, segmentName: null, color: null }],
    processes: [],   // { id, name, color, segments: [{segId, name, size, base}] }
    events: [],
  };
}

// segments = [{ name: "code", size: 10 }, { name: "data", size: 4 }, ...]
export function allocate(state, processName, segments) {
  const color = nextColor();
  const processId = uid();
  const allocatedSegments = [];
  let newBlocks = [...state.blocks];

  for (const seg of segments) {
    const free = getFreeBlocks(newBlocks);
    const chosen = pickBlock(free, seg.size, state.strategy);
    if (!chosen) {
      // Rollback — giải phóng hết những segment đã cấp phát trong lần này
      newBlocks = state.blocks;
      const event = {
        type: "fail",
        processId: "",
        processName,
        reason: `Không đủ chỗ liên tiếp cho segment "${seg.name}" (${seg.size} KB)`,
        timestamp: Date.now(),
      };
      return { ...state, events: [...state.events, event] };
    }

    const segId = uid();
    allocatedSegments.push({ segId, name: seg.name, size: seg.size, base: chosen.start });

    newBlocks = newBlocks.flatMap((b) => {
      if (b.id !== chosen.id) return [b];
      const allocated = { id: segId, start: b.start, size: seg.size, processId, segmentName: seg.name, color };
      if (b.size === seg.size) return [allocated];
      const remaining = { id: uid(), start: b.start + seg.size, size: b.size - seg.size, processId: null, segmentName: null, color: null };
      return [allocated, remaining];
    });
  }

  const newProcess = { id: processId, name: processName, color, segments: allocatedSegments };
  const event = {
    type: "allocate",
    processId,
    processName,
    segments: allocatedSegments,
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
    b.processId === processId ? { ...b, processId: null, segmentName: null, color: null } : b
  );
  newBlocks = mergeAdjacentFree(newBlocks);

  const event = {
    type: "free",
    processId,
    processName: process.name,
    timestamp: Date.now(),
  };

  return {
    ...state,
    blocks: newBlocks,
    processes: state.processes.filter((p) => p.id !== processId),
    events: [...state.events, event],
  };
}

// Dịch địa chỉ logic <segmentName, offset> → địa chỉ vật lý
export function translateAddress(process, segmentName, offset) {
  const seg = process.segments.find((s) => s.name === segmentName);
  if (!seg) return { error: `Segment "${segmentName}" không tồn tại` };
  if (offset >= seg.size) return { error: `Offset ${offset} vượt limit ${seg.size} (segment fault!)` };
  return { physical: seg.base + offset, base: seg.base, limit: seg.size, offset };
}

export function getMetrics(state) {
  const free = getFreeBlocks(state.blocks);
  const freeTotal = free.reduce((s, b) => s + b.size, 0);
  const usedMemory = state.totalMemory - freeTotal;
  const largestFree = free.reduce((m, b) => Math.max(m, b.size), 0);
  const fragmentationPercent =
    freeTotal === 0 ? 0 : Math.round(((freeTotal - largestFree) / freeTotal) * 100);

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

// ─── Presets ─────────────────────────────────────────────────

export function runDemo(totalMemory = 128) {
  let s = createInitialState(totalMemory);
  s = allocate(s, "Browser", [{ name: "code", size: 16 }, { name: "data", size: 8 }, { name: "heap", size: 12 }, { name: "stack", size: 4 }]);
  s = allocate(s, "Editor",  [{ name: "code", size: 10 }, { name: "data", size: 6 }, { name: "stack", size: 4 }]);
  s = allocate(s, "Player",  [{ name: "code", size: 8  }, { name: "data", size: 4 }, { name: "stack", size: 4 }]);
  return s;
}

export function runFragDemo(totalMemory = 128) {
  let s = runDemo(totalMemory);
  // Free process giữa để tạo fragmentation
  if (s.processes[1]) s = freeProcess(s, s.processes[1].id);
  return s;
}