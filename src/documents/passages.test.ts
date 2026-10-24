import { it, expect } from 'vitest';
import { speechSpans } from '../domain/sentences';
import { epubPassage } from './passages';
it('preserves UTF-16 offsets and every non-whitespace character in long Unicode speech', () => {
  const text = 'A long clause with emoji 🌙 and words, '.repeat(60) + 'finishes here.';
  const spans = speechSpans(text, 90);
  expect(spans.length).toBeGreaterThan(2);
  for (const span of spans) {
    expect(Array.from(span.text).length).toBeLessThanOrEqual(90);
    expect(text.slice(span.start, span.end)).toBe(span.text);
    expect(span.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
  }
  expect(spans.map((span) => span.text.replace(/\s/g, '')).join('')).toBe(text.replace(/\s/g, ''));
});
it('retains a complete sentence highlight while splitting its inference jobs', () => {
  const doc = new DOMParser().parseFromString(
    `<html><body><p>${'Long prose across emphasis and space, '.repeat(40)}ends.</p></body></html>`,
    'text/html',
  );
  const passage = epubPassage(
    doc,
    'book',
    2,
    'chapter.xhtml',
    (range) => `${range.startOffset}:${range.endOffset}`,
  );
  expect(passage.length).toBeGreaterThan(1);
  expect(new Set(passage.map((unit) => unit.id)).size).toBe(passage.length);
  expect(
    new Set(
      passage.map((unit) =>
        unit.highlightLocator?.kind === 'epub' ? unit.highlightLocator.cfi : '',
      ),
    ).size,
  ).toBe(1);
});

it('narrates nested list and quotation text once in source order', () => {
  document.body.innerHTML =
    '<blockquote>Before.<p>Quoted inside.</p>After.</blockquote><ul><li>First.<ul><li>Nested.</li></ul>Last.</li></ul>';
  const passage = epubPassage(document, 'hash', 0, 'c.xhtml', (range) => range.toString());
  expect(passage.map((unit) => unit.text)).toEqual([
    'Before.',
    'Quoted inside.',
    'After.',
    'First.',
    'Nested.',
    'Last.',
  ]);
});
