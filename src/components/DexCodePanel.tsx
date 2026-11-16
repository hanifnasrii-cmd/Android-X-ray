import { useMemo, useState } from 'react';
import { Bookmark, Code2, Search } from 'lucide-react';
import { ApkProject, DexClassInfo } from '../types/xray';

export function DexCodePanel({ project }: { project: ApkProject }) {
  const [selectedDexIdx, setSelectedDexIdx] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<DexClassInfo | null>(null);
  const [viewTab, setViewTab] = useState<'overview' | 'smali' | 'java' | 'strings' | 'xrefs'>('overview');
  const [bookmarkedClasses, setBookmarkedClasses] = useState<string[]>([]);

  const dex = project.dexFiles[selectedDexIdx] || null;

  const filteredClasses = useMemo(() => {
    if (!dex) return [];
    const q = query.trim().toLowerCase();
    if (!q) return dex.classes;
    return dex.classes.filter(
      (c) =>
        c.className.toLowerCase().includes(q) ||
        c.directMethods.some((m) => m.name.toLowerCase().includes(q)) ||
        c.virtualMethods.some((m) => m.name.toLowerCase().includes(q)) ||
        c.staticFields.some((f) => f.name.toLowerCase().includes(q)) ||
        c.instanceFields.some((f) => f.name.toLowerCase().includes(q))
    );
  }, [dex, query]);

  const activeClass = selectedClass && filteredClasses.includes(selectedClass) ? selectedClass : filteredClasses[0] || null;

  if (project.dexFiles.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-[#7A816E]">
        No DEX bytecode files (classes*.dex) found in this package.
      </div>
    );
  }

  const toggleClassBookmark = (clsName: string) => {
    setBookmarkedClasses((prev) => (prev.includes(clsName) ? prev.filter((x) => x !== clsName) : [...prev, clsName]));
  };

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Class & Multidex Browser */}
      <div className="w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-black/10 dark:border-white/[0.08] flex flex-col bg-[#F2F4ED] dark:bg-[#191C15]">
        <div className="p-3 border-b border-black/10 dark:border-white/[0.08] space-y-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {project.dexFiles.map((d, idx) => (
              <button
                key={d.filePath}
                type="button"
                onClick={() => {
                  setSelectedDexIdx(idx);
                  setSelectedClass(null);
                }}
                className={`px-2.5 py-1 rounded text-xs font-mono whitespace-nowrap shrink-0 ${
                  selectedDexIdx === idx
                    ? 'bg-[#465D18] text-white dark:bg-[#3E4A24] dark:text-[#DDF0A4]'
                    : 'bg-black/5 dark:bg-white/5 text-[#5A6050] dark:text-[#9CA38F]'
                }`}
              >
                {d.filePath} ({d.classDefCount})
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7A816E]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search class, method, field…"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-white dark:bg-[#141611] border border-black/10 dark:border-white/10"
            />
          </div>

          {dex && (
            <div className="text-[11px] font-mono text-[#7A816E] flex flex-wrap gap-2">
              <span>DEX v{dex.version}</span>
              <span>·</span>
              <span className="tabular-nums">{dex.methodCount} methods</span>
              <span>·</span>
              <span className="tabular-nums">{dex.stringCount} strings</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-black/5 dark:divide-white/[0.04]">
          {filteredClasses.slice(0, 500).map((cls) => {
            const isSelected = activeClass?.descriptor === cls.descriptor;
            return (
              <div
                key={cls.descriptor}
                onClick={() => setSelectedClass(cls)}
                className={`px-3 py-2 cursor-pointer text-xs ${
                  isSelected
                    ? 'bg-[#465D18]/15 dark:bg-[#3E4A24]/70 text-[#181A14] dark:text-[#EAF5B8]'
                    : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-medium truncate">{cls.simpleName}</span>
                  <span className="text-[11px] font-mono text-[#7A816E] shrink-0">
                    {cls.directMethods.length + cls.virtualMethods.length}m
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#7A816E] truncate">{cls.packageName}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Class Disassembly / Reconstructed Code Workspace */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F8F9F5] dark:bg-[#141611]">
        {!activeClass || !dex ? (
          <div className="p-8 text-xs text-[#7A816E]">Select a DEX class to inspect Smali and bytecode.</div>
        ) : (
          <>
            <div className="px-4 py-2.5 border-b border-black/10 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-2 bg-[#ECEFE6] dark:bg-[#1B1E17]">
              <div className="min-w-0">
                <div className="text-sm font-mono font-semibold truncate">{activeClass.className}</div>
                <div className="text-[11px] font-mono text-[#7A816E] truncate">
                  extends {activeClass.superClass} · source: {activeClass.sourceFile}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleClassBookmark(activeClass.className)}
                  className={`p-1.5 rounded border ${
                    bookmarkedClasses.includes(activeClass.className)
                      ? 'border-[#9BB848] text-[#9BB848]'
                      : 'border-black/10 dark:border-white/10 text-[#7A816E]'
                  }`}
                  title="Bookmark class"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center gap-0.5 bg-black/5 dark:bg-white/5 p-0.5 rounded-lg text-xs">
                  {(
                    [
                      ['overview', 'Overview'],
                      ['smali', 'Smali'],
                      ['java', 'Reconstructed Java'],
                      ['strings', 'DEX Strings'],
                      ['xrefs', 'Cross-Refs'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setViewTab(id)}
                      className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap shrink-0 ${
                        viewTab === id
                          ? 'bg-[#465D18] text-white dark:bg-[#3E4A24] dark:text-[#DDF0A4]'
                          : 'text-[#5A6050] dark:text-[#9CA38F]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {viewTab === 'overview' && (
                <div className="space-y-4 max-w-3xl text-xs">
                  <div className="p-3 rounded-lg border border-black/10 dark:border-white/10 font-mono space-y-1">
                    <div>Descriptor: {activeClass.descriptor}</div>
                    <div>Access: {activeClass.accessString || 'package-private'}</div>
                    <div>Interfaces: {activeClass.interfaces.join(', ') || 'None'}</div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">
                      Fields ({activeClass.staticFields.length + activeClass.instanceFields.length})
                    </h4>
                    <div className="border border-black/10 dark:border-white/10 rounded-lg divide-y divide-black/5 dark:divide-white/[0.05] font-mono">
                      {[...activeClass.staticFields, ...activeClass.instanceFields].map((f, i) => (
                        <div key={i} className="px-3 py-1.5 flex justify-between gap-3">
                          <span>
                            {f.isStatic ? 'static ' : ''}
                            {f.name}
                          </span>
                          <span className="text-[#9BB848]">{f.type}</span>
                        </div>
                      ))}
                      {activeClass.staticFields.length + activeClass.instanceFields.length === 0 && (
                        <div className="px-3 py-2 text-[#7A816E]">No fields declared.</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">
                      Methods ({activeClass.directMethods.length + activeClass.virtualMethods.length})
                    </h4>
                    <div className="border border-black/10 dark:border-white/10 rounded-lg divide-y divide-black/5 dark:divide-white/[0.05] font-mono">
                      {[...activeClass.directMethods, ...activeClass.virtualMethods].map((m, i) => (
                        <div key={i} className="px-3 py-2 flex items-center justify-between gap-3">
                          <span className="truncate">
                            {m.accessString} {m.name}({m.parameters.join(', ')}) : {m.returnType}
                          </span>
                          <span className="text-[#7A816E] shrink-0">
                            regs={m.registersSize} · {m.insnsSize} units
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {viewTab === 'smali' && (
                <pre className="font-mono text-xs leading-relaxed whitespace-pre text-[#181A14] dark:text-[#DCE0D2]">
                  {activeClass.smaliText}
                </pre>
              )}

              {viewTab === 'java' && (
                <div className="space-y-3">
                  <div className="px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/10 text-xs text-amber-500 flex items-center gap-2">
                    <Code2 className="w-4 h-4 shrink-0" />
                    Reconstructed Java-like pseudocode derived from Dalvik opcodes — not original source code.
                  </div>
                  <pre className="font-mono text-xs leading-relaxed whitespace-pre text-[#181A14] dark:text-[#DCE0D2]">
                    {activeClass.pseudocodeText}
                  </pre>
                </div>
              )}

              {viewTab === 'strings' && (
                <div className="space-y-1 font-mono text-xs">
                  {dex.strings.slice(0, 500).map((s, idx) => (
                    <div key={idx} className="flex gap-3 py-0.5 border-b border-black/5 dark:border-white/[0.04]">
                      <span className="text-[#7A816E] w-12 text-right shrink-0 tabular-nums">#{idx}</span>
                      <span className="break-all">{s}</span>
                    </div>
                  ))}
                </div>
              )}

              {viewTab === 'xrefs' && (
                <div className="space-y-4 text-xs font-mono">
                  {[...activeClass.directMethods, ...activeClass.virtualMethods].map((m, idx) => (
                    <div key={idx} className="p-3 rounded-lg border border-black/10 dark:border-white/10 space-y-1.5">
                      <div className="font-semibold text-[#9BB848]">
                        {m.name}({m.parameters.join(', ')})
                      </div>
                      <div>Strings referenced: {m.referencedStrings.join(', ') || 'None'}</div>
                      <div>Methods invoked: {m.referencedMethods.join(', ') || 'None'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
