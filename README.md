# 👄 UST/VSQX Lip Sync Generator (口型动画生成器)

> **🤖 AI Generated Project / AI 生成项目声明**
> 请注意，本项目的源代码（包括这份 README）全部为AI生成。但是，本工具本身并非 AI 生成类应用。所有的数据处理均在您的本地浏览器中完成。我无法获取、收集或存储您上传的任何内容。您的任何文件和数据都绝对不会被收集用于任何形式的 AI 训练。
> Please note that the codebase of this project (including this README) was generated with AI tools. However, this tool itself is not an AI application.
All your files are processed entirely locally in your browser. We do not collect, access, or store any of your uploaded content. Your files and data will NEVER be used for AI training.

A powerful, web-based tool for generating lip-sync animations automatically from Vocal Synth project files (`.ust`, `.ustx`, `.vsqx`) and custom mouth shape images. Perfect for VTubers, animators, and vocal synth creators.

## ✨ Features

- **Multi-Format Parsing**: Automatically extracts lyrics and timing from `.ust`, `.ustx` (OpenUtau), and `.vsqx` (VOCALOID) files to generate a precise animation timeline.
- **Track Selection**: Intelligently handles multi-track `.ustx` and `.vsqx` files, allowing you to choose exactly which vocal track to animate.
- **Custom Mouth Shapes**: Upload your own images for basic vowels (`a`, `i`, `u`, `e`, `o`, `default`) and even set specific overrides for special lyrics.
- **Background Support**: Add static images, animated GIFs, or solid colors as your background layer.
- **Audio Synchronization**: Import audio files to preview the lip-sync in real-time and mux them directly into the final video export.
- **Multi-Format Export**: 
  - **WebM**: Supports transparent backgrounds (uses real-time recording).
  - **MP4 / MOV / MKV**: High-quality video export powered by FFmpeg.wasm.
  - **GIF**: Export as an animated GIF.
- **Responsive & Draggable UI**: Fully optimized for mobile, tablet, and desktop with portrait/landscape auto-switching and a resizable workspace divider.
- **Dark Mode**: Comes with a sleek, custom-designed dark theme (deep purple/grey) that respects system preferences and saves to local storage.
- **Multi-Language**: Built-in support for English, Chinese (Simplified), and Japanese.

## 🚀 How to Use

1. **Step 1: Setup Actors**
   - Drag and drop your mouth shape images into the corresponding slots (a, i, u, e, o, default).
   - If your track contains special lyrics, you can upload specific override images for them.

2. **Step 2: Script & Assets**
   - **Project File**: Upload your `.ust`, `.ustx`, or `.vsqx` file. (If multi-track, a popup will ask you to select the desired track).
   - **Audio (Optional)**: Upload the matching audio track for preview and video export.
   - **Background (Optional)**: Upload a background image/GIF or pick a solid color.

3. **Step 3: Preview & Export**
   - Use the timeline scrubber and play button to preview the animation.
   - Adjust the **Audio Offset** if the audio and mouth movements are slightly out of sync.
   - Select your desired export format and click **Export Video**. Or, enter **Fullscreen Mode (⛶)** and use screen recording software directly (recommended for mobile users).

## ⚠️ Known Limitations

- **WebM Export with GIF Backgrounds**: Exporting to WebM while using an animated GIF background may result in the loss of the transparent channel. If you need a transparent background, it is recommended to use a static image, no background, or export directly to GIF format.
- **Mobile Performance**: High-resolution exports or very long audio files might hit mobile browser memory limits. If exporting fails on a mobile device, use the Fullscreen preview with your phone's native Screen Recorder.
- **Tab Switching**: WebM export uses a real-time recording fallback to mitigate memory constraints. Please do not switch tabs or minimize the browser during WebM export.

## 🛠️ Tech Stack

- **Frontend Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS v4 + Lucide React (Icons)
- **Video Processing**: FFmpeg.wasm (`@ffmpeg/ffmpeg`, `@ffmpeg/util`)
- **Parsers**: `xml2js` (for `.vsqx`), `js-yaml` (for `.ustx`), `omggif` (for GIFs)

## 📦 Local Development

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```

## 📄 License

MIT License
