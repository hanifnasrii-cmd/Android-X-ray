import { strToU8, zipSync } from 'fflate';
import { getSqlEngine } from './sqliteEngine';

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function u16(v: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, v, true);
  return b;
}

function u32(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v >>> 0, true);
  return b;
}

function i32(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, v, true);
  return b;
}

function buildUtf16StringPool(strings: string[]): Uint8Array {
  const encoded: Uint8Array[] = [];
  const offsets: number[] = [];
  let curOffset = 0;

  for (const s of strings) {
    offsets.push(curOffset);
    const buf = new Uint8Array(2 + s.length * 2 + 2);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, s.length, true);
    for (let i = 0; i < s.length; i++) {
      dv.setUint16(2 + i * 2, s.charCodeAt(i), true);
    }
    dv.setUint16(2 + s.length * 2, 0, true);
    encoded.push(buf);
    curOffset += buf.length;
  }

  const dataBlob = concatBytes(encoded);
  const padLen = (4 - (dataBlob.length % 4)) % 4;
  const headerSize = 28;
  const stringsStart = headerSize + strings.length * 4;
  const totalSize = stringsStart + dataBlob.length + padLen;

  return concatBytes([
    u16(0x0001), // RES_STRING_POOL_TYPE
    u16(headerSize),
    u32(totalSize),
    u32(strings.length),
    u32(0), // styleCount
    u32(0), // UTF-16LE
    u32(stringsStart),
    u32(0), // stylesStart
    ...offsets.map(u32),
    dataBlob,
    new Uint8Array(padLen),
  ]);
}

function buildBinaryAxml(
  strings: string[],
  resMap: number[],
  elements: Array<
    | { kind: 'startNs'; prefix: number; uri: number }
    | { kind: 'endNs'; prefix: number; uri: number }
    | {
        kind: 'startEl';
        ns: number;
        name: number;
        attrs: Array<{ ns: number; name: number; rawStr: number; type: number; data: number }>;
      }
    | { kind: 'endEl'; ns: number; name: number }
  >
): Uint8Array {
  const chunks: Uint8Array[] = [];
  chunks.push(buildUtf16StringPool(strings));

  if (resMap.length > 0) {
    chunks.push(
      concatBytes([u16(0x0180), u16(8), u32(8 + resMap.length * 4), ...resMap.map(u32)])
    );
  }

  let line = 2;
  for (const el of elements) {
    if (el.kind === 'startNs') {
      chunks.push(concatBytes([u16(0x0100), u16(16), u32(24), u32(line++), i32(-1), i32(el.prefix), i32(el.uri)]));
    } else if (el.kind === 'endNs') {
      chunks.push(concatBytes([u16(0x0101), u16(16), u32(24), u32(line++), i32(-1), i32(el.prefix), i32(el.uri)]));
    } else if (el.kind === 'startEl') {
      const attrBytes = el.attrs.map((a) =>
        concatBytes([
          i32(a.ns),
          i32(a.name),
          i32(a.rawStr),
          u16(8),
          new Uint8Array([0, a.type]),
          i32(a.data),
        ])
      );
      const size = 36 + el.attrs.length * 20;
      chunks.push(
        concatBytes([
          u16(0x0102),
          u16(16),
          u32(size),
          u32(line++),
          i32(-1),
          i32(el.ns),
          i32(el.name),
          u16(20),
          u16(20),
          u16(el.attrs.length),
          u16(0),
          u16(0),
          u16(0),
          ...attrBytes,
        ])
      );
    } else {
      chunks.push(concatBytes([u16(0x0103), u16(16), u32(24), u32(line++), i32(-1), i32(el.ns), i32(el.name)]));
    }
  }

  const body = concatBytes(chunks);
  return concatBytes([u16(0x0003), u16(8), u32(8 + body.length), body]);
}

function buildReferenceManifestAxml(): Uint8Array {
  const androidNs = 'http://schemas.android.com/apk/res/android';
  const strings = [
    'android',
    androidNs,
    'versionCode',
    'versionName',
    'minSdkVersion',
    'targetSdkVersion',
    'name',
    'label',
    'icon',
    'theme',
    'allowBackup',
    'exported',
    'usesCleartextTraffic',
    'scheme',
    'host',
    'package',
    'compileSdkVersion',
    'manifest',
    'uses-sdk',
    'uses-permission',
    'application',
    'activity',
    'service',
    'receiver',
    'intent-filter',
    'action',
    'category',
    'data',
    'io.xray.inspector.demo',
    '2.4.0',
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE',
    'io.xray.inspector.demo.XRayApp',
    'io.xray.inspector.demo.MainActivity',
    'io.xray.inspector.demo.SyncService',
    'io.xray.inspector.demo.BootReceiver',
    'android.intent.action.MAIN',
    'android.intent.category.LAUNCHER',
    'android.intent.action.VIEW',
    'xray',
    'inspect',
  ];

  const idx = (s: string) => strings.indexOf(s);
  const resMap = [
    0, 0,
    0x0101021b, 0x0101021c, 0x0101020c, 0x01010270,
    0x01010003, 0x01010001, 0x01010002, 0x01010000,
    0x01010280, 0x01010010, 0x010104ec, 0x01010027, 0x01010028,
  ];
  const ns = idx(androidNs);

  return buildBinaryAxml(strings, resMap, [
    { kind: 'startNs', prefix: idx('android'), uri: ns },
    {
      kind: 'startEl',
      ns: -1,
      name: idx('manifest'),
      attrs: [
        { ns: -1, name: idx('package'), rawStr: idx('io.xray.inspector.demo'), type: 3, data: idx('io.xray.inspector.demo') },
        { ns, name: idx('versionCode'), rawStr: -1, type: 0x10, data: 20400 },
        { ns, name: idx('versionName'), rawStr: idx('2.4.0'), type: 3, data: idx('2.4.0') },
        { ns, name: idx('compileSdkVersion'), rawStr: -1, type: 0x10, data: 35 },
      ],
    },
    {
      kind: 'startEl',
      ns: -1,
      name: idx('uses-sdk'),
      attrs: [
        { ns, name: idx('minSdkVersion'), rawStr: -1, type: 0x10, data: 30 },
        { ns, name: idx('targetSdkVersion'), rawStr: -1, type: 0x10, data: 35 },
      ],
    },
    { kind: 'endEl', ns: -1, name: idx('uses-sdk') },
    {
      kind: 'startEl',
      ns: -1,
      name: idx('uses-permission'),
      attrs: [{ ns, name: idx('name'), rawStr: idx('android.permission.INTERNET'), type: 3, data: idx('android.permission.INTERNET') }],
    },
    { kind: 'endEl', ns: -1, name: idx('uses-permission') },
    {
      kind: 'startEl',
      ns: -1,
      name: idx('uses-permission'),
      attrs: [{ ns, name: idx('name'), rawStr: idx('android.permission.ACCESS_NETWORK_STATE'), type: 3, data: idx('android.permission.ACCESS_NETWORK_STATE') }],
    },
    { kind: 'endEl', ns: -1, name: idx('uses-permission') },
    {
      kind: 'startEl',
      ns: -1,
      name: idx('application'),
      attrs: [
        { ns, name: idx('name'), rawStr: idx('io.xray.inspector.demo.XRayApp'), type: 3, data: idx('io.xray.inspector.demo.XRayApp') },
        { ns, name: idx('label'), rawStr: -1, type: 0x01, data: 0x7f010000 },
        { ns, name: idx('icon'), rawStr: -1, type: 0x01, data: 0x7f030000 },
        { ns, name: idx('allowBackup'), rawStr: -1, type: 0x12, data: 0 },
        { ns, name: idx('usesCleartextTraffic'), rawStr: -1, type: 0x12, data: 0 },
      ],
    },
    {
      kind: 'startEl',
      ns: -1,
      name: idx('activity'),
      attrs: [
        { ns, name: idx('name'), rawStr: idx('io.xray.inspector.demo.MainActivity'), type: 3, data: idx('io.xray.inspector.demo.MainActivity') },
        { ns, name: idx('exported'), rawStr: -1, type: 0x12, data: 1 },
      ],
    },
    { kind: 'startEl', ns: -1, name: idx('intent-filter'), attrs: [] },
    {
      kind: 'startEl',
      ns: -1,
      name: idx('action'),
      attrs: [{ ns, name: idx('name'), rawStr: idx('android.intent.action.MAIN'), type: 3, data: idx('android.intent.action.MAIN') }],
    },
    { kind: 'endEl', ns: -1, name: idx('action') },
    {
      kind: 'startEl',
      ns: -1,
      name: idx('category'),
      attrs: [{ ns, name: idx('name'), rawStr: idx('android.intent.category.LAUNCHER'), type: 3, data: idx('android.intent.category.LAUNCHER') }],
    },
    { kind: 'endEl', ns: -1, name: idx('category') },
    { kind: 'endEl', ns: -1, name: idx('intent-filter') },
    { kind: 'startEl', ns: -1, name: idx('intent-filter'), attrs: [] },
    {
      kind: 'startEl',
      ns: -1,
      name: idx('action'),
      attrs: [{ ns, name: idx('name'), rawStr: idx('android.intent.action.VIEW'), type: 3, data: idx('android.intent.action.VIEW') }],
    },
    { kind: 'endEl', ns: -1, name: idx('action') },
    {
      kind: 'startEl',
      ns: -1,
      name: idx('data'),
      attrs: [
        { ns, name: idx('scheme'), rawStr: idx('xray'), type: 3, data: idx('xray') },
        { ns, name: idx('host'), rawStr: idx('inspect'), type: 3, data: idx('inspect') },
      ],
    },
    { kind: 'endEl', ns: -1, name: idx('data') },
    { kind: 'endEl', ns: -1, name: idx('intent-filter') },
    { kind: 'endEl', ns: -1, name: idx('activity') },
    {
      kind: 'startEl',
      ns: -1,
      name: idx('service'),
      attrs: [
        { ns, name: idx('name'), rawStr: idx('io.xray.inspector.demo.SyncService'), type: 3, data: idx('io.xray.inspector.demo.SyncService') },
        { ns, name: idx('exported'), rawStr: -1, type: 0x12, data: 0 },
      ],
    },
    { kind: 'endEl', ns: -1, name: idx('service') },
    {
      kind: 'startEl',
      ns: -1,
      name: idx('receiver'),
      attrs: [
        { ns, name: idx('name'), rawStr: idx('io.xray.inspector.demo.BootReceiver'), type: 3, data: idx('io.xray.inspector.demo.BootReceiver') },
        { ns, name: idx('exported'), rawStr: -1, type: 0x12, data: 0 },
      ],
    },
    { kind: 'endEl', ns: -1, name: idx('receiver') },
    { kind: 'endEl', ns: -1, name: idx('application') },
    { kind: 'endEl', ns: -1, name: idx('manifest') },
    { kind: 'endNs', prefix: idx('android'), uri: ns },
  ]);
}

function buildReferenceArsc(): Uint8Array {
  const globalPool = buildUtf16StringPool([
    'X-Ray Demo Host',
    'Inspect APK binaries, Dalvik bytecode, ELF libs & SQLite.',
    'res/mipmap-xxhdpi-v4/ic_launcher.png',
    'res/drawable/ic_xray_mark.xml',
  ]);

  const typePool = buildUtf16StringPool(['string', 'color', 'mipmap', 'drawable']);
  const keyPool = buildUtf16StringPool(['app_name', 'tagline', 'brand_olive', 'surface_dark', 'ic_launcher', 'ic_xray_mark']);

  const buildTypeChunk = (typeId: number, dpi: number, uiModeByte: number, entries: Array<{ keyIdx: number; type: number; data: number }>) => {
    const config = new Uint8Array(48);
    const cdv = new DataView(config.buffer);
    cdv.setUint32(0, 48, true); // size
    cdv.setUint16(14, dpi, true);
    config[28] = uiModeByte;
    cdv.setUint16(32, 30, true); // sdkVersion

    const offsets = entries.map((_, i) => u32(i * 16));
    const entryBytes = entries.map((e) =>
      concatBytes([u16(8), u16(0), u32(e.keyIdx), u16(8), new Uint8Array([0, e.type]), u32(e.data)])
    );
    const headerSize = 20 + config.length;
    const entriesStart = headerSize + entries.length * 4;
    const totalSize = entriesStart + entryBytes.length * 16;

    return concatBytes([
      u16(0x0201), // RES_TABLE_TYPE_TYPE
      u16(headerSize),
      u32(totalSize),
      new Uint8Array([typeId, 0, 0, 0]),
      u32(entries.length),
      u32(entriesStart),
      config,
      ...offsets,
      ...entryBytes,
    ]);
  };

  const pkgChunks = concatBytes([
    typePool,
    keyPool,
    buildTypeChunk(1, 0, 0, [
      { keyIdx: 0, type: 0x03, data: 0 },
      { keyIdx: 1, type: 0x03, data: 1 },
    ]),
    buildTypeChunk(2, 0, 0x10, [
      { keyIdx: 2, type: 0x1c, data: 0xff9bb848 | 0 },
      { keyIdx: 3, type: 0x1c, data: 0xff161813 | 0 },
    ]),
    buildTypeChunk(2, 0, 0x20, [
      { keyIdx: 2, type: 0x1c, data: 0xffb7d45f | 0 },
      { keyIdx: 3, type: 0x1c, data: 0xff0d0f0b | 0 },
    ]),
    buildTypeChunk(3, 480, 0, [{ keyIdx: 4, type: 0x03, data: 2 }]),
    buildTypeChunk(4, 0, 0, [{ keyIdx: 5, type: 0x03, data: 3 }]),
  ]);

  const pkgNameBuf = new Uint8Array(256);
  const pkgNameStr = 'io.xray.inspector.demo';
  const pkgView = new DataView(pkgNameBuf.buffer);
  for (let i = 0; i < pkgNameStr.length; i++) pkgView.setUint16(i * 2, pkgNameStr.charCodeAt(i), true);

  const pkgHeaderSize = 288;
  const typeStringsOffset = pkgHeaderSize;
  const keyStringsOffset = pkgHeaderSize + typePool.length;
  const pkgTotalSize = pkgHeaderSize + pkgChunks.length;

  const pkgChunk = concatBytes([
    u16(0x0200), // RES_TABLE_PACKAGE_TYPE
    u16(pkgHeaderSize),
    u32(pkgTotalSize),
    u32(0x7f), // packageId
    pkgNameBuf,
    u32(typeStringsOffset),
    u32(4),
    u32(keyStringsOffset),
    u32(6),
    u32(0),
    pkgChunks,
  ]);

  const totalSize = 12 + globalPool.length + pkgChunk.length;
  return concatBytes([u16(0x0002), u16(12), u32(totalSize), u32(1), globalPool, pkgChunk]);
}

function writeUleb(val: number): Uint8Array {
  const bytes: number[] = [];
  let v = val >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    bytes.push(b);
  } while (v !== 0);
  return new Uint8Array(bytes);
}

function buildReferenceDex(): Uint8Array {
  const strings = [
    'Landroidx/appcompat/app/AppCompatActivity;',
    'Landroid/app/Application;',
    'Landroid/app/Service;',
    'Landroid/content/BroadcastReceiver;',
    'Landroid/os/Bundle;',
    'Lio/xray/inspector/demo/BootReceiver;',
    'Lio/xray/inspector/demo/MainActivity;',
    'Lio/xray/inspector/demo/SyncService;',
    'Lio/xray/inspector/demo/XRayApp;',
    'Lkotlin/Metadata;',
    'Lokhttp3/OkHttpClient;',
    'MainActivity.kt',
    'SyncService.kt',
    'V',
    'XRayApp.kt',
    'https://api.example.invalid/v1/telemetry',
    'initNativeBridge',
    'onCreate',
    'xray_native',
  ];
  const types = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13,
  ]; // indices into strings

  // Protos: 0 = void(), 1 = void(Bundle)
  const typeListBundle = concatBytes([u32(1), u16(4), u16(0)]); // padded to 4 bytes

  // Methods: 0 = MainActivity.onCreate(Bundle), 1 = MainActivity.initNativeBridge(), 2 = OkHttpClient.<init>
  // Let's build string_data section first, then layout offsets cleanly
  const stringDataItems = strings.map((s) => concatBytes([writeUleb(s.length), strToU8(s), new Uint8Array([0])]));

  // Layout offsets
  const headerSize = 0x70;
  const stringIdsOff = headerSize;
  const typeIdsOff = stringIdsOff + strings.length * 4;
  const protoIdsOff = typeIdsOff + types.length * 4;
  const fieldIdsOff = protoIdsOff + 2 * 12;
  const methodIdsOff = fieldIdsOff + 1 * 8;
  const classDefsOff = methodIdsOff + 3 * 8;
  let dataCursor = classDefsOff + 4 * 32;

  const dataChunks: Uint8Array[] = [];
  const pushData = (chunk: Uint8Array): number => {
    const off = dataCursor;
    dataChunks.push(chunk);
    dataCursor += chunk.length;
    return off;
  };
  const align4 = () => {
    const pad = (4 - (dataCursor % 4)) % 4;
    if (pad > 0) pushData(new Uint8Array(pad));
  };

  const stringDataOffsets = stringDataItems.map((item) => pushData(item));
  align4();
  const typeListOff = pushData(typeListBundle);
  align4();

  // Build code_item for MainActivity.onCreate: const-string v0, "xray_native"; return-void
  const insnsOnCreate = concatBytes([
    u16(0x001a), // const-string v0
    u16(strings.indexOf('xray_native')),
    u16(0x001a), // const-string v0
    u16(strings.indexOf('https://api.example.invalid/v1/telemetry')),
    u16(0x0070), // invoke-direct {v1}, OkHttpClient()
    u16(2),
    u16(0x0001),
    u16(0x000e), // return-void
  ]);
  const codeItemOnCreate = concatBytes([
    u16(2), // registers
    u16(2), // ins
    u16(1), // outs
    u16(0), // tries
    u32(0), // debug_info_off
    u32(insnsOnCreate.length / 2),
    insnsOnCreate,
  ]);
  align4();
  const codeOffOnCreate = pushData(codeItemOnCreate);
  align4();

  // class_data_item for MainActivity (0 static, 1 instance field, 0 direct, 2 virtual)
  const mainClassData = concatBytes([
    writeUleb(0),
    writeUleb(1),
    writeUleb(0),
    writeUleb(2),
    // instance field 0
    writeUleb(0),
    writeUleb(0x0002), // private
    // virtual method 0 (onCreate)
    writeUleb(0),
    writeUleb(0x0001), // public
    writeUleb(codeOffOnCreate),
    // virtual method 1 (initNativeBridge - native abstract)
    writeUleb(1),
    writeUleb(0x0102), // private native
    writeUleb(0),
  ]);
  const mainClassDataOff = pushData(mainClassData);

  const totalSize = dataCursor;
  const dex = new Uint8Array(totalSize);
  const view = new DataView(dex.buffer);

  // Header
  dex.set(strToU8('dex\n035\0'), 0);
  view.setUint32(32, totalSize, true);
  view.setUint32(36, headerSize, true);
  view.setUint32(40, 0x12345678, true);
  view.setUint32(52, totalSize - headerSize, true); // data_size
  view.setUint32(56, strings.length, true);
  view.setUint32(60, stringIdsOff, true);
  view.setUint32(64, types.length, true);
  view.setUint32(68, typeIdsOff, true);
  view.setUint32(72, 2, true);
  view.setUint32(76, protoIdsOff, true);
  view.setUint32(80, 1, true);
  view.setUint32(84, fieldIdsOff, true);
  view.setUint32(88, 3, true);
  view.setUint32(92, methodIdsOff, true);
  view.setUint32(96, 4, true);
  view.setUint32(100, classDefsOff, true);
  view.setUint32(104, totalSize - classDefsOff, true);
  view.setUint32(108, classDefsOff, true);

  stringDataOffsets.forEach((off, i) => view.setUint32(stringIdsOff + i * 4, off, true));
  types.forEach((strIdx, i) => view.setUint32(typeIdsOff + i * 4, strIdx, true));

  // Proto 0: V()
  view.setUint32(protoIdsOff, strings.indexOf('V'), true);
  view.setUint32(protoIdsOff + 4, 11, true); // type V
  view.setUint32(protoIdsOff + 8, 0, true);
  // Proto 1: V(Bundle)
  view.setUint32(protoIdsOff + 12, strings.indexOf('V'), true);
  view.setUint32(protoIdsOff + 16, 11, true);
  view.setUint32(protoIdsOff + 20, typeListOff, true);

  // Field 0: MainActivity.httpClient : OkHttpClient
  view.setUint16(fieldIdsOff, 6, true);
  view.setUint16(fieldIdsOff + 2, 10, true);
  view.setUint32(fieldIdsOff + 4, strings.indexOf('xray_native'), true);

  // Methods
  view.setUint16(methodIdsOff, 6, true);
  view.setUint16(methodIdsOff + 2, 1, true);
  view.setUint32(methodIdsOff + 4, strings.indexOf('onCreate'), true);

  view.setUint16(methodIdsOff + 8, 6, true);
  view.setUint16(methodIdsOff + 10, 0, true);
  view.setUint32(methodIdsOff + 12, strings.indexOf('initNativeBridge'), true);

  view.setUint16(methodIdsOff + 16, 10, true);
  view.setUint16(methodIdsOff + 18, 0, true);
  view.setUint32(methodIdsOff + 20, strings.indexOf('onCreate'), true);

  // 4 Class Defs
  const defs = [
    { cls: 6, sup: 0, src: 'MainActivity.kt', dataOff: mainClassDataOff },
    { cls: 8, sup: 1, src: 'XRayApp.kt', dataOff: 0 },
    { cls: 7, sup: 2, src: 'SyncService.kt', dataOff: 0 },
    { cls: 5, sup: 3, src: 'MainActivity.kt', dataOff: 0 },
  ];
  defs.forEach((d, i) => {
    const base = classDefsOff + i * 32;
    view.setUint32(base, d.cls, true);
    view.setUint32(base + 4, 0x0001, true); // public
    view.setUint32(base + 8, d.sup, true);
    view.setUint32(base + 16, strings.indexOf(d.src), true);
    view.setUint32(base + 24, d.dataOff, true);
  });

  // Write data chunks
  let writeAt = classDefsOff + 4 * 32;
  for (const ch of dataChunks) {
    dex.set(ch, writeAt);
    writeAt += ch.length;
  }
  return dex;
}

function buildReferenceElf64(): Uint8Array {
  // Minimal valid ELF64 AArch64 shared library with .shstrtab, .dynstr, .dynsym, .dynamic, .note.gnu.build-id
  const shstrtab = strToU8('\0.shstrtab\0.dynstr\0.dynsym\0.dynamic\0.note.gnu.build-id\0');
  const dynstr = strToU8('\0liblog.so\0libc.so\0Java_io_xray_inspector_demo_MainActivity_initNativeBridge\0__android_log_print\0');

  // 3 symbols (null, exported JNI, imported log)
  const dynsym = new Uint8Array(3 * 24);
  const symView = new DataView(dynsym.buffer);
  // Sym 1: Java_... (GLOBAL FUNC, shndx=1, addr=0x1000, size=64)
  symView.setUint32(24, 19, true);
  dynsym[24 + 4] = (1 << 4) | 2; // STB_GLOBAL | STT_FUNC
  symView.setUint16(24 + 6, 1, true);
  symView.setUint32(24 + 8, 0x1000, true);
  symView.setUint32(24 + 16, 64, true);

  // Sym 2: __android_log_print (GLOBAL FUNC, shndx=0 imported)
  const impOff = 19 + 'Java_io_xray_inspector_demo_MainActivity_initNativeBridge'.length + 1;
  symView.setUint32(48, impOff, true);
  dynsym[48 + 4] = (1 << 4) | 2;
  symView.setUint16(48 + 6, 0, true);

  // .dynamic: DT_NEEDED(1)=liblog.so(1), DT_NEEDED(1)=libc.so(11), DT_NULL(0)
  const dynamic = new Uint8Array(3 * 16);
  const dynView = new DataView(dynamic.buffer);
  dynView.setUint32(0, 1, true);
  dynView.setUint32(8, 1, true);
  dynView.setUint32(16, 1, true);
  dynView.setUint32(24, 11, true);

  // .note.gnu.build-id
  const note = concatBytes([
    u32(4), // namesz
    u32(8), // descsz
    u32(3), // NT_GNU_BUILD_ID
    strToU8('GNU\0'),
    new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x20, 0x26, 0x0a, 0x7f]),
  ]);

  const ehdrSize = 64;
  const phdrSize = 56;
  const phoff = ehdrSize;
  let off = ehdrSize + phdrSize;
  const shstrOff = off; off += shstrtab.length;
  const dynstrOff = off; off += dynstr.length;
  const dynsymOff = off; off += dynsym.length;
  const dynOff = off; off += dynamic.length;
  const noteOff = off; off += note.length;
  const shoff = off;

  const shEntries = 6; // null + 5 sections
  const total = shoff + shEntries * 64;
  const elf = new Uint8Array(total);
  const view = new DataView(elf.buffer);

  elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0], 0); // ELF64 LE
  view.setUint16(16, 3, true); // ET_DYN
  view.setUint16(18, 0xb7, true); // EM_AARCH64
  view.setUint32(20, 1, true);
  view.setUint32(24, 0x1000, true); // entry
  view.setUint32(32, phoff, true);
  view.setUint32(40, shoff, true);
  view.setUint16(52, ehdrSize, true);
  view.setUint16(54, phdrSize, true);
  view.setUint16(56, 1, true);
  view.setUint16(58, 64, true);
  view.setUint16(60, shEntries, true);
  view.setUint16(62, 1, true); // shstrndx

  // PT_LOAD segment
  view.setUint32(phoff, 1, true);
  view.setUint32(phoff + 4, 5, true); // R-X
  view.setUint32(phoff + 32, total, true);
  view.setUint32(phoff + 40, total, true);
  view.setUint32(phoff + 48, 0x1000, true);

  elf.set(shstrtab, shstrOff);
  elf.set(dynstr, dynstrOff);
  elf.set(dynsym, dynsymOff);
  elf.set(dynamic, dynOff);
  elf.set(note, noteOff);

  const writeSh = (idx: number, nameOff: number, type: number, offset: number, size: number, link = 0) => {
    const s = shoff + idx * 64;
    view.setUint32(s, nameOff, true);
    view.setUint32(s + 4, type, true);
    view.setUint32(s + 24, offset, true);
    view.setUint32(s + 32, size, true);
    view.setUint32(s + 40, link, true);
  };
  writeSh(1, 1, 3, shstrOff, shstrtab.length); // .shstrtab
  writeSh(2, 11, 3, dynstrOff, dynstr.length); // .dynstr
  writeSh(3, 19, 11, dynsymOff, dynsym.length, 2); // .dynsym -> .dynstr
  writeSh(4, 27, 6, dynOff, dynamic.length, 2); // .dynamic -> .dynstr
  writeSh(5, 36, 7, noteOff, note.length); // .note.gnu.build-id

  return elf;
}

export async function generateReferenceApkFile(): Promise<{ fileName: string; bytes: Uint8Array }> {
  const manifestBin = buildReferenceManifestAxml();
  const arscBin = buildReferenceArsc();
  const dexBin = buildReferenceDex();
  const elfBin = buildReferenceElf64();

  // Real SQLite DB created via WebAssembly SQLite
  const SQL = await getSqlEngine();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE inspection_profiles (id INTEGER PRIMARY KEY, target_api INTEGER, codename TEXT, security_tier TEXT);
    INSERT INTO inspection_profiles VALUES (1, 30, 'Android 11 (R)', 'Scoped Storage');
    INSERT INTO inspection_profiles VALUES (2, 33, 'Android 13 (Tiramisu)', 'Granular Media + Notifications');
    INSERT INTO inspection_profiles VALUES (3, 35, 'Android 15 (VanillaIceCream)', '16KB Pages + Edge-to-Edge');
    INSERT INTO inspection_profiles VALUES (4, 36, 'Android 16 (Baklava)', 'Adaptive App Restrictions');
    CREATE INDEX idx_profiles_api ON inspection_profiles(target_api);
  `);
  const sqliteBytes = db.export();
  db.close();

  // Tiny valid 1x1 olive-green PNG
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xd7, 0x63, 0x98, 0xb8, 0x48, 0x00,
    0x00, 0x02, 0x40, 0x01, 0x3b, 0x89, 0xf2, 0xb5,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
    0xae, 0x42, 0x60, 0x82,
  ]);

  const vectorXml = strToU8(`<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="48dp"
    android:height="48dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
  <path
      android:fillColor="#9BB848"
      android:pathData="M12,2L2,7v10l10,5 10,-5V7L12,2z M12,4.2l7.5,3.75L12,11.7 4.5,7.95 12,4.2z" />
</vector>`);

  const layoutXml = strToU8(`<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="16dp">
  <TextView
      android:id="@+id/title"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:text="@string/app_name" />
</LinearLayout>`);

  const configJson = strToU8(
    JSON.stringify(
      {
        telemetryEndpoint: 'https://api.example.invalid/v1/telemetry',
        enableNativeBridge: true,
        supportedAbis: ['arm64-v8a'],
        minSupportedSdk: 30,
      },
      null,
      2
    )
  );

  const manifestMf = strToU8(`Manifest-Version: 1.0
Built-By: ANDROID X-RAY Reference Builder
Created-By: Android Gradle Reference Fixture

Name: AndroidManifest.xml
SHA-256-Digest: 47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=

Name: classes.dex
SHA-256-Digest: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
`);

  // Sample unknown binary protobuf-like payload for Binary Inspector testing
  const unknownPb = new Uint8Array([0x08, 0x96, 0x01, 0x12, 0x0a, 0x78, 0x72, 0x61, 0x79, 0x5f, 0x6d, 0x6f, 0x64, 0x65, 0x6c, 0x18, 0x01]);

  const zipBytes = zipSync({
    'AndroidManifest.xml': manifestBin,
    'resources.arsc': arscBin,
    'classes.dex': dexBin,
    'lib/arm64-v8a/libxray_native.so': elfBin,
    'res/mipmap-xxhdpi-v4/ic_launcher.png': pngBytes,
    'res/drawable/ic_xray_mark.xml': vectorXml,
    'res/layout/activity_main.xml': layoutXml,
    'assets/config/app_config.json': configJson,
    'assets/databases/xray_telemetry.db': sqliteBytes,
    'assets/models/signatures.pb': unknownPb,
    'META-INF/MANIFEST.MF': manifestMf,
    'META-INF/okhttp3.kotlin_module': strToU8('okhttp3.module'),
    'META-INF/androidx.appcompat_appcompat.version': strToU8('1.7.0\n'),
  });

  return {
    fileName: 'xray-reference-demo-v2.4.apk',
    bytes: zipBytes,
  };
}
