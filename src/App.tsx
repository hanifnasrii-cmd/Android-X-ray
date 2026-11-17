import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Binary,
  Code2,
  Cpu,
  Database,
  FileCode,
  FolderTree,
  GitBranch,
  Layers,
  LayoutGrid,
  Moon,
  Package,
  Palette,
  Search,
  Settings,
  Smartphone,
  Sun,
  Upload,
  X,
} from 'lucide-react';
import {
  ApkEntry,
  ApkProject,
  EditorTab,
  NavSection,
  SearchResult,
  TreeNode,
} from './types/xray';
import { analyzeApkBytes } from './engines/apkPipeline';
import { generateReferenceApkFile } from './engines/referenceApkGenerator';
import {
  collectFolderEntries,
  computeFolderStats,
  exportEntriesAsStreamingZip,
  FolderStats,
  saveBytesWithPicker,
  shareBytesIfSupported,
  ZipExportProgress,
  ZipExportResult,
} from './engines/folderZipExporter';
import { downloadBlob } from './engines/reportExporter';
import { ProjectTree } from './components/ProjectTree';
import { EditorWorkspace } from './components/EditorWorkspace';
import { LibraryPanel } from './components/LibraryPanel';
import { ManifestPanel } from './components/ManifestPanel';
import { DexCodePanel } from './components/DexCodePanel';
import { ResourcesUiPanel } from './components/ResourcesUiPanel';
import { FrameworksNativePanel } from './components/FrameworksNativePanel';
import { SearchPanel } from './components/SearchPanel';
import { GraphReportsSettingsPanel } from './components/GraphReportsSettingsPanel';
import { CompareModal, FolderExportModal, FolderInfoModal } from './components/FolderDialogs';
import { HexInspector } from './components/HexInspector';
import { SqliteViewer } from './components/SqliteViewer';

const NAV_ITEMS: Array<{ id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'library', label: 'Apps', icon: Smartphone },
  { id: 'explorer', label: 'Explorer', icon: FolderTree },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'manifest', label: 'Manifest', icon: FileCode },
  { id: 'code', label: 'Code / DEX', icon: Code2 },
  { id: 'resources', label: 'Resources', icon: LayoutGrid },
  { id: 'ui-arch', label: 'UI Arch', icon: Palette },
  { id: 'frameworks', label: 'Frameworks', icon: Layers },
  { id: 'dependencies', label: 'Deps', icon: Package },
  { id: 'native', label: 'Native ELF', icon: Cpu },
  { id: 'binary', label: 'Binary Hex', icon: Binary },
  { id: 'databases', label: 'Databases', icon: Database },
  { id: 'graph-reports', label: 'Graph & Export', icon: GitBranch },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [section, setSection] = useState<NavSection>('explorer');
  const [projects, setProjects] = useState<ApkProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const [loadingPct, setLoadingPct] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);

  // IDE Explorer & Editor state
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['assets', 'res', 'lib', 'META-INF']));
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<'tree' | 'editor'>('tree');
  const [splitViewEnabled, setSplitViewEnabled] = useState(true);
  const [treeWidth, setTreeWidth] = useState(320);
  const [wordWrap, setWordWrap] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);

  // Search state
  const [searchInitQuery, setSearchInitQuery] = useState('');
  const [searchFolderScope, setSearchFolderScope] = useState<string | null>(null);
  const [latestSearchResults, setLatestSearchResults] = useState<SearchResult[]>([]);

  // Folder / File context modal state
  const [zipModalState, setZipModalState] = useState<{
    targetLabel: string;
    progress: ZipExportProgress | null;
    result: ZipExportResult | null;
    error: string | null;
  } | null>(null);
  const zipAbortRef = useRef<AbortController | null>(null);
  const [folderInfoStats, setFolderInfoStats] = useState<FolderStats | null>(null);
  const [compareModal, setCompareModal] = useState<{ mode: 'folder' | 'file'; leftPath: string } | null>(null);

  // Direct Database / Binary selector when opened from side rail
  const [selectedDbPath, setSelectedDbPath] = useState<string>('');
  const [selectedBinaryPath, setSelectedBinaryPath] = useState<string>('');

  const topFileInputRef = useRef<HTMLInputElement>(null);
  const resizingRef = useRef(false);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || projects[0] || null,
    [projects, activeProjectId]
  );

  const defaultViewModeForEntry = (entry: ApkEntry): EditorTab['viewMode'] => {
    switch (entry.format.category) {
      case 'dex':
        return 'smali';
      case 'sqlite':
        return 'sqlite';
      case 'image':
      case 'audio':
      case 'video':
      case 'font':
      case 'archive':
      case 'document':
        return 'preview';
      case 'binary':
      case 'protobuf':
        return 'hex';
      default:
        return 'decoded';
    }
  };

  const activateProject = useCallback((proj: ApkProject) => {
    setActiveProjectId(proj.id);
    setExpandedPaths(new Set(['assets', 'res', 'lib', 'META-INF']));
    setMultiSelected(new Set());
    const manifestEntry = proj.entryMap.get('AndroidManifest.xml') || proj.entries[0];
    if (manifestEntry) {
      const tab: EditorTab = {
        id: `tab-${manifestEntry.path}`,
        path: manifestEntry.path,
        name: manifestEntry.name,
        viewMode: defaultViewModeForEntry(manifestEntry),
      };
      setTabs([tab]);
      setActiveTabId(tab.id);
    } else {
      setTabs([]);
      setActiveTabId(null);
    }
  }, []);

  const loadReferenceApk = useCallback(async () => {
    try {
      setImportError(null);
      setLoadingStage('Building binary reference APK…');
      setLoadingPct(15);
      const { fileName, bytes } = await generateReferenceApkFile();
      const proj = await analyzeApkBytes(fileName, bytes, {
        isReferenceFixture: true,
        onProgress: (stage, pct) => {
          setLoadingStage(stage);
          setLoadingPct(pct);
        },
      });
      setProjects((prev) => [proj, ...prev.filter((p) => !p.isReferenceFixture)]);
      activateProject(proj);
      setLoadingStage(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
      setLoadingStage(null);
    }
  }, [activateProject]);

  // Load real binary reference APK on initial boot
  useEffect(() => {
    loadReferenceApk();
  }, [loadReferenceApk]);

  const handleImportFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setImportError(null);

    for (const file of files) {
      try {
        setLoadingStage(`Reading ${file.name}…`);
        setLoadingPct(5);
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const proj = await analyzeApkBytes(file.name, bytes, {
          onProgress: (stage, pct) => {
            setLoadingStage(`${file.name}: ${stage}`);
            setLoadingPct(pct);
          },
        });
        setProjects((prev) => [proj, ...prev]);
        activateProject(proj);
        setSection('explorer');
      } catch (err) {
        setImportError(`Failed to inspect ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setLoadingStage(null);
  };

  const handleOpenFile = useCallback(
    (entry: ApkEntry, mode?: EditorTab['viewMode'], targetLine?: number, targetOffset?: number) => {
      const resolvedMode = mode || defaultViewModeForEntry(entry);
      const tabId = `tab-${entry.path}`;
      setTabs((prev) => {
        const exists = prev.find((t) => t.id === tabId);
        if (exists) {
          return prev.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  viewMode: mode ? resolvedMode : t.viewMode,
                  targetLine,
                  targetOffset,
                }
              : t
          );
        }
        return [
          ...prev,
          {
            id: tabId,
            path: entry.path,
            name: entry.name,
            viewMode: resolvedMode,
            targetLine,
            targetOffset,
          },
        ];
      });
      setActiveTabId(tabId);
      setRecentPaths((prev) => [entry.path, ...prev.filter((p) => p !== entry.path)].slice(0, 20));

      // Expand parent folders so breadcrumb & tree highlight match
      if (entry.dir) {
        const parts = entry.dir.split('/');
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          let cur = '';
          for (const part of parts) {
            cur = cur ? `${cur}/${part}` : part;
            next.add(cur);
          }
          return next;
        });
      }

      setSection('explorer');
      setMobilePane('editor');
    },
    []
  );

  const handleJumpToPath = useCallback(
    (path: string, line?: number) => {
      if (!activeProject) return;
      const entry = activeProject.entryMap.get(path);
      if (entry) handleOpenFile(entry, undefined, line);
    },
    [activeProject, handleOpenFile]
  );

  const handleStartFolderZip = async (folderNode: TreeNode) => {
    const entries = collectFolderEntries(folderNode);
    const archiveBase = (folderNode.name || 'archive').replace(/\.[^.]+$/, '');
    const archiveName = `${archiveBase}.zip`;
    const controller = new AbortController();
    zipAbortRef.current = controller;

    setZipModalState({
      targetLabel: folderNode.path ? `${folderNode.path}/` : `${folderNode.name}/`,
      progress: {
        currentFile: 'Preparing entries…',
        processedFiles: 0,
        totalFiles: entries.length,
        processedBytes: 0,
        totalBytes: entries.reduce((a, b) => a + b.size, 0),
        percent: 0,
      },
      result: null,
      error: null,
    });

    try {
      const result = await exportEntriesAsStreamingZip(
        entries,
        folderNode.path,
        archiveName,
        controller.signal,
        (prog) => {
          setZipModalState((prev) => (prev ? { ...prev, progress: prog } : prev));
        }
      );
      setZipModalState((prev) => (prev ? { ...prev, result } : prev));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setZipModalState(null);
      } else {
        setZipModalState((prev) =>
          prev ? { ...prev, error: err instanceof Error ? err.message : String(err) } : prev
        );
      }
    }
  };

  const handleExportPaths = async (paths: string[]) => {
    if (!activeProject || paths.length === 0) return;
    if (paths.length === 1) {
      const entry = activeProject.entryMap.get(paths[0]);
      if (entry) {
        downloadBlob(entry.name, entry.bytes, entry.format.mimeType);
      }
      return;
    }

    const entries = paths
      .map((p) => activeProject.entryMap.get(p))
      .filter((e): e is ApkEntry => Boolean(e));
    const controller = new AbortController();
    zipAbortRef.current = controller;
    setZipModalState({
      targetLabel: `${entries.length} selected file(s)`,
      progress: {
        currentFile: 'Compressing selected files…',
        processedFiles: 0,
        totalFiles: entries.length,
        processedBytes: 0,
        totalBytes: entries.reduce((a, b) => a + b.size, 0),
        percent: 0,
      },
      result: null,
      error: null,
    });
    try {
      const result = await exportEntriesAsStreamingZip(
        entries,
        '',
        'selected-files.zip',
        controller.signal,
        (prog) => setZipModalState((prev) => (prev ? { ...prev, progress: prog } : prev))
      );
      setZipModalState((prev) => (prev ? { ...prev, result } : prev));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') setZipModalState(null);
      else setZipModalState((prev) => (prev ? { ...prev, error: String(err) } : prev));
    }
  };

  const handleShareNode = async (node: TreeNode) => {
    if (!node.isDirectory && node.entry) {
      const shared = await shareBytesIfSupported(node.entry.name, node.entry.bytes, node.entry.format.mimeType).catch(
        () => false
      );
      if (!shared) {
        downloadBlob(node.entry.name, node.entry.bytes, node.entry.format.mimeType);
      }
      return;
    }
    await handleStartFolderZip(node);
  };

  // Resizable Split Pane pointer handler
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = Math.max(240, Math.min(540, e.clientX - 64));
      setTreeWidth(next);
    };
    const onUp = () => {
      resizingRef.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const dbEntries = useMemo(
    () => activeProject?.entries.filter((e) => e.format.category === 'sqlite') || [],
    [activeProject]
  );

  const activeTabEntry = useMemo(() => {
    const t = tabs.find((x) => x.id === activeTabId);
    return t && activeProject ? activeProject.entryMap.get(t.path) : undefined;
  }, [tabs, activeTabId, activeProject]);

  const binaryTargetEntry = useMemo(() => {
    if (!activeProject) return undefined;
    if (selectedBinaryPath) {
      const found = activeProject.entryMap.get(selectedBinaryPath);
      if (found) return found;
    }
    return activeTabEntry || activeProject.entries.find((e) => !e.format.isText) || activeProject.entries[0];
  }, [activeProject, selectedBinaryPath, activeTabEntry]);

  const isMoreSectionActive =
    section === 'resources' ||
    section === 'ui-arch' ||
    section === 'frameworks' ||
    section === 'dependencies' ||
    section === 'native' ||
    section === 'binary' ||
    section === 'databases' ||
    section === 'graph-reports' ||
    section === 'settings';

  return (
    <div className="h-[100dvh] w-full max-w-[100vw] flex flex-col overflow-hidden bg-[#F6F7F2] dark:bg-[#141611] text-[#181A14] dark:text-[#E4E6DD]">
      {/* Strict 3-Zone Top Bar with Android Safe-Area Inset */}
      <header className="border-b border-black/10 dark:border-white/[0.08] bg-[#ECEFE6] dark:bg-[#1C1F18] safe-pt shrink-0">
        <div className="h-12 px-3 sm:px-4 flex items-center justify-between gap-3 min-w-0">
          {/* Zone 1: Single-element Brand Wordmark */}
          <span className="text-sm font-bold tracking-tight whitespace-nowrap shrink-0 text-[#181A14] dark:text-[#EAF5B8]">
            ANDROID X-RAY
          </span>

          {/* Zone 2: Concise Single-Line Primary Nav Links */}
          <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-[#5A6050] dark:text-[#9CA38F]">
            {(
              [
                ['explorer', 'Project Explorer'],
                ['manifest', 'Manifest'],
                ['code', 'DEX / Smali'],
                ['search', 'Global Search'],
                ['graph-reports', 'Architecture'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#181A14] dark:hover:text-white ${
                  section === id ? 'text-[#465D18] dark:text-[#B9D85D] underline underline-offset-4' : ''
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => topFileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg bg-[#465D18] hover:bg-[#3B4E14] dark:bg-[#9BB848] dark:hover:bg-[#ACC85B] text-white dark:text-[#141611] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" /> Import APK
            </button>
            <input
              ref={topFileInputRef}
              type="file"
              multiple
              accept=".apk,.apks,.xapk,.aab,.zip,.jar,.dex,.so,.arsc,.xml,.db,.sqlite"
              onChange={(e) => {
                if (e.target.files?.length) handleImportFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
          </div>
        </div>
      </header>

      {/* Error / Progress Banner */}
      {(importError || loadingStage) && (
        <div className="px-4 py-1.5 text-xs border-b border-black/10 dark:border-white/10 bg-[#ECEFE6] dark:bg-[#22261C] flex items-center justify-between gap-4 shrink-0">
          {importError ? (
            <span className="text-rose-500">{importError}</span>
          ) : (
            <span className="font-mono text-[#465D18] dark:text-[#B9D85D]">
              {loadingStage} ({loadingPct}%)
            </span>
          )}
          {importError && (
            <button type="button" onClick={() => setImportError(null)} className="underline">
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Main IDE Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Compact Activity Rail (Desktop & Tablet) */}
        <aside className="hidden md:flex w-16 flex-col items-center py-2 gap-1 border-r border-black/10 dark:border-white/[0.08] bg-[#ECEFE6] dark:bg-[#191C15] overflow-y-auto shrink-0">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                onClick={() => setSection(item.id)}
                className={`w-13 py-1.5 rounded-lg flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors shrink-0 ${
                  active
                    ? 'bg-[#465D18] text-white dark:bg-[#3E4A24] dark:text-[#DDF0A4]'
                    : 'text-[#5A6050] dark:text-[#8E9580] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="truncate max-w-[50px]">{item.label.split(' ')[0]}</span>
              </button>
            );
          })}

          <div className="mt-auto pt-2">
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              title="Toggle Light / Dark Theme"
              className="w-10 h-10 rounded-lg flex items-center justify-center text-[#5A6050] dark:text-[#9CA38F] hover:bg-black/5 dark:hover:bg-white/5"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </aside>

        {/* Active Module Viewport */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
          {section === 'library' && (
            <LibraryPanel
              projects={projects}
              activeProjectId={activeProject?.id || null}
              loadingStage={loadingStage}
              loadingPct={loadingPct}
              onImportFiles={handleImportFiles}
              onLoadReferenceApk={loadReferenceApk}
              onDownloadReferenceApk={async () => {
                const { fileName, bytes } = await generateReferenceApkFile();
                downloadBlob(fileName, bytes, 'application/vnd.android.package-archive');
              }}
              onSelectProject={(id) => {
                const found = projects.find((p) => p.id === id);
                if (found) activateProject(found);
              }}
              onRemoveProject={(id) => {
                setProjects((prev) => prev.filter((p) => p.id !== id));
                if (activeProjectId === id) setActiveProjectId(null);
              }}
              onClearAll={() => {
                setProjects([]);
                setActiveProjectId(null);
                setTabs([]);
              }}
              onOpenExplorer={() => setSection('explorer')}
            />
          )}

          {section === 'explorer' && activeProject && (
            <div className="flex-1 flex min-h-0 overflow-hidden">
              {/* Project Tree Pane */}
              <div
                style={{ width: splitViewEnabled ? undefined : '100%' }}
                className={`${
                  splitViewEnabled
                    ? `${mobilePane === 'tree' ? 'flex' : 'hidden'} md:flex w-full md:w-auto shrink-0`
                    : `${mobilePane === 'tree' ? 'flex w-full' : 'hidden'}`
                } flex-col h-full`}
              >
                <div
                  style={{ width: typeof window !== 'undefined' && window.innerWidth >= 768 && splitViewEnabled ? treeWidth : '100%' }}
                  className="h-full w-full"
                >
                  <ProjectTree
                    root={activeProject.tree}
                    selectedPath={tabs.find((t) => t.id === activeTabId)?.path || null}
                    expandedPaths={expandedPaths}
                    onToggleExpand={(path) =>
                      setExpandedPaths((prev) => {
                        const next = new Set(prev);
                        if (next.has(path)) next.delete(path);
                        else next.add(path);
                        return next;
                      })
                    }
                    onExpandFolder={(path) =>
                      setExpandedPaths((prev) => new Set(prev).add(path))
                    }
                    onCollapseFolder={(path) =>
                      setExpandedPaths((prev) => {
                        const next = new Set(prev);
                        next.delete(path);
                        return next;
                      })
                    }
                    onExpandAllTop={() =>
                      setExpandedPaths(
                        new Set(activeProject.tree.children.filter((c) => c.isDirectory).map((c) => c.path))
                      )
                    }
                    onCollapseAll={() => setExpandedPaths(new Set())}
                    onOpenFile={(entry, mode) => handleOpenFile(entry, mode)}
                    bookmarks={bookmarks}
                    onToggleBookmark={(p) =>
                      setBookmarks((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
                    }
                    recentPaths={recentPaths}
                    multiSelected={multiSelected}
                    onToggleMultiSelect={(p) =>
                      setMultiSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(p)) next.delete(p);
                        else next.add(p);
                        return next;
                      })
                    }
                    onSelectManyPaths={(paths) =>
                      setMultiSelected((prev) => {
                        const next = new Set(prev);
                        paths.forEach((p) => next.add(p));
                        return next;
                      })
                    }
                    onClearMultiSelect={() => setMultiSelected(new Set())}
                    onExportPaths={handleExportPaths}
                    onDownloadFolderZip={handleStartFolderZip}
                    onShareNode={handleShareNode}
                    onShowFolderInfo={(node) => setFolderInfoStats(computeFolderStats(node))}
                    onCompareNode={(node) =>
                      setCompareModal({
                        mode: node.isDirectory ? 'folder' : 'file',
                        leftPath: node.path,
                      })
                    }
                    onSearchInFolder={(folderPath) => {
                      setSearchFolderScope(folderPath || null);
                      setSection('search');
                    }}
                    onFindReferences={(term) => {
                      setSearchInitQuery(term);
                      setSearchFolderScope(null);
                      setSection('search');
                    }}
                    entryMap={activeProject.entryMap}
                  />
                </div>
              </div>

              {/* Resizable Split Divider (Desktop / Tablet) */}
              {splitViewEnabled && (
                <div
                  onMouseDown={() => {
                    resizingRef.current = true;
                  }}
                  title="Drag to resize Project Explorer"
                  className="hidden md:block w-1 cursor-col-resize bg-transparent hover:bg-[#9BB848]/50 transition-colors shrink-0"
                />
              )}

              {/* Editor Workspace Pane */}
              <div
                className={`${
                  splitViewEnabled
                    ? `${mobilePane === 'editor' ? 'flex' : 'hidden'} md:flex flex-1 min-w-0`
                    : `${mobilePane === 'editor' ? 'flex flex-1 min-w-0' : 'hidden'}`
                } flex-col h-full`}
              >
                <EditorWorkspace
                  project={activeProject}
                  tabs={tabs}
                  activeTabId={activeTabId}
                  onSelectTab={(id) => setActiveTabId(id)}
                  onCloseTab={(id) => {
                    setTabs((prev) => {
                      const next = prev.filter((t) => t.id !== id);
                      if (activeTabId === id) {
                        setActiveTabId(next[next.length - 1]?.id || null);
                      }
                      if (next.length === 0) setMobilePane('tree');
                      return next;
                    });
                  }}
                  onChangeTabMode={(id, mode) =>
                    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, viewMode: mode } : t)))
                  }
                  onBackToTree={() => setMobilePane('tree')}
                  onJumpToFile={(path) => handleJumpToPath(path)}
                  wordWrap={wordWrap}
                  onToggleWordWrap={() => setWordWrap((w) => !w)}
                  showLineNumbers={showLineNumbers}
                />
              </div>
            </div>
          )}

          {section === 'explorer' && !activeProject && (
            <div className="p-8 text-center text-xs text-[#7A816E]">
              No APK loaded. Open Apps Library to import an APK or load the reference binary.
            </div>
          )}

          {section === 'search' && activeProject && (
            <SearchPanel
              project={activeProject}
              initialQuery={searchInitQuery}
              folderScope={searchFolderScope}
              onClearFolderScope={() => setSearchFolderScope(null)}
              onResultsUpdate={setLatestSearchResults}
              onOpenSearchResult={(res) => {
                const entry = activeProject.entryMap.get(res.item.path);
                if (entry) {
                  handleOpenFile(entry, undefined, res.item.line, res.item.offset);
                }
              }}
            />
          )}

          {section === 'manifest' && activeProject && (
            <ManifestPanel
              project={activeProject}
              onOpenManifestLine={(line) => handleJumpToPath('AndroidManifest.xml', line)}
            />
          )}

          {section === 'code' && activeProject && <DexCodePanel project={activeProject} />}

          {(section === 'resources' || section === 'ui-arch') && activeProject && (
            <ResourcesUiPanel
              mode={section}
              project={activeProject}
              onOpenEntry={(entry) => handleOpenFile(entry)}
            />
          )}

          {(section === 'frameworks' || section === 'dependencies' || section === 'native') && activeProject && (
            <FrameworksNativePanel
              mode={section}
              project={activeProject}
              onOpenEntry={(entry) => handleOpenFile(entry)}
            />
          )}

          {section === 'binary' && activeProject && (
            <div className="flex flex-col h-full min-w-0">
              <div className="px-3 sm:px-4 py-2 border-b border-black/10 dark:border-white/[0.08] bg-[#ECEFE6] dark:bg-[#1C1F18] flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold shrink-0">Binary Inspector File:</span>
                <select
                  value={binaryTargetEntry?.path || ''}
                  onChange={(e) => setSelectedBinaryPath(e.target.value)}
                  className="flex-1 min-w-0 max-w-full sm:max-w-md px-2.5 py-1.5 rounded bg-white dark:bg-[#141611] border border-black/10 dark:border-white/10 font-mono"
                >
                  {activeProject.entries.slice(0, 500).map((e) => (
                    <option key={e.path} value={e.path}>
                      {e.path} ({e.format.formatName})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 overflow-hidden">
                {binaryTargetEntry ? (
                  <HexInspector entry={binaryTargetEntry} />
                ) : (
                  <div className="p-8 text-xs text-[#7A816E]">No files in archive.</div>
                )}
              </div>
            </div>
          )}

          {section === 'databases' && activeProject && (
            <div className="flex flex-col h-full min-w-0">
              {dbEntries.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#7A816E]">
                  No SQLite database files (.db / .sqlite) detected in {activeProject.fileName}.
                </div>
              ) : (
                <>
                  <div className="px-3 sm:px-4 py-2 border-b border-black/10 dark:border-white/[0.08] bg-[#ECEFE6] dark:bg-[#1C1F18] flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold shrink-0">SQLite Database:</span>
                    <select
                      value={selectedDbPath || dbEntries[0].path}
                      onChange={(e) => setSelectedDbPath(e.target.value)}
                      className="flex-1 min-w-0 max-w-full sm:max-w-md px-2.5 py-1.5 rounded bg-white dark:bg-[#141611] border border-black/10 dark:border-white/10 font-mono"
                    >
                      {dbEntries.map((d) => (
                        <option key={d.path} value={d.path}>
                          {d.path}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <SqliteViewer
                      entry={
                        dbEntries.find((d) => d.path === selectedDbPath) || dbEntries[0]
                      }
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {(section === 'graph-reports' || section === 'settings') && (
            <GraphReportsSettingsPanel
              mode={section}
              project={activeProject}
              searchResults={latestSearchResults}
              onJumpToNode={handleJumpToPath}
              darkMode={darkMode}
              onToggleDarkMode={() => setDarkMode((d) => !d)}
              wordWrap={wordWrap}
              onToggleWordWrap={() => setWordWrap((w) => !w)}
              showLineNumbers={showLineNumbers}
              onToggleLineNumbers={() => setShowLineNumbers((s) => !s)}
              splitViewEnabled={splitViewEnabled}
              onToggleSplitView={() => setSplitViewEnabled((v) => !v)}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation (Thumb Zone with Android Gesture-Bar Safe Area) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 min-h-[3.5rem] pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))] bg-[#ECEFE6]/95 dark:bg-[#1C1F18]/95 backdrop-blur-md border-t border-black/10 dark:border-white/[0.08] flex items-center justify-around px-1">
        {(
          [
            ['library', 'Apps', Smartphone],
            ['explorer', 'Explorer', FolderTree],
            ['search', 'Search', Search],
            ['manifest', 'Manifest', FileCode],
            ['code', 'DEX', Code2],
          ] as const
        ).map(([id, label, Icon]) => {
          const active = section === id && !moreDrawerOpen;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMoreDrawerOpen(false);
                setSection(id);
              }}
              className={`min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                active ? 'text-[#465D18] dark:text-[#B9D85D]' : 'text-[#5A6050] dark:text-[#8E9580]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreDrawerOpen((o) => !o)}
          className={`min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            moreDrawerOpen || isMoreSectionActive
              ? 'text-[#465D18] dark:text-[#B9D85D]'
              : 'text-[#5A6050] dark:text-[#8E9580]'
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile Modules Bottom Sheet */}
      {moreDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div
            className="flex-1 bg-black/50 backdrop-blur-[1px]"
            onClick={() => setMoreDrawerOpen(false)}
          />
          <div className="bg-[#ECEFE6] dark:bg-[#1C1F18] border-t border-black/10 dark:border-white/10 rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-2xl space-y-3 max-h-[75dvh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2 pb-1 border-b border-black/10 dark:border-white/10">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5A6050] dark:text-[#9CA38F]">
                Inspection Modules
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDarkMode((d) => !d)}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg border border-black/15 dark:border-white/15 text-xs font-medium flex items-center gap-1.5"
                >
                  {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
                  {darkMode ? 'Light' : 'Dark'}
                </button>
                <button
                  type="button"
                  onClick={() => setMoreDrawerOpen(false)}
                  aria-label="Close modules menu"
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {NAV_ITEMS.filter((item) =>
                ['resources', 'ui-arch', 'frameworks', 'dependencies', 'native', 'binary', 'databases', 'graph-reports', 'settings'].includes(
                  item.id
                )
              ).map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSection(item.id);
                      setMoreDrawerOpen(false);
                    }}
                    className={`min-h-[60px] p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-center text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-[#465D18] text-white border-[#465D18] dark:bg-[#3E4A24] dark:text-[#DDF0A4] dark:border-[#9BB848]/40'
                        : 'bg-white/60 dark:bg-[#141611] border-black/10 dark:border-white/[0.08] text-[#181A14] dark:text-[#DCE0D2]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modals for Streaming Folder ZIP, Folder Info, and Compare */}
      {zipModalState && (
        <FolderExportModal
          targetLabel={zipModalState.targetLabel}
          progress={zipModalState.progress}
          result={zipModalState.result}
          error={zipModalState.error}
          onCancel={() => {
            zipAbortRef.current?.abort();
            setZipModalState(null);
          }}
          onDownload={() => {
            if (zipModalState.result) {
              downloadBlob(
                zipModalState.result.archiveName,
                zipModalState.result.zipBytes,
                'application/zip'
              );
            }
          }}
          onSaveAs={async () => {
            if (zipModalState.result) {
              await saveBytesWithPicker(
                zipModalState.result.archiveName,
                zipModalState.result.zipBytes,
                'application/zip'
              ).catch(() => {});
            }
          }}
          onShare={async () => {
            if (zipModalState.result) {
              const ok = await shareBytesIfSupported(
                zipModalState.result.archiveName,
                zipModalState.result.zipBytes,
                'application/zip'
              ).catch(() => false);
              if (!ok) {
                downloadBlob(
                  zipModalState.result.archiveName,
                  zipModalState.result.zipBytes,
                  'application/zip'
                );
              }
            }
          }}
          onClose={() => setZipModalState(null)}
        />
      )}

      {folderInfoStats && (
        <FolderInfoModal
          stats={folderInfoStats}
          onDownloadZip={() => {
            const targetPath = folderInfoStats.folderPath === '(root)' ? '' : folderInfoStats.folderPath;
            setFolderInfoStats(null);
            if (!activeProject) return;
            const findFolder = (n: TreeNode): TreeNode | null => {
              if (n.isDirectory && n.path === targetPath) return n;
              for (const c of n.children) {
                const hit = findFolder(c);
                if (hit) return hit;
              }
              return null;
            };
            const node = findFolder(activeProject.tree);
            if (node) handleStartFolderZip(node);
          }}
          onClose={() => setFolderInfoStats(null)}
        />
      )}

      {compareModal && activeProject && (
        <CompareModal
          mode={compareModal.mode}
          rootTree={activeProject.tree}
          entries={activeProject.entries}
          initialLeftPath={compareModal.leftPath}
          onClose={() => setCompareModal(null)}
        />
      )}
    </div>
  );
}
