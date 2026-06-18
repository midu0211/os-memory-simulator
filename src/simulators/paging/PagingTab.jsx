// simulators/paging/PagingTab.jsx
// src/simulators/paging/PagingTab.jsx
import { useState, useCallback, useEffect } from "react";
import {
  createInitialState,
  allocate,
  freeProcess,
  getMetrics,
  runDemoWorkload,
  translateAddress,
} from "./logic.js";

const PROCESS_NAMES = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];

export default function PagingTab() {
  const [state, setState] = useState(() => createInitialState(64, 4, "standard"));
  const [processName, setProcessName] = useState("P1");
  const [processSize, setProcessSize] = useState(10);

  // Address Translation State
  const [transProcId, setTransProcId] = useState("");
  const [transAddress, setTransAddress] = useState(0);
  const [transResult, setTransResult] = useState(null);
  const [highlightedFrame, setHighlightedFrame] = useState(null);
  
  // Advanced Settings Toggle
  const [showSettings, setShowSettings] = useState(false);

  const metrics = getMetrics(state);

  // Select the first process automatically when any process is running
  useEffect(() => {
    if (state.processes.length > 0 && !transProcId) {
      setTransProcId(state.processes[0].id);
      setTransAddress(0);
      setTransResult(null);
      setHighlightedFrame(null);
    } else if (state.processes.length === 0) {
      setTransProcId("");
      setTransAddress(0);
      setTransResult(null);
      setHighlightedFrame(null);
    }
  }, [state.processes, transProcId]);

  // Adjust virtual address bounds when target process size changes
  const selectedTransProc = state.processes.find((p) => p.id === transProcId);
  useEffect(() => {
    if (selectedTransProc) {
      if (transAddress >= selectedTransProc.size) {
        setTransAddress(0);
      }
    }
  }, [transProcId, selectedTransProc, transAddress]);

  // ── Handlers ──────────────────────────────────────────────
  const handlePageSizeChange = useCallback((e) => {
    const newSize = Number(e.target.value);
    setState(createInitialState(64, newSize, state.pagingMode));
    setProcessName("P1");
    setTransResult(null);
    setHighlightedFrame(null);
  }, [state.pagingMode]);

  const handlePageModeChange = useCallback((mode) => {
    setState((s) => ({ ...s, pagingMode: mode }));
    setTransResult(null);
    setHighlightedFrame(null);
  }, []);

  const handleTlbSizeChange = useCallback((e) => {
    const size = Number(e.target.value);
    setState((s) => ({ ...s, tlbSize: size, tlb: [] }));
    setTransResult(null);
    setHighlightedFrame(null);
  }, []);

  const handleTlbPolicyChange = useCallback((e) => {
    const policy = e.target.value;
    setState((s) => ({ ...s, tlbPolicy: policy, tlb: [] }));
    setTransResult(null);
    setHighlightedFrame(null);
  }, []);

  const handleIptSearchMethodChange = useCallback((e) => {
    const method = e.target.value;
    setState((s) => ({ ...s, iptSearchMethod: method }));
    setTransResult(null);
    setHighlightedFrame(null);
  }, []);

  const handleClearTlb = useCallback(() => {
    setState((s) => ({ ...s, tlb: [], tlbHits: 0, tlbMisses: 0 }));
    setTransResult(null);
    setHighlightedFrame(null);
  }, []);

  const handleAllocate = useCallback(() => {
    const name = processName.trim() || "P?";
    setState((s) => allocate(s, name, processSize));
    const idx = PROCESS_NAMES.indexOf(processName);
    if (idx >= 0 && idx < PROCESS_NAMES.length - 1) {
      setProcessName(PROCESS_NAMES[idx + 1]);
    }
  }, [processName, processSize]);

  const handleFree = useCallback((pid) => {
    setState((s) => freeProcess(s, pid));
    if (transProcId === pid) {
      setTransProcId("");
      setTransResult(null);
      setHighlightedFrame(null);
    }
  }, [transProcId]);

  const handleReset = useCallback(() => {
    setState(createInitialState(64, state.pageSize, state.pagingMode));
    setProcessName("P1");
    setTransResult(null);
    setHighlightedFrame(null);
  }, [state.pageSize, state.pagingMode]);

  const handleDemo = useCallback(() => {
    const s = runDemoWorkload(64, state.pageSize);
    setState({
      ...s,
      pagingMode: state.pagingMode,
      tlbSize: state.tlbSize,
      tlbPolicy: state.tlbPolicy,
      iptSearchMethod: state.iptSearchMethod,
      tlb: [],
      tlbHits: 0,
      tlbMisses: 0,
    });
    setProcessName("P5");
    setTransResult(null);
    setHighlightedFrame(null);
  }, [state.pageSize, state.pagingMode, state.tlbSize, state.tlbPolicy, state.iptSearchMethod]);

  const handleTranslate = useCallback(() => {
    if (!transProcId) return;
    const result = translateAddress(state, transProcId, transAddress);
    if (result.error) {
      setTransResult({ error: result.error, steps: result.steps });
      setHighlightedFrame(null);
    } else {
      setTransResult(result);
      setHighlightedFrame(result.frameNumber);
      setState((s) => ({
        ...s,
        ...result.stateUpdates,
      }));
    }
  }, [state, transProcId, transAddress]);

  const handleRandomTranslate = useCallback(() => {
    if (state.processes.length === 0) return;
    const randomProc = state.processes[Math.floor(Math.random() * state.processes.length)];
    const randomAddr = Math.floor(Math.random() * randomProc.size);
    setTransProcId(randomProc.id);
    setTransAddress(randomAddr);
    
    const result = translateAddress(state, randomProc.id, randomAddr);
    if (result.error) {
      setTransResult({ error: result.error, steps: result.steps });
      setHighlightedFrame(null);
    } else {
      setTransResult(result);
      setHighlightedFrame(result.frameNumber);
      setState((s) => ({
        ...s,
        ...result.stateUpdates,
      }));
    }
  }, [state]);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
        <div>
          <h2 className="text-lg font-bold text-gray-800 font-mono">Paging Mechanism</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Non-contiguous memory allocation using Translation Lookaside Buffer (TLB) and Inverted Page Table.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Mode switch */}
          <div className="flex bg-gray-200/80 p-1 rounded-lg border border-gray-300/50">
            <button
              onClick={() => handlePageModeChange("standard")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                state.pagingMode === "standard"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Standard Paging
            </button>
            <button
              onClick={() => handlePageModeChange("inverted")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                state.pagingMode === "inverted"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Inverted Page Table (IPT)
            </button>
          </div>

          {/* Page size settings */}
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1">
            <span className="text-[10px] uppercase font-bold text-gray-400">Page Size:</span>
            <select
              value={state.pageSize}
              onChange={handlePageSizeChange}
              className="text-xs font-medium bg-transparent text-gray-700 focus:outline-none"
            >
              <option value={2}>2 KB</option>
              <option value={4}>4 KB (Default)</option>
              <option value={8}>8 KB</option>
            </select>
          </div>
        </div>
      </div>

      {/* Metric cards (3-column layout, AMAT removed) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { 
            label: "Physical Memory", 
            value: `${metrics.totalMemory} KB`, 
            sub: `${state.frames.length} Frames`
          },
          { 
            label: "Internal Fragmentation", 
            value: `${metrics.totalInternalFrag} KB`, 
            sub: `Total waste at page ends`,
            highlight: metrics.totalInternalFrag > 0
          },
          { 
            label: "TLB Hit Rate", 
            value: `${metrics.tlbHitRate}%`, 
            sub: `Hits: ${metrics.tlbHits} / Misses: ${metrics.tlbMisses}`
          },
        ].map((m, idx) => (
          <div key={idx} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-start justify-between">
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-400">{m.label}</div>
              <div className={`text-xl font-bold ${m.highlight ? "text-red-500" : "text-gray-800"}`}>
                {m.value}
              </div>
              <div className="text-[10px] text-gray-500">{m.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Physical Memory Visualization */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-bold text-gray-700">
              Physical Memory ({state.frames.length} Frames, {state.pageSize} KB/Frame)
            </p>
          </div>
          {highlightedFrame !== null && (
            <button 
              onClick={() => setHighlightedFrame(null)}
              className="text-[10px] text-red-500 hover:underline"
            >
              Clear translation highlight
            </button>
          )}
        </div>
        <div className="bg-gray-50 rounded-lg p-2.5 flex flex-wrap gap-1.5 min-h-12 border border-gray-100">
          {state.frames.map((frame, i) => {
            const isFree = !frame.processId;
            const isHighlighted = frame.id === highlightedFrame;
            return (
              <div
                key={frame.id}
                title={
                  isFree
                    ? `Frame ${i} · Free`
                    : `Frame ${i} · ${frame.processName} (Page ${frame.pageNumber})`
                }
                style={{
                  width: `calc(${100 / state.frames.length}% - 6px)`,
                  minWidth: 42,
                  background: isFree ? undefined : frame.color?.bg,
                  color: isFree ? undefined : frame.color?.text,
                }}
                className={`h-11 rounded-lg flex flex-col items-center justify-center text-[10px] select-none transition-all duration-300 border
                  ${isFree
                    ? "border-dashed border-gray-300 text-gray-400 bg-white"
                    : "border-black/5 font-semibold shadow-sm"
                  }
                  ${isHighlighted ? "ring-4 ring-yellow-400 ring-offset-2 scale-105 z-10 border-yellow-500 shadow-md font-bold" : ""}
                `}
              >
                <span className="opacity-60 text-[8px] mb-[-1px]">Frame {i}</span>
                <span className="truncate max-w-full px-0.5">
                  {isFree ? "-" : `${frame.processName}`}
                </span>
                {!isFree && (
                  <span className="text-[8px] opacity-75 font-normal">P{frame.pageNumber}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main interactive area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* LEFT COLUMN: TLB & Translation (7/12 width) */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* TLB Cache Monitor */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-bold text-gray-800">
                  Translation Lookaside Buffer (TLB)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClearTlb}
                  className="text-[10px] text-gray-500 hover:text-red-500 transition-colors border border-gray-200 rounded px-2 py-0.5"
                >
                  Clear TLB
                </button>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="text-[10px] text-gray-500 hover:text-blue-500 transition-colors border border-gray-200 rounded px-2 py-0.5"
                >
                  Settings
                </button>
              </div>
            </div>

            {/* TLB Config Drawer */}
            {showSettings && (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">TLB Size</label>
                  <select
                    value={state.tlbSize}
                    onChange={handleTlbSizeChange}
                    className="w-full border border-gray-200 rounded p-1 bg-white text-gray-700"
                  >
                    <option value={2}>2 Entries</option>
                    <option value={4}>4 Entries (Default)</option>
                    <option value={8}>8 Entries</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Replacement Policy</label>
                  <select
                    value={state.tlbPolicy}
                    onChange={handleTlbPolicyChange}
                    className="w-full border border-gray-200 rounded p-1 bg-white text-gray-700"
                  >
                    <option value="LRU">LRU (Least Recently Used)</option>
                    <option value="FIFO">FIFO (First In First Out)</option>
                  </select>
                </div>
              </div>
            )}

            {/* TLB Grid view */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Array.from({ length: state.tlbSize }).map((_, idx) => {
                const entry = state.tlb[idx];
                const isEmpty = !entry;
                
                const isTranslatedEntry = transResult && !transResult.error && 
                  entry && entry.processId === transProcId && entry.pageNumber === transResult.pageNumber;
                  
                return (
                  <div
                    key={idx}
                    className={`border rounded-lg p-2 flex flex-col justify-center min-h-[60px] text-xs transition-all duration-300 ${
                      isEmpty 
                        ? "border-dashed border-gray-200 bg-gray-50/50 text-gray-400 text-center" 
                        : isTranslatedEntry
                          ? "border-yellow-400 bg-yellow-50/50 ring-2 ring-yellow-300"
                          : "border-gray-200 bg-white"
                    }`}
                  >
                    {isEmpty ? (
                      <span className="text-[10px] italic">Empty [{idx}]</span>
                    ) : (
                      <>
                        <div className="flex items-center justify-between font-bold border-b border-gray-100 pb-1 mb-1">
                          <span className="text-gray-700 text-[10px]">{entry.processName}</span>
                          <span className="text-[8px] bg-blue-100 text-blue-700 px-1 rounded">Idx {idx}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span>Page: <b>P{entry.pageNumber}</b></span>
                          <span className="text-gray-400 font-mono">{"->"}</span>
                          <span>Frame: <b>F{entry.frameNumber}</b></span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Address Translation Simulator Panel */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-bold text-gray-800">
                  Address Translation Simulator (MMU)
                </h3>
              </div>
              <button 
                onClick={handleRandomTranslate}
                disabled={state.processes.length === 0}
                className="text-[10px] text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-50"
              >
                Translate Random Address
              </button>
            </div>

            {state.processes.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 bg-gray-50/30">
                Please allocate a process before simulating address translation.
              </div>
            ) : (
              <div className="space-y-3">
                {/* Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Process</label>
                    <select
                      value={transProcId}
                      onChange={(e) => {
                        setTransProcId(e.target.value);
                        setTransResult(null);
                        setHighlightedFrame(null);
                      }}
                      className="w-full text-xs border border-gray-200 rounded px-2.5 py-1.5 bg-white text-gray-700"
                    >
                      {state.processes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Size: {p.size} KB)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                      Logical Address (0 - {selectedTransProc ? selectedTransProc.size - 1 : 0} KB)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={selectedTransProc ? selectedTransProc.size - 1 : 0}
                        value={transAddress}
                        onChange={(e) => {
                          setTransAddress(Number(e.target.value));
                          setTransResult(null);
                          setHighlightedFrame(null);
                        }}
                        className="w-20 text-xs border border-gray-200 rounded px-2 py-1.5 bg-white font-mono"
                      />
                      <input
                        type="range"
                        min={0}
                        max={selectedTransProc ? selectedTransProc.size - 1 : 1}
                        value={transAddress}
                        onChange={(e) => {
                          setTransAddress(Number(e.target.value));
                          setTransResult(null);
                          setHighlightedFrame(null);
                        }}
                        className="flex-1 accent-blue-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Translate Button */}
                <button
                  onClick={handleTranslate}
                  className="w-full text-xs py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                  Translate Address
                </button>

                {/* Translation Results Log */}
                {transResult && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50/50">
                    <div className={`px-3 py-2 border-b text-xs font-bold flex justify-between items-center ${
                      transResult.error 
                        ? "bg-red-50 text-red-700 border-red-100" 
                        : "bg-green-50 text-green-700 border-green-100"
                    }`}>
                      <span>{transResult.error ? "Translation Error" : "Translation Successful"}</span>
                      {transResult.isTlbHit && (
                        <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded font-mono">
                          TLB HIT
                        </span>
                      )}
                    </div>
                    
                    {/* Step-by-step trace */}
                    <div className="p-3 space-y-1.5 font-mono text-[10px]">
                      {transResult.steps.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-1.5 text-gray-600">
                          <span className="text-gray-400">{idx + 1}.</span>
                          <span>{step}</span>
                        </div>
                      ))}

                      {/* Final block address */}
                      {!transResult.error && (
                        <div className="mt-3 p-2.5 bg-white border border-gray-200 rounded-lg flex items-center justify-between text-xs">
                          <div>
                            <span className="text-gray-400">Physical Address: </span>
                            <span className="font-bold text-gray-800 font-mono">
                              {transResult.physicalAddress} KB
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                            Frame F{transResult.frameNumber} + Offset {transResult.offset} KB
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Allocation & Page Tables (5/12 width) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Page Tables Panel */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-800">
                {state.pagingMode === "standard" ? "Process Page Tables" : "Inverted Page Table (IPT)"}
              </h3>
              
              {state.pagingMode === "inverted" && (
                <div className="flex items-center gap-1 bg-gray-100 rounded px-1.5 py-0.5">
                  <span className="text-[9px] font-bold text-gray-400 uppercase">Search:</span>
                  <select
                    value={state.iptSearchMethod}
                    onChange={handleIptSearchMethodChange}
                    className="text-[10px] font-medium bg-transparent text-gray-700 focus:outline-none"
                  >
                    <option value="linear">Linear Scan</option>
                    <option value="hash">Hash Table</option>
                  </select>
                </div>
              )}
            </div>

            {/* Content for Standard Paging Mode */}
            {state.pagingMode === "standard" && (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {state.processes.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400">
                    No active processes
                  </div>
                ) : (
                  state.processes.map((p) => {
                    const isTranslatingThis = transProcId === p.id;
                    return (
                      <div key={p.id} className={`bg-white rounded-lg border overflow-hidden ${
                        isTranslatingThis ? "border-indigo-400 ring-1 ring-indigo-200" : "border-gray-200"
                      }`}>
                        <div className="flex justify-between items-center px-2.5 py-1.5 border-b border-gray-100" style={{ backgroundColor: p.color.bg, color: p.color.text }}>
                          <span className="text-xs font-bold">{p.name} ({p.size} KB)</span>
                          <button onClick={() => handleFree(p.id)} className="text-[10px] font-bold bg-white/20 hover:bg-white/40 px-2 py-0.5 rounded transition-all">
                            Free Process
                          </button>
                        </div>
                        <div className="p-2 flex gap-1.5 flex-wrap">
                          {p.pageTable.map((frameNum, pageIdx) => {
                            const isThisPageTranslated = isTranslatingThis && transResult && !transResult.error && transResult.pageNumber === pageIdx;
                            return (
                              <div 
                                key={pageIdx} 
                                className={`text-[9px] border rounded px-1.5 py-0.5 transition-all ${
                                  isThisPageTranslated 
                                    ? "bg-yellow-400 border-yellow-500 font-bold" 
                                    : "bg-gray-50 border-gray-200"
                                }`}
                              >
                                <span className="text-gray-500">Page {pageIdx}</span>
                                <span className="mx-0.5 text-gray-400">{"->"}</span>
                                <b>Frame {frameNum}</b>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Content for Inverted Paging Mode */}
            {state.pagingMode === "inverted" && (
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-[10px] border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200 text-gray-600 font-bold">
                      <th className="py-1.5 px-2">Frame</th>
                      <th className="py-1.5 px-2">Process</th>
                      <th className="py-1.5 px-2">Page #</th>
                      <th className="py-1.5 px-2 text-right">Physical Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.frames.map((frame) => {
                      const isOccupied = frame.processId !== null;
                      const isThisTranslatedFrame = transResult && !transResult.error && transResult.frameNumber === frame.id;
                      
                      return (
                        <tr 
                          key={frame.id} 
                          className={`border-b border-gray-100 transition-colors ${
                            isThisTranslatedFrame 
                              ? "bg-yellow-100 font-bold text-gray-800" 
                              : isOccupied 
                                ? "hover:bg-gray-50/50" 
                                : "bg-gray-50/30 text-gray-400"
                          }`}
                        >
                          <td className="py-1.5 px-2 font-mono">F{frame.id}</td>
                          <td className="py-1.5 px-2">
                            {isOccupied ? (
                              <span className="flex items-center gap-1 font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: frame.color?.bg }} />
                                {frame.processName}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="py-1.5 px-2">{isOccupied ? `P${frame.pageNumber}` : "—"}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-gray-500">
                            {frame.id * state.pageSize}K - {(frame.id + 1) * state.pageSize - 1}K
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Educational Note */}
            <div className="bg-blue-50/50 border border-blue-100 p-2.5 rounded-lg text-[10px] text-blue-700 leading-relaxed font-sans">
              {state.pagingMode === "standard" ? (
                <>
                  💡 <b>Standard Page Table</b>: Each process has its own page table. Address translation is fast and O(1) via direct array lookup, but consumes more memory storage as the number of processes and size of virtual spaces grow.
                </>
              ) : (
                <>
                  💡 <b>Inverted Page Table (IPT)</b>: Only one global page table exists for the entire physical memory. Greatly reduces storage overhead, but requires a search mechanism (O(N) linear scan or using Hash Tables) to resolve translations.
                </>
              )}
            </div>
          </div>

          {/* Allocation controls panel */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-gray-800">
              Allocate New Process
            </h3>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-16 shrink-0 font-medium">Process Name</span>
                <input
                  type="text"
                  value={processName}
                  onChange={(e) => setProcessName(e.target.value)}
                  className="flex-1 text-xs border border-gray-200 rounded px-2.5 py-1.5 bg-white text-gray-700"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-16 shrink-0 font-medium">Size</span>
                <input
                  type="range" 
                  min={1} 
                  max={30} 
                  step={1} 
                  value={processSize}
                  onChange={(e) => setProcessSize(Number(e.target.value))}
                  className="flex-1 accent-blue-600"
                />
                <span className="text-xs font-bold text-gray-700 w-12 text-right">
                  {processSize} KB
                </span>
              </div>
              
              <div className="text-[10px] text-gray-500 bg-gray-50 p-2 rounded border border-gray-100 flex justify-between">
                <span>Estimated Pages: <b>{Math.ceil(processSize / state.pageSize)} pages</b></span>
                <span>Internal Waste: <b>{(Math.ceil(processSize / state.pageSize) * state.pageSize) - processSize} KB</b></span>
              </div>
              
              <div className="flex gap-2 pt-1.5">
                <button 
                  onClick={handleAllocate} 
                  className="flex-1 text-xs py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors shadow-sm"
                >
                  Allocate
                </button>
                <button 
                  onClick={handleDemo} 
                  className="flex-1 text-xs py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg font-semibold transition-colors"
                >
                  Run Demo
                </button>
                <button 
                  onClick={handleReset} 
                  className="text-xs py-2 px-3 border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 rounded-lg transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Event Log */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
            <h3 className="text-xs font-bold text-gray-800">
              Event Log
            </h3>
            <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
              {state.events.length === 0 ? (
                <div className="text-center py-4 text-xs text-gray-300">No recent events</div>
              ) : (
                [...state.events].reverse().map((e, idx) => (
                  <div key={idx} className={`text-[10px] px-2.5 py-1.5 rounded-lg border ${
                    e.type === "allocate" 
                      ? "bg-green-50 border-green-100 text-green-700" 
                      : e.type === "free"
                        ? "bg-gray-50 border-gray-100 text-gray-500"
                        : "bg-red-50 border-red-100 text-red-600"
                  }`}>
                    {e.type === "allocate" && (
                      <span className="font-semibold">Allocated {e.processName} ({e.size} KB): {e.details}</span>
                    )}
                    {e.type === "free" && (
                      <span>Freed process {e.processName} ({e.size} KB), reclaimed physical frames.</span>
                    )}
                    {e.type === "fail" && (
                      <span className="font-semibold">Failed: {e.reason}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
