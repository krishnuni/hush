# MVP acceptance and release gates

These are measurable acceptance criteria, not promises that every gate has passed.
Executed evidence belongs in STATUS.md. Android/iOS, OCR, DRM removal, sync,
annotations, RSVP and intelligent explanations are outside the current MVP.

| Milestone | Acceptance criterion | Verification |
| --- | --- | --- |
| Product and identity | Original library/reader, quiet paper/night themes, consistent type/spacing, usable phone layout | Screen review, contrast/focus checks, viewport overflow assertions |
| Import/library | Valid EPUB/PDF imports; search/sort; immutable originals; duplicate/corrupt inputs leave no partial book | Import unit cases, real browser imports, Rust hash/journal tests |
| Documents | Chapters, prose, emphasis and illustrations render; PDF pages/text survive zoom/rotation | Real EPUB/PDF engines; fixture corpus; publisher/device compatibility matrix |
| Saved positions | Reopen the same CFI or PDF page/vertical offset after navigation/restart/reflow | Browser reopen, bookmark, typography and PDF offset tests; native lifecycle gate |
| Neural narration | Real local model produces audible, understandable output in the app | Real inference plus media PCM checks; physical listening remains mandatory |
| Audio continuity | Media-clock pause/seek/rate/volume; no stale audio after navigation; exact cache resume or explicit source fallback; cross-chapter continuation | Unit race tests, actual worker tests, natural media-ended browser transitions |
| Reliability/accessibility | Recoverable document/audio errors; reachable labelled controls; bounded imports/cache/jobs; no critical keyboard traps | Fault tests, screen-reader review, sustained CPU/RSS and lifecycle tests |
| Packaging | Reproducible native build; optional attributed voice pack; clean install/uninstall/restart | Native CI compilation; Windows clean-machine test; signing/distribution approval |

## Compatibility corpus before release

- Reflowable EPUB 2/3 with multiple spine sections, nested lists, quotations,
  inline emphasis, images, relative links, footnotes and embedded fonts.
- Text PDFs with mixed fonts, rotated pages, outlines and encryption/password
  variants; multicolumn PDFs must expose reading-order limits accurately.
- Corrupt ZIP/XML/PDF, malformed metadata, missing resources, unsupported DRM,
  hostile remote/script content, expansion bombs and interrupted imports.
- Long Unicode sentences, punctuation, abbreviations, dialogue, numbers, empty
  chapters/pages, missing/corrupt cache, changed model/voice and worker crashes.
- Windows WebView2, Linux WebKitGTK and a macOS WebView; keyboard-only use and
  at least one real screen reader. Chromium is not a substitute for these engines.

## Performance expectations to measure

Target an ordinary modern 4-core desktop with 8 GB RAM; no dedicated GPU should
be required for the chosen CPU inference path. The current earlier short probe
used roughly 645 MiB worker peak RSS. That is an observation on one Linux VM,
not a minimum-memory or thermal guarantee. The optional pack is roughly 226 MB.

Measure cold/warm model load, time to first sound, generation/real-time ratio,
cache hit, sustained worker/renderer RSS, CPU use and cancellation latency.
Require at most one inference and one future clip; cache limits are 128 MiB and
192 clips. Current source/expansion limits are safety bounds, not demonstrated
worst-case performance results. Benchmark long EPUBs and image-heavy PDFs near
those bounds before increasing limits or declaring large-document readiness.

Physical audio review must include gaps, clipping, pronunciation and naturalness.
Device mobile testing must separately include background audio, suspension,
termination, low memory, battery/thermal behavior and document-provider access.
Do not infer them from a responsive browser viewport or desktop-hosted narration.
