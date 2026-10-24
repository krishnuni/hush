# Hush — Your reading room

An original literary reader built with React/TypeScript, EPUB.js, PDF.js and a
Tauri/Rust desktop host. It has a searchable local library, three reading themes,
editorial typography, bookmarks, durable reading positions and optional private
Pocket TTS narration. The interface adapts to phone screens.

![Hush's night reader, captured from the running application](docs/images/desktop-reader.png)

This is a development build. Real inference and non-silent application media
output have been tested. Physical speaker/headphone listening, Windows clean
installation and native mobile device verification are separate release gates.
See [executed checks](docs/STATUS.md), [architecture](docs/ARCHITECTURE.md),
[narration](docs/NARRATION.md) and [mobile boundaries](docs/MOBILE.md).
See [deployment status and workflows](docs/DEPLOYMENT.md) for current delivery evidence.

## Open the reader locally

With Node 24 installed, build the reader from a checkout:

```bash
npm ci
npm run build
npm start
```

Open http://127.0.0.1:1420. The preview server itself has no npm dependencies.
Import a supported EPUB/PDF or add one of three original Hush books. Books and
saved places remain in this browser. Clearing browser data removes that library.
The production web edition has an installable app manifest and an offline shell;
load it successfully once before reading local books without a network.
Production static web builds have no neural inference server or system-speech
substitute. Use the local development engine or the desktop host to narrate.

## Develop

```bash
npm ci
npm run dev
```

Warm, Light and Night themes, Noto Serif/Sans, publisher font choice, type size,
line spacing, margins, content width, chapter/page navigation, library search,
sorting and editable book details are implemented. PDF text is selectable, with
zoom, rotation and vertical-position restoration. Review extracted PDF reading
order before starting narration. Scanned pages have no OCR.

Import bounds: 50 MiB original, 256 MiB expanded EPUB, 32 MiB per resource,
5,000 archive entries and 2,000 PDF pages. Actual ZIP inflation is bounded;
publication scripts and remote resources are sanitized. DRM and fixed-layout
EPUB are outside this edition. Managed copies never modify the user's original.

## Set up real local narration

Requires Rust 1.99.1, a C/C++ toolchain and CMake. On Windows use MSVC Build Tools.
The worker builds independently of the desktop window's GTK/WebKit dependencies.

```bash
npm run voice:build
npm run voice:setup
```

The setup script downloads roughly 226 MB from Kyutai's official ungated fixed
voice repository, verifies pinned SHA-256 hashes and writes a portable local pack
with attribution. It reads no account token. Model and voice weights are optional
and excluded from the source archive.

Use absolute paths before launching development or the desktop host:

```bash
export HUSH_VOICE_WORKER="$PWD/target/release/hush-voice-worker"
export HUSH_VOICE_CONFIG="$PWD/runtime/voice/config.yaml"
export HUSH_VOICE_EMBEDDING="$PWD/runtime/voice/alba.safetensors"
npm run dev
```

PowerShell:

```powershell
$env:HUSH_VOICE_WORKER = (Resolve-Path target/release/hush-voice-worker.exe).Path
$env:HUSH_VOICE_CONFIG = (Resolve-Path runtime/voice/config.yaml).Path
$env:HUSH_VOICE_EMBEDDING = (Resolve-Path runtime/voice/alba.safetensors).Path
npm run dev
```

Click **Listen**. One model/voice stays loaded in a private process. Source-aligned
speech chunks, sentence highlights, one-clip look-ahead, chapter continuation,
media-clock seeking, pause, speed and volume controls are implemented. There is
no paid inference API. Desktop inference uses private process pipes; the Vite
bridge exists only for loopback development.

A disposable 128 MiB / 192 clip disk cache enables identical-waveform resume.
A checkpoint stores source identity, text hash, engine fingerprint, clip key,
seconds, speed and volume. If its exact clip is missing or the engine changed,
resume starts at that source sentence and explains the adjustment. It never
applies an old offset to a newly generated waveform. Clear generated audio in
Settings without removing books or saved positions.

## Desktop build

Install [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/):

```bash
npm run desktop
```

Rust owns SQLite WAL, managed originals and an import recovery journal. Ordered
binary IPC chunks and range reads are capped at 1 MiB; the renderer still
assembles a complete source buffer within the document limit. Startup completes
verified imports and discards interrupted transfers. A library owner lock keeps
a second process from recovering a live transfer.

Build a desktop installer with the optional verified voice pack:

```bash
npm run desktop:build:voice
```

That command builds the worker, verifies the pack, stages attribution and uses a
resource mapping so the native host can discover its voice automatically. The
base installer target is Windows NSIS. Other platforms require their own target
and signing configuration. No signed or clean-machine-certified installer is
included. Native Android/iOS SDK projects and mobile inference remain separate;
a responsive or installed web reader does not establish those capabilities.

## Verification

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:offline
cargo test -p hush-core -p hush-voice-host
cargo check -p hush
```

Regular browser tests use the production reader. With the voice variables set,
Playwright uses the real local development worker and executes neural tests
serially; without them neural cases explicitly skip. They never substitute
mocked synthesis for a claimed integration pass.

```bash
cargo test -p hush-voice-host -- --ignored --test-threads=1
```

The opt-in checks require the real pack and worker and cover actual process
transport and reconnection. State-machine unit tests use controlled media to
verify races; those are distinct from real-neural integration evidence.
CI includes frontend, offline, Rust and native-host compilation checks. The
separate Pages workflow deploys the tested web reader on pushes to `main`.
The manual Windows workflow builds an unsigned installer and can publish an
explicitly requested preview release. Formatting uses Prettier and rustfmt.

All application code, sample literature and geometric covers were created from
scratch. Third-party engines and fonts are dependencies. Vendored MIT inference
modules retain their [upstream notice](vendor/pocket-runtime/NOTICE.md) and licence.
The pinned EPUB XML parser override is recorded in package.json and the lockfile.

## Distribution notices

Production builds include `THIRD_PARTY_NOTICES.txt` with dependency and Noto font
license notices. The optional desktop voice pack retains its separate Kyutai / Alba
attribution and pinned model provenance. Model weights are excluded from the source
repository and the hosted web reader.
