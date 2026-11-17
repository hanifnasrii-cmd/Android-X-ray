import { useState } from 'react';
import { Cpu, Layers, Package } from 'lucide-react';
import { ApkEntry, ApkProject } from '../types/xray';

export function FrameworksNativePanel({
  mode,
  project,
  onOpenEntry,
}: {
  mode: 'frameworks' | 'dependencies' | 'native';
  project: ApkProject;
  onOpenEntry: (entry: ApkEntry) => void;
}) {
  const [selectedElfIdx, setSelectedElfIdx] = useState(0);
  const [elfTab, setElfTab] = useState<'overview' | 'sections' | 'exports' | 'imports' | 'strings'>('overview');

  if (mode === 'frameworks') {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5 overflow-y-auto overflow-x-hidden h-full">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#9BB848]" /> Framework &amp; Technology Detection
          </h2>
          <p className="text-xs text-[#5A6050] dark:text-[#9CA38F] mt-1">
            Multi-signal detection inspecting native libraries, DEX class descriptors, assets, META-INF descriptors, and AndroidManifest.xml.
          </p>
        </div>

        <div className="border border-black/10 dark:border-white/[0.08] rounded-xl divide-y divide-black/5 dark:divide-white/[0.06] bg-white dark:bg-[#181B14]">
          {project.frameworks.length === 0 ? (
            <div className="p-6 text-xs text-[#7A816E]">No known frameworks matched in this artifact.</div>
          ) : (
            project.frameworks.map((fw) => (
              <div key={fw.name} className="p-4 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{fw.name}</span>
                    {fw.version && <span className="font-mono text-[#9BB848]">{fw.version}</span>}
                  </div>
                  <div className="font-mono text-[11px] text-[#7A816E]">
                    {fw.category} · Confidence: <span className="text-[#181A14] dark:text-[#E4E6DD]">{fw.confidence}</span>
                  </div>
                </div>
                <p className="text-[#5A6050] dark:text-[#B4BAA7]">{fw.explanation}</p>
                <div className="font-mono text-[11px] text-[#7A816E] space-y-0.5">
                  <div>Evidence: {fw.evidence.join(' | ')}</div>
                  {fw.relevantFiles.length > 0 && <div>Files: {fw.relevantFiles.slice(0, 6).join(', ')}</div>}
                  {fw.relevantClasses.length > 0 && <div>Classes: {fw.relevantClasses.slice(0, 5).join(', ')}</div>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  if (mode === 'dependencies') {
    const versionFiles = project.entries.filter(
      (e) => e.path.endsWith('.version') || e.path.endsWith('.kotlin_module') || e.path.endsWith('.properties')
    );
    const nativeNeeded = Array.from(new Set(project.elfFiles.flatMap((e) => e.neededLibraries)));
    const dexPackages = Array.from(
      new Set(project.dexFiles.flatMap((d) => Object.keys(d.packages)))
    ).sort();

    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6 overflow-y-auto overflow-x-hidden h-full text-xs">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Package className="w-5 h-5 text-[#9BB848]" /> Dependencies &amp; Bundled Libraries
          </h2>
          <p className="text-xs text-[#5A6050] dark:text-[#9CA38F] mt-1">
            Extracted from META-INF version markers, ELF DT_NEEDED entries, and DEX package namespaces.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-black/10 dark:border-white/[0.08] rounded-xl bg-white dark:bg-[#181B14] overflow-hidden">
            <div className="px-4 py-2.5 bg-[#ECEFE6] dark:bg-[#1E2219] border-b border-black/10 dark:border-white/[0.08] font-semibold">
              META-INF Version &amp; Module Markers ({versionFiles.length})
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-black/5 dark:divide-white/[0.05] font-mono">
              {versionFiles.length === 0 ? (
                <div className="p-4 text-[#7A816E]">No .version or .kotlin_module metadata bundled.</div>
              ) : (
                versionFiles.map((f) => {
                  const val = f.size < 512 ? new TextDecoder().decode(f.bytes).trim() : '';
                  return (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => onOpenEntry(f)}
                      className="w-full px-4 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 flex justify-between gap-2"
                    >
                      <span className="truncate">{f.name}</span>
                      <span className="text-[#9BB848] shrink-0">{val || `${f.size} B`}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="border border-black/10 dark:border-white/[0.08] rounded-xl bg-white dark:bg-[#181B14] overflow-hidden">
            <div className="px-4 py-2.5 bg-[#ECEFE6] dark:bg-[#1E2219] border-b border-black/10 dark:border-white/[0.08] font-semibold">
              Native DT_NEEDED Shared Dependencies ({nativeNeeded.length})
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-black/5 dark:divide-white/[0.05] font-mono">
              {nativeNeeded.length === 0 ? (
                <div className="p-4 text-[#7A816E]">No ELF DT_NEEDED dependencies detected.</div>
              ) : (
                nativeNeeded.map((lib) => (
                  <div key={lib} className="px-4 py-2">
                    {lib}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="border border-black/10 dark:border-white/[0.08] rounded-xl bg-white dark:bg-[#181B14] overflow-hidden">
          <div className="px-4 py-2.5 bg-[#ECEFE6] dark:bg-[#1E2219] border-b border-black/10 dark:border-white/[0.08] font-semibold">
            DEX Package Namespaces ({dexPackages.length})
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-black/5 dark:divide-white/[0.05] font-mono">
            {dexPackages.map((pkg) => (
              <div key={pkg} className="px-4 py-1.5">
                {pkg}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Native ELF Inspector
  if (project.elfFiles.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-[#7A816E]">
        No native ELF libraries (.so) found in {project.fileName}.
      </div>
    );
  }

  const elf = project.elfFiles[selectedElfIdx] || project.elfFiles[0];

  return (
    <div className="flex flex-col md:flex-row h-full min-w-0 overflow-hidden">
      <div className="w-full md:w-72 max-h-44 md:max-h-none shrink-0 border-b md:border-b-0 md:border-r border-black/10 dark:border-white/[0.08] bg-[#F2F4ED] dark:bg-[#191C15] overflow-y-auto p-3 space-y-1.5">
        <div className="text-xs font-semibold text-[#5A6050] dark:text-[#9CA38F] mb-2">
          ELF Binaries ({project.elfFiles.length})
        </div>
        {project.elfFiles.map((item, idx) => (
          <button
            key={item.filePath}
            type="button"
            onClick={() => setSelectedElfIdx(idx)}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs ${
              selectedElfIdx === idx
                ? 'bg-[#465D18]/20 text-[#181A14] dark:bg-[#3E4A24] dark:text-[#DDF0A4]'
                : 'hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <div className="font-mono font-medium truncate">{item.filePath.split('/').pop()}</div>
            <div className="text-[11px] font-mono text-[#7A816E] truncate">
              {item.abiGuess} · {item.bits}-bit
            </div>
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-[#F8F9F5] dark:bg-[#141611]">
        <div className="px-4 py-2.5 border-b border-black/10 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-2 bg-[#ECEFE6] dark:bg-[#1B1E17]">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold truncate max-w-full">
            <Cpu className="w-4 h-4 text-[#9BB848] shrink-0" />
            <span className="truncate">{elf.filePath}</span>
          </div>
          <div className="flex items-center gap-0.5 bg-black/5 dark:bg-white/5 p-0.5 rounded-lg text-xs overflow-x-auto max-w-full">
            {(
              [
                ['overview', 'Overview'],
                ['sections', `Sections (${elf.sections.length})`],
                ['exports', `Exports (${elf.exportedSymbols.length})`],
                ['imports', `Imports (${elf.importedSymbols.length})`],
                ['strings', `Strings (${elf.extractedStrings.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setElfTab(id)}
                className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 ${
                  elfTab === id
                    ? 'bg-[#465D18] text-white dark:bg-[#3E4A24] dark:text-[#DDF0A4]'
                    : 'text-[#5A6050] dark:text-[#9CA38F]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 text-xs">
          {elfTab === 'overview' && (
            <div className="max-w-2xl space-y-4">
              <div className="border border-black/10 dark:border-white/10 rounded-xl divide-y divide-black/5 dark:divide-white/[0.05] font-mono">
                {[
                  ['Architecture / Machine', elf.machine],
                  ['Android ABI', elf.abiGuess],
                  ['Class / Endianness', `ELF${elf.bits} · ${elf.endianness}`],
                  ['ELF Type', elf.elfType],
                  ['Entry Point', elf.entryPoint],
                  ['GNU Build ID', elf.buildId],
                  ['Debug Info (.debug_*)', elf.hasDebugSections ? 'Present' : 'Stripped'],
                  ['DT_NEEDED Dependencies', elf.neededLibraries.join(', ') || 'None'],
                ].map(([k, v]) => (
                  <div key={k} className="px-4 py-2.5 flex justify-between gap-4">
                    <span className="text-[#7A816E]">{k}</span>
                    <span className="text-right break-all">{v}</span>
                  </div>
                ))}
              </div>
              {elf.segments.length > 0 && (
                <div className="space-y-1.5">
                  <div className="font-semibold">Program Headers / Segments ({elf.segments.length})</div>
                  <div className="border border-black/10 dark:border-white/10 rounded-xl divide-y divide-black/5 dark:divide-white/[0.05] font-mono">
                    {elf.segments.map((seg, i) => (
                      <div key={i} className="px-4 py-2 flex justify-between gap-3">
                        <span>
                          {seg.type} [{seg.flags}]
                        </span>
                        <span className="text-[#7A816E] tabular-nums">
                          vaddr={seg.vaddr} · filesz={seg.fileSize}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {elfTab === 'sections' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono min-w-[460px]">
                <thead className="border-b border-black/10 dark:border-white/10 text-[#7A816E]">
                  <tr>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Flags</th>
                    <th className="py-2 pr-3">Addr</th>
                    <th className="py-2 text-right">Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/[0.05]">
                  {elf.sections.map((s, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-3">{s.name}</td>
                      <td className="py-1.5 pr-3 text-[#7A816E]">{s.type}</td>
                      <td className="py-1.5 pr-3">{s.flags}</td>
                      <td className="py-1.5 pr-3">{s.addr}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(elfTab === 'exports' || elfTab === 'imports') && (
            <div className="border border-black/10 dark:border-white/10 rounded-xl divide-y divide-black/5 dark:divide-white/[0.05] font-mono">
              {(elfTab === 'exports' ? elf.exportedSymbols : elf.importedSymbols).map((sym, i) => (
                <div key={i} className="px-3 py-1.5 flex items-center justify-between gap-3">
                  <span className="truncate">{sym.name}</span>
                  <span className="text-[#7A816E] shrink-0">
                    {sym.binding} {sym.type} {sym.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {elfTab === 'strings' && (
            <div className="font-mono space-y-1">
              {elf.extractedStrings.map((s, i) => (
                <div key={i} className="py-0.5 border-b border-black/5 dark:border-white/[0.04] break-all">
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
