import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { Plus, Trash2, Undo2, Redo2, ZoomIn, ZoomOut, ListMusic, Magnet, ChevronDown } from 'lucide-react';
import {
  type NoteData,
  type ParsedUst,
  type EditKind,
  BEATS_PER_MEASURE,
  constrainEdit,
  findGapAt,
  getMouthShape,
  getTimelineEndMs,
  newNoteId,
  noteEnd,
  noteIndexAt,
  retimeToTempo,
  snapMs,
  sortNotes,
} from '../lib/notes';

interface NoteTimelineProps {
  data: ParsedUst;
  onChange: (next: ParsedUst) => void;
  // 音频时间轴上的播放位置；音符时间 = currentTime - audioOffsetMs
  currentTime: number;
  audioOffsetMs: number;
  isPlaying: boolean;
  disabled: boolean;
  onSeek: (audioTimeMs: number) => void;
  onTogglePlay: () => void;
  language: 'zh' | 'en' | 'ja';
}

const i18nTexts = {
  zh: {
    title: '音符',
    collapse: '收起',
    expand: '展开',
    snap: '吸附',
    snapOff: '关',
    zoomIn: '放大 (Ctrl+滚轮)',
    zoomOut: '缩小 (Ctrl+滚轮)',
    undo: '撤销 (Ctrl+Z)',
    redo: '重做 (Ctrl+Y)',
    add: '在播放头处添加音符',
    del: '删除选中音符 (Delete)',
    lyric: '歌词',
    start: '开始 ms',
    end: '结束 ms',
    hint: '双击空白处添加音符 · 双击音符改歌词 · 拖动音符移动，拖动两端调整长度（按住 Alt 不吸附）· 点击标尺定位 · Ctrl+滚轮缩放',
  },
  en: {
    title: 'Notes',
    collapse: 'Collapse',
    expand: 'Expand',
    snap: 'Snap',
    snapOff: 'Off',
    zoomIn: 'Zoom in (Ctrl+Wheel)',
    zoomOut: 'Zoom out (Ctrl+Wheel)',
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Y)',
    add: 'Add note at playhead',
    del: 'Delete selected note (Delete)',
    lyric: 'Lyric',
    start: 'Start ms',
    end: 'End ms',
    hint: 'Double-click empty space to add · Double-click a note to edit its lyric · Drag a note to move it, drag its edges to resize (hold Alt to bypass snap) · Click the ruler to seek · Ctrl+Wheel to zoom',
  },
  ja: {
    title: 'ノート',
    collapse: '折りたたむ',
    expand: '展開',
    snap: 'スナップ',
    snapOff: 'オフ',
    zoomIn: '拡大 (Ctrl+ホイール)',
    zoomOut: '縮小 (Ctrl+ホイール)',
    undo: '元に戻す (Ctrl+Z)',
    redo: 'やり直す (Ctrl+Y)',
    add: '再生位置にノートを追加',
    del: '選択中のノートを削除 (Delete)',
    lyric: '歌詞',
    start: '開始 ms',
    end: '終了 ms',
    hint: '空白をダブルクリックでノート追加 · ノートをダブルクリックで歌詞編集 · ドラッグで移動、両端ドラッグで長さ調整（Alt でスナップ無効）· ルーラーをクリックでシーク · Ctrl+ホイールでズーム',
  },
};

const SNAP_DIVISIONS = [0, 4, 8, 16, 32];
const MIN_PX_PER_MS = 0.02;
const MAX_PX_PER_MS = 1;
const DEFAULT_PX_PER_MS = 0.15;
const MIN_NOTE_MS = 20;
const HISTORY_LIMIT = 100;
const DOUBLE_TAP_MS = 350;
const COLLAPSED_KEY = 'noteTimelineCollapsed';

interface DragState {
  pointerId: number;
  kind: EditKind;
  id: number;
  idx: number;
  startX: number;
  orig: ParsedUst;
  moved: boolean;
}

export const NoteTimeline: React.FC<NoteTimelineProps> = ({
  data, onChange, currentTime, audioOffsetMs, isPlaying, disabled, onSeek, onTogglePlay, language,
}) => {
  const t = i18nTexts[language];

  const [pxPerMs, setPxPerMs] = useState(DEFAULT_PX_PER_MS);
  const [snapDiv, setSnapDiv] = useState(16);
  // 折叠状态记在本机，换工程时组件会重新挂载，靠 localStorage 保持
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewWidth, setViewWidth] = useState(600);
  const [, setHistoryTick] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pxRef = useRef(pxPerMs);
  pxRef.current = pxPerMs;
  const pendingScrollRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const rulerPointerRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ key: string; time: number; x: number } | null>(null);
  const editingRef = useRef<number | null>(null);
  const historyRef = useRef<{ past: ParsedUst[]; future: ParsedUst[] }>({ past: [], future: [] });

  // dataRef 由 emit 立即更新，事件处理里总能读到最新数据，不必等父组件重渲染；
  // 仅当 props 真的换了对象时才用 props 覆盖，避免同一批次内被旧 props 回写
  const dataRef = useRef(data);
  const lastPropDataRef = useRef(data);
  if (data !== lastPropDataRef.current) {
    lastPropDataRef.current = data;
    dataRef.current = data;
  }

  const notes = data.notes;
  const beatMs = 60000 / data.tempo;
  const measureMs = beatMs * BEATS_PER_MEASURE;
  const gridMs = snapDiv > 0 ? beatMs * 4 / snapDiv : 0;
  const minDurFor = (grid: number) => Math.max(grid, MIN_NOTE_MS);
  const visualMs = currentTime - audioOffsetMs;

  const timelineEndMs = getTimelineEndMs(data);
  const contentWidth = Math.max(viewWidth, (timelineEndMs + measureMs * 2) * pxPerMs);

  // ------------------------------------------------------------------
  // 数据提交与撤销
  // ------------------------------------------------------------------
  const emit = (next: ParsedUst) => {
    dataRef.current = next;
    onChange(next);
  };

  const pushHistory = (prev: ParsedUst) => {
    const h = historyRef.current;
    h.past.push(prev);
    if (h.past.length > HISTORY_LIMIT) h.past.shift();
    h.future = [];
    setHistoryTick(n => n + 1);
  };

  const commit = (next: ParsedUst) => {
    pushHistory(dataRef.current);
    emit(next);
  };

  const undo = () => {
    const h = historyRef.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(dataRef.current);
    emit(prev);
    setHistoryTick(n => n + 1);
  };

  const redo = () => {
    const h = historyRef.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(dataRef.current);
    emit(next);
    setHistoryTick(n => n + 1);
  };

  const replaceNote = (d: ParsedUst, id: number, patch: Partial<NoteData>): ParsedUst => ({
    ...d,
    notes: d.notes.map(n => (n.id === id ? { ...n, ...patch } : n)),
  });

  // ------------------------------------------------------------------
  // 视图：滚动、缩放、跟随播放
  // ------------------------------------------------------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setViewWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scrollRafRef = useRef<number | null>(null);
  const handleScroll = () => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (scrollRef.current) setScrollLeft(scrollRef.current.scrollLeft);
    });
  };
  useEffect(() => () => {
    if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
  }, []);

  const zoomAround = (factor: number, anchorClientX?: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const anchorX = anchorClientX != null ? anchorClientX - el.getBoundingClientRect().left : el.clientWidth / 2;
    const ms = (el.scrollLeft + anchorX) / pxRef.current;
    const nextPx = Math.min(MAX_PX_PER_MS, Math.max(MIN_PX_PER_MS, pxRef.current * factor));
    if (nextPx === pxRef.current) return;
    pendingScrollRef.current = ms * nextPx - anchorX;
    setPxPerMs(nextPx);
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pendingScrollRef.current != null) {
      el.scrollLeft = Math.max(0, pendingScrollRef.current);
      pendingScrollRef.current = null;
    }
  }, [pxPerMs]);

  // Ctrl+滚轮(含触控板捏合)缩放；普通滚轮不拦截，右侧面板照常上下滚动。React 的 onWheel 是 passive，只能手动挂
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomAround(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // 翻页式跟随：播放头越过可视区 90% 就把它翻到左侧 10% 处；暂停时外部定位到视野外也滚过去。
  // 不依赖 pxPerMs：缩放要保持光标处锚点，不能被拉回播放头
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || dragRef.current) return;
    const x = Math.max(0, visualMs) * pxRef.current;
    const w = el.clientWidth;
    const outOfView = isPlaying
      ? x > el.scrollLeft + w * 0.9 || x < el.scrollLeft
      : x > el.scrollLeft + w || x < el.scrollLeft;
    if (outOfView) el.scrollLeft = Math.max(0, x - w * 0.1);
  }, [visualMs, isPlaying, collapsed]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch {}
  };

  const ensureVisible = (startMs: number, endMs: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const x0 = startMs * pxRef.current;
    const x1 = endMs * pxRef.current;
    if (x0 < el.scrollLeft) el.scrollLeft = Math.max(0, x0 - 20);
    else if (x1 > el.scrollLeft + el.clientWidth) el.scrollLeft = Math.min(x0 - 20, x1 - el.clientWidth + 20);
  };

  const clientXToMs = (clientX: number) => {
    const rect = contentRef.current!.getBoundingClientRect();
    return (clientX - rect.left) / pxRef.current;
  };

  // ------------------------------------------------------------------
  // 编辑操作
  // ------------------------------------------------------------------
  const startEditing = (id: number) => {
    editingRef.current = id;
    setEditingId(id);
  };

  const finishEditing = (value: string | null) => {
    const id = editingRef.current;
    if (id == null) return;
    editingRef.current = null;
    setEditingId(null);
    if (value != null) setLyric(id, value);
    scrollRef.current?.focus({ preventScroll: true });
  };

  const setLyric = (id: number, value: string) => {
    const lyric = value.trim();
    const d = dataRef.current;
    const note = d.notes.find(n => n.id === id);
    if (!note || !lyric || lyric === note.lyric) return;
    commit(replaceNote(d, id, { lyric }));
  };

  const applyTimeEdit = (id: number, kind: 'start' | 'end', value: number) => {
    if (!Number.isFinite(value)) return;
    const d = dataRef.current;
    const idx = d.notes.findIndex(n => n.id === id);
    if (idx < 0) return;
    const r = constrainEdit(d.notes, idx, kind, value, value, MIN_NOTE_MS);
    const note = d.notes[idx];
    if (r.startTimeMs === note.startTimeMs && r.durationMs === note.durationMs) return;
    commit(replaceNote(d, id, r));
  };

  const addNoteAt = (timeMs: number) => {
    const d = dataRef.current;
    const minDur = minDurFor(gridMs);
    const s0 = Math.max(0, gridMs > 0 ? Math.floor(timeMs / gridMs) * gridMs : timeMs);
    const gap = findGapAt(d.notes, s0, minDur);
    const start = gap.start;
    const end = Math.min(gap.end, start + beatMs);
    const note: NoteData = { id: newNoteId(), lyric: 'あ', startTimeMs: start, durationMs: end - start };
    commit({ ...d, notes: sortNotes([...d.notes, note]) });
    setSelectedId(note.id);
    ensureVisible(start, end);
    startEditing(note.id);
  };

  const deleteSelected = () => {
    if (selectedId == null) return;
    const d = dataRef.current;
    if (!d.notes.some(n => n.id === selectedId)) return;
    commit({ ...d, notes: d.notes.filter(n => n.id !== selectedId) });
    setSelectedId(null);
  };

  const commitTempo = (value: number) => {
    const d = dataRef.current;
    if (!Number.isFinite(value) || value <= 0 || value === d.tempo) return;
    commit(retimeToTempo(d, value));
  };

  const selectByOffset = (delta: number) => {
    const list = dataRef.current.notes;
    if (list.length === 0) return;
    let idx = list.findIndex(n => n.id === selectedId);
    if (idx < 0) {
      const at = list.findIndex(n => noteEnd(n) > visualMs);
      idx = at < 0 ? list.length - 1 : at;
    } else {
      idx = Math.min(list.length - 1, Math.max(0, idx + delta));
    }
    setSelectedId(list[idx].id);
    ensureVisible(list[idx].startTimeMs, noteEnd(list[idx]));
  };

  // ------------------------------------------------------------------
  // 指针交互（鼠标与触屏共用）
  // ------------------------------------------------------------------
  // 先让检查器/歌词输入框失焦提交，再处理这次点击，否则选中项一变输入框就被卸载、改动丢失
  const flushFocusedInput = () => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && rootRef.current?.contains(active)) active.blur();
  };

  // 按位置判定按下的是哪个音符的哪一部分。已选中的音符优先，且两端判定区向外延伸、
  // 盖过紧挨着的邻居 —— 拉伸选中音符时不会误抓到隔壁音符
  const hitTest = (clientX: number, target: HTMLElement, pointerType: string): { id: number; kind: EditKind } | null => {
    const px = pxRef.current;
    const x = clientXToMs(clientX) * px;
    const inner = pointerType === 'touch' ? 14 : 6;
    const outer = pointerType === 'touch' ? 12 : 6;
    const kindFor = (n: NoteData): EditKind => {
      const left = n.startTimeMs * px;
      const right = noteEnd(n) * px;
      const handle = Math.min(inner, (right - left) / 3);
      return x < left + handle ? 'start' : x > right - handle ? 'end' : 'move';
    };

    const sel = selectedId != null ? dataRef.current.notes.find(n => n.id === selectedId) : undefined;
    if (sel && x >= sel.startTimeMs * px - outer && x <= noteEnd(sel) * px + outer) {
      return { id: sel.id, kind: kindFor(sel) };
    }
    const noteEl = target.closest<HTMLElement>('[data-note-id]');
    const note = noteEl ? dataRef.current.notes.find(n => n.id === Number(noteEl.dataset.noteId)) : undefined;
    return note ? { id: note.id, kind: kindFor(note) } : null;
  };

  const handleLanePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('input')) return;
    flushFocusedInput();
    scrollRef.current?.focus({ preventScroll: true });

    const hit = hitTest(e.clientX, e.target as HTMLElement, e.pointerType);
    const key = hit ? `n${hit.id}` : 'empty';
    const now = performance.now();
    const last = lastTapRef.current;
    const isDouble = !!last && last.key === key && now - last.time < DOUBLE_TAP_MS && Math.abs(last.x - e.clientX) < 8;
    lastTapRef.current = isDouble ? null : { key, time: now, x: e.clientX };

    if (!hit) {
      setSelectedId(null);
      if (isDouble) addNoteAt(clientXToMs(e.clientX));
      return;
    }

    setSelectedId(hit.id);
    if (isDouble) {
      startEditing(hit.id);
      return;
    }

    const d = dataRef.current;
    const idx = d.notes.findIndex(n => n.id === hit.id);
    if (idx < 0) return;
    dragRef.current = { pointerId: e.pointerId, kind: hit.kind, id: hit.id, idx, startX: e.clientX, orig: d, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // 焦点由 pointerdown 自己管理；放任 mousedown 的默认聚焦会把刚弹出的歌词输入框立刻抢走失焦
  const handleLaneMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).closest('input')) e.preventDefault();
  };

  const handleLanePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < 3) return;
    drag.moved = true;

    const dms = dx / pxRef.current;
    const grid = e.altKey ? 0 : gridMs;
    const orig = drag.orig.notes[drag.idx];
    const r = constrainEdit(
      drag.orig.notes,
      drag.idx,
      drag.kind,
      snapMs(orig.startTimeMs + dms, grid),
      snapMs(noteEnd(orig) + dms, grid),
      minDurFor(grid),
    );
    const cur = dataRef.current.notes.find(n => n.id === drag.id);
    if (cur && cur.startTimeMs === r.startTimeMs && cur.durationMs === r.durationMs) return;
    emit(replaceNote(drag.orig, drag.id, r));
  };

  const handleLanePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    // 一次拖动只记一条撤销记录；拖动过就不算双击的第一下，连续微调边缘时不会误开歌词编辑
    if (drag.moved) lastTapRef.current = null;
    if (drag.moved && dataRef.current !== drag.orig) pushHistory(drag.orig);
  };

  const seekFromClientX = (clientX: number) => {
    onSeek(Math.max(0, clientXToMs(clientX)) + audioOffsetMs);
  };

  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    flushFocusedInput();
    rulerPointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromClientX(e.clientX);
  };

  const handleRulerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (rulerPointerRef.current === e.pointerId) seekFromClientX(e.clientX);
  };

  const handleRulerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (rulerPointerRef.current !== e.pointerId) return;
    rulerPointerRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();

    if (mod && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    } else if (mod && k === 'y') {
      e.preventDefault();
      redo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelected();
    } else if ((e.key === 'Enter' || e.key === 'F2') && selectedId != null) {
      e.preventDefault();
      const n = dataRef.current.notes.find(x => x.id === selectedId);
      if (n) {
        ensureVisible(n.startTimeMs, noteEnd(n));
        startEditing(n.id);
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      selectByOffset(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.key === ' ') {
      e.preventDefault();
      onTogglePlay();
    }
  };

  // ------------------------------------------------------------------
  // 渲染
  // ------------------------------------------------------------------
  // 只渲染可视区前后各一屏内的音符；音符数组按开始时间排序且不重叠，结尾同样有序，可二分
  const winStartMs = (scrollLeft - viewWidth) / pxPerMs;
  const winEndMs = (scrollLeft + viewWidth * 2) / pxPerMs;
  let firstIdx = 0;
  {
    let lo = 0, hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (noteEnd(notes[mid]) < winStartMs) lo = mid + 1; else hi = mid;
    }
    firstIdx = lo;
  }
  let lastIdx = firstIdx;
  while (lastIdx < notes.length && notes[lastIdx].startTimeMs <= winEndMs) lastIdx++;

  const activeIdx = noteIndexAt(notes, visualMs);
  const activeId = activeIdx >= 0 ? notes[activeIdx].id : null;

  const noteElements = useMemo(() => {
    const els: React.ReactNode[] = [];
    for (let i = firstIdx; i < lastIdx; i++) {
      const n = notes[i];
      const left = n.startTimeMs * pxPerMs;
      const width = Math.max(2, n.durationMs * pxPerMs);
      const isActive = n.id === activeId;
      const isSelected = n.id === selectedId;
      // 映射不到元音的歌词(息、ん 等)不会驱动嘴型，用灰蓝色提示
      const isMuted = getMouthShape(n.lyric) === 'default';
      const color = isMuted
        ? (isActive ? 'bg-[#a9b7c8]' : 'bg-[#8496ab]')
        : (isActive ? 'bg-[#86c8fa]' : 'bg-[#4aa3e8]');
      const handleW = Math.min(6, width / 3);
      // 外层占满轨道高度作为点击区，内层是扁的可见音符条：看着扁，抓起来不费劲
      els.push(
        <div
          key={n.id}
          data-note-id={n.id}
          className={`absolute inset-y-0 cursor-grab active:cursor-grabbing touch-none ${isSelected ? 'z-10' : ''}`}
          style={{ left, width }}
        >
          <div
            className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-5 rounded-[3px] flex items-center overflow-hidden whitespace-nowrap text-white text-xs font-medium pointer-events-none ${color} ${isSelected ? 'ring-2 ring-zinc-900 dark:ring-white' : ''}`}
          >
            <span className="pl-1 truncate drop-shadow-[0_1px_0_rgba(0,0,0,0.25)]">{n.lyric}</span>
          </div>
          <div className="absolute inset-y-0 left-0 cursor-ew-resize" style={{ width: handleW }} />
          <div className="absolute inset-y-0 right-0 cursor-ew-resize" style={{ width: handleW }} />
        </div>
      );
    }
    return els;
  }, [notes, firstIdx, lastIdx, pxPerMs, activeId, selectedId]);

  const measurePx = measureMs * pxPerMs;
  const beatPx = beatMs * pxPerMs;
  const labelStep = Math.max(1, Math.ceil(28 / measurePx));
  const rulerLabels: React.ReactNode[] = [];
  {
    const firstMeasure = Math.max(0, Math.floor(winStartMs / measureMs));
    const lastMeasure = Math.ceil(winEndMs / measureMs);
    for (let m = firstMeasure; m <= lastMeasure; m++) {
      if (m % labelStep !== 0) continue;
      rulerLabels.push(
        <span key={m} className="absolute top-0 bottom-0 pl-1 border-l border-zinc-400/60 dark:border-zinc-500/60 text-[10px] leading-5 font-mono" style={{ left: m * measurePx }}>
          {m + 1}
        </span>
      );
    }
  }

  const gridLayers = [`repeating-linear-gradient(to right, var(--measure-line) 0 1px, transparent 1px ${measurePx}px)`];
  if (beatPx >= 6) gridLayers.push(`repeating-linear-gradient(to right, var(--beat-line) 0 1px, transparent 1px ${beatPx}px)`);

  const selectedNote = selectedId != null ? notes.find(n => n.id === selectedId) : undefined;
  const editingNote = editingId != null ? notes.find(n => n.id === editingId) : undefined;
  const history = historyRef.current;

  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      e.currentTarget.value = e.currentTarget.defaultValue;
      e.currentTarget.blur();
    }
  };

  const iconBtn = 'flex items-center justify-center w-7 h-7 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-35 disabled:hover:bg-transparent transition-colors';
  const smallInput = 'bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-1.5 py-0.5 text-xs font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400';

  return (
    <div
      ref={rootRef}
      className={`w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 overflow-hidden transition-opacity ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      {/* 工具栏 */}
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 ${collapsed ? '' : 'border-b border-zinc-200 dark:border-zinc-800'}`}>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? t.expand : t.collapse}
          className="flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-md text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors"
        >
          <ChevronDown className={`w-4 h-4 text-zinc-500 dark:text-zinc-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          <ListMusic className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <span>{t.title} ({notes.length})</span>
        </button>

        {!collapsed && (<>
          <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            BPM
            <input
              key={`bpm-${data.tempo}`}
              type="number"
              step="0.01"
              min="1"
              defaultValue={data.tempo}
              onBlur={(e) => commitTempo(parseFloat(e.target.value))}
              onKeyDown={blurOnEnter}
              className={`${smallInput} w-16`}
            />
          </label>

          <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400" title={t.snap}>
            <Magnet className="w-3.5 h-3.5" />
            <select
              value={snapDiv}
              onChange={(e) => setSnapDiv(Number(e.target.value))}
              className={`${smallInput} font-sans`}
            >
              {SNAP_DIVISIONS.map(div => (
                <option key={div} value={div}>{div === 0 ? t.snapOff : `1/${div}`}</option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-0.5 ml-auto">
            <button type="button" className={iconBtn} title={t.zoomOut} onClick={() => zoomAround(1 / 1.5)}><ZoomOut className="w-4 h-4" /></button>
            <button type="button" className={iconBtn} title={t.zoomIn} onClick={() => zoomAround(1.5)}><ZoomIn className="w-4 h-4" /></button>
            <span className="w-px h-4 mx-1 bg-zinc-300 dark:bg-zinc-700" />
            <button type="button" className={iconBtn} title={t.undo} disabled={history.past.length === 0} onClick={undo}><Undo2 className="w-4 h-4" /></button>
            <button type="button" className={iconBtn} title={t.redo} disabled={history.future.length === 0} onClick={redo}><Redo2 className="w-4 h-4" /></button>
            <span className="w-px h-4 mx-1 bg-zinc-300 dark:bg-zinc-700" />
            <button type="button" className={iconBtn} title={t.add} onClick={() => addNoteAt(Math.max(0, visualMs))}><Plus className="w-4 h-4" /></button>
            <button type="button" className={iconBtn} title={t.del} disabled={!selectedNote} onClick={deleteSelected}><Trash2 className="w-4 h-4" /></button>
          </div>
        </>)}
      </div>

      {/* 折叠只隐藏不卸载：滚动容器上挂着 ResizeObserver 和滚轮监听，卸载重挂会失效 */}
      <div className={collapsed ? 'hidden' : undefined}>
        {/* 选中音符的精确数值（也方便触屏）。常驻显示、未选中时禁用：避免选中/取消时轨道上下跳动 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
          <label className="flex items-center gap-1">
            {t.lyric}
            <input
              key={selectedNote ? `ly-${selectedNote.id}-${selectedNote.lyric}` : 'ly-none'}
              disabled={!selectedNote}
              defaultValue={selectedNote?.lyric ?? ''}
              onBlur={(e) => selectedNote && setLyric(selectedNote.id, e.target.value)}
              onKeyDown={blurOnEnter}
              className={`${smallInput} w-16 font-sans disabled:opacity-50`}
            />
          </label>
          <label className="flex items-center gap-1">
            {t.start}
            <input
              key={selectedNote ? `st-${selectedNote.id}-${Math.round(selectedNote.startTimeMs)}` : 'st-none'}
              type="number"
              disabled={!selectedNote}
              defaultValue={selectedNote ? Math.round(selectedNote.startTimeMs) : ''}
              onBlur={(e) => selectedNote && applyTimeEdit(selectedNote.id, 'start', parseFloat(e.target.value))}
              onKeyDown={blurOnEnter}
              className={`${smallInput} w-20 disabled:opacity-50`}
            />
          </label>
          <label className="flex items-center gap-1">
            {t.end}
            <input
              key={selectedNote ? `en-${selectedNote.id}-${Math.round(noteEnd(selectedNote))}` : 'en-none'}
              type="number"
              disabled={!selectedNote}
              defaultValue={selectedNote ? Math.round(noteEnd(selectedNote)) : ''}
              onBlur={(e) => selectedNote && applyTimeEdit(selectedNote.id, 'end', parseFloat(e.target.value))}
              onKeyDown={blurOnEnter}
              className={`${smallInput} w-20 disabled:opacity-50`}
            />
          </label>
        </div>

        {/* 时间轴 */}
        <div
          ref={scrollRef}
          tabIndex={0}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          className="relative overflow-x-auto overflow-y-hidden select-none focus:outline-none [scrollbar-width:thin]"
        >
          <div ref={contentRef} className="relative" style={{ width: contentWidth }}>
            {/* 标尺：点击/拖动定位 */}
            <div
              className="relative h-5 bg-zinc-200/70 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 cursor-pointer touch-none"
              onPointerDown={handleRulerPointerDown}
              onPointerMove={handleRulerPointerMove}
              onPointerUp={handleRulerPointerUp}
              onPointerCancel={handleRulerPointerUp}
            >
              {rulerLabels}
            </div>

            {/* 音符轨道 */}
            <div
              className="relative h-9 bg-zinc-100 dark:bg-zinc-900 touch-pan-x [--beat-line:rgba(0,0,0,0.08)] [--measure-line:rgba(0,0,0,0.2)] dark:[--beat-line:rgba(255,255,255,0.08)] dark:[--measure-line:rgba(255,255,255,0.2)]"
              style={{ backgroundImage: gridLayers.join(', ') }}
              onPointerDown={handleLanePointerDown}
              onMouseDown={handleLaneMouseDown}
              onPointerMove={handleLanePointerMove}
              onPointerUp={handleLanePointerUp}
              onPointerCancel={handleLanePointerUp}
            >
              {noteElements}

              {editingNote && (
                <input
                  key={editingNote.id}
                  autoFocus
                  defaultValue={editingNote.lyric}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => finishEditing(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') finishEditing(e.currentTarget.value);
                    else if (e.key === 'Escape') finishEditing(null);
                  }}
                  className="absolute top-1/2 -translate-y-1/2 h-6 z-20 px-1 rounded-[3px] text-xs font-medium bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 border-2 border-indigo-500 focus:outline-none"
                  style={{ left: editingNote.startTimeMs * pxPerMs, width: Math.max(56, editingNote.durationMs * pxPerMs) }}
                />
              )}
            </div>

            {/* 播放头 */}
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none z-30"
              style={{ left: Math.max(0, visualMs) * pxPerMs }}
            >
              <div className="absolute -top-px -left-[4px] w-0 h-0 border-x-[4.5px] border-x-transparent border-t-[6px] border-t-red-500" />
            </div>
          </div>
        </div>

        <p className="px-3 py-1.5 text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">{t.hint}</p>
      </div>
    </div>
  );
};
