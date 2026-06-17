import { useState, useCallback } from "react";
import {
  VM_STRATEGIES,
  REPLACEMENT_POLICIES,
  createInitialState,
  allocate,
  accessItem,
  accessProcess,
  freeProcess,
  getMetrics,
  runFragmentationDemo,
  runRandomWorkload,
  runReferenceString,
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
    return `Free - ${block.size} KB at ${block.start} KB`;
  }

  if (item.kind === "page") {
    return `${item.processName} - virtual page ${item.pageIndex} -> frame ${block.frameIndex} - RAM ${block.start} KB`;
  }

  if (item.kind === "segment-page") {
    return `${item.processName} - segment ${item.segmentName}, page ${item.segmentPageIndex} -> frame ${block.frameIndex}`;
  }

  return `${item.processName} - segment ${item.segmentName} - RAM ${block.start} KB`;
}

function getStrategyNote(strategy) {
  if (strategy === "paging") {
    return "Demand paging creates virtual pages in the SSD/Page File and loads a page into a RAM frame only when it is accessed.";
  }

  if (strategy === "segmentation") {
    return "Demand segmentation creates virtual segments in the SSD/Page File and loads each segment into one contiguous RAM block.";
  }

  return "Segmented paging creates segments, divides each segment into pages, and loads segment-pages into RAM frames on demand.";
}

function getPolicyNote(policy) {
  if (policy === "opt") {
    return "OPT replaces the resident item whose next use is farthest away in the reference string.";
  }

  if (policy === "lru") {
    return "LRU replaces the resident item that has not been accessed for the longest time.";
  }

  return "FIFO replaces the resident item that entered RAM earliest.";
}

function splitReferenceTokens(value) {
  return value.trim().split(/[\s,;]+/).filter(Boolean);
}

function findItemByReference(items, token) {
  const normalized = token.trim().toLowerCase();
  return items.find((item) => getSsdLabel(item).toLowerCase() === normalized);
}

function getEventClass(type) {
  if (type === "allocate") return "bg-green-50 text-green-700";
  if (type === "free") return "bg-gray-100 text-gray-500";
  if (type === "page-fault") return "bg-orange-50 text-orange-700";
  if (type === "swap-in") return "bg-blue-50 text-blue-700";
  if (type === "swap-out") return "bg-purple-50 text-purple-700";
  if (type === "hit") return "bg-emerald-50 text-emerald-700";
  if (type === "fail") return "bg-red-50 text-red-600";
  return "bg-gray-50 text-gray-600";
}

function getEventTag(type) {
  if (type === "allocate") return "ALLOC";
  if (type === "free") return "FREE";
  if (type === "page-fault") return "FAULT";
  if (type === "swap-in") return "IN";
  if (type === "swap-out") return "OUT";
  if (type === "hit") return "HIT";
  if (type === "fail") return "FAIL";
  return "INFO";
}

export default function VirtualMemoryTab() {
  const [state, setState] = useState(() => createInitialState(64, "paging"));
  const [processName, setProcessName] = useState("P1");
  const [processSize, setProcessSize] = useState(8);
  const [accessSequence, setAccessSequence] = useState("");
  const [sequenceError, setSequenceError] = useState("");

  const metrics = getMetrics(state);

  const handleStrategyChange = useCallback((e) => {
    const strategy = e.target.value;

    setState((current) =>
      createInitialState(
        current.totalMemory,
        strategy,
        current.pageSize,
        current.replacementPolicy
      )
    );
    setProcessName("P1");
    setAccessSequence("");
    setSequenceError("");
  }, []);

  const handlePolicyChange = useCallback((replacementPolicy) => {
    setState((current) => ({
      ...current,
      replacementPolicy,
    }));
  }, []);

  const handleAllocate = useCallback(() => {
    const name = processName.trim() || "P?";
    setState((s) => allocate(s, name, processSize));
    setSequenceError("");

    const idx = PROCESS_NAMES.indexOf(processName);
    if (idx >= 0 && idx < PROCESS_NAMES.length - 1) {
      setProcessName(PROCESS_NAMES[idx + 1]);
    }
  }, [processName, processSize]);

  const handleAccessProcess = useCallback((pid) => {
    setState((s) => accessProcess(s, pid));
    setSequenceError("");
  }, []);

  const handleAccessItem = useCallback((itemId) => {
    setState((s) => accessItem(s, itemId));
    setSequenceError("");
  }, []);

  const handleFree = useCallback((pid) => {
    setState((s) => freeProcess(s, pid));
    setSequenceError("");
  }, []);

  const handleReset = useCallback(() => {
    setState((current) =>
      createInitialState(
        current.totalMemory,
        current.strategy,
        current.pageSize,
        current.replacementPolicy
      )
    );
    setProcessName("P1");
    setAccessSequence("");
    setSequenceError("");
  }, []);

  const handlePresetFrag = useCallback(() => {
    setState((current) =>
      runFragmentationDemo(
        current.totalMemory,
        current.strategy,
        current.replacementPolicy
      )
    );
    setProcessName("P6");
    setAccessSequence("");
    setSequenceError("");
  }, []);

  const handlePresetRandom = useCallback(() => {
    setState((current) =>
      runRandomWorkload(
        current.totalMemory,
        current.strategy,
        current.replacementPolicy
      )
    );
    setProcessName("P6");
    setAccessSequence("");
    setSequenceError("");
  }, []);

  const handleAppendReference = useCallback((label) => {
    setAccessSequence((current) => {
      const trimmed = current.trim();
      return trimmed ? `${trimmed} ${label}` : label;
    });
    setSequenceError("");
  }, []);

  const handleRunSequence = useCallback(() => {
    const tokens = splitReferenceTokens(accessSequence);

    if (tokens.length === 0) {
      setSequenceError("Enter a reference string first.");
      return;
    }

    if (state.virtualItems.length === 0) {
      setSequenceError("Allocate at least one process before running a reference string.");
      return;
    }

    const missing = [];
    const itemIds = tokens.map((token) => {
      const item = findItemByReference(state.virtualItems, token);
      if (!item) missing.push(token);
      return item?.id;
    });

    if (missing.length > 0) {
      setSequenceError(`Unknown reference: ${missing.join(", ")}`);
      return;
    }

    setState((current) => runReferenceString(current, itemIds));
    setSequenceError("");
  }, [accessSequence, state.virtualItems]);

  const referenceLabels = state.virtualItems.map((item) => getSsdLabel(item));

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-medium text-gray-800">Virtual Memory</h2>
          <p className="text-xs text-gray-400">
            Demand paging, page faults, and page replacement
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
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

          <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5">
            {REPLACEMENT_POLICIES.map((policy) => (
              <button
                key={policy.value}
                type="button"
                onClick={() => handlePolicyChange(policy.value)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  state.replacementPolicy === policy.value
                    ? "bg-blue-500 text-white"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {policy.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="text-xs bg-blue-50 text-blue-700 rounded-lg px-3 py-2">
          {getStrategyNote(state.strategy)}
        </div>
        <div className="text-xs bg-indigo-50 text-indigo-700 rounded-lg px-3 py-2">
          {getPolicyNote(state.replacementPolicy)}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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

      <div>
        <p className="text-xs text-gray-400 mb-1.5">
          Virtual address space - each process owns a private virtual memory area
        </p>

        <div className="bg-indigo-50 rounded-lg p-2 flex flex-wrap gap-1 min-h-12">
          {state.virtualItems.length === 0 ? (
            <p className="text-xs text-indigo-300 py-2 px-2">
              No virtual pages or segments yet
            </p>
          ) : (
            state.virtualItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleAccessItem(item.id)}
                title={
                  item.location === "ram"
                    ? `${getSsdLabel(item)} is resident in RAM`
                    : `${getSsdLabel(item)} is in the SSD/Page File`
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

      <div className="bg-gray-50 rounded-lg p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-gray-700">Reference string</p>
          <button
            type="button"
            onClick={handleRunSequence}
            className="text-xs py-1 px-3 border border-gray-200 rounded-md bg-white hover:bg-gray-100 transition-colors"
          >
            Run sequence
          </button>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={accessSequence}
            onChange={(e) => {
              setAccessSequence(e.target.value);
              setSequenceError("");
            }}
            placeholder="P1:P0 P2:P0 P1:P1"
            className="flex-1 min-w-0 text-xs border border-gray-200 rounded px-2 py-1.5 bg-white"
          />
          <button
            type="button"
            onClick={() => {
              setAccessSequence("");
              setSequenceError("");
            }}
            className="text-xs py-1.5 px-3 border border-gray-200 rounded-md bg-white hover:bg-gray-100 transition-colors"
          >
            Clear
          </button>
        </div>

        {sequenceError && (
          <p className="text-xs text-red-500">{sequenceError}</p>
        )}

        {referenceLabels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {referenceLabels.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => handleAppendReference(label)}
                className="text-[11px] px-2 py-1 rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs text-gray-400 mb-1.5">
          Physical RAM - {state.totalMemory} KB total, {state.pageSize} KB page/frame size
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

      <div>
        <p className="text-xs text-gray-400 mb-1.5">
          External SSD / Page File - items not currently resident in RAM
        </p>

        <div className="bg-slate-100 rounded-lg p-2 flex flex-wrap gap-1 min-h-12">
          {state.virtualItems.filter((item) => item.location === "ssd")
            .length === 0 ? (
            <p className="text-xs text-slate-400 py-2 px-2">
              SSD/Page File is empty or all items are already resident in RAM
            </p>
          ) : (
            state.virtualItems
              .filter((item) => item.location === "ssd")
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleAccessItem(item.id)}
                  title={`${getSsdLabel(item)} is in the SSD/Page File`}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 space-y-2.5">
          <p className="text-xs font-medium text-gray-700">
            Allocate new process
          </p>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-24 shrink-0">
              Process name
            </span>
            <input
              type="text"
              value={processName}
              onChange={(e) => setProcessName(e.target.value)}
              className="flex-1 min-w-0 text-xs border border-gray-200 rounded px-2 py-1 bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-24 shrink-0">Size</span>
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
              type="button"
              onClick={handleAllocate}
              className="flex-1 text-xs py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-100 transition-colors"
            >
              Allocate
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs py-1.5 px-3 border border-gray-200 rounded-md bg-white hover:bg-gray-100 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-700 mb-2">
            Running processes
          </p>

          <div className="space-y-1 max-h-36 overflow-y-auto">
            {state.processes.length === 0 ? (
              <p className="text-xs text-gray-300 py-2 text-center">
                No running processes
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

                  <span className="flex-1 font-medium text-gray-700 truncate">
                    {p.name}
                  </span>

                  <span className="text-gray-400">{p.size} KB</span>

                  <button
                    type="button"
                    onClick={() => handleAccessProcess(p.id)}
                    className="text-blue-500 hover:text-blue-700 transition-colors ml-1"
                  >
                    Access
                  </button>

                  <button
                    type="button"
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

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handlePresetFrag}
          className="flex-1 text-xs py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50 transition-colors"
        >
          Fragmentation demo
        </button>

        <button
          type="button"
          onClick={handlePresetRandom}
          className="flex-1 text-xs py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50 transition-colors"
        >
          Random workload
        </button>
      </div>

      <div className="bg-gray-50 rounded-lg p-3">
        <p className="text-xs font-medium text-gray-700 mb-2">Mapping table</p>

        <div className="space-y-1 max-h-40 overflow-y-auto">
          {state.processes.length === 0 ? (
            <p className="text-xs text-gray-300 text-center py-2">
              No mapping entries yet
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
                      {getSsdLabel(item)} - Virtual {item.virtualStart} KB -{" "}
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

      <div>
        <p className="text-xs font-medium text-gray-700 mb-1.5">Event log</p>

        <div className="space-y-1 max-h-32 overflow-y-auto">
          {state.events.length === 0 ? (
            <p className="text-xs text-gray-300 text-center py-2">
              No events yet
            </p>
          ) : (
            [...state.events].reverse().map((e, i) => (
              <div
                key={`${e.timestamp}-${i}`}
                className={`text-xs px-2.5 py-1.5 rounded-md ${getEventClass(
                  e.type
                )}`}
              >
                <span className="font-semibold mr-1">{getEventTag(e.type)}</span>
                {e.detail || e.reason}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
