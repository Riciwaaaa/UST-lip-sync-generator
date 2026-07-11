---
name: verify
description: 本仓库（浏览器端 canvas + ffmpeg.wasm 单页应用）的端到端验证方法
---

# 验证方法

## 启动

```bash
npm run dev   # Vite, 端口 3000（后台运行）
```

注意：`@ffmpeg/ffmpeg` 必须在 vite.config.ts 的 `optimizeDeps.exclude` 里，否则 dev 模式下
其内部 worker.js 会 404，FFmpeg 永远加载不了（生产构建不受影响）。

## 驱动（无需安装浏览器）

在 scratchpad 里 `npm i playwright-core gifenc`，用系统 Edge 无头驱动：

```js
const browser = await chromium.launch({ channel: 'msedge', headless: true });
```

关键手法（完整脚本可参考历史会话的 verify.mjs）：

- **上传文件不需要真实文件**：`setInputFiles({ name, mimeType, buffer })` 直接传 Buffer。
  UST 内容用纯文本构造（`[#SETTING]`/`Tempo=`/`[#0000]`/`Length=`/`Lyric=`）；
  动画 GIF 用 gifenc 在 Node 里生成两帧红蓝交替；PNG 可在页面里用 canvas.toDataURL 生成。
- **定位**：UST 输入 `input[accept=".ust,.ustx,.vsqx"]`；背景图输入是
  `input[type="file"][accept="image/*"]` 的 **last()**（前面若干个是嘴型格子）；
  延时补正输入 `input[type="number"][step="0.01"].w-24`；导出按钮按文本 `导出`。
- **首次进入有须知弹窗**，先点 `确认` 关闭。
- **画布断言读像素**：`canvas.getContext('2d').getImageData(...)`。注意没传嘴型图时
  画布上叠了半透明占位色块和字母，背景色不会是纯色 —— 断言用"alpha=255 + 通道相对强弱/
  采样值随时间变化"，别断言精确 RGB。
- **导出验证**：`context({ acceptDownloads: true })` + `page.waitForEvent('download')`，
  下载后检查文件头（mp4 含 `ftyp`，GIF 为 `GIF89a`）。FFmpeg wasm ~32MB，等导出按钮
  从 disabled 变为可用再点。
- Playwright `waitForFunction(fn, arg, options)` —— options 是第三个参数，别放第二个。

## 值得跑的流程

1. 导入 UST → 画布出现，拖动进度条口型变化
2. 先导背景再导 UST（历史回归点：曾因 effect 缺依赖导致画布全空）
3. GIF 背景在暂停状态下是否播放（历史回归点）
4. MP4 连续导出两次（历史回归点：MEMFS 残留导致第二次失败）
5. 延时补正逐字输入 `-0.5`（历史回归点：受控 number input 吞负号）
