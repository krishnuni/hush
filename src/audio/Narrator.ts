import type { ListeningPosition, SpokenSentence } from '../domain/types';
import type { ClipCache } from './cache';
import { ClipProvider, type Clip, cancelled } from './clips';

export type PlaybackState = 'idle' | 'buffering' | 'playing' | 'paused' | 'error' | 'ended';
export interface Checkpoint {
  sentence: SpokenSentence;
  offset: number;
  speed: number;
  volume: number;
  clipKey: string;
  engineKey: string;
}
export interface PlaybackSnapshot {
  state: PlaybackState;
  error: string;
  index: number;
  total: number;
  speed: number;
  volume: number;
  position: number;
  duration: number;
  resumeAdjusted: boolean;
}
export interface NarratorCallbacks {
  onSentence(sentence: SpokenSentence | null): void;
  onCheckpoint(position: Checkpoint): void;
  nextPassage(after: SpokenSentence, signal: AbortSignal): Promise<SpokenSentence[] | null>;
}
const initial: PlaybackSnapshot = {
  state: 'idle',
  error: '',
  index: 0,
  total: 0,
  speed: 1,
  volume: 0.8,
  position: 0,
  duration: 0,
  resumeAdjusted: false,
};

/** Real media clock, bounded look-ahead and epoch-isolated navigation. No simulated speech events. */
export class Narrator {
  private value = { ...initial };
  private listeners = new Set<() => void>();
  private queue: SpokenSentence[] = [];
  private epoch = 0;
  private abort = new AbortController();
  private media: HTMLAudioElement | null = null;
  private url: string | null = null;
  private clip: Clip | null = null;
  private spoken: SpokenSentence | null = null;
  private engineKey = '';
  private lastCheckpoint = 0;
  private upcoming: { after: string; promise: Promise<SpokenSentence[] | null> } | null = null;
  constructor(
    private provider: ClipProvider,
    private cache: ClipCache,
    private callbacks: NarratorCallbacks,
    private makeAudio: (url: string) => HTMLAudioElement = (url) => new Audio(url),
  ) {}
  updateCallbacks(callbacks: NarratorCallbacks) {
    this.callbacks = callbacks;
  }
  snapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(patch: Partial<PlaybackSnapshot>) {
    this.value = { ...this.value, ...patch };
    for (const listener of this.listeners) listener();
  }
  checkpoint() {
    if (this.spoken && this.clip)
      this.callbacks.onCheckpoint({
        sentence: this.spoken,
        clipKey: this.clip.key,
        engineKey: this.clip.engineKey,
        offset: this.media?.currentTime ?? this.value.position,
        speed: this.value.speed,
        volume: this.value.volume,
      });
  }
  private release() {
    if (this.media) {
      this.media.onplaying =
        this.media.onended =
        this.media.onerror =
        this.media.ontimeupdate =
        this.media.onloadedmetadata =
          null;
      this.media.pause();
      this.media.removeAttribute('src');
      this.media.load();
      this.media = null;
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.clip = null;
  }
  private invalidate() {
    this.epoch++;
    this.abort.abort();
    this.abort = new AbortController();
    this.upcoming = null;
  }
  stop = () => {
    this.checkpoint();
    this.invalidate();
    this.provider.cancel();
    this.release();
    this.queue = [];
    this.spoken = null;
    this.callbacks.onSentence(null);
    this.emit({ state: 'idle', position: 0, duration: 0, error: '', total: 0 });
  };
  start = (sentences: SpokenSentence[], engineKey: string, resume?: ListeningPosition) => {
    this.stop();
    this.engineKey = engineKey;
    this.queue = sentences;
    const index = resume
      ? sentences.findIndex((sentence) => sentence.id === resume.sentenceId)
      : -1;
    if (resume) {
      this.value = { ...this.value, speed: resume.speed ?? 1, volume: resume.volume ?? 0.8 };
    }
    if (!sentences.length) {
      this.emit({ state: 'error', error: 'No usable text is available at this position.' });
      return;
    }
    void this.move(index >= 0 ? index : 0, index >= 0 ? resume : undefined);
  };
  private stageNext(token: number) {
    const next = this.queue[this.value.index + 1];
    if (next) {
      void this.provider.prefetch(this.engineKey, next.text, this.abort.signal);
      return;
    }
    const after = this.queue.at(-1);
    if (!after || this.upcoming?.after === after.id) return;
    const signal = this.abort.signal;
    const promise = this.callbacks.nextPassage(after, signal).then((passage) => {
      if (token !== this.epoch || signal.aborted) throw cancelled();
      if (passage?.length) void this.provider.prefetch(this.engineKey, passage[0].text, signal);
      return passage;
    });
    // It is awaited at the boundary; attaching a handler also covers a cancelled look-ahead.
    void promise.catch(() => {});
    this.upcoming = { after: after.id, promise };
  }
  private async advance() {
    if (this.value.index + 1 < this.queue.length) {
      await this.move(this.value.index + 1);
      return;
    }
    this.checkpoint();
    const token = this.epoch;
    this.emit({ state: 'buffering' });
    try {
      const after = this.queue.at(-1);
      if (!after) return;
      const next =
        this.upcoming?.after === after.id
          ? await this.upcoming.promise
          : await this.callbacks.nextPassage(after, this.abort.signal);
      if (token !== this.epoch) return;
      if (!next?.length) {
        this.release();
        this.emit({ state: 'ended', position: 0, duration: 0 });
        return;
      }
      this.queue = next;
      this.upcoming = null;
      await this.move(0);
    } catch (error) {
      if (token === this.epoch) this.fail(error);
    }
  }
  private fail(error: unknown) {
    this.emit({
      state: 'error',
      error:
        error instanceof Error
          ? error.message
          : 'Narration could not continue. Retry this passage.',
    });
  }
  private async move(index: number, resume?: ListeningPosition) {
    const sentence = this.queue[index];
    if (!sentence) return;
    this.checkpoint();
    this.invalidate();
    const token = this.epoch;
    const signal = this.abort.signal;
    this.release();
    this.spoken = sentence;
    this.emit({
      state: 'buffering',
      error: '',
      index,
      total: this.queue.length,
      position: 0,
      duration: 0,
      resumeAdjusted: false,
    });
    try {
      const clip = await this.provider.get(this.engineKey, sentence.text, signal);
      if (token !== this.epoch) return;
      this.clip = clip;
      this.url = URL.createObjectURL(clip.blob);
      const player = this.makeAudio(this.url);
      this.media = player;
      const exact =
        !!resume &&
        resume.clipKey === clip.key &&
        resume.engineKey === clip.engineKey &&
        clip.cached;
      const offset = exact ? Math.max(0, resume.offset) : 0;
      player.preload = 'auto';
      player.playbackRate = this.value.speed;
      player.preservesPitch = true;
      player.volume = this.value.volume;
      this.emit({ resumeAdjusted: !!resume && resume.offset > 0 && !exact });
      player.onloadedmetadata = () => {
        if (token !== this.epoch) return;
        if (offset > 0) player.currentTime = Math.min(offset, Math.max(0, player.duration - 0.025));
        this.emit({
          duration: Number.isFinite(player.duration) ? player.duration : 0,
          position: player.currentTime,
        });
      };
      player.onplaying = () => {
        if (token !== this.epoch) return;
        this.emit({ state: 'playing' });
        this.callbacks.onSentence(sentence);
        this.checkpoint();
        this.stageNext(token);
      };
      player.ontimeupdate = () => {
        if (token !== this.epoch) return;
        this.emit({ position: player.currentTime });
        if (Date.now() - this.lastCheckpoint > 750) {
          this.lastCheckpoint = Date.now();
          this.checkpoint();
        }
      };
      player.onended = () => {
        if (token === this.epoch && this.value.state === 'playing') void this.advance();
      };
      player.onerror = () => {
        if (token === this.epoch) {
          void this.cache.remove(clip.key).catch(() => {});
          this.fail(new Error('This audio clip could not be played. Retry to generate it again.'));
        }
      };
      await player.play();
    } catch (error) {
      if (token === this.epoch && !signal.aborted) this.fail(error);
    }
  }
  toggle = () => {
    if (this.value.state === 'playing') {
      this.media?.pause();
      this.checkpoint();
      this.emit({ state: 'paused' });
    } else if (this.value.state === 'buffering') {
      this.checkpoint();
      this.invalidate();
      this.provider.cancel();
      this.release();
      this.emit({ state: 'paused' });
    } else if (this.value.state === 'paused' && this.media && !this.media.ended) {
      void this.media.play().catch((error) => this.fail(error));
    } else if (this.queue.length) {
      void this.move(this.value.index);
    }
  };
  previous = () => {
    void this.move(Math.max(0, this.value.index - 1));
  };
  next = () => {
    void this.advance();
  };
  seek = (seconds: number) => {
    if (!this.media || !Number.isFinite(this.media.duration)) return;
    this.media.currentTime = Math.max(0, Math.min(this.media.duration - 0.025, seconds));
    this.emit({ position: this.media.currentTime });
    this.checkpoint();
  };
  setSpeed = (speed: number) => {
    const rate = Math.max(0.5, Math.min(2, speed));
    if (this.media) this.media.playbackRate = rate;
    this.emit({ speed: rate });
    this.checkpoint();
  };
  setVolume = (volume: number) => {
    const level = Math.max(0, Math.min(1, volume));
    if (this.media) this.media.volume = level;
    this.emit({ volume: level });
    this.checkpoint();
  };
}
