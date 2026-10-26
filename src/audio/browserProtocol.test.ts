import { it, expect } from 'vitest';
import { validManifest, voiceCacheName, WEB_VOICE_VERSION } from './browserProtocol';
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
