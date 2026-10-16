import React, { useState, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  badge: ReactNode;
  title: ReactNode;
  // 标题栏右侧的按钮/说明，不随折叠隐藏
  extra?: ReactNode;
  // 折叠状态记在本机 localStorage 的这个 key 下；不传则该分区不可折叠，只复用同一套标题栏样式
  storageKey?: string;
  toggleTitle?: { collapse: string; expand: string };
  children: ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ badge, title, extra, storageKey, toggleTitle, children }) => {
  const [collapsed, setCollapsed] = useState(() => {
    if (!storageKey) return false;
    try { return localStorage.getItem(storageKey) === '1'; } catch { return false; }
  });

  const toggle = () => {
    if (!storageKey) return;
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch {}
  };

  const heading = (
    <>
      {badge}
      <h2 className="portrait:text-base landscape:text-xl font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
    </>
  );

  return (
    <section className="portrait:space-y-3 landscape:space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        {storageKey ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            title={toggleTitle ? (collapsed ? toggleTitle.expand : toggleTitle.collapse) : undefined}
            className="flex items-center gap-2 -ml-1 px-1 py-0.5 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 transition-colors"
          >
            <ChevronDown className={`w-4 h-4 text-zinc-400 dark:text-zinc-500 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
            {heading}
          </button>
        ) : (
          <div className="flex items-center gap-2 py-0.5">{heading}</div>
        )}
        {extra}
      </div>
      {!collapsed && children}
    </section>
  );
};
