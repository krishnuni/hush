import { useEffect, useSyncExternalStore } from 'react';
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
  const busy = ['checking', 'downloading', 'loading'].includes(state.phase);
  useEffect(() => {
    void browserVoice.status().then(onStatus);
  }, [state.phase, onStatus]);
  return (
    <section className="browser-voice-setup" aria-label="Browser neural voice">
      <p role="status">{state.message}</p>
      {busy && <progress aria-label="Voice download progress" max={1} value={state.progress} />}
      <div className="voice-setup-actions">
        {busy ? (
          <button className="text-button" onClick={browserVoice.cancelSetup}>
            Cancel voice setup
          </button>
        ) : (
          <>
            <button className="primary" onClick={() => void browserVoice.enable().catch(() => {})}>
              {state.phase === 'ready' ? 'Reload browser voice' : 'Enable browser voice · ~115 MB'}
            </button>
            <button
              className="text-button"
              onClick={() => {
                onStop();
                void browserVoice.remove().catch(() => {});
              }}
            >
              Remove downloaded voice
            </button>
          </>
        )}
      </div>
      <p className="settings-footnote">
        English · Heart · Kokoro neural model. First-time setup uses a large download; Wi-Fi is
        recommended. Files come from this site. Your book text stays on your device.
      </p>
    </section>
  );
}
