import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Bookmark,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Eye,
  FileCode2,
  Folder,
  FolderArchive,
  FolderOpen,
  HelpCircle,
  Info,
  MoreVertical,
  Search,
  Share2,
  Square,
  X,
} from 'lucide-react';
import { ApkEntry, EditorTab, TreeNode } from '../types/xray';
import { collectFolderEntries } from '../engines/folderZipExporter';
import { FileBadge, formatBytes } from './FileBadge';

interface FlatTreeRow {
  node: TreeNode;
  depth: number;
  isExpanded: boolean;
}

interface ProjectTreeProps {
  root: TreeNode;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onExpandFolder: (path: string) => void;
  onCollapseFolder: (path: string) => void;
  onExpandAllTop: () => void;
  onCollapseAll: () => void;
  onOpenFile: (entry: ApkEntry, mode?: EditorTab['viewMode']) => void;
  bookmarks: string[];
  onToggleBookmark: (path: string) => void;
  recentPaths: string[];
  multiSelected: Set<string>;
  onToggleMultiSelect: (path: string) => void;
  onSelectManyPaths: (paths: string[]) => void;
  onClearMultiSelect: () => void;
  onExportPaths: (paths: string[]) => void;
  onDownloadFolderZip: (folderNode: TreeNode) => void;
  onShareNode: (node: TreeNode) => void;
  onShowFolderInfo: (folderNode: TreeNode) => void;
  onCompareNode: (node: TreeNode) => void;
  onSearchInFolder: (folderPath: string) => void;
  onFindReferences: (term: string) => void;
  entryMap: Map<string, ApkEntry>;
}

const ROW_HEIGHT = 32;

export function ProjectTree({
  root,
  selectedPath,
  expandedPaths,
  onToggleExpand,
  onExpandFolder,
  onCollapseFolder,
  onExpandAllTop,
  onCollapseAll,
  onOpenFile,
  bookmarks,
  onToggleBookmark,
  recentPaths,
  multiSelected,
  onToggleMultiSelect,
  onSelectManyPaths,
  onClearMultiSelect,
  onExportPaths,
  onDownloadFolderZip,
  onShareNode,
  onShowFolderInfo,
  onCompareNode,
  onSearchInFolder,
  onFindReferences,
  entryMap,
}: ProjectTreeProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'size'>('name');
  const [drawerTab, setDrawerTab] = useState<'tree' | 'bookmarks' | 'recent'>('tree');
  const [selectionMode, setSelectionMode] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    node: TreeNode;
    x: number;
    y: number;
  } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Long-press pointer state (prevents accidental folder navigation when long-press fires)
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef(false);

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  };

  const startLongPress = (node: TreeNode, clientX: number, clientY: number) => {
    cancelLongPress();
    longPressOriginRef.current = { x: clientX, y: clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      suppressNextClickRef.current = true;
      setContextMenu({ node, x: clientX, y: clientY });
      longPressTimerRef.current = null;
    }, 460);
  };

  const flatRows = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    const rows: FlatTreeRow[] = [];

    const matchesFilter = (node: TreeNode): boolean => {
      if (!q) return true;
      if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) return true;
      return node.children.some(matchesFilter);
    };

    const walk = (node: TreeNode, depth: number) => {
      const sortedChildren = [...node.children].sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        if (sortBy === 'size') return b.size - a.size;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

      for (const child of sortedChildren) {
        if (q && !matchesFilter(child)) continue;
        const isExpanded = q ? true : expandedPaths.has(child.path);
        rows.push({ node: child, depth, isExpanded });
        if (child.isDirectory && isExpanded) {
          walk(child, depth + 1);
        }
      }
    };

    walk(root, 0);
    return rows;
  }, [root, expandedPaths, filterQuery, sortBy]);

  const viewportHeight = 720;
  const overscan = 15;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - overscan);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + overscan * 2;
  const endIndex = Math.min(flatRows.length, startIndex + visibleCount);
  const visibleRows = flatRows.slice(startIndex, endIndex);
  const totalHeight = flatRows.length * ROW_HEIGHT;

  const breadcrumbs = selectedPath ? selectedPath.split('/') : [];

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setContextMenu(null);
  };

  const findNodeByPath = (targetPath: string): TreeNode | null => {
    const walk = (n: TreeNode): TreeNode | null => {
      if (n.path === targetPath) return n;
      for (const c of n.children) {
        const hit = walk(c);
        if (hit) return hit;
      }
      return null;
    };
    return walk(root);
  };

  return (
    <div className="flex flex-col h-full bg-[#F2F4ED] dark:bg-[#191C15] border-r border-black/10 dark:border-white/[0.08] select-none relative">
      {/* Top IDE Scope & Filter Controls */}
      <div className="px-3 pt-2.5 pb-2 border-b border-black/10 dark:border-white/[0.08] space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-black/[0.05] dark:bg-white/[0.05] p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setDrawerTab('tree')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                drawerTab === 'tree'
                  ? 'bg-[#465D18] text-white dark:bg-[#3E4A24] dark:text-[#DDF0A4]'
                  : 'text-[#5A6050] dark:text-[#9CA38F] hover:text-black dark:hover:text-white'
              }`}
            >
              Project
            </button>
            <button
              type="button"
              onClick={() => setDrawerTab('bookmarks')}
              className={`px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 flex items-center gap-1 transition-colors ${
                drawerTab === 'bookmarks'
                  ? 'bg-[#465D18] text-white dark:bg-[#3E4A24] dark:text-[#DDF0A4]'
                  : 'text-[#5A6050] dark:text-[#9CA38F] hover:text-black dark:hover:text-white'
              }`}
            >
              <Bookmark className="w-3 h-3" />
              <span className="tabular-nums">{bookmarks.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setDrawerTab('recent')}
              className={`px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 flex items-center gap-1 transition-colors ${
                drawerTab === 'recent'
                  ? 'bg-[#465D18] text-white dark:bg-[#3E4A24] dark:text-[#DDF0A4]'
                  : 'text-[#5A6050] dark:text-[#9CA38F] hover:text-black dark:hover:text-white'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span className="tabular-nums">{recentPaths.length}</span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSortBy((s) => (s === 'name' ? 'size' : 'name'))}
              title={`Sort by ${sortBy === 'name' ? 'Size' : 'Name'}`}
              className="px-2 py-1 text-[11px] font-medium rounded border border-black/10 dark:border-white/10 text-[#5A6050] dark:text-[#9CA38F] hover:text-black dark:hover:text-white whitespace-nowrap shrink-0"
            >
              {sortBy === 'name' ? 'A–Z' : 'Size'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectionMode((m) => !m);
                if (selectionMode) onClearMultiSelect();
              }}
              title="Toggle multi-selection"
              className={`p-1.5 rounded border whitespace-nowrap shrink-0 ${
                selectionMode
                  ? 'bg-[#465D18]/20 border-[#9BB848]/40 text-[#9BB848]'
                  : 'border-transparent text-[#5A6050] dark:text-[#9CA38F] hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tree Quick Search */}
        {drawerTab === 'tree' && (
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7A816E]" />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter tree paths…"
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md bg-white dark:bg-[#141611] border border-black/10 dark:border-white/10 focus:outline-none focus:border-[#9BB848] text-[#181A14] dark:text-[#E4E6DD]"
              />
              {filterQuery && (
                <button
                  type="button"
                  onClick={() => setFilterQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#7A816E] hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={expandedPaths.size > 0 ? onCollapseAll : onExpandAllTop}
              className="px-2 py-1.5 text-[11px] font-medium rounded-md border border-black/10 dark:border-white/10 text-[#5A6050] dark:text-[#9CA38F] hover:text-black dark:hover:text-white whitespace-nowrap shrink-0"
            >
              {expandedPaths.size > 0 ? 'Collapse' : 'Expand'}
            </button>
          </div>
        )}

        {/* Multi-selection Action Bar */}
        {selectionMode && (
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-[#3E4A24]/30 border border-[#9BB848]/30 text-xs">
            <span className="font-medium tabular-nums text-[#DDF0A4]">{multiSelected.size} selected</span>
            <div className="flex items-center gap-1.5">
              {multiSelected.size > 0 && (
                <button
                  type="button"
                  onClick={() => onExportPaths(Array.from(multiSelected))}
                  className="px-2 py-0.5 rounded bg-[#465D18] text-white text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3 h-3" />
                  Export ZIP
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onClearMultiSelect();
                  setSelectionMode(false);
                }}
                className="px-1.5 py-0.5 text-[11px] text-[#9CA38F] hover:text-white"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active Breadcrumb Trail */}
      {breadcrumbs.length > 0 && (
        <div className="px-3 py-1.5 border-b border-black/5 dark:border-white/[0.06] flex items-center gap-1 overflow-x-auto text-[11px] text-[#666C5B] dark:text-[#8E9580] shrink-0">
          <span className="truncate font-mono">{breadcrumbs.join(' / ')}</span>
        </div>
      )}

      {/* Main Scrollable Virtualized Tree / Bookmarks / Recent */}
      {drawerTab === 'tree' ? (
        <div
          ref={containerRef}
          onScroll={(e) => {
            setScrollTop(e.currentTarget.scrollTop);
            cancelLongPress();
          }}
          className="flex-1 overflow-y-auto overflow-x-hidden relative"
        >
          {/* Root Header Row */}
          <div
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ node: root, x: e.clientX, y: e.clientY });
            }}
            className="flex items-center gap-2 px-3 h-8 text-xs font-semibold text-[#181A14] dark:text-[#E4E6DD] border-b border-black/5 dark:border-white/[0.05] sticky top-0 z-10 bg-[#ECEFE6] dark:bg-[#1E2219]"
          >
            <FolderOpen className="w-4 h-4 text-[#9BB848] shrink-0" />
            <span className="flex-1 min-w-0 truncate whitespace-nowrap">{root.name}</span>
            <span className="text-[11px] font-mono tabular-nums text-[#666C5B] dark:text-[#8E9580] shrink-0">
              {root.fileCount.toLocaleString()} files
            </span>
            <button
              type="button"
              aria-label="Root archive actions"
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setContextMenu({ node: root, x: rect.left - 160, y: rect.bottom + 4 });
              }}
              className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 shrink-0"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>

          {flatRows.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#7A816E]">No files match "{filterQuery}".</div>
          ) : (
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div
                style={{
                  transform: `translateY(${startIndex * ROW_HEIGHT}px)`,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                }}
              >
                {visibleRows.map(({ node, depth, isExpanded }) => {
                  const isSelected = selectedPath === node.path;
                  const folderFiles = node.isDirectory ? null : null;
                  void folderFiles;
                  const isChecked = !node.isDirectory && multiSelected.has(node.path);
                  const paddingLeft = 10 + depth * 14;

                  return (
                    <div
                      key={node.id}
                      style={{ height: ROW_HEIGHT, paddingLeft }}
                      title={`${node.path} (Long-press or right-click for actions)`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ node, x: e.clientX, y: e.clientY });
                      }}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        startLongPress(node, e.clientX, e.clientY);
                      }}
                      onPointerMove={(e) => {
                        if (!longPressOriginRef.current) return;
                        const dx = Math.abs(e.clientX - longPressOriginRef.current.x);
                        const dy = Math.abs(e.clientY - longPressOriginRef.current.y);
                        if (dx > 8 || dy > 8) cancelLongPress();
                      }}
                      onPointerUp={() => cancelLongPress()}
                      onPointerCancel={() => cancelLongPress()}
                      onClick={() => {
                        if (suppressNextClickRef.current) {
                          suppressNextClickRef.current = false;
                          return;
                        }
                        if (node.isDirectory) {
                          if (selectionMode) {
                            const entries = collectFolderEntries(node);
                            onSelectManyPaths(entries.map((e) => e.path));
                          } else {
                            onToggleExpand(node.path);
                          }
                        } else if (node.entry) {
                          if (selectionMode) {
                            onToggleMultiSelect(node.path);
                          } else {
                            onOpenFile(node.entry);
                          }
                        }
                      }}
                      className={`group flex items-center gap-1.5 pr-2 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#465D18]/20 dark:bg-[#3E4A24]/70 text-[#181A14] dark:text-[#EAF5B8]'
                          : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04] text-[#282B22] dark:text-[#D5D8CD]'
                      }`}
                    >
                      {selectionMode && !node.isDirectory && (
                        <span className="shrink-0 text-[#9BB848]">
                          {isChecked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5 opacity-60" />}
                        </span>
                      )}

                      {node.isDirectory ? (
                        <span className="w-4 h-4 flex items-center justify-center shrink-0 text-[#7A816E]">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </span>
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}

                      {node.isDirectory ? (
                        isExpanded ? (
                          <FolderOpen className="w-4 h-4 text-[#9BB848] shrink-0" />
                        ) : (
                          <Folder className="w-4 h-4 text-[#9BB848] shrink-0" />
                        )
                      ) : (
                        <FileBadge category={node.entry!.format.category} name={node.name} />
                      )}

                      <span className="flex-1 min-w-0 truncate whitespace-nowrap text-[13px] leading-none">
                        {node.name}
                      </span>

                      <span className="shrink-0 tabular-nums font-mono text-[11px] text-[#6E7463] dark:text-[#888F7A] pl-1">
                        {node.isDirectory ? `${node.fileCount}` : formatBytes(node.size)}
                      </span>

                      <button
                        type="button"
                        aria-label={`Actions for ${node.name}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setContextMenu({ node, x: rect.left - 160, y: rect.bottom + 4 });
                        }}
                        className="p-1 rounded opacity-65 md:opacity-0 md:group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 shrink-0"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : drawerTab === 'bookmarks' ? (
        <div className="flex-1 overflow-y-auto divide-y divide-black/5 dark:divide-white/[0.05]">
          {bookmarks.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#7A816E]">
              No bookmarked files or folders yet. Long-press or open the context menu to bookmark.
            </div>
          ) : (
            bookmarks.map((p) => {
              const entry = entryMap.get(p);
              const folderNode = !entry ? findNodeByPath(p) : null;
              if (!entry && !folderNode) return null;
              return (
                <div
                  key={p}
                  onClick={() => {
                    if (entry) onOpenFile(entry);
                    else if (folderNode) {
                      onExpandFolder(folderNode.path);
                      setDrawerTab('tree');
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                >
                  {entry ? (
                    <FileBadge category={entry.format.category} name={entry.name} />
                  ) : (
                    <Folder className="w-4 h-4 text-[#9BB848] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate whitespace-nowrap">
                      {entry ? entry.name : `${folderNode!.name}/`}
                    </div>
                    <div className="text-[11px] text-[#7A816E] truncate whitespace-nowrap font-mono">{p}</div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleBookmark(p);
                    }}
                    className="p-1 text-[#9BB848]"
                    title="Remove bookmark"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-black/5 dark:divide-white/[0.05]">
          {recentPaths.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#7A816E]">Opened files will appear here for fast switching.</div>
          ) : (
            recentPaths.map((p) => {
              const entry = entryMap.get(p);
              if (!entry) return null;
              return (
                <div
                  key={p}
                  onClick={() => onOpenFile(entry)}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <FileBadge category={entry.format.category} name={entry.name} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate whitespace-nowrap">{entry.name}</div>
                    <div className="text-[11px] text-[#7A816E] truncate whitespace-nowrap font-mono">{entry.path}</div>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-[#7A816E] shrink-0">
                    {formatBytes(entry.size)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Comprehensive Folder & File Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            style={{
              left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 235)),
              top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 400)),
            }}
            className="fixed z-50 w-56 py-1.5 rounded-xl shadow-2xl bg-white dark:bg-[#23271E] border border-black/15 dark:border-white/15 text-xs max-h-[82vh] overflow-y-auto"
          >
            <div className="px-3 py-1 text-[11px] font-mono text-[#7A816E] truncate border-b border-black/10 dark:border-white/10 mb-1">
              {contextMenu.node.isDirectory ? `${contextMenu.node.name}/` : contextMenu.node.name}
            </div>

            {contextMenu.node.isDirectory ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (expandedPaths.has(contextMenu.node.path)) onCollapseFolder(contextMenu.node.path);
                    else onExpandFolder(contextMenu.node.path);
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[#9BB848]" />
                  {expandedPaths.has(contextMenu.node.path) ? 'Collapse Folder' : 'Expand / Open Folder'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDownloadFolderZip(contextMenu.node);
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2 font-medium text-[#465D18] dark:text-[#C5E275]"
                >
                  <FolderArchive className="w-3.5 h-3.5" /> Download as ZIP
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onShowFolderInfo(contextMenu.node);
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                >
                  <Info className="w-3.5 h-3.5 text-sky-400" /> Folder Info, Size &amp; Structure
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onShareNode(contextMenu.node);
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                >
                  <Share2 className="w-3.5 h-3.5" /> Share / Export ZIP
                </button>
                <div className="my-1 border-t border-black/10 dark:border-white/10" />
                <button
                  type="button"
                  onClick={() => {
                    setSelectionMode(true);
                    const entries = collectFolderEntries(contextMenu.node);
                    onSelectManyPaths(entries.map((e) => e.path));
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-[#9BB848]" /> Select All Contents ({contextMenu.node.fileCount})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSearchInFolder(contextMenu.node.path);
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                >
                  <Search className="w-3.5 h-3.5" /> Search Inside Folder
                </button>
                {contextMenu.node.path && (
                  <button
                    type="button"
                    onClick={() => {
                      onCompareNode(contextMenu.node);
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" /> Compare Folders
                  </button>
                )}
                {contextMenu.node.path && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleBookmark(contextMenu.node.path);
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-[#9BB848]" />
                    {bookmarks.includes(contextMenu.node.path) ? 'Remove Folder Bookmark' : 'Bookmark Folder'}
                  </button>
                )}
                <div className="my-1 border-t border-black/10 dark:border-white/10" />
                <button
                  type="button"
                  onClick={() => handleCopy(contextMenu.node.path || contextMenu.node.name)}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy Folder Path
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(contextMenu.node.name)}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy Folder Name
                </button>
              </>
            ) : (
              contextMenu.node.entry && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenFile(contextMenu.node.entry!, 'decoded');
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                  >
                    <FileCode2 className="w-3.5 h-3.5 text-[#9BB848]" /> Open in Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenFile(contextMenu.node.entry!, 'preview');
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-400" /> Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenFile(contextMenu.node.entry!, 'hex');
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                  >
                    <Search className="w-3.5 h-3.5 text-amber-400" /> Hex Inspection
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenFile(contextMenu.node.entry!, 'metadata');
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                  >
                    <Info className="w-3.5 h-3.5" /> View Metadata
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenFile(contextMenu.node.entry!, 'explain');
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-sky-400" /> Explain File
                  </button>
                  <div className="my-1 border-t border-black/10 dark:border-white/10" />
                  <button
                    type="button"
                    onClick={() => {
                      onToggleBookmark(contextMenu.node.entry!.path);
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-[#9BB848]" />
                    {bookmarks.includes(contextMenu.node.entry!.path) ? 'Remove Bookmark' : 'Bookmark File'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCompareNode(contextMenu.node);
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" /> Compare File
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onFindReferences(contextMenu.node.entry!.name.replace(/\.[^.]+$/, ''));
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                  >
                    <Search className="w-3.5 h-3.5" /> Find References
                  </button>
                  <div className="my-1 border-t border-black/10 dark:border-white/10" />
                  <button
                    type="button"
                    onClick={() => handleCopy(contextMenu.node.entry!.path)}
                    className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy Path
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(contextMenu.node.entry!.name)}
                    className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy Filename
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onExportPaths([contextMenu.node.entry!.path]);
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" /> Download / Export
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onShareNode(contextMenu.node);
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Share File
                  </button>
                </>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
