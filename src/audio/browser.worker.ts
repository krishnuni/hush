/// <reference lib="webworker" />
import { KokoroTTS } from 'kokoro-js';
import {
  AutoTokenizer,
  StyleTextToSpeech2Model,
  Tensor,
  RawAudio,
  env,
} from '@huggingface/transformers';
import type { VoiceRequest, VoiceResponse } from './browserProtocol';

const root = new URL(import.meta.env.BASE_URL + 'narration/', self.location.origin).href;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = root + 'model/';
env.useBrowserCache = false; // The Hush service worker owns a scoped, removable voice cache.
env.backends.onnx.wasm!.wasmPaths = root + 'ort/';
env.backends.onnx.wasm!.numThreads = 1; // Works on Pages without COOP/COEP or SharedArrayBuffer.
env.backends.onnx.wasm!.proxy = false; // We are already inside a dedicated worker.

let voice: Float32Array;
/** Retain Kokoro's text normalisation, with our pinned same-origin voice and model. */
class HushKokoro extends KokoroTTS {
  override async generate_from_ids(ids: Tensor) {
    const length = ids.dims.at(-1)!;
    if (length >= 512)
      throw new Error('This passage is too long for the voice. Try a shorter sentence.');
    const start = Math.max(0, length - 2) * 256;
    const { waveform } = await this.model({
      input_ids: ids,
      style: new Tensor('float32', voice.slice(start, start + 256), [1, 256]),
      speed: new Tensor('float32', [1], [1]),
    });
    return new RawAudio(waveform.data as Float32Array, 24000);
  }
}
let model: Promise<HushKokoro> | undefined;
function load() {
  return (model ??= (async () => {
    const response = await fetch(root + 'af_heart.bin');
    if (!response.ok) throw new Error('The local voice is missing. Enable the voice again.');
    voice = new Float32Array(await response.arrayBuffer());
    const [network, tokenizer] = await Promise.all([
      StyleTextToSpeech2Model.from_pretrained('kokoro', { dtype: 'q8', device: 'wasm' }),
      AutoTokenizer.from_pretrained('kokoro'),
    ]);
    return new HushKokoro(network, tokenizer);
  })().catch((error) => {
    model = undefined;
    throw error;
  }));
}
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<VoiceRequest>) => {
  const request = event.data;
  queue = queue
    .catch(() => {})
    .then(async () => {
      try {
        const tts = await load();
        if (request.action === 'load') {
          self.postMessage({ id: request.id, ready: true } satisfies VoiceResponse);
        } else {
          if (!request.text.trim() || Array.from(request.text).length > 420)
            throw new Error('The voice received an invalid passage.');
          const audio = await tts.generate(request.text, { voice: 'af_heart' });
          const wav = await audio.toBlob().arrayBuffer();
          self.postMessage({ id: request.id, wav } satisfies VoiceResponse, { transfer: [wav] });
        }
      } catch (error) {
        self.postMessage({
          id: request.id,
          error: error instanceof Error ? error.message : String(error),
        } satisfies VoiceResponse);
      }
    });
};
