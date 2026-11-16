import {
  ApkEntry,
  ArchitectureEdge,
  ArchitectureGraphData,
  ArchitectureNode,
  DecodedManifest,
  DexAnalysis,
  ElfAnalysis,
} from '../types/xray';

export function buildArchitectureGraph(
  manifest: DecodedManifest | null,
  dexFiles: DexAnalysis[],
  elfFiles: ElfAnalysis[],
  entries: ApkEntry[]
): ArchitectureGraphData {
  const nodes: ArchitectureNode[] = [];
  const edges: ArchitectureEdge[] = [];

  const appId = 'node-app';
  nodes.push({
    id: appId,
    label: manifest?.packageName || 'Application Root',
    kind: 'app',
    subtitle: manifest ? `v${manifest.versionName} (API ${manifest.minSdk}–${manifest.targetSdk})` : 'APK Package',
    targetPath: manifest ? 'AndroidManifest.xml' : undefined,
    lineNumber: 1,
    x: 420,
    y: 50,
  });

  // Top-level Manifest components (up to 16 so graph stays readable)
  const comps = (manifest?.components || []).slice(0, 16);
  const compSpacing = Math.max(170, Math.floor(820 / Math.max(1, comps.length)));
  const compStartX = Math.max(60, 420 - ((comps.length - 1) * compSpacing) / 2);

  comps.forEach((comp, idx) => {
    const id = `comp-${idx}`;
    nodes.push({
      id,
      label: comp.shortName,
      kind: comp.type === 'activity-alias' ? 'activity' : comp.type,
      subtitle: `${comp.type}${comp.exported ? ' · exported' : ''}`,
      targetPath: 'AndroidManifest.xml',
      lineNumber: comp.lineNumber,
      x: compStartX + idx * compSpacing,
      y: 195,
    });
    edges.push({
      from: appId,
      to: id,
      label: comp.type,
    });
  });

  // Top DEX packages discovered in classes*.dex
  const pkgCounts = new Map<string, { count: number; dexPath: string }>();
  for (const dex of dexFiles) {
    for (const [pkg, count] of Object.entries(dex.packages)) {
      const existing = pkgCounts.get(pkg);
      if (existing) existing.count += count;
      else pkgCounts.set(pkg, { count, dexPath: dex.filePath });
    }
  }
  const topPackages = Array.from(pkgCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6);

  topPackages.forEach(([pkg, meta], idx) => {
    const id = `pkg-${idx}`;
    nodes.push({
      id,
      label: pkg.length > 26 ? `…${pkg.slice(-24)}` : pkg,
      kind: 'dex-pkg',
      subtitle: `${meta.count} class(es) in ${meta.dexPath}`,
      targetPath: meta.dexPath,
      x: 110 + idx * 145,
      y: 340,
    });
    edges.push({
      from: appId,
      to: id,
      label: 'DEX',
    });

    // Link any manifest component whose package matches
    comps.forEach((comp, cIdx) => {
      if (comp.name.startsWith(pkg)) {
        edges.push({
          from: `comp-${cIdx}`,
          to: id,
          label: 'impl',
        });
      }
    });
  });

  // Native ELF Libraries
  elfFiles.slice(0, 5).forEach((elf, idx) => {
    const id = `elf-${idx}`;
    nodes.push({
      id,
      label: elf.filePath.split('/').pop() || elf.filePath,
      kind: 'native',
      subtitle: `${elf.abiGuess} · ${elf.exportedSymbols.length} exports`,
      targetPath: elf.filePath,
      x: 130 + idx * 170,
      y: 470,
    });
    edges.push({
      from: appId,
      to: id,
      label: 'JNI / ELF',
    });
  });

  // Resources & Assets summary nodes
  const hasArsc = entries.some((e) => e.path === 'resources.arsc');
  if (hasArsc) {
    nodes.push({
      id: 'node-arsc',
      label: 'resources.arsc',
      kind: 'resources',
      subtitle: 'Compiled Resources',
      targetPath: 'resources.arsc',
      x: 780,
      y: 340,
    });
    edges.push({ from: appId, to: 'node-arsc', label: 'ResTable' });
  }

  const assetEntries = entries.filter((e) => e.path.startsWith('assets/'));
  if (assetEntries.length > 0) {
    nodes.push({
      id: 'node-assets',
      label: `assets/ (${assetEntries.length})`,
      kind: 'assets',
      subtitle: 'Bundled Raw Assets',
      targetPath: assetEntries[0].path,
      x: 780,
      y: 470,
    });
    edges.push({ from: appId, to: 'node-assets', label: 'Assets' });
  }

  return { nodes, edges };
}
