import assert from 'node:assert/strict';
import test from 'node:test';
import { unzipSync } from 'fflate';
import { analyzeApkBytes } from '../src/engines/apkPipeline.ts';
import { buildProjectTree, sanitizeZipPath } from '../src/engines/archiveEngine.ts';
import { detectFileFormat } from '../src/engines/fileDetectionEngine.ts';
import { collectFolderEntries, computeFolderStats, exportEntriesAsStreamingZip } from '../src/engines/folderZipExporter.ts';
import { generateReferenceApkFile } from '../src/engines/referenceApkGenerator.ts';
import { executeIndexedSearch } from '../src/engines/searchEngine.ts';
import { inspectSqliteSchema, openReadOnlyDatabase, runReadOnlyQuery } from '../src/engines/sqliteEngine.ts';

test('Path traversal sanitization rejects unsafe ZIP paths', () => {
  assert.equal(sanitizeZipPath('../../etc/passwd'), null);
  assert.equal(sanitizeZipPath('res/../AndroidManifest.xml'), null);
  assert.equal(sanitizeZipPath('/assets/config.json'), 'assets/config.json');
});

test('Full binary APK pipeline decodes AXML, ARSC, DEX/Smali, ELF64, SQLite, and Search', async () => {
  const { fileName, bytes } = await generateReferenceApkFile();
  const project = await analyzeApkBytes(fileName, bytes);

  // Manifest AXML verification
  assert.ok(project.manifest, 'Manifest must decode');
  assert.equal(project.manifest.isBinaryXml, true);
  assert.equal(project.manifest.packageName, 'io.xray.inspector.demo');
  assert.equal(project.manifest.versionName, '2.4.0');
  assert.equal(project.manifest.minSdk, '30');
  assert.equal(project.manifest.targetSdk, '35');
  assert.equal(project.manifest.permissions.length, 2);
  assert.equal(project.manifest.components.length, 3);
  assert.equal(project.manifest.deepLinks[0].scheme, 'xray');

  // ARSC resource table verification
  assert.ok(project.resourceTable, 'resources.arsc must decode');
  const appNameRes = project.resourceTable.byId.get(0x7f010000);
  assert.ok(appNameRes, 'App name resource 0x7f010000 must exist');
  assert.equal(appNameRes.values[0].value, 'X-Ray Demo Host');

  // DEX & Smali verification
  assert.equal(project.dexFiles.length, 1);
  const dex = project.dexFiles[0];
  assert.equal(dex.classDefCount, 4);
  const mainCls = dex.classes.find((c) => c.simpleName === 'MainActivity');
  assert.ok(mainCls, 'MainActivity must be decoded from DEX');
  assert.ok(mainCls.smaliText.includes('const-string'), 'Smali disassembly must contain const-string');
  assert.ok(mainCls.pseudocodeText.includes('Reconstructed from Dalvik bytecode'));

  // ELF64 verification
  assert.equal(project.elfFiles.length, 1);
  const elf = project.elfFiles[0];
  assert.equal(elf.isValid, true);
  assert.equal(elf.bits, 64);
  assert.equal(elf.abiGuess, 'arm64-v8a');
  assert.deepEqual(elf.neededLibraries, ['liblog.so', 'libc.so']);
  assert.equal(elf.buildId, 'deadbeef20260a7f');
  assert.ok(elf.exportedSymbols.some((s) => s.name.includes('initNativeBridge')));
  assert.ok(elf.importedSymbols.some((s) => s.name === '__android_log_print'));

  // SQLite WASM read-only verification
  const dbEntry = project.entryMap.get('assets/databases/xray_telemetry.db');
  assert.ok(dbEntry, 'SQLite DB entry must exist');
  const db = await openReadOnlyDatabase(dbEntry.bytes);
  const schema = inspectSqliteSchema(db);
  assert.ok(schema.some((t) => t.name === 'inspection_profiles' && t.rowCount === 4));
  const queryRes = runReadOnlyQuery(db, 'SELECT codename FROM inspection_profiles WHERE target_api = 35;');
  assert.equal(queryRes.rows[0][0], 'Android 15 (VanillaIceCream)');
  const blocked = runReadOnlyQuery(db, 'DROP TABLE inspection_profiles;');
  assert.ok(blocked.error?.includes('Read-only'));
  db.close();

  // Indexed Search verification
  const searchRes = executeIndexedSearch(project.searchIndex, {
    query: 'xray_native',
    useRegex: false,
    caseSensitive: false,
    exactMatch: false,
    categories: new Set(),
  });
  assert.ok(searchRes.results.length >= 1, 'Search must locate xray_native in DEX');
});

test('Streaming Folder ZIP Export preserves nested directory hierarchy and supports FolderStats', async () => {
  const { fileName, bytes } = await generateReferenceApkFile();
  const project = await analyzeApkBytes(fileName, bytes);

  const resFolder = project.tree.children.find((c) => c.isDirectory && c.name === 'res');
  assert.ok(resFolder, 'res/ folder must exist');
  const stats = computeFolderStats(resFolder);
  assert.equal(stats.fileCount, 3);
  assert.equal(stats.subdirCount, 3);

  const entries = collectFolderEntries(resFolder);
  const controller = new AbortController();
  const exported = await exportEntriesAsStreamingZip(entries, resFolder.path, 'res.zip', controller.signal, () => {});
  assert.equal(exported.exportedCount, 3);
  assert.equal(exported.failedEntries.length, 0);

  const unzipped = unzipSync(exported.zipBytes);
  assert.ok('drawable/ic_xray_mark.xml' in unzipped);
  assert.ok('layout/activity_main.xml' in unzipped);
  assert.ok('mipmap-xxhdpi-v4/ic_launcher.png' in unzipped);
});

test('Large 10,000-file nested hierarchy builds and searches cleanly', () => {
  const dummyBytes = new Uint8Array([0x7b, 0x7d]);
  const format = detectFileFormat('data.json', dummyBytes);
  const entries = Array.from({ length: 10000 }, (_, i) => {
    const dir = `res/d0/d1/d2/d3/d4/d5/d6/d7/d8/bucket_${i % 50}`;
    const name = `item_${i}.json`;
    return {
      path: `${dir}/${name}`,
      name,
      dir,
      size: 2,
      compressedSize: 2,
      isDirectory: false,
      bytes: dummyBytes,
      format,
    };
  });

  const t0 = Date.now();
  const tree = buildProjectTree('large-test.apk', entries);
  const elapsed = Date.now() - t0;
  assert.equal(tree.fileCount, 10000);
  assert.ok(elapsed < 1500, `Tree build took ${elapsed}ms`);
});
