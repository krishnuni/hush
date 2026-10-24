import type { LibraryRepository } from '../domain/types';
import { clipKey, type ClipCache } from './cache';
export interface Clip {
  key: string;
  blob: Blob;
  cached: boolean;
  engineKey: string;
}
export const cancelled = () => new DOMException('Narration cancelled', 'AbortError');
export function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    const abort = () => reject(cancelled());
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
/** One active inference, one look-ahead clip. Foreground seeks supersede unrelated work. */
export class ClipProvider {
  private active: { key: string; controller: AbortController; promise: Promise<Clip> } | undefined;
  private epoch = 0;
  constructor(
    private repository: Pick<LibraryRepository, 'synthesize'>,
    private cache: ClipCache,
  ) {}
  cancel() {
    this.epoch++;
    this.active?.controller.abort();
    this.active = undefined;
  }
  async get(
    engineKey: string,
    text: string,
    signal: AbortSignal,
    background = false,
  ): Promise<Clip> {
    const generation = this.epoch;
    const key = await clipKey(engineKey, text);
    if (signal.aborted || generation !== this.epoch) throw cancelled();
    const existing = await this.cache.get(key).catch(() => null);
    if (signal.aborted || generation !== this.epoch) throw cancelled();
    if (existing) return { key, blob: existing, cached: true, engineKey };
    if (this.active?.key === key) return withSignal(this.active.promise, signal);
    if (background && this.active) throw cancelled();
    this.active?.controller.abort();
    const controller = new AbortController();
    const promise = this.repository
      .synthesize(text, controller.signal)
      .then(async (blob) => {
        if (controller.signal.aborted || generation !== this.epoch) throw cancelled();
        await this.cache.put(key, blob).catch(() => {
          /* A full cache must not prevent listening. */
        });
        if (controller.signal.aborted || generation !== this.epoch) throw cancelled();
        return { key, blob, cached: false, engineKey };
      })
      .finally(() => {
        if (this.active?.controller === controller) this.active = undefined;
      });
    this.active = { key, controller, promise };
    return withSignal(promise, signal);
  }
  async prefetch(engineKey: string, text: string, signal: AbortSignal) {
    await this.get(engineKey, text, signal, true).catch(() => {});
  }
}
