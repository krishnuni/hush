# Pocket TTS runtime dependency

The nine inference modules in `src/` (audio, config, defaults, download, model,
rng, text, tokenizer, weights) are copied without modification from Kyutai
Pocket TTS v4.0.1, commit `a922b912dfa366975294afb568d815b305acde5d`, Rust
package version 3.3.0. Source: https://github.com/kyutai-labs/pocket-tts.
The MIT licence is retained in LICENSE. This is a declared inference dependency,
not reused Hush application code. Hush's application and UI are original.

Hush adds only the library module exports, a dependency manifest, and a build
script that supplies empty embedded config/UI tables. No upstream server, CLI,
web page, tests or application interface is included. The worker always loads
an explicit local config. Its entry point rejects remote model/tokenizer/voice
paths. The dependency's download utilities remain for upstream API compatibility
but are not used to fetch packs at runtime.

The separate model and voice assets are NOT covered by this code licence and
are NOT included here. See docs/NARRATION.md and the pack manifest.
