// 服务端解压逻辑验证：多候选、README 提取、Shift-JIS 文件名/内容解码、entry 二次提取
import Encoding from 'encoding-japanese';
import { extractProjectFile } from '../api/lib/bowlroll-server.js';

const results: string[] = [];
const check = (ok: boolean, name: string, detail: string) => {
  results.push(`${ok ? '✅' : '❌'} ${name} — ${detail}`);
  console.log(results[results.length - 1]);
};

// ---- 手工构造 zip（stored 无压缩），可控制文件名字节与 UTF-8 标志 ----
function crc32(buf: Uint8Array): number {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface RawEntry { nameBytes: Uint8Array; data: Uint8Array; utf8: boolean }

function buildZip(entries: RawEntry[]): Uint8Array {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const flag = e.utf8 ? 0x0800 : 0;
    const crc = crc32(e.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(flag, 6);
    lh.writeUInt16LE(0, 8); // stored
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(e.data.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(e.nameBytes.length, 26);
    chunks.push(lh, Buffer.from(e.nameBytes), Buffer.from(e.data));
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(flag, 8);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(e.data.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(e.nameBytes.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, Buffer.from(e.nameBytes));
    offset += 30 + e.nameBytes.length + e.data.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, eocd]);
}

const utf8 = (s: string) => new TextEncoder().encode(s);
const sjis = (s: string) =>
  new Uint8Array(Encoding.convert(Encoding.stringToCode(s), { to: 'SJIS', from: 'UNICODE' }) as number[]);

const ustA = utf8('[#SETTING]\r\nTempo=120.00\r\n[#0000]\r\nLyric=あ\r\n[#TRACKEND]\r\n');
const vsqxB = utf8('<?xml version="1.0"?><vsq4></vsq4>');
const readmeSjis = sjis('この UST は自由に使ってください。\r\n作者：テスト太郎\r\n転載禁止。');

// ---- A: 多候选 + SJIS 命名 README + SJIS 命名工程文件 ----
const zipA = buildZip([
  { nameBytes: utf8('song_a.ust'), data: ustA, utf8: true },
  { nameBytes: sjis('テスト曲.vsqx'), data: vsqxB, utf8: false },
  { nameBytes: sjis('お読みください.txt'), data: readmeSjis, utf8: false },
]);

const a = extractProjectFile(zipA, []);
check(a.candidates?.length === 2, 'A1 多候选识别', `candidates = ${JSON.stringify(a.candidates?.map((c) => c.fileName))}`);
check(a.candidates?.[1].fileName === 'テスト曲.vsqx', 'A2 SJIS 工程文件名解码', `第二候选 fileName = "${a.candidates?.[1].fileName}"`);
check(a.readme?.fileName === 'お読みください.txt', 'A3 SJIS README 文件名', `readme.fileName = "${a.readme?.fileName}"`);
check(
  (a.readme?.content ?? '').includes('作者：テスト太郎') && (a.readme?.content ?? '').includes('転載禁止'),
  'A4 SJIS README 内容解码',
  `content = "${(a.readme?.content ?? '').slice(0, 50)}..."`,
);
check(a.candidates?.every((c) => c.data && c.data.length === c.size) === true, 'A5 候选内容已内联', `sizes = ${a.candidates?.map((c) => `${c.size}/${c.data?.length}`).join(', ')}`);
check(a.fileName === 'song_a.ust' && Buffer.from(a.data).equals(Buffer.from(ustA)), 'A6 主文件向后兼容', `fileName = "${a.fileName}", 内容一致 = ${Buffer.from(a.data).equals(Buffer.from(ustA))}`);

// ---- B: entry 参数二次提取 ----
const entryName = a.candidates![1].entryName;
const b = extractProjectFile(zipA, [], entryName);
check(
  b.fileName === 'テスト曲.vsqx' && Buffer.from(b.data).equals(Buffer.from(vsqxB)) && !b.candidates,
  'B entry 参数提取指定条目',
  `entryName = ${JSON.stringify(entryName)}, fileName = "${b.fileName}", candidates = ${b.candidates}`,
);

// ---- C: 单工程文件 + UTF-8 readme.md → 无候选、有 README ----
const zipC = buildZip([
  { nameBytes: utf8('only.ust'), data: ustA, utf8: true },
  { nameBytes: utf8('README.md'), data: utf8('# Terms\nCredit me please'), utf8: true },
]);
const c = extractProjectFile(zipC, []);
check(!c.candidates && c.readme?.fileName === 'README.md', 'C 单文件 + README.md', `candidates = ${c.candidates}, readme = "${c.readme?.fileName}"`);

// ---- D: 无 README、多个 txt → readme 不误报；唯一 txt → 视作说明 ----
const zipD = buildZip([
  { nameBytes: utf8('x.ust'), data: ustA, utf8: true },
  { nameBytes: utf8('lyrics.txt'), data: utf8('lalala'), utf8: true },
  { nameBytes: utf8('terms.txt'), data: utf8('rules'), utf8: true },
]);
check(extractProjectFile(zipD, []).readme === undefined, 'D1 多个非 README txt 不误报', 'readme = undefined');
const zipD2 = buildZip([
  { nameBytes: utf8('x.ust'), data: ustA, utf8: true },
  { nameBytes: sjis('利用規約.txt'), data: readmeSjis, utf8: false },
]);
const d2 = extractProjectFile(zipD2, []);
check(d2.readme?.fileName === '利用規約.txt', 'D2 唯一 txt 视作说明文件', `readme = "${d2.readme?.fileName}"`);

// ---- E: 目录条目不干扰；无工程文件报错 ----
const zipE = buildZip([
  { nameBytes: utf8('folder/'), data: new Uint8Array(0), utf8: true },
  { nameBytes: utf8('folder/nested.ust'), data: ustA, utf8: true },
]);
const e = extractProjectFile(zipE, []);
check(e.fileName === 'nested.ust' && !e.candidates, 'E1 子目录内工程文件', `fileName = "${e.fileName}"`);
try {
  extractProjectFile(buildZip([{ nameBytes: utf8('a.txt'), data: utf8('hi'), utf8: true }]), []);
  check(false, 'E2 无工程文件抛 NO_PROJECT_FILE', '未抛错');
} catch (err) {
  check((err as Error).message === 'NO_PROJECT_FILE', 'E2 无工程文件抛 NO_PROJECT_FILE', `threw "${(err as Error).message}"`);
}

// ---- F: 直接 UST 文本（非 zip）不受影响 ----
const f = extractProjectFile(ustA, []);
check(f.fileName.endsWith('.ust') && !f.candidates && !f.readme, 'F 直链 UST 文本', `fileName = "${f.fileName}"`);

console.log('\n==== SUMMARY ====');
const fails = results.filter((r) => r.startsWith('❌'));
console.log(fails.length === 0 ? `全部 ${results.length} 项通过` : `${fails.length} 项失败`);
process.exit(fails.length === 0 ? 0 : 1);
