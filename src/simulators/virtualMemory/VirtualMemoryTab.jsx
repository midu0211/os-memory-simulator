import { useState, useCallback } from "react";
import {
  VM_STRATEGIES,
  createInitialState,
  allocate,
  accessItem,
  accessProcess,
  freeProcess,
  getMetrics,
  runFragmentationDemo,
  runRandomWorkload,
} from "./logic.js";

const PROCESS_NAMES = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];

function getBlockItem(state, block) {
  if (!block.itemId) return null;
  return state.virtualItems.find((item) => item.id === block.itemId);
}

function getSsdLabel(item) {
  if (item.kind === "page") {
    return `${item.processName}:P${item.pageIndex}`;
  }

  if (item.kind === "segment-page") {
    return `${item.processName}:${item.segmentName[0]}P${item.segmentPageIndex}`;
  }

  return `${item.processName}:${item.segmentName}`;
}

function getRamLabel(state, block) {
  const item = getBlockItem(state, block);

  if (!item) {
    return state.strategy === "segmentation"
      ? `${block.size}K`
      : `F${block.frameIndex}`;
  }

  return getSsdLabel(item);
}

function getRamTitle(state, block) {
  const item = getBlockItem(state, block);

  if (!item) {
    return `Free · ${block.size} KB @ ${block.start}`;
  }

  if (item.kind === "page") {
    return `${item.processName} · virtual page ${item.pageIndex} -> frame ${block.frameIndex} · RAM ${block.start} KB`;
  }

  if (item.kind === "segment-page") {
    return `${item.processName} · segment ${item.segmentName}, page ${item.segmentPageIndex} -> frame ${block.frameIndex}`;
  }

  return `${item.processName} · segment ${item.segmentName} · RAM ${block.start} KB`;
}

function getStrategyNote(strategy) {
  if (strategy === "paging") {
    return "Allocate tạo page trong SSD/Page File. Khi Access, nếu page chưa ở RAM thì sinh page fault và swap in vào frame.";
  }

  if (strategy === "segmentation") {
    return "Allocate tạo các segment trong SSD/Page File. Khi Access, segment được nạp vào một block liên tục trong RAM.";
  }

  return "Allocate tạo segment, mỗi segment chia thành page. Khi Access, từng segment-page được nạp từ SSD vào frame RAM.";
}

export default function ContiguousTab() {
  const [state, setState] = useState(() => createInitialState(64, "paging"));
  const [processName, setProcessName] = useState("P1");
  const [processSize, setProcessSize] = useState(8);

  const metrics = getMetrics(state);

  const handleStrategyChange = useCallback((e) => {
    const strategy = e.target.value;
    setState(createInitialState(64, strategy));
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

  const handleAccessProcess = useCallback((pid) => {
    setState((s) => accessProcess(s, pid));
  }, []);

  const handleAccessItem = useCallback((itemId) => {
    setState((s) => accessItem(s, itemId));
  }, []);

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

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-gray-800">Virtual Memory</h2>
          <p className="text-xs text-gray-400">
            Paging · Segmentation · Segmentation + Paging
          </p>
        </div>

        <select
          value={state.strategy}
          onChange={handleStrategyChange}
          className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
        >
          {VM_STRATEGIES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Strategy note */}
      <div className="text-xs bg-blue-50 text-blue-700 rounded-lg px-3 py-2">
        {getStrategyNote(state.strategy)}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Virtual used", value: `${metrics.logicalUsed} KB` },
          { label: "RAM used", value: `${metrics.ramUsed} KB` },
          { label: "SSD/Page file", value: `${metrics.ssdUsed} KB` },
          {
            label: "Page faults",
            value: metrics.pageFaults,
            highlight: metrics.pageFaults > 0,
          },
        ].map((m) => (
          <div key={m.label} className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-0.5">{m.label}</div>
            <div
              className={`text-lg font-medium ${
                m.highlight ? "text-orange-500" : "text-gray-800"
              }`}
            >
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Fragmentation metrics */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-0.5">
            Internal fragmentation
          </div>
          <div className="text-sm font-medium text-gray-700">
            {metrics.internalWaste} KB ({metrics.internalFragmentation}%)
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-0.5">
            External fragmentation
          </div>
          <div className="text-sm font-medium text-gray-700">
            {metrics.externalFragmentation}%
          </div>
        </div>
      </div>

      {/* Virtual address space */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">
          Virtual address space — mỗi process nhìn thấy vùng nhớ ảo riêng
        </p>

        <div className="bg-indigo-50 rounded-lg p-2 flex flex-wrap gap-1 min-h-12">
          {state.virtualItems.length === 0 ? (
            <p className="text-xs text-indigo-300 py-2 px-2">
              Chưa có virtual page/segment nào
            </p>
          ) : (
            state.virtualItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleAccessItem(item.id)}
                title={
                  item.location === "ram"
                    ? `${getSsdLabel(item)} đang nằm trong RAM`
                    : `${getSsdLabel(item)} đang nằm ở SSD/Page File — click để access`
                }
                className={`h-9 rounded px-2 text-[11px] font-medium border transition-colors ${
                  item.location === "ram"
                    ? "bg-white border-indigo-200 text-indigo-700"
                    : "bg-indigo-100 border-indigo-200 text-indigo-400 hover:bg-indigo-200"
                }`}
              >
                {getSsdLabel(item)}
                <span className="ml-1 opacity-60">
                  {item.location === "ram" ? "RAM" : "SSD"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Physical RAM */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">
          Physical RAM — {state.totalMemory} KB total · page/frame size:{" "}
          {state.pageSize} KB
        </p>

        <div className="bg-gray-50 rounded-lg p-2 flex flex-wrap gap-1 min-h-12">
          {state.blocks.map((block) => {
            const pct = (block.size / state.totalMemory) * 100;
            const isFree = !block.processId;

            return (
              <div
                key={block.id}
                onClick={() => !isFree && handleFree(block.processId)}
                title={getRamTitle(state, block)}
                style={{
                  width: `calc(${pct}% - 4px)`,
                  minWidth: state.strategy === "segmentation" ? 28 : 42,
                  background: isFree ? undefined : block.color?.bg,
                  color: isFree ? undefined : block.color?.text,
                }}
                className={`h-10 rounded flex items-center justify-center text-[11px] font-medium select-none transition-opacity px-1 ${
                  isFree
                    ? "border border-dashed border-gray-300 text-gray-300"
                    : "cursor-pointer hover:opacity-75"
                }`}
              >
                {getRamLabel(state, block)}
              </div>
            );
          })}
        </div>
      </div>

      {/* External SSD / Page File */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">
          External SSD / Page File — page/segment chưa nằm trong RAM
        </p>

        <div className="bg-slate-100 rounded-lg p-2 flex flex-wrap gap-1 min-h-12">
          {state.virtualItems.filter((item) => item.location === "ssd")
            .length === 0 ? (
            <p className="text-xs text-slate-400 py-2 px-2">
              SSD/Page File đang trống hoặc mọi page đã nằm trong RAM
            </p>
          ) : (
            state.virtualItems
              .filter((item) => item.location === "ssd")
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleAccessItem(item.id)}
                  title={`${getSsdLabel(item)} đang ở SSD/Page File — click để tạo page fault và nạp vào RAM`}
                  style={{
                    borderColor: item.color?.bg,
                    color: item.color?.text,
                  }}
                  className="h-9 rounded px-2 text-[11px] font-medium bg-white border hover:bg-slate-50 transition-colors"
                >
                  {getSsdLabel(item)}
                </button>
              ))
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-3">
        {/* Allocate panel */}
        <div className="bg-gray-50 rounded-lg p-3 space-y-2.5">
          <p className="text-xs font-medium text-gray-700">
            Cấp phát process mới
          </p>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-20 shrink-0">
              Tên process
            </span>
            <input
              type="text"
              value={processName}
              onChange={(e) => setProcessName(e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white w-20"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-20 shrink-0">
              Kích thước
            </span>
            <input
              type="range"
              min={2}
              max={24}
              step={2}
              value={processSize}
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
          <p className="text-xs font-medium text-gray-700 mb-2">
            Processes đang chạy
          </p>

          <div className="space-y-1 max-h-36 overflow-y-auto">
            {state.processes.length === 0 ? (
              <p className="text-xs text-gray-300 py-2 text-center">
                Chưa có process nào
              </p>
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

                  <span className="flex-1 font-medium text-gray-700">
                    {p.name}
                  </span>

                  <span className="text-gray-400">{p.size} KB</span>

                  <button
                    onClick={() => handleAccessProcess(p.id)}
                    className="text-blue-500 hover:text-blue-700 transition-colors ml-1"
                  >
                    Access
                  </button>

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

      {/* Presets */}
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

      {/* Mapping table */}
      <div className="bg-gray-50 rounded-lg p-3">
        <p className="text-xs font-medium text-gray-700 mb-2">Mapping table</p>

        <div className="space-y-1 max-h-40 overflow-y-auto">
          {state.processes.length === 0 ? (
            <p className="text-xs text-gray-300 text-center py-2">
              Chưa có bảng ánh xạ
            </p>
          ) : (
            state.processes.map((p) => {
              const items = state.virtualItems.filter(
                (item) => item.processId === p.id
              );

              return (
                <div
                  key={p.id}
                  className="text-xs bg-white rounded border border-gray-100 p-2"
                >
                  <div className="font-medium text-gray-700 mb-1">
                    {p.name}
                  </div>

                  {items.map((item) => (
                    <div key={item.id} className="text-gray-500">
                      {getSsdLabel(item)} · Virtual {item.virtualStart} KB →{" "}
                      {item.location === "ram"
                        ? state.strategy === "segmentation"
                          ? `RAM ${item.ramStart} KB`
                          : `Frame ${item.frameIndex}`
                        : "SSD/Page File"}
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Event log */}
      <div>
        <p className="text-xs font-medium text-gray-700 mb-1.5">Event log</p>

        <div className="space-y-1 max-h-32 overflow-y-auto">
          {state.events.length === 0 ? (
            <p className="text-xs text-gray-300 text-center py-2">
              Chưa có sự kiện nào
            </p>
          ) : (
            [...state.events].reverse().map((e, i) => (
              <div
                key={i}
                className={`text-xs px-2.5 py-1.5 rounded-md ${
                  e.type === "allocate"
                    ? "bg-green-50 text-green-700"
                    : e.type === "free"
                    ? "bg-gray-100 text-gray-500"
                    : e.type === "page-fault"
                    ? "bg-orange-50 text-orange-700"
                    : e.type === "swap-in"
                    ? "bg-blue-50 text-blue-700"
                    : e.type === "swap-out"
                    ? "bg-purple-50 text-purple-700"
                    : e.type === "hit"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-600"
                }`}
              >
                {e.type === "allocate" && `✓ ${e.detail}`}
                {e.type === "free" && `○ ${e.detail}`}
                {e.type === "page-fault" && `⚠ ${e.detail}`}
                {e.type === "swap-in" && `⇣ ${e.detail}`}
                {e.type === "swap-out" && `⇡ ${e.detail}`}
                {e.type === "hit" && `✓ ${e.detail}`}
                {e.type === "fail" && `✕ ${e.detail || e.reason}`}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}