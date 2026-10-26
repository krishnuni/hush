# Browser neural narration

The primary reader uses Kokoro directly in a module worker. See the [README](../README.md#architecture-and-rationale) for the complete rationale, cache boundaries, model provenance and playback design.

## Execution path

1. Settings explicitly enables the voice. A seven-file build manifest restricts paths, sizes and SHA-256 checksums.
2. The browser downloads static files from its own origin into a cache scoped to the app path and voice version. A completed manifest marker is committed last.
3. The worker loads q8 Kokoro, the tokenizer and the fixed Heart voice. ONNX WASM uses one thread and same-origin runtime files. No paid API, local helper, WebGPU or cross-origin-isolation header is required.
4. Source-aligned speech chunks enter a bounded provider; generated WAVs enter the 128 MiB LRU cache. The worker queue retains one in-flight computation and the latest pending seek.
5. A reusable media element drives real playback, sentence highlighting and checkpoints. Chapter continuation prepares the next passage without moving the visible reader until playback advances.
6. Exact in-sentence resume requires a matching cached WAV and engine fingerprint. Missing clips restart at their source sentence with visible feedback.

The production integration test asserts real non-silent player output, chapter transition, offline reload, speed/seek and cached restoration. Physical listening quality and actual phone performance are separate checks; see [STATUS.md](STATUS.md).

The optional desktop Pocket TTS implementation and earlier measurements are preserved in [DESKTOP-NARRATION.md](DESKTOP-NARRATION.md). They are not evidence for browser inference.
