/** UTF-16 offsets match DOM Range and Intl.Segmenter. Normalisation never changes the source tree. */
export interface TextPoint {
  node: Text;
  offset: number;
}
export interface TextMap {
  text: string;
  starts: TextPoint[];
  ends: TextPoint[];
}

export function stableHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}
export function sentenceSpans(text: string): { text: string; start: number; end: number }[] {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  return Array.from(segmenter.segment(text)).flatMap((segment) => {
    const leading = segment.segment.length - segment.segment.trimStart().length;
    const spoken = segment.segment.trim();
    return spoken
      ? [
          {
            text: spoken,
            start: segment.index + leading,
            end: segment.index + leading + spoken.length,
          },
        ]
      : [];
  });
}
/** Source-aligned bounded speech chunks, without splitting surrogate pairs. */
export function speechSpans(
  text: string,
  maxCodePoints = 420,
): { text: string; start: number; end: number; sentenceStart: number; sentenceEnd: number }[] {
  if (maxCodePoints < 2)
    throw new Error('The speech chunk limit must allow at least two characters.');
  return sentenceSpans(text).flatMap((sentence) => {
    const result: {
      text: string;
      start: number;
      end: number;
      sentenceStart: number;
      sentenceEnd: number;
    }[] = [];
    let start = sentence.start;
    while (start < sentence.end) {
      while (start < sentence.end && /\s/.test(text[start])) start++;
      if (start >= sentence.end) break;
      let end = start;
      let count = 0;
      for (const char of text.slice(start, sentence.end)) {
        if (count++ === maxCodePoints) break;
        end += char.length;
      }
      if (end < sentence.end) {
        const portion = text.slice(start, end);
        const matches = Array.from(portion.matchAll(/(?:[,;:—]\s+|\s+)/gu));
        const preferred = matches.filter((match) => match.index! >= portion.length * 0.45);
        if (preferred.length) end = start + preferred.at(-1)!.index! + preferred.at(-1)![0].length;
      }
      let trimmedEnd = end;
      while (trimmedEnd > start && /\s/.test(text[trimmedEnd - 1])) trimmedEnd--;
      result.push({
        text: text.slice(start, trimmedEnd),
        start,
        end: trimmedEnd,
        sentenceStart: sentence.start,
        sentenceEnd: sentence.end,
      });
      start = end;
    }
    return result;
  });
}

function collectText(root: Element, split: boolean): TextMap[] {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let result: TextMap = { text: '', starts: [], ends: [] };
  const runs: TextMap[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest('script,style,[hidden],[aria-hidden="true"],nav')) continue;
    if (
      root.matches('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption') &&
      parent.closest('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption') !== root
    ) {
      if (split && result.text.trim()) {
        runs.push(result);
        result = { text: '', starts: [], ends: [] };
      }
      continue;
    }
    const text = node as Text;
    for (let offset = 0; offset < text.length; offset++) {
      const char = text.data[offset];
      if (/\s/.test(char)) {
        if (!result.text.length) continue;
        if (result.text.endsWith(' ')) {
          result.ends[result.ends.length - 1] = { node: text, offset: offset + 1 };
          continue;
        }
        result.text += ' ';
      } else result.text += char;
      result.starts.push({ node: text, offset });
      result.ends.push({ node: text, offset: offset + 1 });
    }
  }
  if (result.text.trim()) runs.push(result);
  return runs;
}

export function mapText(root: Element): TextMap {
  return collectText(root, false)[0] ?? { text: '', starts: [], ends: [] };
}
export function mapTextRuns(root: Element): TextMap[] {
  return collectText(root, true);
}
export function rangeForSpan(map: TextMap, start: number, end: number): Range {
  const a = map.starts[start],
    b = map.ends[end - 1];
  if (!a || !b) throw new Error('This sentence no longer maps to the document.');
  const range = a.node.ownerDocument.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

export function canonicalBlocks(document: Document): Element[] {
  const body = document.body ?? document.querySelector('body');
  if (!body) return [];
  const blocks = Array.from(
    body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption'),
  );
  return blocks.filter((el) => !el.closest('nav,[hidden],[aria-hidden="true"]'));
}
