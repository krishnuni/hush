# Verification record — 2 November 2026

The redesigned browser edition is built for GitHub Pages at `/hush/`. This record separates executed local evidence, the configured remote gates and checks that need real devices.

The voice-selection update was verified on 2 November with 37 unit tests, a `/hush/` production build, 16 Chromium reader/interface/neural cases and 2 offline cases. The screenshot set now contains 15 real interface captures, including voice setup, narration and preview. The final phone-sheet refinements also repeat the interface/accessibility checks.

## Executed local checks

| Check                                                             | Result                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript and production Vite build at `/hush/`                  | Passed                                                                                                                                                                                                                                                                              |
| Import, mapping, persistence, audio-controller and manifest units | 37 passed in 7 files                                                                                                                                                                                                                                                                |
| Chromium reader flows                                             | 6 passed: EPUB/import/chapters/appearance/bookmarks/reload; PDF text/page/zoom/scroll/rotation restoration; corrupt imports, on desktop and phone sizes                                                                                                                             |
| Interface and accessibility flows                                 | 6 passed: search/edit persistence, filters, modal focus containment/return, iframe arrow navigation, focus mode, keyboard bookmark and axe A/AA checks                                                                                                                              |
| Real neural flows                                                 | 4 passed: actual Kokoro WASM inference; distinct voice WAVs and non-silent media; incremental profile downloads; saved choices and offline voice changes; source-preserving narrator changes; highlight, pause/rate/seek, exact-clip resume, chapter continuation and PDF narration |
| Offline reader                                                    | 2 passed: EPUB and PDF reopened without networking, desktop and phone                                                                                                                                                                                                               |
| Optional model                                                    | No ONNX/WASM/voice request before explicit enable; pinned byte/hash validation; no narration HTTP POST or external HTTP origin in the actual inference test                                                                                                                         |
| Production dependency audit                                       | 0 known advisories (`npm audit --omit=dev`)                                                                                                                                                                                                                                         |
| Rendered visual review                                            | Desktop 1440 × 1040, phone 390 × 844 and ultrawide 3440 × 1440; actual production screenshots; no overflow or page errors in capture                                                                                                                                                |

The local browser total is **18 passed**: 16 reader/interface/neural cases and 2 offline cases. Four optional desktop Pocket-bridge cases are explicitly skipped in the static browser run. They are not silently counted as browser neural passes. Chromium 153.0.8010.0 was controlled by Playwright 1.64.1; the phone project uses an iPhone 13 viewport/profile in Chromium. Source/rendering changes prompted reruns, including a repeated EPUB startup/focus check while resolving its initial-location race.

## Remote verification and deployment gates

The preceding redesign passed [its full CI run](https://github.com/krishnuni/hush/actions/runs/41449953803) with 32 unit and 30 browser cases, then [deployed successfully](https://github.com/krishnuni/hush/actions/runs/41451226325). The voice-choice update adds the cases below.

The [browser workflow](https://github.com/krishnuni/hush/actions/workflows/verify.yml) records results for each pushed/PR revision. It installs the standard Playwright Chromium and WebKit builds and executes:

| Suite                                                                | Configured cases                                    |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| Chromium reading, interface and actual neural inference              | 16, plus 4 explicitly skipped optional Pocket cases |
| Offline EPUB/PDF                                                     | 2                                                   |
| WebKit desktop/mobile reading, interface and actual neural inference | 16                                                  |

That is **34 browser cases configured across both engines**, alongside 37 unit tests. Use the workflow result for the exact commit to establish remote execution, rather than treating the configured count as a success claim. Browser evidence artifacts include actual PNG and WAV files. The [Pages workflow](https://github.com/krishnuni/hush/actions/workflows/pages.yml) separately rebuilds and gates `main` publication on unit, Chromium reading/interface/neural and offline checks.

WebKit 27.2 also passed six repeated local contrast checks across desktop and phone layouts after its required system libraries were prepared. The contrast test waits for nested text to adopt the selected theme before measuring it; the entire axe scan remains enabled. The full WebKit document and inference suites run in CI on Ubuntu. Automated WebKit on Linux is still distinct from physical Safari/iOS.

## What these tests establish

The neural test uses the actual bundled model and worker. It measures non-silent PCM from Hush's media stream, resets the measurement before the PDF segment, checks source-aligned highlights and naturally enters the next EPUB chapter. It verifies offline exact-WAV resume and checks requests for HTTP POSTs or external origins. The voice-choice test hashes actual generated WAVs, measures output from two narrators, counts the engine/profile requests and reopens saved choices offline. The reader test changes narrators with an existing listening checkpoint and retains the source sentence and speed. Unit fakes cover deterministic media-controller races and installer failures; they do not establish neural synthesis.

The screenshot script operates the real UI, imports the actual original EPUBs and optionally installs/runs the real voice. It does not insert fake playback state, progress or library records. The mobile and ultrawide images are screenshots of responsive layouts, not a physical-device certification.

## Remaining limitations

- Physical iPhone/Android audio output has not been certified. The reported iPhone “playing but silent” problem still needs a device-level check; this visual redesign does not claim it fixed.
- OS suspension, lock-screen/background playback, battery, memory and thermal behaviour need representative real hardware. Keep Hush open while listening.
- Long sessions, browser-storage eviction, version upgrades, near-limit books, multilingual publications and complex PDF reading orders require broader fixtures and device review.
- Axe passes cover the exercised screens/themes, not complete accessibility certification. Screen-reader review is a separate check.
- Whole-clip buffering and one-clip look-ahead can gap when a device synthesizes more slowly than playback. Browser storage can be evicted. Keep source books.
- The optional Tauri/Pocket host is retained and is not part of the Pages release or newly certified by this interface work.

A narrowly excluded EPUB ResizeObserver notification may occur during layout changes. Other page errors still fail the integration/capture checks. No cloud sync, OCR, RSVP, sleep detection, native mobile packaging or guaranteed background audio is claimed.
