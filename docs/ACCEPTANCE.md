# Browser release acceptance criteria

These are measurable criteria, not a claim that every gate has passed. Executed
results and exact engine/device boundaries are recorded in STATUS.md. GitHub
Pages is the primary target; Tauri packaging is an optional separate target.

| Area | Criterion | Verification |
| --- | --- | --- |
| Static hosting | One build works under `/` and a Pages project path without server endpoints, custom headers or desktop helpers | Subpath production build and hosted smoke test |
| Import/library | EPUB/PDF import, duplicates, search/sort, saved originals and no partial state after failure | Unit transactions and real browser imports |
| Reader | Reflowable EPUB and selectable PDF render; navigation, themes and typography work on desktop/phone | Actual engines, corpus, overflow/focus checks |
| Saved state | Restore CFI or PDF page/offset/zoom; reading/listening checkpoints remain distinct | Reopen, bookmark, reflow and audio-cache tests |
| Neural execution | Explicit voice setup; actual local WASM output; no remote text inference request | Real production worker, non-silent media PCM and network assertions |
| Audio controls | Pause, sentence seek, speed/volume, highlight, stale-result isolation, exact cache resume/fallback and chapter continuation | Race unit tests and actual media-ended transitions |
| Offline | Shell, imported EPUB/PDF and installed voice reopen without networking | Separate fresh-page offline reader and neural tests |
| Recovery | Bounded jobs/cache/imports, integrity failure/retry/cancel feedback, removable voice | Manifest validation, fault tests and real storage/memory device checks |
| Mobile | Usable touch layout and browser audio on physical iOS/Android | Viewport automation plus real Safari/Chrome hardware gate |
| Accessibility | Labelled controls, keyboard navigation, visible focus and screen-reader usability | Automated assertions plus manual assistive-technology review |
| Documentation | Reproducible setup/deploy commands, rationale, privacy, licences and honest evidence | README/source/workflow review |

## Compatibility corpus

- Reflowable EPUB 2/3 with multiple sections, nested lists, quotations, inline
  emphasis, images, relative links, footnotes and embedded fonts.
- Text PDFs with mixed fonts, rotated pages, outlines, password variants and
  multicolumn reading-order limitations; scanned PDFs must not suggest OCR.
- Corrupt ZIP/XML/PDF, missing resources, unsupported DRM, hostile remote/script
  content, expansion bombs and interrupted imports.
- Unicode, punctuation, dialogue, numbers, long/empty passages, missing/corrupt
  audio, changed engine and low-memory worker failure.
- Chromium and WebKit automation; actual Safari/iOS and Chrome/Android;
  desktop keyboard use and at least one real screen reader.

## Resource/performance measurement

The browser voice pack is 114,527,513 bytes, including the 92,361,116-byte q8
model. These are transfer/storage sizes, not RAM requirements. Single-thread
WASM is the baseline; no dedicated GPU or cross-origin-isolation headers are
required. Exact minimum device memory has not been established.

Measure cold/warm model initialization, time to first sound, generation versus
playback duration, cache hit, peak memory, sustained CPU and cancellation
latency. The pipeline permits one active computation plus one replaceable
pending seek; clip storage is capped at 128 MiB and 192 clips. Test long EPUBs
and image-heavy PDFs near the documented bounds before declaring large-document
readiness. Physical audio review should cover gaps, clipping and pronunciation.

Mobile checks additionally cover tab suspension, screen lock, storage eviction,
low memory, audio route changes, battery and thermal behavior. Guaranteed
background/lock-screen audio, cloud sync, OCR, DRM removal and native mobile
packaging are outside this browser release.
