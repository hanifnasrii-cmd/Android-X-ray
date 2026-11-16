import React, { useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Download,
  FileArchive,
  FolderUp,
  Layers,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { ApkProject } from '../types/xray';
import { compareProjects, ProjectComparisonResult } from '../engines/apkPipeline';
import { formatBytes } from './FileBadge';

interface LibraryPanelProps {
  projects: ApkProject[];
  activeProjectId: string | null;
  loadingStage: string | null;
  loadingPct: number;
  onImportFiles: (files: FileList | File[]) => void;
  onLoadReferenceApk: () => void;
  onDownloadReferenceApk: () => void;
  onSelectProject: (id: string) => void;
  onRemoveProject: (id: string) => void;
  onClearAll: () => void;
  onOpenExplorer: () => void;
}

export function LibraryPanel({
  projects,
  activeProjectId,
  loadingStage,
  loadingPct,
  onImportFiles,
  onLoadReferenceApk,
  onDownloadReferenceApk,
  onSelectProject,
  onRemoveProject,
  onClearAll,
  onOpenExplorer,
}: LibraryPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');
  const [diffResult, setDiffResult] = useState<ProjectComparisonResult | null>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      onImportFiles(e.dataTransfer.files);
    }
  };

  const handleCompare = () => {
    const pA = projects.find((p) => p.id === compareA);
    const pB = projects.find((p) => p.id === compareB);
    if (pA && pB && pA.id !== pB.id) {
      setDiffResult(compareProjects(pA, pB));
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6 overflow-y-auto h-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#181A14] dark:text-[#E4E6DD]">
            Application &amp; Package Library
          </h1>
          <p className="text-xs text-[#5A6050] dark:text-[#9CA38F] mt-1">
            Import APK, APKS, XAPK, AAB, DEX, ELF (.so), or SQLite binaries for local static reverse engineering.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onLoadReferenceApk}
            className="px-3 py-2 rounded-lg border border-black/15 dark:border-white/15 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
          >
            Load Reference APK Binary
          </button>
          <button
            type="button"
            onClick={onDownloadReferenceApk}
            title="Download generated reference APK binary"
            className="px-2.5 py-2 rounded-lg border border-black/15 dark:border-white/15 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" /> .apk
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-lg bg-[#465D18] hover:bg-[#3A4D13] dark:bg-[#9BB848] dark:hover:bg-[#A9C755] text-white dark:text-[#141611] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <FolderUp className="w-4 h-4" /> Import Packages
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".apk,.apks,.xapk,.aab,.zip,.jar,.dex,.so,.arsc,.xml,.db,.sqlite"
            onChange={(e) => {
              if (e.target.files?.length) onImportFiles(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-[#9BB848] bg-[#9BB848]/10'
            : 'border-black/15 dark:border-white/15 bg-white/60 dark:bg-[#191C15] hover:border-[#9BB848]/60'
        }`}
      >
        <FileArchive className="w-7 h-7 mx-auto text-[#9BB848] mb-2" />
        <div className="text-sm font-medium">Drop APK / APKS / XAPK / DEX / SO files here or click to browse</div>
        <div className="text-xs text-[#7A816E] mt-1">
          Static analysis runs locally in memory with ZIP-bomb &amp; path-traversal protection. Imported code is never executed.
        </div>
        {loadingStage && (
          <div className="mt-4 max-w-md mx-auto space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span>{loadingStage}</span>
              <span className="tabular-nums">{loadingPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div className="h-full bg-[#9BB848] transition-all" style={{ width: `${loadingPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Analyzed Applications Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Analyzed Applications ({projects.length})</h2>
          {projects.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs text-rose-500 hover:underline flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear Cache
            </button>
          )}
        </div>

        {projects.length === 0 ? (
          <div className="p-8 rounded-xl border border-black/10 dark:border-white/[0.08] text-center text-xs text-[#7A816E]">
            No packages loaded yet. Import an APK or click &ldquo;Load Reference APK Binary&rdquo; to inspect a real compiled binary package.
          </div>
        ) : (
          <div className="border border-black/10 dark:border-white/[0.08] rounded-xl overflow-hidden bg-white dark:bg-[#181B14]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#ECEFE6] dark:bg-[#1E2219] border-b border-black/10 dark:border-white/[0.08] text-[#5A6050] dark:text-[#9CA38F]">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Application / Package</th>
                    <th className="px-3 py-2.5 font-semibold">Version</th>
                    <th className="px-3 py-2.5 font-semibold">SDK (Min / Target)</th>
                    <th className="px-3 py-2.5 font-semibold">ABIs</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Files</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Size</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/[0.06]">
                  {projects.map((p) => {
                    const isActive = p.id === activeProjectId;
                    return (
                      <tr
                        key={p.id}
                        className={isActive ? 'bg-[#465D18]/10 dark:bg-[#3E4A24]/30' : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#181A14] dark:text-[#E4E6DD]">
                            {p.manifest?.appLabel || p.fileName}
                          </div>
                          <div className="text-[11px] font-mono text-[#666C5B] dark:text-[#9CA38F]">
                            {p.manifest?.packageName || p.fileName} · {p.archiveKind}
                            {p.splitApks.length > 0 ? ` · ${p.splitApks.length} splits` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-mono tabular-nums">
                          {p.manifest ? `${p.manifest.versionName} (${p.manifest.versionCode})` : '—'}
                        </td>
                        <td className="px-3 py-3 font-mono tabular-nums">
                          {p.manifest ? `${p.manifest.minSdk} / ${p.manifest.targetSdk}` : '—'}
                        </td>
                        <td className="px-3 py-3 font-mono">
                          {p.supportedAbis.length > 0 ? p.supportedAbis.join(', ') : 'Arch-independent'}
                        </td>
                        <td className="px-3 py-3 font-mono tabular-nums text-right">{p.entries.length.toLocaleString()}</td>
                        <td className="px-3 py-3 font-mono tabular-nums text-right">
                          {formatBytes(p.totalCompressedSize)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                onSelectProject(p.id);
                                onOpenExplorer();
                              }}
                              className="px-2.5 py-1 rounded bg-[#465D18] text-white text-[11px] font-medium"
                            >
                              Inspect Tree
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveProject(p.id)}
                              className="p-1 rounded text-[#7A816E] hover:text-rose-400"
                              title="Delete from session cache"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Compare Two Applications */}
      {projects.length >= 2 && (
        <div className="p-4 rounded-xl border border-black/10 dark:border-white/[0.08] bg-white dark:bg-[#181B14] space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ArrowLeftRight className="w-4 h-4 text-[#9BB848]" />
            Compare Two Applications
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={compareA}
              onChange={(e) => setCompareA(e.target.value)}
              className="px-3 py-1.5 rounded-md bg-[#F2F4ED] dark:bg-[#141611] border border-black/10 dark:border-white/10"
            >
              <option value="">Select Base APK…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fileName}
                </option>
              ))}
            </select>
            <span>vs</span>
            <select
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
              className="px-3 py-1.5 rounded-md bg-[#F2F4ED] dark:bg-[#141611] border border-black/10 dark:border-white/10"
            >
              <option value="">Select Target APK…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fileName}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!compareA || !compareB || compareA === compareB}
              onClick={handleCompare}
              className="px-3 py-1.5 rounded-md bg-[#465D18] text-white font-medium disabled:opacity-40"
            >
              Diff APKs
            </button>
          </div>

          {diffResult && (
            <div className="pt-3 border-t border-black/10 dark:border-white/10 text-xs space-y-2">
              <div className="font-mono">Version Delta: {diffResult.versionDelta}</div>
              <div className="flex flex-wrap gap-4 font-mono tabular-nums">
                <span className="text-emerald-500">+{diffResult.addedFiles.length} added</span>
                <span className="text-rose-400">-{diffResult.removedFiles.length} removed</span>
                <span className="text-amber-400">~{diffResult.changedFiles.length} size-changed</span>
                <span className="text-[#7A816E]">{diffResult.unchangedCount} unchanged</span>
              </div>
              {diffResult.permissionsAdded.length > 0 && (
                <div className="text-emerald-500 font-mono">
                  + Permissions: {diffResult.permissionsAdded.join(', ')}
                </div>
              )}
              {diffResult.permissionsRemoved.length > 0 && (
                <div className="text-rose-400 font-mono">
                  - Permissions: {diffResult.permissionsRemoved.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Honest Runtime & Browser Sandbox Boundary Notice */}
      <div className="p-4 rounded-xl border border-black/10 dark:border-white/[0.08] bg-[#ECEFE6]/60 dark:bg-[#191C15] flex items-start gap-3 text-xs text-[#5A6050] dark:text-[#9CA38F]">
        <ShieldAlert className="w-4 h-4 text-[#9BB848] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-[#181A14] dark:text-[#E4E6DD] flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Browser Workstation &amp; Android Package Visibility Scope
          </div>
          <p>
            In this web workstation runtime, installed Android system/device packages are not directly enumerable due to browser sandboxing; import any <code className="font-mono">.apk</code>, <code className="font-mono">.apks</code>, <code className="font-mono">.xapk</code>, <code className="font-mono">.aab</code>, <code className="font-mono">.dex</code>, <code className="font-mono">.so</code>, or <code className="font-mono">.db</code> file directly via Storage Access / file picker. See <strong>Settings &amp; Compatibility Matrix</strong> for full Android 11–16 (API 30–36) feature mapping.
          </p>
        </div>
      </div>
    </div>
  );
}
