import { useState } from 'react';
import { Headphones, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import type { useNarration } from '../audio/useNarration';
import { IconButton } from './IconButton';

type Narration = ReturnType<typeof useNarration>;
const time = (value: number) =>
  `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
export function NarrationDock({
  narration: n,
  chapter,
  onStop,
}: {
  narration: Narration;
  chapter?: string;
  onStop(): void;
}) {
  const [details, setDetails] = useState(false);
  const playing = n.state === 'playing';
  const buffering = n.state === 'buffering';
  const label = buffering
    ? 'Preparing a sentence'
    : playing
      ? 'Reading aloud'
      : n.state === 'paused'
        ? 'Paused, at your place'
        : n.state === 'ended'
          ? 'End of this passage'
          : 'Let’s try that again';
  return (
    <section
      className={`narration-bar ${details ? 'expanded' : ''}`}
      aria-label="Narration controls"
      data-state={n.state}
    >
      <div className="narration-description">
        <span className={`playback-mark ${playing ? 'is-playing' : ''}`} aria-hidden="true">
          <Headphones size={21} />
          <i />
        </span>
        <span>
          <strong role="status">{label}</strong>
          <small role={n.state === 'error' ? 'alert' : undefined}>
            {n.error ||
              (n.resumeAdjusted
                ? 'Audio was cleared; continuing from this sentence.'
                : chapter || 'Local neural narration')}
          </small>
        </span>
      </div>
      <div className="transport">
        <IconButton label="Previous sentence" onClick={n.previous}>
          <SkipBack size={18} />
        </IconButton>
        <button
          className="play-pause"
          onClick={n.toggle}
          disabled={buffering}
          aria-label={playing ? 'Pause narration' : 'Play narration'}
        >
          {buffering ? (
            <span className="loading-dot" />
          ) : playing ? (
            <Pause size={21} fill="currentColor" />
          ) : (
            <Play size={21} fill="currentColor" />
          )}
        </button>
        <IconButton label="Next sentence" onClick={n.next}>
          <SkipForward size={18} />
        </IconButton>
      </div>
      <label className="narration-seek">
        <span className="visually-hidden">Position in sentence</span>
        <input
          type="range"
          min="0"
          max={Math.max(0.01, n.duration)}
          step=".05"
          value={Math.min(n.position, n.duration)}
          disabled={!n.duration}
          onChange={(e) => n.seek(Number(e.target.value))}
        />
        <output>
          {time(n.position)}
          <span> / {time(n.duration)}</span>
        </output>
      </label>
      <label className="speed-control">
        <span className="visually-hidden">Narration speed</span>
        <select value={n.speed} onChange={(e) => n.setSpeed(Number(e.target.value))}>
          {[0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
            <option key={rate} value={rate}>
              {rate}×
            </option>
          ))}
        </select>
      </label>
      <button
        className="volume-toggle icon-button"
        aria-label="Audio options"
        aria-expanded={details}
        onClick={() => setDetails(!details)}
      >
        {n.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      <IconButton label="Stop narration" onClick={onStop}>
        <X size={18} />
      </IconButton>
      {details && (
        <div className="audio-details">
          <label className="volume-control">
            <Volume2 size={17} />
            <span>Volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step=".05"
              value={n.volume}
              onChange={(e) => n.setVolume(Number(e.target.value))}
            />
            <output>{Math.round(n.volume * 100)}%</output>
          </label>
          <p>
            On iPhone, use the device’s media volume. Check Bluetooth or AirPlay if playback is
            silent. Keep Hush open while listening.
          </p>
        </div>
      )}
    </section>
  );
}
