import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Filter, History, Search, X } from 'lucide-react';
import { ApkProject, SearchIndexItem, SearchResult } from '../types/xray';
import { executeIndexedSearch } from '../engines/searchEngine';

const ALL_CATEGORIES: Array<{ id: SearchIndexItem['category']; label: string }> = [
  { id: 'file', label: 'Paths' },
  { id: 'manifest', label: 'Manifest / XML' },
  { id: 'dex-class', label: 'DEX Classes' },
  { id: 'dex-method', label: 'DEX Methods' },
  { id: 'dex-string', label: 'DEX Strings' },
  { id: 'resource', label: 'Resources' },
  { id: 'text', label: 'Text Content' },
  { id: 'native', label: 'ELF Symbols' },
];

export function SearchPanel({
  project,
  initialQuery,
  folderScope,
  onClearFolderScope,
  onOpenSearchResult,
  onResultsUpdate,
}: {
  project: ApkProject;
  initialQuery?: string;
  folderScope?: string | null;
  onClearFolderScope?: () => void;
  onOpenSearchResult: (result: SearchResult) => void;
  onResultsUpdate: (results: SearchResult[]) => void;
}) {
  const [query, setQuery] = useState(initialQuery || '');
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [exactMatch, setExactMatch] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeCategories, setActiveCategories] = useState<Set<SearchIndexItem['category']>>(new Set());
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  const scopedIndex = useMemo(() => {
    if (!folderScope) return project.searchIndex;
    const prefix = `${folderScope.replace(/\/+$/, '')}/`;
    return project.searchIndex.filter((item) => item.path === folderScope || item.path.startsWith(prefix));
  }, [project.searchIndex, folderScope]);

  const { results, error } = useMemo(() => {
    return executeIndexedSearch(scopedIndex, {
      query,
      useRegex,
      caseSensitive,
      exactMatch,
      categories: activeCategories,
    });
  }, [scopedIndex, query, useRegex, caseSensitive, exactMatch, activeCategories]);

  useEffect(() => {
    onResultsUpdate(results);
  }, [results, onResultsUpdate]);

  const toggleCategory = (cat: SearchIndexItem['category']) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const commitHistory = () => {
    const q = query.trim();
    if (!q) return;
    setHistory((prev) => [q, ...prev.filter((x) => x !== q)].slice(0, 10));
  };

  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    for (const r of results) {
      const arr = map.get(r.item.path) || [];
      arr.push(r);
      map.set(r.item.path, arr);
    }
    return Array.from(map.entries());
  }, [results]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 overflow-y-auto h-full">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">Indexed Global Search</h2>
            <div className="text-xs text-[#666C5B] dark:text-[#9CA38F] tabular-nums">
              {scopedIndex.length.toLocaleString()} indexed records ready
              {folderScope ? ` inside ${folderScope}/` : ''}
            </div>
          </div>

          {folderScope && onClearFolderScope && (
            <button
              type="button"
              onClick={onClearFolderScope}
              className="px-2.5 py-1 rounded-md border border-[#9BB848]/40 text-xs font-mono text-[#9BB848] flex items-center gap-1"
            >
              Scope: {folderScope}/ <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Search Input + Expandable Filter Drawer Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#7A816E]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitHistory()}
              placeholder="Search filenames, XML, DEX classes, methods, strings, resources, ELF symbols…"
              className="w-full pl-9 pr-8 py-2 text-xs rounded-lg bg-white dark:bg-[#191C15] border border-black/15 dark:border-white/15 focus:outline-none focus:border-[#9BB848]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A816E]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="px-3 py-2 rounded-lg border border-black/15 dark:border-white/15 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {(useRegex || caseSensitive || exactMatch || activeCategories.size > 0) && (
              <span className="font-mono text-[#9BB848]">
                ({activeCategories.size + Number(useRegex) + Number(caseSensitive) + Number(exactMatch)})
              </span>
            )}
            {filtersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Expandable Advanced Filters */}
        {filtersOpen && (
          <div className="p-3.5 rounded-xl border border-black/10 dark:border-white/[0.08] bg-white dark:bg-[#181B14] space-y-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} className="accent-[#465D18]" />
                Regex
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="accent-[#465D18]" />
                Case-sensitive
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={exactMatch} onChange={(e) => setExactMatch(e.target.checked)} className="accent-[#465D18]" />
                Exact match
              </label>
              <button
                type="button"
                onClick={() => {
                  setUseRegex(false);
                  setCaseSensitive(false);
                  setExactMatch(false);
                  setActiveCategories(new Set());
                }}
                className="ml-auto text-[#9BB848] hover:underline"
              >
                Reset Filters
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {ALL_CATEGORIES.map((c) => {
                const active = activeCategories.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCategory(c.id)}
                    className={`px-2.5 py-1 rounded-md border text-[11px] font-medium whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#465D18] text-white border-[#465D18] dark:bg-[#3E4A24] dark:text-[#DDF0A4] dark:border-[#9BB848]/40'
                        : 'border-black/10 dark:border-white/10 text-[#5A6050] dark:text-[#9CA38F]'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search History */}
        {history.length > 0 && !query && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#7A816E]">
            <History className="w-3.5 h-3.5" />
            {history.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setQuery(h)}
                className="font-mono hover:text-[#9BB848] hover:underline"
              >
                {h}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="p-3 rounded-lg border border-rose-500/30 text-xs text-rose-400 font-mono">{error}</div>}

      {/* Grouped Results */}
      {query.trim() ? (
        <div className="space-y-3">
          <div className="text-xs text-[#7A816E] tabular-nums">
            {results.length} matching item(s) across {grouped.length} file(s)
          </div>
          {grouped.length === 0 ? (
            <div className="p-8 rounded-xl border border-black/10 dark:border-white/[0.08] text-center text-xs text-[#7A816E]">
              No matches found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            grouped.map(([filePath, fileResults]) => (
              <div
                key={filePath}
                className="border border-black/10 dark:border-white/[0.08] rounded-xl overflow-hidden bg-white dark:bg-[#181B14]"
              >
                <div className="px-4 py-2 bg-[#ECEFE6] dark:bg-[#1E2219] border-b border-black/10 dark:border-white/[0.08] flex items-center justify-between text-xs font-mono">
                  <span className="font-semibold truncate">{filePath}</span>
                  <span className="text-[#7A816E] shrink-0 tabular-nums">{fileResults.length} hit(s)</span>
                </div>
                <div className="divide-y divide-black/5 dark:divide-white/[0.05]">
                  {fileResults.slice(0, 30).map((r) => {
                    const before = r.preview.slice(0, r.matchIndex);
                    const hit = r.preview.slice(r.matchIndex, r.matchIndex + r.matchLength);
                    const after = r.preview.slice(r.matchIndex + r.matchLength);
                    return (
                      <button
                        key={r.item.id}
                        type="button"
                        onClick={() => {
                          commitHistory();
                          onOpenSearchResult(r);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.03] flex items-start gap-3 text-xs font-mono"
                      >
                        <span className="text-[#9BB848] shrink-0 w-16 tabular-nums">
                          {r.item.offset ? `0x${r.item.offset.toString(16)}` : `L${r.item.line}`}
                        </span>
                        <span className="text-[#7A816E] shrink-0 w-20">{r.item.category}</span>
                        <span className="truncate">
                          {before}
                          <mark className="bg-[#9BB848]/30 text-inherit px-0.5 rounded-xs">{hit}</mark>
                          {after}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="p-8 rounded-xl border border-black/10 dark:border-white/[0.08] text-center text-xs text-[#7A816E]">
          Enter a query above to search instantly across the indexed APK.
        </div>
      )}
    </div>
  );
}
