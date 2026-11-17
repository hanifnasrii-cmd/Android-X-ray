import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Search,
  WrapText,
  X,
} from 'lucide-react';
import { ApkEntry, ApkProject, EditorTab } from '../types/xray';
import { decodeBinaryXml } from '../engines/axmlDecoder';
import { downloadBlob } from '../engines/reportExporter';
import { FileBadge, formatBytes } from './FileBadge';
import { HexInspector } from './HexInspector';
import { SqliteViewer } from './SqliteViewer';
import { MediaPreview } from './MediaPreview';
import { ExplanationPanel } from './ExplanationPanel';

interface EditorWorkspaceProps {
  project: ApkProject;
  tabs: EditorTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onChangeTabMode: (id: string, mode: EditorTab['viewMode']) => void;
  onBackToTree: () => void;
  onJumpToFile: (path: string) => void;
  wordWrap: boolean;
  onToggleWordWrap: () => void;
  showLineNumbers: boolean;
}

export function EditorWorkspace({
  project,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onChangeTabMode,
  onBackToTree,
  onJumpToFile,
  wordWrap,
  onToggleWordWrap,
  showLineNumbers,
}: EditorWorkspaceProps) {
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0] || null;
  const entry: ApkEntry | undefined = activeTab ? project.entryMap.get(activeTab.path) : undefined;

  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findMatchIdx, setFindMatchIdx] = useState(0);
  const [gotoLineInput, setGotoLineInput] = useState('');
  const codeContainerRef = useRef<HTMLDivElement>(null);

  const decodedContent = useMemo(() => {
    if (!entry) return '';
    const cat = entry.format.category;

    if (cat === 'manifest' && project.manifest) {
      return project.manifest.rawXml;
    }
    if (cat === 'axml') {
      return decodeBinaryXml(entry.bytes, project.resourceTable).xml;
    }
    if (cat === 'dex') {
      const dex = project.dexFiles.find((d) => d.filePath === entry.path);
      if (!dex) return '// DEX file could not be parsed.';
      if (activeTab?.viewMode === 'java') {
        return dex.classes.slice(0, 120).map((c) => c.pseudocodeText).join('\n\n') || '// No classes decoded.';
      }
      return (
        dex.classes.slice(0, 120).map((c) => c.smaliText).join('\n\n') ||
        `# DEX v${dex.version} (${dex.classDefCount} classes, ${dex.methodCount} methods)`
      );
    }
    if (cat === 'arsc' && project.resourceTable) {
      return project.resourceTable.entries
        .slice(0, 2000)
        .map(
          (r) =>
            `${r.idHex}  ${r.reference.padEnd(32)}  ${r.values.map((v) => `[${v.configLabel}] ${v.value}`).join(' | ')}`
        )
        .join('\n');
    }
    if (cat === 'elf') {
      const elf = project.elfFiles.find((e) => e.filePath === entry.path);
      if (!elf) return '// ELF header unreadable.';
      return [
        `ELF ${elf.bits}-bit ${elf.endianness} | ${elf.machine} (${elf.abiGuess})`,
        `Type: ${elf.elfType} | Entry: ${elf.entryPoint} | Build ID: ${elf.buildId}`,
        `Needed Libraries: ${elf.neededLibraries.join(', ') || 'None'}`,
        ``,
        `--- SECTIONS (${elf.sections.length}) ---`,
        ...elf.sections.map((s) => `${s.name.padEnd(24)} ${s.type.padEnd(14)} addr=${s.addr} size=${s.size}`),
        ``,
        `--- EXPORTED SYMBOLS (${elf.exportedSymbols.length}) ---`,
        ...elf.exportedSymbols.slice(0, 200).map((s) => `${s.value.padEnd(14)} ${s.type.padEnd(8)} ${s.name}`),
        ``,
        `--- IMPORTED SYMBOLS (${elf.importedSymbols.length}) ---`,
        ...elf.importedSymbols.slice(0, 200).map((s) => `${s.binding.padEnd(8)} ${s.type.padEnd(8)} ${s.name}`),
      ].join('\n');
    }
    if (cat === 'cert') {
      const cert = project.certificates.find((c) => c.filePath === entry.path);
      if (cert) {
        return [
          `Certificate Type: ${cert.type}`,
          `Algorithms: ${cert.algorithms.join(', ') || 'Unknown'}`,
          cert.subjectStrings.length ? `Subject Strings:\n  ${cert.subjectStrings.join('\n  ')}` : '',
          '',
          cert.rawPreview,
        ]
          .filter(Boolean)
          .join('\n');
      }
    }
    if (entry.format.isText) {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(entry.bytes.subarray(0, 2 * 1024 * 1024));
      if (entry.format.language === 'json') {
        try {
          return JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          return text;
        }
      }
      return text;
    }
    return '';
  }, [entry, project, activeTab?.viewMode]);

  const lines = useMemo(() => (decodedContent ? decodedContent.split('\n') : []), [decodedContent]);

  const findMatches = useMemo(() => {
    if (!findQuery.trim()) return [];
    const q = findQuery.toLowerCase();
    const matchedLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) matchedLines.push(i + 1);
    }
    return matchedLines;
  }, [lines, findQuery]);

  const scrollToLine = (lineNum: number) => {
    if (!codeContainerRef.current) return;
    const target = codeContainerRef.current.querySelector(`[data-line="${lineNum}"]`) as HTMLElement | null;
    if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeTab?.targetLine) {
      setTimeout(() => scrollToLine(activeTab.targetLine!), 60);
    }
  }, [activeTab?.id, activeTab?.targetLine]);

  if (!activeTab || !entry) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-2">
          <div className="text-sm font-semibold">No File Open</div>
          <p className="text-xs text-[#7A816E]">
            Select any file in the Project Explorer tree to decode, disassemble, preview, or inspect its raw binary structure.
          </p>
        </div>
      </div>
    );
  }

  const availableModes: Array<{ id: EditorTab['viewMode']; label: string }> = [];
  if (entry.format.category === 'dex') {
    availableModes.push({ id: 'smali', label: 'Smali' }, { id: 'java', label: 'Reconstructed Java' });
  } else if (entry.format.category === 'sqlite') {
    availableModes.push({ id: 'sqlite', label: 'SQLite Inspector' });
  } else if (entry.format.category === 'elf') {
    availableModes.push({ id: 'decoded', label: 'ELF Analysis' });
  } else if (
    entry.format.category === 'image' ||
    entry.format.category === 'audio' ||
    entry.format.category === 'video' ||
    entry.format.category === 'font' ||
    entry.format.category === 'archive' ||
    entry.format.category === 'document'
  ) {
    availableModes.push({ id: 'preview', label: 'Preview' });
    if (entry.format.isText) availableModes.push({ id: 'decoded', label: 'Source' });
  } else if (entry.format.isText || entry.format.category === 'manifest' || entry.format.category === 'axml' || entry.format.category === 'arsc' || entry.format.category === 'cert') {
    availableModes.push({ id: 'decoded', label: 'Decoded' });
    if (entry.format.category === 'xml' && decodedContent.includes('<vector')) {
      availableModes.push({ id: 'preview', label: 'Vector Preview' });
    }
  }
  availableModes.push({ id: 'hex', label: 'Hex' }, { id: 'metadata', label: 'Metadata' }, { id: 'explain', label: 'Explain' });

  const effectiveMode = availableModes.some((m) => m.id === activeTab.viewMode)
    ? activeTab.viewMode
    : availableModes[0].id;

  return (
    <div className="flex flex-col h-full min-w-0 bg-[#F8F9F5] dark:bg-[#141611]">
      {/* Open Tabs Strip */}
      <div className="flex items-center border-b border-black/10 dark:border-white/[0.08] bg-[#ECEFE6] dark:bg-[#1C1F18] overflow-x-auto shrink-0">
        {/* Mobile Back to Tree Button */}
        <button
          type="button"
          onClick={onBackToTree}
          className="md:hidden px-3 py-2.5 flex items-center gap-1.5 text-xs font-semibold text-[#465D18] dark:text-[#A9CC52] border-r border-black/10 dark:border-white/10 whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Tree
        </button>

        {tabs.map((tab) => {
          const isActive = tab.id === activeTab.id;
          const tabEntry = project.entryMap.get(tab.path);
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`group flex items-center gap-2 px-3 py-2 border-r border-black/10 dark:border-white/[0.06] cursor-pointer text-xs whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'bg-[#F8F9F5] dark:bg-[#141611] text-[#181A14] dark:text-[#E4E6DD] shadow-[inset_0_-2px_0_0_#9BB848]'
                  : 'text-[#5A6050] dark:text-[#9CA38F] hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              {tabEntry && <FileBadge category={tabEntry.format.category} name={tab.name} />}
              <span className="max-w-[160px] truncate">{tab.name}</span>
              <button
                type="button"
                aria-label={`Close ${tab.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 opacity-60 hover:opacity-100"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Sub-toolbar: Path + Mode Switcher + Editor Actions */}
      <div className="px-3 py-2 border-b border-black/10 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-2 bg-[#F2F4ED] dark:bg-[#181B14] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-[#5A6050] dark:text-[#9CA38F] truncate" title={entry.path}>
            {entry.path}
          </span>
          <span className="text-[11px] font-mono text-[#7A816E] shrink-0">· Read-Only</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-w-full min-w-0">
          {/* View Mode Segmented Buttons */}
          <div className="flex items-center gap-0.5 bg-black/5 dark:bg-white/5 p-0.5 rounded-lg max-w-full overflow-x-auto">
            {availableModes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onChangeTabMode(activeTab.id, m.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  effectiveMode === m.id
                    ? 'bg-[#465D18] text-white dark:bg-[#3E4A24] dark:text-[#DDF0A4]'
                    : 'text-[#5A6050] dark:text-[#9CA38F] hover:text-black dark:hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {(effectiveMode === 'decoded' || effectiveMode === 'smali' || effectiveMode === 'java') && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFindOpen((v) => !v)}
                title="Find in file"
                className="p-1.5 rounded border border-black/10 dark:border-white/10 text-[#5A6050] dark:text-[#9CA38F] hover:text-black dark:hover:text-white"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onToggleWordWrap}
                title="Toggle Word Wrap"
                className={`p-1.5 rounded border ${
                  wordWrap
                    ? 'border-[#9BB848] text-[#9BB848]'
                    : 'border-black/10 dark:border-white/10 text-[#5A6050] dark:text-[#9CA38F]'
                }`}
              >
                <WrapText className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(decodedContent)}
                title="Copy all"
                className="p-1.5 rounded border border-black/10 dark:border-white/10 text-[#5A6050] dark:text-[#9CA38F] hover:text-black dark:hover:text-white"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() =>
              decodedContent && effectiveMode !== 'hex'
                ? downloadBlob(`${entry.name}.txt`, decodedContent, 'text/plain')
                : downloadBlob(entry.name, entry.bytes, entry.format.mimeType)
            }
            className="px-2.5 py-1 rounded border border-black/10 dark:border-white/10 text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Find & Go-to-Line Bar */}
      {findOpen && (effectiveMode === 'decoded' || effectiveMode === 'smali' || effectiveMode === 'java') && (
        <div className="px-3 py-1.5 border-b border-black/10 dark:border-white/10 bg-[#ECEFE6] dark:bg-[#1B1E17] flex flex-wrap items-center gap-2 text-xs">
          <input
            type="text"
            value={findQuery}
            onChange={(e) => {
              setFindQuery(e.target.value);
              setFindMatchIdx(0);
            }}
            placeholder="Find in file…"
            className="px-2.5 py-1 rounded bg-white dark:bg-[#141611] border border-black/10 dark:border-white/10 w-full sm:w-52"
          />
          <span className="font-mono tabular-nums text-[#7A816E]">
            {findMatches.length > 0 ? `${findMatchIdx + 1}/${findMatches.length}` : '0 matches'}
          </span>
          <button
            type="button"
            disabled={findMatches.length === 0}
            onClick={() => {
              const prev = (findMatchIdx - 1 + findMatches.length) % findMatches.length;
              setFindMatchIdx(prev);
              scrollToLine(findMatches[prev]);
            }}
            className="p-1 rounded border border-black/10 dark:border-white/10 disabled:opacity-40"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={findMatches.length === 0}
            onClick={() => {
              const next = (findMatchIdx + 1) % findMatches.length;
              setFindMatchIdx(next);
              scrollToLine(findMatches[next]);
            }}
            className="p-1 rounded border border-black/10 dark:border-white/10 disabled:opacity-40"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <div className="h-4 w-px bg-black/10 dark:bg-white/10 mx-1" />
          <input
            type="number"
            min={1}
            max={lines.length}
            value={gotoLineInput}
            onChange={(e) => setGotoLineInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const ln = parseInt(gotoLineInput, 10);
                if (!Number.isNaN(ln)) scrollToLine(ln);
              }
            }}
            placeholder="Go to line…"
            className="px-2 py-1 rounded bg-white dark:bg-[#141611] border border-black/10 dark:border-white/10 w-24 font-mono"
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {effectiveMode === 'hex' && <HexInspector entry={entry} initialOffset={activeTab.targetOffset} />}
        {effectiveMode === 'sqlite' && <SqliteViewer entry={entry} />}
        {effectiveMode === 'preview' && <MediaPreview entry={entry} />}
        {effectiveMode === 'explain' && (
          <ExplanationPanel
            entry={entry}
            project={project}
            snippetPreview={decodedContent}
            onJumpToFile={onJumpToFile}
          />
        )}
        {effectiveMode === 'metadata' && (
          <div className="p-6 max-w-2xl space-y-4 overflow-y-auto h-full text-xs">
            <h3 className="text-sm font-semibold">Universal File Detection Metadata</h3>
            <div className="border border-black/10 dark:border-white/10 rounded-lg divide-y divide-black/5 dark:divide-white/[0.06]">
              {[
                ['Path', entry.path],
                ['Format', entry.format.formatName],
                ['Category', entry.format.category],
                ['MIME Type', entry.format.mimeType],
                ['Detection Method', `${entry.format.detectionMethod} (${entry.format.confidence} confidence)`],
                ['Magic Bytes', entry.format.magicHex || 'None'],
                ['Size', `${entry.size.toLocaleString()} bytes (${formatBytes(entry.size)})`],
                ['Shannon Entropy', `${entry.format.entropy} / 8.000 bits/byte`],
                ['Summary', entry.format.summary],
              ].map(([k, v]) => (
                <div key={k} className="px-4 py-2.5 flex items-start justify-between gap-4">
                  <span className="text-[#7A816E] shrink-0">{k}</span>
                  <span className="font-mono text-right break-all">{v}</span>
                </div>
              ))}
            </div>
            {entry.format.candidates && entry.format.candidates.length > 0 && (
              <div className="space-y-2">
                <div className="font-semibold">Format Candidates</div>
                {entry.format.candidates.map((c, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-black/10 dark:border-white/10">
                    <div className="font-medium">
                      {c.name} · {c.confidence}
                    </div>
                    <div className="text-[#7A816E] mt-0.5">{c.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {(effectiveMode === 'decoded' || effectiveMode === 'smali' || effectiveMode === 'java') && (
          <div ref={codeContainerRef} className="h-full overflow-auto font-mono text-[12.5px] leading-[1.55]">
            <div className="min-w-max py-2">
              {lines.slice(0, 6000).map((line, i) => {
                const ln = i + 1;
                const isTarget = activeTab.targetLine === ln || findMatches[findMatchIdx] === ln;
                return (
                  <div
                    key={ln}
                    data-line={ln}
                    className={`flex px-3 ${
                      isTarget ? 'bg-[#9BB848]/20' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    {showLineNumbers && (
                      <span className="w-12 pr-3 text-right select-none text-[#8E9580] shrink-0 tabular-nums">
                        {ln}
                      </span>
                    )}
                    <span
                      className={`flex-1 ${
                        wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
                      } text-[#181A14] dark:text-[#DCE0D2]`}
                    >
                      {line || ' '}
                    </span>
                  </div>
                );
              })}
              {lines.length > 6000 && (
                <div className="px-4 py-3 text-xs text-[#7A816E]">
                  Showing first 6,000 lines of {lines.length.toLocaleString()} total lines for UI responsiveness. Use Export to save complete output.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
