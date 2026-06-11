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
   - **WebM** — `MediaRecorder` on the canvas stream + optional audio mux via `FFmpeg.wasm` post-recording
   - **MP4/MOV/MKV** — frames rendered to off-screen canvas → PNG blobs → passed to `FFmpeg.wasm` as an image sequence → `ffmpeg -r <fps> -i frame%d.png`
   - **GIF** — frame-by-frame canvas renders encoded with a pure-JS GIF encoder built inline
   - FFmpeg.wasm requires `crossOriginIsolated === true`; `vercel.json` sets the required COOP/COEP headers

5. **State management** — no external store; everything is `useState`/`useRef` in the single `App` component. Refs mirror state for values read inside RAF callbacks or async export loops.

### Key constraints

- **`TICKS_PER_BEAT = 480`** — UST tick resolution; all timing math converts ticks → ms using this constant and the parsed tempo.
- **Cross-origin isolation** is required for `SharedArrayBuffer` (FFmpeg.wasm). The `vercel.json` rewrite config exists to keep SPA routing intact alongside the COOP/COEP headers Vercel applies.
- **GIF backgrounds** are decoded frame-by-frame via `gifuct-js` and stored as pre-rendered `HTMLCanvasElement` arrays (`GifFrame[]`) to avoid per-frame decompression during playback.
- `GEMINI_API_KEY` is defined in `vite.config.ts` from `.env` but is **not actively used** by any current component — the dependency (`@google/genai`) is in `package.json` but the API is not wired up.

### i18n

Translations for `zh`, `en`, `ja` are a single `i18n` object at the top of `App.tsx`. The active locale is `language` state, accessed via `const t = i18n[language]`.
