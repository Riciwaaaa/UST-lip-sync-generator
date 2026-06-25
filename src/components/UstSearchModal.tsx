import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Download, ExternalLink, Loader2, AlertCircle, Copy, Check, User } from 'lucide-react';
import { getAuthorAccountId, sortSearchResults, type BowlRollSearchResult } from '../../shared/bowlroll';

type SearchResult = BowlRollSearchResult;

const CREDIT_CONFIRM_DELAY_SEC = 5;

interface PendingCredit {
  result: SearchResult;
  action: 'load' | 'open';
  bytes?: Uint8Array;
  fileName?: string;
  openUrl: string;
}

interface UstSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUstLoaded: (bytes: Uint8Array, fileName: string) => void;
  language: 'zh' | 'en' | 'ja';
}

const i18nTexts = {
  zh: {
    title: '在线搜索 UST 工程文件',
    placeholder: '输入曲名搜索 UST...',
    search: '搜索',
    searching: '搜索中...',
    loadMore: '加载更多',
    noResults: '未找到相关 UST 文件',
    noResultsHint: '请尝试更精确的曲名，或手动从 BowlRoll 等网站下载',
    resultsFrom: '共 {count} 个结果',
    download: '加载',
    downloading: '加载中...',
    openInNewTab: '在新标签页打开',
    sourceBowlroll: 'BowlRoll',
    error: '搜索失败，请重试',
    apiError: '搜索服务不可用，请确认已运行 npm run dev:api（端口需与 Vite 代理一致）',
    networkError: '无法连接 BowlRoll（日本站点），请检查网络或代理/VPN 后重试，或在浏览器打开 bowlroll.net 测试',
    loadError: '加载 UST 文件失败',
    passwordError: '该文件需要密码，请在新标签页打开后手动下载',
    loginError: '该文件需要登录 BowlRoll 才能下载，请在新标签页打开后手动下载',
    expiredError: '该文件已停止配布，无法下载',
    archiveError: '压缩包格式暂不支持自动解压（如 .rar / .7z），请手动下载',
    noProjectError: '压缩包中未找到 .ust / .ustx / .vsqx 文件',
    close: '关闭',
    author: '作者',
    ustAuthor: 'UST作者',
    uploadedAt: '上传',
    downloadCount: '{count} 次下载',
    viewAuthor: '查看作者主页',
    creditTitle: '发布作品时请务必标注 UST 作者',
    creditBody:
      '本 UST 由他人制作并发布于 BowlRoll。在投稿视频、直播或二次发布时，请在简介/说明中注明原作者与配布来源。',
    creditTemplateLabel: '标注模板（可复制）',
    copyTemplate: '复制模板',
    copied: '已复制',
    confirmLoad: '我已了解，继续加载',
    confirmCountdown: '我已了解，继续加载（{n}）',
    confirmOpen: '我已了解，打开链接',
    confirmOpenCountdown: '我已了解，打开链接（{n}）',
  },
  en: {
    title: 'Search UST Files Online',
    placeholder: 'Enter song name to search UST...',
    search: 'Search',
    searching: 'Searching...',
    loadMore: 'Load more',
    noResults: 'No UST files found',
    noResultsHint: 'Try a more precise song name, or download manually from BowlRoll etc.',
    resultsFrom: '{count} results',
    download: 'Load',
    downloading: 'Loading...',
    openInNewTab: 'Open in new tab',
    sourceBowlroll: 'BowlRoll',
    error: 'Search failed, please try again',
    apiError: 'Search service unavailable. Run npm run dev:api (port must match Vite proxy).',
    networkError: 'Cannot reach BowlRoll (Japan). Check network/proxy/VPN, or open bowlroll.net in your browser to test.',
    loadError: 'Failed to load UST file',
    passwordError: 'This file requires a password. Please open it in a new tab and download manually.',
    loginError: 'This file requires a BowlRoll login. Please open it in a new tab and download manually.',
    expiredError: 'This file is no longer available for download.',
    archiveError: 'Archive format not supported for auto-extraction (.rar / .7z). Please download manually.',
    noProjectError: 'No .ust / .ustx / .vsqx file found in the archive',
    close: 'Close',
    author: 'Author',
    ustAuthor: 'UST author',
    uploadedAt: 'Uploaded',
    downloadCount: '{count} downloads',
    viewAuthor: 'View author profile',
    creditTitle: 'Please credit the UST author when publishing',
    creditBody:
      'This UST was created by someone else and shared on BowlRoll. When uploading videos, streaming, or republishing, include the original author and source in your description.',
    creditTemplateLabel: 'Attribution template (copyable)',
    copyTemplate: 'Copy template',
    copied: 'Copied',
    confirmLoad: 'I understand, continue loading',
    confirmCountdown: 'I understand, continue loading ({n})',
    confirmOpen: 'I understand, open link',
    confirmOpenCountdown: 'I understand, open link ({n})',
  },
  ja: {
    title: 'USTファイルをオンライン検索',
    placeholder: '曲名を入力してUSTを検索...',
    search: '検索',
    searching: '検索中...',
    loadMore: 'さらに読み込む',
    noResults: 'USTファイルが見つかりませんでした',
    noResultsHint: 'より正確な曲名で試すか、BowlRollなどから手動でダウンロードしてください',
    resultsFrom: '{count}件の結果',
    download: '読み込む',
    downloading: '読み込み中...',
    openInNewTab: '新しいタブで開く',
    sourceBowlroll: 'BowlRoll',
    error: '検索に失敗しました。再試行してください',
    apiError: '検索サービスに接続できません。npm run dev:api が起動しているか確認してください。',
    networkError: 'BowlRoll（日本）に接続できません。ネットワークやプロキシ/VPNを確認し、ブラウザで bowlroll.net を開いてテストしてください。',
    loadError: 'USTファイルの読み込みに失敗しました',
    passwordError: 'このファイルはパスワードが必要です。新しいタブで開いて手動でダウンロードしてください',
    loginError: 'このファイルはBowlRollへのログインが必要です。新しいタブで開いて手動でダウンロードしてください',
    expiredError: 'このファイルは配布が終了しています',
    archiveError: '圧縮形式（.rar / .7z）は自動解凍に対応していません。手動でダウンロードしてください',
    noProjectError: 'アーカイブ内に .ust / .ustx / .vsqx が見つかりませんでした',
    close: '閉じる',
    author: '作者',
    ustAuthor: 'UST作者',
    uploadedAt: '投稿',
    downloadCount: '{count} DL',
    viewAuthor: '作者ページを見る',
    creditTitle: '作品公開時は必ず UST 作者を明記してください',
    creditBody:
      'この UST は他の制作者が BowlRoll で配布したものです。動画投稿・配信・再配布の際は、概要欄などに原作者と配布元を記載してください。',
    creditTemplateLabel: '明記用テンプレート（コピー可）',
    copyTemplate: 'テンプレートをコピー',
    copied: 'コピーしました',
    confirmLoad: '理解しました、読み込みを続行',
    confirmCountdown: '理解しました、読み込みを続行（{n}）',
    confirmOpen: '理解しました、リンクを開く',
    confirmOpenCountdown: '理解しました、リンクを開く（{n}）',
  },
};

async function searchViaApi(query: string, page: number): Promise<SearchResult[]> {
  const res = await fetch(
    `/api/search-ust?action=search&q=${encodeURIComponent(query)}&page=${page}`,
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = typeof data?.error === 'string' ? data.error : `API ${res.status}`;
    const err = new Error(code) as Error & { isApiError?: boolean; code?: string };
    err.isApiError = res.status === 502 || res.status === 404 || res.status >= 500;
    err.code = code;
    throw err;
  }
  return (data?.results || []) as SearchResult[];
}

function mapLoadError(code: string | undefined, t: (typeof i18nTexts)['zh']): string {
  switch (code) {
    case 'PASSWORD_REQUIRED':
      return t.passwordError;
    case 'LOGIN_REQUIRED':
      return t.loginError;
    case 'EXPIRED':
      return t.expiredError;
    case 'UNSUPPORTED_ARCHIVE':
      return t.archiveError;
    case 'NO_PROJECT_FILE':
      return t.noProjectError;
    default:
      return t.loadError;
  }
}

function formatUploadedAt(value: string | undefined, language: 'zh' | 'en' | 'ja'): string | null {
  if (!value) return null;
  const datePart = value.split(' ')[0];
  if (!datePart) return null;
  if (language === 'zh') return datePart;
  return datePart;
}

function buildAttributionTemplate(result: SearchResult, language: 'zh' | 'en' | 'ja'): string {
  const accountId =
    getAuthorAccountId(result) ||
    (language === 'ja' ? '不明' : language === 'zh' ? '未知' : 'unknown');
  const ustAuthorLabel = language === 'en' ? 'UST author' : 'UST作者';
  const sourceLabel = language === 'ja' ? '配布元' : language === 'zh' ? '来源' : 'Source';
  const header = language === 'en' ? '[Credits]' : '【使用素材】';

  return [header, `${ustAuthorLabel}：${accountId}`, `${sourceLabel}：BowlRoll`, result.link].join('\n');
}

function enrichResultFromApi(result: SearchResult, data: Record<string, unknown>): SearchResult {
  const authorId = typeof data.authorId === 'string' && data.authorId ? data.authorId : result.authorId;
  const authorName =
    typeof data.authorName === 'string' && data.authorName ? data.authorName : result.authorName;
  const authorLink =
    typeof data.authorLink === 'string' && data.authorLink
      ? data.authorLink
      : authorId
        ? `https://bowlroll.net/user/${authorId}`
        : result.authorLink;

  return { ...result, authorId, authorName, authorLink };
}

export const UstSearchModal: React.FC<UstSearchModalProps> = ({ isOpen, onClose, onUstLoaded, language }) => {
  const t = i18nTexts[language];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [pendingCredit, setPendingCredit] = useState<PendingCredit | null>(null);
  const [creditCountdown, setCreditCountdown] = useState(CREDIT_CONFIRM_DELAY_SEC);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setError('');
      setHasSearched(false);
      setPage(1);
      setHasMore(false);
      setPendingCredit(null);
      setCreditCountdown(CREDIT_CONFIRM_DELAY_SEC);
      setCopiedTemplate(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!pendingCredit) {
      setCreditCountdown(CREDIT_CONFIRM_DELAY_SEC);
      return;
    }

    setCreditCountdown(CREDIT_CONFIRM_DELAY_SEC);
    const timer = window.setInterval(() => {
      setCreditCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [pendingCredit]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const mergeResults = (prev: SearchResult[], next: SearchResult[]) => {
    const seen = new Set(prev.map((item) => item.fileId));
    const merged = [...prev];
    for (const item of next) {
      if (!seen.has(item.fileId)) {
        seen.add(item.fileId);
        merged.push(item);
      }
    }
    return sortSearchResults(merged);
  };

  const runSearch = async (targetPage: number, append: boolean) => {
    if (!query.trim()) return;

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsSearching(true);
      setError('');
      setResults([]);
      setHasSearched(true);
    }

    try {
      const parsed = await searchViaApi(query, targetPage);
      setResults((prev) => (append ? mergeResults(prev, parsed) : parsed));
      setPage(targetPage);
      setHasMore(parsed.length >= 15 && targetPage < 5);
    } catch (err) {
      console.error('Search error:', err);
      const code = err instanceof Error && 'code' in err ? (err as Error & { code?: string }).code : undefined;
      if (code === 'NETWORK_TIMEOUT') {
        setError(t.networkError);
      } else if (err instanceof Error && 'isApiError' in err && (err as Error & { isApiError?: boolean }).isApiError) {
        setError(t.apiError);
      } else {
        setError(t.error);
      }
    } finally {
      setIsSearching(false);
      setIsLoadingMore(false);
    }
  };

  const handleSearch = () => {
    if (!query.trim() || isSearching) return;
    void runSearch(1, false);
  };

  const handleLoadMore = () => {
    if (!hasMore || isLoadingMore || isSearching) return;
    void runSearch(page + 1, true);
  };

  const handleLoadUst = async (result: SearchResult) => {
    if (loadingUrl) return;
    setLoadingUrl(result.link);
    setError('');

    try {
      const res = await fetch(`/api/search-ust?action=fetch&url=${encodeURIComponent(result.link)}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const binaryStr = atob(data.content);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const fileName =
        typeof data.fileName === 'string' && data.fileName
          ? data.fileName
          : result.title.replace(/[\\/:*?"<>|]/g, '_') + '.ust';

      const enrichedResult = enrichResultFromApi(result, data as Record<string, unknown>);

      setPendingCredit({
        action: 'load',
        bytes,
        fileName,
        result: enrichedResult,
        openUrl: enrichedResult.link,
      });
    } catch (err) {
      console.error('Load UST error:', err);
      const code = err instanceof Error ? err.message : undefined;
      setError(mapLoadError(code, t));
    } finally {
      setLoadingUrl(null);
    }
  };

  const handleOpenLinkRequest = (result: SearchResult, url: string) => {
    if (pendingCredit || loadingUrl) return;
    setPendingCredit({ action: 'open', result, openUrl: url });
  };

  const handleConfirmCredit = () => {
    if (!pendingCredit || creditCountdown > 0) return;
    if (pendingCredit.action === 'load' && pendingCredit.bytes && pendingCredit.fileName) {
      onUstLoaded(pendingCredit.bytes, pendingCredit.fileName);
      setPendingCredit(null);
      onClose();
      return;
    }
    window.open(pendingCredit.openUrl, '_blank', 'noopener,noreferrer');
    setPendingCredit(null);
  };

  const handleCopyTemplate = useCallback(async () => {
    if (!pendingCredit) return;
    const text = buildAttributionTemplate(pendingCredit.result, language);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTemplate(true);
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = setTimeout(() => setCopiedTemplate(false), 2000);
    } catch {
      // Fallback for environments without clipboard API.
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedTemplate(true);
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = setTimeout(() => setCopiedTemplate(false), 2000);
    }
  }, [pendingCredit, language]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    } else if (e.key === 'Escape' && !pendingCredit) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const creditTemplate = pendingCredit ? buildAttributionTemplate(pendingCredit.result, language) : '';
  const canConfirmCredit = creditCountdown <= 0;
  const isOpenLinkAction = pendingCredit?.action === 'open';
  const confirmLabel = canConfirmCredit
    ? isOpenLinkAction
      ? t.confirmOpen
      : t.confirmLoad
    : (isOpenLinkAction ? t.confirmOpenCountdown : t.confirmCountdown).replace(
        '{n}',
        creditCountdown.toString(),
      );

  return (
    <>
      {pendingCredit && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="w-full max-w-md max-h-[min(90vh,640px)] flex flex-col bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-amber-200 dark:border-amber-900/50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-6 py-4 border-b border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30">
              <h3 className="text-base font-semibold text-amber-900 dark:text-amber-200">{t.creditTitle}</h3>
              <p className="mt-2 text-sm text-amber-800/90 dark:text-amber-100/80 leading-relaxed">{t.creditBody}</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3 custom-scrollbar">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t.creditTemplateLabel}</div>
              <pre className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-all select-all">
                {creditTemplate}
              </pre>
            </div>
            <div className="shrink-0 px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3 bg-white dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => void handleCopyTemplate()}
                className="w-full py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
              >
                {copiedTemplate ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                <span>{copiedTemplate ? t.copied : t.copyTemplate}</span>
              </button>
              <button
                type="button"
                onClick={handleConfirmCredit}
                disabled={!canConfirmCredit}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-zinc-200 disabled:text-zinc-600 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-300 disabled:cursor-not-allowed disabled:hover:bg-zinc-200 dark:disabled:hover:bg-zinc-700"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={pendingCredit ? undefined : onClose}
      >
      <div
        className="relative w-full max-w-lg max-h-[80vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{t.title}</h2>
          <button
            onClick={onClose}
            disabled={pendingCredit !== null}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.placeholder}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching || !query.trim()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2 shrink-0"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t.searching}</span>
                </>
              ) : (
                <span>{t.search}</span>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {error && (
            <div className="mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <div className="px-6 py-3 text-xs text-zinc-500 dark:text-zinc-400">
              {t.resultsFrom.replace('{count}', results.length.toString())}
            </div>
          )}

          {!isSearching && hasSearched && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <Search className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-4" />
              <p className="text-zinc-500 dark:text-zinc-400 font-medium">{t.noResults}</p>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">{t.noResultsHint}</p>
            </div>
          )}

          <div className="px-3 pb-3 space-y-1">
            {results.map((result) => {
              const uploaded = formatUploadedAt(result.uploadedAt, language);
              const accountId = getAuthorAccountId(result);
              return (
                <div
                  key={result.fileId}
                  className="group flex items-start gap-3 p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{result.title}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 shrink-0">
                        {t.sourceBowlroll}
                      </span>
                    </div>
                    {(accountId || uploaded || typeof result.downloadCount === 'number') && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {accountId && (
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3 h-3 shrink-0" />
                            <span>{t.ustAuthor}：</span>
                            {result.authorLink ? (
                              <button
                                type="button"
                                onClick={() => handleOpenLinkRequest(result, result.authorLink!)}
                                className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline"
                                title={t.viewAuthor}
                              >
                                {accountId}
                              </button>
                            ) : (
                              <span>{accountId}</span>
                            )}
                          </span>
                        )}
                        {uploaded && (
                          <span>
                            {accountId && <span className="mr-2 text-zinc-300 dark:text-zinc-600">·</span>}
                            {t.uploadedAt}：{uploaded}
                          </span>
                        )}
                        {typeof result.downloadCount === 'number' && (
                          <span>
                            {(accountId || uploaded) && (
                              <span className="mr-2 text-zinc-300 dark:text-zinc-600">·</span>
                            )}
                            {t.downloadCount.replace('{count}', result.downloadCount.toString())}
                          </span>
                        )}
                      </div>
                    )}
                    {result.snippet && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">{result.snippet}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenLinkRequest(result, result.link)}
                      className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                      title={t.openInNewTab}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleLoadUst(result)}
                      disabled={loadingUrl !== null || pendingCredit !== null}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                    >
                      {loadingUrl === result.link ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>{t.downloading}</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3" />
                          <span>{t.download}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && results.length > 0 && (
            <div className="px-6 pb-4">
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="w-full py-2.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-xl transition-colors disabled:opacity-50"
              >
                {isLoadingMore ? t.searching : t.loadMore}
              </button>
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
};
