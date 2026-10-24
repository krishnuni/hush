import { describe, it, expect } from 'vitest';
import { mapText, rangeForSpan, sentenceSpans, stableHash } from './sentences';
import { SessionEpoch, audioCacheKey } from './queue';
import { boundPreferences } from './types';

describe('source-to-sentence mapping', () => {
  it('preserves DOM offsets across emphasis, whitespace and Unicode', () => {
    document.body.innerHTML = '<p>  The <em>quiet 🌙</em> room.\n\nA second sentence.</p>';
    const map = mapText(document.querySelector('p')!);
    expect(map.text).toBe('The quiet 🌙 room. A second sentence.');
    const spans = sentenceSpans(map.text);
    expect(spans).toHaveLength(2);
    expect(rangeForSpan(map, spans[0].start, spans[0].end).toString()).toBe('The quiet 🌙 room.');
    expect(rangeForSpan(map, spans[1].start, spans[1].end).toString()).toBe('A second sentence.');
  });
  it('ignores scripts and explicitly hidden prose', () => {
    document.body.innerHTML =
      '<p>Visible.<span hidden>Secret</span><script>bad()</script><span aria-hidden="true">Decorative</span></p>';
    expect(mapText(document.querySelector('p')!).text).toBe('Visible.');
  });
  it('uses stable, text-sensitive sentence identities', () => {
    expect(stableHash('A sentence.')).toBe(stableHash('A sentence.'));
    expect(stableHash('A sentence.')).not.toBe(stableHash('Another sentence.'));
  });
  it('rejects a range that no longer exists', () => {
    document.body.innerHTML = '<p>A.</p>';
    expect(() => rangeForSpan(mapText(document.querySelector('p')!), 0, 100)).toThrow();
  });
});
describe('playback session isolation', () => {
  it('invalidates late synthesis after a seek', () => {
    const epoch = new SessionEpoch();
    const first = epoch.next();
    expect(epoch.isCurrent(first)).toBe(true);
    epoch.next();
    expect(epoch.isCurrent(first)).toBe(false);
  });
  it('does not reuse audio across engine or document changes', () => {
    expect(audioCacheKey('a', 's', 'v1')).not.toBe(audioCacheKey('a', 's', 'v2'));
    expect(audioCacheKey('a', 's', 'v1')).not.toBe(audioCacheKey('b', 's', 'v1'));
  });
});
it('clamps imported preferences to the supported reading envelope', () => {
  expect(
    boundPreferences({
      fontSize: 100,
      lineHeight: -1,
      contentWidth: NaN,
      theme: 'unknown' as never,
    }),
  ).toMatchObject({ fontSize: 32, lineHeight: 1.35, contentWidth: 680, theme: 'warm' });
});
