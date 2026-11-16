import {
  ApkProject,
  CertInfo,
  DecodedManifest,
  DexAnalysis,
  ElfAnalysis,
  ResourceTable,
} from '../types/xray';
import { buildProjectTree, unpackArchiveBytes } from './archiveEngine';
import { buildArchitectureGraph } from './architectureGraph';
import { parseResourcesArsc } from './arscDecoder';
import { inspectManifest } from './axmlDecoder';
import { parseCertificateFile } from './certParser';
import { analyzeDexFile } from './dexAnalyzer';
import { analyzeElfBinary } from './elfAnalyzer';
import { detectFrameworks } from './frameworkDetector';
import { buildSearchIndex } from './searchEngine';

export interface AnalyzeOptions {
  isReferenceFixture?: boolean;
  onProgress?: (stage: string, pct: number) => void;
}

export async function analyzeApkBytes(
  fileName: string,
  rawBytes: Uint8Array,
  options: AnalyzeOptions = {}
): Promise<ApkProject> {
  const { isReferenceFixture = false, onProgress } = options;

  onProgress?.('Unpacking archive & verifying ZIP safety…', 10);
  const unpacked = unpackArchiveBytes(fileName, rawBytes);
  const entryMap = new Map(unpacked.entries.map((e) => [e.path, e]));

  onProgress?.('Building hierarchical project tree…', 25);
  const tree = buildProjectTree(fileName, unpacked.entries);

  // 1. Parse resources.arsc first so Manifest & XMLs can resolve @0x7f...... IDs
  onProgress?.('Decoding resources.arsc…', 40);
  let resourceTable: ResourceTable | null = null;
  const arscEntry = unpacked.entries.find((e) => e.format.category === 'arsc');
  if (arscEntry) {
    resourceTable = parseResourcesArsc(arscEntry.path, arscEntry.bytes);
  }

  // 2. Parse AndroidManifest.xml
  onProgress?.('Decoding AndroidManifest.xml (AXML)…', 52);
  let manifest: DecodedManifest | null = null;
  const manifestEntry =
    unpacked.entries.find((e) => e.path === 'AndroidManifest.xml') ||
    unpacked.entries.find((e) => e.format.category === 'manifest');
  if (manifestEntry) {
    manifest = inspectManifest(manifestEntry.bytes, resourceTable);
  }

  // 3. Parse all DEX files (classes.dex, classes2.dex, ...)
  onProgress?.('Disassembling DEX bytecode & Smali…', 68);
  const dexEntries = unpacked.entries
    .filter((e) => e.format.category === 'dex')
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  const dexFiles: DexAnalysis[] = [];
  for (const dexEntry of dexEntries) {
    const parsed = analyzeDexFile(dexEntry.path, dexEntry.bytes);
    if (parsed) dexFiles.push(parsed);
  }

  // 4. Parse ELF native shared libraries
  onProgress?.('Inspecting ELF native libraries…', 80);
  const elfEntries = unpacked.entries.filter((e) => e.format.category === 'elf');
  const elfFiles: ElfAnalysis[] = elfEntries.map((e) => analyzeElfBinary(e.path, e.bytes));

  const abiSet = new Set<string>();
  for (const e of elfFiles) {
    if (e.abiGuess && e.abiGuess !== 'unknown') abiSet.add(e.abiGuess);
  }
  for (const e of unpacked.entries) {
    const m = e.path.match(/^lib\/([^/]+)\//);
    if (m) abiSet.add(m[1]);
  }

  // 5. Parse Certificates & Signatures
  const certEntries = unpacked.entries.filter((e) => e.format.category === 'cert');
  const certificates: CertInfo[] = certEntries.map((e) => parseCertificateFile(e.path, e.bytes));

  // 6. Framework & SDK detection
  onProgress?.('Detecting frameworks & dependencies…', 88);
  const frameworks = detectFrameworks(unpacked.entries, manifest, dexFiles);

  // 7. Architecture Graph & Search Index
  onProgress?.('Building component graph & search index…', 95);
  const graph = buildArchitectureGraph(manifest, dexFiles, elfFiles, unpacked.entries);
  const searchIndex = buildSearchIndex(unpacked.entries, manifest, dexFiles, resourceTable, elfFiles);

  const totalUncompressedSize = unpacked.entries.reduce((acc, e) => acc + e.size, 0);

  onProgress?.('Inspection ready', 100);

  return {
    id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName,
    archiveKind: unpacked.archiveKind,
    totalCompressedSize: rawBytes.length,
    totalUncompressedSize,
    analyzedAt: Date.now(),
    isReferenceFixture,
    entries: unpacked.entries,
    entryMap,
    tree,
    manifest,
    dexFiles,
    resourceTable,
    elfFiles,
    certificates,
    frameworks,
    graph,
    searchIndex,
    splitApks: unpacked.splitApks,
    supportedAbis: Array.from(abiSet),
    warnings: unpacked.warnings,
  };
}

export interface ProjectComparisonResult {
  addedFiles: Array<{ path: string; sizeB: number }>;
  removedFiles: Array<{ path: string; sizeA: number }>;
  changedFiles: Array<{ path: string; sizeA: number; sizeB: number; delta: number }>;
  unchangedCount: number;
  permissionsAdded: string[];
  permissionsRemoved: string[];
  versionDelta: string;
}

export function compareProjects(a: ApkProject, b: ApkProject): ProjectComparisonResult {
  const addedFiles: ProjectComparisonResult['addedFiles'] = [];
  const removedFiles: ProjectComparisonResult['removedFiles'] = [];
  const changedFiles: ProjectComparisonResult['changedFiles'] = [];
  let unchangedCount = 0;

  for (const [path, entryB] of b.entryMap) {
    const entryA = a.entryMap.get(path);
    if (!entryA) {
      addedFiles.push({ path, sizeB: entryB.size });
    } else if (entryA.size !== entryB.size) {
      changedFiles.push({
        path,
        sizeA: entryA.size,
        sizeB: entryB.size,
        delta: entryB.size - entryA.size,
      });
    } else {
      unchangedCount++;
    }
  }

  for (const [path, entryA] of a.entryMap) {
    if (!b.entryMap.has(path)) {
      removedFiles.push({ path, sizeA: entryA.size });
    }
  }

  const permsA = new Set(a.manifest?.permissions.map((p) => p.name) || []);
  const permsB = new Set(b.manifest?.permissions.map((p) => p.name) || []);
  const permissionsAdded = Array.from(permsB).filter((p) => !permsA.has(p));
  const permissionsRemoved = Array.from(permsA).filter((p) => !permsB.has(p));

  const versionDelta = `${a.manifest?.versionName || '?'} (${a.manifest?.versionCode || '?'}) → ${b.manifest?.versionName || '?'} (${b.manifest?.versionCode || '?'})`;

  return {
    addedFiles,
    removedFiles,
    changedFiles,
    unchangedCount,
    permissionsAdded,
    permissionsRemoved,
    versionDelta,
  };
}
