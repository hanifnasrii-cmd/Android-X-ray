import { unzipSync, zipSync } from 'fflate';
import { ApkEntry, SplitApkInfo, TreeNode } from '../types/xray';
import { detectFileFormat } from './fileDetectionEngine';

const MAX_TOTAL_UNCOMPRESSED = 512 * 1024 * 1024; // 512 MB ZIP-bomb safety limit
const MAX_ENTRY_COUNT = 50000;

export function sanitizeZipPath(rawPath: string): string | null {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  const safeParts: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') return null; // Path traversal rejected
    safeParts.push(part);
  }
  return safeParts.join('/');
}

function classifySplitApk(name: string): SplitApkInfo['role'] {
  const lower = name.toLowerCase();
  if (lower === 'base.apk' || lower.endsWith('/base.apk')) return 'base';
  if (lower.includes('arm64') || lower.includes('armeabi') || lower.includes('x86')) return 'abi';
  if (lower.includes('dpi')) return 'density';
  if (lower.includes('config.')) return 'language';
  if (lower.endsWith('.apk')) return 'feature';
  return 'unknown';
}

export interface UnpackedArchiveResult {
  archiveKind: 'APK' | 'APKS' | 'XAPK' | 'AAB' | 'STANDALONE';
  entries: ApkEntry[];
  splitApks: SplitApkInfo[];
  warnings: string[];
}

export function unpackArchiveBytes(fileName: string, rawBytes: Uint8Array): UnpackedArchiveResult {
  const warnings: string[] = [];
  const lowerName = fileName.toLowerCase();
  const isZipMagic =
    rawBytes.length >= 4 && rawBytes[0] === 0x50 && rawBytes[1] === 0x4b && (rawBytes[2] === 0x03 || rawBytes[2] === 0x05);

  if (!isZipMagic) {
    const safeName = sanitizeZipPath(fileName) || 'imported_file.bin';
    const format = detectFileFormat(safeName, rawBytes);
    const entry: ApkEntry = {
      path: safeName,
      name: safeName.split('/').pop() || safeName,
      dir: '',
      size: rawBytes.length,
      compressedSize: rawBytes.length,
      isDirectory: false,
      bytes: rawBytes,
      format,
    };
    return {
      archiveKind: 'STANDALONE',
      entries: [entry],
      splitApks: [],
      warnings,
    };
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(rawBytes, {
      filter(file) {
        if (file.originalSize > MAX_TOTAL_UNCOMPRESSED) {
          warnings.push(`Skipped oversized entry (${file.name}, ${file.originalSize} bytes) by ZIP-bomb guard.`);
          return false;
        }
        return true;
      },
    });
  } catch (err) {
    throw new Error(`Failed to parse ZIP archive: ${err instanceof Error ? err.message : String(err)}`);
  }

  const keys = Object.keys(unzipped);
  if (keys.length > MAX_ENTRY_COUNT) {
    warnings.push(`Archive contains ${keys.length} entries; truncated to ${MAX_ENTRY_COUNT} for memory safety.`);
  }

  // Detect APKS / XAPK split archive bundles
  const splitApks: SplitApkInfo[] = [];
  let baseApkBytes: Uint8Array | null = null;
  let archiveKind: UnpackedArchiveResult['archiveKind'] = 'APK';

  if (lowerName.endsWith('.aab')) archiveKind = 'AAB';
  if (lowerName.endsWith('.apks')) archiveKind = 'APKS';
  if (lowerName.endsWith('.xapk')) archiveKind = 'XAPK';

  const nestedApks = keys.filter((k) => k.toLowerCase().endsWith('.apk'));
  if (nestedApks.length > 0 && (archiveKind === 'APKS' || archiveKind === 'XAPK' || !keys.includes('AndroidManifest.xml'))) {
    if (archiveKind === 'APK') archiveKind = 'APKS';
    for (const apkKey of nestedApks) {
      const apkData = unzipped[apkKey];
      const role = classifySplitApk(apkKey);
      splitApks.push({
        name: apkKey,
        size: apkData.length,
        role,
      });
      if (role === 'base' || (!baseApkBytes && !apkKey.includes('split_config.'))) {
        baseApkBytes = apkData;
      }
    }
    if (!baseApkBytes && nestedApks.length > 0) {
      baseApkBytes = unzipped[nestedApks[0]];
    }
  }

  let sourceMap = unzipped;
  if (baseApkBytes) {
    try {
      const baseUnzipped = unzipSync(baseApkBytes);
      const merged: Record<string, Uint8Array> = { ...baseUnzipped };
      // Preserve outer bundle manifest / split APKs in split_apks/ virtual folder for inspection
      for (const outerKey of keys) {
        if (outerKey.toLowerCase().endsWith('.json') || outerKey.toLowerCase().endsWith('.png')) {
          merged[`_bundle/${outerKey}`] = unzipped[outerKey];
        } else if (outerKey.toLowerCase().endsWith('.apk')) {
          merged[`_splits/${outerKey}`] = unzipped[outerKey];
        }
      }
      sourceMap = merged;
    } catch {
      warnings.push('Could not extract inner base.apk from split bundle; showing outer container entries.');
    }
  }

  let totalBytes = 0;
  const entries: ApkEntry[] = [];
  const allKeys = Object.keys(sourceMap).slice(0, MAX_ENTRY_COUNT);

  for (const rawKey of allKeys) {
    if (rawKey.endsWith('/')) continue;
    const safePath = sanitizeZipPath(rawKey);
    if (!safePath) {
      warnings.push(`Blocked unsafe path traversal entry: ${rawKey}`);
      continue;
    }
    const bytes = sourceMap[rawKey];
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_UNCOMPRESSED) {
      warnings.push('Uncompressed archive payload exceeded 512 MB safety cap; remaining entries omitted.');
      break;
    }
    const lastSlash = safePath.lastIndexOf('/');
    const name = lastSlash >= 0 ? safePath.slice(lastSlash + 1) : safePath;
    const dir = lastSlash >= 0 ? safePath.slice(0, lastSlash) : '';
    const format = detectFileFormat(safePath, bytes);

    entries.push({
      path: safePath,
      name,
      dir,
      size: bytes.length,
      compressedSize: bytes.length,
      isDirectory: false,
      bytes,
      format,
    });
  }

  return {
    archiveKind,
    entries,
    splitApks,
    warnings,
  };
}

export function buildProjectTree(rootName: string, entries: ApkEntry[]): TreeNode {
  const root: TreeNode = {
    id: 'root',
    name: rootName,
    path: '',
    isDirectory: true,
    size: 0,
    fileCount: 0,
    children: [],
  };

  const dirMap = new Map<string, TreeNode>();
  dirMap.set('', root);

  const ensureDir = (dirPath: string): TreeNode => {
    if (dirMap.has(dirPath)) return dirMap.get(dirPath)!;
    const parts = dirPath.split('/');
    let currentPath = '';
    let parent = root;
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let node = dirMap.get(currentPath);
      if (!node) {
        node = {
          id: `dir:${currentPath}`,
          name: part,
          path: currentPath,
          isDirectory: true,
          size: 0,
          fileCount: 0,
          children: [],
        };
        dirMap.set(currentPath, node);
        parent.children.push(node);
      }
      parent = node;
    }
    return parent;
  };

  for (const entry of entries) {
    const parent = entry.dir ? ensureDir(entry.dir) : root;
    parent.children.push({
      id: `file:${entry.path}`,
      name: entry.name,
      path: entry.path,
      isDirectory: false,
      size: entry.size,
      fileCount: 1,
      children: [],
      entry,
    });
  }

  const finalize = (node: TreeNode): { size: number; count: number } => {
    if (!node.isDirectory) {
      return { size: node.size, count: 1 };
    }
    node.children.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    let sumSize = 0;
    let sumCount = 0;
    for (const child of node.children) {
      const res = finalize(child);
      sumSize += res.size;
      sumCount += res.count;
    }
    node.size = sumSize;
    node.fileCount = sumCount;
    return { size: sumSize, count: sumCount };
  };

  finalize(root);
  return root;
}

export function createZipBundle(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files, { level: 6 });
}
