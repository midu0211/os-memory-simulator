import { useState, useCallback } from "react";
import { getMetrics as getContiguousMetrics, allocate as contiguousAllocate, freeProcess as contiguousFree, createInitialState as createContiguous } from "../simulators/contiguous/logic";
import { getMetrics as getPagingMetrics, allocate as pagingAllocate, freeProcess as pagingFree, createInitialState as createPaging } from "../simulators/paging/logic";
import { getMetrics as getSegMetrics, allocate as segAllocate, freeProcess as segFree, createInitialState as createSeg } from "../simulators/segmentation/logic";
import { getMetrics as getVmMetrics, allocate as vmAllocate, freeProcess as vmFree, createInitialState as createVm } from "../simulators/virtualMemory/logic";

// ─── Preset workloads ────────────────────────────────────────

const PRESETS = [
  {
    id: "default",
    label: "Mặc định",
    desc: "Chrome · VSCode · Node · Figma · Slack, sau đó free VSCode",
    processes: [
      { name: "Chrome", size: 10 },
      { name: "VSCode", size: 8  },
      { name: "Node",   size: 6  },
      { name: "Figma",  size: 12 },
      { name: "Slack",  size: 6  },
    ],
    freeIndex: 1,
  },
  {
    id: "heavy",
    label: "Nặng",
    desc: "6 process lớn, free 2 process xen kẽ → fragmentation cao",
    processes: [
      { name: "P1", size: 14 },
      { name: "P2", size: 10 },
      { name: "P3", size: 12 },
      { name: "P4", size: 8  },
      { name: "P5", size: 14 },
      { name: "P6", size: 6  },
    ],
    freeIndex: 1,
    freeIndex2: 3,
  },
  {
    id: "small",
    label: "Nhỏ",
    desc: "Nhiều process nhỏ → internal frag rõ ở Paging",
    processes: [
      { name: "A", size: 3 },
      { name: "B", size: 3 },
      { name: "C", size: 5 },
      { name: "D", size: 3 },
      { name: "E", size: 7 },
      { name: "F", size: 3 },
      { name: "G", size: 5 },
    ],
    freeIndex: 2,
  },
  {
    id: "fragmax",
    label: "Max frag",
    desc: "Cố ý tạo fragmentation tối đa — free xen kẽ",
    processes: [
      { name: "P1", size: 8 },
      { name: "P2", size: 4 },
      { name: "P3", size: 8 },
      { name: "P4", size: 4 },
      { name: "P5", size: 8 },
      { name: "P6", size: 4 },
    ],
    freeIndex: 0,
    freeIndex2: 2,
    freeIndex3: 4,
  },
];

// ─── Chạy workload trên 4 simulator ─────────────────────────

function runWorkload(preset) {
  const { processes, freeIndex, freeIndex2, freeIndex3 } = preset;

  // Contiguous
  let cs = createContiguous(64, "first-fit");
  for (const p of processes) cs = contiguousAllocate(cs, p.name, p.size);
  if (freeIndex  != null && cs.processes[freeIndex])  cs = contiguousFree(cs, cs.processes[freeIndex].id);
  if (freeIndex2 != null && cs.processes[freeIndex2 - (freeIndex < freeIndex2 ? 1 : 0)]) {
    const p = cs.processes.find(p => p.name === processes[freeIndex2]?.name);
    if (p) cs = contiguousFree(cs, p.id);
  }
  if (freeIndex3 != null) {
    const p = cs.processes.find(p => p.name === processes[freeIndex3]?.name);
    if (p) cs = contiguousFree(cs, p.id);
  }
  const cm = getContiguousMetrics(cs);

  // Paging
  let ps = createPaging(64, 4);
  for (const p of processes) ps = pagingAllocate(ps, p.name, p.size);
  if (freeIndex  != null && ps.processes[freeIndex])  ps = pagingFree(ps, ps.processes[freeIndex].id);
  if (freeIndex2 != null) { const p = ps.processes.find(p => p.name === processes[freeIndex2]?.name); if (p) ps = pagingFree(ps, p.id); }
  if (freeIndex3 != null) { const p = ps.processes.find(p => p.name === processes[freeIndex3]?.name); if (p) ps = pagingFree(ps, p.id); }
  const pm = getPagingMetrics(ps);

  // Segmentation
  const segProcs = processes.map(p => ({
    name: p.name,
    segments: [
      { name: "code",  size: Math.max(2, Math.floor(p.size * 0.4)) },
      { name: "data",  size: Math.max(2, Math.floor(p.size * 0.3)) },
      { name: "stack", size: Math.max(2, Math.ceil(p.size * 0.3))  },
    ],
  }));
  let ss = createSeg(128);
  for (const p of segProcs) ss = segAllocate(ss, p.name, p.segments);
  if (freeIndex  != null && ss.processes[freeIndex])  ss = segFree(ss, ss.processes[freeIndex].id);
  if (freeIndex2 != null) { const p = ss.processes.find(p => p.name === processes[freeIndex2]?.name); if (p) ss = segFree(ss, p.id); }
  if (freeIndex3 != null) { const p = ss.processes.find(p => p.name === processes[freeIndex3]?.name); if (p) ss = segFree(ss, p.id); }
  const sm = getSegMetrics(ss);

  // Virtual Memory
  let vs = createVm(64, "paging");
  for (const p of processes) vs = vmAllocate(vs, p.name, p.size);
  if (freeIndex  != null && vs.processes[freeIndex])  vs = vmFree(vs, vs.processes[freeIndex].id);
  if (freeIndex2 != null) { const p = vs.processes.find(p => p.name === processes[freeIndex2]?.name); if (p) vs = vmFree(vs, p.id); }
  if (freeIndex3 != null) { const p = vs.processes.find(p => p.name === processes[freeIndex3]?.name); if (p) vs = vmFree(vs, p.id); }
  const vm = getVmMetrics(vs);

  return {
    contiguous: {
      label: "Contiguous", color: "#CECBF6", textColor: "#26215C",
      externalFrag: cm.fragmentationPercent,
      internalFrag: 0,
      freeMemory: cm.freeMemory,
      usedMemory: cm.usedMemory,
      pageFaults: 0,
      overhead: "Low", overheadNote: "Không có page table",
    },
    paging: {
      label: "Paging", color: "#9FE1CB", textColor: "#04342C",
      externalFrag: 0,
      internalFrag: pm.fragmentationPercent,
      internalFragKB: pm.totalInternalFrag,
      freeMemory: pm.freeMemory,
      usedMemory: pm.usedMemory,
      pageFaults: 0,
      overhead: "Medium", overheadNote: `Page table: ${pm.totalPages} entries`,
    },
    segmentation: {
      label: "Segmentation", color: "#F5C4B3", textColor: "#4A1B0C",
      externalFrag: sm.fragmentationPercent,
      internalFrag: 0,
      freeMemory: sm.freeMemory,
      usedMemory: sm.usedMemory,
      pageFaults: 0,
      overhead: "Medium", overheadNote: "Segment table mỗi process",
    },
    virtualMemory: {
      label: "Virtual Mem", color: "#F4C0D1", textColor: "#4B1528",
      externalFrag: vm.externalFragmentation ?? 0,
      internalFrag: vm.internalFragmentation ?? 0,
      internalFragKB: vm.internalWaste ?? 0,
      freeMemory: vm.freeMemory,
      usedMemory: vm.ramUsed,
      pageFaults: vm.pageFaults ?? 0,
      overhead: "High", overheadNote: "Page table + swap I/O",
    },
  };
}

// ─── Bar chart ───────────────────────────────────────────────

function Bar({ value, max, color, label, sublabel }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-xs text-gray-500 w-24 shrink-0 text-right">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden relative">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(pct, 3)}%`, background: color }} />
        <span className="absolute right-2 top-0 h-full flex items-center text-xs font-medium text-gray-600">
          {sublabel ?? `${value}%`}
        </span>
      </div>
    </div>
  );
}

// ─── Custom process builder ──────────────────────────────────

function CustomBuilder({ onRun }) {
  const [rows, setRows] = useState([
    { name: "P1", size: 10 },
    { name: "P2", size: 8  },
    { name: "P3", size: 6  },
  ]);
  const [freeIdx, setFreeIdx] = useState("1");

  const updateRow = (i, field, val) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addRow    = () => setRows(prev => [...prev, { name: `P${prev.length + 1}`, size: 6 }]);
  const removeRow = (i) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const handleRun = () => {
    const fi = parseInt(freeIdx);
    onRun({
      id: "custom",
      label: "Custom",
      desc: "Workload tự tạo",
      processes: rows,
      freeIndex: isNaN(fi) ? undefined : fi,
    });
  };

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <p className="text-xs font-medium text-gray-700">Tự tạo workload</p>

      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="text" value={r.name}
              onChange={e => updateRow(i, "name", e.target.value)}
              className="w-16 text-xs border border-gray-200 rounded px-2 py-1 bg-white" />
            <input type="range" min={2} max={24} step={2} value={r.size}
              onChange={e => updateRow(i, "size", Number(e.target.value))}
              className="flex-1" />
            <span className="text-xs text-gray-500 w-10 text-right">{r.size} KB</span>
            {rows.length > 1 && (
              <button onClick={() => removeRow(i)}
                className="text-xs text-red-400 hover:text-red-600">✕</button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">Free process index:</span>
        <input type="number" min={0} max={rows.length - 1} value={freeIdx}
          onChange={e => setFreeIdx(e.target.value)}
          className="w-14 text-xs border border-gray-200 rounded px-2 py-1 bg-white" />
        <span className="text-xs text-gray-400">(0 = process đầu tiên)</span>
      </div>

      <div className="flex gap-2">
        <button onClick={addRow}
          className="text-xs py-1.5 px-3 border border-gray-200 rounded-md bg-white hover:bg-gray-100">
          + Thêm process
        </button>
        <button onClick={handleRun}
          className="flex-1 text-xs py-1.5 border border-blue-200 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100">
          Chạy so sánh
        </button>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────

export default function CompareTab() {
  const [activePreset, setActivePreset] = useState("default");
  const [data, setData]   = useState(() => runWorkload(PRESETS[0]));
  const [showCustom, setShowCustom] = useState(false);

  const handlePreset = useCallback((preset) => {
    setActivePreset(preset.id);
    setData(runWorkload(preset));
    setShowCustom(false);
  }, []);

  const handleCustomRun = useCallback((preset) => {
    setActivePreset("custom");
    setData(runWorkload(preset));
  }, []);

  const techniques    = Object.values(data);
  const currentPreset = PRESETS.find(p => p.id === activePreset);

  const maxExtFrag   = Math.max(...techniques.map(t => t.externalFrag), 1);
  const maxIntFrag   = Math.max(...techniques.map(t => t.internalFrag), 1);
  const maxUsed      = Math.max(...techniques.map(t => t.usedMemory),   1);
  const maxFaults    = Math.max(...techniques.map(t => t.pageFaults),   1);

  return (
    <div className="p-4 space-y-4">

      {/* Header */}
      <div>
        <h2 className="text-sm font-medium text-gray-800">So sánh 4 kỹ thuật</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Chạy cùng một workload trên cả 4 simulator để so sánh hiệu năng
        </p>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
        <span className="text-amber-500 text-sm mt-0.5">ℹ</span>
        <p className="text-xs text-amber-700">
          Số liệu bên dưới được tính từ workload mẫu chạy độc lập — không phản ánh
          những gì bạn đang thao tác ở các tab khác.
          Chọn preset hoặc tự tạo workload để thay đổi kết quả.
        </p>
      </div>

      {/* Preset selector */}
      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">Chọn workload</p>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => handlePreset(p)}
              className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                activePreset === p.id
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}>
              <div className="font-medium">{p.label}</div>
              <div className="text-gray-400 mt-0.5 leading-relaxed">{p.desc}</div>
            </button>
          ))}
          <button onClick={() => setShowCustom(v => !v)}
            className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
              activePreset === "custom"
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-dashed border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
            }`}>
            <div className="font-medium">Tự tạo</div>
            <div className="text-gray-400 mt-0.5">Nhập process tuỳ ý</div>
          </button>
        </div>

        {/* Custom builder */}
        {showCustom && (
          <div className="mt-2">
            <CustomBuilder onRun={handleCustomRun} />
          </div>
        )}
      </div>

      {/* Workload summary */}
      {currentPreset && (
        <div className="bg-gray-50 rounded-lg px-3 py-2 flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-gray-400 mr-1">Workload:</span>
          {currentPreset.processes.map((p, i) => {
            const isFree = i === currentPreset.freeIndex
                        || i === currentPreset.freeIndex2
                        || i === currentPreset.freeIndex3;
            return (
              <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${
                isFree
                  ? "bg-red-50 text-red-500 line-through"
                  : "bg-white border border-gray-200 text-gray-600"
              }`}>
                {p.name} {p.size}KB
              </span>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 flex-wrap">
        {techniques.map(t => (
          <div key={t.label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color }} />
            <span className="text-xs text-gray-600">{t.label}</span>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="space-y-3">

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-700 mb-2">
            External Fragmentation
            <span className="ml-1 font-normal text-gray-400">— thấp hơn = tốt hơn</span>
          </p>
          {techniques.map(t => (
            <Bar key={t.label} label={t.label} value={t.externalFrag} max={maxExtFrag} color={t.color} />
          ))}
          <p className="text-xs text-gray-400 mt-1.5">
            Paging = 0% vì không cần vùng nhớ liên tục. Contiguous cao nhất do các hole rải rác sau khi free.
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-700 mb-2">
            Internal Fragmentation
            <span className="ml-1 font-normal text-gray-400">— thấp hơn = tốt hơn</span>
          </p>
          {techniques.map(t => (
            <Bar key={t.label} label={t.label} value={t.internalFrag} max={maxIntFrag} color={t.color} />
          ))}
          <p className="text-xs text-gray-400 mt-1.5">
            Contiguous và Segmentation = 0% vì cấp phát đúng kích thước. Paging lãng phí phần cuối page cuối cùng.
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-700 mb-2">RAM đã dùng</p>
          {techniques.map(t => (
            <Bar key={t.label} label={t.label} value={t.usedMemory} max={maxUsed}
              color={t.color} sublabel={`${t.usedMemory} KB`} />
          ))}
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-700 mb-2">
            Page Faults
            <span className="ml-1 font-normal text-gray-400">— chỉ Virtual Memory mới có</span>
          </p>
          {techniques.map(t => (
            <Bar key={t.label} label={t.label} value={t.pageFaults}
              max={Math.max(maxFaults, 1)} color={t.color} sublabel={`${t.pageFaults}`} />
          ))}
          <p className="text-xs text-gray-400 mt-1.5">
            Virtual Memory dùng demand paging — page fault xảy ra khi page cần truy cập chưa ở RAM.
          </p>
        </div>

      </div>

      {/* Summary table */}
      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">Bảng tổng hợp</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-gray-400 border-b border-gray-200">
                <th className="text-left py-2 px-2 font-normal">Kỹ thuật</th>
                <th className="text-right py-2 px-2 font-normal">Ext. frag</th>
                <th className="text-right py-2 px-2 font-normal">Int. frag</th>
                <th className="text-right py-2 px-2 font-normal">Page faults</th>
                <th className="text-right py-2 px-2 font-normal">Overhead</th>
              </tr>
            </thead>
            <tbody>
              {techniques.map(t => (
                <tr key={t.label} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-2">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                        style={{ background: t.color }} />
                      {t.label}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span className={t.externalFrag > 20 ? "text-red-500 font-medium" : ""}>
                      {t.externalFrag}%
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span className={t.internalFrag > 20 ? "text-orange-500 font-medium" : ""}>
                      {t.internalFrag}%
                      {t.internalFragKB > 0 && (
                        <span className="text-gray-400 ml-1">({t.internalFragKB} KB)</span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span className={t.pageFaults > 0 ? "text-orange-500 font-medium" : "text-gray-400"}>
                      {t.pageFaults}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span title={t.overheadNote}
                      className={`px-1.5 py-0.5 rounded text-xs ${
                        t.overhead === "Low"    ? "bg-green-50 text-green-700" :
                        t.overhead === "Medium" ? "bg-yellow-50 text-yellow-700" :
                                                   "bg-red-50 text-red-600"
                      }`}>
                      {t.overhead}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Kết luận */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-1.5">
        <p className="text-xs font-medium text-blue-800">Kết luận</p>
        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
          <li><strong>Contiguous</strong> — đơn giản, overhead thấp nhưng external fragmentation cao nhất.</li>
          <li><strong>Paging</strong> — loại bỏ external fragmentation hoàn toàn, đổi lấy internal frag và overhead page table.</li>
          <li><strong>Segmentation</strong> — phù hợp cấu trúc process (code/data/stack), không có internal frag nhưng vẫn có external frag.</li>
          <li><strong>Virtual Memory</strong> — dùng nhiều hơn RAM vật lý nhờ swap, nhưng page fault làm tăng access time.</li>
        </ul>
      </div>

    </div>
  );
}