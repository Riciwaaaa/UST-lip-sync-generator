import React, { useRef, ReactNode, ChangeEvent } from 'react';
import { X, FolderOpen } from 'lucide-react';
import { DragDropWrapper } from './DragDropWrapper';

interface ImportRowProps {
  // 左侧小图标；背景行传缩略图或色块
  icon: ReactNode;
  label: string;
  status: ReactNode;
  hasFile: boolean;
  accept: string;
  onFile: (file: File) => void;
  onClear?: (e: React.MouseEvent) => void;
  // 「选择文件」右侧的额外按钮（在线搜索、纯色背景等）
  actions?: ReactNode;
  chooseLabel: string;
  replaceLabel: string;
  clearTitle?: string;
}

// 父容器须是 IMPORT_ROWS_GRID：各行用 subgrid 共享列宽，按钮组宽度不同时状态文字仍然对齐
export const IMPORT_ROWS_GRID = 'grid grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] gap-x-3';

// 导入区的一行：图标 | 标签 | 按钮 | 状态 | 清除。整行可拖放文件，点击空白处也能打开文件选择
export const ImportRow: React.FC<ImportRowProps> = ({
  icon, label, status, hasFile, accept, onFile, onClear, actions, chooseLabel, replaceLabel, clearTitle,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = () => inputRef.current?.click();

  const handleRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, label, input, a')) return;
    openPicker();
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 读完立即清空，重新选择同一个文件也能触发 change
    e.target.value = '';
    if (file) onFile(file);
  };

  return (
    <DragDropWrapper
      onDropFile={onFile}
      accept={accept}
      onClick={handleRowClick}
      className={(isDragging) => `col-span-5 grid grid-cols-subgrid items-center px-3 h-12 cursor-pointer transition-colors ${
        isDragging ? 'bg-emerald-500/10 ring-2 ring-inset ring-emerald-500' : 'hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60'
      }`}
    >
      {() => (
        <>
          <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleChange} />
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
            {icon}
          </div>
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{label}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={openPicker}
              title={hasFile ? replaceLabel : chooseLabel}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium border border-zinc-300 dark:border-zinc-700 bg-white/60 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
            >
              <FolderOpen className="w-4 h-4 landscape:hidden" />
              <span className="portrait:hidden">{hasFile ? replaceLabel : chooseLabel}</span>
            </button>
            {actions}
          </div>
          <span className={`min-w-0 truncate text-right text-sm ${hasFile ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-400 dark:text-zinc-500'}`}>
            {status}
          </span>
          {/* 清除按钮单独占最后一列；没有文件时留空位，状态列宽度不随之跳动 */}
          {hasFile && onClear ? (
            <button
              type="button"
              onClick={onClear}
              title={clearTitle}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <span className="w-8 h-8" />
          )}
        </>
      )}
    </DragDropWrapper>
  );
};
