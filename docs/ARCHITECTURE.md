# Hush implementation architecture

Original application code and literary visual system. React 19 and TypeScript form
one shared interface. Tauri 2 owns native storage and trusted desktop process
launch. EPUB.js and PDF.js remain isolated behind `ReaderHandle`; app UI does not
inspect their internal DOMs or carry engine-specific navigation code.

## Documents and storage

Imports validate supported format, archive paths, resource counts, declared and
actual inflated sizes. EPUB scripts, event handlers and remote resources are
sanitised before rendering. DRM and fixed-layout EPUB are rejected explicitly.
The original managed file remains separate from its sanitized rendering copy.
PDFs retain their page geometry and text layer; image-only pages have no OCR.

Browser storage uses a single IndexedDB transaction for book metadata and bytes.
Desktop storage uses SQLite WAL with FULL synchronization and a single owner
lock. A journal coordinates database intent with the managed filesystem copy:

1. `begin_import` validates metadata, identifier, hash, duplicate identity and size.
2. Binary IPC sends ordered chunks of at most 1 MiB into a managed pending file.
3. `finish_import` streams SHA-256 and signature checks, fsyncs the file, records
   ready intent, renames it and commits metadata plus journal removal together.
4. Startup finishes ready imports and rolls back incomplete transfers. Orphan
   cleanup scans only UUID-named managed copies. User originals are untouched.

Range reads are also capped at 1 MiB and return raw binary responses. The current
renderer still assembles a full source buffer, capped at 50 MiB. A PDF range data
transport and incremental EPUB archive reader are future memory improvements;
bounded IPC alone does not establish bounded total renderer memory.

`BookEntry` records immutable source identity, bibliographic metadata, reading
status, a reader locator, bookmarks and an independent listening checkpoint.
EPUB locations are CFIs with chapter/href context. PDF locations retain page,
zoom, rotation and vertical offset. PDF `goTo` resolves after canvas and text
rendering and restoration, rather than immediately after a React state change.
Reader updates are debounced; library return flushes and awaits pending saves.

## Speech preparation and playback

`epubPassage` maps normalized UTF-16 offsets back to real DOM ranges. Nested
quotations and lists are divided into source-ordered runs to avoid lost or
repeated prose. `speechSpans` bounds inference to 420 Unicode code points per
job without splitting surrogate pairs. Several chunks of one long sentence
share its sentence highlight. PDF speech offsets align with extracted text
items; the user can review reading order before starting narration.

`Narrator` owns the real HTML media element, playback clock, cancellation epoch,
current source sentence and chapter transition. React subscribes to its state;
it does not simulate speech events. `ClipProvider` permits one active inference
and one look-ahead clip. A foreground seek supersedes unrelated background work;
an already prepared matching clip is adopted without duplicate inference.

At a chapter boundary the reader adapter can load the next passage without
changing the visible page. Navigation happens when its audio actually plays.
Empty PDF pages and empty linear EPUB sections are skipped. Stop, manual
navigation and book changes invalidate late work and revoke playback URLs.

A separate disposable IndexedDB audio store has a 128 MiB / 192 clip LRU budget,
with a 5 MB clip limit. Cache metadata and audio bytes occupy separate stores,
so eviction does not load every waveform into memory. Keys include text and a
SHA-256 fingerprint of runtime protocol, configuration, model, tokenizer and
voice. Exact in-sentence resume requires the identical saved audio clip. If it
is absent or the engine changed, Hush restarts at the source sentence and tells
the reader, rather than applying old seconds to a new waveform.

Desktop synthesis uses a private process and bounded JSON pipes. Only trusted
application configuration supplies worker/model paths. The process never opens
an inference HTTP server or receives document-supplied filesystem arguments.
Two automatic reconnect attempts are allowed after a worker exit; interrupted
book text is not automatically replayed. Browser development uses a loopback,
same-origin bridge. A production static build has no neural inference adapter.

## Mobile and offline behavior

The responsive interface, repository contract and reader adapters are shared.
The production web build has an installable manifest and versioned service
worker shell cache. Only packaged app assets and fonts are cached; publication
and generated audio storage remain separate. The shell can reopen local books
after the first successful online load. It does not provide mobile on-device
neural inference, background audio sessions or cross-device synchronization.

The Tauri Rust entry point is mobile compatible; desktop process execution is
excluded with target configuration. Android/iOS require real SDK projects,
document-provider access, OS lifecycle/audio integration and device tests.
Phone-width Chromium tests are evidence for responsive behavior only.

## Verification and release

Unit tests cover document bounds, source mapping, persistent state, cache
identity, cancellation and playback state. Browser tests use actual EPUB/PDF
engines and, when opted in, the real local neural worker and real media output.
Separate production tests disable networking after shell installation. Rust
checks cover import crash boundaries, source identity and bounded transfer.
CI includes a native desktop compilation gate without any publish action.

See STATUS.md for executed results and outstanding gates. No signing, public
hosting, repository push, installer distribution or deployment is implied.
