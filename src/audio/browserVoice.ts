import type { NarrationStatus } from '../domain/types';
import {
  WEB_ENGINE,
  WEB_ENGINE_KEY,
  voiceCacheName,
  validManifest,
  type VoiceManifest,
  type WebVoiceState,
  type VoiceRequest,
  type VoiceResponse,
} from './browserProtocol';
const base = import.meta.env.BASE_URL;
const assetRoot = () => new URL(base + 'narration/', location.origin).href;
const abortError = () => new DOMException('Voice operation cancelled', 'AbortError');
type Job = {
  text: string;
  signal: AbortSignal;
  resolve(blob: Blob): void;
  reject(error: unknown): void;
};

export class BrowserVoice {
  private value: WebVoiceState = {
    phase: 'disabled',
    progress: 0,
    message: 'An optional English neural voice, processed on your device.',
  };
  private listeners = new Set<() => void>();
  private worker: Worker | undefined;
  private serial = 0;
  private replies = new Map<
    number,
    {
      resolve(value: VoiceResponse): void;
      reject(error: unknown): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private setup: Promise<void> | undefined;
  private download: AbortController | undefined;
  private active = false;
  private pending: Job | undefined;
  snapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(patch: Partial<WebVoiceState>) {
    this.value = { ...this.value, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private supported() {
    return (
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      'Worker' in window &&
      'WebAssembly' in window &&
      'caches' in window &&
      !!crypto.subtle
    );
  }
  private async installed() {
    if (!this.supported()) return false;
    const cache = await caches.open(voiceCacheName(base));
    const saved = await cache.match(assetRoot() + 'manifest.json');
    if (!saved) return false;
    const manifest = (await saved.json()) as VoiceManifest;
    if (!validManifest(manifest)) return false;
    for (const file of manifest.files)
      if (!(await cache.match(assetRoot() + file.path))) return false;
    return true;
  }
  async status(): Promise<NarrationStatus> {
    const available = await this.installed().catch(() => false);
    return {
      available,
      engine: WEB_ENGINE,
      ...(available ? { engineKey: WEB_ENGINE_KEY } : {}),
      reason: !this.supported()
        ? 'This browser needs HTTPS, WebAssembly, workers and local storage for neural narration.'
        : available
          ? 'English · Heart voice · runs on your device using WebAssembly.'
          : 'Enable the optional browser voice to listen. The model download is about 115 MB. Your book text stays on this device.',
    };
  }
  enable = () => {
    if (this.setup) return this.setup;
    this.download = new AbortController();
    const signal = this.download.signal;
    this.setup = this.install(signal).finally(() => {
      this.setup = undefined;
      this.download = undefined;
    });
    return this.setup;
  };
  private async install(signal: AbortSignal) {
    try {
      if (!this.supported())
        throw new Error('Use an up-to-date browser over HTTPS with local storage enabled.');
      this.emit({ phase: 'checking', progress: 0, message: 'Checking the voice files…' });
      const manifestResponse = await fetch(assetRoot() + 'manifest.json', { signal });
      if (!manifestResponse.ok)
        throw new Error('Voice files are missing from this build. Build Hush with npm run build.');
      const manifest = (await manifestResponse.json()) as VoiceManifest;
      if (!validManifest(manifest))
        throw new Error('The voice file manifest is invalid. Reload Hush before retrying.');
      const cache = await caches.open(voiceCacheName(base));
      // The marker is committed only after every pinned file is present.
      await cache.delete(assetRoot() + 'manifest.json');
      let completed = 0;
      this.emit({ phase: 'downloading', message: 'Saving the neural voice on this device…' });
      for (const file of manifest.files) {
        if (signal.aborted) throw abortError();
        const url = assetRoot() + file.path;
        const existing = await cache.match(url);
        if (existing?.headers.get('X-Hush-SHA256') === file.sha256) {
          completed += file.bytes;
          this.emit({ progress: completed / manifest.bytes });
          continue;
        }
        const response = await fetch(url, { signal, cache: 'no-store' });
        if (!response.ok || !response.body)
          throw new Error(
            `The voice download failed (${response.status}). Check your connection and retry.`,
          );
        const reader = response.body.getReader();
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        let received = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > file.bytes) throw new Error('A voice file exceeds its expected size.');
            chunks.push(value);
            this.emit({ progress: (completed + received) / manifest.bytes });
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
        const bytes = await new Blob(chunks).arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('');
        if (received !== file.bytes || hash !== file.sha256)
          throw new Error('A voice file failed its integrity check. Retry the download.');
        if (signal.aborted) throw abortError();
        await cache.put(
          url,
          new Response(bytes, {
            headers: {
              'Content-Type': file.path.endsWith('.mjs')
                ? 'text/javascript'
                : file.path.endsWith('.wasm')
                  ? 'application/wasm'
                  : 'application/octet-stream',
              'X-Hush-SHA256': hash,
            },
          }),
        );
        completed += file.bytes;
      }
      if (signal.aborted) throw abortError();
      await cache.put(
        assetRoot() + 'manifest.json',
        new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } }),
      );
      this.emit({
        phase: 'loading',
        progress: 1,
        message: 'Loading the voice. This can take a little longer on a phone…',
      });
      await this.rpc({ action: 'load' });
      if (signal.aborted) throw abortError();
      this.emit({
        phase: 'ready',
        message: 'Your browser voice is ready. Open a book and choose Listen.',
      });
    } catch (error) {
      this.emit({
        phase: signal.aborted ? 'disabled' : 'error',
        message: signal.aborted
          ? 'Voice setup stopped. Completed files can be reused when you retry.'
          : error instanceof Error
            ? error.message
            : String(error),
      });
      throw error;
    }
  }
  cancelSetup = () => {
    this.download?.abort();
    this.releaseWorker();
  };
  remove = async () => {
    this.cancelSetup();
    await this.setup?.catch(() => {});
    await caches.delete(voiceCacheName(base));
    this.emit({
      phase: 'disabled',
      progress: 0,
      message: 'Voice removed. Your books and reading places are saved.',
    });
  };
  private releaseWorker(error: Error = abortError()) {
    this.worker?.terminate();
    this.worker = undefined;
    this.replies.forEach((reply) => {
      clearTimeout(reply.timer);
      reply.reject(error);
    });
    this.replies.clear();
    this.pending?.reject(error);
    this.pending = undefined;
  }
  private rpc(
    request:
      | Omit<Extract<VoiceRequest, { action: 'load' }>, 'id'>
      | Omit<Extract<VoiceRequest, { action: 'synthesize' }>, 'id'>,
  ) {
    if (!this.worker) {
      this.worker = new Worker(new URL('./browser.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<VoiceResponse>) => {
        const reply = this.replies.get(event.data.id);
        if (!reply) return;
        clearTimeout(reply.timer);
        this.replies.delete(event.data.id);
        if ('error' in event.data) reply.reject(new Error(event.data.error));
        else reply.resolve(event.data);
      };
      this.worker.onerror = () => {
        const error = new Error(
          'The browser could not run the neural voice. Retry setup, or close other tabs to free memory.',
        );
        this.emit({ phase: 'error', message: error.message });
        this.releaseWorker(error);
      };
    }
    return new Promise<VoiceResponse>((resolve, reject) => {
      const id = ++this.serial;
      const timer = setTimeout(
        () =>
          this.releaseWorker(
            new DOMException(
              'Voice preparation timed out. Try a shorter passage or a faster device.',
              'TimeoutError',
            ),
          ),
        180000,
      );
      this.replies.set(id, { resolve, reject, timer });
      this.worker!.postMessage({ ...request, id });
    });
  }
  /** One in-flight computation and one replaceable queued seek; aborted audio never plays. */
  synthesize(text: string, signal: AbortSignal): Promise<Blob> {
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise<Blob>((resolve, reject) => {
      const aborted = () => reject(abortError());
      signal.addEventListener('abort', aborted, { once: true });
      const job: Job = {
        text,
        signal,
        resolve: (blob) => {
          signal.removeEventListener('abort', aborted);
          resolve(blob);
        },
        reject: (error) => {
          signal.removeEventListener('abort', aborted);
          reject(error);
        },
      };
      if (this.active) {
        this.pending?.reject(abortError());
        this.pending = job;
      } else void this.run(job);
    });
  }
  private async run(job: Job) {
    this.active = true;
    try {
      if (job.signal.aborted) throw abortError();
      if (!(await this.installed()))
        throw new Error('Enable the browser voice in Settings before listening.');
      if (job.signal.aborted) throw abortError();
      const response = await this.rpc({ action: 'synthesize', text: job.text });
      if (job.signal.aborted) throw abortError();
      if (
        !('wav' in response) ||
        response.wav.byteLength < 44 ||
        response.wav.byteLength > 5_000_000
      )
        throw new Error('The browser voice returned an invalid clip.');
      job.resolve(new Blob([response.wav], { type: 'audio/wav' }));
    } catch (error) {
      job.reject(error);
    } finally {
      this.active = false;
      const next = this.pending;
      this.pending = undefined;
      if (next) void this.run(next);
    }
  }
}
export const browserVoice = new BrowserVoice();
