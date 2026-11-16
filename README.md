# ANDROID X-RAY

**Universal Android APK Inspection, Binary Decoding & Project Architecture Workstation**

> **Repository:** `<https://github.com/YOUR_USERNAME/android-xray>` *(replace with your repository URL)*

ANDROID X-RAY is a static Android package inspection and reverse-engineering workstation built with React, TypeScript, Tailwind CSS, Express, WebAssembly SQLite, and pure-TypeScript binary decoders. It lets engineers open `.apk`, `.apks`, `.xapk`, `.aab`, `.dex`, `.so`, `.arsc`, `.xml`, and `.db` artifacts locally in the browser to inspect internal directories, binary XML manifests, Dalvik bytecode, compiled resources, native ELF shared libraries, embedded SQLite databases, and component relationships.

---

## Key Capabilities

- **Application & Package Library**
  - Import single or multiple `.apk`, `.apks`, `.xapk`, `.aab`, `.zip`, `.jar`, `.dex`, `.so`, `.arsc`, `.xml`, and `.db`/`.sqlite` files via drag-and-drop or file picker.
  - Built-in **Reference Binary APK Generator** (`src/engines/referenceApkGenerator.ts`) that compiles valid AXML, ARSC, DEX, ELF64, SQLite, PNG, and VectorDrawable payloads for immediate offline inspection and verification.
  - Session history management and side-by-side **Two-APK Comparison** (file additions, removals, size deltas, and permission changes).

- **IDE-Style Hierarchical Project Explorer & Context Menus**
  - Virtualized folder tree built to handle 10,000+ entries with folders-first sorting, single-line filename truncation, separate tabular byte counts, bookmarks, recent files, and responsive mobile/tablet split views.
  - **Long-Press & Right-Click Folder Context Menu**: Expand/collapse, **Download as ZIP** (recursive streaming `ZipDeflate` preserving original hierarchy, path deduplication, file/byte progress, cancellation, File System Access save picker, and Web Share API), Folder Info & Structure preview, Select All Contents, Search Inside Folder, Compare Folders, Bookmark Folder, and Copy Path/Name.
  - **File Context Menu**: Open, Preview, Hex Inspection, Metadata, Explain File, Bookmark, Compare Files, Find References, Copy Path/Name, Download, and Share.

- **Binary & Reverse-Engineering Decoders (100% Local Static Analysis)**
  - **Binary XML (AXML) & Manifest Inspector**: Decodes `ResXMLTree`, resolves `@0x7f......` IDs, extracts permissions, features, components, intent filters, deep links, and runs automated security checks (`debuggable`, `allowBackup`, `usesCleartextTraffic`, unprotected exported components).
  - **DEX & Smali Analyzer**: Parses multidex headers, ULEB128/MUTF-8 pools, classes, fields, methods, Smali disassembly, cross-references, and clearly labeled reconstructed Java-like pseudocode.
  - **Resource & UI Architecture Inspector**: Decodes `resources.arsc` (`ResTable`) with density, locale, night-mode, and SDK qualifiers; maps layouts, drawables, VectorDrawables, colors, fonts, and UI classes.
  - **Native ELF Analyzer**: Inspects ELF32/64 headers, ABI/machine type, program segments, sections, GNU Build ID, `DT_NEEDED` dependencies, imported/exported symbols, and strings.
  - **Universal File Detection & Binary Inspector**: Identifies formats via magic bytes, structural checks, content inspection, and Shannon entropy; includes a paged Hex + ASCII + UTF-16LE viewer, byte/hex search, and string extractor.
  - **Read-Only SQLite Inspector**: Uses local WebAssembly SQLite (`public/sql-wasm.wasm`) to inspect tables, columns, indexes, views, triggers, run read-only `SELECT`/`PRAGMA`/`EXPLAIN` queries, and export CSV/JSON.
  - **Framework Detector, Indexed Global Search, Architecture Graph & Reports**: Evidence-backed framework/SDK detection, regex/exact/case-sensitive search across all indexed artifacts, interactive clickable SVG component graph, offline Beginner/Technical file explanations (plus optional explicit-consent AI deep analysis via `/api/explain`), and exports in `TXT`, `JSON`, `XML`, `CSV`, `HTML`, and `ZIP`.

---

## Prerequisites & Tech Stack

- **Node.js**: `v22.x` (tested on `v22.23.2`)
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons
- **Backend**: Express (`server.ts`) serving Vite middleware in development and `dist/` in production, plus optional `/api/explain` route using `@google/genai`
- **Core Libraries**: `fflate` (streaming ZIP/DEFLATE/GZIP), `sql.js` (WebAssembly SQLite)

---

## Getting Started & Build Instructions

### 1. Clone the Repository

```bash
git clone <https://github.com/YOUR_USERNAME/android-xray.git>
cd android-xray
```

### 2. Install Dependencies

```bash
npm install
```

Ensure `sql-wasm.wasm` is available in `public/` (already committed/copied to `public/sql-wasm.wasm`; if updating `sql.js`, re-copy it):

```bash
cp node_modules/sql.js/dist/sql-wasm.wasm public/sql-wasm.wasm
```

### 3. Configure Environment Variables (Optional)

Core APK inspection, decoding, search, and explanations work **100% offline** without any API keys. To enable the optional explicit-consent AI explanation endpoint (`POST /api/explain`), create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Set `GEMINI_API_KEY` inside `.env` (never commit `.env` or expose keys in client code).

### 4. Run in Development

Starts the Express + Vite development server on port `3000`:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### 5. Lint, Test & Production Build

```bash
# TypeScript type-checking
npm run lint

# Run automated binary engine & export tests
npx tsx --test tests/xrayEngines.test.ts

# Build optimized frontend bundle into dist/
npm run build

# Start production server (serves dist/ and /api/* on port 3000)
NODE_ENV=production npm start
```

---

## Project Structure

```text
.
├── .env.example                        # Environment variable template (GEMINI_API_KEY, APP_URL)
├── index.html                          # Application HTML entry point & font imports
├── metadata.json                       # Application metadata & capabilities
├── package.json                        # Scripts & dependencies
├── server.ts                           # Express server (Vite middleware in dev, dist/ in prod, /api/explain)
├── tsconfig.json                       # TypeScript configuration
├── vite.config.ts                      # Vite + Tailwind v4 configuration
├── public/
│   └── sql-wasm.wasm                   # Local WebAssembly SQLite binary for offline DB inspection
├── src/
│   ├── App.tsx                         # Main workstation layout, navigation rail, split-pane & modal orchestration
│   ├── index.css                       # Tailwind v4 setup & IDE scrollbar / typography rules
│   ├── main.tsx                        # React entry mount
│   ├── types/
│   │   └── xray.ts                     # Shared TypeScript domain interfaces
│   ├── engines/
│   │   ├── apkPipeline.ts              # End-to-end APK analysis pipeline & two-APK comparison
│   │   ├── archiveEngine.ts            # fflate ZIP/APK/APKS/XAPK/AAB unpacking, ZIP-bomb & traversal guards
│   │   ├── architectureGraph.ts        # Component & dependency graph builder
│   │   ├── arscDecoder.ts              # resources.arsc (ResTable) binary decoder & qualifier parser
│   │   ├── axmlDecoder.ts              # Android Binary XML (AXML) decoder, manifest extractor & security audit
│   │   ├── certParser.ts               # META-INF/MANIFEST.MF, .SF, and DER PKCS#7 certificate inspector
│   │   ├── dexAnalyzer.ts              # DEX parser, MUTF-8/ULEB128 decoder, Smali disassembler & pseudocode
│   │   ├── elfAnalyzer.ts              # ELF32/64 header, section, segment, symbol & DT_NEEDED analyzer
│   │   ├── explanationEngine.ts        # Offline Beginner & Technical file explanation knowledge base
│   │   ├── fileDetectionEngine.ts      # Magic-byte, structural, MIME, entropy & string detection engine
│   │   ├── folderZipExporter.ts        # Streaming recursive folder ZIP exporter with AbortSignal & progress
│   │   ├── frameworkDetector.ts        # Evidence-based framework & SDK detector
│   │   ├── referenceApkGenerator.ts    # Generates valid binary reference APK fixture in memory
│   │   ├── reportExporter.ts           # Multi-format report exporter (TXT, JSON, XML, CSV, HTML, ZIP)
│   │   ├── searchEngine.ts             # Indexed search engine (regex, exact, case-sensitive, category filters)
│   │   └── sqliteEngine.ts             # WebAssembly SQLite read-only schema, query & export engine
│   └── components/
│       ├── DexCodePanel.tsx            # Multidex browser, Smali, reconstructed Java & cross-references
│       ├── EditorWorkspace.tsx         # Multi-tab file editor/viewer with find, line numbers, word wrap & modes
│       ├── ExplanationPanel.tsx        # Beginner/Technical explanation & consented AI deep-explain UI
│       ├── FileBadge.tsx               # File-type icon badges & byte-size formatting
│       ├── FolderDialogs.tsx           # Streaming ZIP progress modal, Folder Info modal & Compare modal
│       ├── FrameworksNativePanel.tsx   # Frameworks, Dependencies & ELF Native Library views
│       ├── GraphReportsSettingsPanel.tsx # Interactive SVG Architecture Graph, Export & Implementation Matrix
│       ├── HexInspector.tsx            # Paged Hex/ASCII/UTF-16LE viewer, byte search & string extraction
│       ├── LibraryPanel.tsx            # Package import dropzone, session history & APK diff comparison
│       ├── ManifestPanel.tsx           # Decoded AndroidManifest overview, security report & components
│       ├── MediaPreview.tsx            # Raster image, VectorDrawable SVG, audio, video, font & PDF previews
│       ├── ProjectTree.tsx             # Virtualized IDE file tree with folder/file long-press context menus
│       ├── ResourcesUiPanel.tsx        # resources.arsc explorer & UI Architecture mapping
│       ├── SearchPanel.tsx             # Global indexed search UI with folder scope & filter drawer
│       └── SqliteViewer.tsx            # Read-only SQLite table browser, query runner & CSV/JSON export
└── tests/
    └── xrayEngines.test.ts             # Automated integration tests for binary decoders & ZIP export
```

---

## Security & Platform Boundaries

- **Static Analysis Only**: Imported APK code and native binaries are never executed.
- **Archive Safety**: Path traversal segments (`..`) are rejected, and ZIP decompression enforces size and entry-count guards.
- **Privacy First**: Core inspection runs entirely locally in browser memory. The optional AI explanation route (`/api/explain`) is off by default and requires explicit user checkbox consent per request.
- **Browser Sandbox Scope**: Because this workstation runs in a web runtime rather than privileged Android OS context, installed device packages cannot be enumerated via Android `PackageManager`; users import `.apk`/`.apks`/`.xapk` files directly.

---

## Contributing

Contributions are welcome! Please follow these guidelines to keep the codebase reliable and verifiable:

1. **Fork & Branch**:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Design & Code Standards**:
   - Keep binary decoders pure, modular, and strictly bounds-checked in `src/engines/`.
   - Never fabricate decoded output, mock search results, or claim unsupported formats are decoded—route unknown binaries to `HexInspector` with evidence-based candidates.
   - Maintain single-line filenames (`truncate whitespace-nowrap`), tabular numerals (`tabular-nums`), and responsive phone/tablet parity in UI components.
   - Support both Dark and Light Tailwind themes (`dark:*` pairs).
3. **Verify Before Opening a Pull Request**:
   - Run `npm run lint` (`tsc --noEmit`) with zero errors.
   - Add or update tests in `tests/xrayEngines.test.ts` and ensure `npx tsx --test tests/xrayEngines.test.ts` passes.
   - Run `npm run build` to confirm the production bundle compiles cleanly.
4. **Pull Request**: Open a pull request against `<https://github.com/YOUR_USERNAME/android-xray>` describing the binary format, UI change, and test evidence.
