import React, { useState, useRef, useEffect, DragEvent, ChangeEvent } from 'react';
import { UploadCloud, FileText, AlertCircle, Clock, Music, Play, Pause, Image as ImageIcon, Video, Download, Settings, Layers, X, Globe, Sun, Moon, Github } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import { parseGIF, decompressFrames } from 'gifuct-js';
import yaml from 'js-yaml';
import Encoding from 'encoding-japanese';
import { DragDropWrapper } from './components/DragDropWrapper';

interface NoteData {
  index: number;
  originalLyric: string;
  lyric: string;
  length: number;
  startTimeMs: number;
  durationMs: number;
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
    subtitle: "支持UST/USTX/VSQX文件",
    language: "语言",
    notice: "须知",
    noticeTitle: "使用须知",
    noticeContent: "26/4/19更新：现在也支持导入ustx/vsqx文件了！另外还做了一点ui优化。\n26/3/22更新：现在可以进入全屏模式直接录屏了，移动端导出失败可以试试这么做。\n\n针对日语UST做的，什么类型的UST都能用。其它语言的UST理论上也可以用，但嘴型只能用单字覆盖一个个传。需要忽略嘴型设置里的五个元音。\n受性能限制，不建议在移动端浏览器使用。\n可以从bowlroll等地找到各种公开配布的UST文件，发布使用他人UST制作的内容时需要标注原作者。\n有什么问题可以联系我 -> \nB站：UID 487559302\nemail: riciwaaaa@gmail.com\n",
    confirm: "确认",
    step1: "嘴型设置",
    step2: "UST/音频/背景图",
    step3: "监视器与导出",
    uploadUst: "导入 .ust 文件",
    uploadUstDesc: "生成时间轴",
    uploadAudio: "导入音频 (可选)",
    audioUploaded: "已导入音频",
    uploadAudioDesc: "同步播放与导出",
    uploadBg: "导入背景图/视频 (可选)",
    bgUploaded: "已导入背景",
    solidBg: "纯色背景",
    uploadBgDesc: "底层图层",
    customSize: "自定义画布尺寸",
    width: "画布宽度",
    height: "画布高度",
    audioOffset: "延时补正 (s)",
    exportFormat: "导出格式",
    exporting: "转换中",
    recording: "录制中...",
    exportVideo: "导出视频",
    fullscreenMode: "🖥️ 全屏录制模式 (Fullscreen)",
    fullscreenHint: "点击屏幕或按空格键开始播放",
    popOut: "⧉ 弹出预览",
    popOutUnsupported: "浏览器不支持弹出窗口",
    envWarning: "检测到您正在使用移动端或内置浏览器。由于视频渲染需要耗费大量内存，极易导致崩溃，强烈建议您复制网址到 PC 端浏览器中进行导出操作！",
    longVideoWarning: "检测到视频长度超过5分钟。长视频导出可能会消耗极长的时间和极高的内存，存在崩溃风险。是否继续？",
    webmWarning: "提示：WebM 透明格式将采用【实时录制】方案以防止内存溢出。导出期间请勿切换标签页或最小化浏览器。",
    webmGifWarning: "注意：当背景为 GIF 格式时，导出 WebM 可能无法保留透明通道。如需透明背景，建议使用静态图片背景或导出 GIF 格式。",
    recordingWebM: "正在实时录制画面...",
    muxingAudio: "正在合成音频...",
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
    noUstLoaded: "请先导入 UST/VSQX 文件",
    ffmpegNotLoaded: "FFmpeg 加载失败。请检查网络连接或刷新重试。",
    ffmpegNotLoadedAlert: "FFmpeg 未加载，无法导出视频。请检查网络连接或刷新重试。",
    conversionFailed: "转换失败: ",
    gifParseFailed: "GIF 解析失败",
    parseError: "解析文件时发生错误，请检查文件格式。",
    fileReadError: "文件读取失败",
    invalidUst: "请上传有效的 .ust, .ustx 或 .vsqx 文件",
    selectTrack: "选择要导入的轨道",
    selectTrackDesc: "检测到工程中包含多条轨道，请选择要导入的主轨道：",
    parsedData: "解析数据 ({count} notes)",
    index: "序号",
    originalLyric: "原始歌词",
    lyric: "歌词",
    mappedMouth: "口型映射",
    startTimeMsFormatted: "开始时间",
    startTimeMsRaw: "开始时间 (ms)",
    webmDesc: "WebM (支持透明)",
    mp4Desc: "MP4 (H.264)",
    movDesc: "MOV (H.264)",
    mkvDesc: "MKV (H.264)",
    gifDesc: "GIF (无音频)",
    selected: "已选择: ",
    notIsolatedError: "环境未开启跨域隔离 (Cross-Origin Isolated)，FFmpeg 无法加载。请检查部署配置 (如 vercel.json)。",
    renderingFrames: "正在渲染帧",
    encodingVideo: "正在编码视频...",
    cloudFileTip: "提示: 无法读取文件，这可能是因为您选择了网盘中的文件，或是未解压的压缩包中的文件。请将文件复制到本地文件夹后再导入。",
    exportErrMimeType: "当前浏览器不支持直接导出此格式，请尝试更换导出格式，或使用 Chrome / Edge 浏览器重试。",
    exportErrFs: "文件处理异常，可能是因为处理速度过快或缓存出错。请刷新页面后重试。",
    exportErrMemory: "设备内存不足。视频渲染需要耗费大量内存，强烈建议关闭其他多余网页，或改用电脑端浏览器进行导出。",
    exportErrSab: "您的浏览器环境不支持高性能多线程渲染。请更换为最新的 PC 端 Chrome 或 Edge 浏览器。",
    exportErrGeneric: "导出失败，发生异常。请尝试刷新页面、更换导出格式，或使用全屏录制作为备用方案。错误详情：{error}",
  },
  en: {
    title: "UST Lip Sync Generator",
    subtitle: "Supports UST/USTX/VSQX files",
    language: "Language",
    notice: "Notice",
    noticeTitle: "Usage Notice",
    noticeContent: "26/4/19 Update: Now supports importing .ustx and .vsqx files! We've also made a few UI improvements.\n26/3/22 Update: You can now enter fullscreen mode to record your screen directly. If exporting fails on mobile, you can try this method.\n\nDesigned for Japanese USTs, but any type of UST will work. USTs in other languages can theoretically be used, but mouth shapes must be uploaded one by one using the single-character override feature. You will need to ignore the five basic vowel settings.\nDue to performance limitations, using this tool on mobile browsers is highly not recommended. \nYou can find various publicly distributed UST files on sites like BowlRoll. Please note that when publishing content made using someone else's UST, you must credit the original author.\nIf you have any questions or feedback, feel free to contact me -> \nemail: riciwaaaa@gmail.com",
    confirm: "Confirm",
    step1: "Mouth Shapes",
    step2: "UST(X) / Audio / Background",
    step3: "Monitor & Export",
    uploadUst: "Import Project",
    uploadUstDesc: ".ust / .ustx / .vsqx",
    uploadAudio: "Import Audio (Optional)",
    audioUploaded: "Audio Imported",
    uploadAudioDesc: "Sync playback & export",
    uploadBg: "Import Background (Optional)",
    bgUploaded: "Background Imported",
    solidBg: "Solid Background",
    uploadBgDesc: "Bottom layer",
    customSize: "Custom Canvas Size",
    width: "Canvas Width",
    height: "Canvas Height",
    audioOffset: "Audio Offset (s)",
    exportFormat: "Export Format",
    exporting: "Converting",
    recording: "Recording...",
    exportVideo: "Export Video",
    fullscreenMode: "🖥️ Fullscreen Preview",
    fullscreenHint: "Click or press Space to play",
    popOut: "⧉ Pop Out",
    popOutUnsupported: "Browser does not support pop-out",
    envWarning: "Mobile or in-app browser detected. Video rendering consumes a lot of memory and may crash. It is highly recommended to copy the URL to a PC browser for exporting!",
    longVideoWarning: "Video length exceeds 5 minutes. Exporting long videos may take a very long time and consume high memory, risking a crash. Continue?",
    webmWarning: "Note: WebM format uses real-time recording to prevent memory issues. Please do not switch tabs or minimize the browser during export.",
    webmGifWarning: "Note: When the background is a GIF, exporting to WebM may not preserve the transparent channel. For a transparent background, it's recommended to use a static image background or export as GIF.",
    recordingWebM: "Recording real-time...",
    muxingAudio: "Muxing audio...",
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
    noUstLoaded: "Please import a UST/VSQX file first",
    ffmpegNotLoaded: "FFmpeg load failed. Please check your network or refresh.",
    ffmpegNotLoadedAlert: "FFmpeg not loaded. Cannot export video. Please check your network or refresh.",
    conversionFailed: "Conversion failed: ",
    gifParseFailed: "Failed to parse GIF",
    parseError: "Error parsing file, please check the format.",
    fileReadError: "Failed to read file",
    invalidUst: "Please upload a valid .ust, .ustx or .vsqx file",
    selectTrack: "Select Track to Import",
    selectTrackDesc: "Multiple tracks detected. Please select the main track to import:",
    parsedData: "Parsed Data ({count} notes)",
    index: "Index",
    originalLyric: "Original Lyric",
    lyric: "Lyric",
    mappedMouth: "Mapped Mouth",
    startTimeMsFormatted: "Start Time",
    startTimeMsRaw: "Start Time (ms)",
    webmDesc: "WebM (Supports Transparency)",
    mp4Desc: "MP4 (H.264)",
    movDesc: "MOV (H.264)",
    mkvDesc: "MKV (H.264)",
    gifDesc: "GIF (No Audio)",
    selected: "Selected: ",
    notIsolatedError: "Environment is not cross-origin isolated. FFmpeg cannot load. Please check your deployment settings (e.g., vercel.json).",
    renderingFrames: "Rendering frames",
    encodingVideo: "Encoding video...",
    cloudFileTip: "Tip: Unable to read the file. This may be because you selected a file located on a cloud drive or within an unextracted archive. Please copy the file to a local folder before importing.",
    exportErrMimeType: "This export format is not supported by your browser. Try a different format or use Chrome / Edge.",
    exportErrFs: "File processing error, possibly due to a cache issue. Please refresh the page and try again.",
    exportErrMemory: "Device is low on memory. Close other tabs or switch to a PC browser for exporting.",
    exportErrSab: "Your browser does not support high-performance multi-threaded rendering. Please use the latest Chrome or Edge on PC.",
    exportErrGeneric: "Export failed. Try refreshing the page, switching export format, or using Fullscreen mode as a fallback. Error: {error}",
  },
  ja: {
    title: "USTリップシンクジェネレーター",
    subtitle: "UST/USTX/VSQXファイルに対応",
    language: "言語",
    notice: "注意事項",
    noticeTitle: "注意事項",
    noticeContent: "26/4/19 アップデート: 新たに .ustx および .vsqx ファイルのインポートに対応しました！また、UIも少し使いやすく改善しています。/n26/3/22 アップデート: フルスクリーンモードに入って直接画面録画ができるようになりました。モバイル端末でエクスポートに失敗する場合は、この方法をお試しください。\n\n日本語のUST向けに作られていますが、どの種類のUSTでも使用可能です。他言語のUSTも理論上は使用できますが、口の形は「単字特例（個別の文字の上書き）」機能を使って一つずつアップロードする必要があります。その場合、基本設定の5つの母音は無視してください。\nパフォーマンスの制限により、スマートフォンなどのモバイルブラウザでの使用は推奨していません（PC環境を推奨します）。\nBowlRollなどのサイトで、公開・配布されている様々なUSTファイルを見つけることができます。他の方が作成したUSTを使用して動画などの制作物を公開する際は、必ず原作者のクレジット（お名前）を表記してください。\nご質問や不具合の報告があれば、こちらまでご連絡ください -> \nemail: riciwaaaa@gmail.com",
    confirm: "確認",
    step1: "口パク設定",
    step2: "UST(X) / 音声 / 背景",
    step3: "モニターと出力",
    uploadUst: "プロジェクトをインポート",
    uploadUstDesc: ".ust / .ustx / .vsqx",
    uploadAudio: "音声をインポート (任意)",
    audioUploaded: "音声インポート済み",
    uploadAudioDesc: "同期再生と出力",
    uploadBg: "背景をインポート (任意)",
    bgUploaded: "背景インポート済み",
    solidBg: "単色背景",
    uploadBgDesc: "最背面レイヤー",
    customSize: "キャンバスサイズ",
    width: "幅",
    height: "高さ",
    audioOffset: "音声オフセット (s)",
    exportFormat: "出力形式",
    exporting: "変換中",
    recording: "録画中...",
    exportVideo: "動画を出力",
    fullscreenMode: "🖥️ フルスクリーン録画 (Fullscreen)",
    fullscreenHint: "画面をクリックするか、スペースキーを押して再生",
    popOut: "⧉ ポップアウト",
    popOutUnsupported: "ブラウザはポップアウトをサポートしていません",
    envWarning: "モバイル端末またはアプリ内ブラウザが検出されました。動画のレンダリングには大量のメモリを消費し、クラッシュする可能性が高いため、PCブラウザにURLをコピーしてエクスポートすることを強くお勧めします！",
    longVideoWarning: "動画の長さが5分を超えています。長時間の動画出力は非常に時間がかかり、メモリを大量に消費するため、クラッシュする危険性があります。続行しますか？",
    webmWarning: "注：WebM形式はメモリ不足を防ぐためリアルタイム録画を使用します。エクスポート中はタブを切り替えたり、ブラウザを最小化したりしないでください。",
    webmGifWarning: "注意：背景がGIF形式の場合、WebMにエクスポートすると透明チャンネルが保持されない場合があります。透明な背景が必要な場合は、静止画像を使用するか、GIF形式でエクスポートすることをお勧めします。",
    recordingWebM: "リアルタイム録画中...",
    muxingAudio: "音声を合成中...",
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
    noUstLoaded: "UST/VSQXファイルをインポートしてください",
    ffmpegNotLoaded: "FFmpegの読み込みに失敗しました。ネットワークを確認するか、リロードしてください。",
    ffmpegNotLoadedAlert: "FFmpegが読み込まれていません。動画を出力できません。ネットワークを確認するか、リロードしてください。",
    conversionFailed: "変換失敗: ",
    gifParseFailed: "GIFの解析に失敗しました",
    parseError: "ファイルの解析中にエラーが発生しました。フォーマットを確認してください。",
    fileReadError: "ファイルの読み込みに失敗しました",
    invalidUst: "有効な .ust, .ustx または .vsqx ファイルをアップロードしてください",
    selectTrack: "インポートするトラックを選択",
    selectTrackDesc: "複数のトラックが検出されました。インポートするメイントラックを選択してください：",
    parsedData: "解析データ ({count} notes)",
    index: "番号",
    originalLyric: "元の歌詞",
    lyric: "歌詞",
    mappedMouth: "割り当てられた口の形",
    startTimeMsFormatted: "開始時間",
    startTimeMsRaw: "開始時間 (ms)",
    webmDesc: "WebM (透過対応)",
    mp4Desc: "MP4 (H.264)",
    movDesc: "MOV (H.264)",
    mkvDesc: "MKV (H.264)",
    gifDesc: "GIF (音声なし)",
    selected: "選択中: ",
    notIsolatedError: "環境がクロスオリジン分離(Cross-Origin Isolated)されていません。FFmpegを読み込めません。デプロイ設定(vercel.jsonなど)を確認してください。",
    renderingFrames: "フレームをレンダリング中",
    encodingVideo: "動画をエンコード中...",
    cloudFileTip: "注意：ファイルを読み込めません。クラウドドライブ上のファイル、または未解凍の圧縮ファイル内のファイルを選択した可能性があります。ファイルをローカルフォルダにコピーしてからインポートしてください。",
    exportErrMimeType: "このブラウザはこの形式の直接エクスポートに対応していません。形式を変えるか、Chrome / Edge をお試しください。",
    exportErrFs: "ファイル処理中にエラーが発生しました。ページを更新して再試行してください。",
    exportErrMemory: "デバイスのメモリが不足しています。不要なタブを閉じるか、PCブラウザを使用してエクスポートしてください。",
    exportErrSab: "お使いのブラウザ環境は高性能なマルチスレッドレンダリングに対応していません。最新のPC版Chrome / Edgeをお使いください。",
    exportErrGeneric: "エクスポートに失敗しました。ページを更新して再試行するか、エクスポート形式を変更するか、全画面録画をお試しください。エラー: {error}",
  }
};

const isFragileEnvironment = () => {
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isInApp = /FBAN|FBAV|Twitter|Line|MicroMessenger|Instagram/i.test(ua);
  // isSafari (desktop macOS) removed — iOS is already caught by isIOS, and desktop
  // Safari doesn't have the same memory constraints that justify blocking the export flow.
  return isIOS || isInApp;
};

const getMouthShapeConfigs = (t: any): { id: MouthShape; label: string; color: string; bg: string; canvasBg: string; canvasColor: string }[] => [
  { id: 'a', label: t.mouthA, color: 'text-red-600', bg: 'bg-red-500/20 border-red-500/30 hover:bg-red-500/30', canvasBg: 'rgba(239, 68, 68, 0.2)', canvasColor: 'rgba(248, 113, 113, 0.5)' },
  { id: 'i', label: t.mouthI, color: 'text-blue-600', bg: 'bg-blue-500/20 border-blue-500/30 hover:bg-blue-500/30', canvasBg: 'rgba(59, 130, 246, 0.2)', canvasColor: 'rgba(96, 165, 250, 0.5)' },
  { id: 'u', label: t.mouthU, color: 'text-green-600', bg: 'bg-green-500/20 border-green-500/30 hover:bg-green-500/30', canvasBg: 'rgba(34, 197, 94, 0.2)', canvasColor: 'rgba(74, 222, 128, 0.5)' },
  { id: 'e', label: t.mouthE, color: 'text-yellow-600', bg: 'bg-yellow-500/20 border-yellow-500/30 hover:bg-yellow-500/30', canvasBg: 'rgba(234, 179, 8, 0.2)', canvasColor: 'rgba(250, 204, 21, 0.5)' },
  { id: 'o', label: t.mouthO, color: 'text-purple-600', bg: 'bg-purple-500/20 border-purple-500/30 hover:bg-purple-500/30', canvasBg: 'rgba(168, 85, 247, 0.2)', canvasColor: 'rgba(192, 132, 252, 0.5)' },
  { id: 'default', label: t.mouthDefault, color: 'text-zinc-700', bg: 'bg-zinc-200/50 border-zinc-300 hover:bg-zinc-200/70', canvasBg: 'rgba(63, 63, 70, 0.5)', canvasColor: 'rgba(212, 212, 216, 0.5)' },
];

export interface GifFrame {
  canvas: HTMLCanvasElement;
  delay: number;
}

const parseGifFile = async (file: File, maxDimension: number = 800): Promise<GifFrame[]> => {
  const buffer = await file.arrayBuffer();
  const gif = parseGIF(buffer);
  const frames = decompressFrames(gif, true);
  
  const width = gif.lsd.width;
  const height = gif.lsd.height;
  
  let scale = 1;
  if (width > maxDimension || height > maxDimension) {
    scale = Math.min(maxDimension / width, maxDimension / height);
  }
  
  const targetWidth = Math.floor(width * scale);
  const targetHeight = Math.floor(height * scale);
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  if (!tempCtx) throw new Error("Could not get 2d context");
  
  let gifCanvasData: GifFrame[] = [];
  let previousImageData: ImageData | null = null;
  
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const dims = frame.dims;
    
    if (frame.disposalType === 3) {
      previousImageData = tempCtx.getImageData(0, 0, width, height);
    }
    
    if (dims.width > 0 && dims.height > 0) {
      const patchData = new ImageData(
        new Uint8ClampedArray(frame.patch),
        dims.width,
        dims.height
      );
      
      const patchCanvas = document.createElement('canvas');
      patchCanvas.width = dims.width;
      patchCanvas.height = dims.height;
      patchCanvas.getContext('2d')!.putImageData(patchData, 0, 0);
      
      tempCtx.drawImage(patchCanvas, dims.left, dims.top);
    }
    
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = targetWidth;
    frameCanvas.height = targetHeight;
    const frameCtx = frameCanvas.getContext('2d')!;
    if (scale === 1) {
      frameCtx.drawImage(tempCanvas, 0, 0);
    } else {
      frameCtx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
    }
    
    gifCanvasData.push({
      canvas: frameCanvas,
      delay: Math.max(frame.delay, 20)
    });
    
    if (frame.disposalType === 2) {
      tempCtx.clearRect(dims.left, dims.top, dims.width, dims.height);
    } else if (frame.disposalType === 3 && previousImageData) {
      tempCtx.putImageData(previousImageData, 0, 0);
    }
  }
  return gifCanvasData;
};

export default function App() {
  const [language, setLanguage] = useState<Language>('zh');
  const languageRef = useRef<Language>('zh');
  useEffect(() => { languageRef.current = language; }, [language]);
  const [showModal, setShowModal] = useState(false);

  // ------------------------------------------------------------------------
  // 新增：深色/浅色模式 (Dark/Light Mode)
  // ------------------------------------------------------------------------
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(prev => !prev);
  // ------------------------------------------------------------------------

  const [ustxData, setUstxData] = useState<any>(null);
  const [vsqxData, setVsqxData] = useState<{ bpm: number, resolution: number } | null>(null);
  const [trackOptions, setTrackOptions] = useState<{ id: number, name: string, notesCount: number, part: any, format: 'ustx'|'vsqx' }[]>([]);
  const [showTrackSelector, setShowTrackSelector] = useState(false);

  useEffect(() => {
    const hasSeenNotice = localStorage.getItem('hasSeenNotice');
    if (!hasSeenNotice || hasSeenNotice === 'false') {
      setShowModal(true);
      localStorage.setItem('hasSeenNotice', 'true');
    }
  }, []);

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const t = i18n[language];
  const mouthShapeConfigs = getMouthShapeConfigs(t);

  const [parsedData, setParsedData] = useState<ParsedUst | null>(null);
  const parsedDataRef = useRef<ParsedUst | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 播放器与画布状态
  const [mouthImages, setMouthImages] = useState<Record<MouthShape, string>>({ a: '', i: '', u: '', e: '', o: '', default: '' });
  const mouthImageElementsRef = useRef<Record<MouthShape, HTMLImageElement | null>>({ a: null, i: null, u: null, e: null, o: null, default: null });
  const mouthGifFramesRef = useRef<Record<MouthShape, GifFrame[] | null>>({ a: null, i: null, u: null, e: null, o: null, default: null });
  
  // 新增：单字特例覆盖状态
  const [uniqueLyrics, setUniqueLyrics] = useState<string[]>([]);
  const [overrideImages, setOverrideImages] = useState<Record<string, string>>({});
  const overrideImageElementsRef = useRef<Record<string, HTMLImageElement | null>>({});
  const overrideGifFramesRef = useRef<Record<string, GifFrame[] | null>>({});

  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenHint, setShowFullscreenHint] = useState(false);
  const hintTimeoutRef = useRef<number | null>(null);
  const [isPoppedOut, setIsPoppedOut] = useState(false);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);

  const [canvasSize, setCanvasSize] = useState({ width: 512, height: 512 });
  const isFirstImageRef = useRef(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentMouth, setCurrentMouth] = useState<MouthShape>('default');
  
  const reqRef = useRef<number | null>(null);
  const startTimeMsRef = useRef<number>(0);

  // 录制状态
  const [exportStatus, setExportStatus] = useState('');
  const isExportingRef = useRef(false);
  const audioFileRef = useRef<File | null>(null);

  // 新增：音频、背景、FFmpeg 导出状态
  const [audioUrl, setAudioUrl] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [bgImageUrl, setBgImageUrl] = useState<string>('');
  const bgImageElementRef = useRef<HTMLImageElement | null>(null);
  
  // GIF 背景状态
  const [bgGifFrames, setBgGifFrames] = useState<GifFrame[] | null>(null);
  const bgGifFramesRef = useRef<GifFrame[] | null>(null);
  
  // 新增：纯色背景状态
  const [backgroundColor, setBackgroundColor] = useState<string | null>(null);
  const backgroundColorRef = useRef<string | null>(null);
  
  // 新增：自定义宽高和音频偏移
  const [customWidth, setCustomWidth] = useState<string>('');
  const [customHeight, setCustomHeight] = useState<string>('');
  const [audioOffset, setAudioOffset] = useState<number>(0);
  const audioOffsetRef = useRef<number>(0);
  const trackedUrlsRef = useRef<Set<string>>(new Set());

  // ------------------------------------------------------------------------
  // 新增：响应式与面板拖拽状态 (Resizable Divider)
  // ------------------------------------------------------------------------
  const [panelRatio, setPanelRatio] = useState(60); // 默认比例 6:4 (60% left, 40% right)
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const [isPortraitTheme, setIsPortraitTheme] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsPortraitTheme(window.innerHeight >= window.innerWidth);
    window.addEventListener('resize', handleResize);
    handleResize(); // 初始校验
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isDraggingDivider) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      // 移动端拖拽时不希望页面滚动
      if (e.cancelable && e.type === 'touchmove') e.preventDefault();
      
      if (!mainContainerRef.current) return;
      const rect = mainContainerRef.current.getBoundingClientRect();
      
      let clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      let clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

      let newRatio;
      if (isPortraitTheme) {
        newRatio = ((clientY - rect.top) / rect.height) * 100;
      } else {
        newRatio = ((clientX - rect.left) / rect.width) * 100;
      }

      newRatio = Math.max(20, Math.min(80, newRatio)); // 限制在 20% - 80% 之间
      setPanelRatio(newRatio);
    };

    const handleEnd = () => setIsDraggingDivider(false);

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDraggingDivider, isPortraitTheme]);
  // ------------------------------------------------------------------------

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
    const handleFullscreenChange = () => {
      const isFS = !!document.fullscreenElement;
      setIsFullscreen(isFS);
      if (!isFS) {
        if (isPlayingRef.current) {
          setIsPlaying(false);
          isPlayingRef.current = false;
          if (reqRef.current) cancelAnimationFrame(reqRef.current);
          if (audioRef.current) audioRef.current.pause();
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    audioOffsetRef.current = audioOffset;
  }, [audioOffset]);

  useEffect(() => {
    backgroundColorRef.current = backgroundColor;
  }, [backgroundColor]);

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

    Object.values(mouthGifFramesRef.current).forEach((frames: any) => {
      if (frames && frames.length > 0) {
        hasMouthImage = true;
        maxWidth = Math.max(maxWidth, frames[0].canvas.width);
        maxHeight = Math.max(maxHeight, frames[0].canvas.height);
      }
    });

    Object.values(overrideImageElementsRef.current).forEach((img) => {
      if (img) {
        hasMouthImage = true;
        maxWidth = Math.max(maxWidth, (img as HTMLImageElement).naturalWidth);
        maxHeight = Math.max(maxHeight, (img as HTMLImageElement).naturalHeight);
      }
    });

    Object.values(overrideGifFramesRef.current).forEach((frames: any) => {
      if (frames && frames.length > 0) {
        hasMouthImage = true;
        maxWidth = Math.max(maxWidth, frames[0].canvas.width);
        maxHeight = Math.max(maxHeight, frames[0].canvas.height);
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
  
  const [exportFormat, setExportFormat] = useState<'webm' | 'mp4' | 'mov' | 'mkv' | 'gif'>('mp4');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const ffmpegRef = useRef(new FFmpeg());
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegError, setFfmpegError] = useState('');

  // 初始化 FFmpeg — runs once only; [language] caused re-init + listener stacking on lang switch
  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const ffmpeg = ffmpegRef.current;
        ffmpeg.on('progress', ({ progress }) => {
          if (isExportingRef.current) {
            setExportProgress(50 + Math.round(progress * 50));
          }
        });

        await ffmpeg.load({
          coreURL,
          wasmURL,
        });
        setFfmpegLoaded(true);
      } catch (err) {
        console.error('FFmpeg load error:', err);
        setFfmpegError(i18n[languageRef.current].ffmpegNotLoaded);
      }
    };
    loadFFmpeg();
  }, []);

  const handleExportError = (err: any) => {
    console.error("Export failed:", err);
    if (isExportingRef.current) {
      const errMsg = err?.message || err?.name || String(err);
      const tErr = i18n[languageRef.current];
      let userFriendlyMsg = "";

      if (errMsg.includes('mimeType is not supported')) {
        userFriendlyMsg = tErr.exportErrMimeType;
      } else if (errMsg.includes('FS error') || errMsg.includes('No such file')) {
        userFriendlyMsg = tErr.exportErrFs;
      } else if (errMsg.includes('memory') || errMsg.includes('out of bounds')) {
        userFriendlyMsg = tErr.exportErrMemory;
      } else if (errMsg.includes('SharedArrayBuffer')) {
        userFriendlyMsg = tErr.exportErrSab;
      } else {
        userFriendlyMsg = tErr.exportErrGeneric.replace('{error}', errMsg);
      }

      setFfmpegError(userFriendlyMsg);
    }
  };

  const drawCanvas = (mouth: MouthShape, time: number = currentTime, lyric: string = '', isExportingTransparent: boolean = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 核心：必须清空画布以支持透明通道
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 纯色垫底：仅在非透明导出且设置了背景色时绘制
    if (!isExportingTransparent) {
      const bgColor = backgroundColorRef.current;
      if (bgColor && bgColor !== 'transparent') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    // 绘制用户背景图层 (如果有)，始终执行
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
    let imgToDraw: HTMLImageElement | HTMLCanvasElement | null = null;
    
    const getGifFrame = (gifFrames: GifFrame[] | null, time: number) => {
      if (!gifFrames || gifFrames.length === 0) return null;
      let totalDuration = gifFrames.reduce((acc, f) => acc + f.delay, 0);
      if (totalDuration <= 0) return gifFrames[0].canvas;
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
      return currentFrame;
    };

    // 计算当前嘴型的局部时间 (localTime)，使得 GIF 每次出现都从头播放
    let localTime = time;
    const parsedData = parsedDataRef.current;
    if (parsedData) {
      const activeNote = parsedData.notes.find(n => time >= n.startTimeMs && time < n.startTimeMs + n.durationMs);
      if (activeNote) {
        localTime = time - activeNote.startTimeMs;
      } else {
        let prevNoteEndTime = 0;
        for (let i = parsedData.notes.length - 1; i >= 0; i--) {
          const noteEnd = parsedData.notes[i].startTimeMs + parsedData.notes[i].durationMs;
          if (noteEnd <= time) {
            prevNoteEndTime = noteEnd;
            break;
          }
        }
        localTime = time - prevNoteEndTime;
      }
    }

    if (lyric && overrideGifFramesRef.current[lyric]) {
      imgToDraw = getGifFrame(overrideGifFramesRef.current[lyric], localTime);
    } else if (lyric && overrideImageElementsRef.current[lyric]) {
      imgToDraw = overrideImageElementsRef.current[lyric];
    } else if (mouthGifFramesRef.current[mouth]) {
      imgToDraw = getGifFrame(mouthGifFramesRef.current[mouth], localTime);
    } else if (mouthImageElementsRef.current[mouth]) {
      imgToDraw = mouthImageElementsRef.current[mouth];
    } else if (mouthGifFramesRef.current['default']) {
      imgToDraw = getGifFrame(mouthGifFramesRef.current['default'], localTime);
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
      const currentNote = parsedDataRef.current?.notes.find(n => currentTime >= n.startTimeMs && currentTime < n.startTimeMs + n.durationMs);
      drawCanvas(currentMouth, currentTime, currentNote ? currentNote.lyric : '');
    }
  }, [canvasSize, currentMouth, isPlaying, currentTime, mouthImages, overrideImages]);

  const updateFrame = () => {
    const data = parsedDataRef.current;
    if (!data || !isPlayingRef.current) return;

    let newTime = 0;
    if (audioRef.current && audioUrl) {
      newTime = audioRef.current.currentTime * 1000;
    } else {
      const now = performance.now();
      newTime = now - startTimeMsRef.current;
    }
    
    if (newTime < 0) newTime = 0;
    
    const lastNote = data.notes[data.notes.length - 1];
    const totalDuration = lastNote ? lastNote.startTimeMs + lastNote.durationMs : 0;

    if (newTime >= totalDuration && totalDuration > 0) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      setCurrentTime(totalDuration);
      setCurrentMouth('default');
      drawCanvas('default', totalDuration);
      
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(console.error);
      }
      return;
    }

    setCurrentTime(newTime);
    
    let visualTime = newTime - (audioOffsetRef.current * 1000);
    // Add safety limit
    if (visualTime < 0) visualTime = 0;

    let activeNote: NoteData | null = null;
    
    // Linear scan to inherently support overlapping notes
    for (let i = data.notes.length - 1; i >= 0; i--) {
      const note = data.notes[i];
      if (visualTime >= note.startTimeMs && visualTime < note.startTimeMs + note.durationMs) {
        // Handle slurs: if lyric is '+', we inherit from the previous valid note
        let searchIdx = i;
        while (searchIdx >= 0 && (data.notes[searchIdx].lyric === '+' || data.notes[searchIdx].lyric === '-')) {
           searchIdx--;
        }
        activeNote = searchIdx >= 0 ? data.notes[searchIdx] : note;
        break;
      }
    }

    const mouth = activeNote ? getMouthShape(activeNote.lyric) : 'default';
    const lyric = activeNote ? activeNote.lyric : '';
    setCurrentMouth(mouth);
    const isTransparent = isExportingRef.current && (exportFormat === 'webm' || exportFormat === 'gif');
    drawCanvas(mouth, visualTime, lyric, isTransparent);

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
    } else {
      setIsPlaying(true);
      isPlayingRef.current = true;
      
      if (audioRef.current && audioUrl) {
        audioRef.current.currentTime = currentTime / 1000;
        audioRef.current.play().catch(e => console.error("Audio play failed:", e));
      } else {
        startTimeMsRef.current = performance.now() - currentTime;
      }
      
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      reqRef.current = requestAnimationFrame(updateFrame);
    }
  };

  const handleFullscreenPreview = async () => {
    if (!fullscreenContainerRef.current) return;
    try {
      await fullscreenContainerRef.current.requestFullscreen();
      
      setCurrentTime(0);
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
      
      // Stop playing if it was playing
      if (isPlayingRef.current) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        if (reqRef.current) cancelAnimationFrame(reqRef.current);
        if (audioRef.current) audioRef.current.pause();
      }
      
      // Show hint
      setShowFullscreenHint(true);
      if (hintTimeoutRef.current) window.clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = window.setTimeout(() => {
        setShowFullscreenHint(false);
      }, 2000);
      
      // Focus the container so it can receive keyboard events
      fullscreenContainerRef.current.focus();

    } catch (err) {
      console.error("Error attempting to enable full-screen mode:", err);
      alert("无法进入全屏模式 / Cannot enter fullscreen mode");
    }
  };

  const handlePopOut = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!('requestPictureInPicture' in HTMLVideoElement.prototype) && !('documentPictureInPicture' in window)) {
      alert(i18n[languageRef.current].popOutUnsupported);
      return;
    }

    try {
      // Document PiP (Chrome 116+): allows full HTML/CSS control over the pop-out window
      if ('documentPictureInPicture' in window) {
        const pip = await (window as any).documentPictureInPicture.requestWindow({
          width: canvasSize.width,
          height: canvasSize.height,
          disallowReturnToOpener: false,
        });
        pip.document.body.style.cssText = 'margin:0;padding:0;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden;';
        const video = pip.document.createElement('video') as HTMLVideoElement;
        video.srcObject = canvas.captureStream(30);
        video.style.cssText = 'width:100%;height:100%;object-fit:contain;';
        video.autoplay = true;
        video.muted = true;
        pip.document.body.appendChild(video);
        video.play();
        pipVideoRef.current = video;
        // Space key toggles app playback while the Document PiP window is focused
        pip.document.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.code === 'Space') {
            e.preventDefault();
            togglePlay();
          }
        });
        pip.addEventListener('pagehide', () => {
          setIsPoppedOut(false);
          pipVideoRef.current = null;
        });
        setIsPoppedOut(true);
        return;
      }

      // Fallback: standard Video PiP (all modern browsers)
      // Sync the mini-player's native play/pause with the app's playback state.
      const stream = canvas.captureStream(30);
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      pipVideoRef.current = video;
      document.body.appendChild(video); // must be in DOM for PiP
      await video.play();
      // Skip the initial play event triggered by video.play() above
      let pipInitialized = false;
      video.addEventListener('play', () => {
        if (!pipInitialized) return;
        if (!isPlayingRef.current) togglePlay();
      });
      video.addEventListener('pause', () => {
        if (!pipInitialized) return;
        if (isPlayingRef.current) togglePlay();
      });
      await video.requestPictureInPicture();
      pipInitialized = true;
      video.addEventListener('leavepictureinpicture', () => {
        setIsPoppedOut(false);
        video.remove();
        pipVideoRef.current = null;
      });
      setIsPoppedOut(true);
    } catch (err) {
      console.error('Pop-out error:', err);
      setIsPoppedOut(false);
    }
  };

  const handleFullscreenInteraction = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (!isFullscreen) return;
    
    if (e.type === 'keydown') {
      const keyEvent = e as React.KeyboardEvent;
      if (keyEvent.code === 'Space') {
        keyEvent.preventDefault();
        togglePlay();
        setShowFullscreenHint(false);
      }
    } else if (e.type === 'click') {
      togglePlay();
      setShowFullscreenHint(false);
    }
  };

  const handleSeek = (e: ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    
    if (audioRef.current && audioUrl) {
      audioRef.current.currentTime = time / 1000;
    }
    
    if (isPlayingRef.current) {
      if (!audioUrl) {
        startTimeMsRef.current = performance.now() - time;
      }
    } else {
      // 静态更新画布
      const data = parsedDataRef.current;
      if (data) {
        const visualTime = time - (audioOffsetRef.current * 1000);
        let activeNote: NoteData | null = null;
        for (let i = data.notes.length - 1; i >= 0; i--) {
          const note = data.notes[i];
          if (visualTime >= note.startTimeMs && visualTime < note.startTimeMs + note.durationMs) {
            let searchIdx = i;
            while (searchIdx >= 0 && (data.notes[searchIdx].lyric === '+' || data.notes[searchIdx].lyric === '-')) {
              searchIdx--;
            }
            activeNote = searchIdx >= 0 ? data.notes[searchIdx] : note;
            break;
          }
        }
        const mouth = activeNote ? getMouthShape(activeNote.lyric) : 'default';
        const lyric = activeNote ? activeNote.lyric : '';
        setCurrentMouth(mouth);
        drawCanvas(mouth, visualTime, lyric);
      } else {
        drawCanvas(currentMouth, time, '');
      }
    }
  };

  const renderOffline = async () => {
    if (!parsedDataRef.current) return;
    if (isPlaying) togglePlay();
    setIsExporting(true);
    isExportingRef.current = true;
    setExportStatus(t.recordingWebM || 'Exporting...');
    setExportProgress(0);

    let totalFrames = 0;
    const isTransparent = exportFormat === 'gif';
    const mimeType = isTransparent ? 'image/png' : 'image/jpeg';
    const frameExt = isTransparent ? 'png' : 'jpg';

    try {
      const ffmpeg = ffmpegRef.current;
      const totalDuration = parsedDataRef.current.notes.length > 0
        ? parsedDataRef.current.notes[parsedDataRef.current.notes.length - 1].startTimeMs +
          parsedDataRef.current.notes[parsedDataRef.current.notes.length - 1].durationMs
        : 0;

      if (totalDuration === 0) throw new Error("No notes to export");

      const fps = exportFormat === 'gif' ? 20 : 30; // 20fps = 5cs/frame exactly; 15fps = 6.67cs/frame → rounding drift
      totalFrames = Math.ceil((totalDuration / 1000) * fps);
      
      const targetCanvas = document.createElement('canvas');
      const MAX_EXPORT_DIMENSION = exportFormat === 'gif' ? 512 : 1280;
      
      let scale = 1;
      if (canvasSize.width > MAX_EXPORT_DIMENSION || canvasSize.height > MAX_EXPORT_DIMENSION) {
        scale = Math.min(MAX_EXPORT_DIMENSION / canvasSize.width, MAX_EXPORT_DIMENSION / canvasSize.height);
      }
      
      targetCanvas.width = Math.floor(canvasSize.width * scale);
      targetCanvas.height = Math.floor(canvasSize.height * scale);
      const targetCtx = targetCanvas.getContext('2d');
      if (!targetCtx) throw new Error("Could not get 2d context for export");

      const startTimeMs = performance.now();
      const SEGMENT_SIZE = isTransparent ? totalFrames : 600; // Do not segment GIF to preserve transparency easily
      const segmentFiles: string[] = [];

      for (let segStart = 0; segStart < totalFrames; segStart += SEGMENT_SIZE) {
        const segEnd = Math.min(segStart + SEGMENT_SIZE, totalFrames);
        const segFrames = segEnd - segStart;
        
        for (let i = segStart; i < segEnd; i++) {
          if (!isExportingRef.current) throw new Error("Export cancelled");
          
          const timeMs = (i / fps) * 1000;
          let visualTime = timeMs - (audioOffsetRef.current * 1000);
          if (visualTime < 0) visualTime = 0;
          let mouth: MouthShape = 'default';
          let lyric = '';
          
          for (let k = parsedDataRef.current.notes.length - 1; k >= 0; k--) {
            const n = parsedDataRef.current.notes[k];
            if (visualTime >= n.startTimeMs && visualTime < n.startTimeMs + n.durationMs) {
              let searchIdx = k;
              while (searchIdx >= 0 && (parsedDataRef.current.notes[searchIdx].lyric === '+' || parsedDataRef.current.notes[searchIdx].lyric === '-')) {
                searchIdx--;
              }
              const activeNote = searchIdx >= 0 ? parsedDataRef.current.notes[searchIdx] : n;
              mouth = getMouthShape(activeNote.lyric);
              lyric = activeNote.lyric;
              break;
            }
          }

          drawCanvas(mouth, visualTime, lyric, isTransparent); // Skip background if transparent
          
          targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
          if (!isTransparent) {
            targetCtx.fillStyle = 'white';
            targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
          }
          if (canvasRef.current) {
            targetCtx.drawImage(canvasRef.current, 0, 0, targetCanvas.width, targetCanvas.height);
          }

          const blob = await new Promise<Blob | null>(resolve => targetCanvas.toBlob(resolve, mimeType, 0.8));
          if (!blob) throw new Error(`Frame ${i} capture failed (toBlob returned null — device may be low on memory)`);
          const buffer = await blob.arrayBuffer();
          const frameIndex = isTransparent ? i : i - segStart;
          const frameName = `frame_${frameIndex.toString().padStart(5, '0')}.${frameExt}`;
          await ffmpeg.writeFile(frameName, new Uint8Array(buffer));

          if (i % 100 === 0) {
            // Memory Watchdog: Yield to main thread every 100 frames to prevent crash and allow GC
            await new Promise(resolve => setTimeout(resolve, 0));
          }

          if (i % 10 === 0 || i === totalFrames - 1) {
            const elapsed = (performance.now() - startTimeMs) / 1000;
            const fpsCurrent = (i + 1) / elapsed;
            const remaining = (totalFrames - (i + 1)) / fpsCurrent;
            const eta = remaining > 0 ? `${Math.ceil(remaining)}s` : '0s';
            
            setExportProgress(Math.round((i / totalFrames) * 50));
            setExportStatus(`[Offline] Frame ${i}/${totalFrames} | ETA: ${eta}`);
            
            // Yield to main thread
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        // Render segment
        if (!isTransparent) {
          const segmentName = `segment_${segStart}.mp4`;
          setExportStatus(`[Offline] Encoding segment ${segmentFiles.length + 1}...`);
          await ffmpeg.exec(['-framerate', fps.toString(), '-i', `frame_%05d.${frameExt}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', segmentName]);
          segmentFiles.push(segmentName);

          // Cleanup frames for this segment
          for (let i = 0; i < segFrames; i++) {
            await ffmpeg.deleteFile(`frame_${i.toString().padStart(5, '0')}.${frameExt}`).catch(() => {});
          }
        }
      }

      setExportStatus(t.convertingVideo || 'Converting...');
      
      // Concatenate segments
      let finalVideo = 'concatenated.mp4';
      if (!isTransparent) {
        if (segmentFiles.length === 1) {
          finalVideo = segmentFiles[0];
        } else {
          const concatText = segmentFiles.map(f => `file '${f}'`).join('\n');
          await ffmpeg.writeFile('concat.txt', concatText);
          await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'concatenated.mp4']);
        }
      }

      let hasAudio = false;
      let audioExt = 'mp3';
      if (audioFileRef.current && exportFormat !== 'gif') {
        hasAudio = true;
        const audioBuffer = await audioFileRef.current.arrayBuffer();
        audioExt = audioFileRef.current.name.split('.').pop() || 'mp3';
        await ffmpeg.writeFile(`input_audio.${audioExt}`, new Uint8Array(audioBuffer));
      }

      const ffmpegArgs = [];
      
      if (hasAudio) {
        ffmpegArgs.push('-i', `input_audio.${audioExt}`);
      }
      
      if (!isTransparent) {
        ffmpegArgs.push('-i', finalVideo);
      } else {
        ffmpegArgs.push('-framerate', fps.toString(), '-i', `frame_%05d.${frameExt}`);
      }

      const outputName = `output.${exportFormat}`;

      if (exportFormat === 'mp4' || exportFormat === 'mov' || exportFormat === 'mkv') {
        ffmpegArgs.push('-c:v', 'copy');
        if (hasAudio) ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
        ffmpegArgs.push(outputName);
        await ffmpeg.exec(ffmpegArgs);
      } else if (exportFormat === 'gif') {
        // Two-pass palette GIF: single-pass split+palettegen is unreliable in FFmpeg.wasm
        setExportStatus('Generating palette...');
        await ffmpeg.exec(['-framerate', fps.toString(), '-i', `frame_%05d.${frameExt}`, '-vf', 'palettegen=reserve_transparent=1', 'palette.png']);
        setExportStatus(t.convertingVideo || 'Converting...');
        ffmpegArgs.push('-i', 'palette.png', '-filter_complex', '[0:v][1:v]paletteuse=alpha_threshold=128[out]', '-map', '[out]', '-loop', '0', '-disposal', '2', '-gifflags', '-offsetting', outputName);
        await ffmpeg.exec(ffmpegArgs);
        await ffmpeg.deleteFile('palette.png').catch(() => {});
      } else {
        ffmpegArgs.push(outputName);
        await ffmpeg.exec(ffmpegArgs);
      }

      const data = await ffmpeg.readFile(outputName);
      if ((data as Uint8Array).length === 0) throw new Error('Output file is empty — FFmpeg export failed');
      const videoBlob = new Blob([data], { type: exportFormat === 'gif' ? 'image/gif' : `video/${exportFormat}` });
      const url = URL.createObjectURL(videoBlob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `lipsync_${Date.now()}.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);

      // Cleanup
      for (const seg of segmentFiles) {
        await ffmpeg.deleteFile(seg).catch(() => {});
      }
      await ffmpeg.deleteFile('concat.txt').catch(() => {});
      await ffmpeg.deleteFile('concatenated.mp4').catch(() => {});
      await ffmpeg.deleteFile(outputName).catch(() => {});
      if (hasAudio) await ffmpeg.deleteFile(`input_audio.${audioExt}`).catch(() => {});

    } catch (err: any) {
      handleExportError(err);
    } finally {
      // 彻底清理所有帧文件
      try {
        const ffmpeg = ffmpegRef.current;
        for (let i = 0; i < totalFrames; i++) {
          ffmpeg.deleteFile(`frame_${i.toString().padStart(5, '0')}.${frameExt}`).catch(() => {});
        }
      } catch (e) {}

      setIsExporting(false);
      isExportingRef.current = false;
      setExportStatus('');
      setExportProgress(0);
      const activeNote = parsedDataRef.current?.notes.find(n => currentTime >= n.startTimeMs && currentTime < n.startTimeMs + n.durationMs);
      drawCanvas(currentMouth, currentTime, activeNote ? activeNote.lyric : '');
    }
  };

  const handleExport = () => {
    if (isFragileEnvironment()) {
      if (!window.confirm(t.envWarning)) {
        return;
      }
    }

    const data = parsedDataRef.current;
    if (data && data.notes.length > 0) {
      const lastNote = data.notes[data.notes.length - 1];
      const totalDuration = (lastNote.startTimeMs + lastNote.durationMs) / 1000;
      if (totalDuration > 300) {
        if (!window.confirm(t.longVideoWarning)) {
          return;
        }
      }
    }

    if (exportFormat === 'webm') {
      recordRealtime();
    } else {
      renderOffline();
    }
  };

  const recordRealtime = async () => {
    if (!parsedData) return;
    setIsExporting(true);
    isExportingRef.current = true;
    setExportStatus('[Recording WebM] Please wait...');
    setExportProgress(0);
    setFfmpegError('');

    try {
      const canvas = canvasRef.current;
      if (!canvas) {
        setIsExporting(false);
        isExportingRef.current = false;
        return;
      }

      if (isPlaying) togglePlay();
      setCurrentTime(0);
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }

      const stream = canvas.captureStream(30);
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
      
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const lastNote = parsedData.notes[parsedData.notes.length - 1];
      const totalDurationMs = lastNote ? lastNote.startTimeMs + lastNote.durationMs : 0;
      const durationToRecord = totalDurationMs + 500;

      recorder.start();
      
      setIsPlaying(true);
      isPlayingRef.current = true;
      startTimeMsRef.current = performance.now();
      if (audioRef.current && audioUrl) {
        audioRef.current.play().catch(console.error);
      }
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      reqRef.current = requestAnimationFrame(updateFrame);

      const progressInterval = setInterval(() => {
        // currentTime state is stale inside this closure; derive elapsed time from refs instead
        const current = audioRef.current
          ? audioRef.current.currentTime * 1000
          : performance.now() - startTimeMsRef.current;
        const progress = Math.min(100, Math.round((current / durationToRecord) * 100));
        setExportProgress(progress);
        setExportStatus(`[Recording WebM] ${progress}%`);
      }, 500);

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          recorder.stop();
          if (isPlayingRef.current) {
            setIsPlaying(false);
            isPlayingRef.current = false;
            if (audioRef.current) audioRef.current.pause();
            if (reqRef.current) cancelAnimationFrame(reqRef.current);
          }
          clearInterval(progressInterval);
          setTimeout(resolve, 500);
        }, durationToRecord);
      });

      const videoBlob = new Blob(chunks, { type: mimeType });

      if (!audioFileRef.current) {
        const url = URL.createObjectURL(videoBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lipsync_${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        setExportStatus(i18n[language].encodingVideo || 'Converting video...');
        if (!ffmpegLoaded) {
          alert(i18n[language].ffmpegNotLoadedAlert);
          throw new Error("FFmpeg not loaded");
        }
        const ffmpeg = ffmpegRef.current;
        const videoBuffer = await videoBlob.arrayBuffer();
        await ffmpeg.writeFile('temp_video.webm', new Uint8Array(videoBuffer));

        const args = [];
        let hasAudio = false;
        let ext = 'mp3';

        if (audioFileRef.current) {
          hasAudio = true;
          const audioBuffer = await audioFileRef.current.arrayBuffer();
          ext = audioFileRef.current.name.split('.').pop() || 'mp3';
          await ffmpeg.writeFile(`input_audio.${ext}`, new Uint8Array(audioBuffer));

          args.push('-i', 'temp_video.webm');
          args.push('-i', `input_audio.${ext}`);
        } else {
          args.push('-i', 'temp_video.webm');
        }

        const outputName = `output.${exportFormat}`;

        if (exportFormat === 'webm') {
          args.push('-c:v', 'copy', '-c:a', 'libopus', outputName);
        } else if (exportFormat === 'mp4' || exportFormat === 'mov') {
          args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p');
          if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k');
          args.push(outputName);
        } else if (exportFormat === 'mkv') {
          args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
          if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k');
          args.push(outputName);
        } else if (exportFormat === 'gif') {
          args.push('-vf', 'fps=20,scale=512:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse');
          args.push(outputName);
        }

        await ffmpeg.exec(args);

        const fileData = await ffmpeg.readFile(outputName);
        const data = new Uint8Array(fileData as ArrayBuffer);
        const outputMimeType = exportFormat === 'webm' ? 'video/webm' : 
                               exportFormat === 'mp4' ? 'video/mp4' : 
                               exportFormat === 'mov' ? 'video/quicktime' : 
                               exportFormat === 'mkv' ? 'video/x-matroska' : 'image/gif';
        const finalBlob = new Blob([data.buffer], { type: outputMimeType });
        
        const url = URL.createObjectURL(finalBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lipsync_${Date.now()}.${exportFormat}`;
        a.click();
        URL.revokeObjectURL(url);

        try { await ffmpeg.deleteFile('temp_video.webm'); } catch(e){}
        if (hasAudio) {
          try { await ffmpeg.deleteFile(`input_audio.${ext}`); } catch(e){}
        }
        try { await ffmpeg.deleteFile(outputName); } catch(e){}
      }
    } catch (err: any) {
      handleExportError(err);
    } finally {
      setIsExporting(false);
      isExportingRef.current = false;
      setExportStatus('');
      setExportProgress(0);
      const activeNote = parsedData.notes.find(n => currentTime >= n.startTimeMs && currentTime < n.startTimeMs + n.durationMs);
      drawCanvas(currentMouth, currentTime, activeNote ? activeNote.lyric : '');
    }
  };

  useEffect(() => {
    return () => {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      // 组件卸载时释放所有 ObjectURL 内存
      trackedUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      trackedUrlsRef.current.clear();
    };
  }, []);

  const recalculateTimings = (notes: NoteData[], tempo: number): NoteData[] => {
    const msPerTick = 60000 / (tempo * TICKS_PER_BEAT);
    let currentStartTime = 0;
    
    return notes.map(note => {
      const durationMs = note.length * msPerTick;
      const res = {
        ...note,
        startTimeMs: currentStartTime,
        durationMs: durationMs
      };
      currentStartTime += durationMs;
      return res;
    });
  };

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTempo = parseFloat(e.target.value);
    if (isNaN(newTempo) || newTempo <= 0 || !parsedData) return;

    // Scale timings proportionally instead of sequential reassignment.
    // recalculateTimings() strips inter-note gaps, which breaks USTX/VSQX files
    // where rest notes were filtered out and gaps are encoded in startTimeMs.
    const ratio = parsedData.tempo / newTempo;
    const updatedNotes = parsedData.notes.map(note => ({
      ...note,
      startTimeMs: note.startTimeMs * ratio,
      durationMs: note.durationMs * ratio,
    }));
    const newData = { ...parsedData, tempo: newTempo, notes: updatedNotes };

    setParsedData(newData);
    parsedDataRef.current = newData;
  };

  const parseUstx = (content: string) => {
    try {
      const parsed = yaml.load(content) as any;
      if (!parsed) throw new Error("Invalid YAML");

      const bpm = (parsed.tempos && parsed.tempos[0] && parsed.tempos[0].bpm) || parsed.bpm || 120;
      const resolution = parsed.resolution || 480;

      const parts = parsed.voice_parts || [];
      if (parts.length === 0) {
        throw new Error("No voice parts found in ustx");
      }

      setUstxData({ bpm, resolution, parsed });

      const options = parts.map((part: any, index: number) => {
        const trackObj = parsed.tracks && parsed.tracks[part.track_no];
        const trackName = trackObj?.name || part.name || `Track ${part.track_no ?? index}`;
        const notesCount = part.notes?.length || 0;
        return {
          id: index,
          name: trackName,
          notesCount,
          format: 'ustx' as 'ustx' | 'vsqx',
          part
        };
      });

      if (options.length > 1) {
        setTrackOptions(options);
        setShowTrackSelector(true);
      } else {
        processUstxPart(options[0].part, bpm, resolution);
      }
    } catch (err) {
      console.error("USTX parse error", err);
      setError(t.parseError);
    }
  };

  const processUstxPart = (part: any, bpm: number, resolution: number) => {
    if (!part || !part.notes) return;
    const ticksPerBeat = resolution;
    const msPerTick = 60000 / (bpm * ticksPerBeat);

    const partOffsetMs = (part.position || 0) * msPerTick;

    let currentTick = 0;
    const notes: NoteData[] = part.notes
      .map((n: any, i: number) => {
        const originalLyric = n.lyric || '';
        const parts = originalLyric.split(' ');
        const cleanedLyric = parts[parts.length - 1];

        const durationTick = n.duration !== undefined ? n.duration : (n.length || 0);
        const posTick = n.position !== undefined ? n.position : (n.pos !== undefined ? n.pos : currentTick);
        
        const startTimeMs = partOffsetMs + (posTick * msPerTick);
        const durationMs = durationTick * msPerTick;
        
        currentTick = posTick + durationTick;
        
        return {
          index: i + 1,
          originalLyric: originalLyric,
          lyric: cleanedLyric,
          length: durationTick,
          startTimeMs,
          durationMs
        };
      })
      // R notes intentionally kept: filtering them creates timing gaps that cause
      // the closed-mouth image to flash for 1-2 frames at every rest boundary.
      // R notes simply resolve to getMouthShape('R') === 'default', same as the gap would.
      .sort((a: NoteData, b: NoteData) => a.startTimeMs - b.startTimeMs);

    const newData = { tempo: bpm, notes };
    parsedDataRef.current = newData;
    setParsedData(newData);
    
    const unique = new Set<string>();
    notes.forEach((note: NoteData) => {
      if (note.lyric && note.lyric !== 'R' && note.lyric !== '息' && note.lyric !== '休' && note.lyric !== '+') {
        unique.add(note.lyric);
      }
    });
    setUniqueLyrics(Array.from(unique));
    
    setCurrentTime(0);
    setCurrentMouth('default');
    setIsPlaying(false);
    isPlayingRef.current = false;
    if (reqRef.current) cancelAnimationFrame(reqRef.current);
    
    setShowTrackSelector(false);
  };

  const parseVsqx = (content: string) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(content, "text/xml");

      const getEls = (parent: Element | Document, tagName: string): Element[] => {
        return Array.from(parent.getElementsByTagName("*")).filter(el => el.localName === tagName || el.tagName === tagName);
      };

      const masterTrack = getEls(xmlDoc, "masterTrack")[0];
      let resolution = 480;
      let bpm = 120;

      if (masterTrack) {
        const resNode = getEls(masterTrack, "resolution")[0];
        if (resNode && resNode.textContent) resolution = parseInt(resNode.textContent, 10);

        const tempoNode = getEls(masterTrack, "tempo")[0];
        if (tempoNode) {
          const vNode = getEls(tempoNode, "v")[0];
          if (vNode && vNode.textContent) bpm = parseInt(vNode.textContent, 10) / 100;
        }
      }

      setVsqxData({ bpm, resolution });

      const vsTracks = getEls(xmlDoc, "vsTrack");
      const options: any[] = [];

      vsTracks.forEach((track, index) => {
        const tNoNode = getEls(track, "tNo")[0];
        const nameNode = getEls(track, "name")[0];
        const trackName = nameNode?.textContent || `Track ${tNoNode?.textContent || index}`;

        // VSQ4 uses vsPart, VSQ3 uses musicalPart
        const vsParts = [...getEls(track, "vsPart"), ...getEls(track, "musicalPart")];
        let notesCount = 0;
        const allNotes: any[] = [];

        vsParts.forEach(part => {
          const partTNode = getEls(part, "t")[0];
          const partTick = partTNode && partTNode.textContent ? parseInt(partTNode.textContent, 10) : 0;

          const notes = getEls(part, "note");
          notesCount += notes.length;

          notes.forEach(note => {
            const noteTNode = getEls(note, "t")[0];
            const noteDurNode = getEls(note, "dur")[0];
            const noteYNode = getEls(note, "y")[0];

            const noteTick = noteTNode && noteTNode.textContent ? parseInt(noteTNode.textContent, 10) : 0;
            const durTick = noteDurNode && noteDurNode.textContent ? parseInt(noteDurNode.textContent, 10) : 0;
            const lyric = noteYNode?.textContent || '';

            allNotes.push({
              absoluteTick: partTick + noteTick,
              durTick,
              lyric
            });
          });
        });

        if (allNotes.length > 0) {
          options.push({
            id: index,
            name: trackName,
            notesCount,
            format: 'vsqx',
            part: allNotes
          });
        }
      });

      if (options.length > 1) {
        setTrackOptions(options);
        setShowTrackSelector(true);
      } else if (options.length === 1) {
        processVsqxTrack(options[0].part, bpm, resolution);
      } else {
        throw new Error("No notes found in vsqx");
      }

    } catch (err) {
      console.error("VSQX parse error", err);
      setError(t.parseError);
    }
  };

  const processVsqxTrack = (notesData: any[], bpm: number, resolution: number) => {
    const ticksPerBeat = resolution;
    const msPerTick = 60000 / (bpm * ticksPerBeat);

    const notes: NoteData[] = notesData.map((n: any, i: number) => {
      // Clean up lyric like UST (taking last part of space-separated strings, e.g. "a あ")
      const originalLyric = n.lyric || '';
      const parts = originalLyric.split(' ');
      const cleanedLyric = parts[parts.length - 1];

      const startTimeMs = n.absoluteTick * msPerTick;
      const durationMs = n.durTick * msPerTick;
      
      return {
        index: i + 1,
        originalLyric: originalLyric,
        lyric: cleanedLyric,
        length: n.durTick,
        startTimeMs,
        durationMs
      };
    }).sort((a: NoteData, b: NoteData) => a.startTimeMs - b.startTimeMs);

    const newData = { tempo: bpm, notes };
    parsedDataRef.current = newData;
    setParsedData(newData);
    
    const unique = new Set<string>();
    notes.forEach((note: NoteData) => {
      if (note.lyric && note.lyric !== 'R' && note.lyric !== '息' && note.lyric !== '休' && note.lyric !== '+') {
        unique.add(note.lyric);
      }
    });
    setUniqueLyrics(Array.from(unique));
    
    setCurrentTime(0);
    setCurrentMouth('default');
    setIsPlaying(false);
    isPlayingRef.current = false;
    if (reqRef.current) cancelAnimationFrame(reqRef.current);
    
    setShowTrackSelector(false);
  };

  const parseUst = (content: string) => {
    try {
      const lines = content.split(/\r\n|\n|\r/);
      let currentTempo = 120;
      let currentSection = '';
      let currentNote: Partial<NoteData> & { indexStr?: string } = {};
      const notes: NoteData[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const sectionMatch = trimmedLine.match(/^\[#(.+)\]$/) || trimmedLine.match(/^\uFEFF?\[#(.+)\]$/);
        if (sectionMatch) {
          // Push previous note safely if it was an actual note
          if (currentSection.match(/^\d+$/) && currentNote) {
            notes.push({
              index: notes.length + 1,
              originalLyric: currentNote.originalLyric || 'R',
              lyric: currentNote.lyric || 'R',
              length: currentNote.length || 480,
              startTimeMs: 0,
              durationMs: 0,
            });
          }
          
          currentSection = sectionMatch[1];
          if (currentSection.match(/^\d+$/)) {
            // Initialize new note
            currentNote = { indexStr: currentSection, length: 480, lyric: 'R', originalLyric: 'R' };
          } else {
            currentNote = {};
          }
          continue;
        }

        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex !== -1) {
          const key = trimmedLine.substring(0, equalIndex).trim().toLowerCase();
          const value = trimmedLine.substring(equalIndex + 1).trim();

          if (currentSection === 'SETTING' && key === 'tempo') {
            const parsedTempo = parseFloat(value.replace(',', '.')); // Handle locale commas
            if (!isNaN(parsedTempo) && parsedTempo > 0) {
              currentTempo = parsedTempo;
            }
          } else if (currentSection.match(/^\d+$/)) {
            if (key === 'length') {
              const parsedLen = parseInt(value, 10);
              if (!isNaN(parsedLen)) currentNote.length = parsedLen;
            } else if (key === 'lyric') {
              currentNote.originalLyric = value || 'R';
              const parts = currentNote.originalLyric.split(' ');
              currentNote.lyric = parts[parts.length - 1] || 'R';
            }
          }
        }
      }

      if (currentSection.match(/^\d+$/) && currentNote) {
        notes.push({
          index: notes.length + 1,
          originalLyric: currentNote.originalLyric || 'R',
          lyric: currentNote.lyric || 'R',
          length: currentNote.length || 480,
          startTimeMs: 0,
          durationMs: 0,
        });
      }

      if (notes.length === 0) {
        console.log("Failed to parse UST. First 200 chars of content:", content.substring(0, 200));
        console.log("Lines length:", lines.length);
        throw new Error("No notes found in .ust file (maybe corrupted?)");
      }

      const finalNotes = recalculateTimings(notes, currentTempo);

      const newData = { tempo: currentTempo, notes: finalNotes };
      parsedDataRef.current = newData;
      setParsedData(newData);
      
      const unique = new Set<string>();
      notes.forEach((note: NoteData) => {
        if (note.lyric && note.lyric !== 'R' && note.lyric !== '息' && note.lyric !== '休' && note.lyric !== '+') {
          unique.add(note.lyric);
        }
      });
      setUniqueLyrics(Array.from(unique));

      setCurrentTime(0);
      setCurrentMouth('default');
      setShowTrackSelector(false);
      
      setIsPlaying(false);
      isPlayingRef.current = false;
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
    } catch (err) {
      console.error("UST Parse Error:", err);
      throw err;
    }
  };

  const handleLyricChange = (index: number, newValue: string) => {
    if (!parsedData) return;
    const newNotes = [...parsedData.notes];
    newNotes[index] = { ...newNotes[index], lyric: newValue };
    const newData = { ...parsedData, notes: newNotes };
    parsedDataRef.current = newData;
    setParsedData(newData);

    // Update unique lyrics
    const unique = new Set<string>();
    newNotes.forEach(note => {
      if (note.lyric && note.lyric !== 'R' && note.lyric !== '息') {
        unique.add(note.lyric);
      }
    });
    setUniqueLyrics(Array.from(unique));

    // Update current mouth if paused and on this frame
    if (!isPlaying) {
      const currentNote = newNotes.find(n => currentTime >= n.startTimeMs && currentTime < n.startTimeMs + n.durationMs);
      const newLyric = currentNote ? currentNote.lyric : '';
      const newMouth = currentNote ? getMouthShape(currentNote.lyric) : 'default';
      setCurrentMouth(newMouth);
      drawCanvas(newMouth, currentTime, newLyric);
    }
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setError('');
    
    if (!file.name.toLowerCase().endsWith('.ust') && !file.name.toLowerCase().endsWith('.ustx') && !file.name.toLowerCase().endsWith('.vsqx')) {
      setError(t.invalidUst);
      return;
    }

    setFileName(file.name);
    const isUstx = file.name.toLowerCase().endsWith('.ustx');
    const isVsqx = file.name.toLowerCase().endsWith('.vsqx');

    try {
      const buffer = await file.arrayBuffer();
      if (buffer && buffer.byteLength > 0) {
        try {
          let result = '';
          if (isUstx || isVsqx) {
            result = new TextDecoder('utf-8').decode(buffer);
          } else {
            try {
              const uint8Array = new Uint8Array(buffer);
              const detected = Encoding.detect(uint8Array);
              const detectedStr = detected ? detected.toString().toUpperCase() : 'SJIS';
              
              if (detectedStr.includes('UTF8') || detectedStr.includes('UNICODE')) {
                result = new TextDecoder('utf-8').decode(buffer);
              } else if (detectedStr === 'UTF16' || detectedStr === 'UTF16LE') {
                result = new TextDecoder('utf-16le').decode(buffer);
              } else if (detectedStr === 'UTF16BE') {
                result = new TextDecoder('utf-16be').decode(buffer);
              } else {
                result = Encoding.convert(uint8Array, {
                  to: 'UNICODE',
                  from: detected || 'SJIS',
                  type: 'string'
                }) as unknown as string;
              }
            } catch (encodingErr) {
              console.error("encoding-japanese failed, falling back to utf-8 decoder:", encodingErr);
              result = new TextDecoder('utf-8').decode(buffer);
            }
          }
          
          if (isUstx) {
            parseUstx(result);
          } else if (isVsqx) {
            parseVsqx(result);
          } else {
            parseUst(result);
          }
        } catch (err) {
          console.error("Outer Error Caught:", err);
          const errMsg = err instanceof Error ? err.message : String(err);
          setError(`${t.parseError} \n${errMsg}`);
        }
      } else {
        console.error("file read error, buffer:", buffer);
        const reason = buffer ? "empty file" : "read failed";
        setError(`${t.fileReadError} (${reason}). \n${t.cloudFileTip}`);
      }
    } catch (e) {
      console.error("FileReader equivalent error:", e);
      const errMsg = e instanceof Error ? e.message : String(e);
      setError(`${t.fileReadError} \n${errMsg} \n\n${t.cloudFileTip}`);
    }
  };


  const handleClearMouthImage = (shape: MouthShape, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (mouthImages[shape]) {
      revokeTrackedURL(mouthImages[shape]);
    }
    
    setMouthImages(prev => ({ ...prev, [shape]: '' }));
    mouthImageElementsRef.current[shape] = null;
    mouthGifFramesRef.current[shape] = null;
  };

  const handleClearOverrideImage = (lyric: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (overrideImages[lyric]) {
      revokeTrackedURL(overrideImages[lyric]);
    }
    
    setOverrideImages(prev => {
      const next = { ...prev };
      delete next[lyric];
      return next;
    });
    overrideImageElementsRef.current[lyric] = null;
    overrideGifFramesRef.current[lyric] = null;
  };

  const handleClearUst = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setParsedData(null);
    parsedDataRef.current = null;
    setFileName('');
    setUniqueLyrics([]);
    
    // Clear override images since they depend on the lyrics
    Object.values(overrideImages).forEach(url => revokeTrackedURL(url as string));
    setOverrideImages({});
    overrideImageElementsRef.current = {};
    overrideGifFramesRef.current = {};
    
    // Reset player state
    setIsPlaying(false);
    isPlayingRef.current = false;
    setCurrentTime(0);
    setCurrentMouth('default');
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearAudio = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (audioUrl) {
      revokeTrackedURL(audioUrl);
    }
    setAudioUrl('');
    audioFileRef.current = null;
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const handleClearBgImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (bgImageUrl) {
      revokeTrackedURL(bgImageUrl);
    }
    setBgImageUrl('');
    bgImageElementRef.current = null;
    setBgGifFrames(null);
    bgGifFramesRef.current = null;
    setBackgroundColor(null);
    backgroundColorRef.current = null;
    
    const currentNote = parsedDataRef.current?.notes.find(n => currentTime >= n.startTimeMs && currentTime < n.startTimeMs + n.durationMs);
    drawCanvas(currentMouth, currentTime, currentNote ? currentNote.lyric : '');
  };

  const handleBackgroundColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    setBackgroundColor(color);
    backgroundColorRef.current = color;
    
    // Clear image/gif
    if (bgImageUrl) {
      revokeTrackedURL(bgImageUrl);
    }
    setBgImageUrl('');
    bgImageElementRef.current = null;
    setBgGifFrames(null);
    bgGifFramesRef.current = null;
    
    // Redraw
    const currentNote = parsedDataRef.current?.notes.find(n => currentTime >= n.startTimeMs && currentTime < n.startTimeMs + n.durationMs);
    drawCanvas(currentMouth, currentTime, currentNote ? currentNote.lyric : '');
  };

  const handleMouthImageUpload = async (shape: MouthShape, file: File) => {
    if (!file) return;

    if (file.type === 'image/gif') {
      try {
        const gifFrames = await parseGifFile(file);
        mouthGifFramesRef.current[shape] = gifFrames;
        mouthImageElementsRef.current[shape] = null; // Clear static image
        
        setMouthImages(prev => {
          if (prev[shape]) revokeTrackedURL(prev[shape]);
          return { ...prev, [shape]: createTrackedURL(file) };
        });
        
        const currentNote = parsedDataRef.current?.notes.find(n => currentTime >= n.startTimeMs && currentTime < n.startTimeMs + n.durationMs);
        drawCanvas(currentMouth, currentTime, currentNote ? currentNote.lyric : '');
      } catch (err) {
        console.error("Failed to parse mouth GIF:", err);
        alert(t.gifParseFailed || "Failed to parse GIF");
      }
    } else {
      const url = createTrackedURL(file);
      const img = new Image();
      
      img.onload = () => {
        mouthImageElementsRef.current[shape] = img;
        mouthGifFramesRef.current[shape] = null; // Clear GIF frames
        setMouthImages(prev => {
          if (prev[shape]) revokeTrackedURL(prev[shape]);
          return { ...prev, [shape]: url };
        });
      };
      img.src = url;
    }
  };

  const handleOverrideImageUpload = async (lyric: string, file: File) => {
    if (!file) return;

    if (file.type === 'image/gif') {
      try {
        const gifFrames = await parseGifFile(file);
        overrideGifFramesRef.current[lyric] = gifFrames;
        overrideImageElementsRef.current[lyric] = null; // Clear static image
        
        setOverrideImages(prev => {
          if (prev[lyric]) revokeTrackedURL(prev[lyric]);
          return { ...prev, [lyric]: createTrackedURL(file) };
        });
        
        const currentNote = parsedDataRef.current?.notes.find(n => currentTime >= n.startTimeMs && currentTime < n.startTimeMs + n.durationMs);
        drawCanvas(currentMouth, currentTime, currentNote ? currentNote.lyric : '');
      } catch (err) {
        console.error("Failed to parse override GIF:", err);
        alert(t.gifParseFailed || "Failed to parse GIF");
      }
    } else {
      const url = createTrackedURL(file);
      const img = new Image();
      
      img.onload = () => {
        overrideImageElementsRef.current[lyric] = img;
        overrideGifFramesRef.current[lyric] = null; // Clear GIF frames
        setOverrideImages(prev => {
          if (prev[lyric]) revokeTrackedURL(prev[lyric]);
          return { ...prev, [lyric]: url };
        });
      };
      img.src = url;
    }
  };

  const handleAudioUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      audioFileRef.current = file;
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

    setBackgroundColor(null);
    backgroundColorRef.current = null;

    if (file.type === 'image/gif') {
      try {
        const gifCanvasData = await parseGifFile(file, 1280);
        
        bgGifFramesRef.current = gifCanvasData;
        setBgGifFrames(gifCanvasData);
        setBgImageUrl(prev => {
          if (prev) revokeTrackedURL(prev);
          return createTrackedURL(file);
        }); // Just for UI display
        bgImageElementRef.current = null; // Clear static image
        const currentNote = parsedDataRef.current?.notes.find(n => currentTime >= n.startTimeMs && currentTime < n.startTimeMs + n.durationMs);
        drawCanvas(currentMouth, currentTime, currentNote ? currentNote.lyric : '');
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
        const currentNote = parsedDataRef.current?.notes.find(n => currentTime >= n.startTimeMs && currentTime < n.startTimeMs + n.durationMs);
        drawCanvas(currentMouth, currentTime, currentNote ? currentNote.lyric : '');
      };
      img.src = url;
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans selection:bg-indigo-500/30 overflow-hidden">
      {/* Track Selector Modal for USTX / VSQX */}
      {showTrackSelector && (ustxData || vsqxData) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-6 w-full max-w-md animate-in zoom-in-95 duration-200 border border-transparent dark:border-zinc-800">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{t.selectTrack}</h3>
              <button 
                onClick={() => setShowTrackSelector(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                title="Close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6 font-medium">
              {t.selectTrackDesc}
            </p>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2 mb-6">
              {trackOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    if (opt.format === 'ustx' && ustxData) {
                      processUstxPart(opt.part, ustxData.bpm, ustxData.resolution);
                    } else if (opt.format === 'vsqx' && vsqxData) {
                      processVsqxTrack(opt.part, vsqxData.bpm, vsqxData.resolution);
                    }
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 hover:shadow-md transition-all group text-left bg-transparent"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/20 flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">{opt.name}</h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-500 font-mono mt-0.5">Track #{typeof opt.part.track_no === 'number' ? opt.part.track_no : opt.id}</p>
                    </div>
                  </div>
                  <div className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 group-hover:bg-indigo-100/50 dark:group-hover:bg-indigo-500/20 rounded-full text-xs font-mono text-zinc-600 dark:text-zinc-300 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">
                    {opt.notesCount} notes
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Absolute Language & Theme Buttons */}
      <div className="fixed top-4 right-4 z-50 portrait:flex landscape:hidden flex-col items-end space-y-3">
        <button 
          onClick={toggleDarkMode} 
          className="p-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm shadow-md border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-full transition-all"
          title={isDarkMode ? "Light Mode" : "Dark Mode"}
        >
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        <a 
          href="https://github.com/Riciwaaaa/UST-lip-sync-generator" 
          target="_blank" 
          rel="noopener noreferrer"
          className="p-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm shadow-md border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-full transition-all"
          title="GitHub Repository"
        >
          <Github className="w-5 h-5" />
        </a>
        <button 
          onClick={() => setShowModal(true)} 
          className="p-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm shadow-md border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-full transition-all"
          title={`${t.language} / ${t.notice}`}
        >
          <Globe className="w-5 h-5" />
        </button>
      </div>

      {/* Header */}
      <header className="landscape:flex portrait:hidden flex-none h-16 w-full backdrop-blur-md bg-zinc-50/80 dark:bg-zinc-950/80 border-b border-zinc-200 dark:border-zinc-800 z-40">
        <div className="max-w-7xl w-full mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Music className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{t.title}</span>
          </div>
          <div className="flex items-center space-x-4">
            <button 
              onClick={toggleDarkMode} 
              className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-full transition-all"
              title={isDarkMode ? "Light Mode" : "Dark Mode"}
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <a 
              href="https://github.com/Riciwaaaa/UST-lip-sync-generator" 
              target="_blank" 
              rel="noopener noreferrer"
              className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-full transition-all"
              title="GitHub Repository"
            >
              <Github className="w-5 h-5" />
            </a>
            <button 
              onClick={() => setShowModal(true)} 
              className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-full transition-all"
              title={`${t.language} / ${t.notice}`}
            >
              <Globe className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-6 space-y-6">
              <div className="space-y-2 text-center">
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{t.language}</h3>
                <div className="flex justify-center space-x-2">
                  {(['zh', 'en', 'ja'] as Language[]).map(lang => (
                    <button
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        language === lang 
                          ? 'bg-indigo-500 text-white' 
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      {lang === 'zh' ? '中文' : lang === 'en' ? 'English' : '日本語'}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 text-center">{t.noticeTitle}</h3>
                <div className="h-40 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 overflow-y-auto border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap custom-scrollbar">
                  {t.noticeContent}
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-zinc-50/50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-800">
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
      <div 
        ref={mainContainerRef}
        className={`flex-1 flex portrait:flex-col landscape:flex-row overflow-hidden ${isDraggingDivider ? 'select-none' : ''}`}
      >
        {/* Left Console */}
        <div 
          className="portrait:w-full landscape:h-full overflow-y-auto custom-scrollbar landscape:[direction:rtl] z-10"
          style={{ 
            [isPortraitTheme ? 'height' : 'width']: `${panelRatio}%`,
            flexShrink: 0, 
            flexGrow: 0 
          }}
        >
          {/* Inner wrapper for RTL to LTR trick */}
          <div className="w-full h-max landscape:[direction:ltr] portrait:p-4 landscape:p-8 portrait:space-y-6 landscape:space-y-12">
            
            {/* Big Title Header */}
          <header className="space-y-1 landscape:space-y-3 text-center portrait:pt-20 landscape:mt-0">
            <h1 className="text-[clamp(1.5rem,6vw,2.25rem)] xl:text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 leading-tight px-4">
              {t.title}
            </h1>
            <p className="text-[clamp(0.875rem,3.5vw,1rem)] xl:text-lg text-zinc-600 dark:text-zinc-400 px-4">
              {t.subtitle}
            </p>
          </header>

        {/* Step 1: Actors */}
        <section className="portrait:space-y-4 landscape:space-y-6">
          <div className="flex items-center portrait:space-x-2 landscape:space-x-3 border-b border-zinc-200 dark:border-zinc-800 portrait:pb-2 landscape:pb-4">
            <div className="portrait:w-6 portrait:h-6 landscape:w-8 landscape:h-8 portrait:text-sm landscape:text-base rounded-full bg-indigo-500/20 text-indigo-600 dark:bg-indigo-500/30 dark:text-indigo-400 flex items-center justify-center font-bold">1</div>
            <h2 className="portrait:text-lg landscape:text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{t.step1}</h2>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(60px,1fr))] landscape:grid-cols-[repeat(auto-fill,minmax(100px,1fr))] 2xl:landscape:grid-cols-[repeat(auto-fill,minmax(120px,1fr))] portrait:gap-2 landscape:gap-4">
            {mouthShapeConfigs.map((config) => (
              <DragDropWrapper
                key={config.id}
                onDropFile={(file) => handleMouthImageUpload(config.id, file)}
                accept="image/*"
                className={(isDragging) => `
                  relative flex flex-col items-center justify-center aspect-square rounded-2xl border-2 border-dashed cursor-pointer overflow-hidden transition-all
                  ${config.bg}
                  ${isDragging ? 'border-emerald-500 bg-emerald-500/10 scale-[1.02]' : ''}
                `}
              >
                {(isDragging) => (
                  <>
                    <label className="absolute inset-0 w-full h-full cursor-pointer z-0">
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => e.target.files?.[0] && handleMouthImageUpload(config.id, e.target.files[0])}
                      />
                    </label>
                    {mouthImages[config.id] ? (
                      <>
                        <img src={mouthImages[config.id]} alt={config.label} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
                        <button
                          onClick={(e) => handleClearMouthImage(config.id, e)}
                          className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500/80 text-white rounded-full backdrop-blur-sm transition-colors z-20"
                          title="Clear image"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center space-y-2 z-10 pointer-events-none">
                        <UploadCloud className={`w-8 h-8 ${config.color} opacity-70`} />
                        <span className={`font-medium ${config.color}`}>{config.label}</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm p-2 text-center text-xs font-medium text-white/90 translate-y-full hover:translate-y-0 transition-transform z-10 pointer-events-none">
                      {t.clickToChange}
                    </div>
                  </>
                )}
              </DragDropWrapper>
            ))}
          </div>
        </section>

        {/* Custom Overrides */}
        {uniqueLyrics.length > 0 && (
          <section className="portrait:space-y-4 landscape:space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 portrait:pb-2 landscape:pb-4">
              <div className="flex items-center portrait:space-x-2 landscape:space-x-3">
                <div className="portrait:w-6 portrait:h-6 landscape:w-8 landscape:h-8 rounded-full bg-purple-500/20 text-purple-600 dark:bg-purple-500/30 dark:text-purple-400 flex items-center justify-center font-bold">
                  <Settings className="portrait:w-3 portrait:h-3 landscape:w-4 landscape:h-4" />
                </div>
                <h2 className="portrait:text-lg landscape:text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{t.specialLyrics}</h2>
              </div>
              <span className="portrait:text-xs landscape:text-sm text-zinc-600 dark:text-zinc-400">{t.detectedSounds.replace('{count}', uniqueLyrics.length.toString())}</span>
            </div>
            
            <div className="grid grid-cols-[repeat(auto-fill,minmax(50px,1fr))] landscape:grid-cols-[repeat(auto-fill,minmax(80px,1fr))] portrait:gap-2 landscape:gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {uniqueLyrics.map((lyric) => {
                const baseShape = getMouthShape(lyric);
                const hasOverride = !!overrideImages[lyric];
                const displayImg = hasOverride ? overrideImages[lyric] : mouthImages[baseShape];
                
                return (
                  <DragDropWrapper
                    key={lyric}
                    onDropFile={(file) => handleOverrideImageUpload(lyric, file)}
                    accept="image/*"
                    className={(isDragging) => `
                      relative flex flex-col items-center justify-center aspect-square rounded-xl border cursor-pointer overflow-hidden transition-all
                      ${hasOverride ? 'bg-purple-500/10 border-purple-500/50 hover:border-purple-400' : 'bg-zinc-100/50 dark:bg-zinc-800/50 border-zinc-300/50 dark:border-zinc-700/50 hover:border-zinc-500 dark:hover:border-zinc-400'}
                      ${isDragging ? 'border-emerald-500 bg-emerald-500/10 scale-[1.02]' : ''}
                    `}
                  >
                    {(isDragging) => (
                      <>
                        <label className="absolute inset-0 w-full h-full cursor-pointer z-0">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && handleOverrideImageUpload(lyric, e.target.files[0])}
                          />
                        </label>
                        
                        {displayImg ? (
                          <img src={displayImg} alt={lyric} className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${!hasOverride ? 'opacity-50 grayscale' : ''}`} />
                        ) : (
                          <span className="text-2xl font-bold text-zinc-700 dark:text-zinc-300 pointer-events-none">{lyric}</span>
                        )}
                        
                        {hasOverride && (
                          <button
                            onClick={(e) => handleClearOverrideImage(lyric, e)}
                            className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-red-500/80 text-white rounded-full backdrop-blur-sm transition-colors z-20"
                            title="Clear override"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                        
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 backdrop-blur text-[10px] font-bold text-white rounded pointer-events-none">
                          {lyric}
                        </div>
                        
                        {!hasOverride && (
                          <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-zinc-100/80 dark:bg-zinc-800/80 backdrop-blur text-[8px] font-mono text-zinc-600 dark:text-zinc-400 rounded pointer-events-none">
                            {baseShape}
                          </div>
                        )}
                        
                        <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center z-10 pointer-events-none">
                          <span className="text-xs font-medium text-white">{hasOverride ? t.change : t.override}</span>
                        </div>
                      </>
                    )}
                  </DragDropWrapper>
                );
              })}
            </div>
          </section>
        )}

        {/* Step 2: Script & Assets */}
        <section className="portrait:space-y-4 landscape:space-y-6">
          <div className="flex items-center portrait:space-x-2 landscape:space-x-3 border-b border-zinc-200 dark:border-zinc-800 portrait:pb-2 landscape:pb-4">
            <div className="portrait:w-6 portrait:h-6 landscape:w-8 landscape:h-8 rounded-full bg-emerald-500/20 text-emerald-600 dark:bg-emerald-500/30 dark:text-emerald-400 flex items-center justify-center font-bold">2</div>
            <h2 className="portrait:text-lg landscape:text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{t.step2}</h2>
          </div>
          
          <div className="grid grid-cols-1 landscape:grid-cols-3 portrait:gap-4 landscape:gap-6">
            {/* UST Upload */}
            <DragDropWrapper
              onDropFile={handleFile}
              accept=".ust,.ustx,.vsqx"
              onClick={() => fileInputRef.current?.click()}
              className={(isDragging) => `
                relative group cursor-pointer flex flex-col items-center justify-center 
                w-full portrait:h-24 landscape:h-48 portrait:rounded-2xl landscape:rounded-3xl border-2 border-dashed transition-transform duration-300 ease-out
                ${isDragging 
                  ? 'border-emerald-500 bg-emerald-500/10 scale-[1.02]' 
                  : 'border-zinc-200 dark:border-zinc-700 bg-white/50 dark:bg-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-white dark:hover:bg-zinc-800'}
              `}
            >
              {(isDragging) => (
                <>
                  <input type="file" ref={fileInputRef} onChange={(e) => e.target.files && handleFile(e.target.files[0])} accept=".ust,.ustx,.vsqx" className="hidden" />
                  <div className="flex portrait:flex-row landscape:flex-col items-center portrait:space-x-4 landscape:space-y-4 pointer-events-none">
                    <div className={`p-2 landscape:p-4 rounded-full ${isDragging ? 'bg-emerald-500/20 text-emerald-600 dark:bg-emerald-500/30 dark:text-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 group-hover:text-zinc-700 dark:group-hover:text-zinc-300'}`}>
                      <FileText className="w-6 h-6 landscape:w-8 landscape:h-8" />
                    </div>
                    <div className="portrait:text-left landscape:text-center portrait:space-y-0 landscape:space-y-1">
                      <p className="portrait:text-sm landscape:text-lg font-medium text-zinc-800 dark:text-zinc-200 landscape:px-4 line-clamp-1 truncate w-full">
                        {fileName ? `${t.selected}${fileName}` : t.uploadUst}
                      </p>
                      <p className="portrait:text-xs landscape:text-sm text-zinc-500 dark:text-zinc-400">{t.uploadUstDesc}</p>
                    </div>
                  </div>
                  {fileName && (
                    <button
                      onClick={handleClearUst}
                      className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-red-500/80 text-white rounded-full backdrop-blur-sm transition-colors z-20"
                      title="Clear UST"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </>
              )}
            </DragDropWrapper>

            {/* Audio Upload */}
            <DragDropWrapper
              onDropFile={(file) => {
                audioFileRef.current = file;
                const url = createTrackedURL(file);
                setAudioUrl(prev => {
                  if (prev) revokeTrackedURL(prev);
                  return url;
                });
              }}
              accept="audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a,.mp4,.webm,.mov"
              className={(isDragging) => `
                relative group cursor-pointer flex flex-col items-center justify-center 
                w-full portrait:h-24 landscape:h-48 portrait:rounded-2xl landscape:rounded-3xl border-2 border-dashed transition-transform duration-300 ease-out
                ${isDragging 
                  ? 'border-emerald-500 bg-emerald-500/10 scale-[1.02]' 
                  : 'border-zinc-200 dark:border-zinc-700 bg-white/50 dark:bg-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-white dark:hover:bg-zinc-800'}
              `}
            >
              {(isDragging) => (
                <>
                  <label className="absolute inset-0 w-full h-full cursor-pointer">
                    <input type="file" accept="audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a,.mp4,.webm,.mov" onChange={handleAudioUpload} className="hidden" />
                  </label>
                  <div className="flex portrait:flex-row landscape:flex-col items-center portrait:space-x-4 landscape:space-y-4 pointer-events-none">
                    <div className={`p-2 landscape:p-4 rounded-full ${isDragging ? 'bg-emerald-500/20 text-emerald-600 dark:bg-emerald-500/30 dark:text-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 group-hover:text-zinc-700 dark:group-hover:text-zinc-300'}`}>
                      <Music className="w-6 h-6 landscape:w-8 landscape:h-8" />
                    </div>
                    <div className="portrait:text-left landscape:text-center portrait:space-y-0 landscape:space-y-1">
                      <p className="portrait:text-sm landscape:text-lg font-medium text-zinc-800 dark:text-zinc-200">
                        {audioUrl ? t.audioUploaded : t.uploadAudio}
                      </p>
                      <p className="portrait:text-xs landscape:text-sm text-zinc-500 dark:text-zinc-400">{t.uploadAudioDesc}</p>
                    </div>
                  </div>
                  {audioUrl && <audio ref={audioRef} src={audioUrl} className="hidden" />}
                  {audioUrl && (
                    <button
                      onClick={handleClearAudio}
                      className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-red-500/80 text-white rounded-full backdrop-blur-sm transition-colors z-20"
                      title="Clear Audio"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </>
              )}
            </DragDropWrapper>

            {/* Background Upload */}
            <DragDropWrapper
              onDropFile={async (file) => {
                setBackgroundColor(null);
                backgroundColorRef.current = null;
                if (file.type === 'image/gif') {
                  try {
                    const gifCanvasData = await parseGifFile(file, 1280);
                    bgGifFramesRef.current = gifCanvasData;
                    setBgGifFrames(gifCanvasData);
                    setBgImageUrl(prev => {
                      if (prev) revokeTrackedURL(prev);
                      return createTrackedURL(file);
                    });
                    bgImageElementRef.current = null;
                    const currentNote = parsedDataRef.current?.notes.find(n => currentTime >= n.startTimeMs && currentTime < n.startTimeMs + n.durationMs);
                    drawCanvas(currentMouth, currentTime, currentNote ? currentNote.lyric : '');
                  } catch (err) {
                    console.error('Failed to parse background GIF:', err);
                    setError(t.errorGif);
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
                    const currentNote = parsedDataRef.current?.notes.find(n => currentTime >= n.startTimeMs && currentTime < n.startTimeMs + n.durationMs);
                    drawCanvas(currentMouth, currentTime, currentNote ? currentNote.lyric : '');
                  };
                  img.src = url;
                }
              }}
              accept="image/*"
              className={(isDragging) => `
                relative group cursor-pointer flex flex-col items-center justify-center 
                w-full portrait:h-24 landscape:h-48 portrait:rounded-2xl landscape:rounded-3xl border-2 border-dashed transition-transform duration-300 ease-out overflow-hidden
                ${isDragging 
                  ? 'border-emerald-500 bg-emerald-500/10 scale-[1.02]' 
                  : 'border-zinc-200 dark:border-zinc-700 bg-white/50 dark:bg-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-white dark:hover:bg-zinc-800'}
              `}
            >
              {(isDragging) => (
                <>
                  <label className="absolute inset-0 w-full h-full cursor-pointer z-0">
                    <input type="file" accept="image/*" onChange={handleBgImageUpload} className="hidden" />
                  </label>
                  {bgImageUrl ? (
                    <img src={bgImageUrl} alt="Background" className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none" />
                  ) : backgroundColor ? (
                    <div className="absolute inset-0 w-full h-full opacity-50 pointer-events-none" style={{ backgroundColor }} />
                  ) : null}
                  <div className="flex portrait:flex-row landscape:flex-col items-center portrait:space-x-4 landscape:space-y-4 z-10 pointer-events-none landscape:w-full landscape:px-4">
                    <div className={`p-2 landscape:p-4 rounded-full ${isDragging ? 'bg-emerald-500/20 text-emerald-600 dark:bg-emerald-500/30 dark:text-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 group-hover:text-zinc-700 dark:group-hover:text-zinc-300'}`}>
                      <Layers className="w-6 h-6 landscape:w-8 landscape:h-8" />
                    </div>
                    <div className="portrait:text-left landscape:text-center portrait:space-y-0 landscape:space-y-1">
                      <p className="portrait:text-sm landscape:text-lg font-medium text-zinc-800 dark:text-zinc-200 landscape:px-4 line-clamp-1 truncate w-full">
                        {bgImageUrl ? t.bgUploaded : backgroundColor ? t.solidBg : t.uploadBg}
                      </p>
                      <p className="portrait:text-xs landscape:text-sm text-zinc-500 dark:text-zinc-400">{t.uploadBgDesc}</p>
                    </div>
                  </div>
                  {(bgImageUrl || backgroundColor) && (
                    <button
                      onClick={handleClearBgImage}
                      className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-red-500/80 text-white rounded-full backdrop-blur-sm transition-colors z-20"
                      title="Clear Background"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                  
                  {/* Color Picker Button */}
                  <div 
                    className="absolute bottom-4 right-4 z-20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label className="flex items-center justify-center w-10 h-10 bg-white/80 dark:bg-zinc-800/80 hover:bg-white dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-full shadow-sm backdrop-blur-sm cursor-pointer border border-zinc-200 dark:border-zinc-700" title="Solid Color Background">
                      <span className="text-lg">🎨</span>
                      <input 
                        type="color" 
                        value={backgroundColor || '#ffffff'} 
                        onChange={handleBackgroundColorChange}
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                      />
                    </label>
                  </div>
                </>
              )}
            </DragDropWrapper>
          </div>

          {error && (
            <div className="flex items-start space-x-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-medium whitespace-pre-wrap">{error}</p>
            </div>
          )}
        </section>

        {/* Data Table */}
        {parsedData && (
          <section className="space-y-4">
            <details className="group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-800/50 overflow-hidden shadow-xl">
              <summary className="list-none [&::-webkit-details-marker]:hidden px-6 py-4 font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer hover:bg-zinc-100/50 dark:hover:bg-zinc-700/50 transition-colors flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                  <span>{t.parsedData.replace('{count}', parsedData.notes.length.toString())}</span>
                  <div className="ml-4 flex items-center space-x-2 bg-white/60 dark:bg-zinc-900/60 px-3 py-1 rounded-md border border-zinc-200 dark:border-zinc-700" onClick={(e) => e.stopPropagation()}>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">BPM:</span>
                    <input 
                      type="number"
                      step="0.01"
                      className="w-20 bg-transparent border-none text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 p-1 rounded text-zinc-900 dark:text-zinc-100"
                      value={parsedData.tempo}
                      onChange={handleBpmChange}
                    />
                  </div>
                </div>
                <span className="text-zinc-500 dark:text-zinc-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="overflow-x-auto custom-scrollbar max-h-[400px] border-t border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-white/80 dark:bg-zinc-900/80 sticky top-0 z-10 backdrop-blur-sm border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-6 py-4 font-medium text-zinc-600 dark:text-zinc-400 w-24">{t.index}</th>
                      <th className="px-6 py-4 font-medium text-zinc-600 dark:text-zinc-400">{t.originalLyric}</th>
                      <th className="px-6 py-4 font-medium text-zinc-600 dark:text-zinc-400">{t.lyric}</th>
                      <th className="px-6 py-4 font-medium text-zinc-600 dark:text-zinc-400">{t.mappedMouth}</th>
                      <th className="px-6 py-4 font-medium text-zinc-600 dark:text-zinc-400 text-right">{t.startTimeMsFormatted}</th>
                      <th className="px-6 py-4 font-medium text-zinc-600 dark:text-zinc-400 text-right">{t.startTimeMsRaw}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {parsedData.notes.map((note, idx) => {
                      const isCurrent = currentTime >= note.startTimeMs && currentTime < note.startTimeMs + note.durationMs;
                      return (
                        <tr key={idx} className={`transition-colors ${isCurrent ? 'bg-indigo-500/20 dark:bg-indigo-500/30' : 'hover:bg-zinc-100/30 dark:hover:bg-zinc-800/50'}`}>
                          <td className="px-6 py-3 font-mono text-zinc-500 dark:text-zinc-400">{note.index}</td>
                          <td className="px-6 py-3 text-zinc-700 dark:text-zinc-300">{note.originalLyric}</td>
                          <td className="px-6 py-3">
                            <input
                              type="text"
                              value={note.lyric}
                              onChange={(e) => handleLyricChange(idx, e.target.value)}
                              className="w-20 bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-300/50 dark:border-zinc-700/50 rounded px-2 py-1 text-indigo-600 dark:text-indigo-400 font-medium focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all"
                            />
                          </td>
                          <td className="px-6 py-3">
                            <span className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono text-xs">
                              {getMouthShape(note.lyric)}
                            </span>
                          </td>
                          <td className="px-6 py-3 font-mono text-zinc-600 dark:text-zinc-400 text-right">{formatTime(note.startTimeMs)}</td>
                          <td className="px-6 py-3 font-mono text-zinc-600 dark:text-zinc-400 text-right">{Math.round(note.startTimeMs)}</td>
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
        </div>

        {/* Resizable Divider */}
        <div
          className="group flex flex-none shrink-0 items-center justify-center relative touch-none z-10
                     portrait:w-full portrait:h-1 portrait:cursor-row-resize 
                     landscape:w-1 landscape:h-full landscape:cursor-col-resize 
                     bg-zinc-200 dark:bg-zinc-700
                     hover:bg-indigo-400 dark:hover:bg-indigo-500 active:bg-indigo-500 dark:active:bg-indigo-600"
          onMouseDown={() => setIsDraggingDivider(true)}
          onTouchStart={() => setIsDraggingDivider(true)}
        >
          {/* Extended invisible wrapper for easier grabbing (the hotspot) */}
          <div className="absolute portrait:w-full portrait:-top-2 portrait:-bottom-2 landscape:h-full landscape:-left-2 landscape:-right-2 z-0" />
          
          {/* Handle icon */}
          <div className="absolute bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-full flex items-center justify-center shadow-sm text-zinc-400 dark:text-zinc-500 group-hover:text-white dark:group-hover:text-white group-hover:bg-indigo-400 dark:group-hover:bg-indigo-500 group-hover:border-transparent portrait:w-8 portrait:h-3 landscape:w-3 landscape:h-8 z-10 pointer-events-none">
            <span className="portrait:rotate-90 text-[10px] leading-none mb-0.5">⋮</span>
          </div>
        </div>

        {/* Right Monitor */}
        <div className="flex-1 min-w-0 min-h-0 bg-white/30 dark:bg-zinc-950/30 portrait:border-t landscape:border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto custom-scrollbar relative">
          <div className="sticky top-0 portrait:p-4 landscape:p-8 portrait:space-y-4 landscape:space-y-8 min-h-max">
          {/* Step 3: Monitor */}
          {parsedData ? (
            <section className="portrait:space-y-4 landscape:space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="flex items-center portrait:space-x-2 landscape:space-x-3 border-b border-zinc-200 dark:border-zinc-800 portrait:pb-2 landscape:pb-4">
                <div className="portrait:w-6 portrait:h-6 landscape:w-8 landscape:h-8 rounded-full bg-amber-500/20 text-amber-600 dark:bg-amber-500/30 dark:text-amber-400 flex items-center justify-center font-bold portrait:text-sm landscape:text-base">3</div>
                <h2 className="portrait:text-lg landscape:text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{t.step3}</h2>
              </div>
            
              <div className="flex flex-col items-center portrait:space-y-4 landscape:space-y-8">
                {/* Canvas Container */}
                <div className="relative w-full max-w-2xl aspect-video portrait:rounded-xl landscape:rounded-3xl portrait:border-2 landscape:border-4 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 portrait:shadow-xl landscape:shadow-2xl overflow-hidden flex items-center justify-center bg-checkered">
                <div 
                  ref={fullscreenContainerRef} 
                  className={`w-full h-full flex items-center justify-center focus:outline-none ${isFullscreen ? 'bg-black cursor-pointer' : ''}`}
                  style={isFullscreen && backgroundColor ? { backgroundColor } : {}}
                  tabIndex={isFullscreen ? 0 : -1}
                  onClick={isFullscreen ? handleFullscreenInteraction : undefined}
                  onKeyDown={isFullscreen ? handleFullscreenInteraction : undefined}
                >
                  <canvas 
                    ref={canvasRef} 
                    width={canvasSize.width} 
                    height={canvasSize.height} 
                    className="w-full h-full object-contain pointer-events-none"
                  />
                  
                  {isFullscreen && (
                    <div className={`absolute bottom-12 left-1/2 -translate-x-1/2 px-6 py-3 bg-black/60 text-white text-sm rounded-full backdrop-blur-md transition-opacity duration-500 pointer-events-none ${showFullscreenHint ? 'opacity-100' : 'opacity-0'}`}>
                      {t.fullscreenHint}
                    </div>
                  )}
                </div>
                
                {!isFullscreen && (
                  <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-white/50 backdrop-blur-md border border-black/10 text-xs font-mono text-black/80 z-10 pointer-events-none">
                    {currentMouth} | {canvasSize.width}x{canvasSize.height}
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex flex-col items-center space-y-6 w-full max-w-2xl">
                
                {/* Settings Row */}
                <div className="flex flex-wrap items-center justify-between w-full gap-4 bg-white/50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center space-x-4">
                    <div className="flex flex-col space-y-1">
                      <label className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{t.width}</label>
                      <input 
                        type="number" 
                        placeholder="Auto"
                        value={customWidth}
                        onChange={(e) => setCustomWidth(e.target.value)}
                        className="w-20 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-2 py-1 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                      />
                    </div>
                    <div className="flex flex-col space-y-1">
                      <label className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{t.height}</label>
                      <input 
                        type="number" 
                        placeholder="Auto"
                        value={customHeight}
                        onChange={(e) => setCustomHeight(e.target.value)}
                        className="w-20 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-2 py-1 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                      />
                    </div>
                  </div>
                  
                  <div className="flex flex-col space-y-1">
                    <label className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{t.audioOffset}</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={audioOffset}
                      onChange={(e) => setAudioOffset(Number(e.target.value))}
                      className="w-24 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-2 py-1 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                    />
                  </div>
                </div>

                {/* Scrubber */}
                <div className="w-full space-y-2">
                  <div className="flex justify-between text-sm font-mono text-zinc-600 dark:text-zinc-400">
                    <span>{formatTime(currentTime)}</span>
                    <span>{parsedData.notes.length > 0 ? formatTime(parsedData.notes[parsedData.notes.length - 1].startTimeMs + parsedData.notes[parsedData.notes.length - 1].durationMs) : '00:00.000'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlay}
                      className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 transition-all active:scale-95 shadow-sm"
                    >
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max={parsedData.notes.length > 0 ? parsedData.notes[parsedData.notes.length - 1].startTimeMs + parsedData.notes[parsedData.notes.length - 1].durationMs : 0}
                      step="1"
                      value={currentTime}
                      onChange={handleSeek}
                      className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 dark:accent-indigo-400"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end w-full">
                  <div className="flex portrait:flex-wrap landscape:flex-nowrap items-center justify-center portrait:gap-2 landscape:space-x-2 w-full portrait:w-auto">
                    <button
                      onClick={handleFullscreenPreview}
                      disabled={isExporting}
                      className={`flex items-center justify-center portrait:w-12 landscape:w-14 portrait:h-12 landscape:h-14 rounded-xl font-medium portrait:shadow-sm landscape:shadow-lg transition-all active:scale-95 border
                        ${isExporting
                          ? 'bg-zinc-100/50 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-800 cursor-not-allowed'
                          : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700'}`}
                      title={t.fullscreenMode}
                    >
                      <span className="portrait:text-xl landscape:text-2xl leading-none -mt-1">⛶</span>
                    </button>

                    <button
                      onClick={handlePopOut}
                      disabled={isExporting || isPoppedOut}
                      className={`flex items-center justify-center portrait:w-12 landscape:w-14 portrait:h-12 landscape:h-14 rounded-xl font-medium portrait:shadow-sm landscape:shadow-lg transition-all active:scale-95 border
                        ${isExporting || isPoppedOut
                          ? 'bg-zinc-100/50 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-800 cursor-not-allowed'
                          : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700'}`}
                      title={t.popOut}
                    >
                      <span className="portrait:text-xl landscape:text-2xl leading-none">⧉</span>
                    </button>

                    <select 
                      value={exportFormat} 
                      onChange={(e) => setExportFormat(e.target.value as any)}
                      className="portrait:flex-1 landscape:flex-none portrait:h-12 landscape:h-14 portrait:px-2 landscape:px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 portrait:text-xs landscape:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                      disabled={isExporting}
                    >
                      <option value="webm">{t.webmDesc}</option>
                      <option value="mp4">{t.mp4Desc}</option>
                      <option value="mov">{t.movDesc}</option>
                      <option value="mkv">{t.mkvDesc}</option>
                      <option value="gif">{t.gifDesc}</option>
                    </select>

                    <button 
                      onClick={handleExport}
                      disabled={isExporting}
                      className={`flex portrait:flex-1 landscape:flex-none items-center justify-center portrait:px-4 landscape:px-6 portrait:h-12 landscape:h-14 rounded-xl font-medium portrait:shadow-sm landscape:shadow-lg transition-all active:scale-95 portrait:space-x-1 landscape:space-x-2 portrait:text-sm landscape:text-base
                        ${isExporting
                          ? 'bg-indigo-600/50 text-white/50 cursor-not-allowed' 
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'}`}
                    >
                      {isExporting ? <Download className="portrait:w-4 portrait:h-4 landscape:w-5 landscape:h-5 animate-bounce" /> : <Video className="portrait:w-4 portrait:h-4 landscape:w-5 landscape:h-5" />}
                      <span className="truncate">
                        {isExporting ? `${exportStatus} ${exportProgress}%` : t.exportVideo}
                      </span>
                    </button>
                  </div>
                </div>
                
                {exportFormat === 'webm' && (
                  <div className="text-xs text-amber-600/80 dark:text-amber-500/90 text-center mt-2 bg-amber-50 dark:bg-amber-900/40 p-2 rounded-lg">
                    {t.webmWarning}
                  </div>
                )}

                {exportFormat === 'webm' && bgGifFrames && (
                  <div className="text-xs text-red-600/80 dark:text-red-400/90 text-center mt-2 bg-red-50 dark:bg-red-900/40 p-2 rounded-lg">
                    {t.webmGifWarning}
                  </div>
                )}
                
                {ffmpegError && (
                  <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-900/50 p-3 rounded-lg text-left whitespace-pre-wrap break-words w-full mt-2">
                    <span className="font-mono text-xs">{ffmpegError}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-zinc-500 dark:text-zinc-600 space-y-4">
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
