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

export const DEFAULT_PAGE_SIZE = 4;

export const VM_STRATEGIES = [
  { value: "paging", label: "Paging" },
  { value: "segmentation", label: "Segmentation" },
  { value: "segmented-paging", label: "Segmentation + Paging" },
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

function isPaged(strategy) {
  return strategy === "paging" || strategy === "segmented-paging";
}

function getFreeBlocks(blocks) {
  return blocks.filter((b) => !b.processId);
}

function makeFreeFrame(start, size, frameIndex) {
  return {
    id: uid(),
    type: "frame",
    frameIndex,
    start,
    size,
    processId: null,
    processName: null,
    itemId: null,
    color: null,
  };
}

function makeFreeBlock(start, size) {
  return {
    id: uid(),
    type: "block",
    start,
    size,
    processId: null,
    processName: null,
    itemId: null,
    color: null,
  };
}

function createFrames(totalMemory, pageSize) {
  const frames = [];

  for (let start = 0, i = 0; start < totalMemory; start += pageSize, i++) {
    frames.push(
      makeFreeFrame(start, Math.min(pageSize, totalMemory - start), i)
    );
  }

  return frames;
}

function resetBlock(block) {
  if (block.type === "frame") {
    return makeFreeFrame(block.start, block.size, block.frameIndex);
  }

  return makeFreeBlock(block.start, block.size);
}

function mergeAdjacentFree(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const merged = [];

  for (const block of sorted) {
    const prev = merged[merged.length - 1];

    if (
      prev &&
      !prev.processId &&
      !block.processId &&
      prev.type === "block" &&
      block.type === "block" &&
      prev.start + prev.size === block.start
    ) {
      prev.size += block.size;
    } else {
      merged.push({ ...block });
    }
  }

  return merged;
}

function splitIntoSegments(totalSize) {
  const ratios = [
    { name: "Code", ratio: 0.25 },
    { name: "Data", ratio: 0.25 },
    { name: "Heap", ratio: 0.3 },
    { name: "Stack", ratio: 0.2 },
  ];

  const segments = ratios.map((s) => ({
    name: s.name,
    size: Math.max(1, Math.round(totalSize * s.ratio)),
  }));

  let sum = segments.reduce((acc, s) => acc + s.size, 0);

  while (sum > totalSize) {
    const idx = segments.reduce(
      (maxIdx, s, i) => (s.size > segments[maxIdx].size ? i : maxIdx),
      0
    );
    segments[idx].size -= 1;
    sum -= 1;
  }

  while (sum < totalSize) {
    segments[segments.length - 1].size += 1;
    sum += 1;
  }

  return segments.filter((s) => s.size > 0);
}

function pushEvent(state, event) {
  state.events.push({
    ...event,
    timestamp: Date.now(),
  });
}

function getItemLabel(item) {
  if (item.kind === "page") {
    return `${item.processName}:P${item.pageIndex}`;
  }

  if (item.kind === "segment-page") {
    return `${item.processName}:${item.segmentName[0]}P${item.segmentPageIndex}`;
  }

  return `${item.processName}:${item.segmentName}`;
}

export function createInitialState(
  totalMemory = 64,
  strategy = "paging",
  pageSize = DEFAULT_PAGE_SIZE
) {
  resetColor();

  return {
    totalMemory,
    pageSize,
    strategy,

    // Physical RAM
    blocks: isPaged(strategy)
      ? createFrames(totalMemory, pageSize)
      : [makeFreeBlock(0, totalMemory)],

    // Virtual memory items.
    // location = "ssd" nghĩa là đang nằm ở external storage/page file.
    // location = "ram" nghĩa là đã được nạp vào RAM.
    virtualItems: [],

    processes: [],
    fifoQueue: [],
    pageFaults: 0,
    events: [],
  };
}

function createPagingItems(processId, processName, size, color, pageSize) {
  const pagesNeeded = Math.ceil(size / pageSize);
  const items = [];

  for (let pageIndex = 0; pageIndex < pagesNeeded; pageIndex++) {
    const remaining = size - pageIndex * pageSize;

    items.push({
      id: uid(),
      kind: "page",
      processId,
      processName,
      color,

      pageIndex,
      size: pageSize,
      usedSize: Math.min(pageSize, remaining),

      virtualStart: pageIndex * pageSize,
      location: "ssd",

      frameId: null,
      frameIndex: null,
      ramStart: null,
    });
  }

  return items;
}

function createSegmentationItems(processId, processName, size, color) {
  let cursor = 0;

  return splitIntoSegments(size).map((seg, segmentIndex) => {
    const item = {
      id: uid(),
      kind: "segment",
      processId,
      processName,
      color,

      segmentName: seg.name,
      segmentIndex,

      size: seg.size,
      usedSize: seg.size,

      virtualStart: cursor,
      location: "ssd",

      ramStart: null,
    };

    cursor += seg.size;
    return item;
  });
}

function createSegmentedPagingItems(
  processId,
  processName,
  size,
  color,
  pageSize
) {
  const segments = splitIntoSegments(size);
  const items = [];
  let virtualCursor = 0;

  segments.forEach((seg, segmentIndex) => {
    const pagesNeeded = Math.ceil(seg.size / pageSize);

    for (
      let segmentPageIndex = 0;
      segmentPageIndex < pagesNeeded;
      segmentPageIndex++
    ) {
      const remaining = seg.size - segmentPageIndex * pageSize;

      items.push({
        id: uid(),
        kind: "segment-page",
        processId,
        processName,
        color,

        segmentName: seg.name,
        segmentIndex,
        segmentPageIndex,

        size: pageSize,
        usedSize: Math.min(pageSize, remaining),

        virtualStart: virtualCursor + segmentPageIndex * pageSize,
        location: "ssd",

        frameId: null,
        frameIndex: null,
        ramStart: null,
      });
    }

    virtualCursor += seg.size;
  });

  return items;
}

export function allocate(state, processName, size) {
  if (!Number.isFinite(size) || size <= 0) return state;

  const processId = uid();
  const color = nextColor();

  let items = [];

  if (state.strategy === "paging") {
    items = createPagingItems(
      processId,
      processName,
      size,
      color,
      state.pageSize
    );
  }

  if (state.strategy === "segmentation") {
    items = createSegmentationItems(processId, processName, size, color);
  }

  if (state.strategy === "segmented-paging") {
    items = createSegmentedPagingItems(
      processId,
      processName,
      size,
      color,
      state.pageSize
    );
  }

  const newProcess = {
    id: processId,
    name: processName,
    size,
    color,
    itemIds: items.map((item) => item.id),
  };

  return {
    ...state,
    processes: [...state.processes, newProcess],
    virtualItems: [...state.virtualItems, ...items],
    events: [
      ...state.events,
      {
        type: "allocate",
        processId,
        processName,
        size,
        strategy: state.strategy,
        detail: `Tạo virtual address space cho ${processName}. Ban đầu các page/segment nằm trong SSD/Page File.`,
        timestamp: Date.now(),
      },
    ],
  };
}

function accessPagedItem(state, itemId) {
  const next = {
    ...state,
    blocks: state.blocks.map((b) => ({ ...b })),
    virtualItems: state.virtualItems.map((i) => ({ ...i })),
    fifoQueue: [...state.fifoQueue],
    events: [...state.events],
  };

  const itemIndex = next.virtualItems.findIndex((item) => item.id === itemId);
  if (itemIndex === -1) return state;

  const item = next.virtualItems[itemIndex];

  if (item.location === "ram") {
    pushEvent(next, {
      type: "hit",
      processId: item.processId,
      processName: item.processName,
      detail: `${getItemLabel(item)} đã nằm trong RAM, không có page fault.`,
    });

    return next;
  }

  next.pageFaults += 1;

  pushEvent(next, {
    type: "page-fault",
    processId: item.processId,
    processName: item.processName,
    detail: `Page fault: ${getItemLabel(item)} đang ở SSD/Page File, cần nạp vào RAM.`,
  });

  let frameIndex = next.blocks.findIndex((block) => !block.processId);

  if (frameIndex === -1) {
    const victimItemId = next.fifoQueue.find((id) => {
      const victim = next.virtualItems.find((x) => x.id === id);
      return victim && victim.location === "ram";
    });

    if (!victimItemId) {
      pushEvent(next, {
        type: "fail",
        processId: item.processId,
        processName: item.processName,
        detail: "Không có frame trống và không tìm được page để swap out.",
      });

      return next;
    }

    const victimIndex = next.virtualItems.findIndex(
      (x) => x.id === victimItemId
    );
    const victim = next.virtualItems[victimIndex];

    frameIndex = next.blocks.findIndex((block) => block.id === victim.frameId);

    next.blocks[frameIndex] = resetBlock(next.blocks[frameIndex]);

    next.virtualItems[victimIndex] = {
      ...victim,
      location: "ssd",
      frameId: null,
      frameIndex: null,
      ramStart: null,
    };

    next.fifoQueue = next.fifoQueue.filter((id) => id !== victimItemId);

    pushEvent(next, {
      type: "swap-out",
      processId: victim.processId,
      processName: victim.processName,
      detail: `Swap out ${getItemLabel(victim)} từ RAM về SSD/Page File.`,
    });
  }

  const frame = next.blocks[frameIndex];

  next.blocks[frameIndex] = {
    ...frame,
    processId: item.processId,
    processName: item.processName,
    itemId: item.id,
    color: item.color,
  };

  next.virtualItems[itemIndex] = {
    ...item,
    location: "ram",
    frameId: frame.id,
    frameIndex: frame.frameIndex,
    ramStart: frame.start,
  };

  next.fifoQueue.push(item.id);

  pushEvent(next, {
    type: "swap-in",
    processId: item.processId,
    processName: item.processName,
    detail: `Swap in ${getItemLabel(item)} từ SSD/Page File vào Frame ${frame.frameIndex}.`,
  });

  return next;
}

function accessSegmentItem(state, itemId) {
  const next = {
    ...state,
    blocks: state.blocks.map((b) => ({ ...b })),
    virtualItems: state.virtualItems.map((i) => ({ ...i })),
    fifoQueue: [...state.fifoQueue],
    events: [...state.events],
  };

  const itemIndex = next.virtualItems.findIndex((item) => item.id === itemId);
  if (itemIndex === -1) return state;

  const item = next.virtualItems[itemIndex];

  if (item.location === "ram") {
    pushEvent(next, {
      type: "hit",
      processId: item.processId,
      processName: item.processName,
      detail: `${getItemLabel(item)} đã nằm trong RAM.`,
    });

    return next;
  }

  next.pageFaults += 1;

  pushEvent(next, {
    type: "page-fault",
    processId: item.processId,
    processName: item.processName,
    detail: `Segment fault: ${getItemLabel(item)} đang ở SSD/Page File, cần nạp vào RAM.`,
  });

  let blockIndex = next.blocks.findIndex(
    (block) => !block.processId && block.size >= item.size
  );

  while (blockIndex === -1) {
    const victimItemId = next.fifoQueue.find((id) => {
      const victim = next.virtualItems.find((x) => x.id === id);
      return victim && victim.location === "ram";
    });

    if (!victimItemId) break;

    const victimIndex = next.virtualItems.findIndex(
      (x) => x.id === victimItemId
    );
    const victim = next.virtualItems[victimIndex];

    const victimBlockIndex = next.blocks.findIndex(
      (b) => b.itemId === victim.id
    );

    if (victimBlockIndex !== -1) {
      next.blocks[victimBlockIndex] = resetBlock(next.blocks[victimBlockIndex]);
      next.blocks = mergeAdjacentFree(next.blocks);
    }

    next.virtualItems[victimIndex] = {
      ...victim,
      location: "ssd",
      ramStart: null,
    };

    next.fifoQueue = next.fifoQueue.filter((id) => id !== victimItemId);

    pushEvent(next, {
      type: "swap-out",
      processId: victim.processId,
      processName: victim.processName,
      detail: `Swap out ${getItemLabel(victim)} từ RAM về SSD/Page File.`,
    });

    blockIndex = next.blocks.findIndex(
      (block) => !block.processId && block.size >= item.size
    );
  }

  if (blockIndex === -1) {
    pushEvent(next, {
      type: "fail",
      processId: item.processId,
      processName: item.processName,
      detail: `Không có block liên tục đủ ${item.size} KB để nạp ${getItemLabel(item)}.`,
    });

    return next;
  }

  const block = next.blocks[blockIndex];

  const allocated = {
    ...block,
    id: uid(),
    size: item.size,
    processId: item.processId,
    processName: item.processName,
    itemId: item.id,
    color: item.color,
  };

  const replacement = [allocated];

  if (block.size > item.size) {
    replacement.push(
      makeFreeBlock(block.start + item.size, block.size - item.size)
    );
  }

  next.blocks.splice(blockIndex, 1, ...replacement);

  next.virtualItems[itemIndex] = {
    ...item,
    location: "ram",
    ramStart: allocated.start,
  };

  next.fifoQueue.push(item.id);

  pushEvent(next, {
    type: "swap-in",
    processId: item.processId,
    processName: item.processName,
    detail: `Swap in ${getItemLabel(item)} từ SSD/Page File vào RAM tại ${allocated.start} KB.`,
  });

  return next;
}

export function accessItem(state, itemId) {
  if (isPaged(state.strategy)) {
    return accessPagedItem(state, itemId);
  }

  return accessSegmentItem(state, itemId);
}

export function accessProcess(state, processId) {
  const process = state.processes.find((p) => p.id === processId);
  if (!process) return state;

  const firstSsdItem = state.virtualItems.find(
    (item) => item.processId === processId && item.location === "ssd"
  );

  const firstItem = state.virtualItems.find(
    (item) => item.processId === processId
  );

  const target = firstSsdItem || firstItem;
  if (!target) return state;

  return accessItem(state, target.id);
}

export function freeProcess(state, processId) {
  const process = state.processes.find((p) => p.id === processId);
  if (!process) return state;

  let newBlocks = state.blocks.map((block) =>
    block.processId === processId ? resetBlock(block) : block
  );

  if (!isPaged(state.strategy)) {
    newBlocks = mergeAdjacentFree(newBlocks);
  }

  return {
    ...state,
    blocks: newBlocks.sort((a, b) => a.start - b.start),
    processes: state.processes.filter((p) => p.id !== processId),
    virtualItems: state.virtualItems.filter(
      (item) => item.processId !== processId
    ),
    fifoQueue: state.fifoQueue.filter((itemId) => {
      const item = state.virtualItems.find((x) => x.id === itemId);
      return item && item.processId !== processId;
    }),
    events: [
      ...state.events,
      {
        type: "free",
        processId,
        processName: process.name,
        size: process.size,
        strategy: state.strategy,
        detail: `Giải phóng ${process.name} khỏi virtual memory, RAM và SSD/Page File.`,
        timestamp: Date.now(),
      },
    ],
  };
}

export function getMetrics(state) {
  const ramUsed = state.blocks
    .filter((block) => block.processId)
    .reduce((sum, block) => sum + block.size, 0);

  const logicalUsed = state.processes.reduce((sum, p) => sum + p.size, 0);

  const ssdUsed = state.virtualItems
    .filter((item) => item.location === "ssd")
    .reduce((sum, item) => sum + item.usedSize, 0);

  const freeRam = state.totalMemory - ramUsed;

  const freeBlocks = getFreeBlocks(state.blocks);

  const largestFreeBlock = freeBlocks.reduce(
    (max, block) => Math.max(max, block.size),
    0
  );

  const externalFragmentation =
    state.strategy === "segmentation" && freeRam > 0
      ? Math.round(((freeRam - largestFreeBlock) / freeRam) * 100)
      : 0;

  const ramItems = state.virtualItems.filter((item) => item.location === "ram");

  const internalWaste = ramItems.reduce((sum, item) => {
    if (state.strategy === "segmentation") return sum;
    return sum + Math.max(0, item.size - item.usedSize);
  }, 0);

  const internalFragmentation =
    ramUsed > 0 ? Math.round((internalWaste / ramUsed) * 100) : 0;

  return {
    totalMemory: state.totalMemory,

    ramUsed,
    usedMemory: ramUsed,

    logicalUsed,
    freeMemory: freeRam,
    ssdUsed,

    externalFragmentation,
    internalFragmentation,
    internalWaste,

    InSSD: externalFragmentation,

    pageFaults: state.pageFaults,
    numPageFaults: state.pageFaults,

    numProcesses: state.processes.length,
    numFreeBlocks: freeBlocks.length,
    largestFreeBlock,

    numVirtualItems: state.virtualItems.length,
    numSsdItems: state.virtualItems.filter((item) => item.location === "ssd")
      .length,
  };
}

export function runFragmentationDemo(totalMemory = 64, strategy = "paging") {
  let s = createInitialState(totalMemory, strategy);

  for (const [name, size] of [
    ["P1", 8],
    ["P2", 4],
    ["P3", 8],
    ["P4", 4],
    ["P5", 8],
  ]) {
    s = allocate(s, name, size);
  }

  for (let i = 0; i < 8; i++) {
    const p = s.processes[i % s.processes.length];
    if (p) s = accessProcess(s, p.id);
  }

  [s.processes[0], s.processes[2], s.processes[4]].forEach((p) => {
    if (p) s = freeProcess(s, p.id);
  });

  return s;
}

export function runRandomWorkload(totalMemory = 64, strategy = "paging") {
  let s = createInitialState(totalMemory, strategy);

  for (const [name, size] of [
    ["Chrome", 14],
    ["VSCode", 10],
    ["Node", 8],
    ["Figma", 12],
    ["Slack", 8],
  ]) {
    s = allocate(s, name, size);
  }

  for (let i = 0; i < 14; i++) {
    const p = s.processes[i % s.processes.length];
    if (p) s = accessProcess(s, p.id);
  }

  return s;
}