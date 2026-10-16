// 更新日志：新版本加在最前面。版本号遵循语义化版本 MAJOR.MINOR.PATCH（从 1.0.0 开始），
// 发布时同步修改 package.json 的 version。1.0.0 之前的更新只有日期。

export interface ChangelogEntry {
  version?: string;
  date: string; // YYYY-MM-DD
  items: Record<'zh' | 'en' | 'ja', string[]>;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.0',
    date: '2026-10-16',
    items: {
      zh: ['完善了音符的编辑功能', '重构了 UI'],
      en: ['Improved note editing', 'Redesigned the UI'],
      ja: ['ノートの編集機能を強化しました', 'UI を刷新しました'],
    },
  },
  {
    date: '2026-07-24',
    items: {
      zh: ['新增了预设导出/导入', '预览窗口右上角的标记显示现在可以点击隐藏了', '理论上现在导出失败的情况会少一点了'],
      en: [
        'Added preset export/import',
        'The label in the top-right corner of the preview window can now be clicked to hide',
        'Export failures should also be a bit less common now, in theory',
      ],
      ja: [
        'プリセットの書き出し・読み込み機能を追加しました',
        'プレビュー画面右上のラベル表示はクリックで非表示にできるようになりました',
        '理論上、エクスポート失敗も少し減っているはずです',
      ],
    },
  },
  {
    date: '2026-06-25',
    items: {
      zh: ['感谢ink老师贡献的ust在线搜索功能！'],
      en: ['Huge thanks to ink for contributing the ust online search feature!'],
      ja: ['ustオンライン検索機能を提供してくださったinkさんに、心より感謝いたします！'],
    },
  },
  {
    date: '2026-06-14',
    items: {
      zh: ['加了弹出窗口功能'],
      en: ['Added a pop-out window feature'],
      ja: ['ポップアウトウィンドウ機能を追加しました'],
    },
  },
  {
    date: '2026-04-19',
    items: {
      zh: ['现在也支持导入ustx/vsqx文件了！', '做了一点ui优化'],
      en: ['Now supports importing .ustx and .vsqx files!', 'Made a few UI improvements'],
      ja: ['新たに .ustx および .vsqx ファイルのインポートに対応しました！', 'UIも少し使いやすく改善しています'],
    },
  },
  {
    date: '2026-03-22',
    items: {
      zh: ['现在可以进入全屏模式直接录屏了，移动端导出失败可以试试这么做'],
      en: ['You can now enter fullscreen mode to record your screen directly. If exporting fails on mobile, you can try this method'],
      ja: ['フルスクリーンモードに入って直接画面録画ができるようになりました。モバイル端末でエクスポートに失敗する場合は、この方法をお試しください'],
    },
  },
];

// 当前版本 = 最新一条带版本号的记录
export const APP_VERSION = CHANGELOG.find(e => e.version)?.version ?? '';
