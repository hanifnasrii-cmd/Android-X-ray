import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ApkEntry } from '../types/xray';
import { extractStrings } from '../engines/fileDetectionEngine';

interface HexInspectorProps {
  entry: ApkEntry;
  initialOffset?: number;
}

const BYTES_PER_ROW = 16;
const PAGE_SIZE = 4096;

export function HexInspector({ entry, initialOffset = 0 }: HexInspectorProps) {
  const [pageStart, setPageStart] = useState(() => Math.floor(initialOffset / PAGE_SIZE) * PAGE_SIZE);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMode, setSearchMode] = useState<'ascii' | 'hex'>('ascii');
  const [tab, setTab] = useState<'hex' | 'strings' | 'utf16'>('hex');

  const bytes = entry.bytes;
  const pageBytes = useMemo(
    () => bytes.subarray(pageStart, Math.min(pageStart + PAGE_SIZE, bytes.length)),
    [bytes, pageStart]
  );

  const rows = useMemo(() => {
    const out: Array<{ offset: number; hex: string[]; ascii: string; binaryFirst: string }> = [];
    for (let i = 0; i < pageBytes.length; i += BYTES_PER_ROW) {
      const slice = pageBytes.subarray(i, i + BYTES_PER_ROW);
      const hex: string[] = [];
      let ascii = '';
      for (let j = 0; j < BYTES_PER_ROW; j++) {
        if (j < slice.length) {
          const b = slice[j];
          hex.push(b.toString(16).padStart(2, '0').toUpperCase());
          ascii += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.';
        } else {
          hex.push('  ');
          ascii += ' ';
        }
      }
      out.push({
        offset: pageStart + i,
        hex,
        ascii,
        binaryFirst: slice[0] !== undefined ? slice[0].toString(2).padStart(8, '0') : '',
      });
    }
    return out;
  }, [pageBytes, pageStart]);

  const extractedStrings = useMemo(() => extractStrings(bytes, 4, 500), [bytes]);

  const utf16Preview = useMemo(() => {
    return new TextDecoder('utf-16le', { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, 8192)));
  }, [bytes]);

  const handleFindNext = () => {
    const q = searchTerm.trim();
    if (!q) return;

    let pattern: number[] = [];
    if (searchMode === 'hex') {
      const clean = q.replace(/[^0-9a-fA-F]/g, '');
      for (let i = 0; i + 1 < clean.length; i += 2) {
        pattern.push(parseInt(clean.slice(i, i + 2), 16));
      }
    } else {
      for (let i = 0; i < q.length; i++) pattern.push(q.charCodeAt(i));
    }
    if (pattern.length === 0) return;

    const startFrom = pageStart + 1;
    for (let i = startFrom; i <= bytes.length - pattern.length; i++) {
      let match = true;
      for (let j = 0; j < pattern.length; j++) {
        if (bytes[i + j] !== pattern[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        setPageStart(Math.floor(i / PAGE_SIZE) * PAGE_SIZE);
        return;
      }
    }
    // Wrap from 0
    for (let i = 0; i <= Math.min(startFrom, bytes.length - pattern.length); i++) {
      let match = true;
      for (let j = 0; j < pattern.length; j++) {
        if (bytes[i + j] !== pattern[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        setPageStart(Math.floor(i / PAGE_SIZE) * PAGE_SIZE);
        return;
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Binary Metadata & Controls Bar */}
      <div className="px-4 py-2.5 border-b border-black/10 dark:border-white/[0.08] bg-[#ECEFE6] dark:bg-[#1B1E17] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#5A6050] dark:text-[#9CA38F]">
          <span className="font-mono text-[#181A14] dark:text-[#E4E6DD]">
            Magic: {entry.format.magicHex || 'empty'}
          </span>
          <span>·</span>
          <span className="tabular-nums">Entropy: {entry.format.entropy} / 8.0</span>
          <span>·</span>
          <span className="tabular-nums">{bytes.length.toLocaleString()} bytes</span>
        </div>

        <div className="flex items-center gap-1.5 max-w-full">
          <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-0.5 rounded-md text-xs overflow-x-auto max-w-full">
            {(['hex', 'strings', 'utf16'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap shrink-0 ${
                  tab === t ? 'bg-[#465D18] text-white dark:bg-[#3E4A24] dark:text-[#DDF0A4]' : 'text-[#666C5B] dark:text-[#9CA38F]'
                }`}
              >
                {t === 'hex' ? 'Hex + ASCII' : t === 'strings' ? `Strings (${extractedStrings.length})` : 'UTF-16LE'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'hex' && (
        <>
          <div className="px-3 sm:px-4 py-2 border-b border-black/5 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[#7A816E]" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFindNext()}
                  placeholder={searchMode === 'hex' ? 'Find hex (e.g. 50 4B 03)…' : 'Find ASCII bytes…'}
                  className="pl-7 pr-2 py-1 rounded bg-white dark:bg-[#141611] border border-black/10 dark:border-white/10 text-xs font-mono w-full sm:w-52"
                />
              </div>
              <button
                type="button"
                onClick={() => setSearchMode((m) => (m === 'ascii' ? 'hex' : 'ascii'))}
                className="px-2 py-1 rounded border border-black/10 dark:border-white/10 font-mono text-[11px] uppercase"
              >
                {searchMode}
              </button>
              <button
                type="button"
                onClick={handleFindNext}
                className="px-2.5 py-1 rounded bg-[#465D18] text-white text-xs font-medium"
              >
                Find
              </button>
            </div>

            <div className="flex items-center gap-2 font-mono tabular-nums">
              <button
                type="button"
                disabled={pageStart === 0}
                onClick={() => setPageStart((p) => Math.max(0, p - PAGE_SIZE))}
                className="px-2 py-1 rounded border border-black/10 dark:border-white/10 disabled:opacity-40"
              >
                Prev 4KB
              </button>
              <span>
                0x{pageStart.toString(16).padStart(6, '0')} – 0x
                {Math.min(pageStart + PAGE_SIZE, bytes.length).toString(16).padStart(6, '0')}
              </span>
              <button
                type="button"
                disabled={pageStart + PAGE_SIZE >= bytes.length}
                onClick={() => setPageStart((p) => p + PAGE_SIZE)}
                className="px-2 py-1 rounded border border-black/10 dark:border-white/10 disabled:opacity-40"
              >
                Next 4KB
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-5">
            <div className="min-w-[660px] space-y-0.5">
              {rows.map((r) => (
                <div key={r.offset} className="flex items-center gap-4 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] px-1 rounded">
                  <span className="text-[#8E9580] select-none w-20 shrink-0">
                    0x{r.offset.toString(16).padStart(8, '0')}
                  </span>
                  <span className="text-[#181A14] dark:text-[#D9E0C8] tracking-tight w-[370px] shrink-0">
                    {r.hex.slice(0, 8).join(' ')}
                    <span className="mx-1.5 text-[#7A816E]">|</span>
                    {r.hex.slice(8, 16).join(' ')}
                  </span>
                  <span className="text-[#465D18] dark:text-[#A8C957] whitespace-pre">{r.ascii}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === 'strings' && (
        <div className="flex-1 overflow-auto p-4 font-mono text-xs space-y-1">
          {extractedStrings.length === 0 ? (
            <div className="text-[#7A816E]">No printable ASCII strings (&ge; 4 chars) detected.</div>
          ) : (
            extractedStrings.map((s, idx) => (
              <div key={idx} className="flex items-start gap-3 py-0.5 border-b border-black/5 dark:border-white/[0.04]">
                <button
                  type="button"
                  onClick={() => {
                    setPageStart(Math.floor(s.offset / PAGE_SIZE) * PAGE_SIZE);
                    setTab('hex');
                  }}
                  className="text-[#9BB848] hover:underline shrink-0 tabular-nums"
                >
                  0x{s.offset.toString(16).padStart(6, '0')}
                </button>
                <span className="break-all text-[#181A14] dark:text-[#E4E6DD]">{s.value}</span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'utf16' && (
        <pre className="flex-1 overflow-auto p-4 font-mono text-xs whitespace-pre-wrap break-words text-[#181A14] dark:text-[#E4E6DD]">
          {utf16Preview}
        </pre>
      )}
    </div>
  );
}
