import {
  DecodedManifest,
  ManifestAttribute,
  ManifestComponent,
  ManifestSecurityFinding,
  ResourceTable,
  XmlElementNode,
} from '../types/xray';
import { parseResStringPool } from './arscDecoder';

const RES_XML_TYPE = 0x0003;
const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_RESOURCE_MAP_TYPE = 0x0180;
const RES_XML_START_NAMESPACE_TYPE = 0x0100;
const RES_XML_END_NAMESPACE_TYPE = 0x0101;
const RES_XML_START_ELEMENT_TYPE = 0x0102;
const RES_XML_END_ELEMENT_TYPE = 0x0103;
const RES_XML_CDATA_TYPE = 0x0104;

// Standard Android framework attribute IDs for accurate manifest/layout decoding
const ANDROID_ATTR_IDS: Record<number, string> = {
  0x01010000: 'theme',
  0x01010001: 'label',
  0x01010002: 'icon',
  0x01010003: 'name',
  0x01010004: 'manageSpaceActivity',
  0x01010005: 'allowClearUserData',
  0x01010006: 'permission',
  0x01010007: 'readPermission',
  0x01010008: 'writePermission',
  0x01010009: 'protectionLevel',
  0x0101000a: 'permissionGroup',
  0x0101000b: 'sharedUserId',
  0x0101000c: 'hasCode',
  0x0101000d: 'persistent',
  0x0101000e: 'enabled',
  0x0101000f: 'debuggable',
  0x01010010: 'exported',
  0x01010011: 'process',
  0x01010012: 'taskAffinity',
  0x01010013: 'multiprocess',
  0x01010014: 'finishOnTaskLaunch',
  0x01010015: 'clearTaskOnLaunch',
  0x01010016: 'stateNotNeeded',
  0x01010017: 'excludeFromRecents',
  0x01010018: 'authorities',
  0x01010019: 'syncable',
  0x0101001a: 'initOrder',
  0x0101001b: 'grantUriPermissions',
  0x0101001c: 'priority',
  0x0101001d: 'launchMode',
  0x0101001e: 'screenOrientation',
  0x0101001f: 'configChanges',
  0x01010020: 'description',
  0x01010021: 'targetPackage',
  0x01010022: 'handleProfiling',
  0x01010023: 'functionalTest',
  0x01010024: 'value',
  0x01010025: 'resource',
  0x01010026: 'mimeType',
  0x01010027: 'scheme',
  0x01010028: 'host',
  0x01010029: 'port',
  0x0101002a: 'path',
  0x0101002b: 'pathPrefix',
  0x0101002c: 'pathPattern',
  0x0101020c: 'minSdkVersion',
  0x0101021b: 'versionCode',
  0x0101021c: 'versionName',
  0x01010270: 'targetSdkVersion',
  0x01010271: 'maxSdkVersion',
  0x01010280: 'allowBackup',
  0x01010281: 'required',
  0x010104ec: 'usesCleartextTraffic',
  0x01010527: 'networkSecurityConfig',
  0x01010572: 'compileSdkVersion',
  0x01010573: 'compileSdkVersionCodename',
  0x010100d0: 'id',
  0x010100f4: 'layout_width',
  0x010100f5: 'layout_height',
  0x0101014f: 'text',
  0x010100d4: 'background',
  0x010100d6: 'paddingLeft',
  0x010100d8: 'paddingRight',
  0x010100d7: 'paddingTop',
  0x010100d9: 'paddingBottom',
  0x010100ff: 'orientation',
  0x01010119: 'src',
  0x010101a5: 'color',
  0x010103a6: 'viewportWidth',
  0x010103a7: 'viewportHeight',
  0x01010405: 'pathData',
  0x01010404: 'fillColor',
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeTypedValue(
  type: number,
  data: number,
  rawStrIdx: number,
  strings: string[],
  resourceTable?: ResourceTable | null
): string {
  if (rawStrIdx >= 0 && rawStrIdx < strings.length) {
    return strings[rawStrIdx];
  }
  switch (type) {
    case 0x00:
      return '@null';
    case 0x01: {
      const unsigned = data >>> 0;
      const resolved = resourceTable?.byId.get(unsigned);
      if (resolved) return resolved.reference;
      return `@0x${unsigned.toString(16).padStart(8, '0')}`;
    }
    case 0x02:
      return `?0x${(data >>> 0).toString(16).padStart(8, '0')}`;
    case 0x03:
      return strings[data] ?? '';
    case 0x04: {
      const buf = new ArrayBuffer(4);
      const dv = new DataView(buf);
      dv.setUint32(0, data, true);
      return String(Number(dv.getFloat32(0, true).toFixed(4)));
    }
    case 0x05: {
      const units = ['px', 'dp', 'sp', 'pt', 'in', 'mm'];
      const unit = units[data & 0x0f] || 'px';
      return `${data >> 8}${unit}`;
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

export interface DecodedBinaryXmlResult {
  isBinaryXml: boolean;
  xml: string;
  root: XmlElementNode | null;
}

export function decodeBinaryXml(bytes: Uint8Array, resourceTable?: ResourceTable | null): DecodedBinaryXmlResult {
  if (bytes.length < 8) {
    return { isBinaryXml: false, xml: new TextDecoder('utf-8', { fatal: false }).decode(bytes), root: null };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rootType = view.getUint16(0, true);
  const rootHeader = view.getUint16(2, true);
  const rootSize = view.getUint32(4, true);

  if (rootType !== RES_XML_TYPE || rootHeader !== 0x0008) {
    const plain = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return { isBinaryXml: false, xml: plain, root: parsePlainXmlTree(plain) };
  }

  let offset = rootHeader;
  let strings: string[] = [];
  let resourceMap: number[] = [];
  const nsStack: Array<{ prefix: string; uri: string }> = [];
  const elemStack: XmlElementNode[] = [];
  let rootNode: XmlElementNode | null = null;
  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>'];

  const limit = Math.min(rootSize, bytes.length);
  while (offset + 8 <= limit) {
    const chunkType = view.getUint16(offset, true);
    const chunkHeader = view.getUint16(offset + 2, true);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkSize < 8) break;

    if (chunkType === RES_STRING_POOL_TYPE) {
      strings = parseResStringPool(bytes, offset).strings;
    } else if (chunkType === RES_XML_RESOURCE_MAP_TYPE) {
      const count = Math.floor((chunkSize - chunkHeader) / 4);
      resourceMap = [];
      for (let i = 0; i < count; i++) {
        resourceMap.push(view.getUint32(offset + chunkHeader + i * 4, true));
      }
    } else if (chunkType === RES_XML_START_NAMESPACE_TYPE && offset + 24 <= limit) {
      const prefixIdx = view.getInt32(offset + 16, true);
      const uriIdx = view.getInt32(offset + 20, true);
      nsStack.push({
        prefix: prefixIdx >= 0 ? strings[prefixIdx] || 'android' : 'android',
        uri: uriIdx >= 0 ? strings[uriIdx] || '' : '',
      });
    } else if (chunkType === RES_XML_END_NAMESPACE_TYPE) {
      nsStack.pop();
    } else if (chunkType === RES_XML_START_ELEMENT_TYPE && offset + 36 <= limit) {
      const nsIdx = view.getInt32(offset + 16, true);
      const nameIdx = view.getInt32(offset + 20, true);
      const attrStart = view.getUint16(offset + 24, true);
      const attrSize = view.getUint16(offset + 26, true);
      const attrCount = view.getUint16(offset + 28, true);

      const tagName = strings[nameIdx] || 'unknown';
      const nsUri = nsIdx >= 0 ? strings[nsIdx] || '' : '';
      const nsPrefix = nsUri ? nsStack.find((n) => n.uri === nsUri)?.prefix || 'android' : '';
      const fullTag = nsPrefix ? `${nsPrefix}:${tagName}` : tagName;

      const attrs: ManifestAttribute[] = [];
      const attrBase = offset + 16 + attrStart;
      for (let i = 0; i < attrCount; i++) {
        const aOff = attrBase + i * attrSize;
        if (aOff + 20 > limit) break;
        const aNsIdx = view.getInt32(aOff, true);
        const aNameIdx = view.getInt32(aOff + 4, true);
        const aRawValIdx = view.getInt32(aOff + 8, true);
        const aType = bytes[aOff + 15];
        const aData = view.getUint32(aOff + 16, true);

        const aNsUri = aNsIdx >= 0 ? strings[aNsIdx] || '' : '';
        const aPrefix = aNsUri ? nsStack.find((n) => n.uri === aNsUri)?.prefix || 'android' : '';
        const resId = aNameIdx >= 0 && aNameIdx < resourceMap.length ? resourceMap[aNameIdx] : undefined;
        let attrName = aNameIdx >= 0 ? strings[aNameIdx] || '' : '';
        if (!attrName && resId && ANDROID_ATTR_IDS[resId]) {
          attrName = ANDROID_ATTR_IDS[resId];
        }
        if (!attrName) attrName = `attr_${aNameIdx}`;

        const valStr = decodeTypedValue(aType, aData, aRawValIdx, strings, resourceTable);
        attrs.push({
          namespace: aPrefix,
          name: attrName,
          value: valStr,
          rawType: aType,
          resourceId: resId,
        });
      }

      const indent = '  '.repeat(elemStack.length);
      const nsDecls =
        elemStack.length === 0
          ? nsStack.map((n) => ` xmlns:${n.prefix}="${escapeXml(n.uri)}"`).join('')
          : '';
      const attrText = attrs
        .map((a) => ` ${a.namespace ? `${a.namespace}:` : ''}${a.name}="${escapeXml(a.value)}"`)
        .join('');

      const lineNum = lines.length + 1;
      lines.push(`${indent}<${fullTag}${nsDecls}${attrText}>`);

      const node: XmlElementNode = {
        tag: fullTag,
        attributes: attrs,
        children: [],
        lineNumber: lineNum,
      };
      if (elemStack.length === 0) {
        rootNode = node;
      } else {
        elemStack[elemStack.length - 1].children.push(node);
      }
      elemStack.push(node);
    } else if (chunkType === RES_XML_END_ELEMENT_TYPE && offset + 24 <= limit) {
      const nameIdx = view.getInt32(offset + 20, true);
      const nsIdx = view.getInt32(offset + 16, true);
      const popped = elemStack.pop();
      const tagName = popped?.tag || (nsIdx >= 0 ? `android:${strings[nameIdx]}` : strings[nameIdx] || 'unknown');
      const indent = '  '.repeat(elemStack.length);
      // Collapse empty element cleanly if just opened on previous line
      const lastLine = lines[lines.length - 1];
      if (lastLine && lastLine.startsWith(`${indent}<${tagName}`) && lastLine.endsWith('>') && !lastLine.endsWith('/>')) {
        lines[lines.length - 1] = `${lastLine.slice(0, -1)} />`;
      } else {
        lines.push(`${indent}</${tagName}>`);
      }
    } else if (chunkType === RES_XML_CDATA_TYPE && offset + 20 <= limit) {
      const dataIdx = view.getInt32(offset + 16, true);
      if (dataIdx >= 0 && strings[dataIdx]) {
        const indent = '  '.repeat(elemStack.length);
        lines.push(`${indent}${escapeXml(strings[dataIdx])}`);
      }
    }

    offset += chunkSize;
  }

  return {
    isBinaryXml: true,
    xml: lines.join('\n'),
    root: rootNode,
  };
}

function parsePlainXmlTree(xmlText: string): XmlElementNode | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) return null;

    let approxLine = 1;
    const convert = (el: Element): XmlElementNode => {
      approxLine += 1;
      const attributes: ManifestAttribute[] = Array.from(el.attributes).map((attr) => {
        const parts = attr.name.split(':');
        return {
          namespace: parts.length > 1 ? parts[0] : '',
          name: parts.length > 1 ? parts[1] : parts[0],
          value: attr.value,
          rawType: 3,
        };
      });
      return {
        tag: el.tagName,
        attributes,
        children: Array.from(el.children).map(convert),
        lineNumber: approxLine,
      };
    };
    return convert(doc.documentElement);
  } catch {
    return null;
  }
}

function getAttr(node: XmlElementNode | null | undefined, name: string): string {
  if (!node) return '';
  const hit = node.attributes.find((a) => a.name === name);
  return hit ? hit.value : '';
}

function resolveDisplayValue(val: string, resourceTable?: ResourceTable | null): string {
  if (!val) return '';
  if (val.startsWith('@0x') && resourceTable) {
    const id = parseInt(val.slice(1), 16);
    const res = resourceTable.byId.get(id);
    if (res && res.values[0]) {
      return `${res.values[0].value} (${res.reference})`;
    }
  }
  if (val.startsWith('@') && resourceTable) {
    const entry = resourceTable.entries.find((e) => e.reference === val);
    if (entry && entry.values[0]) {
      return `${entry.values[0].value} (${val})`;
    }
  }
  return val;
}

export function inspectManifest(bytes: Uint8Array, resourceTable?: ResourceTable | null): DecodedManifest {
  const decoded = decodeBinaryXml(bytes, resourceTable);
  const root = decoded.root;

  const packageName = getAttr(root, 'package') || 'unknown.package';
  const versionCode = getAttr(root, 'versionCode') || '—';
  const versionName = getAttr(root, 'versionName') || '—';
  const compileSdk = getAttr(root, 'compileSdkVersion') || '—';

  const usesSdk = root?.children.find((c) => c.tag === 'uses-sdk');
  const minSdk = getAttr(usesSdk, 'minSdkVersion') || '—';
  const targetSdk = getAttr(usesSdk, 'targetSdkVersion') || '—';

  const appNode = root?.children.find((c) => c.tag === 'application');
  const rawLabel = getAttr(appNode, 'label');
  const appLabel = resolveDisplayValue(rawLabel, resourceTable) || packageName;
  const appTheme = getAttr(appNode, 'theme') || 'Default';
  const allowBackup = getAttr(appNode, 'allowBackup') || 'unspecified (defaults true)';
  const debuggable = getAttr(appNode, 'debuggable') || 'false';
  const usesCleartextTraffic = getAttr(appNode, 'usesCleartextTraffic') || 'unspecified';
  const networkSecurityConfig = getAttr(appNode, 'networkSecurityConfig') || 'None';
  const applicationClass = getAttr(appNode, 'name') || 'android.app.Application';

  const permissions = (root?.children || [])
    .filter((c) => c.tag === 'uses-permission' || c.tag === 'uses-permission-sdk-23' || c.tag === 'permission')
    .map((c) => ({
      name: getAttr(c, 'name'),
      maxSdkVersion: getAttr(c, 'maxSdkVersion') || undefined,
      protectionLevel: getAttr(c, 'protectionLevel') || undefined,
    }))
    .filter((p) => p.name);

  const usesFeatures = (root?.children || [])
    .filter((c) => c.tag === 'uses-feature')
    .map((c) => ({
      name: getAttr(c, 'name') || getAttr(c, 'glEsVersion') || 'feature',
      required: getAttr(c, 'required') || 'true',
    }));

  const components: ManifestComponent[] = [];
  const deepLinks: DecodedManifest['deepLinks'] = [];
  const metaData: DecodedManifest['metaData'] = [];

  for (const child of appNode?.children || []) {
    if (child.tag === 'meta-data') {
      metaData.push({
        name: getAttr(child, 'name'),
        value: getAttr(child, 'value'),
        resource: getAttr(child, 'resource') || undefined,
      });
      continue;
    }

    if (
      child.tag === 'activity' ||
      child.tag === 'activity-alias' ||
      child.tag === 'service' ||
      child.tag === 'receiver' ||
      child.tag === 'provider'
    ) {
      const fullName = getAttr(child, 'name') || '(unnamed)';
      const resolvedName = fullName.startsWith('.') ? `${packageName}${fullName}` : fullName;
      const shortName = resolvedName.split('.').pop() || resolvedName;
      const exportedAttr = getAttr(child, 'exported');
      const intentFilters = child.children
        .filter((ic) => ic.tag === 'intent-filter')
        .map((ic) => {
          const actions = ic.children.filter((x) => x.tag === 'action').map((x) => getAttr(x, 'name')).filter(Boolean);
          const categories = ic.children.filter((x) => x.tag === 'category').map((x) => getAttr(x, 'name')).filter(Boolean);
          const dataNodes = ic.children.filter((x) => x.tag === 'data');
          const dataSchemes = dataNodes.map((d) => getAttr(d, 'scheme')).filter(Boolean);
          const dataHosts = dataNodes.map((d) => getAttr(d, 'host')).filter(Boolean);
          const dataPaths = dataNodes
            .map((d) => getAttr(d, 'path') || getAttr(d, 'pathPrefix') || getAttr(d, 'pathPattern'))
            .filter(Boolean);

          for (const scheme of dataSchemes) {
            deepLinks.push({
              scheme,
              host: dataHosts[0] || '*',
              path: dataPaths[0] || '/',
              component: resolvedName,
            });
          }

          return { actions, categories, dataSchemes, dataHosts, dataPaths };
        });

      const exported =
        exportedAttr === 'true'
          ? true
          : exportedAttr === 'false'
            ? false
            : intentFilters.length > 0
              ? true
              : null;

      components.push({
        type: child.tag,
        name: resolvedName,
        shortName,
        exported,
        permission: getAttr(child, 'permission') || undefined,
        process: getAttr(child, 'process') || undefined,
        launchMode: getAttr(child, 'launchMode') || undefined,
        authorities: getAttr(child, 'authorities') || undefined,
        intentFilters,
        attributes: child.attributes,
        lineNumber: child.lineNumber,
      });
    }
  }

  // Security Audit Findings based strictly on parsed attributes
  const securityFindings: ManifestSecurityFinding[] = [];
  if (debuggable === 'true') {
    securityFindings.push({
      id: 'sec-debuggable',
      severity: 'high',
      title: 'Application Marked Debuggable',
      description: 'android:debuggable="true" allows debugger attachment and runtime inspection on non-rooted devices.',
      attribute: 'android:debuggable',
    });
  }
  if (allowBackup === 'true' || allowBackup.startsWith('unspecified')) {
    securityFindings.push({
      id: 'sec-backup',
      severity: 'medium',
      title: 'ADB / Cloud Backup Allowed',
      description: 'android:allowBackup is enabled or unspecified, permitting backup extraction of app private data unless restricted by backup rules.',
      attribute: 'android:allowBackup',
    });
  }
  if (usesCleartextTraffic === 'true') {
    securityFindings.push({
      id: 'sec-cleartext',
      severity: 'high',
      title: 'Cleartext HTTP Traffic Permitted',
      description: 'android:usesCleartextTraffic="true" permits unencrypted HTTP connections vulnerable to interception.',
      attribute: 'android:usesCleartextTraffic',
    });
  }
  const targetNum = parseInt(targetSdk, 10);
  if (!Number.isNaN(targetNum) && targetNum < 31) {
    securityFindings.push({
      id: 'sec-target-sdk',
      severity: 'medium',
      title: `Legacy targetSdkVersion (${targetNum})`,
      description: 'Targets below Android 12 (API 31) bypass mandatory explicit android:exported enforcement on intent-filtered components.',
      attribute: 'android:targetSdkVersion',
    });
  }
  for (const comp of components) {
    const isLauncher = comp.intentFilters.some((f) => f.actions.includes('android.intent.action.MAIN'));
    if (comp.exported === true && !comp.permission && !isLauncher) {
      securityFindings.push({
        id: `sec-exp-${comp.name}`,
        severity: comp.type === 'provider' || comp.type === 'service' ? 'high' : 'low',
        title: `Exported ${comp.type} without permission guard`,
        description: `${comp.shortName} is exported without a protecting android:permission attribute.`,
        component: comp.name,
      });
    }
  }

  return {
    isBinaryXml: decoded.isBinaryXml,
    rawXml: decoded.xml,
    packageName,
    versionCode,
    versionName,
    minSdk,
    targetSdk,
    compileSdk,
    appLabel,
    appTheme,
    allowBackup,
    debuggable,
    usesCleartextTraffic,
    networkSecurityConfig,
    applicationClass,
    permissions,
    usesFeatures,
    components,
    metaData,
    deepLinks,
    securityFindings,
    xmlTree: root,
  };
}
