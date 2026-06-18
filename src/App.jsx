// App.jsx
import { useState } from "react";
import PagingTab        from "./simulators/paging/PagingTab";
import SegmentationTab  from "./simulators/segmentation/SegmentationTab";
import VirtualMemoryTab from "./simulators/virtualMemory/VirtualMemoryTab";

const TABS = [
  { id: "paging",     label: "Paging",         component: PagingTab },
  { id: "seg",        label: "Segmentation",   component: SegmentationTab },
  { id: "vm",         label: "Virtual Memory", component: VirtualMemoryTab },
];

export default function App() {
  const [active, setActive] = useState("paging");
  const ActiveComponent = TABS.find((t) => t.id === active)?.component;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-medium text-gray-800">
            Memory Management Simulator
          </h1>
          <p className="text-sm text-gray-400">Operating Systems · Group X</p>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`px-5 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                active === tab.id
                  ? "border-blue-500 text-blue-600 font-medium"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-white rounded-b-xl rounded-tr-xl border border-t-0 border-gray-200 min-h-64">
          {ActiveComponent && <ActiveComponent />}
        </div>

      </div>
    </div>
  );
}
