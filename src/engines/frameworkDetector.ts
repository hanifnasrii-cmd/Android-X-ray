import { ApkEntry, DecodedManifest, DexAnalysis, FrameworkDetection } from '../types/xray';

interface Rule {
  name: string;
  category: FrameworkDetection['category'];
  explanation: string;
  filePatterns?: RegExp[];
  classPrefixes?: string[];
  manifestHints?: RegExp[];
  versionRegex?: RegExp;
}

const RULES: Rule[] = [
  {
    name: 'Kotlin Runtime',
    category: 'Language / Runtime',
    explanation: 'Kotlin standard library and compiler metadata bundled in DEX/META-INF.',
    filePatterns: [/^kotlin\//i, /META-INF\/.*\.kotlin_module$/i, /kotlin-tooling-metadata\.json$/i],
    classPrefixes: ['kotlin.', 'kotlinx.'],
  },
  {
    name: 'Jetpack Compose',
    category: 'UI Framework',
    explanation: 'Declarative Android UI toolkit compiled into Compose slot-table runtime calls.',
    filePatterns: [/META-INF\/androidx\.compose/i],
    classPrefixes: ['androidx.compose.runtime.', 'androidx.compose.ui.', 'androidx.compose.material3.'],
  },
  {
    name: 'Flutter',
    category: 'Cross-Platform',
    explanation: 'Dart AOT snapshot (libapp.so) running on the Skia/Impeller Flutter engine (libflutter.so).',
    filePatterns: [/lib\/.*\/libflutter\.so$/i, /lib\/.*\/libapp\.so$/i, /^assets\/flutter_assets\//i],
    classPrefixes: ['io.flutter.embedding.', 'io.flutter.plugin.'],
  },
  {
    name: 'React Native',
    category: 'Cross-Platform',
    explanation: 'JavaScript bundle executed via Hermes or JSC bridge over JNI.',
    filePatterns: [/assets\/index\.android\.bundle$/i, /lib\/.*\/libreactnativejni\.so$/i, /lib\/.*\/libhermes\.so$/i],
    classPrefixes: ['com.facebook.react.', 'com.facebook.hermes.'],
  },
  {
    name: 'Unity Engine',
    category: 'Game Engine',
    explanation: 'Unity C# / IL2CPP game runtime and serialized asset bundles.',
    filePatterns: [/lib\/.*\/libunity\.so$/i, /lib\/.*\/libil2cpp\.so$/i, /^assets\/bin\/Data\//i],
    classPrefixes: ['com.unity3d.player.'],
  },
  {
    name: 'Unreal Engine',
    category: 'Game Engine',
    explanation: 'Unreal Engine native C++ runtime and cooked PAK assets.',
    filePatterns: [/lib\/.*\/libUE4\.so$/i, /lib\/.*\/libUnreal\.so$/i, /\.pak$/i],
    classPrefixes: ['com.epicgames.ue4.', 'com.epicgames.unreal.'],
  },
  {
    name: 'Xamarin / .NET MAUI',
    category: 'Cross-Platform',
    explanation: 'Mono/.NET managed assemblies packaged alongside libmonodroid.so.',
    filePatterns: [/lib\/.*\/libmonodroid\.so$/i, /assemblies\/.*\.dll$/i],
    classPrefixes: ['mono.android.', 'crc64'],
  },
  {
    name: 'Cordova / Ionic / Capacitor',
    category: 'Cross-Platform',
    explanation: 'WebView hybrid container serving bundled HTML/JS/CSS assets.',
    filePatterns: [/^assets\/www\/index\.html$/i, /^assets\/public\/index\.html$/i, /capacitor\.config\.json$/i],
    classPrefixes: ['org.apache.cordova.', 'com.getcapacitor.'],
  },
  {
    name: 'Android WebView',
    category: 'UI Framework',
    explanation: 'Embedded Chromium WebView component or local HTML/JS content.',
    filePatterns: [/^assets\/.*\.(html|js)$/i],
    classPrefixes: ['android.webkit.WebView', 'androidx.webkit.'],
  },
  {
    name: 'AndroidX / Jetpack',
    category: 'Architecture / DI',
    explanation: 'Modern Android Jetpack support libraries (AppCompat, Lifecycle, Navigation, Core).',
    filePatterns: [/META-INF\/androidx\./i, /androidx\..*\.version$/i],
    classPrefixes: ['androidx.appcompat.', 'androidx.lifecycle.', 'androidx.navigation.', 'androidx.core.'],
  },
  {
    name: 'Dagger / Hilt',
    category: 'Architecture / DI',
    explanation: 'Compile-time dependency injection graph generated via Dagger/Hilt.',
    filePatterns: [/META-INF\/.*hilt/i, /META-INF\/.*dagger/i],
    classPrefixes: ['dagger.hilt.', 'dagger.internal.'],
  },
  {
    name: 'OkHttp / Retrofit',
    category: 'Networking',
    explanation: 'HTTP client and declarative REST API networking stack.',
    filePatterns: [/META-INF\/okhttp/i],
    classPrefixes: ['okhttp3.', 'retrofit2.'],
  },
  {
    name: 'Room / SQLite Persistence',
    category: 'Storage / DB',
    explanation: 'AndroidX Room ORM or bundled SQLite relational database storage.',
    filePatterns: [/\.db$/i, /\.sqlite$/i, /META-INF\/androidx\.room/i],
    classPrefixes: ['androidx.room.'],
  },
  {
    name: 'Firebase SDK',
    category: 'Analytics / SDK',
    explanation: 'Google Firebase client services (Auth, Firestore, Messaging, Analytics).',
    filePatterns: [/firebase-.*\.properties$/i],
    classPrefixes: ['com.google.firebase.'],
    manifestHints: [/com\.google\.firebase/i],
  },
  {
    name: 'Kotlin Coroutines',
    category: 'Language / Runtime',
    explanation: 'Structured asynchronous concurrency runtime.',
    filePatterns: [/META-INF\/kotlinx_coroutines/i],
    classPrefixes: ['kotlinx.coroutines.'],
  },
];

export function detectFrameworks(
  entries: ApkEntry[],
  manifest: DecodedManifest | null,
  dexFiles: DexAnalysis[]
): FrameworkDetection[] {
  const detections: FrameworkDetection[] = [];
  const allClassNames = dexFiles.flatMap((d) => d.classes.map((c) => c.className));
  const allTypeNames = dexFiles.flatMap((d) => d.types);

  for (const rule of RULES) {
    const evidence: string[] = [];
    const relevantFiles: string[] = [];
    const relevantClasses: string[] = [];
    let version: string | undefined;

    if (rule.filePatterns) {
      for (const entry of entries) {
        if (rule.filePatterns.some((re) => re.test(entry.path))) {
          if (relevantFiles.length < 12) relevantFiles.push(entry.path);
          if (entry.path.endsWith('.version') || entry.path.endsWith('.properties') || entry.path.endsWith('.json')) {
            if (entry.size < 4096) {
              const txt = new TextDecoder('utf-8', { fatal: false }).decode(entry.bytes).trim();
              const m = txt.match(/\b\d+\.\d+(\.\d+)?(-[a-zA-Z0-9]+)?\b/);
              if (m && !version) version = m[0];
            }
          }
        }
      }
      if (relevantFiles.length > 0) {
        evidence.push(`Matched ${relevantFiles.length} artifact file(s) in archive`);
      }
    }

    if (rule.classPrefixes) {
      for (const cls of allClassNames) {
        if (rule.classPrefixes.some((p) => cls.startsWith(p))) {
          if (relevantClasses.length < 15) relevantClasses.push(cls);
        }
      }
      if (relevantClasses.length === 0 && allTypeNames.length > 0) {
        for (const t of allTypeNames) {
          const dotted = t.startsWith('L') ? t.slice(1, -1).replace(/\//g, '.') : t;
          if (rule.classPrefixes.some((p) => dotted.startsWith(p))) {
            if (relevantClasses.length < 15) relevantClasses.push(dotted);
          }
        }
      }
      if (relevantClasses.length > 0) {
        evidence.push(`Found ${relevantClasses.length}+ matching class descriptors in DEX`);
      }
    }

    if (rule.manifestHints && manifest) {
      if (rule.manifestHints.some((re) => re.test(manifest.rawXml))) {
        evidence.push('Referenced in AndroidManifest.xml declarations');
        if (!relevantFiles.includes('AndroidManifest.xml')) {
          relevantFiles.push('AndroidManifest.xml');
        }
      }
    }

    if (evidence.length > 0) {
      const confidence: FrameworkDetection['confidence'] =
        relevantFiles.length > 0 && relevantClasses.length > 0
          ? 'High'
          : relevantFiles.some((f) => f.endsWith('.so') || f.includes('flutter_assets') || f.includes('index.android.bundle'))
            ? 'High'
            : relevantClasses.length >= 2 || relevantFiles.length >= 2
              ? 'High'
              : 'Medium';

      detections.push({
        name: rule.name,
        category: rule.category,
        version,
        confidence,
        evidence,
        relevantFiles,
        relevantClasses,
        explanation: rule.explanation,
      });
    }
  }

  // Always add Native Android SDK signal if AndroidManifest.xml is present
  if (manifest) {
    detections.unshift({
      name: 'Android Native App Platform',
      category: 'Language / Runtime',
      version: manifest.targetSdk !== '—' ? `Target API ${manifest.targetSdk}` : undefined,
      confidence: 'High',
      evidence: [
        `Package ${manifest.packageName} declared in AndroidManifest.xml`,
        `${manifest.components.length} Android components registered`,
      ],
      relevantFiles: ['AndroidManifest.xml', ...dexFiles.map((d) => d.filePath)],
      relevantClasses: manifest.components.slice(0, 8).map((c) => c.name),
      explanation: 'Standard Android application package executed by ART/Dalvik runtime.',
    });
  }

  return detections;
}
