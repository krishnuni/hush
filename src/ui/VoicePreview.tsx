import { Play, Square } from 'lucide-react';
import { browserVoice } from '../audio/browserVoice';
import { webEngineKey } from '../audio/browserProtocol';
import { useNarration } from '../audio/useNarration';
import { voiceInfo, type VoiceId } from '../audio/voices';
import type { SpokenSentence } from '../domain/types';

const repository = { synthesize: browserVoice.synthesize.bind(browserVoice) };
const passage: SpokenSentence = {
  id: 'hush-voice-preview-v1',
  text: 'A quiet page opens a different world.',
  locator: { kind: 'epub', href: '', cfi: '', section: 0 },
};
const ignore = () => {};
const end = async () => null;

/** The same real media controller as reading, without book/checkpoint callbacks. */
export function VoicePreview({ voice, onBeforePlay }: { voice: VoiceId; onBeforePlay(): void }) {
  const preview = useNarration(repository, ignore, ignore, end);
  const active = preview.state === 'playing' || preview.state === 'buffering';
  const name = voiceInfo(voice).name;
  return (
    <div className="voice-preview" aria-label="Voice preview">
      <button
        className="text-button"
        onClick={() => {
          if (active) return preview.stop();
          onBeforePlay();
          preview.unlock();
          if (preview.state === 'paused') preview.toggle();
          else preview.start([passage], webEngineKey(voice));
        }}
      >
        {active ? <Square size={14} /> : <Play size={14} />}
        {active ? 'Stop preview' : 'Preview voice'}
      </button>
      <span role={preview.error ? 'alert' : 'status'}>
        {preview.error ||
          (preview.state === 'buffering'
            ? `Preparing ${name}…`
            : preview.state === 'playing'
              ? `Listening to ${name}`
              : preview.state === 'paused'
                ? 'Choose Preview voice to allow playback.'
                : '“A quiet page opens a different world.”')}
      </span>
    </div>
  );
}
