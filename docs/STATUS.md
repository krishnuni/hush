# Verification checkpoint — 27 October 2026

Hush's primary distribution is now a static browser application for GitHub
Pages. Kokoro q8 synthesis runs in the browser worker, including on a phone
layout. The optional desktop host remains separate. The app is a development
build; the following evidence distinguishes execution from untested targets.

## Current browser evidence

| Check | Result |
| --- | --- |
| TypeScript/Vite production build at `/hush/` | Passed |
| Frontend import/mapping/storage/audio/manifest tests | 32 passed in 6 files |
| Production EPUB/PDF/corrupt-import flows | 6 passed: desktop and phone viewports |
| Real browser neural voice | 2 passed: desktop and phone viewports |
| Actual neural media | Non-silent PCM, sentence highlight, pause, seek and 0.75× playback passed |
| Offline neural reopening | Cached exact-clip position restored and next chapter synthesized/played without networking |
| Optional voice download | No model request before enable; pinned static files installed; no HTTP POST/external HTTP origin in the flow |
| Offline reader reopening | 2 passed: EPUB and PDF on desktop and phone |
| Production dependency audit | 0 known advisories |
| WebKit automation | 8 passed in GitHub CI: desktop/mobile reading and real browser neural voice; physical Safari not tested |
| Physical iOS/Android | Not executed |
| Speaker/headphone naturalness review | Not executed |
| Live Pages deployment | Build and deploy passed in run 40373280828, attempt 2; public HTTPS reader verified |

Local Chromium verification covered 10 production browser cases: six reader,
two real-neural and two offline. GitHub CI additionally passed eight WebKit
cases, for 18 browser cases plus 32 unit tests. Four optional desktop Pocket
bridge cases explicitly skip in the static browser run. Chromium 153.0.8010.0 is controlled by Playwright 1.64.1. Desktop
uses 1440 × 960; phone uses iPhone 13 dimensions in Chromium. This is not an
actual iPhone, Safari or physical Android test. The real-neural cases use the
compiled static application and Kokoro WASM, not the development Pocket bridge
or mocked synthesis. Unit media fakes are only for deterministic controller
race checks. PNG/WAV artifacts are produced by the integration tests.

## Remote and historical evidence

The repository is public and the [hosted reader](https://krishnuni.github.io/hush/)
is live. [Pages run 40373280828, attempt 2](https://github.com/krishnuni/hush/actions/runs/40373280828/attempts/2)
successfully built/deployed `65fbbe5` after Pages activation. The hosted smoke
check verified original EPUB import/rendering and voice asset installation and
runtime initialization. This does not add a physical-device listening claim.

The merged browser implementation `65fbbe5` passed [GitHub browser run
40335757205](https://github.com/krishnuni/hush/actions/runs/40335757205).
Its steps passed locked installation, 32 unit tests, the `/hush/` production
build, Chromium reading/neural tests (8), offline tests (2), and WebKit
reading/neural tests (8). The WebKit test projects use desktop Safari and
iPhone 13 profiles in Playwright WebKit 27.2 on Linux; they do not establish
physical iOS/Android performance or OS background-audio behavior.

The previous source revision `f6d3ee8` passed GitHub's reader job and native
storage/voice and compilation jobs on Linux and Windows (run 40101748707).
That was the earlier desktop-oriented revision; it is not evidence that the new
browser neural implementation passed remote CI. Its Pages build stopped at
configuration: Pages was not enabled (run 40101748786), before npm/build/test.
Those historical runs are separate from the browser-native CI evidence above.

Earlier local desktop evidence remains valid only for the unchanged optional
adapter: 15 Rust storage/voice cases including real Pocket inference and
worker reconnect, native Linux compilation/linking and verified pack staging.
A graphical native window could not launch in this environment because display
socket creation was restricted. No signed or clean-machine-certified installer,
native mobile build or physical listening result is claimed.

## Remaining checks

- Test Safari and Chrome on real phones; automated WebKit coverage has passed.
- Review audible quality, pronunciation, clipping and gaps using actual output
  devices; no invented human score is supplied.
- Measure first sound, warm throughput, memory, battery and thermal behavior on
  representative desktop/phone hardware, including low-memory worker failure.
- Broaden EPUB publisher/PDF layout, near-limit imports, keyboard and screen-
  reader coverage. The fixtures do not certify every document or language.
- Exercise offline storage eviction, version upgrades, long sessions and OS
  suspension; background/lock-screen audio remains an explicit limitation.

Whole-clip buffering and one-clip look-ahead can gap when inference is slower
than playback. Browser storage can be evicted. A nonfatal EPUB ResizeObserver
notification may occur during layout changes and is excluded narrowly from the
integration error assertion; unrelated page errors still fail the check.
