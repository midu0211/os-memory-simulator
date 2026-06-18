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

function normalizeVmStrategy(strategy) {
  return VM_STRATEGIES.some((s) => s.value === strategy) ? strategy : "paging";
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
  return makeFreeFrame(block.start, block.size, block.frameIndex);
}

function pushEvent(state, event) {
  state.events.push({
    ...event,
    timestamp: Date.now(),
  });
}

function getItemLabel(item) {
  return `${item.processName}:P${item.pageIndex}`;
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
  const vmStrategy = normalizeVmStrategy(strategy);

  return {
    totalMemory,
    pageSize,
    strategy: vmStrategy,
    replacementPolicy: normalizeReplacementPolicy(replacementPolicy),

    blocks: createFrames(totalMemory, pageSize),

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

export function allocate(state, processName, size) {
  if (!Number.isFinite(size) || size <= 0) return state;

  const processId = uid();
  const color = nextColor();
  const strategy = normalizeVmStrategy(state.strategy);
  const items = createPagingItems(
    processId,
    processName,
    size,
    color,
    state.pageSize
  );

  const newProcess = {
    id: processId,
    name: processName,
    size,
    color,
    itemIds: items.map((item) => item.id),
  };

  return {
    ...state,
    strategy,
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
        strategy,
        detail: `Created pages for ${processName}. New pages start in the Swap space / Page file.`,
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
    detail: `Page fault: ${getItemLabel(item)} is in the Swap space / Page file and must be loaded into RAM.`,
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
      detail: `Swap out ${getItemLabel(victim)} from RAM to the Swap space / Page file using ${next.replacementPolicy.toUpperCase()}.`,
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
    detail: `Swap in ${getItemLabel(item)} from the Swap space / Page file to Frame ${frame.frameIndex}.`,
  });

  return next;
}

export function accessItem(state, itemId, options = {}) {
  return accessPagedItem(state, itemId, options);
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

  const remainingItems = state.virtualItems.filter(
    (item) => item.processId !== processId
  );
  const remainingItemIds = new Set(remainingItems.map((item) => item.id));

  return {
    ...state,
    strategy: normalizeVmStrategy(state.strategy),
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
        strategy: normalizeVmStrategy(state.strategy),
        detail: `Released ${process.name} from virtual memory, RAM, and the Swap space / Page file.`,
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

  const externalFragmentation = 0;

  const ramItems = state.virtualItems.filter((item) => item.location === "ram");

  const internalWaste = ramItems.reduce((sum, item) => {
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
