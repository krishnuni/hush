import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Blob } from 'node:buffer';
import { createHash, webcrypto } from 'node:crypto';
import { BrowserVoice } from './browserVoice';
import { WEB_VOICE_VERSION } from './browserProtocol';
import { voiceFile } from './voices';

const core = [
  'model/kokoro/config.json',
  'model/kokoro/tokenizer.json',
  'model/kokoro/tokenizer_config.json',
  'model/kokoro/onnx/model_quantized.onnx',
  'ort/ort-wasm-simd-threaded.jsep.mjs',
  'ort/ort-wasm-simd-threaded.jsep.wasm',
];
const bytes = new TextEncoder().encode('unit fixture');
const files = [
  ...core.map((path) => ({
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })),
  voiceFile('af_heart'),
];
const manifest = {
  version: WEB_VOICE_VERSION,
  files,
  bytes: files.reduce((sum, file) => sum + file.bytes, 0),
};
const saved = new Map<string, Response>();
const requests: string[] = [];
let failingVoice = false;
// Installation units stub only worker readiness. Real inference is exercised in Playwright.
class ReadyWorker {
  onmessage?: (event: { data: { id: number; ready: true } }) => void;
  onerror?: () => void;
  postMessage(message: { id: number }) {
    queueMicrotask(() => this.onmessage?.({ data: { id: message.id, ready: true } }));
  }
  terminate() {}
}
beforeEach(() => {
  saved.clear();
  requests.length = 0;
  failingVoice = false;
  localStorage.clear();
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Blob', Blob);
  vi.stubGlobal('Worker', ReadyWorker);
  vi.stubGlobal('caches', {
    open: async () => ({
      match: async (url: string) => saved.get(url)?.clone(),
      put: async (url: string, response: Response) => {
        saved.set(url, response.clone());
      },
    }),
    delete: async () => {
      saved.clear();
      return true;
    },
  });
  vi.stubGlobal('fetch', async (url: string) => {
    requests.push(url);
    if (url.endsWith('manifest.json')) return Response.json(manifest);
    if (url.endsWith('bf_emma.bin') && failingVoice) throw new Error('Download interrupted');
    if (url.endsWith('.bin'))
      return new Response(
        readFileSync(resolve('node_modules/kokoro-js/voices', url.split('/').at(-1)!)),
      );
    return new Response(bytes);
  });
});
afterEach(() => vi.unstubAllGlobals());

it('keeps voice choice local and does not fetch assets before Enable', async () => {
  const voice = new BrowserVoice();
  voice.select('am_michael');
  voice.select('../untrusted.bin');
  expect(voice.snapshot().voiceId).toBe('am_michael');
  expect(new BrowserVoice().snapshot().voiceId).toBe('am_michael');
  expect((await voice.status()).available).toBe(false);
  expect(requests).toEqual([]);
});

it('preserves the previous voice after failure and retries only the extra profile', async () => {
  const voice = new BrowserVoice();
  await voice.enable();
  expect((await voice.status()).available).toBe(true);
  const originalKeys = [...saved.keys()];
  requests.length = 0;
  voice.select('bf_emma');
  failingVoice = true;
  await expect(voice.enable()).rejects.toThrow('Download interrupted');
  expect([...saved.keys()]).toEqual(originalKeys);
  voice.select('af_heart');
  expect((await voice.status()).available).toBe(true);
  voice.select('bf_emma');
  failingVoice = false;
  await voice.enable();
  expect(voice.snapshot().downloadBytes).toBe(522240);
  expect(
    requests
      .filter((url) => !url.endsWith('manifest.json'))
      .every((url) => url.endsWith('bf_emma.bin')),
  ).toBe(true);
  expect((await voice.availability()).voices).toEqual(
    expect.arrayContaining(['af_heart', 'bf_emma']),
  );
  expect((await voice.status()).engineKey).toContain('/bf_emma/');
  await voice.remove();
});
