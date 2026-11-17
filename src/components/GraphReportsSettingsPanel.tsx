import { Download, GitBranch, Moon, Sun } from 'lucide-react';
import { ApkProject, FeatureMatrixItem, SearchResult } from '../types/xray';
import {
  downloadBlob,
  exportFullReportZip,
  generateFileInventoryCsv,
  generateHtmlReport,
  generateSummaryJson,
  generateSummaryTxt,
} from '../engines/reportExporter';

const FEATURE_MATRIX: FeatureMatrixItem[] = [
  {
    area: 'Archive & Split Bundles',
    feature: 'APK / APKS / XAPK / AAB / ZIP unpacking with ZIP-bomb & path-traversal protection',
    status: 'TESTED',
    notes: 'Executed via fflate with 512MB safety cap and directory hierarchy preservation.',
  },
  {
    area: 'Project Explorer',
    feature: 'Virtualized hierarchical IDE tree, single-line filenames, folder & file long-press context menu, streaming folder ZIP export',
    status: 'TESTED',
    notes: 'Supports 10,000+ entries, folder size/count stats, multi-selection, bookmarks, and recent files.',
  },
  {
    area: 'Manifest Inspector',
    feature: 'Binary XML (AXML) decoding, resource ID resolution, component/permission/deep-link extraction & security audit',
    status: 'TESTED',
    notes: 'Pure TypeScript ResXMLTree parser tested on generated reference AXML.',
  },
  {
    area: 'DEX & Smali Analyzer',
    feature: 'Multidex header, string/type/field/method tables, Smali disassembly & reconstructed Java pseudocode',
    status: 'TESTED',
    notes: 'Covers core Dalvik opcodes; clearly distinguishes reconstructed pseudocode from original source.',
  },
  {
    area: 'Resource Inspector',
    feature: 'Binary resources.arsc parsing with density/language/night-mode config qualifiers',
    status: 'TESTED',
    notes: 'Resolves @0x7f...... references across manifest and XML views.',
  },
  {
    area: 'Native ELF Inspector',
    feature: 'ELF32/64 header, sections, segments, DT_NEEDED, Build ID, imported/exported symbols & strings',
    status: 'TESTED',
    notes: 'Supports ARM32, ARM64, x86, and x86_64 binaries.',
  },
  {
    area: 'SQLite Database Inspector',
    feature: 'Read-only SQLite 3 inspection (tables, columns, indexes, views, triggers, SQL queries, CSV/JSON export)',
    status: 'TESTED',
    notes: 'Powered by local WebAssembly sql-wasm.wasm.',
  },
  {
    area: 'Universal Detection & Hex',
    feature: 'Magic-byte detection, Shannon entropy, Hex/ASCII/UTF-16LE inspector, string extractor, media/font/SVG previews',
    status: 'TESTED',
    notes: 'Fallback Universal Binary Inspector activates for unknown formats.',
  },
  {
    area: 'Installed Device Apps / Runtime Logcat / MediaProjection',
    feature: 'Direct Android PackageManager enumeration, runtime screen capture, and live process inspection',
    status: 'BLOCKED BY ANDROID RESTRICTIONS',
    notes: 'Running in a browser web workstation runtime without Android OS PackageManager/ADB access; import exported APKs via file picker.',
  },
  {
    area: 'Native Android Studio APK Build',
    feature: 'Compiling Kotlin/Compose .apk via Gradle in this container',
    status: 'UNSUPPORTED',
    notes: 'No Android SDK, JDK, or Gradle toolchain exists in this Node/Vite web runtime.',
  },
];

export function GraphReportsSettingsPanel({
  mode,
  project,
  searchResults,
  onJumpToNode,
  darkMode,
  onToggleDarkMode,
  wordWrap,
  onToggleWordWrap,
  showLineNumbers,
  onToggleLineNumbers,
  splitViewEnabled,
  onToggleSplitView,
}: {
  mode: 'graph-reports' | 'settings';
  project: ApkProject | null;
  searchResults: SearchResult[];
  onJumpToNode: (path: string, line?: number) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  wordWrap: boolean;
  onToggleWordWrap: () => void;
  showLineNumbers: boolean;
  onToggleLineNumbers: () => void;
  splitViewEnabled: boolean;
  onToggleSplitView: () => void;
}) {
  if (mode === 'graph-reports') {
    if (!project) {
      return (
        <div className="p-8 text-center text-xs text-[#7A816E]">
          Import an APK first to view its Component Architecture Graph and export reports.
        </div>
      );
    }

    const { nodes, edges } = project.graph;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6 overflow-y-auto overflow-x-hidden h-full">
        {/* Interactive Component Architecture Graph */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-[#9BB848]" /> Interactive Architecture Graph
              </h2>
              <p className="text-xs text-[#5A6050] dark:text-[#9CA38F]">
                Click any discovered node to jump directly to its Manifest declaration, DEX file, ELF library, or resource table.
              </p>
            </div>
          </div>

          <div className="border border-black/10 dark:border-white/[0.08] rounded-xl bg-white dark:bg-[#181B14] overflow-x-auto p-3">
            <svg viewBox="0 0 920 540" className="w-full min-w-[720px] h-[420px]">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 1 L 8 5 L 0 9 z" fill="#7A816E" />
                </marker>
              </defs>
              {edges.map((edge, idx) => {
                const a = nodeMap.get(edge.from);
                const b = nodeMap.get(edge.to);
                if (!a || !b) return null;
                return (
                  <g key={idx}>
                    <line
                      x1={a.x}
                      y1={a.y + 24}
                      x2={b.x}
                      y2={b.y - 24}
                      stroke="rgba(155, 184, 72, 0.35)"
                      strokeWidth="1.5"
                      markerEnd="url(#arrow)"
                    />
                  </g>
                );
              })}

              {nodes.map((node) => {
                const strokeColor =
                  node.kind === 'app'
                    ? '#9BB848'
                    : node.kind === 'native'
                      ? '#F43F5E'
                      : node.kind === 'dex-pkg'
                        ? '#F59E0B'
                        : '#38BDF8';
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={() => node.targetPath && onJumpToNode(node.targetPath, node.lineNumber)}
                    className="cursor-pointer"
                  >
                    <rect
                      x="-74"
                      y="-24"
                      width="148"
                      height="48"
                      rx="8"
                      fill={darkMode ? '#22261C' : '#F4F6EF'}
                      stroke={strokeColor}
                      strokeWidth="1.4"
                    />
                    <text
                      textAnchor="middle"
                      y="-4"
                      fill={darkMode ? '#E4E6DD' : '#181A14'}
                      fontSize="11"
                      fontWeight="600"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {node.label.slice(0, 20)}
                    </text>
                    <text
                      textAnchor="middle"
                      y="13"
                      fill={darkMode ? '#9CA38F' : '#5A6050'}
                      fontSize="9.5"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                    >
                      {node.subtitle.slice(0, 24)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Multi-Format Export & Reports */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Export Inspection Reports</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 text-xs">
            <button
              type="button"
              onClick={() => downloadBlob(`${project.fileName}-summary.txt`, generateSummaryTxt(project), 'text/plain')}
              className="px-3 py-2.5 rounded-lg border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-1.5 font-medium"
            >
              <Download className="w-3.5 h-3.5" /> TXT Summary
            </button>
            <button
              type="button"
              onClick={() => downloadBlob(`${project.fileName}-report.json`, generateSummaryJson(project), 'application/json')}
              className="px-3 py-2.5 rounded-lg border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-1.5 font-medium"
            >
              <Download className="w-3.5 h-3.5" /> JSON Data
            </button>
            <button
              type="button"
              disabled={!project.manifest}
              onClick={() =>
                project.manifest &&
                downloadBlob('AndroidManifest.decoded.xml', project.manifest.rawXml, 'application/xml')
              }
              className="px-3 py-2.5 rounded-lg border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-1.5 font-medium disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" /> Manifest XML
            </button>
            <button
              type="button"
              onClick={() => downloadBlob(`${project.fileName}-inventory.csv`, generateFileInventoryCsv(project), 'text/csv')}
              className="px-3 py-2.5 rounded-lg border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-1.5 font-medium"
            >
              <Download className="w-3.5 h-3.5" /> CSV Inventory
            </button>
            <button
              type="button"
              onClick={() => downloadBlob(`${project.fileName}-report.html`, generateHtmlReport(project), 'text/html')}
              className="px-3 py-2.5 rounded-lg border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-1.5 font-medium"
            >
              <Download className="w-3.5 h-3.5" /> HTML Report
            </button>
            <button
              type="button"
              onClick={() => exportFullReportZip(project, searchResults)}
              className="px-3 py-2.5 rounded-lg bg-[#465D18] text-white flex items-center justify-center gap-1.5 font-semibold"
            >
              <Download className="w-3.5 h-3.5" /> Full ZIP
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Settings & Feature Implementation / Compatibility Matrix
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6 overflow-y-auto overflow-x-hidden h-full">
      <div>
        <h2 className="text-lg font-bold">Workstation Settings &amp; Implementation Matrix</h2>
        <p className="text-xs text-[#5A6050] dark:text-[#9CA38F] mt-1">
          Configure IDE appearance, editor behavior, and review verified capabilities and Android OS boundary status.
        </p>
      </div>

      <div className="border border-black/10 dark:border-white/[0.08] rounded-xl divide-y divide-black/5 dark:divide-white/[0.06] bg-white dark:bg-[#181B14] text-xs">
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold">Color Theme</div>
            <div className="text-[#7A816E]">Switch between Material 3 Dark Olive and Light Stone themes.</div>
          </div>
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="px-3 py-1.5 rounded-lg border border-black/15 dark:border-white/15 flex items-center gap-1.5 font-medium whitespace-nowrap shrink-0"
          >
            {darkMode ? <Moon className="w-3.5 h-3.5 text-[#9BB848]" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
            {darkMode ? 'Dark Mode' : 'Light Mode'}
          </button>
        </div>

        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">Split-View Project Explorer</div>
            <div className="text-[#7A816E]">Keep Project Tree pinned beside the Editor on tablets and desktops.</div>
          </div>
          <input type="checkbox" checked={splitViewEnabled} onChange={onToggleSplitView} className="accent-[#465D18] w-4 h-4" />
        </div>

        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">Editor Word Wrap</div>
            <div className="text-[#7A816E]">Wrap long lines inside decoded code &amp; XML viewers.</div>
          </div>
          <input type="checkbox" checked={wordWrap} onChange={onToggleWordWrap} className="accent-[#465D18] w-4 h-4" />
        </div>

        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">Show Line Numbers</div>
            <div className="text-[#7A816E]">Display tabular line numbers in code and XML editors.</div>
          </div>
          <input type="checkbox" checked={showLineNumbers} onChange={onToggleLineNumbers} className="accent-[#465D18] w-4 h-4" />
        </div>
      </div>

      {/* Honest Feature Implementation Matrix */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Feature Implementation &amp; Android 11–16 Compatibility Matrix</h3>
        <div className="border border-black/10 dark:border-white/[0.08] rounded-xl overflow-hidden bg-white dark:bg-[#181B14]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#ECEFE6] dark:bg-[#1E2219] border-b border-black/10 dark:border-white/[0.08]">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Module</th>
                  <th className="px-3 py-2.5 font-semibold">Capability</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Verification Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/[0.05]">
                {FEATURE_MATRIX.map((row) => (
                  <tr key={row.feature}>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{row.area}</td>
                    <td className="px-3 py-2.5">{row.feature}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap">
                      <span
                        className={
                          row.status === 'TESTED'
                            ? 'text-emerald-500'
                            : row.status === 'BLOCKED BY ANDROID RESTRICTIONS'
                              ? 'text-amber-500'
                              : 'text-rose-400'
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[#5A6050] dark:text-[#9CA38F]">{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
