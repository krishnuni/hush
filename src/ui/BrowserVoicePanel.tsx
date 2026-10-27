import { useEffect, useState, useSyncExternalStore } from 'react';
import { browserVoice } from '../audio/browserVoice';
import type { NarrationStatus } from '../domain/types';
export function BrowserVoicePanel({
  onStatus,
  onStop,
}: {
  onStatus(status: NarrationStatus): void;
  onStop(): void;
}) {
  const state = useSyncExternalStore(browserVoice.subscribe, browserVoice.snapshot);
  const [installed, setInstalled] = useState(false);
  const busy = ['checking', 'downloading', 'loading'].includes(state.phase);
  useEffect(() => {
    let cancelled = false;
    void browserVoice.status().then((status) => {
      if (!cancelled) {
        setInstalled(status.available);
        onStatus(status);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state.phase, onStatus]);
  return (
    <section className="browser-voice-setup" aria-label="Browser neural voice">
      <p role={state.phase === 'error' ? 'alert' : 'status'}>
        {installed && state.phase === 'disabled'
          ? 'The voice is saved on this device. Open a book and choose Listen to load it.'
          : state.message}
      </p>
      {state.phase === 'downloading' && (
        <div className="voice-download">
          <progress aria-label="Voice download progress" max={1} value={state.progress} />
          <output>{Math.floor(state.progress * 100)}% downloaded</output>
        </div>
      )}
      {(state.phase === 'checking' || state.phase === 'loading') && (
        <progress aria-label="Preparing neural voice" />
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
                {state.phase === 'error' ? 'Retry voice setup' : 'Enable browser voice · ~115 MB'}
              </button>
            )}
            {(installed || state.progress > 0) && (
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
                Remove downloaded voice
              </button>
            )}
          </>
        )}
      </div>
      <p className="settings-footnote">
        English · Heart · Kokoro. About 115 MB, downloaded once from this site. When setup finishes,
        return to your book and choose Listen. Speech is generated locally; book text is never sent
        to a narration API. The installed voice can work offline. Keep Hush open while listening.
      </p>
    </section>
  );
}
