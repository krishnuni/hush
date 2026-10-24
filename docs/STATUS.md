# Verification checkpoint — 23 October 2026

Implementation continued under the user's approval. The application and visual
system are original. No deployment, publication, public repository push or
public release occurred. This is a development checkpoint; platform and human
listening gates remain explicit.

## Executed evidence

| Check | Current result |
| --- | --- |
| TypeScript and Vite production build | Passed |
| Frontend unit/persistence/audio tests | 30 passed in 5 files |
| Rust storage/voice host including real opt-in inference | 15 passed: 12 storage, 1 validation, 2 real process tests |
| Real neural worker crash/reconnect | Passed: killed the worker, reconnected and synthesized again |
| Production desktop + phone reader suite | 6 passed: EPUB, PDF and corrupt import on both viewports |
| Real application media, desktop | Passed: non-silent PCM, highlight, pause, seek/speed, exact cached resume |
| EPUB natural cross-chapter audio | Passed on desktop and phone viewports, using real media-ended transitions |
| Phone real-neural UI | Passed: real app media, pause, sentence seek, speed, cached restart and chapter continuation |
| Offline app shell reopening EPUB/PDF | 2 passed: desktop and phone, networking disabled after shell installation |
| Native Tauri compilation check | Passed on Linux using local GTK/WebKit prerequisites |
| Native Linux executable | Built successfully, including the compiled frontend |
| Native window/IPC | Not executed: graphical-session setup is blocked because Unix display-socket creation returns EPERM |
| Optional voice-pack staging | Passed: model hashes, portable config, worker and attribution staged |
| Production npm dependency audit | 0 known advisories |
| Windows installer / clean machine | Not executed |
| Native Android/iOS applications | Not built or device-tested |
| Physical speaker/headphone listening | Not available in this environment |

Chromium 153.0.8010.0 is controlled by Playwright 1.64.1. Desktop viewport is
1440 × 960; phone tests use iPhone 13 dimensions in Chromium. This is not Safari
or an actual iPhone. Production reader cases use the compiled app; neural cases
use the private local development bridge and real Pocket TTS pack. Unit media
fakes are used only for controller race tests, never for a neural integration
claim. Twelve unique browser cases passed across reader, real-neural and offline
runs; targeted rechecks also cover finer EPUB progress after reflow. CI
definitions exist but remote CI has not been executed here.

## Implemented in this continuation

- SQLite import intent journal, streamed checksum verification, file sync,
  crash reconciliation and an exclusive library owner lock.
- Ordered 1 MiB native binary import chunks and raw binary document range reads,
  replacing full-file JSON number arrays. The renderer still assembles a full
  source buffer; a range-aware PDF loader is not yet implemented.
- A separate bounded disk audio cache with model/runtime/voice fingerprinting,
  stable clip keys and identical-waveform resume validation. Missing/changed
  clips resume at the source sentence with an explicit adjustment message.
- A framework-independent narration controller, media-clock seek, one-clip
  look-ahead, stale-job isolation and next-passage preparation.
- Source-aligned long Unicode speech chunks, full EPUB sentence highlights,
  nested prose/list mapping without repeated or missing text, and offscreen
  section cleanup on cancellation/error.
- PDF navigation completion after rendering, bookmark vertical-offset/zoom
  restoration, page rotation, and narration overlays over selectable text.
- Portable relative voice packs, verified bundle staging with attribution,
  native resource discovery and a two-attempt worker reconnect policy.
- Installable web manifest, versioned offline shell and a dependency-free
  loopback preview server for the included compiled reader.
- Stable accessible shelf-button names, responsive seek controls and finer
  EPUB progress locations for short books.

## Remaining release gates

The source is not a signed commercial release. Native compilation and linking
now succeed. Xvfb could not create its display sockets, and an independent Unix
socket probe returned EPERM, so native window/IPC testing could not run here.
No OS sandbox was disabled to force a launch. Native WebView, installer and
physical output-device tests remain required; browser playback is not proof of
native playback. The archive includes the compiled browser reader and a local
preview server, without model weights, native runtime libraries or a certified
installer.

Whole-chunk buffering with look-ahead can still gap when inference is slower
than playback. Native PCM streaming, device-calibrated DSP and sustained
CPU/RSS/thermal testing remain open. The model/voice quality has no fabricated
human listening score. Kokoro has not been executed in Hush.

The corpus covers original EPUBs and one original three-page PDF, plus fault,
Unicode, nested text and state cases. It does not certify every publisher,
language, complex PDF layout or password variant. Broader accessibility,
screen-reader and near-limit large-document testing remain required. A nonfatal
Chromium ResizeObserver notification can occur during EPUB layout changes;
it has not been silenced as a substitute for fixing its cause.

Native mobile document providers, background audio, lock-screen controls,
lifecycle restoration and on-device neural inference remain device-specific.
Responsive and offline browser tests establish mobile web potential only.
See ACCEPTANCE.md for measurable release criteria and ARCHITECTURE.md for the
implemented boundaries.
