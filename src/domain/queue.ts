/** Every seek invalidates outstanding synthesis and playback events. */
export class SessionEpoch {
  private value = 0;
  next(): number {
    return ++this.value;
  }
  current(): number {
    return this.value;
  }
  isCurrent(epoch: number): boolean {
    return epoch === this.value;
  }
}

export function audioCacheKey(content: string, sentence: string, engine: string): string {
  return JSON.stringify(['hush-audio-v1', content, sentence, engine]);
}
