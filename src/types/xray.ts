export type NavSection =
  | 'library'
  | 'explorer'
  | 'search'
  | 'manifest'
  | 'code'
  | 'resources'
  | 'ui-arch'
  | 'frameworks'
  | 'dependencies'
  | 'native'
  | 'binary'
  | 'databases'
  | 'graph-reports'
  | 'settings';

export type FileCategory =
  | 'manifest'
  | 'axml'
  | 'dex'
  | 'arsc'
  | 'elf'
  | 'sqlite'
  | 'xml'
  | 'code'
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'archive'
  | 'font'
  | 'cert'
  | 'protobuf'
  | 'binary';

export interface DetectedFormat {
  category: FileCategory;
  formatName: string;
  mimeType: string;
  detectionMethod: 'magic-bytes' | 'structural' | 'content' | 'extension' | 'fallback';
  confidence: 'high' | 'medium' | 'low';
  magicHex: string;
  isText: boolean;
  language?: string;
  entropy: number;
  summary: string;
  candidates?: Array<{ name: string; confidence: string; reason: string }>;
}

export interface ApkEntry {
  path: string;
  name: string;
  dir: string;
  size: number;
  compressedSize: number;
  isDirectory: boolean;
  bytes: Uint8Array;
  format: DetectedFormat;
}

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  fileCount: number;
  children: TreeNode[];
  entry?: ApkEntry;
}

export interface ManifestAttribute {
  namespace: string;
  name: string;
  value: string;
  rawType: number;
  resourceId?: number;
}

export interface ManifestComponent {
  type: 'activity' | 'activity-alias' | 'service' | 'receiver' | 'provider';
  name: string;
  shortName: string;
  exported: boolean | null;
  permission?: string;
  process?: string;
  launchMode?: string;
  authorities?: string;
  intentFilters: Array<{
    actions: string[];
    categories: string[];
    dataSchemes: string[];
    dataHosts: string[];
    dataPaths: string[];
  }>;
  attributes: ManifestAttribute[];
  lineNumber: number;
}

export interface ManifestSecurityFinding {
  id: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  component?: string;
  attribute?: string;
}

export interface DecodedManifest {
  isBinaryXml: boolean;
  rawXml: string;
  packageName: string;
  versionCode: string;
  versionName: string;
  minSdk: string;
  targetSdk: string;
  compileSdk: string;
  appLabel: string;
  appTheme: string;
  allowBackup: string;
  debuggable: string;
  usesCleartextTraffic: string;
  networkSecurityConfig: string;
  applicationClass: string;
  permissions: Array<{ name: string; maxSdkVersion?: string; protectionLevel?: string }>;
  usesFeatures: Array<{ name: string; required: string }>;
  components: ManifestComponent[];
  metaData: Array<{ name: string; value: string; resource?: string }>;
  deepLinks: Array<{ scheme: string; host: string; path: string; component: string }>;
  securityFindings: ManifestSecurityFinding[];
  xmlTree: XmlElementNode | null;
}

export interface XmlElementNode {
  tag: string;
  attributes: ManifestAttribute[];
  children: XmlElementNode[];
  lineNumber: number;
}

export interface DexFieldInfo {
  name: string;
  type: string;
  accessFlags: number;
  accessString: string;
  isStatic: boolean;
}

export interface DexMethodInfo {
  methodIdx: number;
  name: string;
  returnType: string;
  parameters: string[];
  accessFlags: number;
  accessString: string;
  isDirect: boolean;
  registersSize: number;
  insSize: number;
  outsSize: number;
  insnsSize: number;
  codeOffset: number;
  smaliInstructions: string[];
  pseudocodeLines: string[];
  referencedStrings: string[];
  referencedMethods: string[];
}

export interface DexClassInfo {
  dexFile: string;
  descriptor: string;
  className: string;
  packageName: string;
  simpleName: string;
  superClass: string;
  interfaces: string[];
  sourceFile: string;
  accessFlags: number;
  accessString: string;
  staticFields: DexFieldInfo[];
  instanceFields: DexFieldInfo[];
  directMethods: DexMethodInfo[];
  virtualMethods: DexMethodInfo[];
  smaliText: string;
  pseudocodeText: string;
}

export interface DexAnalysis {
  filePath: string;
  version: string;
  fileSize: number;
  checksum: string;
  sha1: string;
  endianTag: string;
  stringCount: number;
  typeCount: number;
  protoCount: number;
  fieldCount: number;
  methodCount: number;
  classDefCount: number;
  strings: string[];
  types: string[];
  methods: Array<{ className: string; name: string; signature: string }>;
  fields: Array<{ className: string; name: string; type: string }>;
  classes: DexClassInfo[];
  packages: Record<string, number>;
}

export interface ResourceConfigValue {
  configLabel: string;
  density?: string;
  language?: string;
  nightMode?: string;
  sdkVersion?: number;
  value: string;
  dataType: number;
}

export interface ResourceEntryInfo {
  id: number;
  idHex: string;
  packageName: string;
  typeName: string;
  name: string;
  reference: string;
  values: ResourceConfigValue[];
}

export interface ResourceTable {
  filePath: string;
  packageCount: number;
  packages: Array<{ id: number; name: string }>;
  entries: ResourceEntryInfo[];
  byId: Map<number, ResourceEntryInfo>;
  typeCounts: Record<string, number>;
}

export interface ElfSectionInfo {
  name: string;
  type: string;
  addr: string;
  offset: number;
  size: number;
  flags: string;
}

export interface ElfSegmentInfo {
  type: string;
  flags: string;
  offset: number;
  vaddr: string;
  fileSize: number;
  memSize: number;
  align: number;
}

export interface ElfSymbolInfo {
  name: string;
  binding: string;
  type: string;
  sectionIndex: number;
  value: string;
  size: number;
  isImported: boolean;
}

export interface ElfAnalysis {
  filePath: string;
  isValid: boolean;
  error?: string;
  bits: 32 | 64;
  endianness: 'Little Endian' | 'Big Endian';
  elfType: string;
  machine: string;
  abiGuess: string;
  entryPoint: string;
  buildId: string;
  hasDebugSections: boolean;
  segments: ElfSegmentInfo[];
  sections: ElfSectionInfo[];
  neededLibraries: string[];
  importedSymbols: ElfSymbolInfo[];
  exportedSymbols: ElfSymbolInfo[];
  extractedStrings: string[];
}

export interface CertInfo {
  filePath: string;
  type: 'MANIFEST.MF' | 'SIGNATURE_FILE' | 'PKCS7_CERT' | 'UNKNOWN';
  subjectStrings: string[];
  sha256Fingerprints: string[];
  algorithms: string[];
  manifestEntriesCount: number;
  rawPreview: string;
}

export interface FrameworkDetection {
  name: string;
  category: 'UI Framework' | 'Language / Runtime' | 'Cross-Platform' | 'Game Engine' | 'Architecture / DI' | 'Networking' | 'Storage / DB' | 'Analytics / SDK';
  version?: string;
  confidence: 'High' | 'Medium' | 'Low';
  evidence: string[];
  relevantFiles: string[];
  relevantClasses: string[];
  explanation: string;
}

export interface ArchitectureNode {
  id: string;
  label: string;
  kind: 'app' | 'activity' | 'service' | 'receiver' | 'provider' | 'dex-pkg' | 'native' | 'resources' | 'assets';
  subtitle: string;
  targetPath?: string;
  lineNumber?: number;
  x: number;
  y: number;
}

export interface ArchitectureEdge {
  from: string;
  to: string;
  label: string;
}

export interface ArchitectureGraphData {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
}

export interface SearchIndexItem {
  id: string;
  path: string;
  name: string;
  category: 'file' | 'manifest' | 'dex-class' | 'dex-method' | 'dex-string' | 'resource' | 'text' | 'native';
  line: number;
  offset?: number;
  text: string;
  searchableLower: string;
}

export interface SearchResult {
  item: SearchIndexItem;
  matchIndex: number;
  matchLength: number;
  preview: string;
}

export interface EditorTab {
  id: string;
  path: string;
  name: string;
  viewMode: 'decoded' | 'hex' | 'metadata' | 'smali' | 'java' | 'explain' | 'sqlite' | 'elf' | 'preview';
  targetLine?: number;
  targetOffset?: number;
}

export interface FileExplanation {
  title: string;
  format: string;
  beginnerSummary: string;
  technicalSummary: string;
  whatItContains: string[];
  howAndroidUsesIt: string;
  whatCanBeDecoded: string;
  whatCannotBeRecovered: string;
  referencedBy: string[];
  nextFilesToInspect: string[];
}

export interface SplitApkInfo {
  name: string;
  size: number;
  role: 'base' | 'abi' | 'density' | 'language' | 'feature' | 'unknown';
}

export interface ApkProject {
  id: string;
  fileName: string;
  archiveKind: 'APK' | 'APKS' | 'XAPK' | 'AAB' | 'STANDALONE';
  totalCompressedSize: number;
  totalUncompressedSize: number;
  analyzedAt: number;
  isReferenceFixture: boolean;
  entries: ApkEntry[];
  entryMap: Map<string, ApkEntry>;
  tree: TreeNode;
  manifest: DecodedManifest | null;
  dexFiles: DexAnalysis[];
  resourceTable: ResourceTable | null;
  elfFiles: ElfAnalysis[];
  certificates: CertInfo[];
  frameworks: FrameworkDetection[];
  graph: ArchitectureGraphData;
  searchIndex: SearchIndexItem[];
  splitApks: SplitApkInfo[];
  supportedAbis: string[];
  warnings: string[];
}

export interface SqliteTableSummary {
  name: string;
  type: 'table' | 'view' | 'index' | 'trigger';
  sql: string;
  rowCount: number;
  columns: Array<{ cid: number; name: string; type: string; notnull: boolean; pk: boolean }>;
}

export interface FeatureMatrixItem {
  area: string;
  feature: string;
  status: 'TESTED' | 'IMPLEMENTED' | 'PARTIALLY SUPPORTED' | 'BLOCKED BY ANDROID RESTRICTIONS' | 'UNSUPPORTED';
  notes: string;
}
