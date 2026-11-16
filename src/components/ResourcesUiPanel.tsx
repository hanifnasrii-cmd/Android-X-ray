import { useMemo, useState } from 'react';
import { Layers, Palette, Search } from 'lucide-react';
import { ApkEntry, ApkProject } from '../types/xray';
import { formatBytes } from './FileBadge';

export function ResourcesUiPanel({
  mode,
  project,
  onOpenEntry,
}: {
  mode: 'resources' | 'ui-arch';
  project: ApkProject;
  onOpenEntry: (entry: ApkEntry) => void;
}) {
  const [resFilter, setResFilter] = useState('');
  const [resTypeFilter, setResTypeFilter] = useState<string>('all');

  const rt = project.resourceTable;

  const filteredResources = useMemo(() => {
    if (!rt) return [];
    const q = resFilter.trim().toLowerCase();
    return rt.entries.filter((e) => {
      if (resTypeFilter !== 'all' && e.typeName !== resTypeFilter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.idHex.toLowerCase().includes(q) ||
        e.reference.toLowerCase().includes(q) ||
        e.values.some((v) => v.value.toLowerCase().includes(q))
      );
    });
  }, [rt, resFilter, resTypeFilter]);

  // UI Architecture categories from real APK files & DEX/Manifest
  const uiAssets = useMemo(() => {
    const layouts = project.entries.filter((e) => /^res\/layout/.test(e.path));
    const drawables = project.entries.filter((e) => /^res\/(drawable|mipmap)/.test(e.path));
    const menus = project.entries.filter((e) => /^res\/(menu|navigation|xml|anim|animator)/.test(e.path));
    const fonts = project.entries.filter((e) => e.format.category === 'font');
    const composeClasses = project.dexFiles
      .flatMap((d) => d.classes)
      .filter(
        (c) =>
          c.className.includes('Compose') ||
          c.superClass.includes('Activity') ||
          c.superClass.includes('Fragment') ||
          c.superClass.includes('ViewModel') ||
          c.superClass.includes('View')
      );
    const colors = rt?.entries.filter((r) => r.typeName === 'color') || [];
    return { layouts, drawables, menus, fonts, composeClasses, colors };
  }, [project, rt]);

  if (mode === 'resources') {
    if (!rt) {
      return (
        <div className="p-8 text-center text-xs text-[#7A816E]">
          No compiled resources.arsc table found in {project.fileName}.
        </div>
      );
    }

    const types = ['all', ...Object.keys(rt.typeCounts).sort()];

    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5 overflow-y-auto h-full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Android Resource Inspector (resources.arsc)</h2>
            <div className="text-xs text-[#666C5B] dark:text-[#9CA38F] font-mono tabular-nums">
              {rt.entries.length.toLocaleString()} resources · Packages: {rt.packages.map((p) => p.name).join(', ')}
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7A816E]" />
            <input
              type="text"
              value={resFilter}
              onChange={(e) => setResFilter(e.target.value)}
              placeholder="Search ID (0x7f…), name, value…"
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white dark:bg-[#191C15] border border-black/10 dark:border-white/10 w-64"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-lg w-fit">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setResTypeFilter(t)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
                resTypeFilter === t
                  ? 'bg-[#465D18] text-white dark:bg-[#3E4A24] dark:text-[#DDF0A4]'
                  : 'text-[#5A6050] dark:text-[#9CA38F]'
              }`}
            >
              {t === 'all' ? `All (${rt.entries.length})` : `${t} (${rt.typeCounts[t]})`}
            </button>
          ))}
        </div>

        <div className="border border-black/10 dark:border-white/[0.08] rounded-xl overflow-hidden bg-white dark:bg-[#181B14]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#ECEFE6] dark:bg-[#1E2219] border-b border-black/10 dark:border-white/[0.08]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Resource ID</th>
                  <th className="px-3 py-2 font-semibold">Reference</th>
                  <th className="px-3 py-2 font-semibold">Configuration Variants &amp; Values</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/[0.05] font-mono">
                {filteredResources.slice(0, 600).map((r) => (
                  <tr key={r.idHex} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-[#9BB848] whitespace-nowrap">{r.idHex}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.reference}</td>
                    <td className="px-3 py-2 space-y-1">
                      {r.values.map((v, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-[11px] text-[#7A816E] shrink-0">[{v.configLabel}]</span>
                          {v.value.startsWith('#') && (v.value.length === 7 || v.value.length === 9) && (
                            <span
                              className="w-3.5 h-3.5 rounded-sm border border-black/20 shrink-0"
                              style={{ backgroundColor: v.value }}
                            />
                          )}
                          <span className="break-all">{v.value}</span>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // UI Architecture Explorer
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6 overflow-y-auto h-full">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#9BB848]" /> UI Architecture &amp; Resource Mapping
        </h2>
        <p className="text-xs text-[#5A6050] dark:text-[#9CA38F] mt-1">
          Static inspection of XML layouts, drawables, menus, colors, fonts, Activities, ViewModels, and Compose classes. Static analysis does not invent runtime UI state.
        </p>
      </div>

      {/* Color Swatches */}
      {uiAssets.colors.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-[#9BB848]" /> Color Palette ({uiAssets.colors.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
            {uiAssets.colors.slice(0, 24).map((c) => (
              <div key={c.idHex} className="p-3 rounded-lg border border-black/10 dark:border-white/[0.08] bg-white dark:bg-[#181B14] space-y-1.5">
                <div className="font-mono font-medium truncate">{c.name}</div>
                {c.values.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 font-mono text-[11px] text-[#7A816E]">
                    <span className="w-3.5 h-3.5 rounded border border-black/20 shrink-0" style={{ backgroundColor: v.value }} />
                    <span>{v.value}</span>
                    <span>({v.configLabel})</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Layouts, Drawables, Menus, Fonts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {[
          ['XML Layouts', uiAssets.layouts],
          ['Drawables & Mipmaps', uiAssets.drawables],
          ['Menus / Navigation / XML', uiAssets.menus],
          ['Bundled Fonts', uiAssets.fonts],
        ].map(([title, list]) => {
          const items = list as ApkEntry[];
          return (
            <div key={String(title)} className="border border-black/10 dark:border-white/[0.08] rounded-xl bg-white dark:bg-[#181B14] overflow-hidden">
              <div className="px-4 py-2.5 bg-[#ECEFE6] dark:bg-[#1E2219] border-b border-black/10 dark:border-white/[0.08] font-semibold">
                {String(title)} ({items.length})
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-black/5 dark:divide-white/[0.05]">
                {items.length === 0 ? (
                  <div className="p-4 text-[#7A816E]">None discovered in archive.</div>
                ) : (
                  items.map((e) => (
                    <button
                      key={e.path}
                      type="button"
                      onClick={() => onOpenEntry(e)}
                      className="w-full px-4 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-between gap-2 font-mono"
                    >
                      <span className="truncate">{e.path}</span>
                      <span className="text-[#7A816E] shrink-0 tabular-nums">{formatBytes(e.size)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* UI Classes (Activities, Fragments, ViewModels, Compose) */}
      <div className="space-y-2 text-xs">
        <h3 className="text-sm font-semibold">UI Classes Discovered in DEX ({uiAssets.composeClasses.length})</h3>
        <div className="border border-black/10 dark:border-white/[0.08] rounded-xl divide-y divide-black/5 dark:divide-white/[0.05] bg-white dark:bg-[#181B14]">
          {uiAssets.composeClasses.length === 0 ? (
            <div className="p-4 text-[#7A816E]">No Activity/Fragment/ViewModel/Compose classes discovered in DEX.</div>
          ) : (
            uiAssets.composeClasses.slice(0, 80).map((c) => (
              <div key={c.descriptor} className="px-4 py-2 flex items-center justify-between gap-3 font-mono">
                <span className="truncate">{c.className}</span>
                <span className="text-[#7A816E] shrink-0">extends {c.superClass.split('.').pop()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
