# Verification checkpoint — 26 October 2026

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
| WebKit/Safari | Test runner downloaded; launch blocked by unavailable host libraries; not passed locally |
| Physical iOS/Android | Not executed |
| Speaker/headphone naturalness review | Not executed |
| Live Pages deployment | Not yet established; see DEPLOYMENT.md |

These are 10 current production browser cases: six reader, two real-neural and
two offline. Chromium 153.0.8010.0 is controlled by Playwright 1.64.1. Desktop
uses 1440 × 960; phone uses iPhone 13 dimensions in Chromium. This is not an
actual iPhone, Safari or physical Android test. The real-neural cases use the
compiled static application and Kokoro WASM, not the development Pocket bridge
or mocked synthesis. Unit media fakes are only for deterministic controller
race checks. PNG/WAV artifacts are produced by the integration tests.

## Remote and historical evidence

The previous source revision `f6d3ee8` passed GitHub's reader job and native
storage/voice and compilation jobs on Linux and Windows (run 40101748707).
That was the earlier desktop-oriented revision; it is not evidence that the new
browser neural implementation passed remote CI. Its Pages build stopped at
configuration: Pages was not enabled (run 40101748786), before npm/build/test.
Current remote browser checks must be assessed on their own run and commit.

Earlier local desktop evidence remains valid only for the unchanged optional
adapter: 15 Rust storage/voice cases including real Pocket inference and
worker reconnect, native Linux compilation/linking and verified pack staging.
A graphical native window could not launch in this environment because display
socket creation was restricted. No signed or clean-machine-certified installer,
native mobile build or physical listening result is claimed.

## Remaining checks

- Execute WebKit automation in CI and test Safari and Chrome on real phones.
- Review audible quality, pronunciation, clipping and gaps using actual output
  devices; no invented human score is supplied.
- Measure first sound, warm throughput, memory, battery and thermal behavior on
  representative desktop/phone hardware, including low-memory worker failure.
- Broaden EPUB publisher/PDF layout, near-limit imports, keyboard and screen-
  reader coverage. The fixtures do not certify every document or language.
- Exercise offline storage eviction, version upgrades, long sessions and OS
  suspension; background/lock-screen audio remains an explicit limitation.
- Confirm a successful Pages run and reachable hosted artifact after repository
  settings/account verification permit publication.

Whole-clip buffering and one-clip look-ahead can gap when inference is slower
than playback. Browser storage can be evicted. A nonfatal EPUB ResizeObserver
notification may occur during layout changes and is excluded narrowly from the
integration error assertion; unrelated page errors still fail the check.
