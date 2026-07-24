# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server on port 3000 (all interfaces)
npm run build    # Production build
npm run lint     # Type-check only (tsc --noEmit) — no test runner is configured
npm run preview  # Preview production build
```

## Architecture

This is a **single-page React app** — almost all logic lives in `src/App.tsx` (~1700+ lines). There is one helper component (`src/components/DragDropWrapper.tsx`).

### Data flow

1. **File parsing** → three inline functions handle each format:
   - `parseUst(content)` — plain-text INI-like sections, uses `encoding-japanese` for Shift-JIS detection
   - `parseUstx(content)` — YAML via `js-yaml`
   - `parseVsqx(content)` — XML via browser `DOMParser`
   - All three produce `ParsedUst` (`{ tempo, notes: NoteData[] }`) and call `setParsedData`
   - Multi-track files show a track selector modal first; `handleTrackSelection` finalises the parse

2. **Lyric → mouth shape mapping** → `getMouthShape(lyric)` maps Japanese kana and Latin vowels to `MouthShape` (`'a'|'i'|'u'|'e'|'o'|'default'`). Per-lyric image overrides stored in `overrideImages` state take precedence over the five base vowel images.

3. **Canvas rendering loop** → `requestAnimationFrame` loop reads `parsedDataRef` to find the active note at the current playhead position and calls `drawFrame()` on `canvasRef`. Both `parsedDataRef` and `isPlayingRef` are ref-mirrors of the corresponding state values so the RAF closure always sees fresh data without re-registration.

4. **Export pipeline** (all in-browser, no server):
   - **WebM** — `MediaRecorder` on the canvas stream + optional audio mux via `FFmpeg.wasm` post-recording. Recording stops when playback reaches the note timeline's end (`isPlayingRef` flips false), with a wall-clock fallback.
   - **MP4/MOV/MKV** — frames rendered directly to an off-screen target canvas (`drawScene`) → JPEG blobs → written to `FFmpeg.wasm` MEMFS in ≤600-frame segments → each segment encoded to mp4 → a single final `exec` concats all segments and muxes audio in one pass (`-f concat` + `-map 0:v:0 -map 1:a:0`), avoiding an extra full-size intermediate copy.
   - **GIF** — frame-by-frame canvas renders encoded with a pure-JS GIF encoder (`gifenc`) using one shared global palette + a dedicated transparent slot.
   - All `ffmpeg.exec` calls go through `execChecked`, which throws (with a log tail) on non-zero exit instead of letting a later `readFile` mis-report the failure. Export loops yield via `yieldToMain()` (MessageChannel, not `setTimeout(0)`) so a backgrounded tab isn't throttled to a crawl.
   - Uses the **single-threaded** `@ffmpeg/core` (imported via `?url`), so `SharedArrayBuffer` / cross-origin isolation is **not** required and `vercel.json` deliberately sets no COOP/COEP headers — its only role is the SPA rewrite. FFmpeg is lazy-loaded/retried through `ensureFFmpeg()`.

5. **State management** — no external store; everything is `useState`/`useRef` in the single `App` component. Refs mirror state for values read inside RAF callbacks or async export loops.

### Key constraints

- **`TICKS_PER_BEAT = 480`** — UST tick resolution; all timing math converts ticks → ms using this constant and the parsed tempo.
- **Canvas dimensions for video export** must be even (`& ~1`) — libx264 + `yuv420p` rejects odd width/height. Custom canvas size is clamped to `[16, 4096]` in `calculateCanvasSize`.
- **Animated backgrounds/mouths** (GIF via `gifuct-js`, animated WebP via the native `ImageDecoder`) are decoded frame-by-frame into pre-rendered `HTMLCanvasElement` arrays (`GifFrame[]`) to avoid per-frame decompression during playback. `parseAnimatedFrames()` is the shared entry point; static images fall back to `new Image()`.

### i18n

Translations for `zh`, `en`, `ja` are a single `i18n` object at the top of `App.tsx`. The active locale is `language` state, accessed via `const t = i18n[language]`.
