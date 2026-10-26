# Local neural narration — implementation and evidence

23 October 2026. This document distinguishes measured execution from release requirements.

## Implemented architecture

The portable UI asks its repository for a sentence clip. The desktop repository
invokes Rust synthesis/cancellation commands. The independent `hush-voice-host`
crate launches `hush-voice-worker` using trusted launch configuration and private
stdin/stdout pipes. No document can supply an executable, model path, arbitrary
voice, shell argument or inference endpoint. The development Vite bridge talks
to the same worker; it accepts only same-origin requests with a custom header.

The worker loads one model and fixed voice, then processes JSON jobs. Input is
bounded to 16 KiB per message and 1,200 text characters per job. One active and
one latest pending job bound the work queue. A cancellation flag is checked by
inference; stale session epochs prevent late audio from starting. Output is
24 kHz mono signed 16-bit WAV, bounded to 90 seconds per clip. The transport
rejects oversized/malformed responses. Playback revokes media URLs and keeps only
its active media and one look-ahead job. Cache metadata is separate from WAV bytes,
with a disposable 128 MiB / 192 clip LRU budget and 5 MB per clip. The worker dies
when the host closes; a bounded supervisor permits two reconnection attempts.

EPUB sentences map normalized UTF-16 offsets back to DOM ranges and CFIs;
source markup is not rewritten. Highlighting starts on the real media
`playing` event and follows the active sentence. The reader brings that CFI
into view. Long sentences are split at source-aligned clause/word boundaries,
at most 420 Unicode code points per inference job; their sentence highlight is
retained. Nested blocks are narrated once in document order. PDF order is
uncertain, so its extracted preview must be reviewed. Where PDF.js text spans
align, the active spoken range is highlighted over the page; complex layouts
still require publication-specific checks.

Playback checkpoints store sentence/source identity, text hash, in-sentence
seconds, engine key, speed and volume. They are saved periodically and at pause,
seek, stop, library return and visibility changes. Resume validates source text,
model/runtime/voice fingerprint and exact cached clip. If the waveform is absent,
Hush resumes at the source sentence and displays an adjustment message. It does
not seek old seconds into newly generated audio. Reading CFIs remain independent
of audio timing. Next-chapter text and its first clip can be prepared without
moving the view; real playback advances the reader at the chapter boundary.

## Actual execution here

Linux x86_64 virtual machine, AMD EPYC 9V74, nine visible vCPUs; Rust release
build, English 2026-04 model and Alba embedding. One short probe, warm local
filesystem; these are not Windows/mobile hardware promises.

| Measurement | Observed |
| --- | ---: |
| Worker model/voice load | 176 ms |
| First generated PCM chunk | 119 ms |
| Complete sentence generation | 678 ms |
| Resulting speech | 2,880 ms |
| Child-process peak RSS | 660,384 KiB, about 645 MiB |
| Model asset on disk | 219,029,196 bytes |

The sentence was “Mara arrived before the morning had made up its mind.”
The same Hush-owned worker then passed a Rust process-transport round trip.
The actual application passed desktop and phone-viewport browser tests for
playback, highlighting, pause, sentence seek, speed and saved listening resume.
The tests capture non-silent PCM from the real media element through Web Audio,
before the physical output device. The supplied audio review file is that
application output, not a separate CLI demonstration.

There is no physical audio device exposed in this environment. Human listening
through the actual desktop output device and a voice-quality assessment remain
open. No naturalness score, pronunciation score or subjective voice-quality
claim is fabricated. Playwright's phone layout uses the local desktop worker;
it is not evidence of Android/iOS on-device synthesis.

## Voice pack and licensing

| Component | Pinned source | Licence / implication |
| --- | --- | --- |
| Pocket inference modules | Kyutai pocket-tts v4.0.1, commit `a922b912dfa366975294afb568d815b305acde5d`, Rust package 3.3.0 | MIT; licence retained in vendor/pocket-runtime/LICENSE |
| Fixed-voice model and tokenizer | `kyutai/pocket-tts-without-voice-cloning`, revision `a7056f505a4a8ca72d8b5fb1440071d6f1a35739`, English 2026-04 | Model card declares CC BY 4.0; attribution accompanies the optional pack |
| Alba voice | Fixed repository embedding derived from Kyutai's Alba MacKenna voice catalogue | Catalogue declares CC BY 4.0; credit Alba MacKenna and Kyutai |

`scripts/setup-voice.mjs` pins asset SHA-256 values, installs atomically, and
writes a manifest and attribution. It uses the official ungated fixed-voice
repository and does not accept tokens or bypass gated cloning weights. The
runtime entry point accepts an existing absolute pack configuration and voice.
Asset paths may be portable relative paths confined to that pack directory, or
existing absolute local files. There is no remote fallback. A staging command
verifies the pack and includes attribution in optional desktop bundle resources.
No model or voice embedding is redistributed in the source checkpoint.

Primary sources: [runtime source and licence](https://github.com/kyutai-labs/pocket-tts/tree/a922b912dfa366975294afb568d815b305acde5d),
[pinned model card](https://huggingface.co/kyutai/pocket-tts-without-voice-cloning/blob/a7056f505a4a8ca72d8b5fb1440071d6f1a35739/README.md),
[voice catalogue and licences](https://huggingface.co/kyutai/tts-voices),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Review model-card notices and attribution again before any redistributed pack
or commercial release; no such release is part of this checkpoint.

Kokoro remains an alternative engine behind the same sentence/job boundary.
It has not been executed or listening-tested in Hush, so no comparative quality,
memory or latency result is claimed. Pocket now has a proven execution path;
changing engines should be driven by measured quality or platform constraints.

## Remaining release gates

- Playback buffers whole speech chunks. Look-ahead reduces normal gaps but does
  not guarantee continuous playback if synthesis falls behind. Native PCM
  streaming/backpressure and calibrated DSP remain future improvements.
- Run sustained starvation, cancellation, long-literature and device-output
  timing tests. Current pitch preservation uses the platform media implementation.
- Test voice-pack installation and a clean Windows installer on real hardware.
  Staging is implemented; signing and clean-machine verification are not certified.
- Complete human listening for naturalness, dialogue, numbers, abbreviations and
  pronunciation. No subjective voice-quality result is inferred from PCM energy.
- Validate arbitrary complex PDF reading order and alignment beyond the fixture
  corpus. Scanned PDF OCR remains outside the MVP.
- Mobile inference, background playback and OS audio sessions require their own
  device work. Desktop sidecar execution is excluded on Android/iOS.

The performance probe above is the earlier short worker measurement, not a
sustained benchmark. Fingerprinting adds a streamed read of the installed assets
before model-load timing begins. STATUS.md records which current integrations
were actually executed.
