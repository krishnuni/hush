# Browser neural narration

The primary reader uses Kokoro directly in a module worker. See the [README](../README.md#architecture-and-rationale) for the complete rationale, cache boundaries, model provenance and playback design.

## Execution path

1. Settings explicitly enables the voice. A seven-file build manifest restricts paths, sizes and SHA-256 checksums.
2. The browser downloads static files from its own origin into a cache scoped to the app path and voice version. A completed manifest marker is committed last.
3. The worker loads q8 Kokoro, the tokenizer and the selected English voice profile. ONNX WASM uses one thread and same-origin runtime files. No paid API, local helper, WebGPU or cross-origin-isolation header is required.
4. Source-aligned speech chunks enter a bounded provider; generated WAVs enter the 128 MiB LRU cache. The worker queue retains one in-flight computation and the latest pending seek.
5. A reusable media element drives real playback, sentence highlighting and checkpoints. Chapter continuation prepares the next passage without moving the visible reader until playback advances.
6. Exact in-sentence resume requires a matching cached WAV and engine fingerprint. Missing clips restart at their source sentence with visible feedback.

The production integration test asserts real non-silent player output, chapter transition, offline reload, speed/seek and cached restoration. Physical listening quality and actual phone performance are separate checks; see [STATUS.md](STATUS.md).

The optional desktop Pocket TTS implementation and earlier measurements are preserved in [DESKTOP-NARRATION.md](DESKTOP-NARRATION.md). They are not evidence for browser inference.

## Voice selection

Settings offers all 28 English profiles shipped by the locked Kokoro package, grouped by American and British pronunciation. Each profile is 522,240 bytes. The six shared engine assets remain cached when selecting another voice. An explicit download action saves a missing profile; simply opening or changing the selector makes no model request. A failed or cancelled additional download leaves existing voices usable.

`src/audio/voices.json` records the permitted IDs, labels, sizes and SHA-256 digests. The build verifies the package files against this catalogue. Runtime requests accept only listed IDs, and the worker reads only the selected verified profile from the app-scoped cache. `tts.generate` receives that same ID so phonemisation follows the chosen accent. The model and cache version are unchanged, preserving the existing Heart installation and exact-audio keys.

The choice is stored in `localStorage` under an app-path-scoped key; books, preferences and positions keep their existing IndexedDB stores. Selecting another voice stops/checkpoints book playback. Voice-specific engine keys prevent reusing another voice’s waveform or applying an old seconds offset to it. The short preview uses the production narrator and bounded audio cache, with no callbacks that change book positions; closing the settings dialog stops it.
