// simulators/paging/logic.js
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

export function createInitialState(totalMemory = 64, pageSize = 4, pagingMode = "standard") {
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
    pagingMode, // "standard" or "inverted"
    tlb: [], // Array of { processId, processName, pageNumber, frameNumber, lastAccess, addedAt }
    tlbSize: 4,
    tlbPolicy: "LRU", // "LRU" or "FIFO"
    tlbHits: 0,
    tlbMisses: 0,
    iptSearchMethod: "linear", // "linear" or "hash"
  };
}

export function allocate(state, processName, size) {
  const neededPages = Math.ceil(size / state.pageSize);
  const freeFrames = state.frames.filter((f) => f.processId === null);

  // Not enough free frames -> Fail
  if (freeFrames.length < neededPages) {
    const event = {
      type: "fail",
      processName,
      size,
      reason: `Needed ${neededPages} frames, but only ${freeFrames.length} free frames left.`,
      timestamp: Date.now(),
    };
    return { ...state, events: [...state.events, event] };
  }

  const processId = uid();
  const color = nextColor();
  const allocatedFrames = [];
  const newFrames = [...state.frames];
  let pagesAllocated = 0;

  // Allocate frames non-contiguously (characteristic of Paging)
  for (let i = 0; i < newFrames.length; i++) {
    if (newFrames[i].processId === null && pagesAllocated < neededPages) {
      newFrames[i] = {
        ...newFrames[i],
        processId,
        processName,
        pageNumber: pagesAllocated,
        color,
      };
      allocatedFrames.push(i); // Store frame number
      pagesAllocated++;
    }
  }

  // Calculate Internal Fragmentation
  const allocatedMemory = neededPages * state.pageSize;
  const internalFrag = allocatedMemory - size;

  const newProcess = {
    id: processId,
    name: processName,
    size,
    allocatedMemory,
    internalFrag,
    pageTable: allocatedFrames, // Index is page, value is frame
    color,
  };

  const event = {
    type: "allocate",
    processId,
    processName,
    size,
    details: `Allocated ${neededPages} pages (Internal waste: ${internalFrag} KB)`,
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

  // Remove entries of freed process from TLB
  const newTlb = (state.tlb || []).filter((e) => e.processId !== processId);

  return {
    ...state,
    frames: newFrames,
    processes: state.processes.filter((p) => p.id !== processId),
    events: [...state.events, event],
    tlb: newTlb,
  };
}

export function getMetrics(state) {
  const freeFrames = state.frames.filter((f) => f.processId === null).length;
  const freeMemory = freeFrames * state.pageSize;
  const usedMemory = state.totalMemory - freeMemory;
  
  const totalInternalFrag = (state.processes || []).reduce((sum, p) => sum + p.internalFrag, 0);
  const fragmentationPercent = usedMemory === 0 
    ? 0 
    : Math.round((totalInternalFrag / usedMemory) * 100);

  const totalPages = (state.processes || []).reduce((sum, p) => sum + p.pageTable.length, 0);
  
  const totalTlbLookups = (state.tlbHits || 0) + (state.tlbMisses || 0);
  const tlbHitRate = totalTlbLookups === 0 
    ? 0 
    : Math.round(((state.tlbHits || 0) / totalTlbLookups) * 100);

  return {
    totalMemory: state.totalMemory,
    usedMemory,
    freeMemory,
    fragmentationPercent, // Represents Internal Fragmentation
    totalInternalFrag,
    totalPages,
    numPageFaults: 0,
    tlbHits: state.tlbHits || 0,
    tlbMisses: state.tlbMisses || 0,
    tlbHitRate,
  };
}

export function runDemoWorkload(totalMemory, pageSize) {
  let s = createInitialState(totalMemory, pageSize);
  s = allocate(s, "Word", 13);    // E.g., PageSize 4 => 4 pages (16KB) => Internal frag 3KB
  s = allocate(s, "Excel", 9);    // 3 pages (12KB) => Internal frag 3KB
  s = allocate(s, "Spotify", 5);  // 2 pages (8KB) => Internal frag 3KB
  s = freeProcess(s, s.processes[1]?.id); // Free Excel to create non-contiguous free spaces
  s = allocate(s, "Chrome", 10);  // Will fill the non-contiguous free spaces
  return s;
}

// Translate logical address (Virtual Address) to physical address using TLB and Page Table
export function translateAddress(state, processId, virtualAddress) {
  const process = state.processes.find((p) => p.id === processId);
  if (!process) {
    return { error: "Process not found", steps: ["Error: Process not found!"] };
  }

  const addrVal = Number(virtualAddress);
  if (isNaN(addrVal) || addrVal < 0 || addrVal >= process.size) {
    return {
      error: `Segmentation Fault: Logical address ${virtualAddress} KB exceeds process size (${process.size} KB)`,
      steps: [
        `Checking logical address: ${virtualAddress} KB`,
        `ERROR: Segmentation Fault! Address exceeds process limits [0 - ${process.size - 1} KB].`
      ]
    };
  }

  const pageNumber = Math.floor(addrVal / state.pageSize);
  const offset = addrVal % state.pageSize;

  const steps = [];
  steps.push(`Starting translation: Logical Address = ${addrVal} KB`);
  steps.push(`Analysis: Page Size = ${state.pageSize} KB`);
  steps.push(`-> Page Number p = floor(${addrVal} / ${state.pageSize}) = ${pageNumber}`);
  steps.push(`-> Offset d = ${addrVal} % ${state.pageSize} = ${offset} KB`);

  // 1. Check TLB
  steps.push(`Step 1: Checking TLB (Translation Lookaside Buffer)...`);
  const tlbEntries = state.tlb || [];
  const tlbIdx = tlbEntries.findIndex(
    (e) => e.processId === processId && e.pageNumber === pageNumber
  );

  let frameNumber = -1;
  let isTlbHit = false;
  let newTlb = [...tlbEntries];

  if (tlbIdx !== -1) {
    // TLB HIT
    isTlbHit = true;
    frameNumber = tlbEntries[tlbIdx].frameNumber;
    steps.push(`TLB HIT! Found entry: Page P${pageNumber} -> Frame F${frameNumber}`);
    
    // Update Last Access for LRU
    if (state.tlbPolicy === "LRU") {
      newTlb[tlbIdx] = {
        ...newTlb[tlbIdx],
        lastAccess: Date.now()
      };
      steps.push(`Updated LRU access order for this entry.`);
    }
  } else {
    // TLB MISS
    steps.push(`TLB MISS! Page P${pageNumber} not found in TLB.`);
    steps.push(`Step 2: Checking Page Table...`);

    // 2. Query page table based on mode
    if (state.pagingMode === "standard") {
      steps.push(`[Mode: Standard Page Table]`);
      steps.push(`Accessing page table for process "${process.name}"...`);
      
      frameNumber = process.pageTable[pageNumber];
      steps.push(`Lookup: Page P${pageNumber} -> Frame F${frameNumber}`);
    } else {
      // Inverted Page Table
      steps.push(`[Mode: Inverted Page Table (IPT)]`);
      steps.push(`Searching global Inverted Page Table (IPT)...`);

      if (state.iptSearchMethod === "linear") {
        steps.push(`Method: Linear Scan through all frames...`);
        let found = false;
        const checkedFrames = [];
        
        for (let i = 0; i < state.frames.length; i++) {
          checkedFrames.push(i);
          const f = state.frames[i];
          if (f.processId === processId && f.pageNumber === pageNumber) {
            frameNumber = i;
            found = true;
            break;
          }
        }

        if (found) {
          steps.push(`Scanned frames: [${checkedFrames.slice(0, 8).join(", ") + (checkedFrames.length > 8 ? ", ..." : "")}]`);
          steps.push(`-> Found match at Frame F${frameNumber} (contains Page P${pageNumber} of ${process.name})`);
        } else {
          steps.push(`Fatal Error: Page not found in IPT.`);
        }
      } else {
        // Hash Table Search
        steps.push(`Method: Hash Table lookup...`);
        const hash = (process.name.charCodeAt(0) * 7 + pageNumber) % state.frames.length;
        steps.push(`Hash Function: hash(Process, Page) = (${process.name}, ${pageNumber}) mod ${state.frames.length} = Hash Index ${hash}`);
        
        // Check hash index
        const candidate = state.frames[hash];
        if (candidate && candidate.processId === processId && candidate.pageNumber === pageNumber) {
          frameNumber = hash;
          steps.push(`Direct match found at Frame F${hash}! (No hash collision)`);
        } else {
          steps.push(`Collision or miss at hash index ${hash}. Probing next frames (linear probing)...`);
          let found = false;
          const checked = [];
          for (let i = 0; i < state.frames.length; i++) {
            const idx = (hash + i) % state.frames.length;
            checked.push(idx);
            const f = state.frames[idx];
            if (f && f.processId === processId && f.pageNumber === pageNumber) {
              frameNumber = idx;
              found = true;
              break;
            }
          }
          if (found) {
            steps.push(`Probed indices: [${checked.join(", ")}]`);
            steps.push(`-> Found match at Frame F${frameNumber}`);
          } else {
            steps.push(`Fatal Error: Page not found after linear probing.`);
          }
        }
      }
    }

    // 3. Update TLB after Miss
    steps.push(`Step 3: Updating TLB with new translation...`);
    const newEntry = {
      processId,
      processName: process.name,
      pageNumber,
      frameNumber,
      lastAccess: Date.now(),
      addedAt: Date.now()
    };

    if (newTlb.length < state.tlbSize) {
      newTlb.push(newEntry);
      steps.push(`Added entry to vacant TLB slot. Current TLB entries: ${newTlb.length}/${state.tlbSize}`);
    } else {
      // Eviction
      let evictIdx = 0;
      if (state.tlbPolicy === "LRU") {
        // Find entry with minimum lastAccess
        let minAccess = Infinity;
        for (let i = 0; i < newTlb.length; i++) {
          if (newTlb[i].lastAccess < minAccess) {
            minAccess = newTlb[i].lastAccess;
            evictIdx = i;
          }
        }
        steps.push(`TLB full! Evicting oldest entry using LRU: Page P${newTlb[evictIdx].pageNumber} (Frame F${newTlb[evictIdx].frameNumber}) of process ${newTlb[evictIdx].processName}`);
      } else {
        // FIFO: Find entry with oldest addedAt
        let minAdded = Infinity;
        for (let i = 0; i < newTlb.length; i++) {
          if (newTlb[i].addedAt < minAdded) {
            minAdded = newTlb[i].addedAt;
            evictIdx = i;
          }
        }
        steps.push(`TLB full! Evicting oldest entry using FIFO: Page P${newTlb[evictIdx].pageNumber} (Frame F${newTlb[evictIdx].frameNumber}) of process ${newTlb[evictIdx].processName}`);
      }
      newTlb[evictIdx] = newEntry;
      steps.push(`Inserted new entry into TLB.`);
    }
  }

  // 4. Calculate physical address
  const physicalAddress = frameNumber * state.pageSize + offset;
  steps.push(`Step 4: Calculating Physical Address...`);
  steps.push(`Physical Address = Frame F${frameNumber} * Page Size + d`);
  steps.push(`= ${frameNumber} * ${state.pageSize} KB + ${offset} KB = ${physicalAddress} KB`);

  return {
    frameNumber,
    pageNumber,
    offset,
    physicalAddress,
    steps,
    isTlbHit,
    stateUpdates: {
      tlb: newTlb,
      tlbHits: state.tlbHits + (isTlbHit ? 1 : 0),
      tlbMisses: state.tlbMisses + (isTlbHit ? 0 : 1)
    }
  };
}