import {
  Archive,
  Binary,
  Code2,
  Database,
  FileCode,
  FileImage,
  FileText,
  Film,
  KeyRound,
  Music,
  ShieldCheck,
  Type,
} from 'lucide-react';
import { FileCategory } from '../types/xray';

export function FileBadge({ category, name }: { category: FileCategory; name: string }) {
  const lower = name.toLowerCase();

  if (category === 'manifest') {
    return (
      <span className="w-4 h-4 rounded-[3px] bg-[#465D18]/25 text-[#A9CC52] border border-[#9BB848]/30 flex items-center justify-center text-[9px] font-bold shrink-0">
        M
      </span>
    );
  }
  if (category === 'dex') {
    return (
      <span className="w-4 h-4 rounded-[3px] bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-[9px] font-bold shrink-0">
        D
      </span>
    );
  }
  if (category === 'arsc') {
    return (
      <span className="w-4 h-4 rounded-[3px] bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center text-[9px] font-bold shrink-0">
        R
      </span>
    );
  }
  if (category === 'elf') {
    return (
      <span className="w-4 h-4 rounded-[3px] bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center text-[9px] font-bold shrink-0">
        SO
      </span>
    );
  }
  if (category === 'sqlite') {
    return <Database className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
  }
  if (category === 'axml' || category === 'xml') {
    return <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  }
  if (category === 'code') {
    if (lower.endsWith('.kt') || lower.endsWith('.kts')) {
      return (
        <span className="w-4 h-4 rounded-[3px] bg-violet-500/20 text-violet-300 border border-violet-500/30 flex items-center justify-center text-[9px] font-bold shrink-0">
          K
        </span>
      );
    }
    if (lower.endsWith('.json')) {
      return (
        <span className="w-4 h-4 rounded-[3px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 flex items-center justify-center text-[9px] font-bold shrink-0">
          {'{}'}
        </span>
      );
    }
    return <Code2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
  }
  if (category === 'image') return <FileImage className="w-3.5 h-3.5 text-lime-400 shrink-0" />;
  if (category === 'audio') return <Music className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
  if (category === 'video') return <Film className="w-3.5 h-3.5 text-orange-400 shrink-0" />;
  if (category === 'font') return <Type className="w-3.5 h-3.5 text-stone-300 shrink-0" />;
  if (category === 'archive') return <Archive className="w-3.5 h-3.5 text-amber-300 shrink-0" />;
  if (category === 'cert') {
    return lower.endsWith('.rsa') || lower.endsWith('.dsa') || lower.endsWith('.ec') ? (
      <KeyRound className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
    ) : (
      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
    );
  }
  if (category === 'text' || category === 'document') return <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />;
  return <Binary className="w-3.5 h-3.5 text-stone-400 shrink-0" />;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
