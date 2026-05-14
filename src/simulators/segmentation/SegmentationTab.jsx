import { useState, useCallback } from "react";
import {
  createInitialState,
  allocate,
  freeProcess,
  translateAddress,
  getMetrics,
  runDemo,
  runFragDemo,
} from "./logic";

const DEFAULT_SEGMENTS = [
  { name: "code",  size: 10 },
  { name: "data",  size: 6  },
  { name: "heap",  size: 8  },
  { name: "stack", size: 4  },
];

const PROCESS_NAMES = ["Browser","Editor","Server","Client","Game","Daemon","Shell","Proxy"];

export default function SegmentationTab() {
  const [state, setState]           = useState(() => createInitialState(128));
  const [processName, setProcessName] = useState("Browser");
  const [segments, setSegments]     = useState(DEFAULT_SEGMENTS);
  const [addrProc, setAddrProc]     = useState("");
  const [addrSeg, setAddrSeg]       = useState("code");
  const [addrOffset, setAddrOffset] = useState(0);
  const [addrResult, setAddrResult] = useState(null);

  const metrics = getMetrics(state);

  // ── Segment editor ────────────────────────────────────────

  const updateSegSize = (idx, val) => {
    setSegments((prev) => prev.map((s, i) => i === idx ? { ...s, size: Number(val) } : s));
  };

  const addSegment = () => {
    setSegments((prev) => [...prev, { name: "seg" + prev.length, size: 4 }]);
  };

  const removeSegment = (idx) => {
    setSegments((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Allocate ──────────────────────────────────────────────

  const handleAllocate = useCallback(() => {
    setState((s) => allocate(s, processName.trim() || "P?", segments));
    const idx = PROCESS_NAMES.indexOf(processName);
    if (idx >= 0 && idx < PROCESS_NAMES.length - 1)
      setProcessName(PROCESS_NAMES[idx + 1]);
  }, [processName, segments]);

  const handleFree = useCallback((pid) => {
    setState((s) => freeProcess(s, pid));
    setAddrResult(null);
  }, []);

  const handleReset = useCallback(() => {
    setState(createInitialState(128));
    setAddrResult(null);
    setProcessName("Browser");
  }, []);

  // ── Address translation ───────────────────────────────────

  const handleTranslate = useCallback(() => {
    const proc = state.processes.find((p) => p.id === addrProc);
    if (!proc) { setAddrResult({ error: "Chưa chọn process" }); return; }
    setAddrResult(translateAddress(proc, addrSeg, Number(addrOffset)));
  }, [state.processes, addrProc, addrSeg, addrOffset]);

  const selectedProc = state.processes.find((p) => p.id === addrProc);

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-gray-800">Segmentation</h2>
          <p className="text-xs text-gray-400">Mỗi process gồm nhiều segment (code / data / heap / stack)</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Tổng",      value: `${metrics.totalMemory} KB` },
          { label: "Đã dùng",   value: `${metrics.usedMemory} KB` },
          { label: "Còn trống", value: `${metrics.freeMemory} KB` },
          { label: "Ext. frag", value: `${metrics.fragmentationPercent}%`,
            warn: metrics.fragmentationPercent > 30 },
        ].map((m) => (
          <div key={m.label} className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-0.5">{m.label}</div>
            <div className={`text-lg font-medium ${m.warn ? "text-red-500" : "text-gray-800"}`}>
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
                        : metrics.fragmentationPercent > 20 ? "#EF9F27" : "#1D9E75",
            }}
          />
        </div>
      </div>

      {/* Physical memory visual */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">
          Physical memory — {state.totalMemory} KB · click segment để free process
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
                    ? `Free · ${block.size} KB @ ${block.start}`
                    : `${block.segmentName} (${block.size} KB) @ ${block.start} — click để free`
                }
                style={{
                  width: `calc(${pct}% - 4px)`,
                  minWidth: 28,
                  background: isFree ? undefined : block.color?.bg,
                  color: isFree ? undefined : block.color?.text,
                }}
                className={`h-10 rounded flex items-center justify-center text-xs font-medium select-none transition-opacity
                  ${isFree ? "border border-dashed border-gray-300 text-gray-300"
                           : "cursor-pointer hover:opacity-75"}`}
              >
                {isFree ? `${block.size}K` : block.segmentName}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">

        {/* Allocate panel */}
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-gray-700">Cấp phát process mới</p>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-14 shrink-0">Tên</span>
            <input
              type="text" value={processName}
              onChange={(e) => setProcessName(e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white"
            />
          </div>

          {/* Segment list */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">Segments</span>
              <button onClick={addSegment} className="text-xs text-blue-500 hover:text-blue-700">+ Thêm</button>
            </div>
            {segments.map((seg, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: ["#CECBF6","#9FE1CB","#F5C4B3","#F4C0D1"][idx % 4] }}
                />
                <span className="text-xs text-gray-600 w-12">{seg.name}</span>
                <input
                  type="range" min={2} max={32} step={2} value={seg.size}
                  onChange={(e) => updateSegSize(idx, e.target.value)}
                  className="flex-1"
                />
                <span className="text-xs text-gray-600 w-10 text-right">{seg.size} KB</span>
                {segments.length > 1 && (
                  <button onClick={() => removeSegment(idx)} className="text-xs text-red-400 hover:text-red-600">✕</button>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={handleAllocate}
              className="flex-1 text-xs py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-100 transition-colors">
              Allocate
            </button>
            <button onClick={handleReset}
              className="text-xs py-1.5 px-3 border border-gray-200 rounded-md bg-white hover:bg-gray-100 transition-colors">
              Reset
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={() => { setState(runDemo()); setProcessName("P4"); setAddrResult(null); }}
              className="flex-1 text-xs py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50">
              Demo
            </button>
            <button onClick={() => { setState(runFragDemo()); setProcessName("P4"); setAddrResult(null); }}
              className="flex-1 text-xs py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50">
              Demo frag
            </button>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-3">

          {/* Process list */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-700 mb-2">Processes đang chạy</p>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {state.processes.length === 0 ? (
                <p className="text-xs text-gray-300 text-center py-2">Chưa có process nào</p>
              ) : state.processes.map((p) => (
                <div key={p.id} className="bg-white rounded border border-gray-100 px-2 py-1.5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color?.bg }} />
                    <span className="flex-1 text-xs font-medium text-gray-700">{p.name}</span>
                    <span className="text-xs text-gray-400">
                      {p.segments.reduce((s, seg) => s + seg.size, 0)} KB
                    </span>
                    <button onClick={() => handleFree(p.id)} className="text-xs text-red-400 hover:text-red-600">Free</button>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {p.segments.map((seg) => (
                      <span key={seg.segId}
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: p.color?.bg, color: p.color?.text }}>
                        {seg.name} {seg.size}K @{seg.base}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Address translation */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-700 mb-2">Address translation</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-14 shrink-0">Process</span>
                <select value={addrProc} onChange={(e) => { setAddrProc(e.target.value); setAddrResult(null); }}
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white">
                  <option value="">-- chọn --</option>
                  {state.processes.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-14 shrink-0">Segment</span>
                <select value={addrSeg} onChange={(e) => { setAddrSeg(e.target.value); setAddrResult(null); }}
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white">
                  {(selectedProc?.segments || []).map((s) => (
                    <option key={s.segId} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-14 shrink-0">Offset</span>
                <input type="number" min={0} value={addrOffset}
                  onChange={(e) => { setAddrOffset(e.target.value); setAddrResult(null); }}
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white font-mono"
                />
              </div>
              <button onClick={handleTranslate}
                className="w-full text-xs py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-100">
                Translate
              </button>

              {addrResult && (
                <div className={`text-xs px-2.5 py-2 rounded-md font-mono ${
                  addrResult.error ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"
                }`}>
                  {addrResult.error ? (
                    `✕ ${addrResult.error}`
                  ) : (
                    <>
                      <div>logical: &lt;{addrSeg}, {addrOffset}&gt;</div>
                      <div>check: {addrResult.offset} &lt; limit {addrResult.limit} ✓</div>
                      <div className="font-semibold">
                        physical: {addrResult.base} + {addrResult.offset} = {addrResult.physical}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Segment table */}
      {state.processes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-700 mb-1.5">Segment table</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-gray-400 border-b border-gray-200">
                  <th className="text-left py-1.5 px-2 font-normal">Process</th>
                  <th className="text-left py-1.5 px-2 font-normal">Segment</th>
                  <th className="text-right py-1.5 px-2 font-normal">Base</th>
                  <th className="text-right py-1.5 px-2 font-normal">Limit</th>
                  <th className="text-right py-1.5 px-2 font-normal">End</th>
                </tr>
              </thead>
              <tbody>
                {state.processes.flatMap((p) =>
                  p.segments.map((seg, i) => (
                    <tr key={seg.segId} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-1.5 px-2">
                        {i === 0 ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color?.bg }} />
                            {p.name}
                          </span>
                        ) : ""}
                      </td>
                      <td className="py-1.5 px-2 text-gray-500">{seg.name}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{seg.base}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{seg.size}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-gray-400">{seg.base + seg.size}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Event log */}
      <div>
        <p className="text-xs font-medium text-gray-700 mb-1.5">Event log</p>
        <div className="space-y-1 max-h-28 overflow-y-auto">
          {state.events.length === 0 ? (
            <p className="text-xs text-gray-300 text-center py-2">Chưa có sự kiện nào</p>
          ) : [...state.events].reverse().map((e, i) => (
            <div key={i} className={`text-xs px-2.5 py-1.5 rounded-md ${
              e.type === "allocate" ? "bg-green-50 text-green-700" :
              e.type === "free"     ? "bg-gray-100 text-gray-500" :
                                      "bg-red-50 text-red-600"
            }`}>
              {e.type === "allocate" &&
                `✓ Cấp phát ${e.processName} — ${e.segments.map(s => `${s.name}(${s.size}K@${s.base})`).join(", ")}`}
              {e.type === "free" && `○ Giải phóng ${e.processName}`}
              {e.type === "fail"    && `✕ ${e.reason}`}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}