import { afterEach, describe, it, expect, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { AudioCache, clipKey, type ClipCache } from './cache';
import { ClipProvider } from './clips';
import { Narrator, type Checkpoint } from './Narrator';
import type { SpokenSentence } from '../domain/types';
const wave = () => {
  const data = new Uint8Array(80);
  data.set(new TextEncoder().encode('RIFF'));
  data.set(new TextEncoder().encode('WAVE'), 8);
  return new NodeBlob([data], { type: 'audio/wav' }) as unknown as Blob;
};
const unit = (id: string): SpokenSentence => ({
  id,
  text: `Sentence ${id}.`,
  locator: { kind: 'epub', cfi: `cfi-${id}`, href: `${id}.xhtml`, section: Number(id) || 0 },
});
class MemoryCache implements ClipCache {
  values = new Map<string, Blob>();
  async get(key: string) {
    return this.values.get(key) ?? null;
  }
  async put(key: string, blob: Blob) {
    this.values.set(key, blob);
  }
  async remove(key: string) {
    this.values.delete(key);
  }
  async clear() {
    this.values.clear();
  }
}
describe('persistent neural clips', () => {
  const databases: AudioCache[] = [];
  afterEach(async () => {
    for (const db of databases.splice(0)) await db.close();
    vi.restoreAllMocks();
  });
  it('restores the same WAV bytes across cache instances and isolates engine revisions', async () => {
    const name = crypto.randomUUID();
    const first = new AudioCache(name);
    databases.push(first);
    const key = await clipKey('voice-a', 'Text.');
    await first.put(key, wave());
    await first.close();
    const second = new AudioCache(name);
    databases.push(second);
    expect((await second.get(key))?.size).toBe(80);
    expect(await second.get(await clipKey('voice-b', 'Text.'))).toBeNull();
    await second.clear();
    expect(await second.get(key)).toBeNull();
  });
  it('evicts the least recently used clip within a hard byte/count budget', async () => {
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => ++now);
    const cache = new AudioCache(crypto.randomUUID(), 170, 2);
    databases.push(cache);
    await cache.put('one', wave());
    await cache.put('two', wave());
    await cache.get('one');
    await cache.put('three', wave());
    expect(await cache.get('two')).toBeNull();
    expect(await cache.get('one')).not.toBeNull();
    expect(await cache.get('three')).not.toBeNull();
  });
  it('adopts an in-flight look-ahead instead of synthesizing twice', async () => {
    let resolve!: (blob: Blob) => void;
    const repo = {
      synthesize: vi.fn(
        () =>
          new Promise<Blob>((r) => {
            resolve = r;
          }),
      ),
    };
    const provider = new ClipProvider(repo, new MemoryCache());
    const signal = new AbortController().signal;
    const lookahead = provider.prefetch('voice', 'A sentence.', signal);
    await vi.waitFor(() => expect(repo.synthesize).toHaveBeenCalledOnce());
    const foreground = provider.get('voice', 'A sentence.', signal);
    resolve(wave());
    await Promise.all([lookahead, foreground]);
    expect(repo.synthesize).toHaveBeenCalledOnce();
  });
  it('does not cache or expose stale synthesis after cancellation', async () => {
    let resolve!: (blob: Blob) => void;
    const cache = new MemoryCache();
    const repo = {
      synthesize: vi.fn(
        () =>
          new Promise<Blob>((r) => {
            resolve = r;
          }),
      ),
    };
    const provider = new ClipProvider(repo, cache);
    const result = provider.get('voice', 'A sentence.', new AbortController().signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(repo.synthesize).toHaveBeenCalledOnce());
    provider.cancel();
    resolve(wave());
    await rejected;
    expect(cache.values.size).toBe(0);
  });
});

class Media {
  currentTime = 0;
  duration = 4;
  paused = true;
  ended = false;
  preload = '';
  playbackRate = 1;
  preservesPitch = true;
  volume = 1;
  loaded = false;
  onplaying: ((event: Event) => void) | null = null;
  onended: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  ontimeupdate: ((event: Event) => void) | null = null;
  onloadedmetadata: ((event: Event) => void) | null = null;
  async play() {
    this.paused = false;
    if (!this.loaded) {
      this.loaded = true;
      this.onloadedmetadata?.(new Event('loadedmetadata'));
    }
    this.onplaying?.(new Event('playing'));
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {}
  load() {}
  tick(value: number) {
    this.currentTime = value;
    this.ontimeupdate?.(new Event('timeupdate'));
  }
  finish() {
    this.currentTime = this.duration;
    this.ended = true;
    this.onended?.(new Event('ended'));
  }
}
function create(
  cache = new MemoryCache(),
  next: (after: SpokenSentence, signal: AbortSignal) => Promise<SpokenSentence[] | null> = vi.fn(
    async () => null,
  ),
) {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => crypto.randomUUID()),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  const media: Media[] = [];
  const checkpoints: Checkpoint[] = [];
  const spoken = vi.fn();
  const repo = { synthesize: vi.fn(async () => wave()) };
  const narrator = new Narrator(
    new ClipProvider(repo, cache),
    cache,
    { onSentence: spoken, onCheckpoint: (p) => checkpoints.push(p), nextPassage: next },
    () => {
      const item = new Media();
      media.push(item);
      return item as unknown as HTMLAudioElement;
    },
  );
  return { narrator, media, checkpoints, spoken, repo, cache, next };
}
describe('narration lifecycle and source continuity', () => {
  it('resumes the exact cached waveform after rebuilding the controller', async () => {
    const first = create();
    first.narrator.start([unit('1')], 'voice');
    await vi.waitFor(() => expect(first.narrator.snapshot().state).toBe('playing'));
    first.media[0].tick(1.25);
    first.narrator.stop();
    const point = first.checkpoints.at(-1)!;
    const second = create(first.cache);
    second.narrator.start([unit('1')], 'voice', {
      ...point,
      sentenceId: point.sentence.id,
      locator: point.sentence.locator,
      textHash: 'hash',
    });
    await vi.waitFor(() => expect(second.narrator.snapshot().state).toBe('playing'));
    expect(second.media[0].currentTime).toBe(1.25);
    expect(second.repo.synthesize).not.toHaveBeenCalled();
    second.narrator.stop();
  });
  it('restarts at the source sentence when a voice change invalidates the old waveform', async () => {
    const test = create();
    test.narrator.start([unit('1')], 'new-voice', {
      sentenceId: '1',
      locator: unit('1').locator,
      offset: 2,
      textHash: 'hash',
      engineKey: 'old-voice',
      clipKey: 'old-key',
    });
    await vi.waitFor(() => expect(test.narrator.snapshot().state).toBe('playing'));
    expect(test.media[0].currentTime).toBe(0);
    expect(test.narrator.snapshot().resumeAdjusted).toBe(true);
    test.narrator.stop();
  });
  it('prepares and enters the next chapter without duplicate generation', async () => {
    const next = vi.fn(async (after: SpokenSentence) => (after.id === '1' ? [unit('2')] : null));
    const test = create(new MemoryCache(), next);
    test.narrator.start([unit('1')], 'voice');
    await vi.waitFor(() => expect(test.repo.synthesize).toHaveBeenCalledTimes(2));
    test.media[0].finish();
    await vi.waitFor(() => expect(test.spoken).toHaveBeenLastCalledWith(unit('2')));
    expect(test.repo.synthesize).toHaveBeenCalledTimes(2);
    test.media[1].finish();
    await vi.waitFor(() => expect(test.narrator.snapshot().state).toBe('ended'));
    test.narrator.stop();
  });
  it('seeks and pauses using the actual media clock without regenerating speech', async () => {
    const test = create();
    test.narrator.start([unit('1')], 'voice');
    await vi.waitFor(() => expect(test.narrator.snapshot().state).toBe('playing'));
    test.narrator.setSpeed(1.5);
    test.narrator.setVolume(0.3);
    test.narrator.seek(2);
    test.narrator.toggle();
    expect(test.media[0].paused).toBe(true);
    expect(test.checkpoints.at(-1)).toMatchObject({ offset: 2, speed: 1.5, volume: 0.3 });
    test.narrator.toggle();
    expect(test.narrator.snapshot().state).toBe('playing');
    expect(test.repo.synthesize).toHaveBeenCalledOnce();
    test.narrator.stop();
  });
});
