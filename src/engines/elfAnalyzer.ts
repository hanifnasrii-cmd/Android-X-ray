import { ElfAnalysis, ElfSectionInfo, ElfSegmentInfo, ElfSymbolInfo } from '../types/xray';
import { extractStrings } from './fileDetectionEngine';

const MACHINE_NAMES: Record<number, { name: string; abi: string }> = {
  0x03: { name: 'Intel 80386 (x86)', abi: 'x86' },
  0x28: { name: 'ARM 32-bit (EABI)', abi: 'armeabi-v7a' },
  0x3e: { name: 'AMD x86-64', abi: 'x86_64' },
  0xb7: { name: 'ARM AArch64 (64-bit)', abi: 'arm64-v8a' },
  0xf3: { name: 'RISC-V', abi: 'riscv64' },
};

const ELF_TYPES: Record<number, string> = {
  0: 'ET_NONE',
  1: 'ET_REL (Relocatable)',
  2: 'ET_EXEC (Executable)',
  3: 'ET_DYN (Shared Object / PIE)',
  4: 'ET_CORE',
};

const SECTION_TYPES: Record<number, string> = {
  0: 'SHT_NULL',
  1: 'SHT_PROGBITS',
  2: 'SHT_SYMTAB',
  3: 'SHT_STRTAB',
  4: 'SHT_RELA',
  5: 'SHT_HASH',
  6: 'SHT_DYNAMIC',
  7: 'SHT_NOTE',
  8: 'SHT_NOBITS',
  9: 'SHT_REL',
  11: 'SHT_DYNSYM',
  14: 'SHT_INIT_ARRAY',
  15: 'SHT_FINI_ARRAY',
};

const SEGMENT_TYPES: Record<number, string> = {
  0: 'PT_NULL',
  1: 'PT_LOAD',
  2: 'PT_DYNAMIC',
  3: 'PT_INTERP',
  4: 'PT_NOTE',
  6: 'PT_PHDR',
  7: 'PT_TLS',
  0x6474e550: 'PT_GNU_EH_FRAME',
  0x6474e551: 'PT_GNU_STACK',
  0x6474e552: 'PT_GNU_RELRO',
};

function readCString(bytes: Uint8Array, start: number, limit: number): string {
  if (start < 0 || start >= limit) return '';
  let end = start;
  while (end < limit && bytes[end] !== 0 && end - start < 512) {
    end++;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(start, end));
}

function readU64Hex(view: DataView, offset: number, le: boolean): string {
  const lo = view.getUint32(le ? offset : offset + 4, le);
  const hi = view.getUint32(le ? offset + 4 : offset, le);
  if (hi === 0) return `0x${lo.toString(16)}`;
  return `0x${hi.toString(16)}${lo.toString(16).padStart(8, '0')}`;
}

function readU64Num(view: DataView, offset: number, le: boolean): number {
  const lo = view.getUint32(le ? offset : offset + 4, le);
  const hi = view.getUint32(le ? offset + 4 : offset, le);
  return hi * 0x100000000 + lo;
}

export function analyzeElfBinary(filePath: string, bytes: Uint8Array): ElfAnalysis {
  if (bytes.length < 52 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46) {
    return {
      filePath,
      isValid: false,
      error: 'Invalid ELF magic bytes.',
      bits: 64,
      endianness: 'Little Endian',
      elfType: 'Unknown',
      machine: 'Unknown',
      abiGuess: 'unknown',
      entryPoint: '0x0',
      buildId: 'N/A',
      hasDebugSections: false,
      segments: [],
      sections: [],
      neededLibraries: [],
      importedSymbols: [],
      exportedSymbols: [],
      extractedStrings: [],
    };
  }

  const eiClass = bytes[4];
  const bits: 32 | 64 = eiClass === 2 ? 64 : 32;
  const le = bytes[5] !== 2;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const eType = view.getUint16(16, le);
  const eMachine = view.getUint16(18, le);
  const machineMeta = MACHINE_NAMES[eMachine] || { name: `Machine 0x${eMachine.toString(16)}`, abi: 'unknown' };

  const entryPoint = bits === 64 ? readU64Hex(view, 24, le) : `0x${view.getUint32(24, le).toString(16)}`;
  const phoff = bits === 64 ? readU64Num(view, 32, le) : view.getUint32(28, le);
  const shoff = bits === 64 ? readU64Num(view, 40, le) : view.getUint32(32, le);
  const phentsize = view.getUint16(bits === 64 ? 54 : 42, le);
  const phnum = view.getUint16(bits === 64 ? 56 : 44, le);
  const shentsize = view.getUint16(bits === 64 ? 58 : 46, le);
  const shnum = view.getUint16(bits === 64 ? 60 : 48, le);
  const shstrndx = view.getUint16(bits === 64 ? 62 : 50, le);

  // Program Headers
  const segments: ElfSegmentInfo[] = [];
  for (let i = 0; i < Math.min(phnum, 64); i++) {
    const off = phoff + i * phentsize;
    if (off + phentsize > bytes.length) break;
    const pType = view.getUint32(off, le);
    const pFlags = bits === 64 ? view.getUint32(off + 4, le) : view.getUint32(off + 24, le);
    const pOffset = bits === 64 ? readU64Num(view, off + 8, le) : view.getUint32(off + 4, le);
    const pVaddr = bits === 64 ? readU64Hex(view, off + 16, le) : `0x${view.getUint32(off + 8, le).toString(16)}`;
    const pFilesz = bits === 64 ? readU64Num(view, off + 32, le) : view.getUint32(off + 16, le);
    const pMemsz = bits === 64 ? readU64Num(view, off + 40, le) : view.getUint32(off + 20, le);
    const pAlign = bits === 64 ? readU64Num(view, off + 48, le) : view.getUint32(off + 28, le);

    const flagsStr = `${pFlags & 4 ? 'R' : '-'}${pFlags & 2 ? 'W' : '-'}${pFlags & 1 ? 'X' : '-'}`;
    segments.push({
      type: SEGMENT_TYPES[pType] || `0x${pType.toString(16)}`,
      flags: flagsStr,
      offset: pOffset,
      vaddr: pVaddr,
      fileSize: pFilesz,
      memSize: pMemsz,
      align: pAlign,
    });
  }

  // Section Headers
  const rawSections: Array<{
    nameOff: number;
    typeNum: number;
    flagsNum: number;
    addr: string;
    offset: number;
    size: number;
    link: number;
    entsize: number;
  }> = [];

  for (let i = 0; i < Math.min(shnum, 256); i++) {
    const off = shoff + i * shentsize;
    if (off + shentsize > bytes.length) break;
    const nameOff = view.getUint32(off, le);
    const typeNum = view.getUint32(off + 4, le);
    const flagsNum = bits === 64 ? readU64Num(view, off + 8, le) : view.getUint32(off + 8, le);
    const addr = bits === 64 ? readU64Hex(view, off + 16, le) : `0x${view.getUint32(off + 12, le).toString(16)}`;
    const sOffset = bits === 64 ? readU64Num(view, off + 24, le) : view.getUint32(off + 16, le);
    const sSize = bits === 64 ? readU64Num(view, off + 32, le) : view.getUint32(off + 20, le);
    const link = view.getUint32(bits === 64 ? off + 40 : off + 24, le);
    const entsize = bits === 64 ? readU64Num(view, off + 56, le) : view.getUint32(off + 36, le);
    rawSections.push({ nameOff, typeNum, flagsNum, addr, offset: sOffset, size: sSize, link, entsize });
  }

  const shstr = rawSections[shstrndx];
  const shstrStart = shstr ? shstr.offset : 0;
  const shstrEnd = shstr ? Math.min(shstr.offset + shstr.size, bytes.length) : 0;

  const sections: ElfSectionInfo[] = rawSections.map((s) => {
    const name = shstrEnd > shstrStart ? readCString(bytes, shstrStart + s.nameOff, shstrEnd) : '';
    const f = `${s.flagsNum & 2 ? 'A' : ''}${s.flagsNum & 1 ? 'W' : ''}${s.flagsNum & 4 ? 'X' : ''}` || '—';
    return {
      name: name || '(null)',
      type: SECTION_TYPES[s.typeNum] || `0x${s.typeNum.toString(16)}`,
      addr: s.addr,
      offset: s.offset,
      size: s.size,
      flags: f,
    };
  });

  // Extract Build ID from .note.gnu.build-id if present
  let buildId = 'Not present';
  const buildIdIdx = sections.findIndex((s) => s.name === '.note.gnu.build-id');
  if (buildIdIdx >= 0) {
    const sec = rawSections[buildIdIdx];
    if (sec.offset + 16 <= bytes.length && sec.size >= 16) {
      const namesz = view.getUint32(sec.offset, le);
      const descsz = view.getUint32(sec.offset + 4, le);
      const descStart = sec.offset + 12 + Math.ceil(namesz / 4) * 4;
      if (descStart + descsz <= bytes.length) {
        buildId = Array.from(bytes.subarray(descStart, descStart + descsz))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      }
    }
  }

  // Parse .dynamic for DT_NEEDED dependencies
  const neededLibraries: string[] = [];
  const dynIdx = sections.findIndex((s) => s.name === '.dynamic');
  if (dynIdx >= 0) {
    const dynSec = rawSections[dynIdx];
    const dynStrSec = rawSections[dynSec.link];
    if (dynStrSec && dynStrSec.offset + dynStrSec.size <= bytes.length) {
      const strEnd = dynStrSec.offset + dynStrSec.size;
      const entSize = bits === 64 ? 16 : 8;
      const count = Math.floor(dynSec.size / entSize);
      for (let i = 0; i < Math.min(count, 512); i++) {
        const dOff = dynSec.offset + i * entSize;
        if (dOff + entSize > bytes.length) break;
        const dTag = bits === 64 ? readU64Num(view, dOff, le) : view.getUint32(dOff, le);
        const dVal = bits === 64 ? readU64Num(view, dOff + 8, le) : view.getUint32(dOff + 4, le);
        if (dTag === 0) break;
        if (dTag === 1) {
          const libName = readCString(bytes, dynStrSec.offset + dVal, strEnd);
          if (libName) neededLibraries.push(libName);
        }
      }
    }
  }

  // Parse .dynsym / .symtab symbols
  const importedSymbols: ElfSymbolInfo[] = [];
  const exportedSymbols: ElfSymbolInfo[] = [];

  for (let idx = 0; idx < rawSections.length; idx++) {
    const sec = rawSections[idx];
    if (sec.typeNum !== 11 && sec.typeNum !== 2) continue; // SHT_DYNSYM or SHT_SYMTAB
    const strSec = rawSections[sec.link];
    if (!strSec || strSec.offset + strSec.size > bytes.length) continue;
    const strEnd = strSec.offset + strSec.size;
    const entSize = sec.entsize || (bits === 64 ? 24 : 16);
    const count = Math.min(Math.floor(sec.size / entSize), 2500);

    for (let s = 1; s < count; s++) {
      const sOff = sec.offset + s * entSize;
      if (sOff + entSize > bytes.length) break;
      const stName = view.getUint32(sOff, le);
      const stInfo = bits === 64 ? bytes[sOff + 4] : bytes[sOff + 12];
      const stShndx = bits === 64 ? view.getUint16(sOff + 6, le) : view.getUint16(sOff + 14, le);
      const stValue = bits === 64 ? readU64Hex(view, sOff + 8, le) : `0x${view.getUint32(sOff + 4, le).toString(16)}`;
      const stSize = bits === 64 ? readU64Num(view, sOff + 16, le) : view.getUint32(sOff + 8, le);

      const symName = readCString(bytes, strSec.offset + stName, strEnd);
      if (!symName) continue;

      const bindNum = stInfo >> 4;
      const typeNum = stInfo & 0x0f;
      const binding = bindNum === 1 ? 'GLOBAL' : bindNum === 2 ? 'WEAK' : 'LOCAL';
      const symType = typeNum === 2 ? 'FUNC' : typeNum === 1 ? 'OBJECT' : typeNum === 0 ? 'NOTYPE' : `TYPE_${typeNum}`;
      const isImported = stShndx === 0;

      const sym: ElfSymbolInfo = {
        name: symName,
        binding,
        type: symType,
        sectionIndex: stShndx,
        value: stValue,
        size: stSize,
        isImported,
      };
      if (isImported) {
        if (importedSymbols.length < 1500) importedSymbols.push(sym);
      } else if (binding !== 'LOCAL') {
        if (exportedSymbols.length < 1500) exportedSymbols.push(sym);
      }
    }
  }

  const hasDebugSections = sections.some((s) => s.name.startsWith('.debug_'));
  const extractedStrings = extractStrings(bytes, 5, 300).map((s) => s.value);

  return {
    filePath,
    isValid: true,
    bits,
    endianness: le ? 'Little Endian' : 'Big Endian',
    elfType: ELF_TYPES[eType] || `0x${eType.toString(16)}`,
    machine: machineMeta.name,
    abiGuess: machineMeta.abi,
    entryPoint,
    buildId,
    hasDebugSections,
    segments,
    sections,
    neededLibraries,
    importedSymbols,
    exportedSymbols,
    extractedStrings,
  };
}
