// 音符数据模型与纯函数：解析器、预览/导出循环、时间轴编辑器共用

export interface NoteData {
  id: number;
  lyric: string;
  startTimeMs: number;
  durationMs: number;
}

export interface ParsedUst {
  tempo: number;
  // 按 startTimeMs 排序；编辑器的所有操作都不会产生重叠
  notes: NoteData[];
  // 原工程总长（含被过滤掉的尾部休止符），保证导出时长与进度条不因去掉 R 而变短
  endMs: number;
}

export type MouthShape = 'a' | 'i' | 'u' | 'e' | 'o' | 'default';

export const TICKS_PER_BEAT = 480;
export const BEATS_PER_MEASURE = 4;

let noteIdSeq = 0;
export const newNoteId = () => ++noteIdSeq;

export const noteEnd = (n: NoteData) => n.startTimeMs + n.durationMs;

// R 休止符在导入时直接丢弃：空白处本来就显示 default 口型，与 R 效果相同
export const isRestLyric = (lyric: string) => {
  const l = (lyric || '').trim().toLowerCase();
  return l === '' || l === 'r';
};

export const getMouthShape = (lyric: string): MouthShape => {
  if (!lyric) return 'default';
  const cleanLyric = lyric.trim().toLowerCase();

  if (cleanLyric === 'r' || cleanLyric === '息') return 'default';

  const lastChar = cleanLyric.slice(-1);
  if (['a', 'i', 'u', 'e', 'o'].includes(lastChar)) {
    return lastChar as MouthShape;
  }

  const kanaMap: Record<string, MouthShape> = {
    // hiragana
    'あ':'a', 'か':'a', 'さ':'a', 'た':'a', 'な':'a', 'は':'a', 'ま':'a', 'や':'a', 'ら':'a', 'わ':'a', 'が':'a', 'ざ':'a', 'だ':'a', 'ば':'a', 'ぱ':'a', 'ぁ':'a', 'ゃ':'a',
    'い':'i', 'き':'i', 'し':'i', 'ち':'i', 'に':'i', 'ひ':'i', 'み':'i', 'り':'i', 'ぎ':'i', 'じ':'i', 'ぢ':'i', 'び':'i', 'ぴ':'i', 'ぃ':'i',
    'う':'u', 'く':'u', 'す':'u', 'つ':'u', 'ぬ':'u', 'ふ':'u', 'む':'u', 'ゆ':'u', 'る':'u', 'ぐ':'u', 'ず':'u', 'づ':'u', 'ぶ':'u', 'ぷ':'u', 'ぅ':'u', 'ゅ':'u',
    'え':'e', 'け':'e', 'せ':'e', 'て':'e', 'ね':'e', 'へ':'e', 'め':'e', 'れ':'e', 'げ':'e', 'ぜ':'e', 'で':'e', 'べ':'e', 'ぺ':'e', 'ぇ':'e',
    'お':'o', 'こ':'o', 'そ':'o', 'と':'o', 'の':'o', 'ほ':'o', 'も':'o', 'よ':'o', 'ろ':'o', 'を':'o', 'ご':'o', 'ぞ':'o', 'ど':'o', 'ぼ':'o', 'ぽ':'o', 'ぉ':'o', 'ょ':'o',
    // katakana (mirrors hiragana row-for-row; VSQX/VOCALOID commonly uses katakana)
    'ア':'a', 'カ':'a', 'サ':'a', 'タ':'a', 'ナ':'a', 'ハ':'a', 'マ':'a', 'ヤ':'a', 'ラ':'a', 'ワ':'a', 'ガ':'a', 'ザ':'a', 'ダ':'a', 'バ':'a', 'パ':'a', 'ァ':'a', 'ャ':'a',
    'イ':'i', 'キ':'i', 'シ':'i', 'チ':'i', 'ニ':'i', 'ヒ':'i', 'ミ':'i', 'リ':'i', 'ギ':'i', 'ジ':'i', 'ヂ':'i', 'ビ':'i', 'ピ':'i', 'ィ':'i',
    'ウ':'u', 'ク':'u', 'ス':'u', 'ツ':'u', 'ヌ':'u', 'フ':'u', 'ム':'u', 'ユ':'u', 'ル':'u', 'グ':'u', 'ズ':'u', 'ヅ':'u', 'ブ':'u', 'プ':'u', 'ゥ':'u', 'ュ':'u', 'ヴ':'u',
    'エ':'e', 'ケ':'e', 'セ':'e', 'テ':'e', 'ネ':'e', 'ヘ':'e', 'メ':'e', 'レ':'e', 'ゲ':'e', 'ゼ':'e', 'デ':'e', 'ベ':'e', 'ペ':'e', 'ェ':'e',
    'オ':'o', 'コ':'o', 'ソ':'o', 'ト':'o', 'ノ':'o', 'ホ':'o', 'モ':'o', 'ヨ':'o', 'ロ':'o', 'ヲ':'o', 'ゴ':'o', 'ゾ':'o', 'ド':'o', 'ボ':'o', 'ポ':'o', 'ォ':'o', 'ョ':'o',
  };

  for (let i = cleanLyric.length - 1; i >= 0; i--) {
    const c = cleanLyric[i];
    if (kanaMap[c]) return kanaMap[c];
  }

  return 'default';
};

export const getTimelineEndMs = (data: ParsedUst | null): number => {
  if (!data) return 0;
  let end = data.endMs || 0;
  for (const n of data.notes) end = Math.max(end, noteEnd(n));
  return end;
};

// 倒序扫描以兼容导入文件里本就重叠的音符；'+'/'-' 连音继承前一个有效音符
export const findActiveNote = (notes: NoteData[], time: number): NoteData | null => {
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i];
    if (time >= note.startTimeMs && time < noteEnd(note)) {
      let searchIdx = i;
      while (searchIdx >= 0 && (notes[searchIdx].lyric === '+' || notes[searchIdx].lyric === '-')) {
        searchIdx--;
      }
      return searchIdx >= 0 ? notes[searchIdx] : note;
    }
  }
  return null;
};

// 二分查找播放头所在音符的下标（不做连音继承），供时间轴高亮用
export const noteIndexAt = (notes: NoteData[], time: number): number => {
  let lo = 0, hi = notes.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].startTimeMs <= time) { found = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return found >= 0 && time < noteEnd(notes[found]) ? found : -1;
};

const NON_SOUND_LYRICS = new Set(['R', 'r', '息', '休', '+', '-']);

export const collectUniqueLyrics = (notes: NoteData[]): string[] => {
  const unique = new Set<string>();
  notes.forEach(note => {
    if (note.lyric && !NON_SOUND_LYRICS.has(note.lyric)) unique.add(note.lyric);
  });
  return Array.from(unique);
};

export const sortNotes = (notes: NoteData[]) => [...notes].sort((a, b) => a.startTimeMs - b.startTimeMs);

// 改 BPM：按比例缩放所有时间，而不是按 tick 顺序重排（后者会抹掉 USTX/VSQX 的音符间隙）
export const retimeToTempo = (data: ParsedUst, newTempo: number): ParsedUst => {
  const ratio = data.tempo / newTempo;
  return {
    tempo: newTempo,
    endMs: data.endMs * ratio,
    notes: data.notes.map(n => ({ ...n, startTimeMs: n.startTimeMs * ratio, durationMs: n.durationMs * ratio })),
  };
};

export const snapMs = (t: number, gridMs: number) => (gridMs > 0 ? Math.round(t / gridMs) * gridMs : t);

export type EditKind = 'move' | 'start' | 'end';

// "碰到即停"：音符不能越过相邻音符。先吸附再夹紧，贴边时正好对齐邻居。
// 边界取 min/max(原值) —— 导入时本就重叠的音符不会被强行弹开。
export const constrainEdit = (
  notes: NoteData[],
  idx: number,
  kind: EditKind,
  proposedStart: number,
  proposedEnd: number,
  minDur: number,
): { startTimeMs: number; durationMs: number } => {
  const note = notes[idx];
  const origStart = note.startTimeMs;
  const origEnd = noteEnd(note);
  const prevEnd = idx > 0 ? noteEnd(notes[idx - 1]) : 0;
  const nextStart = idx < notes.length - 1 ? notes[idx + 1].startTimeMs : Infinity;
  const lo = Math.min(prevEnd, origStart);
  const hi = Math.max(nextStart, origEnd);
  const effMin = Math.min(minDur, note.durationMs);

  if (kind === 'move') {
    const start = Math.min(Math.max(proposedStart, lo), hi - note.durationMs);
    return { startTimeMs: start, durationMs: note.durationMs };
  }
  if (kind === 'start') {
    const start = Math.min(Math.max(proposedStart, lo), origEnd - effMin);
    return { startTimeMs: start, durationMs: origEnd - start };
  }
  const end = Math.max(Math.min(proposedEnd, hi), origStart + effMin);
  return { startTimeMs: origStart, durationMs: end - origStart };
};

// 时间 t 处或之后第一个宽度 >= minDur 的空隙；末尾的空隙 end 为 Infinity
export const findGapAt = (notes: NoteData[], t: number, minDur: number): { start: number; end: number } => {
  let cursor = 0;
  for (const n of notes) {
    const s = Math.max(t, cursor);
    if (n.startTimeMs - s >= minDur) return { start: s, end: n.startTimeMs };
    cursor = Math.max(cursor, noteEnd(n));
  }
  return { start: Math.max(t, cursor), end: Infinity };
};
