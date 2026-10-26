import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { LibraryRepository, SpokenSentence } from '../domain/types';
import { audioCache } from './cache';
import { ClipProvider } from './clips';
import { Narrator, type NarratorCallbacks } from './Narrator';
export type { PlaybackState, Checkpoint } from './Narrator';
export function useNarration(
  repository: LibraryRepository,
  onSentence: (sentence: SpokenSentence | null) => void,
  onCheckpoint: NarratorCallbacks['onCheckpoint'],
  nextPassage: NarratorCallbacks['nextPassage'],
) {
  const controller = useRef<Narrator | null>(null);
  if (!controller.current)
    controller.current = new Narrator(new ClipProvider(repository, audioCache), audioCache, {
      onSentence,
      onCheckpoint,
      nextPassage,
    });
  const narrator = controller.current;
  narrator.updateCallbacks({ onSentence, onCheckpoint, nextPassage });
  const snapshot = useSyncExternalStore(narrator.subscribe, narrator.snapshot);
  useEffect(() => {
    const checkpoint = () => narrator.checkpoint();
    window.addEventListener('pagehide', checkpoint);
    document.addEventListener('visibilitychange', checkpoint);
    return () => {
      narrator.stop();
      window.removeEventListener('pagehide', checkpoint);
      document.removeEventListener('visibilitychange', checkpoint);
    };
  }, [narrator]);
  return {
    ...snapshot,
    start: narrator.start,
    unlock: narrator.unlock,
    toggle: narrator.toggle,
    stop: narrator.stop,
    previous: narrator.previous,
    next: narrator.next,
    seek: narrator.seek,
    setSpeed: narrator.setSpeed,
    setVolume: narrator.setVolume,
  };
}
