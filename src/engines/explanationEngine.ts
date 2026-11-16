import { ApkEntry, ApkProject, FileExplanation } from '../types/xray';

export function buildFileExplanation(entry: ApkEntry, project: ApkProject | null): FileExplanation {
  const lower = entry.path.toLowerCase();
  const cat = entry.format.category;

  const referencedBy: string[] = [];
  const nextFilesToInspect: string[] = [];

  if (project?.manifest) {
    if (lower !== 'androidmanifest.xml' && project.manifest.rawXml.includes(entry.name.replace(/\.[^.]+$/, ''))) {
      referencedBy.push('AndroidManifest.xml');
    }
  }
  if (project) {
    for (const dex of project.dexFiles) {
      if (dex.filePath !== entry.path && dex.strings.some((s) => s.includes(entry.name) || s.includes(entry.path))) {
        referencedBy.push(dex.filePath);
      }
    }
  }

  if (cat === 'manifest') {
    nextFilesToInspect.push('resources.arsc', 'classes.dex');
    return {
      title: 'Android Application Manifest',
      format: 'Compiled Android Binary XML (ResXMLTree)',
      beginnerSummary:
        'This is the master blueprint of the Android app. It tells Android the app’s unique package ID, what screens (Activities) exist, what permissions it asks for, and which components can be launched by other apps.',
      technicalSummary:
        'AAPT2 compiles AndroidManifest.xml into a binary ResXMLTree chunk stream containing a UTF-8/UTF-16 string pool, XML resource ID map, and typed attribute tuples referencing resources.arsc.',
      whatItContains: [
        'Package identifier, versionCode, versionName, and SDK levels (min/target/compile).',
        'Declared permissions (<uses-permission>) and hardware requirements (<uses-feature>).',
        'Registered Activities, Services, BroadcastReceivers, ContentProviders, and Intent Filters.',
        'Security flags such as debuggable, allowBackup, usesCleartextTraffic, and exported states.',
      ],
      howAndroidUsesIt:
        'PackageManagerService parses this binary XML during installation to validate signatures, enforce component sandboxing, register deep links, and enforce Android 12+ exported requirements.',
      whatCanBeDecoded: 'All XML tags, namespaces, attributes, typed values, and resolved @0x7f resource references.',
      whatCannotBeRecovered: 'Original XML comments, formatting whitespace, and Gradle build-script manifest placeholder expressions.',
      referencedBy: referencedBy.length ? referencedBy : ['Android PackageManager / Installer'],
      nextFilesToInspect,
    };
  }

  if (cat === 'dex') {
    nextFilesToInspect.push('AndroidManifest.xml', 'resources.arsc');
    return {
      title: 'Dalvik Executable Bytecode',
      format: entry.format.formatName,
      beginnerSummary:
        'This file holds the compiled Kotlin/Java code of the application. Instead of storing human-readable source files, Android compiles all classes and functions into compact bytecode instructions inside classes.dex.',
      technicalSummary:
        'DEX (Dalvik Executable) binary format containing header checksums, SHA-1 signature, string_ids, type_ids, proto_ids, field_ids, method_ids, class_defs, and ULEB128-encoded code_item register bytecode.',
      whatItContains: [
        'Complete class hierarchy, superclasses, interfaces, fields, and method signatures.',
        'Dalvik register-based bytecode instructions (disassembled to Smali).',
        'All hardcoded string literals, URLs, class descriptors, and reflection targets.',
      ],
      howAndroidUsesIt:
        'ART (Android Runtime) verifies and compiles DEX bytecode ahead-of-time (AOT) or just-in-time (JIT) into native machine instructions during install and execution.',
      whatCanBeDecoded: 'Class definitions, field/method tables, string constants, Smali opcodes, and reconstructed Java-like control signatures.',
      whatCannotBeRecovered: 'Local variable names stripped by R8/ProGuard obfuscation, original Kotlin/Java comments, and source formatting.',
      referencedBy: referencedBy.length ? referencedBy : ['ART Runtime / ClassLoader'],
      nextFilesToInspect,
    };
  }

  if (cat === 'arsc') {
    nextFilesToInspect.push('AndroidManifest.xml');
    return {
      title: 'Compiled Android Resource Table',
      format: 'ResTable Binary Archive (resources.arsc)',
      beginnerSummary:
        'A fast lookup index for all text strings, colors, dimensions, styles, and file paths used by the app across different languages and screen sizes.',
      technicalSummary:
        'Binary ResTable container mapping 32-bit resource IDs (0xPPTTEEEE) across package, type, and entry tables with ResTable_config qualifiers (locale, dpi, night mode, SDK).',
      whatItContains: [
        'Global string pool shared across XML resources.',
        'Resource entries grouped by type (string, color, drawable, layout, mipmap, style).',
        'Density (mdpi..xxxhdpi), locale, and night-mode configuration overrides.',
      ],
      howAndroidUsesIt:
        'AssetManager memory-maps resources.arsc directly from the APK (uncompressed/aligned) to resolve getString(R.string.*) and layout inflation in microseconds.',
      whatCanBeDecoded: 'Resource IDs, resource names (unless shrunk/obfuscated), values, and qualifier variants.',
      whatCannotBeRecovered: 'Original XML comments or names of resources removed by R8 resource shrinking.',
      referencedBy: ['AndroidManifest.xml', 'classes.dex (R$* IDs)', 'res/layout/*.xml'],
      nextFilesToInspect,
    };
  }

  if (cat === 'elf') {
    return {
      title: 'Native Shared Library (ELF)',
      format: entry.format.formatName,
      beginnerSummary:
        'Compiled C, C++, Rust, or Flutter/Unity native machine code that the app loads via System.loadLibrary() for high-performance work or cross-platform engines.',
      technicalSummary:
        'Executable and Linkable Format (ELF) shared object (.so) compiled for a specific CPU ABI (arm64-v8a, armeabi-v7a, x86, x86_64) with dynamic symbol tables and PT_LOAD segments.',
      whatItContains: [
        'ELF header, program segments, and section tables (.text, .rodata, .dynsym, .dynamic).',
        'JNI exported functions (Java_*) and imported libc/Android NDK symbols.',
        'DT_NEEDED dynamic library dependencies and GNU Build ID.',
      ],
      howAndroidUsesIt:
        'Android’s dynamic linker (linker64/linker) maps PT_LOAD segments into memory when Java/Kotlin invokes System.loadLibrary().',
      whatCanBeDecoded: 'ABI, sections, segments, imported/exported symbols, DT_NEEDED dependencies, Build ID, and ASCII strings.',
      whatCannotBeRecovered: 'Original C/C++ source code, stripped local symbols, or comments when compiled with -s / strip.',
      referencedBy: referencedBy.length ? referencedBy : ['JNI System.loadLibrary()'],
      nextFilesToInspect: ['classes.dex'],
    };
  }

  if (cat === 'sqlite') {
    return {
      title: 'SQLite 3 Database',
      format: 'SQLite format 3',
      beginnerSummary:
        'A self-contained relational database bundled inside the app (often containing pre-populated lookup tables, dictionaries, or offline catalog data).',
      technicalSummary:
        'Binary B-tree page-structured SQLite 3 database inspectable in read-only mode using the embedded WebAssembly SQLite engine.',
      whatItContains: ['Tables, columns, indexes, views, triggers, and stored rows.'],
      howAndroidUsesIt:
        'Copied to app internal storage (/data/data/<pkg>/databases/) and queried via SQLiteDatabase or Room.',
      whatCanBeDecoded: 'Complete SQL schema, table definitions, indexes, and row records (unless encrypted with SQLCipher).',
      whatCannotBeRecovered: 'Unallocated/vacuumed deleted records or SQLCipher-encrypted pages without the key.',
      referencedBy: referencedBy.length ? referencedBy : ['assets/ or Room pre-packaged DB'],
      nextFilesToInspect: ['classes.dex'],
    };
  }

  if (cat === 'axml' || cat === 'xml') {
    return {
      title: lower.includes('layout/') ? 'Android UI Layout XML' : 'Android XML Resource',
      format: entry.format.formatName,
      beginnerSummary:
        'Structured XML defining user interface views, vector icons, themes, backup rules, or network security policies.',
      technicalSummary:
        entry.format.category === 'axml'
          ? 'Compiled binary ResXMLTree resource XML decoded back into human-readable XML.'
          : 'Plain-text UTF-8 XML resource or configuration file.',
      whatItContains: ['View hierarchies, vector pathData, resource references (@string, @color), or config rules.'],
      howAndroidUsesIt:
        'LayoutInflater or Resources.getXml() parses this file to instantiate Views, Drawables, or security policies.',
      whatCanBeDecoded: 'Full XML tag hierarchy, attributes, and resource ID references.',
      whatCannotBeRecovered: 'Original XML comments or design-time tools: attributes stripped by AAPT2.',
      referencedBy: referencedBy.length ? referencedBy : ['resources.arsc'],
      nextFilesToInspect: ['resources.arsc'],
    };
  }

  if (cat === 'cert') {
    return {
      title: 'APK Signing Metadata / Certificate',
      format: entry.format.formatName,
      beginnerSummary:
        'Cryptographic signature files proving that the APK has not been tampered with since the developer signed it.',
      technicalSummary:
        'JAR/APK v1 signature artifacts (MANIFEST.MF file hashes, CERT.SF section digests, and DER-encoded PKCS#7 certificate block).',
      whatItContains: ['Per-file SHA-256/SHA-1 digests, signing algorithms, and X.509 certificate subjects.'],
      howAndroidUsesIt:
        'Android verifies APK signatures (v1/v2/v3/v4) before installation and upgrades to guarantee publisher identity.',
      whatCanBeDecoded: 'Manifest entry digests, signature algorithms, and public X.509 certificate metadata.',
      whatCannotBeRecovered: 'Private signing keys (never stored inside the APK).',
      referencedBy: ['META-INF/ signing pipeline'],
      nextFilesToInspect: ['AndroidManifest.xml'],
    };
  }

  const candidatesText = entry.format.candidates?.map((c) => `${c.name} (${c.confidence}): ${c.reason}`) || [];

  return {
    title: entry.name,
    format: entry.format.formatName,
    beginnerSummary: entry.format.isText
      ? 'A readable text, source, or configuration file packaged inside the application.'
      : `A ${entry.format.formatName} file bundled inside the APK (${entry.size.toLocaleString()} bytes).`,
    technicalSummary: `${entry.format.summary} Detected via ${entry.format.detectionMethod} (magic: ${entry.format.magicHex || 'empty'}, Shannon entropy: ${entry.format.entropy} bits/byte).`,
    whatItContains:
      candidatesText.length > 0
        ? candidatesText
        : [
            `MIME Type: ${entry.format.mimeType}`,
            `Shannon Entropy: ${entry.format.entropy} / 8.000 bits/byte`,
            `Raw size: ${entry.size.toLocaleString()} bytes`,
          ],
    howAndroidUsesIt: lower.startsWith('assets/')
      ? 'Accessed at runtime as a raw stream via AssetManager.open().'
      : lower.startsWith('res/')
        ? 'Indexed by resources.arsc and loaded via Android Resources API.'
        : 'Bundled archive payload inside the APK container.',
    whatCanBeDecoded: entry.format.isText
      ? 'Full UTF-8 text content, syntax structure, and searchable tokens.'
      : 'Hexadecimal bytes, ASCII/UTF-8 string extraction, magic signature, and entropy profile.',
    whatCannotBeRecovered:
      entry.format.entropy > 7.5
        ? 'High entropy indicates compressed or encrypted binary data that cannot be decoded without the domain format or key.'
        : 'Proprietary schema field names if serialized without reflection metadata.',
    referencedBy: referencedBy.length ? referencedBy : ['Archive entry'],
    nextFilesToInspect: nextFilesToInspect.length ? nextFilesToInspect : ['AndroidManifest.xml'],
  };
}
