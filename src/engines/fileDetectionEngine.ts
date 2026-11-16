import { DetectedFormat, FileCategory } from '../types/xray';

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'properties', 'prop', 'xml', 'html', 'htm', 'css', 'scss', 'js', 'mjs', 'cjs',
  'ts', 'tsx', 'jsx', 'kt', 'kts', 'java', 'smali', 'c', 'cc', 'cpp', 'h', 'hpp',
  'cs', 'py', 'sql', 'sh', 'bash', 'zsh', 'csv', 'tsv', 'log', 'gradle', 'pro',
  'proguard', 'mf', 'sf', 'svg', 'pem', 'crt', 'pub', 'gitignore', 'env',
]);

const CODE_LANGUAGES: Record<string, string> = {
  xml: 'xml',
  html: 'html',
  htm: 'html',
  svg: 'xml',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  properties: 'properties',
  prop: 'properties',
  kt: 'kotlin',
  kts: 'kotlin',
  java: 'java',
  smali: 'smali',
  c: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  py: 'python',
  js: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  css: 'css',
  sql: 'sql',
  sh: 'bash',
  gradle: 'groovy',
  pro: 'proguard',
  md: 'markdown',
  mf: 'properties',
  sf: 'properties',
};

export function computeEntropy(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  const sampleLen = Math.min(bytes.length, 65536);
  const counts = new Uint32Array(256);
  for (let i = 0; i < sampleLen; i++) {
    counts[bytes[i]]++;
  }
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    const c = counts[i];
    if (c > 0) {
      const p = c / sampleLen;
      entropy -= p * Math.log2(p);
    }
  }
  return Number(entropy.toFixed(3));
}

export function getMagicHex(bytes: Uint8Array, len = 12): string {
  const count = Math.min(bytes.length, len);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    parts.push(bytes[i].toString(16).padStart(2, '0').toUpperCase());
  }
  return parts.join(' ');
}

function isProbablyText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;
  const checkLen = Math.min(bytes.length, 4096);
  let suspicious = 0;
  for (let i = 0; i < checkLen; i++) {
    const b = bytes[i];
    if (b === 0) return false;
    if (b < 0x09 || (b > 0x0d && b < 0x20 && b !== 0x1b)) {
      suspicious++;
    }
  }
  return suspicious / checkLen < 0.02;
}

function startsWithAscii(bytes: Uint8Array, prefix: string): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix.charCodeAt(i)) return false;
  }
  return true;
}

function getExtension(path: string): string {
  const base = path.split('/').pop() || '';
  const idx = base.lastIndexOf('.');
  if (idx <= 0 || idx === base.length - 1) return '';
  return base.slice(idx + 1).toLowerCase();
}

export function extractStrings(bytes: Uint8Array, minLength = 4, maxCount = 600): Array<{ offset: number; value: string }> {
  const results: Array<{ offset: number; value: string }> = [];
  const limit = Math.min(bytes.length, 2 * 1024 * 1024);
  let current = '';
  let startOffset = 0;

  for (let i = 0; i < limit; i++) {
    const b = bytes[i];
    if (b >= 0x20 && b <= 0x7e) {
      if (current.length === 0) startOffset = i;
      current += String.fromCharCode(b);
    } else {
      if (current.length >= minLength) {
        results.push({ offset: startOffset, value: current });
        if (results.length >= maxCount) return results;
      }
      current = '';
    }
  }
  if (current.length >= minLength && results.length < maxCount) {
    results.push({ offset: startOffset, value: current });
  }
  return results;
}

export function detectFileFormat(path: string, bytes: Uint8Array): DetectedFormat {
  const ext = getExtension(path);
  const lowerPath = path.toLowerCase();
  const entropy = computeEntropy(bytes);
  const magicHex = getMagicHex(bytes, 12);

  // 1. Magic-byte & structural detection (independent of extension)
  if (bytes.length >= 8) {
    const chunkType = bytes[0] | (bytes[1] << 8);
    const headerSize = bytes[2] | (bytes[3] << 8);

    // Android Binary XML (RES_XML_TYPE = 0x0003, headerSize = 0x0008)
    if (chunkType === 0x0003 && headerSize === 0x0008) {
      const isManifest = lowerPath === 'androidmanifest.xml' || lowerPath.endsWith('/androidmanifest.xml');
      return {
        category: isManifest ? 'manifest' : 'axml',
        formatName: isManifest ? 'Android Binary Manifest (AXML)' : 'Android Binary XML (AXML)',
        mimeType: 'application/vnd.android.axml',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        language: 'xml',
        entropy,
        summary: 'Compiled Android binary XML chunk stream (ResXMLTree). Decodable via AXML parser.',
      };
    }

    // Android Resource Table (RES_TABLE_TYPE = 0x0002, headerSize = 0x000c)
    if (chunkType === 0x0002 && headerSize === 0x000c) {
      return {
        category: 'arsc',
        formatName: 'Android Compiled Resource Table (ARSC)',
        mimeType: 'application/vnd.android.arsc',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'Compiled Android resource index mapping resource IDs (0x7f......) to strings, drawables, and qualifiers.',
      };
    }

    // Dalvik Executable (DEX)
    if (bytes[0] === 0x64 && bytes[1] === 0x65 && bytes[2] === 0x78 && bytes[3] === 0x0a) {
      return {
        category: 'dex',
        formatName: 'Dalvik Executable (DEX)',
        mimeType: 'application/vnd.android.dex',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'Compiled Dalvik/ART bytecode container holding classes, methods, fields, and string pools.',
      };
    }

    // ELF Native Library
    if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
      return {
        category: 'elf',
        formatName: 'ELF Native Shared Library / Binary',
        mimeType: 'application/x-elf',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'Executable and Linkable Format native binary compiled for ARM/ARM64/x86/x86_64.',
      };
    }

    // SQLite 3 Database
    if (startsWithAscii(bytes, 'SQLite format 3\0')) {
      return {
        category: 'sqlite',
        formatName: 'SQLite 3 Relational Database',
        mimeType: 'application/vnd.sqlite3',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'Self-contained SQLite 3 database file inspectable via WebAssembly SQLite engine.',
      };
    }

    // PNG
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      const isNinePatch = lowerPath.endsWith('.9.png');
      return {
        category: 'image',
        formatName: isNinePatch ? 'Android Nine-Patch PNG' : 'PNG Raster Image',
        mimeType: 'image/png',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: isNinePatch ? 'Stretchable Android 9-patch PNG image with stretch/content guides.' : 'Lossless Portable Network Graphics image.',
      };
    }

    // JPEG
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return {
        category: 'image',
        formatName: 'JPEG Image',
        mimeType: 'image/jpeg',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'JPEG compressed raster image.',
      };
    }

    // GIF
    if (startsWithAscii(bytes, 'GIF87a') || startsWithAscii(bytes, 'GIF89a')) {
      return {
        category: 'image',
        formatName: 'GIF Image',
        mimeType: 'image/gif',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'Graphics Interchange Format image (supports animation).',
      };
    }

    // WebP
    if (startsWithAscii(bytes, 'RIFF') && bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return {
        category: 'image',
        formatName: 'WebP Image',
        mimeType: 'image/webp',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'Modern lossy/lossless WebP image commonly used in Android res/drawables.',
      };
    }

    // WAV
    if (startsWithAscii(bytes, 'RIFF') && bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
      return {
        category: 'audio',
        formatName: 'WAV Audio',
        mimeType: 'audio/wav',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'RIFF WAVE uncompressed PCM audio container.',
      };
    }

    // OGG
    if (startsWithAscii(bytes, 'OggS')) {
      return {
        category: 'audio',
        formatName: 'OGG / Opus / Vorbis Audio',
        mimeType: 'audio/ogg',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'Ogg multimedia container.',
      };
    }

    // FLAC
    if (startsWithAscii(bytes, 'fLaC')) {
      return {
        category: 'audio',
        formatName: 'FLAC Lossless Audio',
        mimeType: 'audio/flac',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'Free Lossless Audio Codec stream.',
      };
    }

    // MP3
    if (startsWithAscii(bytes, 'ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
      return {
        category: 'audio',
        formatName: 'MP3 Audio',
        mimeType: 'audio/mpeg',
        detectionMethod: 'magic-bytes',
        confidence: 'medium',
        magicHex,
        isText: false,
        entropy,
        summary: 'MPEG-1/2 Audio Layer III stream.',
      };
    }

    // MP4 / M4A
    if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      const isAudio = ext === 'm4a' || ext === 'aac';
      return {
        category: isAudio ? 'audio' : 'video',
        formatName: isAudio ? 'M4A / AAC Audio' : 'MP4 / ISO Base Media Video',
        mimeType: isAudio ? 'audio/mp4' : 'video/mp4',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'ISO Base Media container (ftyp box).',
      };
    }

    // WebM / MKV (EBML)
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
      return {
        category: 'video',
        formatName: ext === 'mkv' ? 'Matroska Video (MKV)' : 'WebM Video',
        mimeType: 'video/webm',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'EBML container (WebM/Matroska).',
      };
    }

    // PDF
    if (startsWithAscii(bytes, '%PDF-')) {
      return {
        category: 'document',
        formatName: 'PDF Document',
        mimeType: 'application/pdf',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'Portable Document Format file.',
      };
    }

    // ZIP / JAR / APK / APKS / XAPK
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05)) {
      return {
        category: 'archive',
        formatName: ext ? `ZIP Archive (.${ext.toUpperCase()})` : 'ZIP Archive',
        mimeType: 'application/zip',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'PKZIP compressed archive (inspectable nested entries).',
      };
    }

    // GZIP
    if (bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 0x08) {
      return {
        category: 'archive',
        formatName: 'GZIP Compressed Stream',
        mimeType: 'application/gzip',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'RFC 1952 GZIP compressed payload.',
      };
    }

    // Fonts: TTF / OTF / WOFF / WOFF2
    if (
      (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) ||
      startsWithAscii(bytes, 'OTTO') ||
      startsWithAscii(bytes, 'wOFF') ||
      startsWithAscii(bytes, 'wOF2')
    ) {
      return {
        category: 'font',
        formatName: startsWithAscii(bytes, 'OTTO') ? 'OpenType Font (OTF)' : 'TrueType / Web Font',
        mimeType: 'font/ttf',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'Vector font file bundled for app typography.',
      };
    }

    // WebAssembly
    if (bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d) {
      return {
        category: 'binary',
        formatName: 'WebAssembly Module (.wasm)',
        mimeType: 'application/wasm',
        detectionMethod: 'magic-bytes',
        confidence: 'high',
        magicHex,
        isText: false,
        entropy,
        summary: 'Compiled WebAssembly binary module.',
      };
    }
  }

  // PKCS#7 / ASN.1 DER Certificate in META-INF
  if (
    (lowerPath.startsWith('meta-inf/') && (ext === 'rsa' || ext === 'dsa' || ext === 'ec' || ext === 'der')) ||
    (bytes.length > 4 && bytes[0] === 0x30 && (bytes[1] === 0x82 || bytes[1] === 0x83))
  ) {
    return {
      category: 'cert',
      formatName: 'ASN.1 DER / APK Signing Certificate',
      mimeType: 'application/pkcs7-signature',
      detectionMethod: lowerPath.startsWith('meta-inf/') ? 'structural' : 'magic-bytes',
      confidence: 'high',
      magicHex,
      isText: false,
      entropy,
      summary: 'DER-encoded PKCS#7 signing block or X.509 certificate.',
    };
  }

  // Text & structured text detection
  const textCandidate = isProbablyText(bytes);
  if (textCandidate || TEXT_EXTENSIONS.has(ext)) {
    const preview = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 2048)).trimStart();
    let category: FileCategory = 'text';
    let formatName = ext ? `${ext.toUpperCase()} Text File` : 'Plain Text';
    let language = CODE_LANGUAGES[ext] || 'text';

    if (ext === 'svg' || preview.startsWith('<svg')) {
      category = 'image';
      formatName = 'Scalable Vector Graphics (SVG)';
      language = 'xml';
    } else if (ext === 'xml' || preview.startsWith('<?xml') || preview.startsWith('<vector') || preview.startsWith('<manifest') || preview.startsWith('<resources')) {
      category = lowerPath.endsWith('androidmanifest.xml') ? 'manifest' : 'xml';
      formatName = preview.startsWith('<vector') ? 'Android Vector Drawable XML' : 'XML Document';
      language = 'xml';
    } else if (ext === 'json' || preview.startsWith('{') || preview.startsWith('[')) {
      try {
        JSON.parse(new TextDecoder('utf-8').decode(bytes.slice(0, 128000)));
        category = 'code';
        formatName = 'JSON Data';
        language = 'json';
      } catch {
        // Not full JSON or truncated
      }
    } else if (CODE_LANGUAGES[ext]) {
      category = 'code';
      formatName = `${CODE_LANGUAGES[ext].toUpperCase()} Source / Config`;
    } else if (lowerPath.startsWith('meta-inf/') && (ext === 'mf' || ext === 'sf')) {
      category = 'cert';
      formatName = ext === 'mf' ? 'JAR / APK Manifest Digests (MANIFEST.MF)' : 'APK Signature Digest File (.SF)';
      language = 'properties';
    }

    return {
      category,
      formatName,
      mimeType: category === 'xml' ? 'application/xml' : 'text/plain',
      detectionMethod: TEXT_EXTENSIONS.has(ext) ? 'extension' : 'content',
      confidence: 'high',
      magicHex,
      isText: true,
      language,
      entropy,
      summary: `UTF-8 readable ${formatName}.`,
    };
  }

  // Fallback heuristics for unknown binary blobs (Protobuf, FlatBuffers, encrypted, compressed)
  const candidates: Array<{ name: string; confidence: string; reason: string }> = [];
  if (entropy > 7.6) {
    candidates.push({
      name: 'Compressed or Encrypted Payload',
      confidence: 'Medium',
      reason: `High Shannon entropy (${entropy} bits/byte) indicates compression or encryption.`,
    });
  }
  if (bytes.length >= 8 && bytes[4] === 0 && bytes[5] === 0 && bytes[6] === 0) {
    candidates.push({
      name: 'Little-Endian Structured Binary / FlatBuffer',
      confidence: 'Low',
      reason: 'Contains 32-bit little-endian offset/header patterns.',
    });
  }
  if (ext === 'pb' || ext === 'protobin' || ext === 'bin') {
    candidates.push({
      name: 'Protocol Buffers Wire Stream',
      confidence: 'Medium',
      reason: `Extension .${ext} paired with compact binary wire tags.`,
    });
  }
  if (candidates.length === 0) {
    candidates.push({
      name: 'Unclassified Binary Blob',
      confidence: 'Low',
      reason: 'No standard magic signature matched; inspect via Hex & Extracted Strings.',
    });
  }

  return {
    category: ext === 'pb' ? 'protobuf' : 'binary',
    formatName: ext ? `Binary Data (.${ext.toUpperCase()})` : 'Unknown Binary Format',
    mimeType: 'application/octet-stream',
    detectionMethod: 'fallback',
    confidence: 'low',
    magicHex,
    isText: false,
    entropy,
    summary: `Unrecognized binary structure (${bytes.length} bytes, entropy ${entropy}). Inspectable via Universal Binary Inspector.`,
    candidates,
  };
}
