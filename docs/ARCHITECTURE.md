# Hush browser architecture

The primary application is a static React/TypeScript build for GitHub Pages.
Import, document rendering, persistence, neural synthesis and playback execute
in the visitor's browser on desktop and mobile. Node is a build/preview tool;
there is no deployed Node/Rust/Python server. Tauri and the Pocket TTS process
remain optional desktop adapters, outside the Pages execution path.

## Document boundary

`ReaderHandle` separates EPUB.js and PDF.js from the React controls. EPUB
locators contain a CFI plus section/href context; PDF locators retain page,
vertical offset, rotation and zoom. Percentages are presentation information.
A PDF navigation promise resolves after rendering and offset restoration.
Returning to the library flushes pending state before closing the reader.

Imports validate format, paths, entry count, declared and actual inflated
sizes. Limits are 50 MiB originals, 256 MiB expanded EPUB, 32 MiB resources,
5,000 archive entries and 2,000 PDF pages. A sanitized rendering copy removes
EPUB scripts, event handlers and remote resources. Fixed-layout EPUB and DRM
are rejected. Original managed bytes remain separate and never overwrite a
user's source file. Scanned PDFs have no OCR; extracted text order is exposed
for review. The renderer still assembles a full bounded source buffer.

## Browser storage and offline shell

Book metadata and original bytes are committed together in IndexedDB. Settings,
bookmarks, semantic positions and independent listening checkpoints remain
local to this origin/browser/device. There is no book upload endpoint or sync.

The build creates a service worker with a content-versioned, app-path-scoped
shell cache. It includes HTML, scripts, styles, fonts, PDF worker and the small
voice manifest. The 115 MB voice assets are excluded from initial precaching.
The neural JavaScript/phonemiser worker bundle is part of the shell so it can
start offline after voice installation. Model initialization remains lazy.

A second app-path/version-scoped Cache Storage bucket holds voice assets.
Settings installs them explicitly, verifies restricted paths, exact byte counts
and SHA-256 digests, and writes the installed manifest last. Cancellation can
reuse completed verified files. Removing the voice terminates its worker and
deletes only that voice cache. Browser eviction and site-data removal can erase
any of these stores; originals should be retained outside the application.

## Browser neural execution

`browserVoice.ts` handles setup, capability checks, progress, cancellation,
worker RPC, errors and timeouts. `browser.worker.ts` owns one Kokoro model and
fixed Heart voice. Transformers.js loads the q8 model through ONNX Runtime Web
using single-thread WASM, with remote model access disabled. Runtime, tokenizer,
voice and model are served from this site's `narration/` path. Pinning/staging
happens at build time in `prepare-web-voice.mjs`; generated binaries stay out
of git. Browser inference performs no text POST to a remote service.

Single-thread WASM avoids requiring WebGPU or SharedArrayBuffer/COOP/COEP,
which is appropriate for normal Pages hosting. A dedicated worker keeps the
inference kernel off the UI thread. It does not make inference cost-free:
low-memory phones may terminate the worker/tab and slow devices can produce
gaps. There is one in-flight computation and one replaceable queued seek.
Cancellation rejects stale results; an already running kernel completes before
the next job. Voice removal or a worker failure terminates that process.

Kokoro's normalization and phonemisation remain intact. Hush supplies a pinned
same-origin voice rather than allowing an implicit external voice download.
Chunks are bounded at 420 Unicode code points. Token sequences beyond the
model limit fail visibly instead of being silently truncated. The engine key
includes model revision, voice and runtime; changing these requires a version
update so prior cached audio is not mistaken for the same waveform.

## Source mapping, media and continuity

`epubPassage` maps normalized UTF-16 offsets back to DOM ranges, preserving
source order across quotations, lists and inline elements. Long sentences can
span several bounded clips while sharing one sentence highlight. PDF speech
offsets align with extracted text items; complex layout remains a reading-order
limitation rather than an invented OCR capability.

`Narrator` owns a reusable HTML audio element, media clock, cancellation epoch,
source sentence and natural chapter transitions. A user gesture activates the
player before asynchronous model work. If autoplay is still refused, the user
gets a paused state and an explicit Play control. React observes this controller
rather than simulating speech events. Highlighting begins on real playback.

`ClipProvider` admits one active request and one look-ahead clip. Seeking adopts
matching prepared audio and supersedes unrelated work. The adapter can prepare
the next passage without changing the visible page; navigation happens when its
audio starts. Empty passages are skipped. Stop, manual navigation and book
changes invalidate late results and revoke playback URLs.

The disposable audio IndexedDB has a 128 MiB / 192 clip LRU budget and a 5 MB
clip limit. Metadata and bytes are separate stores. Checkpoints contain source
identity, text hash, engine fingerprint, clip key, seconds, speed and volume.
Exact in-sentence resume requires the identical saved clip. If it was evicted
or the engine changed, resume starts at its source sentence with an explanation.
Old seconds are never applied to a newly generated waveform.

## Mobile browser boundary

The same static artifact serves desktop and phone layouts. It has touch-sized
controls, safe-area handling and an installable manifest. Neural inference runs
on the phone itself, subject to that phone's browser capabilities and resources.
A responsive Chromium viewport does not certify Safari or physical iOS/Android.
Background audio, lock-screen controls, suspension, OS storage eviction and
battery/thermal behavior require separate device validation; they are not
promised by the web manifest. See MOBILE.md and STATUS.md.

## Optional native adapter

The desktop repository uses SQLite WAL/FULL synchronization, a library owner
lock and an import intent journal. Ordered binary IPC writes and reads are
capped at 1 MiB. Finishing an import verifies SHA-256 and signature, syncs the
pending file, renames it and commits metadata. Startup completes ready imports
and discards incomplete transfers without touching user originals.

Desktop Pocket TTS uses private bounded process pipes and trusted resource
configuration. It does not expose a hosted inference server. A development-only
loopback bridge supports its integration tests and is absent from production
Pages builds. Historical setup is in DESKTOP-NARRATION.md.

## Verification

Unit tests exercise import bounds, mapping, storage, audio identity and race
conditions. Production browser tests use actual EPUB/PDF engines. The opt-in
web-voice test runs the real static WASM worker, measures non-silent media PCM,
checks pause/seek/rate/highlighting, reloads offline and naturally continues to
the next chapter. Separate tests reopen EPUB and PDF without networking.
Chromium and WebKit CI paths are defined; executed evidence and unresolved
gates are recorded in STATUS.md rather than inferred from configuration.
