import {
  ApkEntry,
  DecodedManifest,
  DexAnalysis,
  ElfAnalysis,
  ResourceTable,
  SearchIndexItem,
  SearchResult,
} from '../types/xray';
import { decodeBinaryXml } from './axmlDecoder';

export function buildSearchIndex(
  entries: ApkEntry[],
  manifest: DecodedManifest | null,
  dexFiles: DexAnalysis[],
  resourceTable: ResourceTable | null,
  elfFiles: ElfAnalysis[]
): SearchIndexItem[] {
  const items: SearchIndexItem[] = [];
  let seq = 0;

  // 1. All file paths & names
  for (const entry of entries) {
    items.push({
      id: `idx-${seq++}`,
      path: entry.path,
      name: entry.name,
      category: 'file',
      line: 1,
      text: `${entry.path} (${entry.format.formatName})`,
      searchableLower: `${entry.path} ${entry.format.formatName}`.toLowerCase(),
    });

    // Index text files & decoded small XML files (capped for fast indexing)
    if (entry.format.isText && entry.size <= 256 * 1024) {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(entry.bytes);
      const lines = text.split('\n');
      for (let i = 0; i < Math.min(lines.length, 600); i++) {
        const lineText = lines[i].trim();
        if (lineText.length > 0) {
          items.push({
            id: `idx-${seq++}`,
            path: entry.path,
            name: entry.name,
            category: 'text',
            line: i + 1,
            text: lineText.slice(0, 240),
            searchableLower: lineText.toLowerCase(),
          });
        }
      }
    } else if (entry.format.category === 'axml' && entry.size <= 256 * 1024) {
      const dec = decodeBinaryXml(entry.bytes, resourceTable);
      const lines = dec.xml.split('\n');
      for (let i = 0; i < Math.min(lines.length, 500); i++) {
        const lineText = lines[i].trim();
        if (lineText.length > 0) {
          items.push({
            id: `idx-${seq++}`,
            path: entry.path,
            name: entry.name,
            category: 'manifest',
            line: i + 1,
            text: lineText.slice(0, 240),
            searchableLower: lineText.toLowerCase(),
          });
        }
      }
    }
  }

  // 2. Decoded AndroidManifest.xml lines
  if (manifest) {
    const lines = manifest.rawXml.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i].trim();
      if (lineText) {
        items.push({
          id: `idx-${seq++}`,
          path: 'AndroidManifest.xml',
          name: 'AndroidManifest.xml',
          category: 'manifest',
          line: i + 1,
          text: lineText.slice(0, 240),
          searchableLower: lineText.toLowerCase(),
        });
      }
    }
  }

  // 3. DEX Classes, Methods, and Strings
  for (const dex of dexFiles) {
    for (const cls of dex.classes) {
      items.push({
        id: `idx-${seq++}`,
        path: dex.filePath,
        name: cls.simpleName,
        category: 'dex-class',
        line: 1,
        text: `${cls.className} extends ${cls.superClass}`,
        searchableLower: `${cls.className} ${cls.superClass} ${cls.sourceFile}`.toLowerCase(),
      });
      for (const m of [...cls.directMethods, ...cls.virtualMethods]) {
        items.push({
          id: `idx-${seq++}`,
          path: dex.filePath,
          name: `${cls.simpleName}.${m.name}`,
          category: 'dex-method',
          line: 1,
          offset: m.codeOffset,
          text: `${cls.className}.${m.name}(${m.parameters.join(', ')}): ${m.returnType}`,
          searchableLower: `${cls.className}.${m.name} ${m.returnType}`.toLowerCase(),
        });
      }
    }
    for (let sIdx = 0; sIdx < Math.min(dex.strings.length, 6000); sIdx++) {
      const s = dex.strings[sIdx];
      if (s && s.length >= 3) {
        items.push({
          id: `idx-${seq++}`,
          path: dex.filePath,
          name: `DEX String #${sIdx}`,
          category: 'dex-string',
          line: sIdx + 1,
          text: s.slice(0, 220),
          searchableLower: s.toLowerCase(),
        });
      }
    }
  }

  // 4. Resource Table entries
  if (resourceTable) {
    for (const r of resourceTable.entries.slice(0, 12000)) {
      const valPreview = r.values.map((v) => v.value).slice(0, 2).join(' | ');
      const line = `${r.idHex} ${r.reference} = ${valPreview}`;
      items.push({
        id: `idx-${seq++}`,
        path: resourceTable.filePath,
        name: r.reference,
        category: 'resource',
        line: 1,
        text: line.slice(0, 240),
        searchableLower: line.toLowerCase(),
      });
    }
  }

  // 5. ELF Native Symbols & Strings
  for (const elf of elfFiles) {
    for (const sym of [...elf.exportedSymbols, ...elf.importedSymbols].slice(0, 1500)) {
      items.push({
        id: `idx-${seq++}`,
        path: elf.filePath,
        name: sym.name,
        category: 'native',
        line: 1,
        text: `[${sym.isImported ? 'IMP' : 'EXP'} ${sym.type}] ${sym.name}`,
        searchableLower: sym.name.toLowerCase(),
      });
    }
  }

  return items;
}

export interface SearchOptions {
  query: string;
  useRegex: boolean;
  caseSensitive: boolean;
  exactMatch: boolean;
  categories: Set<SearchIndexItem['category']>;
  limit?: number;
}

export function executeIndexedSearch(index: SearchIndexItem[], options: SearchOptions): { results: SearchResult[]; error?: string } {
  const q = options.query.trim();
  if (!q) return { results: [] };

  const limit = options.limit ?? 300;
  const results: SearchResult[] = [];
  let regex: RegExp | null = null;

  if (options.useRegex) {
    try {
      regex = new RegExp(q, options.caseSensitive ? '' : 'i');
    } catch (err) {
      return {
        results: [],
        error: `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const qLower = q.toLowerCase();

  for (let i = 0; i < index.length; i++) {
    const item = index[i];
    if (options.categories.size > 0 && !options.categories.has(item.category)) continue;

    if (regex) {
      const m = regex.exec(item.text);
      if (m) {
        results.push({
          item,
          matchIndex: m.index,
          matchLength: m[0].length,
          preview: item.text,
        });
      }
    } else if (options.exactMatch) {
      const matched = options.caseSensitive ? item.text === q || item.name === q : item.searchableLower === qLower || item.name.toLowerCase() === qLower;
      if (matched) {
        results.push({ item, matchIndex: 0, matchLength: item.text.length, preview: item.text });
      }
    } else if (options.caseSensitive) {
      const idx = item.text.indexOf(q);
      if (idx >= 0) {
        results.push({ item, matchIndex: idx, matchLength: q.length, preview: item.text });
      }
    } else {
      const idx = item.searchableLower.indexOf(qLower);
      if (idx >= 0) {
        const realIdx = item.text.toLowerCase().indexOf(qLower);
        results.push({
          item,
          matchIndex: realIdx >= 0 ? realIdx : 0,
          matchLength: q.length,
          preview: item.text,
        });
      }
    }

    if (results.length >= limit) break;
  }

  return { results };
}
