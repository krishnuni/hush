import { it, expect } from 'vitest';
import {
  validManifest,
  voiceCacheName,
  WEB_VOICE_VERSION,
  WEB_ENGINE_KEY,
  webEngineKey,
  filesForVoice,
} from './browserProtocol';
import { isVoiceId } from './voices';
const paths = [
  'model/kokoro/config.json',
  'model/kokoro/tokenizer.json',
  'model/kokoro/tokenizer_config.json',
  'model/kokoro/onnx/model_quantized.onnx',
  'af_heart.bin',
  'ort/ort-wasm-simd-threaded.jsep.mjs',
  'ort/ort-wasm-simd-threaded.jsep.wasm',
];
const manifest = () => ({
  version: WEB_VOICE_VERSION,
  bytes: 7,
  files: paths.map((path) => ({ path, bytes: 1, sha256: 'a'.repeat(64) })),
});
it('accepts only the expected pinned voice manifest and exact total', () => {
  expect(validManifest(manifest())).toBe(true);
  const bad = manifest();
  bad.files[0].path = '../another-site/model.onnx';
  expect(validManifest(bad)).toBe(false);
  const duplicate = manifest();
  duplicate.files[0] = duplicate.files[1];
  expect(validManifest(duplicate)).toBe(false);
  expect(validManifest({ ...manifest(), bytes: 8 })).toBe(false);
  expect(validManifest({ ...manifest(), version: 'changed' })).toBe(false);
  for (const malformed of [
    null,
    {},
    { files: null },
    { ...manifest(), files: Array(7).fill(null) },
  ])
    expect(validManifest(malformed)).toBe(false);
});
it('scopes voice deletion to this app path', () => {
  expect(voiceCacheName('/hush/')).not.toBe(voiceCacheName('/other/'));
  expect(voiceCacheName('/hush/')).not.toMatch(/^hush-shell/);
});

it('reuses the six shared assets while substituting one pinned voice', () => {
  const original = manifest();
  const selected = filesForVoice(original, 'bf_emma');
  expect(selected.filter((file) => !file.path.endsWith('.bin'))).toEqual(
    original.files.filter((file) => !file.path.endsWith('.bin')),
  );
  expect(selected.filter((file) => file.path.endsWith('.bin')).map((file) => file.path)).toEqual([
    'bf_emma.bin',
  ]);
  expect(selected.find((file) => file.path === 'bf_emma.bin')?.bytes).toBe(522240);
});

it('keeps old Heart audio identity and separates the other voices', () => {
  expect(webEngineKey('af_heart')).toBe(
    'hush-kokoro-q8-v1/1939ad2a8e416c0acfeecc08a694d14ef25f2231/af_heart/transformers-3.8.1',
  );
  expect(webEngineKey('bf_emma')).not.toBe(WEB_ENGINE_KEY);
});

it('accepts only known English voice identifiers, never asset paths', () => {
  expect(isVoiceId('am_michael')).toBe(true);
  for (const value of ['../af_heart', 'https://example.com/voice.bin', 'jf_alpha', null, {}])
    expect(isVoiceId(value)).toBe(false);
});
