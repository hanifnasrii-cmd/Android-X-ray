import { strToU8 } from 'fflate';
import { ApkProject, SearchResult } from '../types/xray';
import { createZipBundle } from './archiveEngine';

export function downloadBlob(filename: string, data: string | Uint8Array, mimeType: string) {
  const blob =
    typeof data === 'string'
      ? new Blob([data], { type: mimeType })
      : new Blob([new Uint8Array(data)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateSummaryJson(project: ApkProject): string {
  return JSON.stringify(
    {
      fileName: project.fileName,
      archiveKind: project.archiveKind,
      totalCompressedSize: project.totalCompressedSize,
      totalUncompressedSize: project.totalUncompressedSize,
      fileCount: project.entries.length,
      supportedAbis: project.supportedAbis,
      splitApks: project.splitApks,
      manifest: project.manifest
        ? {
            packageName: project.manifest.packageName,
            versionName: project.manifest.versionName,
            versionCode: project.manifest.versionCode,
            minSdk: project.manifest.minSdk,
            targetSdk: project.manifest.targetSdk,
            permissions: project.manifest.permissions,
            componentsCount: project.manifest.components.length,
            securityFindings: project.manifest.securityFindings,
          }
        : null,
      frameworks: project.frameworks,
      dexSummary: project.dexFiles.map((d) => ({
        filePath: d.filePath,
        version: d.version,
        classes: d.classDefCount,
        methods: d.methodCount,
        fields: d.fieldCount,
        strings: d.stringCount,
      })),
      nativeLibraries: project.elfFiles.map((e) => ({
        filePath: e.filePath,
        abi: e.abiGuess,
        machine: e.machine,
        buildId: e.buildId,
        neededLibraries: e.neededLibraries,
        exportedSymbols: e.exportedSymbols.length,
      })),
    },
    null,
    2
  );
}

export function generateFileInventoryCsv(project: ApkProject): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Path', 'Name', 'Category', 'Format', 'SizeBytes', 'Entropy', 'DetectionMethod'].join(',');
  const rows = project.entries.map((e) =>
    [e.path, e.name, e.format.category, e.format.formatName, e.size, e.format.entropy, e.format.detectionMethod]
      .map(esc)
      .join(',')
  );
  return [header, ...rows].join('\n');
}

export function generateSummaryTxt(project: ApkProject): string {
  const lines: string[] = [
    `ANDROID X-RAY ANALYSIS REPORT`,
    `File: ${project.fileName} (${project.archiveKind})`,
    `Entries: ${project.entries.length} | Uncompressed: ${project.totalUncompressedSize.toLocaleString()} bytes`,
    ``,
  ];
  if (project.manifest) {
    lines.push(
      `[MANIFEST]`,
      `Package: ${project.manifest.packageName}`,
      `Version: ${project.manifest.versionName} (${project.manifest.versionCode})`,
      `SDK: min ${project.manifest.minSdk} / target ${project.manifest.targetSdk}`,
      `Permissions (${project.manifest.permissions.length}):`,
      ...project.manifest.permissions.map((p) => `  - ${p.name}`),
      `Security Findings (${project.manifest.securityFindings.length}):`,
      ...project.manifest.securityFindings.map((f) => `  [${f.severity.toUpperCase()}] ${f.title}: ${f.description}`),
      ``
    );
  }
  lines.push(
    `[FRAMEWORKS & TECHNOLOGIES]`,
    ...project.frameworks.map((f) => `  - ${f.name} (${f.confidence}): ${f.evidence.join('; ')}`),
    ``,
    `[DEX SUMMARY]`,
    ...project.dexFiles.map(
      (d) => `  - ${d.filePath} (v${d.version}): ${d.classDefCount} classes, ${d.methodCount} methods, ${d.stringCount} strings`
    ),
    ``,
    `[NATIVE ELF LIBRARIES]`,
    ...project.elfFiles.map((e) => `  - ${e.filePath}: ${e.machine}, needed=[${e.neededLibraries.join(', ')}]`)
  );
  return lines.join('\n');
}

export function generateHtmlReport(project: ApkProject): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>ANDROID X-RAY Report — ${esc(project.fileName)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;color:#181a14;background:#f7f8f4}h1,h2{border-bottom:1px solid #d7dbd0;padding-bottom:.4rem}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{text-align:left;padding:.45rem .6rem;border-bottom:1px solid #e2e5dc;font-size:.9rem}pre{background:#181a14;color:#e6e8df;padding:1rem;border-radius:8px;overflow:auto;font-size:.82rem}</style>
</head>
<body>
<h1>ANDROID X-RAY Inspection Report</h1>
<p><strong>Archive:</strong> ${esc(project.fileName)} (${esc(project.archiveKind)}) · <strong>Files:</strong> ${project.entries.length}</p>
${
  project.manifest
    ? `<h2>Manifest</h2>
<p><strong>Package:</strong> ${esc(project.manifest.packageName)} · <strong>Version:</strong> ${esc(project.manifest.versionName)} (${esc(project.manifest.versionCode)}) · <strong>SDK:</strong> min ${esc(project.manifest.minSdk)} / target ${esc(project.manifest.targetSdk)}</p>
<h3>Security Findings (${project.manifest.securityFindings.length})</h3>
<table><tr><th>Severity</th><th>Finding</th><th>Details</th></tr>
${project.manifest.securityFindings.map((f) => `<tr><td>${esc(f.severity.toUpperCase())}</td><td>${esc(f.title)}</td><td>${esc(f.description)}</td></tr>`).join('')}
</table>`
    : ''
}
<h2>Detected Frameworks &amp; SDKs</h2>
<table><tr><th>Name</th><th>Category</th><th>Confidence</th><th>Evidence</th></tr>
${project.frameworks.map((f) => `<tr><td>${esc(f.name)}</td><td>${esc(f.category)}</td><td>${esc(f.confidence)}</td><td>${esc(f.evidence.join('; '))}</td></tr>`).join('')}
</table>
<h2>Decoded AndroidManifest.xml</h2>
<pre>${esc(project.manifest?.rawXml || 'Not present')}</pre>
</body></html>`;
}

export function exportFullReportZip(project: ApkProject, searchResults: SearchResult[]) {
  const files: Record<string, Uint8Array> = {
    'summary.json': strToU8(generateSummaryJson(project)),
    'summary.txt': strToU8(generateSummaryTxt(project)),
    'file-inventory.csv': strToU8(generateFileInventoryCsv(project)),
    'report.html': strToU8(generateHtmlReport(project)),
    'architecture-graph.json': strToU8(JSON.stringify(project.graph, null, 2)),
  };

  if (project.manifest) {
    files['AndroidManifest.decoded.xml'] = strToU8(project.manifest.rawXml);
  }
  if (project.resourceTable) {
    files['resources-inventory.json'] = strToU8(JSON.stringify(project.resourceTable.entries.slice(0, 5000), null, 2));
  }
  if (searchResults.length > 0) {
    files['search-results.json'] = strToU8(JSON.stringify(searchResults.map((r) => ({ path: r.item.path, line: r.item.line, category: r.item.category, text: r.preview })), null, 2));
  }
  for (const dex of project.dexFiles) {
    const smaliDump = dex.classes.slice(0, 120).map((c) => c.smaliText).join('\n\n');
    const javaDump = dex.classes.slice(0, 120).map((c) => c.pseudocodeText).join('\n\n');
    const base = dex.filePath.replace(/\//g, '_');
    files[`smali/${base}.smali`] = strToU8(smaliDump);
    files[`reconstructed/${base}.java`] = strToU8(javaDump);
  }

  const zipBytes = createZipBundle(files);
  downloadBlob(`${project.fileName.replace(/\.[^.]+$/, '')}-xray-report.zip`, zipBytes, 'application/zip');
}
