// simulators/paging/PagingTab.jsx
// src/simulators/paging/PagingTab.jsx
import { useState, useCallback } from "react";
import {
  createInitialState,
  allocate,
  freeProcess,
  getMetrics,
  runDemoWorkload,
} from "./logic.js";

const PROCESS_NAMES = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];

export default function PagingTab() {
  const [state, setState] = useState(() => createInitialState(64, 4));
  const [processName, setProcessName] = useState("P1");
  const [processSize, setProcessSize] = useState(10);

  const metrics = getMetrics(state);

  // ── Handlers ──────────────────────────────────────────────
  const handlePageSizeChange = useCallback((e) => {
    const newSize = Number(e.target.value);
    setState(createInitialState(64, newSize));
    setProcessName("P1");
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
  }, []);

  const handleReset = useCallback(() => {
    setState(createInitialState(64, state.pageSize));
    setProcessName("P1");
  }, [state.pageSize]);

  const handleDemo = useCallback(() => {
    setState(runDemoWorkload(64, state.pageSize));
    setProcessName("P5");
  }, [state.pageSize]);

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-gray-800">Paging</h2>
          <p className="text-xs text-gray-400">Non-contiguous memory allocation</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Page Size:</span>
          <select
            value={state.pageSize}
            onChange={handlePageSizeChange}
            className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
          >
            <option value={2}>2 KB</option>
            <option value={4}>4 KB (Default)</option>
            <option value={8}>8 KB</option>
          </select>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total Physical Memory", value: `${metrics.totalMemory} KB` },
          { label: "Number of Frames", value: `${state.frames.length} frames` },
          { label: "Internal Fragmentation", value: `${metrics.totalInternalFrag} KB`, highlight: metrics.totalInternalFrag > 0 },
          { label: "Page Table Entries", value: `${metrics.totalPages} entries`, highlight: metrics.totalPages > 15 },
        ].map((m) => (
          <div key={m.label} className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-0.5">{m.label}</div>
            <div className={`text-lg font-medium ${m.highlight ? "text-red-500" : "text-gray-800"}`}>
              {m.value}
            </div>
          </div>
        ))}
      </div>



      {/* Memory visual */}
      <div>
        <div className="flex justify-between items-end mb-1.5">
          <p className="text-xs text-gray-400">
            Physical Memory — {state.frames.length} Frames ({state.pageSize} KB/Frame)
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2 flex flex-wrap gap-1 min-h-12 border border-gray-100">
          {state.frames.map((frame, i) => {
            const isFree = !frame.processId;
            return (
              <div
                key={frame.id}
                title={
                  isFree
                    ? `Frame ${i} · Free`
                    : `Frame ${i} · ${frame.processName} (Page ${frame.pageNumber})`
                }
                style={{
                  width: `calc(${100 / state.frames.length}% - 4px)`,
                  minWidth: 28,
                  background: isFree ? undefined : frame.color?.bg,
                  color: isFree ? undefined : frame.color?.text,
                }}
                className={`h-10 rounded flex flex-col items-center justify-center text-[10px] select-none transition-opacity
                  ${isFree
                    ? "border border-dashed border-gray-300 text-gray-400 bg-white"
                    : "border border-black/5 font-medium shadow-sm"
                  }`}
              >
                <span className="opacity-50 text-[8px] mb-[-2px]">F{i}</span>
                <span>{isFree ? "-" : `${frame.processName}`}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls & Page Table */}
      <div className="grid grid-cols-2 gap-3">
        {/* Allocate panel */}
        <div className="bg-gray-50 rounded-lg p-3 space-y-2.5 border border-gray-100">
          <p className="text-xs font-medium text-gray-700">Allocate new process</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-16 shrink-0">Process name</span>
            <input
              type="text"
              value={processName}
              onChange={(e) => setProcessName(e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-16 shrink-0">Size</span>
            <input
              type="range" min={1} max={30} step={1} value={processSize}
              onChange={(e) => setProcessSize(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-xs font-medium text-gray-700 w-12 text-right">
              {processSize} KB
            </span>
          </div>
          <div className="text-[10px] text-gray-500 bg-white p-1.5 rounded border border-gray-100">
            Estimated: <b>{Math.ceil(processSize / state.pageSize)} pages</b> 
            (Internal waste: <b>{(Math.ceil(processSize / state.pageSize) * state.pageSize) - processSize} KB</b>)
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleAllocate} className="flex-1 text-xs py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
              Allocate Process
            </button>
            <button onClick={handleDemo} className="flex-1 text-xs py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50 transition-colors">
              Run Demo
            </button>
            <button onClick={handleReset} className="text-xs py-1.5 px-3 border border-gray-200 rounded-md bg-white hover:bg-gray-50 transition-colors">
              Reset
            </button>
          </div>
        </div>

        {/* Page Table View */}
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
          <p className="text-xs font-medium text-gray-700 mb-2">Process Page Tables</p>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {state.processes.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded">No processes running</p>
            ) : (
              state.processes.map((p) => (
                <div key={p.id} className="bg-white rounded border border-gray-200 overflow-hidden">
                  <div className="flex justify-between items-center px-2 py-1 border-b border-gray-100" style={{ backgroundColor: p.color.bg, color: p.color.text }}>
                    <span className="text-xs font-bold">{p.name} ({p.size} KB)</span>
                    <button onClick={() => handleFree(p.id)} className="text-[10px] hover:underline opacity-80">Kill / Free</button>
                  </div>
                  <div className="p-1.5 flex gap-1 flex-wrap">
                    {p.pageTable.map((frameNum, pageIdx) => (
                      <div key={pageIdx} className="text-[9px] border border-gray-200 rounded px-1 py-0.5 bg-gray-50">
                        <span className="text-gray-400">P{pageIdx}</span><span className="mx-0.5">→</span><b>F{frameNum}</b>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
