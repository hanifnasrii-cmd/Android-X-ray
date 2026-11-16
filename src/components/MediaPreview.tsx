import { useEffect, useMemo, useState } from 'react';
import { Archive } from 'lucide-react';
import { ApkEntry } from '../types/xray';
import { decodeBinaryXml } from '../engines/axmlDecoder';
import { unpackArchiveBytes } from '../engines/archiveEngine';
import { formatBytes } from './FileBadge';

function extractVectorDrawableSvg(xmlText: string): string | null {
  if (!xmlText.includes('<vector')) return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const vec = doc.querySelector('vector');
    if (!vec) return null;
    const vw = vec.getAttribute('android:viewportWidth') || '24';
    const vh = vec.getAttribute('android:viewportHeight') || '24';
    const paths = Array.from(vec.querySelectorAll('path')).map((p) => {
      const d = p.getAttribute('android:pathData') || '';
      let fill = p.getAttribute('android:fillColor') || '#9BB848';
      if (fill.startsWith('@') || fill.startsWith('?')) fill = '#9BB848';
      const stroke = p.getAttribute('android:strokeColor') || 'none';
      const strokeWidth = p.getAttribute('android:strokeWidth') || '0';
      return `<path d="${d.replace(/"/g, '')}" fill="${fill}" stroke="${stroke.startsWith('@') ? 'none' : stroke}" stroke-width="${strokeWidth}" />`;
    });
    return `<svg viewBox="0 0 ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg" class="w-48 h-48">${paths.join('')}</svg>`;
  } catch {
    return null;
  }
}

export function MediaPreview({ entry }: { entry: ApkEntry }) {
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [fontName, setFontName] = useState<string>('');
  const [fontText, setFontText] = useState('ANDROID X-RAY 0123456789 AaBbCcDdEeFf');

  useEffect(() => {
    const blob = new Blob([new Uint8Array(entry.bytes)], { type: entry.format.mimeType });
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);

    let styleEl: HTMLStyleElement | null = null;
    if (entry.format.category === 'font') {
      const name = `xray-font-${Date.now()}`;
      styleEl = document.createElement('style');
      styleEl.textContent = `@font-face { font-family: '${name}'; src: url('${url}'); }`;
      document.head.appendChild(styleEl);
      setFontName(name);
    }

    return () => {
      URL.revokeObjectURL(url);
      if (styleEl) document.head.removeChild(styleEl);
    };
  }, [entry]);

  const vectorSvg = useMemo(() => {
    if (entry.format.category === 'xml' || entry.format.category === 'axml') {
      const decoded = entry.format.category === 'axml' ? decodeBinaryXml(entry.bytes).xml : new TextDecoder().decode(entry.bytes);
      return extractVectorDrawableSvg(decoded);
    }
    if (entry.format.mimeType === 'image/svg+xml') {
      return new TextDecoder('utf-8', { fatal: false }).decode(entry.bytes);
    }
    return null;
  }, [entry]);

  const nestedArchiveEntries = useMemo(() => {
    if (entry.format.category !== 'archive') return null;
    try {
      return unpackArchiveBytes(entry.name, entry.bytes).entries.slice(0, 200);
    } catch {
      return null;
    }
  }, [entry]);

  if (vectorSvg) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-4 h-full">
        <div
          className="p-8 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#141611] flex items-center justify-center"
          dangerouslySetInnerHTML={{ __html: vectorSvg }}
        />
        <div className="text-xs text-[#7A816E]">Rendered from VectorDrawable / SVG path geometry</div>
      </div>
    );
  }

  if (entry.format.category === 'image' && objectUrl) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-4 h-full overflow-auto">
        <div className="p-6 rounded-xl border border-black/10 dark:border-white/10 bg-[repeating-conic-gradient(#80808022_0%_25%,transparent_0%_50%)] [background-size:16px_16px]">
          <img
            src={objectUrl}
            alt={entry.name}
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[60vh] object-contain"
          />
        </div>
        <div className="text-xs font-mono text-[#7A816E]">
          {entry.format.formatName} · {formatBytes(entry.size)}
        </div>
      </div>
    );
  }

  if (entry.format.category === 'audio' && objectUrl) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-4 h-full">
        <div className="w-full max-w-md p-6 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#1B1E17] space-y-3">
          <div className="text-sm font-semibold truncate">{entry.name}</div>
          <div className="text-xs text-[#7A816E]">
            {entry.format.formatName} · {formatBytes(entry.size)}
          </div>
          <audio controls src={objectUrl} className="w-full" />
        </div>
      </div>
    );
  }

  if (entry.format.category === 'video' && objectUrl) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 h-full">
        <video controls src={objectUrl} className="max-w-full max-h-[65vh] rounded-lg border border-black/10 dark:border-white/10" />
        <div className="text-xs text-[#7A816E]">
          {entry.format.formatName} · {formatBytes(entry.size)}
        </div>
      </div>
    );
  }

  if (entry.format.category === 'font') {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <div className="text-xs text-[#7A816E]">{entry.format.formatName}</div>
        <input
          type="text"
          value={fontText}
          onChange={(e) => setFontText(e.target.value)}
          className="w-full px-3 py-2 text-xs rounded-md bg-white dark:bg-[#141611] border border-black/10 dark:border-white/10"
        />
        <div
          style={{ fontFamily: fontName || 'inherit' }}
          className="p-6 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#1B1E17] space-y-4"
        >
          <p className="text-3xl leading-snug break-words">{fontText}</p>
          <p className="text-lg opacity-80 break-words">{fontText}</p>
          <p className="text-sm opacity-70 break-words">ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 !@#$%^&*()</p>
        </div>
      </div>
    );
  }

  if (entry.format.category === 'document' && entry.format.mimeType === 'application/pdf' && objectUrl) {
    return <iframe title={entry.name} src={objectUrl} className="w-full h-full border-0" />;
  }

  if (entry.format.category === 'archive' && nestedArchiveEntries) {
    return (
      <div className="p-4 overflow-auto h-full">
        <div className="text-xs font-semibold mb-3 flex items-center gap-2">
          <Archive className="w-4 h-4 text-[#9BB848]" />
          Nested Archive Contents ({nestedArchiveEntries.length} entries shown)
        </div>
        <div className="border border-black/10 dark:border-white/10 rounded-lg divide-y divide-black/5 dark:divide-white/[0.06]">
          {nestedArchiveEntries.map((ne) => (
            <div key={ne.path} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
              <span className="font-mono truncate">{ne.path}</span>
              <span className="font-mono tabular-nums text-[#7A816E] shrink-0">{formatBytes(ne.size)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-xs text-[#7A816E]">
      No visual media preview available for {entry.format.formatName}. Switch to Decoded or Hex view.
    </div>
  );
}
