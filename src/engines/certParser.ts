import { CertInfo } from '../types/xray';
import { extractStrings } from './fileDetectionEngine';

export function parseCertificateFile(filePath: string, bytes: Uint8Array): CertInfo {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('manifest.mf') || lower.endsWith('.sf')) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const lines = text.split(/\r?\n/);
    const entries = lines.filter((l) => l.startsWith('Name:')).length;
    const algos = new Set<string>();
    for (const l of lines) {
      if (l.includes('SHA-256')) algos.add('SHA-256');
      if (l.includes('SHA1') || l.includes('SHA-1')) algos.add('SHA-1');
    }
    return {
      filePath,
      type: lower.endsWith('manifest.mf') ? 'MANIFEST.MF' : 'SIGNATURE_FILE',
      subjectStrings: [],
      sha256Fingerprints: [],
      algorithms: Array.from(algos),
      manifestEntriesCount: entries,
      rawPreview: text.slice(0, 6000),
    };
  }

  // ASN.1 DER PKCS#7 / X.509 string extraction
  const strings = extractStrings(bytes, 3, 200)
    .map((s) => s.value)
    .filter((v) => /[a-zA-Z]{2,}/.test(v));

  const algos: string[] = [];
  const hexAll = Array.from(bytes.subarray(0, Math.min(bytes.length, 4096)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (hexAll.includes('2a864886f70d01010b')) algos.push('SHA256withRSA');
  if (hexAll.includes('2a864886f70d010105')) algos.push('SHA1withRSA');
  if (hexAll.includes('2a8648ce3d040302')) algos.push('SHA256withECDSA');
  if (hexAll.includes('608648016503040201')) algos.push('SHA-256 Digest');

  return {
    filePath,
    type: 'PKCS7_CERT',
    subjectStrings: Array.from(new Set(strings)).slice(0, 40),
    sha256Fingerprints: [],
    algorithms: algos.length > 0 ? algos : ['DER X.509 / PKCS#7'],
    manifestEntriesCount: 0,
    rawPreview: strings.join('\n'),
  };
}
