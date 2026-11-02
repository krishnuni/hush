import { useEffect, useState, useSyncExternalStore } from 'react';
import { browserVoice } from '../audio/browserVoice';
import type { NarrationStatus } from '../domain/types';
import { BROWSER_VOICES, voiceInfo, type VoiceId } from '../audio/voices';
import { VoicePreview } from './VoicePreview';
export function BrowserVoicePanel({
  onStatus,
  onStop,
}: {
  onStatus(status: NarrationStatus): void;
  onStop(): void;
}) {
  const state = useSyncExternalStore(browserVoice.subscribe, browserVoice.snapshot);
  const [installed, setInstalled] = useState(false);
  const [saved, setSaved] = useState<{ engine: boolean; voices: VoiceId[] }>({
    engine: false,
    voices: [],
  });
  const selected = voiceInfo(state.voiceId);
  const busy = ['checking', 'downloading', 'loading'].includes(state.phase);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([browserVoice.status(), browserVoice.availability()])
      .then(([status, saved]) => {
        if (!cancelled) {
          setInstalled(status.available);
          setSaved(saved);
          onStatus(status);
        }
      })
      .catch(() => {
        if (!cancelled) setInstalled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.phase, state.voiceId, onStatus]);
  return (
    <section className="browser-voice-setup" aria-label="Browser neural voice">
      <label className="voice-selector">
        <span>Narrator</span>
        <select
          aria-label="Narrator voice"
          value={state.voiceId}
          disabled={busy}
          onChange={(event) => {
            onStop();
            setInstalled(false);
            browserVoice.select(event.target.value);
          }}
        >
          {['American English', 'British English'].map((accent) => (
            <optgroup key={accent} label={accent}>
              {BROWSER_VOICES.filter((voice) => voice.accent === accent).map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} · {voice.gender}
                  {saved.voices.some((id) => id === voice.id) ? ' · saved' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <p className="voice-choice-meta">
        {selected.accent} · {selected.gender} ·{' '}
        {saved.voices.includes(state.voiceId) ? 'Saved on this device' : '0.52 MB voice profile'}
      </p>
      <p role={state.phase === 'error' ? 'alert' : 'status'}>
        {installed && state.phase === 'disabled'
          ? `${selected.name} is saved on this device. Preview the voice or return to your book.`
          : state.message}
      </p>
      {state.phase === 'downloading' && (
        <div className="voice-download">
          <progress aria-label="Voice download progress" max={1} value={state.progress} />
          <output>
            {Math.floor(state.progress * 100)}% ·{' '}
            {((state.progress * state.downloadBytes) / 1e6).toFixed(1)} /{' '}
            {(state.downloadBytes / 1e6).toFixed(1)} MB
          </output>
        </div>
      )}
      {(state.phase === 'checking' || state.phase === 'loading') && (
        <progress aria-label="Preparing neural voice" />
      )}
      {installed && !busy && (
        <VoicePreview key={state.voiceId} voice={state.voiceId} onBeforePlay={onStop} />
      )}
      <div className="voice-setup-actions">
        {busy ? (
          <button className="text-button" onClick={browserVoice.cancelSetup}>
            Cancel voice setup
          </button>
        ) : (
          <>
            {(!installed || state.phase === 'error') && (
              <button
                className="primary"
                onClick={() => void browserVoice.enable().catch(() => {})}
              >
                {state.phase === 'error'
                  ? 'Retry voice setup'
                  : saved.engine
                    ? `Download ${selected.name} · 0.52 MB`
                    : 'Enable browser voice · ~115 MB'}
              </button>
            )}
            {(saved.engine || installed || state.progress > 0) && (
              <button
                className="text-button"
                onClick={() => {
                  onStop();
                  void browserVoice
                    .remove()
                    .then(() => browserVoice.status())
                    .then((status) => {
                      setInstalled(status.available);
                      onStatus(status);
                    })
                    .catch(() => {});
                }}
              >
                Remove voice downloads
              </button>
            )}
          </>
        )}
      </div>
      <p className="settings-footnote">
        The first voice downloads about 115 MB; extra profiles are 0.52 MB. Speech runs locally.
        Book text is never sent to a narration API.
      </p>
      <details className="voice-download-details">
        <summary>Offline use &amp; managing voices</summary>
        <p className="settings-footnote">
          Saved voices work offline. Switching voices keeps your sentence, starting it again in the
          new voice. Previews use the same local neural engine. Removing downloads removes the
          engine and all saved voices, keeping your books. Keep Hush open while listening.
        </p>
      </details>
    </section>
  );
}
