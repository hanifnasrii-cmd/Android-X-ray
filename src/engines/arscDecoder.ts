import { ResourceConfigValue, ResourceEntryInfo, ResourceTable } from '../types/xray';

const RES_STRING_POOL_TYPE = 0x0001;
const RES_TABLE_TYPE = 0x0002;
const RES_TABLE_PACKAGE_TYPE = 0x0200;
const RES_TABLE_TYPE_TYPE = 0x0201;
const RES_TABLE_TYPE_SPEC_TYPE = 0x0202;

function readUtf8Length(view: DataView, offset: number): { len: number; next: number } {
  const first = view.getUint8(offset);
  if ((first & 0x80) !== 0) {
    const second = view.getUint8(offset + 1);
    return { len: ((first & 0x7f) << 8) | second, next: offset + 2 };
  }
  return { len: first, next: offset + 1 };
}

function readUtf16Length(view: DataView, offset: number): { len: number; next: number } {
  const first = view.getUint16(offset, true);
  if ((first & 0x8000) !== 0) {
    const second = view.getUint16(offset + 2, true);
    return { len: ((first & 0x7fff) << 16) | second, next: offset + 4 };
  }
  return { len: first, next: offset + 2 };
}

export function parseResStringPool(bytes: Uint8Array, chunkStart: number): { strings: string[]; nextOffset: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = view.getUint16(chunkStart + 2, true);
  const chunkSize = view.getUint32(chunkStart + 4, true);
  const stringCount = view.getUint32(chunkStart + 8, true);
  const flags = view.getUint32(chunkStart + 16, true);
  const stringsStart = view.getUint32(chunkStart + 20, true);
  const isUtf8 = (flags & (1 << 8)) !== 0;

  const strings: string[] = [];
  const offsetsBase = chunkStart + headerSize;
  const dataBase = chunkStart + stringsStart;
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
  const utf16Decoder = new TextDecoder('utf-16le', { fatal: false });

  for (let i = 0; i < stringCount; i++) {
    const relOffset = view.getUint32(offsetsBase + i * 4, true);
    const strPos = dataBase + relOffset;
    if (strPos >= chunkStart + chunkSize || strPos >= bytes.length) {
      strings.push('');
      continue;
    }
    if (isUtf8) {
      const charCount = readUtf8Length(view, strPos);
      const byteCount = readUtf8Length(view, charCount.next);
      const end = Math.min(byteCount.next + byteCount.len, bytes.length);
      strings.push(utf8Decoder.decode(bytes.subarray(byteCount.next, end)));
    } else {
      const charCount = readUtf16Length(view, strPos);
      const end = Math.min(charCount.next + charCount.len * 2, bytes.length);
      strings.push(utf16Decoder.decode(bytes.subarray(charCount.next, end)));
    }
  }

  return { strings, nextOffset: chunkStart + chunkSize };
}

function decodeDensity(dpi: number): string | undefined {
  switch (dpi) {
    case 0:
      return undefined;
    case 120:
      return 'ldpi';
    case 160:
      return 'mdpi';
    case 213:
      return 'tvdpi';
    case 240:
      return 'hdpi';
    case 320:
      return 'xhdpi';
    case 480:
      return 'xxhdpi';
    case 640:
      return 'xxxhdpi';
    case 65534:
      return 'anydpi';
    case 65535:
      return 'nodpi';
    default:
      return `${dpi}dpi`;
  }
}

function formatResourceValue(dataType: number, data: number, globalStrings: string[]): string {
  switch (dataType) {
    case 0x00:
      return '@null';
    case 0x01:
      return `@0x${(data >>> 0).toString(16).padStart(8, '0')}`;
    case 0x02:
      return `?0x${(data >>> 0).toString(16).padStart(8, '0')}`;
    case 0x03:
      return globalStrings[data] ?? `<str#${data}>`;
    case 0x04: {
      const buf = new ArrayBuffer(4);
      const dv = new DataView(buf);
      dv.setUint32(0, data, true);
      return dv.getFloat32(0, true).toPrecision(5);
    }
    case 0x05: {
      const units = ['px', 'dp', 'sp', 'pt', 'in', 'mm'];
      const unit = units[data & 0x0f] || 'px';
      const val = (data >> 8) / 1;
      return `${val}${unit}`;
    }
    case 0x10:
      return String(data | 0);
    case 0x11:
      return `0x${(data >>> 0).toString(16)}`;
    case 0x12:
      return data !== 0 ? 'true' : 'false';
    case 0x1c:
    case 0x1d:
    case 0x1e:
    case 0x1f:
      return `#${(data >>> 0).toString(16).padStart(8, '0').toUpperCase()}`;
    default:
      return `0x${(data >>> 0).toString(16)}`;
  }
}

export function parseResourcesArsc(filePath: string, bytes: Uint8Array): ResourceTable | null {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = view.getUint16(0, true);
  const headerSize = view.getUint16(2, true);
  const totalSize = view.getUint32(4, true);

  if (type !== RES_TABLE_TYPE || headerSize < 12) return null;

  const packageCount = view.getUint32(8, true);
  let offset = headerSize;
  let globalStrings: string[] = [];
  const packages: Array<{ id: number; name: string }> = [];
  const byId = new Map<number, ResourceEntryInfo>();
  const typeCounts: Record<string, number> = {};
  const utf16Decoder = new TextDecoder('utf-16le', { fatal: false });

  while (offset + 8 <= Math.min(totalSize, bytes.length)) {
    const chunkType = view.getUint16(offset, true);
    const chunkHeaderSize = view.getUint16(offset + 2, true);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkSize < 8) break;

    if (chunkType === RES_STRING_POOL_TYPE) {
      const pool = parseResStringPool(bytes, offset);
      globalStrings = pool.strings;
    } else if (chunkType === RES_TABLE_PACKAGE_TYPE && offset + 284 <= bytes.length) {
      const pkgId = view.getUint32(offset + 8, true);
      const rawName = bytes.subarray(offset + 12, offset + 268);
      let pkgName = utf16Decoder.decode(rawName);
      const nullIdx = pkgName.indexOf('\0');
      if (nullIdx >= 0) pkgName = pkgName.slice(0, nullIdx);

      packages.push({ id: pkgId, name: pkgName });

      const typeStringsRel = view.getUint32(offset + 268, true);
      const keyStringsRel = view.getUint32(offset + 276, true);

      const typeStrings = typeStringsRel > 0 && offset + typeStringsRel + 24 <= bytes.length
        ? parseResStringPool(bytes, offset + typeStringsRel).strings
        : [];
      const keyStrings = keyStringsRel > 0 && offset + keyStringsRel + 24 <= bytes.length
        ? parseResStringPool(bytes, offset + keyStringsRel).strings
        : [];

      let innerOffset = offset + chunkHeaderSize;
      const pkgEnd = Math.min(offset + chunkSize, bytes.length);

      while (innerOffset + 8 <= pkgEnd) {
        const innerType = view.getUint16(innerOffset, true);
        const innerHeaderSize = view.getUint16(innerOffset + 2, true);
        const innerSize = view.getUint32(innerOffset + 4, true);
        if (innerSize < 8) break;

        if (innerType === RES_TABLE_STRING_POOL_TYPE_SKIP(innerType)) {
          // handled above
        }

        if (innerType === RES_TABLE_TYPE_SPEC_TYPE) {
          // Type spec flags; proceed to next chunk
        } else if (innerType === RES_TABLE_TYPE_TYPE && innerOffset + 20 <= pkgEnd) {
          const typeId = view.getUint8(innerOffset + 8);
          const entryCount = view.getUint32(innerOffset + 12, true);
          const entriesStart = view.getUint32(innerOffset + 16, true);
          const typeName = typeStrings[typeId - 1] || `type_${typeId}`;

          // Parse ResTable_config (starts at innerOffset + 20)
          let language: string | undefined;
          let density: string | undefined;
          let nightMode: string | undefined;
          let sdkVersion: number | undefined;
          const configSize = innerOffset + 24 <= pkgEnd ? view.getUint32(innerOffset + 20, true) : 0;

          if (configSize >= 16 && innerOffset + 36 <= pkgEnd) {
            const lang0 = bytes[innerOffset + 28];
            const lang1 = bytes[innerOffset + 29];
            if (lang0 >= 0x61 && lang1 >= 0x61) {
              language = String.fromCharCode(lang0, lang1);
            }
            const dpi = view.getUint16(innerOffset + 34, true);
            density = decodeDensity(dpi);
          }
          if (configSize >= 36 && innerOffset + 56 <= pkgEnd) {
            const uiMode = bytes[innerOffset + 48];
            if ((uiMode & 0x30) === 0x20) nightMode = 'night';
            else if ((uiMode & 0x30) === 0x10) nightMode = 'notnight';
            const sdk = view.getUint16(innerOffset + 52, true);
            if (sdk > 0) sdkVersion = sdk;
          }

          const configParts = [language, density, nightMode, sdkVersion ? `v${sdkVersion}` : undefined].filter(Boolean);
          const configLabel = configParts.length > 0 ? configParts.join('-') : 'default';

          const offsetsTableStart = innerOffset + innerHeaderSize;
          const entriesDataStart = innerOffset + entriesStart;

          const safeEntryCount = Math.min(entryCount, 20000);
          for (let eIdx = 0; eIdx < safeEntryCount; eIdx++) {
            const offPos = offsetsTableStart + eIdx * 4;
            if (offPos + 4 > pkgEnd) break;
            const entryRelOff = view.getUint32(offPos, true);
            if (entryRelOff === 0xffffffff) continue;

            const entryPos = entriesDataStart + entryRelOff;
            if (entryPos + 8 > pkgEnd) continue;

            const entrySize = view.getUint16(entryPos, true);
            const entryFlags = view.getUint16(entryPos + 2, true);
            const keyIdx = view.getUint32(entryPos + 4, true);
            const keyName = keyStrings[keyIdx] || `res_${eIdx.toString(16)}`;
            const resId = ((pkgId & 0xff) << 24) | ((typeId & 0xff) << 16) | (eIdx & 0xffff);
            const isComplex = (entryFlags & 0x0001) !== 0;

            let formattedValue = '<complex>';
            let dataType = 0;

            if (!isComplex && entryPos + entrySize + 8 <= pkgEnd) {
              const valPos = entryPos + entrySize;
              dataType = bytes[valPos + 3];
              const data = view.getUint32(valPos + 4, true);
              formattedValue = formatResourceValue(dataType, data, globalStrings);
            } else if (isComplex && entryPos + 16 <= pkgEnd) {
              const mapCount = view.getUint32(entryPos + 12, true);
              formattedValue = `<bag: ${mapCount} items>`;
            }

            let existing = byId.get(resId);
            if (!existing) {
              existing = {
                id: resId,
                idHex: `0x${(resId >>> 0).toString(16).padStart(8, '0')}`,
                packageName: pkgName,
                typeName,
                name: keyName,
                reference: `@${typeName}/${keyName}`,
                values: [],
              };
              byId.set(resId, existing);
              typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
            }
            existing.values.push({
              configLabel,
              density,
              language,
              nightMode,
              sdkVersion,
              value: formattedValue,
              dataType,
            });
          }
        }

        innerOffset += innerSize;
      }
    }

    offset += chunkSize;
  }

  const entries = Array.from(byId.values()).sort((a, b) => a.id - b.id);

  return {
    filePath,
    packageCount,
    packages,
    entries,
    byId,
    typeCounts,
  };
}

function RES_TABLE_STRING_POOL_TYPE_SKIP(t: number): number {
  return t === -1 ? -1 : -2;
}
