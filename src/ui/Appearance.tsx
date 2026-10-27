import { X, Check } from 'lucide-react';
import { DEFAULT_PREFERENCES, type Preferences } from '../domain/types';
import { IconButton } from './IconButton';
import { ReaderPanel } from './ReaderPanel';
export function Appearance({
  preferences,
  onChange,
  onClose,
}: {
  preferences: Preferences;
  onChange(p: Preferences): void;
  onClose(): void;
}) {
  const change = (patch: Partial<Preferences>) => onChange({ ...preferences, ...patch });
  return (
    <ReaderPanel className="appearance" label="Appearance settings" onClose={onClose}>
      <header>
        <h2>Appearance</h2>
        <IconButton label="Close appearance" onClick={onClose}>
          <X size={19} />
        </IconButton>
      </header>
      <p className="drawer-intro">Typeset it your way. Your place stays put.</p>
      <fieldset>
        <legend>Theme</legend>
        <div className="theme-options">
          {(['light', 'warm', 'night'] as const).map((theme) => (
            <button
              key={theme}
              className={`theme-option ${preferences.theme === theme ? 'selected' : ''}`}
              aria-pressed={preferences.theme === theme}
              onClick={() => change({ theme })}
            >
              <span className={`theme-preview ${theme}`} aria-hidden="true">
                Aa{preferences.theme === theme && <Check size={12} />}
              </span>
              <span>{theme === 'night' ? 'Night' : theme === 'warm' ? 'Warm' : 'Light'}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <label className="control-label">
        Typeface
        <select
          value={preferences.font}
          onChange={(e) => change({ font: e.target.value as Preferences['font'] })}
        >
          <option value="serif">Noto Serif</option>
          <option value="sans">Noto Sans</option>
          <option value="publisher">Publisher’s typeface</option>
        </select>
      </label>
      <label className="range-control">
        <span>
          Size<output>{preferences.fontSize} px</output>
        </span>
        <input
          aria-label="Font size"
          type="range"
          min="16"
          max="32"
          step="1"
          value={preferences.fontSize}
          onChange={(e) => change({ fontSize: Number(e.target.value) })}
        />
      </label>
      <label className="range-control">
        <span>
          Line spacing<output>{preferences.lineHeight.toFixed(2)}</output>
        </span>
        <input
          aria-label="Line spacing"
          type="range"
          min="1.35"
          max="1.95"
          step="0.05"
          value={preferences.lineHeight}
          onChange={(e) => change({ lineHeight: Number(e.target.value) })}
        />
      </label>
      <fieldset>
        <legend>Text width</legend>
        <div className="segmented">
          {[
            [560, 'Narrow'],
            [680, 'Balanced'],
            [800, 'Wide'],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={preferences.contentWidth === value}
              onClick={() => change({ contentWidth: Number(value) })}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="range-control">
        <span>
          Outer margins<output>{preferences.margin} px</output>
        </span>
        <input
          aria-label="Outer margins"
          type="range"
          min="16"
          max="96"
          step="8"
          value={preferences.margin}
          onChange={(e) => change({ margin: Number(e.target.value) })}
        />
      </label>
      <button
        className="text-button reset"
        onClick={() => onChange({ ...DEFAULT_PREFERENCES, theme: preferences.theme })}
      >
        Reset reading defaults
      </button>
    </ReaderPanel>
  );
}
