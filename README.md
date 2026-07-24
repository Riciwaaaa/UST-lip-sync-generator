# 👄 UST/VSQX 口型动画生成器 · UST/VSQX Lip Sync Generator

**语言 / Language：[简体中文](#简体中文)（默认） ｜ [English](#english)**

> **🤖 AI 生成项目声明 / AI-Generated Project Notice**
>
> 本项目的源代码（包括这份 README）全部由 AI 生成。但本工具本身**并非** AI 应用：所有数据处理都在你的本地浏览器中完成，我无法获取、收集或存储你上传的任何内容，你的文件和数据绝不会被用于任何形式的 AI 训练。
>
> The codebase of this project (including this README) was generated with AI tools. However, the tool itself is **not** an AI application — all processing happens locally in your browser. Nothing you upload is collected, stored, or used for AI training.

---

<a id="简体中文"></a>

## 简体中文

一款纯前端的网页工具，可根据歌声合成工程文件（`.ust`、`.ustx`、`.vsqx`）与你自定义的嘴型图，自动生成口型动画视频。适合 VTuber、动画作者与歌声合成创作者。

**所有处理都在浏览器内完成**：没有后端、不上传任何文件、主功能无需任何 API Key 或环境变量。

### ✨ 功能特性

- **多格式解析**：自动从 `.ust`、`.ustx`（OpenUtau）、`.vsqx`（VOCALOID）中提取歌词与时值，生成精确时间轴。
- **多轨选择**：智能识别多轨工程，导入时可选择要生成口型的主唱轨。
- **自定义嘴型**：为 5 个基础元音（`a` `i` `u` `e` `o`）与闭嘴（`default`）上传图片，还能对特定单字做单独覆盖。
- **背景图层**：支持静态图片、动画 GIF、动画 WebP，或纯色背景。
- **音频同步**：导入音频可实时预览口型，并在导出时直接合流进视频。
- **多格式导出**：
  - **WebM**：支持透明背景（采用实时录制）。
  - **MP4 / MOV / MKV**：由 FFmpeg.wasm 在浏览器内编码。
  - **GIF**：导出为动画 GIF。
- **响应式界面**：适配手机 / 平板 / 桌面，横竖屏自动切换，工作区分隔线可拖拽。
- **深色模式**：内置深色主题，跟随系统偏好并记忆到本地。
- **多语言**：内置简体中文、English、日本語。

### 🚀 使用步骤

1. **第一步：设置嘴型** —— 把嘴型图拖入对应格子（a/i/u/e/o/闭嘴）；若歌词含特殊单字，可为其单独上传覆盖图。
2. **第二步：素材导入** —— 上传 `.ust` / `.ustx` / `.vsqx`（多轨会弹窗让你选轨）；可选导入音频与背景（图片 / GIF / WebP / 纯色）。
3. **第三步：预览与导出** —— 用进度条和播放键预览；若音画不同步用「延时补正」微调；选好格式点「导出视频」。移动端若导出失败，可进入**全屏模式（⛶）**用系统录屏。

### 📦 本地部署指南

#### 环境要求

- **Node.js ≥ 18**（推荐 20 LTS 或更高；Vite 6 需要 Node 18+）
- **npm**（随 Node 附带）
- 现代浏览器，推荐 **Chrome / Edge**（导出依赖的 FFmpeg.wasm 在这两者上最稳）

#### 一、开发模式（改代码 / 本地跑）

```bash
git clone https://github.com/Riciwaaaa/UST-lip-sync-generator.git
cd UST-lip-sync-generator
npm install
npm run dev
```

浏览器打开 **http://localhost:3000** 即可。主功能（口型生成、预览、视频导出）到这一步就完整可用了。

#### 二、生产构建 + 本地验证

```bash
npm run build      # 产物输出到 dist/
npm run preview    # 本地预览生产包(默认 http://localhost:4173)
```

#### 三、部署到静态托管（重点）

本项目是**纯静态单页应用**。因为使用的是**单线程** `@ffmpeg/core`，**不需要** `SharedArrayBuffer`，也就**不需要**配置 `COOP`/`COEP` 跨域隔离响应头 —— 因此 `dist/` 可以直接丢到**任意**静态服务器，无需任何特殊配置：

```bash
npm run build
npx serve dist            # 或
cd dist && python -m http.server 8080
```

把 `dist/` 上传到 GitHub Pages、Netlify、Cloudflare Pages、Nginx、对象存储等任意静态托管即可。

> ⚠️ 注意 `dist/` 内含约 **32 MB** 的 `ffmpeg-core.wasm`（导出功能所需）。首次导出时浏览器会下载它，请确保托管服务允许 `.wasm` 文件并保留该资源。

**一键部署到 Vercel**：直接导入本仓库即可。`vercel.json` 已配置好单页路由重写；「在线搜索 UST」用到的 serverless 函数（`api/search-ust.ts`）也会自动生效。

#### 四、（可选）在线搜索 UST 功能

「在线搜索 UST」会调用一个本地小型 API 服务。开发时需**另开一个终端**运行：

```bash
npm run dev:api          # Express 服务,默认端口 3001
```

Vite 会把 `/api/*` 代理到它。默认端口被占用时，在 `.env` 里设置 `DEV_API_PORT`（参见 `.env.example`）。**不跑它只会让「在线搜索」不可用，其它功能照常。** 部署到 Vercel 时该功能由 serverless 函数提供，无需单独处理。

#### 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器（端口 3000） |
| `npm run dev:api` | 启动在线搜索的本地 API（端口 3001，可选） |
| `npm run build` | 生产构建到 `dist/` |
| `npm run preview` | 本地预览生产构建 |
| `npm run lint` | 仅类型检查（`tsc --noEmit`，无测试运行器） |

#### 常见问题

- **导出按钮点了没反应 / 卡在 0%**：FFmpeg.wasm 约 32 MB，首次导出需下载，请等待其加载；网络不佳时可刷新重试（已内置自动重试）。
- **导出到一半失败**：优先用 PC 端 Chrome / Edge；关闭多余标签页释放内存；超长视频或超大音频容易触及浏览器内存上限。若某格式不行，换个格式，或用全屏模式录屏兜底。
- **端口被占用**：开发端口 3000 由 `npm run dev` 决定，可改 `package.json` 的 `dev` 脚本；API 端口用 `DEV_API_PORT` 调整。
- **移动端不稳定**：视频渲染很吃内存，强烈建议在 PC 端浏览器导出，或用手机系统录屏配合全屏预览。

### 🛠️ 技术栈

- **前端框架**：React 19 + TypeScript + Vite 6
- **样式**：Tailwind CSS v4 + Lucide React（图标）
- **视频处理**：FFmpeg.wasm（单线程 `@ffmpeg/core`，无需跨域隔离）
- **解析 / 编解码**：`js-yaml`（`.ustx`）、浏览器原生 `DOMParser`（`.vsqx`）、`gifuct-js` + `gifenc`（GIF 解码 / 编码）、原生 `ImageDecoder`（动画 WebP）

### ⚠️ 已知限制

- **WebM + GIF 背景**：以动画 GIF 作背景导出 WebM 时可能丢失透明通道。需要透明背景请改用静态图 / 无背景，或直接导出 GIF。
- **移动端性能**：高分辨率或超长音频导出可能触及移动端内存上限。移动端导出失败时，请用全屏预览 + 手机系统录屏。
- **切换标签页**：WebM 采用实时录制以规避内存问题，录制期间请勿切换标签页或最小化窗口（MP4/MOV/MKV/GIF 的离线导出不受此限制）。

### 📮 联系方式

- B 站 UID：487559302 ／ email：riciwaaaa@gmail.com
- 使用他人配布的 UST 制作并发布内容时，请标注原作者。可在 BowlRoll 等站点找到公开配布的 UST。

### 📄 许可证

MIT License

---

<a id="english"></a>

## English

A browser-based tool that automatically generates lip-sync animation videos from vocal-synth project files (`.ust`, `.ustx`, `.vsqx`) and your own mouth-shape images. Great for VTubers, animators, and vocal-synth creators.

**Everything runs in your browser** — no backend, no uploads, and no API keys or environment variables for the core features.

### ✨ Features

- **Multi-format parsing**: extracts lyrics and timing from `.ust`, `.ustx` (OpenUtau), and `.vsqx` (VOCALOID) into a precise timeline.
- **Track selection**: detects multi-track projects and lets you pick which vocal track to animate.
- **Custom mouth shapes**: upload images for the five vowels (`a` `i` `u` `e` `o`) and the closed mouth (`default`), plus per-lyric overrides.
- **Background layer**: static images, animated GIFs, animated WebP, or a solid color.
- **Audio sync**: import audio to preview in real time and mux it into the exported video.
- **Multi-format export**:
  - **WebM**: supports transparent backgrounds (real-time recording).
  - **MP4 / MOV / MKV**: encoded in-browser via FFmpeg.wasm.
  - **GIF**: export as an animated GIF.
- **Responsive UI**: mobile / tablet / desktop, auto portrait–landscape switching, draggable workspace divider.
- **Dark mode**: built-in dark theme that follows system preference and persists locally.
- **Multi-language**: English, Simplified Chinese, and Japanese.

### 🚀 How to Use

1. **Step 1 — Actors**: drag mouth-shape images into the a/i/u/e/o/closed slots; add per-lyric override images if needed.
2. **Step 2 — Assets**: upload your `.ust` / `.ustx` / `.vsqx` (a picker appears for multi-track files); optionally add audio and a background (image / GIF / WebP / solid color).
3. **Step 3 — Preview & Export**: scrub and play to preview; use **Audio Offset** to fix any A/V drift; choose a format and click **Export Video**. On mobile, use **Fullscreen mode (⛶)** with your device's screen recorder if export fails.

### 📦 Local Deployment Guide

#### Requirements

- **Node.js ≥ 18** (20 LTS+ recommended; Vite 6 needs Node 18+)
- **npm** (bundled with Node)
- A modern browser — **Chrome / Edge** recommended (most reliable for FFmpeg.wasm export)

#### 1. Development

```bash
git clone https://github.com/Riciwaaaa/UST-lip-sync-generator.git
cd UST-lip-sync-generator
npm install
npm run dev
```

Open **http://localhost:3000**. That's all you need for the core features (lip-sync, preview, export).

#### 2. Production build + local preview

```bash
npm run build      # outputs to dist/
npm run preview    # preview the build (default http://localhost:4173)
```

#### 3. Static hosting (important)

This is a **pure static SPA**. Because it uses the **single-threaded** `@ffmpeg/core`, it does **not** need `SharedArrayBuffer` and therefore does **not** require `COOP`/`COEP` cross-origin-isolation headers — so `dist/` can be dropped onto **any** static host with no special config:

```bash
npm run build
npx serve dist            # or
cd dist && python -m http.server 8080
```

Upload `dist/` to GitHub Pages, Netlify, Cloudflare Pages, Nginx, object storage — anything.

> ⚠️ `dist/` includes a ~**32 MB** `ffmpeg-core.wasm` (required for export). The browser downloads it on first export, so make sure your host serves `.wasm` files and keeps that asset.

**One-click Vercel deploy**: import the repo as-is. `vercel.json` already sets up SPA rewrites, and the serverless function for online UST search (`api/search-ust.ts`) works automatically.

#### 4. (Optional) Online UST search

The "Search UST Online" feature calls a small local API server. In development, run it in a **separate terminal**:

```bash
npm run dev:api          # Express server, default port 3001
```

Vite proxies `/api/*` to it. Override the port via `DEV_API_PORT` in a `.env` file (see `.env.example`) if 3001 is taken. **Skipping it only disables online search; everything else works.** On Vercel this is handled by the serverless function.

#### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server (port 3000) |
| `npm run dev:api` | Local API for online search (port 3001, optional) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | Type-check only (`tsc --noEmit`; no test runner) |

#### Troubleshooting

- **Export button does nothing / stuck at 0%**: FFmpeg.wasm is ~32 MB and downloads on first export — wait for it, or refresh on a flaky connection (auto-retry is built in).
- **Export fails midway**: prefer desktop Chrome / Edge; close extra tabs to free memory; very long videos or huge audio can hit browser memory limits. If one format fails, try another or fall back to fullscreen screen recording.
- **Port already in use**: the 3000 dev port lives in the `dev` script in `package.json`; change the API port via `DEV_API_PORT`.
- **Unstable on mobile**: rendering is memory-heavy — export on desktop, or use fullscreen preview + your phone's native screen recorder.

### 🛠️ Tech Stack

- **Framework**: React 19 + TypeScript + Vite 6
- **Styling**: Tailwind CSS v4 + Lucide React (icons)
- **Video processing**: FFmpeg.wasm (single-threaded `@ffmpeg/core`, no cross-origin isolation required)
- **Parsing / codecs**: `js-yaml` (`.ustx`), native `DOMParser` (`.vsqx`), `gifuct-js` + `gifenc` (GIF decode/encode), native `ImageDecoder` (animated WebP)

### ⚠️ Known Limitations

- **WebM + GIF background**: exporting WebM with an animated GIF background may drop the transparent channel. For transparency, use a static image / no background, or export GIF.
- **Mobile performance**: high-resolution or very long exports may hit mobile memory limits — use fullscreen preview + native screen recorder.
- **Tab switching**: WebM uses real-time recording; don't switch tabs or minimize during WebM export (offline MP4/MOV/MKV/GIF export is unaffected).

### 📮 Contact

- Bilibili UID 487559302 / email: riciwaaaa@gmail.com
- When publishing content made with someone else's UST, please credit the original author. Public USTs can be found on sites like BowlRoll.

### 📄 License

MIT License
