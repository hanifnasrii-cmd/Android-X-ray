import { DexAnalysis, DexClassInfo, DexFieldInfo, DexMethodInfo } from '../types/xray';

function readUleb128(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < bytes.length && shift < 35) {
    const b = bytes[pos++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result >>> 0, next: pos };
}

function decodeMutf8(bytes: Uint8Array, offset: number): string {
  const lenInfo = readUleb128(bytes, offset);
  const posStart = lenInfo.next;
  let pos = posStart;
  const out: number[] = [];
  const maxBytes = Math.min(bytes.length, posStart + lenInfo.value * 3 + 4);

  while (pos < maxBytes) {
    const a = bytes[pos++];
    if (a === 0) break;
    if ((a & 0x80) === 0) {
      out.push(a);
    } else if ((a & 0xe0) === 0xc0 && pos < maxBytes) {
      const b = bytes[pos++];
      out.push(((a & 0x1f) << 6) | (b & 0x3f));
    } else if ((a & 0xf0) === 0xe0 && pos + 1 < maxBytes) {
      const b = bytes[pos++];
      const c = bytes[pos++];
      out.push(((a & 0x0f) << 12) | ((b & 0x3f) << 6) | (c & 0x3f));
    } else {
      out.push(a);
    }
  }
  return String.fromCharCode(...out);
}

export function descriptorToJava(desc: string): string {
  if (!desc) return 'void';
  if (desc.startsWith('[')) return `${descriptorToJava(desc.slice(1))}[]`;
  switch (desc) {
    case 'V':
      return 'void';
    case 'Z':
      return 'boolean';
    case 'B':
      return 'byte';
    case 'S':
      return 'short';
    case 'C':
      return 'char';
    case 'I':
      return 'int';
    case 'J':
      return 'long';
    case 'F':
      return 'float';
    case 'D':
      return 'double';
    default:
      if (desc.startsWith('L') && desc.endsWith(';')) {
        return desc.slice(1, -1).replace(/\//g, '.');
      }
      return desc;
  }
}

function formatAccessFlags(flags: number, isMethod = false): string {
  const parts: string[] = [];
  if (flags & 0x0001) parts.push('public');
  if (flags & 0x0002) parts.push('private');
  if (flags & 0x0004) parts.push('protected');
  if (flags & 0x0008) parts.push('static');
  if (flags & 0x0010) parts.push('final');
  if (flags & 0x0020) parts.push(isMethod ? 'synchronized' : '');
  if (flags & 0x0200) parts.push('interface');
  if (flags & 0x0400) parts.push('abstract');
  if (flags & 0x1000) parts.push('synthetic');
  if (flags & 0x2000) parts.push('@interface');
  if (flags & 0x4000) parts.push('enum');
  if (flags & 0x10000) parts.push('constructor');
  return parts.filter(Boolean).join(' ');
}

const OPCODE_NAMES: Record<number, { name: string; fmt: string }> = {
  0x00: { name: 'nop', fmt: '10x' },
  0x01: { name: 'move', fmt: '12x' },
  0x02: { name: 'move/from16', fmt: '22x' },
  0x07: { name: 'move-object', fmt: '12x' },
  0x08: { name: 'move-object/from16', fmt: '22x' },
  0x0a: { name: 'move-result', fmt: '11x' },
  0x0c: { name: 'move-result-object', fmt: '11x' },
  0x0d: { name: 'move-exception', fmt: '11x' },
  0x0e: { name: 'return-void', fmt: '10x' },
  0x0f: { name: 'return', fmt: '11x' },
  0x11: { name: 'return-object', fmt: '11x' },
  0x12: { name: 'const/4', fmt: '11n' },
  0x13: { name: 'const/16', fmt: '21s' },
  0x14: { name: 'const', fmt: '31i' },
  0x15: { name: 'const/high16', fmt: '21h' },
  0x1a: { name: 'const-string', fmt: '21c-str' },
  0x1b: { name: 'const-string/jumbo', fmt: '31c-str' },
  0x1c: { name: 'const-class', fmt: '21c-type' },
  0x1f: { name: 'check-cast', fmt: '21c-type' },
  0x20: { name: 'instance-of', fmt: '22c-type' },
  0x22: { name: 'new-instance', fmt: '21c-type' },
  0x23: { name: 'new-array', fmt: '22c-type' },
  0x27: { name: 'throw', fmt: '11x' },
  0x28: { name: 'goto', fmt: '10t' },
  0x29: { name: 'goto/16', fmt: '20t' },
  0x32: { name: 'if-eq', fmt: '22t' },
  0x33: { name: 'if-ne', fmt: '22t' },
  0x38: { name: 'if-eqz', fmt: '21t' },
  0x39: { name: 'if-nez', fmt: '21t' },
  0x52: { name: 'iget', fmt: '22c-fld' },
  0x54: { name: 'iget-object', fmt: '22c-fld' },
  0x59: { name: 'iput', fmt: '22c-fld' },
  0x5b: { name: 'iput-object', fmt: '22c-fld' },
  0x60: { name: 'sget', fmt: '21c-fld' },
  0x62: { name: 'sget-object', fmt: '21c-fld' },
  0x67: { name: 'sput', fmt: '21c-fld' },
  0x69: { name: 'sput-object', fmt: '21c-fld' },
  0x6e: { name: 'invoke-virtual', fmt: '35c-mth' },
  0x6f: { name: 'invoke-super', fmt: '35c-mth' },
  0x70: { name: 'invoke-direct', fmt: '35c-mth' },
  0x71: { name: 'invoke-static', fmt: '35c-mth' },
  0x72: { name: 'invoke-interface', fmt: '35c-mth' },
  0x74: { name: 'invoke-virtual/range', fmt: '3rc-mth' },
  0x76: { name: 'invoke-direct/range', fmt: '3rc-mth' },
  0x77: { name: 'invoke-static/range', fmt: '3rc-mth' },
  0x90: { name: 'add-int', fmt: '23x' },
  0x91: { name: 'sub-int', fmt: '23x' },
  0xb0: { name: 'add-int/2addr', fmt: '12x' },
  0xd8: { name: 'add-int/lit8', fmt: '22b' },
};

export function analyzeDexFile(filePath: string, bytes: Uint8Array): DexAnalysis | null {
  if (bytes.length < 0x70 || bytes[0] !== 0x64 || bytes[1] !== 0x65 || bytes[2] !== 0x78 || bytes[3] !== 0x0a) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = String.fromCharCode(bytes[4], bytes[5], bytes[6]);
  const checksum = `0x${view.getUint32(8, true).toString(16).padStart(8, '0')}`;
  const sha1 = Array.from(bytes.subarray(12, 32))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const fileSize = view.getUint32(32, true);
  const endianTag = `0x${view.getUint32(40, true).toString(16).padStart(8, '0')}`;

  const stringIdsSize = view.getUint32(56, true);
  const stringIdsOff = view.getUint32(60, true);
  const typeIdsSize = view.getUint32(64, true);
  const typeIdsOff = view.getUint32(68, true);
  const protoIdsSize = view.getUint32(72, true);
  const protoIdsOff = view.getUint32(76, true);
  const fieldIdsSize = view.getUint32(80, true);
  const fieldIdsOff = view.getUint32(84, true);
  const methodIdsSize = view.getUint32(88, true);
  const methodIdsOff = view.getUint32(92, true);
  const classDefsSize = view.getUint32(96, true);
  const classDefsOff = view.getUint32(100, true);

  // 1. Strings
  const strings: string[] = [];
  const safeStrCount = Math.min(stringIdsSize, 65000);
  for (let i = 0; i < safeStrCount; i++) {
    const pos = stringIdsOff + i * 4;
    if (pos + 4 > bytes.length) break;
    const strDataOff = view.getUint32(pos, true);
    if (strDataOff < bytes.length) {
      strings.push(decodeMutf8(bytes, strDataOff));
    } else {
      strings.push('');
    }
  }

  // 2. Types
  const types: string[] = [];
  const safeTypeCount = Math.min(typeIdsSize, 65000);
  for (let i = 0; i < safeTypeCount; i++) {
    const pos = typeIdsOff + i * 4;
    if (pos + 4 > bytes.length) break;
    const strIdx = view.getUint32(pos, true);
    types.push(strings[strIdx] || `Type#${i}`);
  }

  // 3. Protos
  const protos: Array<{ returnType: string; params: string[] }> = [];
  const safeProtoCount = Math.min(protoIdsSize, 65000);
  for (let i = 0; i < safeProtoCount; i++) {
    const pos = protoIdsOff + i * 12;
    if (pos + 12 > bytes.length) break;
    const returnTypeIdx = view.getUint32(pos + 4, true);
    const paramsOff = view.getUint32(pos + 8, true);
    const params: string[] = [];
    if (paramsOff > 0 && paramsOff + 4 <= bytes.length) {
      const pCount = view.getUint32(paramsOff, true);
      for (let p = 0; p < Math.min(pCount, 32); p++) {
        const tOff = paramsOff + 4 + p * 2;
        if (tOff + 2 > bytes.length) break;
        params.push(types[view.getUint16(tOff, true)] || '?');
      }
    }
    protos.push({ returnType: types[returnTypeIdx] || 'V', params });
  }

  // 4. Fields
  const fields: Array<{ className: string; name: string; type: string }> = [];
  const safeFieldCount = Math.min(fieldIdsSize, 65000);
  for (let i = 0; i < safeFieldCount; i++) {
    const pos = fieldIdsOff + i * 8;
    if (pos + 8 > bytes.length) break;
    const classIdx = view.getUint16(pos, true);
    const typeIdx = view.getUint16(pos + 2, true);
    const nameIdx = view.getUint32(pos + 4, true);
    fields.push({
      className: descriptorToJava(types[classIdx] || ''),
      type: descriptorToJava(types[typeIdx] || ''),
      name: strings[nameIdx] || `field_${i}`,
    });
  }

  // 5. Methods
  const methods: Array<{ className: string; name: string; signature: string; descriptor: string }> = [];
  const safeMethodCount = Math.min(methodIdsSize, 65000);
  for (let i = 0; i < safeMethodCount; i++) {
    const pos = methodIdsOff + i * 8;
    if (pos + 8 > bytes.length) break;
    const classIdx = view.getUint16(pos, true);
    const protoIdx = view.getUint16(pos + 2, true);
    const nameIdx = view.getUint32(pos + 4, true);
    const clsDesc = types[classIdx] || 'Ljava/lang/Object;';
    const proto = protos[protoIdx] || { returnType: 'V', params: [] };
    const mName = strings[nameIdx] || `method_${i}`;
    const sig = `${descriptorToJava(proto.returnType)} ${mName}(${proto.params.map(descriptorToJava).join(', ')})`;
    const smaliSig = `${clsDesc}->${mName}(${proto.params.join('')})${proto.returnType}`;
    methods.push({
      className: descriptorToJava(clsDesc),
      name: mName,
      signature: sig,
      descriptor: smaliSig,
    });
  }

  const disassembleCode = (
    codeOff: number,
    methodName: string,
    params: string[],
    returnType: string,
    accessStr: string
  ): {
    registersSize: number;
    insSize: number;
    outsSize: number;
    insnsSize: number;
    smali: string[];
    pseudo: string[];
    refStrings: string[];
    refMethods: string[];
  } => {
    if (codeOff === 0 || codeOff + 16 > bytes.length) {
      return {
        registersSize: 0,
        insSize: 0,
        outsSize: 0,
        insnsSize: 0,
        smali: ['# Abstract or native method (no Dalvik code_item)'],
        pseudo: ['// Abstract or native method — no Dalvik bytecode body.'],
        refStrings: [],
        refMethods: [],
      };
    }

    const registersSize = view.getUint16(codeOff, true);
    const insSize = view.getUint16(codeOff + 2, true);
    const outsSize = view.getUint16(codeOff + 4, true);
    const insnsSize = view.getUint32(codeOff + 12, true);
    const insnsStart = codeOff + 16;

    const smali: string[] = [`.registers ${registersSize}`];
    const pseudo: string[] = [];
    const refStrings: string[] = [];
    const refMethods: string[] = [];
    const regHints = new Map<number, string>();

    let pc = 0;
    const maxUnits = Math.min(insnsSize, 400);
    while (pc < maxUnits && insnsStart + pc * 2 + 2 <= bytes.length) {
      const unit0 = view.getUint16(insnsStart + pc * 2, true);
      const op = unit0 & 0xff;
      const info = OPCODE_NAMES[op];
      const addrHex = (pc * 2).toString(16).padStart(4, '0');

      if (!info) {
        smali.push(`    :${addrHex}  op_0x${op.toString(16).padStart(2, '0')} (0x${unit0.toString(16).padStart(4, '0')})`);
        pc += 1;
        continue;
      }

      if (info.fmt === '10x') {
        smali.push(`    :${addrHex}  ${info.name}`);
        if (op === 0x0e) pseudo.push('    return;');
        pc += 1;
      } else if (info.fmt === '11n') {
        const vA = (unit0 >> 8) & 0x0f;
        const lit = ((unit0 >> 12) << 28) >> 28;
        smali.push(`    :${addrHex}  ${info.name} v${vA}, ${lit}`);
        regHints.set(vA, String(lit));
        pc += 1;
      } else if (info.fmt === '11x') {
        const vA = (unit0 >> 8) & 0xff;
        smali.push(`    :${addrHex}  ${info.name} v${vA}`);
        if (op === 0x0f || op === 0x11) {
          pseudo.push(`    return ${regHints.get(vA) || `v${vA}`};`);
        } else if (op === 0x0c || op === 0x0a) {
          regHints.set(vA, regHints.get(-1) || `result_v${vA}`);
        }
        pc += 1;
      } else if (info.fmt === '12x') {
        const vA = (unit0 >> 8) & 0x0f;
        const vB = (unit0 >> 12) & 0x0f;
        smali.push(`    :${addrHex}  ${info.name} v${vA}, v${vB}`);
        regHints.set(vA, regHints.get(vB) || `v${vB}`);
        pc += 1;
      } else if (info.fmt === '10t') {
        const off = ((unit0 >> 8) << 24) >> 24;
        smali.push(`    :${addrHex}  ${info.name} :${((pc + off) * 2).toString(16).padStart(4, '0')}`);
        pc += 1;
      } else if (info.fmt === '21c-str' && insnsStart + (pc + 1) * 2 + 2 <= bytes.length) {
        const vA = (unit0 >> 8) & 0xff;
        const idx = view.getUint16(insnsStart + (pc + 1) * 2, true);
        const sVal = strings[idx] ?? `str#${idx}`;
        const escaped = JSON.stringify(sVal);
        smali.push(`    :${addrHex}  ${info.name} v${vA}, ${escaped}`);
        regHints.set(vA, escaped);
        if (refStrings.length < 30) refStrings.push(sVal);
        pc += 2;
      } else if (info.fmt === '21c-type' && insnsStart + (pc + 1) * 2 + 2 <= bytes.length) {
        const vA = (unit0 >> 8) & 0xff;
        const idx = view.getUint16(insnsStart + (pc + 1) * 2, true);
        const tVal = types[idx] ?? `Type#${idx}`;
        smali.push(`    :${addrHex}  ${info.name} v${vA}, ${tVal}`);
        if (op === 0x22) {
          regHints.set(vA, `new ${descriptorToJava(tVal)}()`);
          pseudo.push(`    var v${vA} = new ${descriptorToJava(tVal)}();`);
        }
        pc += 2;
      } else if (info.fmt === '21c-fld' && insnsStart + (pc + 1) * 2 + 2 <= bytes.length) {
        const vA = (unit0 >> 8) & 0xff;
        const idx = view.getUint16(insnsStart + (pc + 1) * 2, true);
        const fld = fields[idx];
        const fText = fld ? `${fld.className}.${fld.name}:${fld.type}` : `field#${idx}`;
        smali.push(`    :${addrHex}  ${info.name} v${vA}, ${fText}`);
        if (op === 0x60 || op === 0x62) {
          regHints.set(vA, fld ? `${fld.className.split('.').pop()}.${fld.name}` : fText);
        } else {
          pseudo.push(`    ${fld ? `${fld.className.split('.').pop()}.${fld.name}` : fText} = ${regHints.get(vA) || `v${vA}`};`);
        }
        pc += 2;
      } else if (info.fmt === '22c-fld' && insnsStart + (pc + 1) * 2 + 2 <= bytes.length) {
        const vA = (unit0 >> 8) & 0x0f;
        const vB = (unit0 >> 12) & 0x0f;
        const idx = view.getUint16(insnsStart + (pc + 1) * 2, true);
        const fld = fields[idx];
        const fText = fld ? `${fld.className}.${fld.name}` : `field#${idx}`;
        smali.push(`    :${addrHex}  ${info.name} v${vA}, v${vB}, ${fText}`);
        if (op === 0x52 || op === 0x54) {
          regHints.set(vA, `v${vB}.${fld?.name || `field#${idx}`}`);
        } else {
          pseudo.push(`    v${vB}.${fld?.name || `field#${idx}`} = ${regHints.get(vA) || `v${vA}`};`);
        }
        pc += 2;
      } else if (info.fmt === '22c-type' && insnsStart + (pc + 1) * 2 + 2 <= bytes.length) {
        const vA = (unit0 >> 8) & 0x0f;
        const vB = (unit0 >> 12) & 0x0f;
        const idx = view.getUint16(insnsStart + (pc + 1) * 2, true);
        smali.push(`    :${addrHex}  ${info.name} v${vA}, v${vB}, ${types[idx] || `Type#${idx}`}`);
        pc += 2;
      } else if ((info.fmt === '21s' || info.fmt === '21h' || info.fmt === '21t' || info.fmt === '22t' || info.fmt === '22b' || info.fmt === '22x' || info.fmt === '20t' || info.fmt === '23x') && insnsStart + (pc + 1) * 2 + 2 <= bytes.length) {
        const unit1 = view.getUint16(insnsStart + (pc + 1) * 2, true);
        const vA = (unit0 >> 8) & 0xff;
        smali.push(`    :${addrHex}  ${info.name} v${vA}, #0x${unit1.toString(16)}`);
        pc += 2;
      } else if (info.fmt === '31i' && insnsStart + (pc + 2) * 2 + 2 <= bytes.length) {
        const vA = (unit0 >> 8) & 0xff;
        const lit = view.getInt32(insnsStart + (pc + 1) * 2, true);
        smali.push(`    :${addrHex}  ${info.name} v${vA}, ${lit}`);
        regHints.set(vA, String(lit));
        pc += 3;
      } else if (info.fmt === '35c-mth' && insnsStart + (pc + 2) * 2 + 2 <= bytes.length) {
        const argCount = (unit0 >> 12) & 0x0f;
        const mIdx = view.getUint16(insnsStart + (pc + 1) * 2, true);
        const unit2 = view.getUint16(insnsStart + (pc + 2) * 2, true);
        const regs: number[] = [];
        const rOrder = [unit2 & 0xf, (unit2 >> 4) & 0xf, (unit2 >> 8) & 0xf, (unit2 >> 12) & 0xf, (unit0 >> 8) & 0xf];
        for (let a = 0; a < Math.min(argCount, 5); a++) regs.push(rOrder[a]);
        const m = methods[mIdx];
        const mText = m ? m.descriptor : `method#${mIdx}`;
        smali.push(`    :${addrHex}  ${info.name} {${regs.map((r) => `v${r}`).join(', ')}}, ${mText}`);
        if (m) {
          if (refMethods.length < 30) refMethods.push(m.signature);
          const argsDisplay = regs.slice(op === 0x71 ? 0 : 1).map((r) => regHints.get(r) || `v${r}`).join(', ');
          const targetObj = op === 0x71 ? m.className.split('.').pop() : regHints.get(regs[0]) || `v${regs[0]}`;
          const callStr = `${targetObj}.${m.name}(${argsDisplay})`;
          regHints.set(-1, callStr);
          pseudo.push(`    ${callStr};`);
        }
        pc += 3;
      } else if (info.fmt === '3rc-mth' && insnsStart + (pc + 2) * 2 + 2 <= bytes.length) {
        const argCount = (unit0 >> 8) & 0xff;
        const mIdx = view.getUint16(insnsStart + (pc + 1) * 2, true);
        const firstReg = view.getUint16(insnsStart + (pc + 2) * 2, true);
        const m = methods[mIdx];
        const mText = m ? m.descriptor : `method#${mIdx}`;
        smali.push(`    :${addrHex}  ${info.name} {v${firstReg} .. v${firstReg + Math.max(0, argCount - 1)}}, ${mText}`);
        if (m) {
          if (refMethods.length < 30) refMethods.push(m.signature);
          pseudo.push(`    ${m.className.split('.').pop()}.${m.name}(...);`);
        }
        pc += 3;
      } else {
        smali.push(`    :${addrHex}  ${info.name}`);
        pc += 1;
      }
    }

    if (insnsSize > maxUnits) {
      smali.push(`    # ... (${insnsSize - maxUnits} additional 16-bit code units omitted for responsiveness)`);
    }

    const headerSig = `${accessStr ? `${accessStr} ` : ''}${descriptorToJava(returnType)} ${methodName}(${params.map((p, idx) => `${descriptorToJava(p)} p${idx}`).join(', ')})`;
    const fullPseudo = [
      `  // Reconstructed from Dalvik bytecode (not original source)`,
      `  ${headerSig} {`,
      ...(pseudo.length > 0 ? pseudo : ['    // (Control-flow or register-only operations)']),
      `  }`,
    ];

    return {
      registersSize,
      insSize,
      outsSize,
      insnsSize,
      smali,
      pseudo: fullPseudo,
      refStrings,
      refMethods,
    };
  };

  // 6. Class Definitions
  const classes: DexClassInfo[] = [];
  const packages: Record<string, number> = {};
  const safeClassCount = Math.min(classDefsSize, 4000);

  for (let i = 0; i < safeClassCount; i++) {
    const pos = classDefsOff + i * 32;
    if (pos + 32 > bytes.length) break;
    const classIdx = view.getUint32(pos, true);
    const accessFlags = view.getUint32(pos + 4, true);
    const superClassIdx = view.getUint32(pos + 8, true);
    const interfacesOff = view.getUint32(pos + 12, true);
    const sourceFileIdx = view.getUint32(pos + 16, true);
    const classDataOff = view.getUint32(pos + 24, true);

    const descriptor = types[classIdx] || `LUnknown_${i};`;
    const className = descriptorToJava(descriptor);
    const lastDot = className.lastIndexOf('.');
    const packageName = lastDot >= 0 ? className.slice(0, lastDot) : '(default)';
    const simpleName = lastDot >= 0 ? className.slice(lastDot + 1) : className;
    packages[packageName] = (packages[packageName] || 0) + 1;

    const superClass = superClassIdx !== 0xffffffff ? descriptorToJava(types[superClassIdx] || '') : 'java.lang.Object';
    const sourceFile = sourceFileIdx !== 0xffffffff ? strings[sourceFileIdx] || 'Unknown' : 'Unknown';

    const interfaces: string[] = [];
    if (interfacesOff > 0 && interfacesOff + 4 <= bytes.length) {
      const iCount = view.getUint32(interfacesOff, true);
      for (let j = 0; j < Math.min(iCount, 32); j++) {
        const tOff = interfacesOff + 4 + j * 2;
        if (tOff + 2 > bytes.length) break;
        interfaces.push(descriptorToJava(types[view.getUint16(tOff, true)] || ''));
      }
    }

    const staticFields: DexFieldInfo[] = [];
    const instanceFields: DexFieldInfo[] = [];
    const directMethods: DexMethodInfo[] = [];
    const virtualMethods: DexMethodInfo[] = [];

    if (classDataOff > 0 && classDataOff < bytes.length) {
      let cur = classDataOff;
      const sfLen = readUleb128(bytes, cur);
      cur = sfLen.next;
      const ifLen = readUleb128(bytes, cur);
      cur = ifLen.next;
      const dmLen = readUleb128(bytes, cur);
      cur = dmLen.next;
      const vmLen = readUleb128(bytes, cur);
      cur = vmLen.next;

      const readFields = (count: number, isStatic: boolean, out: DexFieldInfo[]) => {
        let prevIdx = 0;
        for (let k = 0; k < Math.min(count, 500); k++) {
          const diff = readUleb128(bytes, cur);
          cur = diff.next;
          const flg = readUleb128(bytes, cur);
          cur = flg.next;
          prevIdx += diff.value;
          const fld = fields[prevIdx];
          out.push({
            name: fld?.name || `field_${prevIdx}`,
            type: fld?.type || 'Object',
            accessFlags: flg.value,
            accessString: formatAccessFlags(flg.value),
            isStatic,
          });
        }
      };

      const readMethods = (count: number, isDirect: boolean, out: DexMethodInfo[]) => {
        let prevIdx = 0;
        for (let k = 0; k < Math.min(count, 500); k++) {
          const diff = readUleb128(bytes, cur);
          cur = diff.next;
          const flg = readUleb128(bytes, cur);
          cur = flg.next;
          const cOff = readUleb128(bytes, cur);
          cur = cOff.next;
          prevIdx += diff.value;

          const posM = methodIdsOff + prevIdx * 8;
          let mName = `method_${prevIdx}`;
          let retType = 'V';
          let mParams: string[] = [];
          if (posM + 8 <= bytes.length) {
            const pIdx = view.getUint16(posM + 2, true);
            const nIdx = view.getUint32(posM + 4, true);
            mName = strings[nIdx] || mName;
            const pr = protos[pIdx];
            if (pr) {
              retType = pr.returnType;
              mParams = pr.params;
            }
          }

          const accStr = formatAccessFlags(flg.value, true);
          const dis = disassembleCode(cOff.value, mName, mParams, retType, accStr);

          out.push({
            methodIdx: prevIdx,
            name: mName,
            returnType: descriptorToJava(retType),
            parameters: mParams.map(descriptorToJava),
            accessFlags: flg.value,
            accessString: accStr,
            isDirect,
            registersSize: dis.registersSize,
            insSize: dis.insSize,
            outsSize: dis.outsSize,
            insnsSize: dis.insnsSize,
            codeOffset: cOff.value,
            smaliInstructions: dis.smali,
            pseudocodeLines: dis.pseudo,
            referencedStrings: dis.refStrings,
            referencedMethods: dis.refMethods,
          });
        }
      };

      readFields(sfLen.value, true, staticFields);
      readFields(ifLen.value, false, instanceFields);
      readMethods(dmLen.value, true, directMethods);
      readMethods(vmLen.value, false, virtualMethods);
    }

    const accessString = formatAccessFlags(accessFlags);
    const smaliLines: string[] = [
      `.class ${accessString} ${descriptor}`,
      `.super L${superClass.replace(/\./g, '/')};`,
      `.source "${sourceFile}"`,
      ...interfaces.map((iface) => `.implements L${iface.replace(/\./g, '/')};`),
      '',
    ];
    for (const f of [...staticFields, ...instanceFields]) {
      smaliLines.push(`.field ${f.accessString} ${f.name}:${f.type}`);
    }
    if (staticFields.length + instanceFields.length > 0) smaliLines.push('');
    for (const m of [...directMethods, ...virtualMethods]) {
      smaliLines.push(`.method ${m.accessString} ${m.name}(${m.parameters.join(', ')}) -> ${m.returnType}`);
      for (const ins of m.smaliInstructions) smaliLines.push(ins);
      smaliLines.push('.end method', '');
    }

    const pseudoLines: string[] = [
      `// Reconstructed Java-like pseudocode from ${filePath}`,
      `// Notice: Reconstructed from Dalvik bytecode, not original source code.`,
      `package ${packageName};`,
      '',
      `${accessString || 'public'} class ${simpleName} extends ${superClass.split('.').pop()}${
        interfaces.length > 0 ? ` implements ${interfaces.map((x) => x.split('.').pop()).join(', ')}` : ''
      } {`,
    ];
    for (const f of [...staticFields, ...instanceFields]) {
      pseudoLines.push(`  ${f.accessString ? `${f.accessString} ` : ''}${f.type.split('.').pop()} ${f.name};`);
    }
    if (staticFields.length + instanceFields.length > 0) pseudoLines.push('');
    for (const m of [...directMethods, ...virtualMethods]) {
      pseudoLines.push(...m.pseudocodeLines, '');
    }
    pseudoLines.push('}');

    classes.push({
      dexFile: filePath,
      descriptor,
      className,
      packageName,
      simpleName,
      superClass,
      interfaces,
      sourceFile,
      accessFlags,
      accessString,
      staticFields,
      instanceFields,
      directMethods,
      virtualMethods,
      smaliText: smaliLines.join('\n'),
      pseudocodeText: pseudoLines.join('\n'),
    });
  }

  return {
    filePath,
    version,
    fileSize,
    checksum,
    sha1,
    endianTag,
    stringCount: stringIdsSize,
    typeCount: typeIdsSize,
    protoCount: protoIdsSize,
    fieldCount: fieldIdsSize,
    methodCount: methodIdsSize,
    classDefCount: classDefsSize,
    strings,
    types,
    methods: methods.map(({ className, name, signature }) => ({ className, name, signature })),
    fields,
    classes,
    packages,
  };
}
