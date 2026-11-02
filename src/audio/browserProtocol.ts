import { DEFAULT_VOICE, voiceFile, type VoiceId } from './voices.ts';

export const WEB_ENGINE = 'Kokoro · browser neural voice';
export const webEngineKey = (voice: VoiceId) =>
  `hush-kokoro-q8-v1/1939ad2a8e416c0acfeecc08a694d14ef25f2231/${voice}/transformers-3.8.1`;
export const WEB_ENGINE_KEY = webEngineKey(DEFAULT_VOICE);
export const WEB_VOICE_VERSION = 'hush-kokoro-q8-v1';
export const voiceCacheName = (base: string) =>
  `hush-voice-${encodeURIComponent(base)}-${WEB_VOICE_VERSION}`;
export interface VoiceManifest {
  version: string;
  bytes: number;
  files: { path: string; bytes: number; sha256: string }[];
}
export interface WebVoiceState {
  voiceId: VoiceId;
  phase: 'disabled' | 'checking' | 'downloading' | 'loading' | 'ready' | 'error';
  progress: number;
  downloadBytes: number;
  message: string;
}
export type VoiceRequest =
  | { id: number; action: 'load'; voice: VoiceId }
  | { id: number; action: 'synthesize'; voice: VoiceId; text: string };
export type VoiceResponse =
  { id: number; ready: true } | { id: number; wav: ArrayBuffer } | { id: number; error: string };

/** Keep the v1 engine/cache compatible; substitute only the selected, pinned voice profile. */
export const filesForVoice = (manifest: VoiceManifest, voice: VoiceId) =>
  manifest.files.map((file) => (file.path === 'af_heart.bin' ? voiceFile(voice) : file));

/** Only same-origin, versioned resources named by our build may enter this cache. */
export function validManifest(value: unknown): value is VoiceManifest {
  if (!value || typeof value !== 'object' || !('files' in value)) return false;
  const manifest = value as Partial<VoiceManifest>;
  return (
    manifest.version === WEB_VOICE_VERSION &&
    Array.isArray(manifest.files) &&
    manifest.files.length === 7 &&
    manifest.files.every(
      (f) =>
        !!f &&
        typeof f === 'object' &&
        typeof f.path === 'string' &&
        typeof f.sha256 === 'string' &&
        /^(?:model\/kokoro\/(?:onnx\/model_quantized\.onnx|config\.json|tokenizer\.json|tokenizer_config\.json)|af_heart\.bin|ort\/ort-wasm-simd-threaded\.jsep\.(?:mjs|wasm))$/.test(
          f.path,
        ) &&
        Number.isSafeInteger(f.bytes) &&
        f.bytes > 0 &&
        f.bytes <= 100_000_000 &&
        /^[a-f0-9]{64}$/.test(f.sha256),
    ) &&
    new Set(manifest.files.map((f) => f.path)).size === 7 &&
    manifest.bytes === manifest.files.reduce((n, f) => n + f.bytes, 0)
  );
}
