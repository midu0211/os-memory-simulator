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
export const DEFAULT_REPLACEMENT_POLICY = "fifo";

export const VM_STRATEGIES = [
  { value: "paging", label: "Paging" },
  { value: "segmentation", label: "Segmentation" },
  { value: "segmented-paging", label: "Segmentation + Paging" },
];

export const REPLACEMENT_POLICIES = [
  { value: "fifo", label: "FIFO" },
  { value: "opt", label: "OPT" },
  { value: "lru", label: "LRU" },
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

function normalizeReplacementPolicy(policy) {
  return REPLACEMENT_POLICIES.some((p) => p.value === policy)
    ? policy
    : DEFAULT_REPLACEMENT_POLICY;
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

function cloneForAccess(state) {
  return {
    ...state,
    blocks: state.blocks.map((b) => ({ ...b })),
    virtualItems: state.virtualItems.map((i) => ({ ...i })),
    fifoQueue: [...state.fifoQueue],
    events: [...state.events],
    replacementPolicy: normalizeReplacementPolicy(state.replacementPolicy),
    accessClock: state.accessClock ?? 0,
  };
}

function getRamItems(state) {
  return state.virtualItems.filter((item) => item.location === "ram");
}

function getOldestLoadedItem(ramItems) {
  return [...ramItems].sort(
    (a, b) => (a.loadedAt ?? 0) - (b.loadedAt ?? 0)
  )[0];
}

function selectFifoVictim(state, ramItems) {
  const victimId = state.fifoQueue.find((id) =>
    ramItems.some((item) => item.id === id)
  );

  return victimId ?? getOldestLoadedItem(ramItems)?.id ?? null;
}

function selectLruVictim(ramItems) {
  return (
    [...ramItems].sort((a, b) => {
      const aTime = a.lastAccessedAt ?? a.loadedAt ?? 0;
      const bTime = b.lastAccessedAt ?? b.loadedAt ?? 0;

      if (aTime !== bTime) return aTime - bTime;
      return (a.loadedAt ?? 0) - (b.loadedAt ?? 0);
    })[0]?.id ?? null
  );
}

function selectOptVictim(ramItems, futureItemIds) {
  let victim = null;
  let farthestNextUse = -1;

  for (const item of ramItems) {
    const nextUse = futureItemIds.indexOf(item.id);

    if (nextUse === -1) {
      return item.id;
    }

    if (nextUse > farthestNextUse) {
      farthestNextUse = nextUse;
      victim = item;
    }
  }

  return victim?.id ?? null;
}

function selectVictimItemId(state, futureItemIds = []) {
  const ramItems = getRamItems(state);
  if (ramItems.length === 0) return null;

  const policy = normalizeReplacementPolicy(state.replacementPolicy);

  if (policy === "opt") {
    return selectOptVictim(ramItems, futureItemIds);
  }

  if (policy === "lru") {
    return selectLruVictim(ramItems);
  }

  return selectFifoVictim(state, ramItems);
}

function createBaseItem(processId, processName, color) {
  return {
    id: uid(),
    processId,
    processName,
    color,
    location: "ssd",
    loadedAt: null,
    lastAccessedAt: null,
    frameId: null,
    frameIndex: null,
    ramStart: null,
  };
}

export function createInitialState(
  totalMemory = 64,
  strategy = "paging",
  pageSize = DEFAULT_PAGE_SIZE,
  replacementPolicy = DEFAULT_REPLACEMENT_POLICY
) {
  resetColor();

  return {
    totalMemory,
    pageSize,
    strategy,
    replacementPolicy: normalizeReplacementPolicy(replacementPolicy),

    blocks: isPaged(strategy)
      ? createFrames(totalMemory, pageSize)
      : [makeFreeBlock(0, totalMemory)],

    virtualItems: [],
    processes: [],
    fifoQueue: [],
    pageFaults: 0,
    accessClock: 0,
    events: [],
  };
}

function createPagingItems(processId, processName, size, color, pageSize) {
  const pagesNeeded = Math.ceil(size / pageSize);
  const items = [];

  for (let pageIndex = 0; pageIndex < pagesNeeded; pageIndex++) {
    const remaining = size - pageIndex * pageSize;

    items.push({
      ...createBaseItem(processId, processName, color),
      kind: "page",
      pageIndex,
      size: pageSize,
      usedSize: Math.min(pageSize, remaining),
      virtualStart: pageIndex * pageSize,
    });
  }

  return items;
}

function createSegmentationItems(processId, processName, size, color) {
  let cursor = 0;

  return splitIntoSegments(size).map((seg, segmentIndex) => {
    const item = {
      ...createBaseItem(processId, processName, color),
      kind: "segment",
      segmentName: seg.name,
      segmentIndex,
      size: seg.size,
      usedSize: seg.size,
      virtualStart: cursor,
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
        ...createBaseItem(processId, processName, color),
        kind: "segment-page",
        segmentName: seg.name,
        segmentIndex,
        segmentPageIndex,
        size: pageSize,
        usedSize: Math.min(pageSize, remaining),
        virtualStart: virtualCursor + segmentPageIndex * pageSize,
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
    replacementPolicy: normalizeReplacementPolicy(state.replacementPolicy),
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
        detail: `Created virtual address space for ${processName}. New pages or segments start in the SSD/Page File.`,
        timestamp: Date.now(),
      },
    ],
  };
}

function accessPagedItem(state, itemId, options = {}) {
  const next = cloneForAccess(state);
  const futureItemIds = options.futureItemIds ?? [];

  next.accessClock += 1;

  const itemIndex = next.virtualItems.findIndex((item) => item.id === itemId);
  if (itemIndex === -1) return state;

  const item = next.virtualItems[itemIndex];

  if (item.location === "ram") {
    next.virtualItems[itemIndex] = {
      ...item,
      lastAccessedAt: next.accessClock,
    };

    pushEvent(next, {
      type: "hit",
      processId: item.processId,
      processName: item.processName,
      detail: `${getItemLabel(item)} is already in RAM. Page hit, no page fault.`,
    });

    return next;
  }

  next.pageFaults += 1;

  pushEvent(next, {
    type: "page-fault",
    processId: item.processId,
    processName: item.processName,
    detail: `Page fault: ${getItemLabel(item)} is in the SSD/Page File and must be loaded into RAM.`,
  });

  let frameIndex = next.blocks.findIndex((block) => !block.processId);

  if (frameIndex === -1) {
    const victimItemId = selectVictimItemId(next, futureItemIds);

    if (!victimItemId) {
      pushEvent(next, {
        type: "fail",
        processId: item.processId,
        processName: item.processName,
        detail: "No free frame is available and no replacement victim could be selected.",
      });

      return next;
    }

    const victimIndex = next.virtualItems.findIndex(
      (x) => x.id === victimItemId
    );
    const victim = next.virtualItems[victimIndex];

    frameIndex = next.blocks.findIndex((block) => block.itemId === victim.id);

    if (frameIndex === -1) {
      pushEvent(next, {
        type: "fail",
        processId: item.processId,
        processName: item.processName,
        detail: `Could not find the RAM frame that contains ${getItemLabel(victim)}.`,
      });

      return next;
    }

    next.blocks[frameIndex] = resetBlock(next.blocks[frameIndex]);
    next.virtualItems[victimIndex] = {
      ...victim,
      location: "ssd",
      frameId: null,
      frameIndex: null,
      ramStart: null,
      loadedAt: null,
      lastAccessedAt: null,
    };
    next.fifoQueue = next.fifoQueue.filter((id) => id !== victimItemId);

    pushEvent(next, {
      type: "swap-out",
      processId: victim.processId,
      processName: victim.processName,
      detail: `Swap out ${getItemLabel(victim)} from RAM to the SSD/Page File using ${next.replacementPolicy.toUpperCase()}.`,
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
    loadedAt: next.accessClock,
    lastAccessedAt: next.accessClock,
  };

  next.fifoQueue = next.fifoQueue.filter((id) => id !== item.id);
  next.fifoQueue.push(item.id);

  pushEvent(next, {
    type: "swap-in",
    processId: item.processId,
    processName: item.processName,
    detail: `Swap in ${getItemLabel(item)} from the SSD/Page File to Frame ${frame.frameIndex}.`,
  });

  return next;
}

function accessSegmentItem(state, itemId, options = {}) {
  const next = cloneForAccess(state);
  const futureItemIds = options.futureItemIds ?? [];

  next.accessClock += 1;

  const itemIndex = next.virtualItems.findIndex((item) => item.id === itemId);
  if (itemIndex === -1) return state;

  const item = next.virtualItems[itemIndex];

  if (item.location === "ram") {
    next.virtualItems[itemIndex] = {
      ...item,
      lastAccessedAt: next.accessClock,
    };

    pushEvent(next, {
      type: "hit",
      processId: item.processId,
      processName: item.processName,
      detail: `${getItemLabel(item)} is already in RAM.`,
    });

    return next;
  }

  next.pageFaults += 1;

  pushEvent(next, {
    type: "page-fault",
    processId: item.processId,
    processName: item.processName,
    detail: `Segment fault: ${getItemLabel(item)} is in the SSD/Page File and must be loaded into RAM.`,
  });

  let blockIndex = next.blocks.findIndex(
    (block) => !block.processId && block.size >= item.size
  );

  while (blockIndex === -1) {
    const victimItemId = selectVictimItemId(next, futureItemIds);

    if (!victimItemId) break;

    const victimIndex = next.virtualItems.findIndex(
      (x) => x.id === victimItemId
    );
    const victim = next.virtualItems[victimIndex];
    const victimBlockIndex = next.blocks.findIndex(
      (block) => block.itemId === victim.id
    );

    if (victimBlockIndex === -1) {
      next.fifoQueue = next.fifoQueue.filter((id) => id !== victimItemId);
      next.virtualItems[victimIndex] = {
        ...victim,
        location: "ssd",
        ramStart: null,
        loadedAt: null,
        lastAccessedAt: null,
      };
      continue;
    }

    next.blocks[victimBlockIndex] = resetBlock(next.blocks[victimBlockIndex]);
    next.blocks = mergeAdjacentFree(next.blocks);
    next.virtualItems[victimIndex] = {
      ...victim,
      location: "ssd",
      ramStart: null,
      loadedAt: null,
      lastAccessedAt: null,
    };
    next.fifoQueue = next.fifoQueue.filter((id) => id !== victimItemId);

    pushEvent(next, {
      type: "swap-out",
      processId: victim.processId,
      processName: victim.processName,
      detail: `Swap out ${getItemLabel(victim)} from RAM to the SSD/Page File using ${next.replacementPolicy.toUpperCase()}.`,
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
      detail: `No contiguous RAM block is large enough to load ${getItemLabel(item)} (${item.size} KB).`,
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
    loadedAt: next.accessClock,
    lastAccessedAt: next.accessClock,
  };

  next.fifoQueue = next.fifoQueue.filter((id) => id !== item.id);
  next.fifoQueue.push(item.id);

  pushEvent(next, {
    type: "swap-in",
    processId: item.processId,
    processName: item.processName,
    detail: `Swap in ${getItemLabel(item)} from the SSD/Page File to RAM at ${allocated.start} KB.`,
  });

  return next;
}

export function accessItem(state, itemId, options = {}) {
  if (isPaged(state.strategy)) {
    return accessPagedItem(state, itemId, options);
  }

  return accessSegmentItem(state, itemId, options);
}

export function runReferenceString(state, itemIds) {
  let next = state;

  itemIds.forEach((itemId, index) => {
    next = accessItem(next, itemId, {
      futureItemIds: itemIds.slice(index + 1),
    });
  });

  return next;
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

  const remainingItems = state.virtualItems.filter(
    (item) => item.processId !== processId
  );
  const remainingItemIds = new Set(remainingItems.map((item) => item.id));

  return {
    ...state,
    blocks: newBlocks.sort((a, b) => a.start - b.start),
    processes: state.processes.filter((p) => p.id !== processId),
    virtualItems: remainingItems,
    fifoQueue: state.fifoQueue.filter((itemId) =>
      remainingItemIds.has(itemId)
    ),
    events: [
      ...state.events,
      {
        type: "free",
        processId,
        processName: process.name,
        size: process.size,
        strategy: state.strategy,
        detail: `Released ${process.name} from virtual memory, RAM, and the SSD/Page File.`,
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

export function runFragmentationDemo(
  totalMemory = 64,
  strategy = "paging",
  replacementPolicy = DEFAULT_REPLACEMENT_POLICY
) {
  let s = createInitialState(
    totalMemory,
    strategy,
    DEFAULT_PAGE_SIZE,
    replacementPolicy
  );

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

export function runRandomWorkload(
  totalMemory = 64,
  strategy = "paging",
  replacementPolicy = DEFAULT_REPLACEMENT_POLICY
) {
  let s = createInitialState(
    totalMemory,
    strategy,
    DEFAULT_PAGE_SIZE,
    replacementPolicy
  );

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
