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

This is a **single-page React app** — almost all logic lives in `src/App.tsx` (~3400 lines). Helper components live in `src/components/` (`DragDropWrapper`, `UstSearchModal`, `NoteTimeline`, `CollapsibleSection`, `ImportRow`); the note data model and its pure helpers live in `src/lib/notes.ts`.

The page is a **single centred column** (`max-w-4xl`, one scroll container `<main>`), top to bottom: import rows (project / audio / background, each an `ImportRow` sharing columns via CSS subgrid — the parent must use `IMPORT_ROWS_GRID`; online UST search lives in the project row) → mouth shapes → lyric overrides → preview & export. Sections use `CollapsibleSection` (icon badges, no step numbers); mouth shapes and overrides are collapsible, with the state kept in localStorage (`mouthSectionCollapsed`, `overrideSectionCollapsed`). The note timeline's own collapse is deliberately not persisted — it always opens expanded. Layout switches on the `portrait:` / `landscape:` variants (viewport orientation, not width): portrait hides the header bar and shows a small in-page title plus a fixed button row.

### Data flow

1. **File parsing** → three inline functions handle each format:
   - `parseUst(content)` — plain-text INI-like sections, uses `encoding-japanese` for Shift-JIS detection
   - `parseUstx(content)` — YAML via `js-yaml`
   - `parseVsqx(content)` — XML via browser `DOMParser`
   - All three build `NoteData[]` (`{ id, lyric, startTimeMs, durationMs }`) and hand it to `loadParsedData`, which records `endMs` (song length incl. rests), **drops R rest notes** (`isRestLyric` — a gap renders the same `default` mouth), and produces `ParsedUst` (`{ tempo, notes, endMs }`). `notes` stay sorted by start time and editing never creates overlaps.
   - Timeline length is always `getTimelineEndMs(data)` (max of `endMs` and the last note end) — don't use "last note's end", since trailing rests are gone.
   - Multi-track files show a track selector modal first; `handleTrackSelection` finalises the parse

2. **Note editor** → `src/components/NoteTimeline.tsx`, mounted under the preview scrubber. UTAU-style single-lane piano roll: drag to move/resize (clamped at neighbours via `constrainEdit` — no overlap, no ripple), double-click to add / edit lyric, Delete, undo/redo (snapshot stack inside the component, reset by remounting with `key={notesLoadId}`), BPM + snap grid. Every edit goes through `applyParsedData` in `App`, which updates state + ref and redraws the paused canvas. Disabled while exporting because export loops read `parsedDataRef` live.

3. **Lyric → mouth shape mapping** → `getMouthShape(lyric)` (in `src/lib/notes.ts`) maps Japanese kana and Latin vowels to `MouthShape` (`'a'|'i'|'u'|'e'|'o'|'default'`). Per-lyric image overrides stored in `overrideImages` state take precedence over the five base vowel images.

4. **Canvas rendering loop** → `requestAnimationFrame` loop reads `parsedDataRef` and calls `findActiveNote` (reverse scan + `+`/`-` slur inheritance) to find the active note at the current playhead position and calls `drawFrame()` on `canvasRef`. Both `parsedDataRef` and `isPlayingRef` are ref-mirrors of the corresponding state values so the RAF closure always sees fresh data without re-registration.

5. **Export pipeline** (all in-browser, no server):
   - **WebM** — `MediaRecorder` on the canvas stream + optional audio mux via `FFmpeg.wasm` post-recording. Recording stops when playback reaches the note timeline's end (`isPlayingRef` flips false), with a wall-clock fallback.
   - **MP4/MOV/MKV** — frames rendered directly to an off-screen target canvas (`drawScene`) → JPEG blobs → written to `FFmpeg.wasm` MEMFS in ≤600-frame segments → each segment encoded to mp4 → a single final `exec` concats all segments and muxes audio in one pass (`-f concat` + `-map 0:v:0 -map 1:a:0`), avoiding an extra full-size intermediate copy.
   - **GIF** — frame-by-frame canvas renders encoded with a pure-JS GIF encoder (`gifenc`) using one shared global palette + a dedicated transparent slot.
   - All `ffmpeg.exec` calls go through `execChecked`, which throws (with a log tail) on non-zero exit instead of letting a later `readFile` mis-report the failure. Export loops yield via `yieldToMain()` (MessageChannel, not `setTimeout(0)`) so a backgrounded tab isn't throttled to a crawl.
   - Uses the **single-threaded** `@ffmpeg/core` (imported via `?url`), so `SharedArrayBuffer` / cross-origin isolation is **not** required and `vercel.json` deliberately sets no COOP/COEP headers — its only role is the SPA rewrite. FFmpeg is lazy-loaded/retried through `ensureFFmpeg()`.

6. **State management** — no external store; everything is `useState`/`useRef` in the single `App` component. Refs mirror state for values read inside RAF callbacks or async export loops.

### Key constraints

- **`TICKS_PER_BEAT = 480`** — UST tick resolution; all timing math converts ticks → ms using this constant and the parsed tempo.
- **Canvas dimensions for video export** must be even (`& ~1`) — libx264 + `yuv420p` rejects odd width/height. Custom canvas size is clamped to `[16, 4096]` in `calculateCanvasSize`.
- **Animated backgrounds/mouths** (GIF via `gifuct-js`, animated WebP via the native `ImageDecoder`) are decoded frame-by-frame into pre-rendered `HTMLCanvasElement` arrays (`GifFrame[]`) to avoid per-frame decompression during playback. `parseAnimatedFrames()` is the shared entry point; static images fall back to `new Image()`.

### i18n

Translations for `zh`, `en`, `ja` are a single `i18n` object at the top of `App.tsx`. The active locale is `language` state, accessed via `const t = i18n[language]`. Components under `src/components/` keep their own `i18nTexts` dictionary and receive `language` as a prop.

### Versioning & changelog

- `src/changelog.ts` is the single source for the in-app changelog (notice modal) and the displayed version (`APP_VERSION` = newest entry that has a `version`). Entries are newest-first, each with `date` (YYYY-MM-DD) and per-language `items`; entries before 1.0.0 have no version.
- Versions follow semver starting at **1.0.0** (2026-10-16): bug fixes → PATCH (1.0.1), new features → MINOR (1.1.0), breaking changes such as an incompatible preset format → MAJOR (2.0.0).
- To release: add the entry at the top of `CHANGELOG` and bump `package.json` with `npm version <x.y.z> --no-git-tag-version` so both agree. The changelog text is the author's own wording — don't rewrite it.
