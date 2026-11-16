import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Download,
  FolderArchive,
  FolderOpen,
  Share2,
  X,
} from 'lucide-react';
import { ApkEntry, TreeNode } from '../types/xray';
import { FolderStats, ZipExportProgress, ZipExportResult } from '../engines/folderZipExporter';
import { formatBytes } from './FileBadge';

export function FolderExportModal({
  targetLabel,
  progress,
  result,
  error,
  onCancel,
  onSaveAs,
  onDownload,
  onShare,
  onClose,
}: {
  targetLabel: string;
  progress: ZipExportProgress | null;
  result: ZipExportResult | null;
  error: string | null;
  onCancel: () => void;
  onSaveAs: () => void;
  onDownload: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-[#1C1F18] border border-black/15 dark:border-white/15 shadow-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FolderArchive className="w-5 h-5 text-[#9BB848] shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate">Export ZIP Archive</h3>
              <div className="text-xs font-mono text-[#7A816E] truncate">{targetLabel}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={result || error ? onClose : onCancel}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-400">
            {error}
          </div>
        )}

        {progress && !result && !error && (
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between font-mono tabular-nums">
              <span className="truncate pr-2 text-[#5A6050] dark:text-[#9CA38F]">{progress.currentFile}</span>
              <span className="shrink-0 font-semibold">{progress.percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div className="h-full bg-[#9BB848] transition-all" style={{ width: `${progress.percent}%` }} />
            </div>
            <div className="flex justify-between font-mono tabular-nums text-[11px] text-[#7A816E]">
              <span>
                Files: {progress.processedFiles.toLocaleString()} / {progress.totalFiles.toLocaleString()}
              </span>
              <span>
                {formatBytes(progress.processedBytes)} / {formatBytes(progress.totalBytes)}
              </span>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-1.5 rounded-lg border border-black/15 dark:border-white/15 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5"
              >
                Cancel Export
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 space-y-1">
              <div className="font-semibold">
                Archive Ready: {result.archiveName} ({formatBytes(result.zipBytes.length)})
              </div>
              <div className="font-mono tabular-nums">
                {result.exportedCount.toLocaleString()} file(s) compressed preserving directory hierarchy.
              </div>
            </div>

            {result.failedEntries.length > 0 && (
              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 space-y-1 max-h-28 overflow-y-auto">
                <div className="font-semibold">
                  {result.failedEntries.length} file(s) could not be exported:
                </div>
                {result.failedEntries.map((fe) => (
                  <div key={fe.path} className="font-mono text-[11px] truncate">
                    {fe.path}: {fe.reason}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onDownload}
                className="px-3 py-1.5 rounded-lg bg-[#465D18] text-white font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" /> Save to Downloads
              </button>
              <button
                type="button"
                onClick={onSaveAs}
                className="px-3 py-1.5 rounded-lg border border-black/15 dark:border-white/15 font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <FolderOpen className="w-3.5 h-3.5" /> Choose Destination
              </button>
              {canShare && (
                <button
                  type="button"
                  onClick={onShare}
                  className="px-3 py-1.5 rounded-lg border border-black/15 dark:border-white/15 font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <Share2 className="w-3.5 h-3.5" /> Share ZIP
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FolderInfoModal({
  stats,
  onDownloadZip,
  onClose,
}: {
  stats: FolderStats;
  onDownloadZip: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-[#1C1F18] border border-black/15 dark:border-white/15 shadow-2xl p-5 space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">{stats.folderName}/ — Folder Summary</h3>
            <div className="text-xs font-mono text-[#7A816E] break-all">{stats.folderPath}</div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="p-2.5 rounded-lg border border-black/10 dark:border-white/10">
            <div className="text-[#7A816E]">Total Size</div>
            <div className="font-mono font-semibold tabular-nums mt-0.5">{formatBytes(stats.totalBytes)}</div>
          </div>
          <div className="p-2.5 rounded-lg border border-black/10 dark:border-white/10">
            <div className="text-[#7A816E]">Files</div>
            <div className="font-mono font-semibold tabular-nums mt-0.5">{stats.fileCount.toLocaleString()}</div>
          </div>
          <div className="p-2.5 rounded-lg border border-black/10 dark:border-white/10">
            <div className="text-[#7A816E]">Subdirectories</div>
            <div className="font-mono font-semibold tabular-nums mt-0.5">{stats.subdirCount.toLocaleString()}</div>
          </div>
        </div>

        <div className="text-xs space-y-1">
          <div className="font-semibold text-[#5A6050] dark:text-[#9CA38F]">File Type Breakdown</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px]">
            {Object.entries(stats.categories)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, count]) => (
                <span key={cat}>
                  {cat}: {count}
                </span>
              ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col space-y-1">
          <div className="text-xs font-semibold text-[#5A6050] dark:text-[#9CA38F]">Directory Structure Preview</div>
          <pre className="flex-1 overflow-auto p-3 rounded-lg bg-[#F2F4ED] dark:bg-[#141611] border border-black/10 dark:border-white/10 font-mono text-[11px] leading-relaxed">
            {stats.structurePreview.join('\n')}
          </pre>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onDownloadZip}
            className="px-3 py-1.5 rounded-lg bg-[#465D18] text-white text-xs font-medium flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Download as ZIP
          </button>
        </div>
      </div>
    </div>
  );
}

function collectAllFolders(root: TreeNode): TreeNode[] {
  const list: TreeNode[] = [];
  const walk = (n: TreeNode) => {
    if (n.isDirectory) {
      if (n.path) list.push(n);
      n.children.forEach(walk);
    }
  };
  walk(root);
  return list;
}

export function CompareModal({
  mode,
  rootTree,
  entries,
  initialLeftPath,
  onClose,
}: {
  mode: 'folder' | 'file';
  rootTree: TreeNode;
  entries: ApkEntry[];
  initialLeftPath: string;
  onClose: () => void;
}) {
  const folders = useMemo(() => collectAllFolders(rootTree), [rootTree]);
  const [leftPath, setLeftPath] = useState(initialLeftPath);
  const [rightPath, setRightPath] = useState(() => {
    if (mode === 'folder') return folders.find((f) => f.path !== initialLeftPath)?.path || initialLeftPath;
    return entries.find((e) => e.path !== initialLeftPath)?.path || initialLeftPath;
  });

  const folderDiff = useMemo(() => {
    if (mode !== 'folder') return null;
    const leftNode = folders.find((f) => f.path === leftPath);
    const rightNode = folders.find((f) => f.path === rightPath);
    if (!leftNode || !rightNode) return null;

    const mapRelative = (node: TreeNode) => {
      const m = new Map<string, ApkEntry>();
      const prefix = `${node.path}/`;
      const walk = (n: TreeNode) => {
        if (!n.isDirectory && n.entry) {
          const rel = n.entry.path.startsWith(prefix) ? n.entry.path.slice(prefix.length) : n.entry.name;
          m.set(rel, n.entry);
        }
        n.children.forEach(walk);
      };
      walk(node);
      return m;
    };

    const mL = mapRelative(leftNode);
    const mR = mapRelative(rightNode);
    const onlyLeft: string[] = [];
    const onlyRight: string[] = [];
    const differentSize: Array<{ rel: string; sizeL: number; sizeR: number }> = [];
    let identicalSizeCount = 0;

    for (const [rel, eL] of mL) {
      const eR = mR.get(rel);
      if (!eR) onlyLeft.push(rel);
      else if (eL.size !== eR.size) differentSize.push({ rel, sizeL: eL.size, sizeR: eR.size });
      else identicalSizeCount++;
    }
    for (const rel of mR.keys()) {
      if (!mL.has(rel)) onlyRight.push(rel);
    }

    return { onlyLeft, onlyRight, differentSize, identicalSizeCount };
  }, [mode, folders, leftPath, rightPath]);

  const fileDiff = useMemo(() => {
    if (mode !== 'file') return null;
    const eL = entries.find((e) => e.path === leftPath);
    const eR = entries.find((e) => e.path === rightPath);
    if (!eL || !eR) return null;

    let sameBytes = eL.size === eR.size;
    if (sameBytes) {
      for (let i = 0; i < eL.bytes.length; i++) {
        if (eL.bytes[i] !== eR.bytes[i]) {
          sameBytes = false;
          break;
        }
      }
    }

    const textL = eL.format.isText ? new TextDecoder().decode(eL.bytes.subarray(0, 64000)).split('\n').slice(0, 200) : [];
    const textR = eR.format.isText ? new TextDecoder().decode(eR.bytes.subarray(0, 64000)).split('\n').slice(0, 200) : [];
    return { eL, eR, sameBytes, textL, textR };
  }, [mode, entries, leftPath, rightPath]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white dark:bg-[#1C1F18] border border-black/15 dark:border-white/15 shadow-2xl p-5 space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold">
            <ArrowLeftRight className="w-4 h-4 text-[#9BB848]" />
            {mode === 'folder' ? 'Compare Folders' : 'Compare Files'}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <select
            value={leftPath}
            onChange={(e) => setLeftPath(e.target.value)}
            className="px-2.5 py-1.5 rounded-md bg-[#F2F4ED] dark:bg-[#141611] border border-black/10 dark:border-white/10 font-mono"
          >
            {mode === 'folder'
              ? folders.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.path}/ ({f.fileCount})
                  </option>
                ))
              : entries.slice(0, 500).map((e) => (
                  <option key={e.path} value={e.path}>
                    {e.path}
                  </option>
                ))}
          </select>
          <select
            value={rightPath}
            onChange={(e) => setRightPath(e.target.value)}
            className="px-2.5 py-1.5 rounded-md bg-[#F2F4ED] dark:bg-[#141611] border border-black/10 dark:border-white/10 font-mono"
          >
            {mode === 'folder'
              ? folders.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.path}/ ({f.fileCount})
                  </option>
                ))
              : entries.slice(0, 500).map((e) => (
                  <option key={e.path} value={e.path}>
                    {e.path}
                  </option>
                ))}
          </select>
        </div>

        <div className="flex-1 overflow-auto text-xs space-y-3">
          {folderDiff && (
            <>
              <div className="flex flex-wrap gap-4 font-mono tabular-nums">
                <span className="text-emerald-500">Only in left: {folderDiff.onlyLeft.length}</span>
                <span className="text-sky-400">Only in right: {folderDiff.onlyRight.length}</span>
                <span className="text-amber-400">Different size: {folderDiff.differentSize.length}</span>
                <span className="text-[#7A816E]">Same name &amp; size: {folderDiff.identicalSizeCount}</span>
              </div>
              <div className="border border-black/10 dark:border-white/10 rounded-lg divide-y divide-black/5 dark:divide-white/[0.05] font-mono">
                {folderDiff.onlyLeft.map((p) => (
                  <div key={`l-${p}`} className="px-3 py-1.5 text-emerald-500">
                    - {p} (left only)
                  </div>
                ))}
                {folderDiff.onlyRight.map((p) => (
                  <div key={`r-${p}`} className="px-3 py-1.5 text-sky-400">
                    + {p} (right only)
                  </div>
                ))}
                {folderDiff.differentSize.map((d) => (
                  <div key={`d-${d.rel}`} className="px-3 py-1.5 text-amber-400 flex justify-between">
                    <span>~ {d.rel}</span>
                    <span>
                      {formatBytes(d.sizeL)} vs {formatBytes(d.sizeR)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {fileDiff && (
            <>
              <div className="p-3 rounded-lg border border-black/10 dark:border-white/10 font-mono flex flex-wrap justify-between gap-2">
                <span>Left: {formatBytes(fileDiff.eL.size)} ({fileDiff.eL.format.formatName})</span>
                <span>Right: {formatBytes(fileDiff.eR.size)} ({fileDiff.eR.format.formatName})</span>
                <span className={fileDiff.sameBytes ? 'text-emerald-500' : 'text-amber-400'}>
                  {fileDiff.sameBytes ? 'Byte-for-byte identical' : 'Files differ'}
                </span>
              </div>
              {fileDiff.textL.length > 0 && fileDiff.textR.length > 0 && (
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <pre className="p-2 rounded bg-[#F2F4ED] dark:bg-[#141611] overflow-auto max-h-72">
                    {fileDiff.textL.join('\n')}
                  </pre>
                  <pre className="p-2 rounded bg-[#F2F4ED] dark:bg-[#141611] overflow-auto max-h-72">
                    {fileDiff.textR.join('\n')}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
