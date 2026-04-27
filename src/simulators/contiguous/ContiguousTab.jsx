import { useState, useCallback } from "react";
import {
  createInitialState,
  allocate,
  freeProcess,
  getMetrics,
  runFragmentationDemo,
  runRandomWorkload,
} from "./logic.js";

const PROCESS_NAMES = ["P1","P2","P3","P4","P5","P6","P7","P8"];

export default function ContiguousTab() {
  const [state, setState] = useState(() => createInitialState(64, "first-fit"));
  const [processName, setProcessName] = useState("P1");
  const [processSize, setProcessSize] = useState(8);

  const metrics = getMetrics(state);

  // ── Handlers ──────────────────────────────────────────────

  const handleStrategyChange = useCallback((e) => {
    setState((s) => ({ ...s, strategy: e.target.value }));
  }, []);

  const handleAllocate = useCallback(() => {
    const name = processName.trim() || "P?";
    setState((s) => allocate(s, name, processSize));
    // Auto tăng tên process
    const idx = PROCESS_NAMES.indexOf(processName);
    if (idx >= 0 && idx < PROCESS_NAMES.length - 1)
      setProcessName(PROCESS_NAMES[idx + 1]);
  }, [processName, processSize]);

  const handleFree = useCallback((pid) => {
    setState((s) => freeProcess(s, pid));
  }, []);

  const handleReset = useCallback(() => {
    setState(createInitialState(64, state.strategy));
    setProcessName("P1");
  }, [state.strategy]);

  const handlePresetFrag = useCallback(() => {
    setState(runFragmentationDemo(64, state.strategy));
    setProcessName("P6");
  }, [state.strategy]);

  const handlePresetRandom = useCallback(() => {
    setState(runRandomWorkload(64, state.strategy));
    setProcessName("P6");
  }, [state.strategy]);

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-gray-800">Contiguous Allocation</h2>
          <p className="text-xs text-gray-400">Nguyễn Minh Đức · First / Best / Worst Fit</p>
        </div>
        <select
          value={state.strategy}
          onChange={handleStrategyChange}
          className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
        >
          <option value="first-fit">First Fit</option>
          <option value="best-fit">Best Fit</option>
          <option value="worst-fit">Worst Fit</option>
        </select>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Tổng",       value: `${metrics.totalMemory} KB` },
          { label: "Đã dùng",    value: `${metrics.usedMemory} KB` },
          { label: "Còn trống",  value: `${metrics.freeMemory} KB` },
          { label: "Ext. frag",  value: `${metrics.fragmentationPercent}%`,
            highlight: metrics.fragmentationPercent > 30 },
        ].map((m) => (
          <div key={m.label} className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-0.5">{m.label}</div>
            <div className={`text-lg font-medium ${m.highlight ? "text-red-500" : "text-gray-800"}`}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Fragmentation bar */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-xs text-gray-400">External fragmentation</span>
          <span className="text-xs text-gray-500">{metrics.fragmentationPercent}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${metrics.fragmentationPercent}%`,
              background: metrics.fragmentationPercent > 50 ? "#E24B4A"
                        : metrics.fragmentationPercent > 20 ? "#EF9F27"
                        : "#1D9E75",
            }}
          />
        </div>
      </div>

      {/* Memory visual */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">
          Physical memory — {state.totalMemory} KB total &nbsp;·&nbsp; click block để free
        </p>
        <div className="bg-gray-50 rounded-lg p-2 flex flex-wrap gap-1 min-h-12">
          {state.blocks.map((block) => {
            const pct = (block.size / state.totalMemory) * 100;
            const isFree = !block.processId;
            return (
              <div
                key={block.id}
                onClick={() => !isFree && handleFree(block.processId)}
                title={
                  isFree
                    ? `Free · ${block.size} KB @ địa chỉ ${block.start}`
                    : `${block.processName} · ${block.size} KB @ ${block.start} — click để free`
                }
                style={{
                  width: `calc(${pct}% - 4px)`,
                  minWidth: 24,
                  background: isFree ? undefined : block.color?.bg,
                  color: isFree ? undefined : block.color?.text,
                }}
                className={`h-10 rounded flex items-center justify-center text-xs font-medium select-none transition-opacity
                  ${isFree
                    ? "border border-dashed border-gray-300 text-gray-300"
                    : "cursor-pointer hover:opacity-75"
                  }`}
              >
                {isFree ? `${block.size}K` : block.processName}
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-3">

        {/* Allocate panel */}
        <div className="bg-gray-50 rounded-lg p-3 space-y-2.5">
          <p className="text-xs font-medium text-gray-700">Cấp phát process mới</p>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-16 shrink-0">Tên process</span>
            <input
              type="text"
              value={processName}
              onChange={(e) => setProcessName(e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white w-20"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-16 shrink-0">Kích thước</span>
            <input
              type="range" min={2} max={24} step={2} value={processSize}
              onChange={(e) => setProcessSize(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-xs font-medium text-gray-700 w-12 text-right">
              {processSize} KB
            </span>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAllocate}
              className="flex-1 text-xs py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-100 transition-colors"
            >
              Allocate
            </button>
            <button
              onClick={handleReset}
              className="text-xs py-1.5 px-3 border border-gray-200 rounded-md bg-white hover:bg-gray-100 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Process list */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-700 mb-2">Processes đang chạy</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {state.processes.length === 0 ? (
              <p className="text-xs text-gray-300 py-2 text-center">Chưa có process nào</p>
            ) : (
              state.processes.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 text-xs bg-white rounded border border-gray-100 px-2 py-1.5"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: p.color?.bg }}
                  />
                  <span className="flex-1 font-medium text-gray-700">{p.name}</span>
                  <span className="text-gray-400">{p.size} KB</span>
                  <button
                    onClick={() => handleFree(p.id)}
                    className="text-red-400 hover:text-red-600 transition-colors ml-1"
                  >
                    Free
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Preset scenarios */}
      <div className="flex gap-2">
        <button
          onClick={handlePresetFrag}
          className="flex-1 text-xs py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50 transition-colors"
        >
          Demo fragmentation
        </button>
        <button
          onClick={handlePresetRandom}
          className="flex-1 text-xs py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50 transition-colors"
        >
          Random workload
        </button>
      </div>

      {/* Event log */}
      <div>
        <p className="text-xs font-medium text-gray-700 mb-1.5">Event log</p>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {state.events.length === 0 ? (
            <p className="text-xs text-gray-300 text-center py-2">Chưa có sự kiện nào</p>
          ) : (
            [...state.events].reverse().map((e, i) => (
              <div
                key={i}
                className={`text-xs px-2.5 py-1.5 rounded-md ${
                  e.type === "allocate" ? "bg-green-50 text-green-700" :
                  e.type === "free"     ? "bg-gray-100 text-gray-500" :
                                          "bg-red-50 text-red-600"
                }`}
              >
                {e.type === "allocate" &&
                  `✓ Cấp phát ${e.size} KB cho ${e.processName} tại addr ${e.blockStart} KB (${e.strategy})`}
                {e.type === "free" &&
                  `○ Giải phóng ${e.processName} — ${e.size} KB trả về`}
                {e.type === "fail" &&
                  `✕ ${e.reason}`}
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
