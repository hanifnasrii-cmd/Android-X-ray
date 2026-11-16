import { Zip, ZipDeflate } from 'fflate';
import { ApkEntry, TreeNode } from '../types/xray';

export interface FolderStats {
  folderPath: string;
  folderName: string;
  fileCount: number;
  subdirCount: number;
  totalBytes: number;
  categories: Record<string, number>;
  structurePreview: string[];
}

export function collectFolderEntries(node: TreeNode): ApkEntry[] {
  const out: ApkEntry[] = [];
  const walk = (n: TreeNode) => {
    if (!n.isDirectory && n.entry) {
      out.push(n.entry);
    }
    for (const child of n.children) {
      walk(child);
    }
  };
  walk(node);
  return out;
}

export function computeFolderStats(node: TreeNode): FolderStats {
  let fileCount = 0;
  let subdirCount = 0;
  let totalBytes = 0;
  const categories: Record<string, number> = {};
  const structurePreview: string[] = [];

  const walk = (n: TreeNode, depth: number) => {
    if (structurePreview.length < 180) {
      const indent = '  '.repeat(depth);
      structurePreview.push(`${indent}${n.isDirectory ? `${n.name}/` : n.name}`);
    }
    for (const child of n.children) {
      if (child.isDirectory) {
        subdirCount++;
        walk(child, depth + 1);
      } else if (child.entry) {
        fileCount++;
        totalBytes += child.entry.size;
        const cat = child.entry.format.category;
        categories[cat] = (categories[cat] || 0) + 1;
      }
    }
  };

  walk(node, 0);
  return {
    folderPath: node.path || '(root)',
    folderName: node.name,
    fileCount,
    subdirCount,
    totalBytes,
    categories,
    structurePreview,
  };
}

export interface ZipExportProgress {
  currentFile: string;
  processedFiles: number;
  totalFiles: number;
  processedBytes: number;
  totalBytes: number;
  percent: number;
}

export interface ZipExportResult {
  zipBytes: Uint8Array;
  archiveName: string;
  exportedCount: number;
  failedEntries: Array<{ path: string; reason: string }>;
}

/**
 * Streams entries into a valid ZIP archive using fflate's incremental ZipDeflate,
 * yielding back to the browser event loop so UI progress & Cancel remain responsive.
 */
export async function exportEntriesAsStreamingZip(
  entries: ApkEntry[],
  baseFolderPath: string,
  archiveName: string,
  signal: AbortSignal,
  onProgress: (progress: ZipExportProgress) => void
): Promise<ZipExportResult> {
  const totalFiles = entries.length;
  const totalBytes = entries.reduce((acc, e) => acc + e.size, 0);
  const failedEntries: Array<{ path: string; reason: string }> = [];
  const usedPaths = new Set<string>();
  const chunks: Uint8Array[] = [];

  const prefix = baseFolderPath ? `${baseFolderPath.replace(/\/+$/, '')}/` : '';

  const deduplicatePath = (relPath: string): string => {
    let candidate = relPath;
    if (!usedPaths.has(candidate)) {
      usedPaths.add(candidate);
      return candidate;
    }
    const dotIdx = relPath.lastIndexOf('.');
    const slashIdx = relPath.lastIndexOf('/');
    const hasExt = dotIdx > slashIdx + 1;
    const stem = hasExt ? relPath.slice(0, dotIdx) : relPath;
    const ext = hasExt ? relPath.slice(dotIdx) : '';
    let counter = 2;
    while (usedPaths.has(`${stem} (${counter})${ext}`)) counter++;
    candidate = `${stem} (${counter})${ext}`;
    usedPaths.add(candidate);
    return candidate;
  };

  let zipError: Error | null = null;
  const zip = new Zip((err, data) => {
    if (err) {
      zipError = err;
      return;
    }
    if (data && data.length > 0) chunks.push(data);
  });

  let processedFiles = 0;
  let processedBytes = 0;

  for (const entry of entries) {
    if (signal.aborted) {
      throw new DOMException('ZIP export cancelled by user', 'AbortError');
    }

    let relPath = entry.path;
    if (prefix && relPath.startsWith(prefix)) {
      relPath = relPath.slice(prefix.length);
    }
    if (!relPath) relPath = entry.name;
    const safeArcPath = deduplicatePath(relPath);

    try {
      const fileStream = new ZipDeflate(safeArcPath, { level: 6 });
      zip.add(fileStream);

      const CHUNK_SIZE = 256 * 1024;
      if (entry.bytes.length === 0) {
        fileStream.push(new Uint8Array(0), true);
      } else {
        for (let offset = 0; offset < entry.bytes.length; offset += CHUNK_SIZE) {
          if (signal.aborted) {
            throw new DOMException('ZIP export cancelled by user', 'AbortError');
          }
          const end = Math.min(offset + CHUNK_SIZE, entry.bytes.length);
          const isLast = end >= entry.bytes.length;
          fileStream.push(entry.bytes.subarray(offset, end), isLast);
          processedBytes += end - offset;

          if (!isLast) {
            onProgress({
              currentFile: safeArcPath,
              processedFiles,
              totalFiles,
              processedBytes,
              totalBytes,
              percent: totalBytes > 0 ? Math.min(99, Math.round((processedBytes / totalBytes) * 100)) : 50,
            });
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      failedEntries.push({
        path: entry.path,
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    processedFiles++;
    onProgress({
      currentFile: safeArcPath,
      processedFiles,
      totalFiles,
      processedBytes,
      totalBytes,
      percent:
        totalBytes > 0
          ? Math.min(99, Math.round((processedBytes / totalBytes) * 100))
          : Math.round((processedFiles / Math.max(1, totalFiles)) * 100),
    });

    if (processedFiles % 25 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  zip.end();
  if (zipError) throw zipError;

  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const zipBytes = new Uint8Array(totalLen);
  let cursor = 0;
  for (const ch of chunks) {
    zipBytes.set(ch, cursor);
    cursor += ch.length;
  }

  onProgress({
    currentFile: 'Finalizing archive…',
    processedFiles,
    totalFiles,
    processedBytes: totalBytes,
    totalBytes,
    percent: 100,
  });

  return {
    zipBytes,
    archiveName,
    exportedCount: totalFiles - failedEntries.length,
    failedEntries,
  };
}

export async function saveBytesWithPicker(filename: string, bytes: Uint8Array, mimeType: string): Promise<'picker' | 'download'> {
  const win = window as unknown as {
    showSaveFilePicker?: (opts: {
      suggestedName: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<{
      createWritable: () => Promise<{ write: (data: Uint8Array) => Promise<void>; close: () => Promise<void> }>;
    }>;
  };

  if (typeof win.showSaveFilePicker === 'function') {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName: filename,
      });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return 'picker';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      // Fall back to standard download if picker is blocked in iframe
    }
  }

  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return 'download';
}

export async function shareBytesIfSupported(filename: string, bytes: Uint8Array, mimeType: string): Promise<boolean> {
  const file = new File([new Uint8Array(bytes)], filename, { type: mimeType });
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const canShare = typeof navigator.canShare === 'function' ? navigator.canShare({ files: [file] }) : true;
    if (canShare) {
      await navigator.share({
        title: filename,
        files: [file],
      });
      return true;
    }
  }
  return false;
}
