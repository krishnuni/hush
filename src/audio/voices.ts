import type { KokoroTTS } from 'kokoro-js';
import catalogue from './voices.json' with { type: 'json' };

export type VoiceId = Extract<keyof KokoroTTS['voices'], `${'a' | 'b'}${'f' | 'm'}_${string}`>;
export const DEFAULT_VOICE: VoiceId = 'af_heart';
/** English profiles from the locked kokoro-js 1.2.1 package; hashes are checked at build and install. */
export const BROWSER_VOICES = catalogue;
export const isVoiceId = (value: unknown): value is VoiceId =>
  typeof value === 'string' && BROWSER_VOICES.some((voice) => voice.id === value);
export const voiceInfo = (id: VoiceId) => BROWSER_VOICES.find((voice) => voice.id === id)!;
export const voiceFile = (id: VoiceId) => {
  const voice = voiceInfo(id);
  return { path: `${voice.id}.bin`, bytes: voice.bytes, sha256: voice.sha256 };
};
