import React, { useState, useRef, useEffect, DragEvent, ChangeEvent } from 'react';
import { UploadCloud, FileText, AlertCircle, Clock, Music, Play, Pause, Image as ImageIcon, Video, Download, Settings, Layers } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { parseGIF, decompressFrames } from 'gifuct-js';

interface NoteData {
  index: string;
  originalLyric: string;
  cleanedLyric: string;
  length: number;
  startTime: number;
  duration: number;
}

interface ParsedUst {
  tempo: number;
  notes: NoteData[];
}

type MouthShape = 'a' | 'i' | 'u' | 'e' | 'o' | 'default';

const TICKS_PER_BEAT = 480;

const getMouthShape = (lyric: string): MouthShape => {
  if (!lyric) return 'default';
  const cleanLyric = lyric.trim().toLowerCase();
  
  if (cleanLyric === 'r' || cleanLyric === '息') return 'default';

  const lastChar = cleanLyric.slice(-1);
  if (['a', 'i', 'u', 'e', 'o'].includes(lastChar)) {
    return lastChar as MouthShape;
  }

  const kanaMap: Record<string, MouthShape> = {
    'あ':'a', 'か':'a', 'さ':'a', 'た':'a', 'な':'a', 'は':'a', 'ま':'a', 'や':'a', 'ら':'a', 'わ':'a', 'が':'a', 'ざ':'a', 'だ':'a', 'ば':'a', 'ぱ':'a', 'ぁ':'a', 'ゃ':'a',
    'い':'i', 'き':'i', 'し':'i', 'ち':'i', 'に':'i', 'ひ':'i', 'み':'i', 'り':'i', 'ぎ':'i', 'じ':'i', 'ぢ':'i', 'び':'i', 'ぴ':'i', 'ぃ':'i',
    'う':'u', 'く':'u', 'す':'u', 'つ':'u', 'ぬ':'u', 'ふ':'u', 'む':'u', 'ゆ':'u', 'る':'u', 'ぐ':'u', 'ず':'u', 'づ':'u', 'ぶ':'u', 'ぷ':'u', 'ぅ':'u', 'ゅ':'u',
    'え':'e', 'け':'e', 'せ':'e', 'て':'e', 'ね':'e', 'へ':'e', 'め':'e', 'れ':'e', 'げ':'e', 'ぜ':'e', 'で':'e', 'べ':'e', 'ぺ':'e', 'ぇ':'e',
    'お':'o', 'こ':'o', 'そ':'o', 'と':'o', 'の':'o', 'ほ':'o', 'も':'o', 'よ':'o', 'ろ':'o', 'を':'o', 'ご':'o', 'ぞ':'o', 'ど':'o', 'ぼ':'o', 'ぽ':'o', 'ぉ':'o', 'ょ':'o',
  };

  for (let i = cleanLyric.length - 1; i >= 0; i--) {
    const c = cleanLyric[i];
    if (kanaMap[c]) return kanaMap[c];
  }

  return 'default';
};

const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  const milliseconds = Math.floor(ms % 1000).toString().padStart(3, '0');
  return `${minutes}:${seconds}.${milliseconds}`;
};

type Language = 'zh' | 'en' | 'ja';

const i18n = {
  zh: {
    title: "UST口型动画生成器",
    subtitle: "基于UST文件生成口型动画的工具",
    language: "语言",
    notice: "须知",
    noticeTitle: "使用须知",
    noticeContent: "针对日语UST做的，什么类型的UST都能用。其它语言的UST理论上也可以用，但嘴型只能用单字覆盖一个个传。需要忽略嘴型设置里的五个元音。\n所有上传图片的地方都可以上传GIF。\n可以从bowlroll等地找到各种公开配布的UST文件，发布使用他人UST制作的内容时需要标注原作者。\n有什么问题可以B站私信我 -> UID 487559302",
    confirm: "确认",
    step1: "嘴型设置",
    step2: "UST/音频/背景图",
    step3: "监视器与导出",
    uploadUst: "导入 .ust 文件",
    uploadUstDesc: "生成时间轴",
    uploadAudio: "导入音频 (可选)",
    audioUploaded: "已导入音频",
    uploadAudioDesc: "同步播放与导出",
    uploadBg: "导入背景/绿幕 (可选)",
    bgUploaded: "已导入背景",
    uploadBgDesc: "底层图层",
    customSize: "自定义画布尺寸",
    width: "画布宽度",
    height: "画布高度",
    audioOffset: "延时补正 (ms)",
    exportFormat: "导出格式",
    exporting: "转换中",
    recording: "录制中...",
    exportVideo: "导出视频",
    play: "播放",
    pause: "暂停",
    time: "时间",
    mouthA: "A (あ)",
    mouthI: "I (い)",
    mouthU: "U (う)",
    mouthE: "E (え)",
    mouthO: "O (お)",
    mouthDefault: "闭嘴 (R)",
    clickToChange: "点击更换",
    specialLyrics: "单字覆盖",
    detectedSounds: "检测到 {count} 个独立发音",
    override: "覆盖",
    change: "更换",
    noUstLoaded: "请先在左侧导入 UST 文件",
    ffmpegNotLoaded: "FFmpeg 加载失败 (可能是 COOP/COEP 跨域隔离限制)。目前只能导出 WebM 格式。",
    ffmpegNotLoadedAlert: "FFmpeg 未加载，无法转换格式。将直接下载 WebM。",
    conversionFailed: "转换失败: ",
    gifParseFailed: "GIF 解析失败",
    parseError: "解析文件时发生错误，请检查文件格式。",
    fileReadError: "文件读取失败",
    invalidUst: "请上传有效的 .ust 文件",
    parsedData: "解析数据 ({count} notes)",
    index: "序号",
    originalLyric: "原始歌词",
    cleanedLyric: "清洗后歌词",
    mappedMouth: "映射嘴型",
    webmDesc: "WebM (支持透明)",
    mp4Desc: "MP4 (H.264)",
    movDesc: "MOV (H.264)",
    mkvDesc: "MKV (H.264)",
    gifDesc: "GIF (无音频)",
    selected: "已选择: "
  },
  en: {
    title: "UST Lip Sync Generator",
    subtitle: "Generate lip sync animations based on UST files",
    language: "Language",
    notice: "Notice",
    noticeTitle: "Usage Notice",
    noticeContent: "Optimized for Japanese USTs and compatible with all UST types. Other languages are theoretically supported, but you must ignore the five default vowel settings and manually upload mouth shapes one by one using the custom syllable overrides.\nGIF files are supported in all image upload sections.\nYou can find publicly distributed UST files on websites like BowlRoll. When publishing content created using someone else's UST, please make sure to credit the original author.\nIf you have any questions, feel free to email me -> Riciwaaaa@gmail.com",
    confirm: "Confirm",
    step1: "Mouth Shapes",
    step2: "UST / Audio / Background",
    step3: "Monitor & Export",
    uploadUst: "Import .ust File",
    uploadUstDesc: "Generate timeline",
    uploadAudio: "Import Audio (Optional)",
    audioUploaded: "Audio Imported",
    uploadAudioDesc: "Sync playback & export",
    uploadBg: "Import Background (Optional)",
    bgUploaded: "Background Imported",
    uploadBgDesc: "Bottom layer",
    customSize: "Custom Canvas Size",
    width: "Canvas Width",
    height: "Canvas Height",
    audioOffset: "Audio Offset (ms)",
    exportFormat: "Export Format",
    exporting: "Converting",
    recording: "Recording...",
    exportVideo: "Export Video",
    play: "Play",
    pause: "Pause",
    time: "Time",
    mouthA: "A (あ)",
    mouthI: "I (い)",
    mouthU: "U (う)",
    mouthE: "E (え)",
    mouthO: "O (お)",
    mouthDefault: "Closed (R)",
    clickToChange: "Click to change",
    specialLyrics: "Lyric Overrides",
    detectedSounds: "Detected {count} unique sounds",
    override: "Override",
    change: "Change",
    noUstLoaded: "Please import a UST file on the left first",
    ffmpegNotLoaded: "FFmpeg load failed (possibly due to COOP/COEP). Only WebM export is available.",
    ffmpegNotLoadedAlert: "FFmpeg not loaded. Will download WebM directly.",
    conversionFailed: "Conversion failed: ",
    gifParseFailed: "Failed to parse GIF",
    parseError: "Error parsing file, please check the format.",
    fileReadError: "Failed to read file",
    invalidUst: "Please upload a valid .ust file",
    parsedData: "Parsed Data ({count} notes)",
    index: "Index",
    originalLyric: "Original Lyric",
    cleanedLyric: "Cleaned Lyric",
    mappedMouth: "Mapped Mouth",
    webmDesc: "WebM (Supports Transparency)",
    mp4Desc: "MP4 (H.264)",
    movDesc: "MOV (H.264)",
    mkvDesc: "MKV (H.264)",
    gifDesc: "GIF (No Audio)",
    selected: "Selected: "
  },
  ja: {
    title: "USTリップシンクジェネレーター",
    subtitle: "USTファイルからリップシンクアニメーションを生成するツール",
    language: "言語",
    notice: "注意事項",
    noticeTitle: "注意事項",
    noticeContent: "日本語UST向けに最適化されており、全タイプのUSTに対応しています。他言語のUSTも理論上は使用可能ですが、デフォルトの5つの母音設定を無視し、カスタム上書き機能を使って口の形を一つずつ手動でアップロードする必要があります。\n画像アップロード部分はすべてGIF形式に対応しています。\nBowlRollなどで公開配布されている様々なUSTファイルを利用できます。他者のUSTを使用して制作した動画を公開する際は、必ず原作者のクレジット表記を行ってください。\nご質問などがございましたら、お気軽にメールにてご連絡ください -> Riciwaaaa@gmail.com",
    confirm: "確認",
    step1: "口パク設定",
    step2: "UST / 音声 / 背景",
    step3: "モニターと出力",
    uploadUst: "USTファイルをインポート",
    uploadUstDesc: "タイムラインを生成",
    uploadAudio: "音声をインポート (任意)",
    audioUploaded: "音声インポート済み",
    uploadAudioDesc: "同期再生と出力",
    uploadBg: "背景をインポート (任意)",
    bgUploaded: "背景インポート済み",
    uploadBgDesc: "最背面レイヤー",
    customSize: "キャンバスサイズ",
    width: "幅",
    height: "高さ",
    audioOffset: "音声オフセット (ms)",
    exportFormat: "出力形式",
    exporting: "変換中",
    recording: "録画中...",
    exportVideo: "動画を出力",
    play: "再生",
    pause: "一時停止",
    time: "時間",
    mouthA: "あ (A)",
    mouthI: "い (I)",
    mouthU: "う (U)",
    mouthE: "え (E)",
    mouthO: "お (O)",
    mouthDefault: "閉じる (R)",
    clickToChange: "クリックで変更",
    specialLyrics: "Lyric Overrides",
    detectedSounds: "{count} 個の独立した発音を検出",
    override: "上書き",
    change: "変更",
    noUstLoaded: "先に左側でUSTファイルをインポートしてください",
    ffmpegNotLoaded: "FFmpegの読み込みに失敗しました(COOP/COEP制限の可能性)。現在はWebMのみ出力可能です。",
    ffmpegNotLoadedAlert: "FFmpegが読み込まれていません。WebMを直接ダウンロードします。",
    conversionFailed: "変換失敗: ",
    gifParseFailed: "GIFの解析に失敗しました",
    parseError: "ファイルの解析中にエラーが発生しました。フォーマットを確認してください。",
    fileReadError: "ファイルの読み込みに失敗しました",
    invalidUst: "有効な.ustファイルをアップロードしてください",
    parsedData: "解析データ ({count} notes)",
    index: "番号",
    originalLyric: "元の歌詞",
    cleanedLyric: "クリーンアップ後",
    mappedMouth: "割り当てられた口の形",
    webmDesc: "WebM (透過対応)",
    mp4Desc: "MP4 (H.264)",
    movDesc: "MOV (H.264)",
    mkvDesc: "MKV (H.264)",
    gifDesc: "GIF (音声なし)",
    selected: "選択中: "
  }
};

const getMouthShapeConfigs = (t: any): { id: MouthShape; label: string; color: string; bg: string; canvasBg: string; canvasColor: string }[] => [
  { id: 'a', label: t.mouthA, color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30 hover:bg-red-500/30', canvasBg: 'rgba(239, 68, 68, 0.2)', canvasColor: 'rgba(248, 113, 113, 0.5)' },
  { id: 'i', label: t.mouthI, color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30 hover:bg-blue-500/30', canvasBg: 'rgba(59, 130, 246, 0.2)', canvasColor: 'rgba(96, 165, 250, 0.5)' },
  { id: 'u', label: t.mouthU, color: 'text-green-400', bg: 'bg-green-500/20 border-green-500/30 hover:bg-green-500/30', canvasBg: 'rgba(34, 197, 94, 0.2)', canvasColor: 'rgba(74, 222, 128, 0.5)' },
  { id: 'e', label: t.mouthE, color: 'text-yellow-400', bg: 'bg-yellow-500/20 border-yellow-500/30 hover:bg-yellow-500/30', canvasBg: 'rgba(234, 179, 8, 0.2)', canvasColor: 'rgba(250, 204, 21, 0.5)' },
  { id: 'o', label: t.mouthO, color: 'text-purple-400', bg: 'bg-purple-500/20 border-purple-500/30 hover:bg-purple-500/30', canvasBg: 'rgba(168, 85, 247, 0.2)', canvasColor: 'rgba(192, 132, 252, 0.5)' },
  { id: 'default', label: t.mouthDefault, color: 'text-zinc-300', bg: 'bg-zinc-700/50 border-zinc-600 hover:bg-zinc-700/70', canvasBg: 'rgba(63, 63, 70, 0.5)', canvasColor: 'rgba(212, 212, 216, 0.5)' },
];

export default function App() {
  const [language, setLanguage] = useState<Language>('zh');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const hasVisited = localStorage.getItem('hasVisited');
    if (!hasVisited) {
      setShowModal(true);
    }
  }, []);

  const handleCloseModal = () => {
    localStorage.setItem('hasVisited', 'true');
    setShowModal(false);
  };

  const t = i18n[language];
  const mouthShapeConfigs = getMouthShapeConfigs(t);

  const [parsedData, setParsedData] = useState<ParsedUst | null>(null);
  const parsedDataRef = useRef<ParsedUst | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 播放器与画布状态
  const [mouthImages, setMouthImages] = useState<Record<MouthShape, string>>({ a: '', i: '', u: '', e: '', o: '', default: '' });
  const mouthImageElementsRef = useRef<Record<MouthShape, HTMLImageElement | null>>({ a: null, i: null, u: null, e: null, o: null, default: null });
  
  // 新增：单字特例覆盖状态
  const [uniqueLyrics, setUniqueLyrics] = useState<string[]>([]);
  const [overrideImages, setOverrideImages] = useState<Record<string, string>>({});
  const overrideImageElementsRef = useRef<Record<string, HTMLImageElement | null>>({});

  const [canvasSize, setCanvasSize] = useState({ width: 512, height: 512 });
  const isFirstImageRef = useRef(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentMouth, setCurrentMouth] = useState<MouthShape>('default');
  
  const reqRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // 录制状态
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // 新增：音频、背景、FFmpeg 导出状态
  const [audioUrl, setAudioUrl] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [bgImageUrl, setBgImageUrl] = useState<string>('');
  const bgImageElementRef = useRef<HTMLImageElement | null>(null);
  
  // GIF 背景状态
  interface GifFrame {
    canvas: HTMLCanvasElement;
    delay: number;
  }
  const [bgGifFrames, setBgGifFrames] = useState<GifFrame[] | null>(null);
  const bgGifFramesRef = useRef<GifFrame[] | null>(null);
  
  // 新增：自定义宽高和音频偏移
  const [customWidth, setCustomWidth] = useState<string>('');
  const [customHeight, setCustomHeight] = useState<string>('');
  const [audioOffset, setAudioOffset] = useState<number>(0);
  const audioOffsetRef = useRef<number>(0);
  const trackedUrlsRef = useRef<Set<string>>(new Set());

  // 辅助函数：创建并追踪 ObjectURL
  const createTrackedURL = (file: Blob) => {
    const url = URL.createObjectURL(file);
    trackedUrlsRef.current.add(url);
    return url;
  };

  // 辅助函数：撤销并取消追踪 ObjectURL
  const revokeTrackedURL = (url: string) => {
    if (trackedUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      trackedUrlsRef.current.delete(url);
    }
  };

  useEffect(() => {
    audioOffsetRef.current = audioOffset;
  }, [audioOffset]);

  const calculateCanvasSize = () => {
    if (customWidth && customHeight && !isNaN(Number(customWidth)) && !isNaN(Number(customHeight))) {
      return { width: Number(customWidth), height: Number(customHeight) };
    }
    
    if (bgImageElementRef.current) {
      return { width: bgImageElementRef.current.naturalWidth, height: bgImageElementRef.current.naturalHeight };
    }
    
    if (bgGifFramesRef.current && bgGifFramesRef.current.length > 0) {
      return { width: bgGifFramesRef.current[0].canvas.width, height: bgGifFramesRef.current[0].canvas.height };
    }

    let maxWidth = 512;
    let maxHeight = 512;
    let hasMouthImage = false;

    Object.values(mouthImageElementsRef.current).forEach((img) => {
      if (img) {
        hasMouthImage = true;
        maxWidth = Math.max(maxWidth, (img as HTMLImageElement).naturalWidth);
        maxHeight = Math.max(maxHeight, (img as HTMLImageElement).naturalHeight);
      }
    });

    if (hasMouthImage) {
      return { width: maxWidth, height: maxHeight };
    }

    return { width: 512, height: 512 };
  };

  useEffect(() => {
    setCanvasSize(calculateCanvasSize());
  }, [customWidth, customHeight, bgImageUrl, mouthImages, bgGifFrames]);

  const drawStretchedImage = (ctx: CanvasRenderingContext2D, img: HTMLImageElement | HTMLCanvasElement, canvasWidth: number, canvasHeight: number) => {
    const imgWidth = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
    const imgHeight = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
    
    if (imgWidth === 0 || imgHeight === 0) return;

    const scale = Math.min(canvasWidth / imgWidth, canvasHeight / imgHeight);
    const drawWidth = imgWidth * scale;
    const drawHeight = imgHeight * scale;
    const x = (canvasWidth - drawWidth) / 2;
    const y = (canvasHeight - drawHeight) / 2;

    ctx.drawImage(img, x, y, drawWidth, drawHeight);
  };
  
  const [exportFormat, setExportFormat] = useState<'webm' | 'mp4' | 'mov' | 'mkv' | 'gif'>('webm');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const ffmpegRef = useRef(new FFmpeg());
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegError, setFfmpegError] = useState('');

  // 初始化 FFmpeg
  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const ffmpeg = ffmpegRef.current;
        ffmpeg.on('progress', ({ progress }) => {
          setExportProgress(Math.round(progress * 100));
        });
        await ffmpeg.load({
          coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
          wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
        });
        setFfmpegLoaded(true);
      } catch (err) {
        console.error('FFmpeg load error:', err);
        setFfmpegError(t.ffmpegNotLoaded);
      }
    };
    loadFFmpeg();
  }, []);

  const drawCanvas = (mouth: MouthShape, time: number = currentTime, lyric: string = '') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 核心：必须清空画布以支持透明通道
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制背景图层 (如果有)
    const gifFrames = bgGifFramesRef.current;
    if (gifFrames && gifFrames.length > 0) {
      // Calculate which frame to show based on time
      let totalDuration = gifFrames.reduce((acc, f) => acc + f.delay, 0);
      if (totalDuration > 0) {
        let timeInLoop = time % totalDuration;
        let currentFrame = gifFrames[0].canvas;
        
        let accTime = 0;
        for (const frame of gifFrames) {
          accTime += frame.delay;
          if (timeInLoop < accTime) {
            currentFrame = frame.canvas;
            break;
          }
        }
        drawStretchedImage(ctx, currentFrame, canvas.width, canvas.height);
      }
    } else {
      const bgImg = bgImageElementRef.current;
      if (bgImg) {
        drawStretchedImage(ctx, bgImg, canvas.width, canvas.height);
      }
    }

    // 决定渲染哪张嘴型图：优先 Override，其次 Base，最后 Default
    let imgToDraw: HTMLImageElement | null = null;
    
    if (lyric && overrideImageElementsRef.current[lyric]) {
      imgToDraw = overrideImageElementsRef.current[lyric];
    } else if (mouthImageElementsRef.current[mouth]) {
      imgToDraw = mouthImageElementsRef.current[mouth];
    } else if (mouthImageElementsRef.current['default']) {
      imgToDraw = mouthImageElementsRef.current['default'];
    }

    if (imgToDraw) {
      // 居中绘制图片 (Object-fit: contain)
      drawStretchedImage(ctx, imgToDraw, canvas.width, canvas.height);
    } else {
      // 占位色块
      const config = mouthShapeConfigs.find(c => c.id === mouth);
      if (config) {
        ctx.fillStyle = config.canvasBg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = config.canvasColor;
        ctx.font = `bold ${Math.max(40, canvas.height / 4)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(mouth.toUpperCase(), canvas.width / 2, canvas.height / 2);
      }
    }
  };

  // 静态时更新画布
  useEffect(() => {
    if (!isPlaying) {
      const currentNote = parsedDataRef.current?.notes.find(n => currentTime >= n.startTime && currentTime < n.startTime + n.duration);
      drawCanvas(currentMouth, currentTime, currentNote ? currentNote.cleanedLyric : '');
    }
  }, [canvasSize, currentMouth, isPlaying, currentTime]);

  const updateFrame = () => {
    const data = parsedDataRef.current;
    if (!data || !isPlayingRef.current) return;

    let newTime = 0;
    if (audioRef.current && audioUrl) {
      newTime = (audioRef.current.currentTime * 1000) - audioOffsetRef.current;
    } else {
      const now = performance.now();
      newTime = now - startTimeRef.current;
    }
    
    if (newTime < 0) newTime = 0;
    
    const lastNote = data.notes[data.notes.length - 1];
    const totalDuration = lastNote ? lastNote.startTime + lastNote.duration : 0;

    if (newTime >= totalDuration) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      setCurrentTime(totalDuration);
      setCurrentMouth('default');
      drawCanvas('default', totalDuration);
      
      if (audioRef.current) {
        audioRef.current.pause();
      }

      if (isRecordingRef.current) {
        mediaRecorderRef.current?.stop();
        isRecordingRef.current = false;
        // setIsRecording(false) will be handled in onstop
      }
      return;
    }

    setCurrentTime(newTime);

    let activeNote: NoteData | null = null;
    let l = 0, r = data.notes.length - 1;
    while (l <= r) {
      const m = Math.floor((l + r) / 2);
      const note = data.notes[m];
      if (newTime >= note.startTime && newTime < note.startTime + note.duration) {
        activeNote = note;
        break;
      } else if (newTime < note.startTime) {
        r = m - 1;
      } else {
        l = m + 1;
      }
    }

    const mouth = activeNote ? getMouthShape(activeNote.cleanedLyric) : 'default';
    const lyric = activeNote ? activeNote.cleanedLyric : '';
    setCurrentMouth(mouth);
    drawCanvas(mouth, newTime, lyric);

    if (isPlayingRef.current) {
      reqRef.current = requestAnimationFrame(updateFrame);
    }
  };

  const togglePlay = () => {
    if (!parsedDataRef.current) return;
    
    if (isPlayingRef.current) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      if (audioRef.current) audioRef.current.pause();
      
      if (isRecordingRef.current) {
        mediaRecorderRef.current?.stop();
        isRecordingRef.current = false;
        setIsRecording(false);
      }
    } else {
      setIsPlaying(true);
      isPlayingRef.current = true;
      
      if (audioRef.current && audioUrl) {
        const targetAudioTime = (currentTime + audioOffsetRef.current) / 1000;
        audioRef.current.currentTime = Math.max(0, targetAudioTime);
        audioRef.current.play().catch(e => console.error("Audio play failed:", e));
      } else {
        startTimeRef.current = performance.now() - currentTime;
      }
      
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      reqRef.current = requestAnimationFrame(updateFrame);
    }
  };

  const handleSeek = (e: ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    
    if (audioRef.current && audioUrl) {
      const targetAudioTime = (time + audioOffsetRef.current) / 1000;
      audioRef.current.currentTime = Math.max(0, targetAudioTime);
    }
    
    if (isPlayingRef.current) {
      if (!audioUrl) {
        startTimeRef.current = performance.now() - time;
      }
    } else {
      // 静态更新画布
      const data = parsedDataRef.current;
      if (data) {
        let activeNote: NoteData | null = null;
        let l = 0, r = data.notes.length - 1;
        while (l <= r) {
          const m = Math.floor((l + r) / 2);
          const note = data.notes[m];
          if (time >= note.startTime && time < note.startTime + note.duration) {
            activeNote = note;
            break;
          } else if (time < note.startTime) {
            r = m - 1;
          } else {
            l = m + 1;
          }
        }
        const mouth = activeNote ? getMouthShape(activeNote.cleanedLyric) : 'default';
        const lyric = activeNote ? activeNote.cleanedLyric : '';
        setCurrentMouth(mouth);
        drawCanvas(mouth, time, lyric);
      } else {
        drawCanvas(currentMouth, time, '');
      }
    }
  };

  const convertAndDownload = async (webmBlob: Blob) => {
    if (exportFormat === 'webm') {
      const url = URL.createObjectURL(webmBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `utau-lipsync-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
      setIsRecording(false);
      return;
    }

    if (!ffmpegLoaded) {
      alert(t.ffmpegNotLoadedAlert);
      const url = URL.createObjectURL(webmBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `utau-lipsync-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
      setIsRecording(false);
      return;
    }

    setIsExporting(true);
    const ffmpeg = ffmpegRef.current;
    const inputName = 'input.webm';
    const outputName = `output.${exportFormat}`;

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(webmBlob));
      
      let ffmpegArgs = ['-i', inputName];
      
      if (exportFormat === 'gif') {
        // GIF doesn't support audio
        ffmpegArgs.push('-vf', 'fps=15,scale=512:-1:flags=lanczos', '-c:v', 'gif', '-an');
      } else {
        // MP4, MOV, MKV
        ffmpegArgs.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-c:a', 'aac', '-b:a', '128k');
      }
      
      ffmpegArgs.push(outputName);
      
      await ffmpeg.exec(ffmpegArgs);
      
      const data = await ffmpeg.readFile(outputName);
      const url = URL.createObjectURL(new Blob([data], { type: `video/${exportFormat === 'mkv' ? 'x-matroska' : exportFormat}` }));
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `utau-lipsync-${Date.now()}.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
      
    } catch (err) {
      console.error('Conversion error:', err);
      alert(t.conversionFailed + err);
    } finally {
      setIsExporting(false);
      setIsRecording(false);
    }
  };

  const startRecording = () => {
    if (!parsedDataRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 捕获画布流 (60fps)
    const canvasStream = canvas.captureStream(60);
    
    // 合并音频流
    const tracks = [...canvasStream.getVideoTracks()];
    if (audioRef.current && exportFormat !== 'gif') {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const dest = audioCtx.createMediaStreamDestination();
        // We need to create a new audio element or use the existing one.
        // Using captureStream on audio element is easier if supported.
        const audioStream = (audioRef.current as any).captureStream ? (audioRef.current as any).captureStream() : null;
        if (audioStream) {
            tracks.push(...audioStream.getAudioTracks());
        } else {
            // Fallback for browsers that don't support audio.captureStream
            const source = audioCtx.createMediaElementSource(audioRef.current);
            source.connect(dest);
            source.connect(audioCtx.destination);
            tracks.push(...dest.stream.getAudioTracks());
        }
      } catch (e) {
        console.error("Failed to capture audio stream:", e);
      }
    }

    const combinedStream = new MediaStream(tracks);
    
    // 优先使用 vp9 编码以支持透明通道
    let options = { mimeType: 'video/webm; codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm; codecs=vp8' };
    }

    const recorder = new MediaRecorder(combinedStream, options);
    recordedChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: options.mimeType });
      convertAndDownload(blob);
    };

    mediaRecorderRef.current = recorder;
    recorder.start();

    setIsRecording(true);
    isRecordingRef.current = true;

    // 强制从头开始播放
    setIsPlaying(true);
    isPlayingRef.current = true;
    setCurrentTime(0);
    
    if (audioRef.current && audioUrl) {
      const targetAudioTime = audioOffsetRef.current / 1000;
      audioRef.current.currentTime = Math.max(0, targetAudioTime);
      audioRef.current.play().catch(e => console.error("Audio play failed:", e));
    } else {
      startTimeRef.current = performance.now();
    }
    
    if (reqRef.current) cancelAnimationFrame(reqRef.current);
    reqRef.current = requestAnimationFrame(updateFrame);
  };

  useEffect(() => {
    return () => {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      if (mediaRecorderRef.current && isRecordingRef.current) {
        mediaRecorderRef.current.stop();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      // 组件卸载时释放所有 ObjectURL 内存
      trackedUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      trackedUrlsRef.current.clear();
    };
  }, []);

  const parseUst = (content: string) => {
    const lines = content.split(/\r?\n/);
    let currentTempo = 120;
    let currentSection = '';
    let currentNote: Partial<NoteData> & { index?: string } = {};
    const notes: NoteData[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const sectionMatch = trimmedLine.match(/^\[#(.+)\]$/);
      if (sectionMatch) {
        if (currentSection.match(/^\d+$/) && currentNote.length !== undefined && currentNote.originalLyric !== undefined) {
          notes.push({
            index: currentNote.index || '',
            originalLyric: currentNote.originalLyric,
            cleanedLyric: currentNote.cleanedLyric || '',
            length: currentNote.length,
            startTime: 0,
            duration: 0,
          });
        }
        currentSection = sectionMatch[1];
        if (currentSection.match(/^\d+$/)) {
          currentNote = { index: currentSection };
        }
        continue;
      }

      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex !== -1) {
        const key = trimmedLine.substring(0, equalIndex).trim();
        const value = trimmedLine.substring(equalIndex + 1).trim();

        if (currentSection === 'SETTING' && key === 'Tempo') {
          const parsedTempo = parseFloat(value);
          if (!isNaN(parsedTempo) && parsedTempo > 0) {
            currentTempo = parsedTempo;
          }
        } else if (currentSection.match(/^\d+$/)) {
          if (key === 'Length') {
            currentNote.length = parseInt(value, 10);
          } else if (key === 'Lyric') {
            currentNote.originalLyric = value;
            const parts = value.split(' ');
            currentNote.cleanedLyric = parts[parts.length - 1];
          }
        }
      }
    }

    if (currentSection.match(/^\d+$/) && currentNote.length !== undefined && currentNote.originalLyric !== undefined) {
      notes.push({
        index: currentNote.index || '',
        originalLyric: currentNote.originalLyric,
        cleanedLyric: currentNote.cleanedLyric || '',
        length: currentNote.length,
        startTime: 0,
        duration: 0,
      });
    }

    const msPerTick = 60000 / (currentTempo * TICKS_PER_BEAT);
    let currentStartTime = 0;

    for (const note of notes) {
      note.startTime = currentStartTime;
      note.duration = note.length * msPerTick;
      currentStartTime += note.duration;
    }

    const newData = { tempo: currentTempo, notes };
    parsedDataRef.current = newData;
    setParsedData(newData);
    
    // 提取唯一歌词
    const unique = new Set<string>();
    notes.forEach(note => {
      if (note.cleanedLyric && note.cleanedLyric !== 'R' && note.cleanedLyric !== '息') {
        unique.add(note.cleanedLyric);
      }
    });
    setUniqueLyrics(Array.from(unique));

    setCurrentTime(0);
    setCurrentMouth('default');
    
    setIsPlaying(false);
    isPlayingRef.current = false;
    if (reqRef.current) cancelAnimationFrame(reqRef.current);
  };

  const handleLyricChange = (index: number, newValue: string) => {
    if (!parsedData) return;
    const newNotes = [...parsedData.notes];
    newNotes[index] = { ...newNotes[index], cleanedLyric: newValue };
    const newData = { ...parsedData, notes: newNotes };
    parsedDataRef.current = newData;
    setParsedData(newData);

    // Update unique lyrics
    const unique = new Set<string>();
    newNotes.forEach(note => {
      if (note.cleanedLyric && note.cleanedLyric !== 'R' && note.cleanedLyric !== '息') {
        unique.add(note.cleanedLyric);
      }
    });
    setUniqueLyrics(Array.from(unique));

    // Update current mouth if paused and on this frame
    if (!isPlaying) {
      const currentNote = newNotes.find(n => currentTime >= n.startTime && currentTime < n.startTime + n.duration);
      const newLyric = currentNote ? currentNote.cleanedLyric : '';
      const newMouth = currentNote ? getMouthShape(currentNote.cleanedLyric) : 'default';
      setCurrentMouth(newMouth);
      drawCanvas(newMouth, currentTime, newLyric);
    }
  };

  const handleFile = (file: File | undefined | null) => {
    if (!file) return;
    setError('');
    
    if (!file.name.toLowerCase().endsWith('.ust')) {
      setError(t.invalidUst);
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        try {
          parseUst(result);
        } catch (err) {
          console.error(err);
          setError(t.parseError);
        }
      } else {
        setError(t.fileReadError);
      }
    };
    reader.onerror = () => setError(t.fileReadError);
    reader.readAsText(file, 'Shift_JIS');
  };

  const handleMouthImageUpload = (shape: MouthShape, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = createTrackedURL(file);
      const img = new Image();
      
      img.onload = () => {
        mouthImageElementsRef.current[shape] = img;
        setMouthImages(prev => {
          if (prev[shape]) revokeTrackedURL(prev[shape]);
          return { ...prev, [shape]: url };
        });
      };
      img.src = url;
    }
  };

  const handleOverrideImageUpload = (lyric: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = createTrackedURL(file);
      const img = new Image();
      
      img.onload = () => {
        overrideImageElementsRef.current[lyric] = img;
        setOverrideImages(prev => {
          if (prev[lyric]) revokeTrackedURL(prev[lyric]);
          return { ...prev, [lyric]: url };
        });
      };
      img.src = url;
    }
  };

  const removeOverrideImage = (lyric: string) => {
    overrideImageElementsRef.current[lyric] = null;
    setOverrideImages(prev => {
      const newState = { ...prev };
      if (newState[lyric]) revokeTrackedURL(newState[lyric]);
      delete newState[lyric];
      return newState;
    });
  };

  const handleAudioUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = createTrackedURL(file);
      setAudioUrl(prev => {
        if (prev) revokeTrackedURL(prev);
        return url;
      });
    }
  };

  const handleBgImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'image/gif') {
      try {
        const buffer = await file.arrayBuffer();
        const gif = parseGIF(buffer);
        const frames = decompressFrames(gif, true);
        
        const width = gif.lsd.width;
        const height = gif.lsd.height;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        if (!tempCtx) return;
        
        let gifCanvasData: GifFrame[] = [];
        let previousImageData: ImageData | null = null;
        
        for (let i = 0; i < frames.length; i++) {
          const frame = frames[i];
          const dims = frame.dims;
          
          if (frame.disposalType === 3) {
            previousImageData = tempCtx.getImageData(0, 0, width, height);
          }
          
          const patchData = new ImageData(
            new Uint8ClampedArray(frame.patch),
            dims.width,
            dims.height
          );
          
          const patchCanvas = document.createElement('canvas');
          patchCanvas.width = dims.width;
          patchCanvas.height = dims.height;
          patchCanvas.getContext('2d')!.putImageData(patchData, 0, 0);
          
          // Handle transparency
          if (frame.transparentIndex !== undefined) {
             // gifuct-js handles transparency in the patch data already when buildPalette is true
          }

          tempCtx.drawImage(patchCanvas, dims.left, dims.top);
          
          const frameCanvas = document.createElement('canvas');
          frameCanvas.width = width;
          frameCanvas.height = height;
          frameCanvas.getContext('2d')!.drawImage(tempCanvas, 0, 0);
          
          gifCanvasData.push({
            canvas: frameCanvas,
            delay: Math.max(frame.delay, 20) // Minimum delay to prevent infinite loops or too fast
          });
          
          if (frame.disposalType === 2) {
            tempCtx.clearRect(dims.left, dims.top, dims.width, dims.height);
          } else if (frame.disposalType === 3 && previousImageData) {
            tempCtx.putImageData(previousImageData, 0, 0);
          }
        }
        
        bgGifFramesRef.current = gifCanvasData;
        setBgGifFrames(gifCanvasData);
        setBgImageUrl(prev => {
          if (prev) revokeTrackedURL(prev);
          return createTrackedURL(file);
        }); // Just for UI display
        bgImageElementRef.current = null; // Clear static image
        const currentNote = parsedDataRef.current?.notes.find(n => currentTime >= n.startTime && currentTime < n.startTime + n.duration);
        drawCanvas(currentMouth, currentTime, currentNote ? currentNote.cleanedLyric : '');
      } catch (err) {
        console.error("Failed to parse GIF:", err);
        alert(t.gifParseFailed);
      }
    } else {
      const url = createTrackedURL(file);
      const img = new Image();
      img.onload = () => {
        bgImageElementRef.current = img;
        bgGifFramesRef.current = null;
        setBgGifFrames(null);
        setBgImageUrl(prev => {
          if (prev) revokeTrackedURL(prev);
          return url;
        });
        const currentNote = parsedDataRef.current?.notes.find(n => currentTime >= n.startTime && currentTime < n.startTime + n.duration);
        drawCanvas(currentMouth, currentTime, currentNote ? currentNote.cleanedLyric : '');
      };
      img.src = url;
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30 overflow-hidden">
      {/* Header */}
      <header className="flex-none h-16 w-full backdrop-blur-md bg-zinc-950/80 border-b border-zinc-800 z-40">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Music className="w-6 h-6 text-indigo-400" />
            <span className="font-semibold text-zinc-100">{t.title}</span>
          </div>
          <div className="flex items-center space-x-4">
            <button onClick={() => setShowModal(true)} className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
              {t.language}
            </button>
            <button onClick={() => setShowModal(true)} className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
              {t.notice}
            </button>
          </div>
        </div>
      </header>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-6 space-y-6">
              <div className="space-y-2 text-center">
                <h3 className="text-xl font-semibold text-zinc-100">{t.language}</h3>
                <div className="flex justify-center space-x-2">
                  {(['zh', 'en', 'ja'] as Language[]).map(lang => (
                    <button
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        language === lang 
                          ? 'bg-indigo-500 text-white' 
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      {lang === 'zh' ? '中文' : lang === 'en' ? 'English' : '日本語'}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-zinc-100 text-center">{t.noticeTitle}</h3>
                <div className="h-40 bg-zinc-950 rounded-lg p-4 overflow-y-auto border border-zinc-800 text-sm text-zinc-400">
                  {t.noticeContent}
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-zinc-950/50 border-t border-zinc-800">
              <button
                onClick={handleCloseModal}
                className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors"
              >
                {t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Console */}
        <div className="w-[60%] h-full overflow-y-auto p-8 space-y-12 custom-scrollbar">
          
          {/* Header */}
          <header className="space-y-4 text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">
              {t.title}
            </h1>
            <p className="text-zinc-400 text-lg">
              {t.subtitle}
            </p>
          </header>

        {/* Step 1: Actors */}
        <section className="space-y-6">
          <div className="flex items-center space-x-3 border-b border-zinc-800 pb-4">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">1</div>
            <h2 className="text-2xl font-semibold">{t.step1}</h2>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
            {mouthShapeConfigs.map((config) => (
              <label key={config.id} className={`
                relative flex flex-col items-center justify-center aspect-square rounded-2xl border-2 border-dashed cursor-pointer overflow-hidden transition-all
                ${config.bg}
              `}>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => handleMouthImageUpload(config.id, e)}
                />
                {mouthImages[config.id] ? (
                  <img src={mouthImages[config.id]} alt={config.label} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center space-y-2 z-10">
                    <UploadCloud className={`w-8 h-8 ${config.color} opacity-70`} />
                    <span className={`font-medium ${config.color}`}>{config.label}</span>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm p-2 text-center text-xs font-medium text-white/90 translate-y-full hover:translate-y-0 transition-transform">
                  {t.clickToChange}
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Custom Overrides */}
        {uniqueLyrics.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                  <Settings className="w-4 h-4" />
                </div>
                <h2 className="text-2xl font-semibold">{t.specialLyrics}</h2>
              </div>
              <span className="text-sm text-zinc-400">{t.detectedSounds.replace('{count}', uniqueLyrics.length.toString())}</span>
            </div>
            
            <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {uniqueLyrics.map((lyric) => {
                const baseShape = getMouthShape(lyric);
                const hasOverride = !!overrideImages[lyric];
                const displayImg = hasOverride ? overrideImages[lyric] : mouthImages[baseShape];
                
                return (
                  <label key={lyric} className={`
                    relative flex flex-col items-center justify-center aspect-square rounded-xl border cursor-pointer overflow-hidden transition-all
                    ${hasOverride ? 'bg-purple-900/20 border-purple-500/50 hover:border-purple-400' : 'bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-500'}
                  `}>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleOverrideImageUpload(lyric, e)}
                    />
                    
                    {displayImg ? (
                      <img src={displayImg} alt={lyric} className={`absolute inset-0 w-full h-full object-contain ${!hasOverride ? 'opacity-50 grayscale' : ''}`} />
                    ) : (
                      <span className="text-2xl font-bold text-zinc-700">{lyric}</span>
                    )}
                    
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 backdrop-blur text-[10px] font-bold text-white rounded">
                      {lyric}
                    </div>
                    
                    {!hasOverride && (
                      <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-zinc-800/80 backdrop-blur text-[8px] font-mono text-zinc-400 rounded">
                        {baseShape}
                      </div>
                    )}
                    
                    <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-xs font-medium text-white">{hasOverride ? t.change : t.override}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>
        )}

        {/* Step 2: Script & Assets */}
        <section className="space-y-6">
          <div className="flex items-center space-x-3 border-b border-zinc-800 pb-4">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">2</div>
            <h2 className="text-2xl font-semibold">{t.step2}</h2>
          </div>
          
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* UST Upload */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative group cursor-pointer flex flex-col items-center justify-center 
                w-full h-48 rounded-3xl border-2 border-dashed transition-all duration-300 ease-out
                ${isDragging 
                  ? 'border-emerald-500 bg-emerald-500/10 scale-[1.02]' 
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900'}
              `}
            >
              <input type="file" ref={fileInputRef} onChange={(e) => e.target.files && handleFile(e.target.files[0])} accept=".ust" className="hidden" />
              <div className="flex flex-col items-center space-y-4 pointer-events-none">
                <div className={`p-4 rounded-full transition-colors duration-300 ${isDragging ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700 group-hover:text-zinc-300'}`}>
                  <FileText className="w-8 h-8" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-lg font-medium text-zinc-200">
                    {fileName ? `${t.selected}${fileName}` : t.uploadUst}
                  </p>
                  <p className="text-sm text-zinc-500">{t.uploadUstDesc}</p>
                </div>
              </div>
            </div>

            {/* Audio Upload */}
            <label className="relative group cursor-pointer flex flex-col items-center justify-center w-full h-48 rounded-3xl border-2 border-dashed border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900 transition-all duration-300 ease-out">
              <input type="file" accept="audio/*" onChange={handleAudioUpload} className="hidden" />
              <div className="flex flex-col items-center space-y-4 pointer-events-none">
                <div className="p-4 rounded-full bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700 group-hover:text-zinc-300 transition-colors duration-300">
                  <Music className="w-8 h-8" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-lg font-medium text-zinc-200">
                    {audioUrl ? t.audioUploaded : t.uploadAudio}
                  </p>
                  <p className="text-sm text-zinc-500">{t.uploadAudioDesc}</p>
                </div>
              </div>
              {audioUrl && <audio ref={audioRef} src={audioUrl} className="hidden" />}
            </label>

            {/* Background Upload */}
            <label className="relative group cursor-pointer flex flex-col items-center justify-center w-full h-48 rounded-3xl border-2 border-dashed border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900 transition-all duration-300 ease-out overflow-hidden">
              <input type="file" accept="image/*" onChange={handleBgImageUpload} className="hidden" />
              {bgImageUrl ? (
                <img src={bgImageUrl} alt="Background" className="absolute inset-0 w-full h-full object-cover opacity-50" />
              ) : null}
              <div className="flex flex-col items-center space-y-4 z-10 pointer-events-none">
                <div className="p-4 rounded-full bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700 group-hover:text-zinc-300 transition-colors duration-300">
                  <Layers className="w-8 h-8" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-lg font-medium text-zinc-200">
                    {bgImageUrl ? t.bgUploaded : t.uploadBg}
                  </p>
                  <p className="text-sm text-zinc-500">{t.uploadBgDesc}</p>
                </div>
              </div>
            </label>
          </div>

          {error && (
            <div className="flex items-center space-x-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}
        </section>

        {/* Data Table */}
        {parsedData && (
          <section className="space-y-4">
            <details className="group rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden shadow-xl">
              <summary className="list-none [&::-webkit-details-marker]:hidden px-6 py-4 font-medium text-zinc-300 cursor-pointer hover:bg-zinc-800/50 transition-colors flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-zinc-400" />
                  <span>{t.parsedData.replace('{count}', parsedData.notes.length.toString())}</span>
                </div>
                <span className="text-zinc-500 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="overflow-x-auto custom-scrollbar max-h-[400px] border-t border-zinc-800">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-zinc-900/80 sticky top-0 z-10 backdrop-blur-sm border-b border-zinc-800">
                    <tr>
                      <th className="px-6 py-4 font-medium text-zinc-400 w-24">{t.index}</th>
                      <th className="px-6 py-4 font-medium text-zinc-400">{t.originalLyric}</th>
                      <th className="px-6 py-4 font-medium text-zinc-400">{t.cleanedLyric}</th>
                      <th className="px-6 py-4 font-medium text-zinc-400">{t.mappedMouth}</th>
                      <th className="px-6 py-4 font-medium text-zinc-400 text-right">Start (ms)</th>
                      <th className="px-6 py-4 font-medium text-zinc-400 text-right">Duration (ms)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {parsedData.notes.map((note, idx) => {
                      const isCurrent = currentTime >= note.startTime && currentTime < note.startTime + note.duration;
                      return (
                        <tr key={idx} className={`transition-colors ${isCurrent ? 'bg-indigo-500/20' : 'hover:bg-zinc-800/30'}`}>
                          <td className="px-6 py-3 font-mono text-zinc-500">[{note.index}]</td>
                          <td className="px-6 py-3 text-zinc-300">{note.originalLyric}</td>
                          <td className="px-6 py-3">
                            <input
                              type="text"
                              value={note.cleanedLyric}
                              onChange={(e) => handleLyricChange(idx, e.target.value)}
                              className="w-20 bg-zinc-950/50 border border-zinc-700/50 rounded px-2 py-1 text-indigo-300 font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                            />
                          </td>
                          <td className="px-6 py-3">
                            <span className="px-2 py-1 rounded bg-zinc-800 text-zinc-300 font-mono text-xs">
                              {getMouthShape(note.cleanedLyric)}
                            </span>
                          </td>
                          <td className="px-6 py-3 font-mono text-zinc-400 text-right">{note.startTime.toFixed(2)}</td>
                          <td className="px-6 py-3 font-mono text-zinc-400 text-right">{note.duration.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        )}
      </div>

      {/* Right Monitor */}
      <div className="w-[40%] h-full bg-zinc-900/30 border-l border-zinc-800 overflow-y-auto custom-scrollbar relative">
        <div className="sticky top-0 p-8 space-y-8">
          {/* Step 3: Monitor */}
          {parsedData ? (
            <section className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="flex items-center space-x-3 border-b border-zinc-800 pb-4">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">3</div>
              <h2 className="text-2xl font-semibold">{t.step3}</h2>
            </div>
            
            <div className="flex flex-col items-center space-y-8">
              {/* Canvas Container */}
              <div className="relative w-full max-w-2xl aspect-video rounded-3xl border-4 border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden flex items-center justify-center bg-checkered">
                <canvas 
                  ref={canvasRef} 
                  width={canvasSize.width} 
                  height={canvasSize.height} 
                  className="w-full h-full object-contain"
                />
                
                <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-xs font-mono text-white/80 z-10">
                  {currentMouth} | {canvasSize.width}x{canvasSize.height}
                </div>
                
                {isRecording && (
                  <div className="absolute top-4 left-4 flex items-center space-x-2 px-3 py-1 rounded-full bg-red-500/20 backdrop-blur-md border border-red-500/30 text-xs font-medium text-red-400 z-10">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span>REC</span>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex flex-col items-center space-y-6 w-full max-w-2xl">
                
                {/* Settings Row */}
                <div className="flex flex-wrap items-center justify-between w-full gap-4 bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                  <div className="flex items-center space-x-4">
                    <div className="flex flex-col space-y-1">
                      <label className="text-xs text-zinc-500 font-medium">{t.width}</label>
                      <input 
                        type="number" 
                        placeholder="Auto"
                        value={customWidth}
                        onChange={(e) => setCustomWidth(e.target.value)}
                        className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="flex flex-col space-y-1">
                      <label className="text-xs text-zinc-500 font-medium">{t.height}</label>
                      <input 
                        type="number" 
                        placeholder="Auto"
                        value={customHeight}
                        onChange={(e) => setCustomHeight(e.target.value)}
                        className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  
                  <div className="flex flex-col space-y-1">
                    <label className="text-xs text-zinc-500 font-medium">{t.audioOffset}</label>
                    <input 
                      type="number" 
                      value={audioOffset}
                      onChange={(e) => setAudioOffset(Number(e.target.value))}
                      className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Scrubber */}
                <div className="w-full space-y-2">
                  <div className="flex justify-between text-sm font-mono text-zinc-400">
                    <span>{formatTime(currentTime)}</span>
                    <span>{parsedData.notes.length > 0 ? formatTime(parsedData.notes[parsedData.notes.length - 1].startTime + parsedData.notes[parsedData.notes.length - 1].duration) : '00:00.000'}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max={parsedData.notes.length > 0 ? parsedData.notes[parsedData.notes.length - 1].startTime + parsedData.notes[parsedData.notes.length - 1].duration : 0} 
                    step="1"
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-between w-full">
                  <button 
                    onClick={togglePlay}
                    className="flex items-center justify-center w-14 h-14 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white shadow-lg transition-all active:scale-95"
                  >
                    {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
                  </button>
                  
                  <div className="flex items-center space-x-2">
                    <select 
                      value={exportFormat} 
                      onChange={(e) => setExportFormat(e.target.value as any)}
                      className="h-14 px-4 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      disabled={isRecording || isExporting}
                    >
                      <option value="webm">{t.webmDesc}</option>
                      <option value="mp4">{t.mp4Desc}</option>
                      <option value="mov">{t.movDesc}</option>
                      <option value="mkv">{t.mkvDesc}</option>
                      <option value="gif">{t.gifDesc}</option>
                    </select>

                    <button 
                      onClick={startRecording}
                      disabled={isRecording || isExporting}
                      className={`flex items-center justify-center px-6 h-14 rounded-xl font-medium shadow-lg transition-all active:scale-95 space-x-2
                        ${(isRecording || isExporting)
                          ? 'bg-indigo-600/50 text-white/50 cursor-not-allowed' 
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'}`}
                    >
                      {isExporting ? <Download className="w-5 h-5 animate-bounce" /> : <Video className="w-5 h-5" />}
                      <span>
                        {isRecording ? t.recording : isExporting ? `${t.exporting} ${exportProgress}%` : t.exportVideo}
                      </span>
                    </button>
                  </div>
                </div>
                
                {ffmpegError && (
                  <div className="text-sm text-amber-500/80 text-center">
                    {ffmpegError}
                  </div>
                )}
              </div>
            </div>
          </section>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-zinc-500 space-y-4">
              <Video className="w-16 h-16 opacity-20" />
              <p>{t.noUstLoaded}</p>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
