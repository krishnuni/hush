import {
  canonicalBlocks,
  mapTextRuns,
  rangeForSpan,
  speechSpans,
  stableHash,
} from '../domain/sentences';
import type { SpokenSentence, PdfLocator } from '../domain/types';
export function epubPassage(
  document: Document,
  bookHash: string,
  section: number,
  href: string,
  cfiFromRange: (range: Range) => string,
): SpokenSentence[] {
  const passage: { sentence: SpokenSentence; range: Range }[] = [];
  canonicalBlocks(document).forEach((block, index) => {
    mapTextRuns(block).forEach((mapped, run) => {
      for (const span of speechSpans(mapped.text)) {
        const range = rangeForSpan(mapped, span.start, span.end);
        const cfi = cfiFromRange(range);
        const locator = { kind: 'epub' as const, cfi, href, section, quote: span.text };
        const full = cfiFromRange(rangeForSpan(mapped, span.sentenceStart, span.sentenceEnd));
        passage.push({
          range,
          sentence: {
            id: `${bookHash}:${section}:${index}:${run ? `r${run}:` : ''}${span.start}:${stableHash(span.text)}`,
            text: span.text,
            locator,
            highlightLocator: { ...locator, cfi: full },
          },
        });
      }
    });
  });
  return passage
    .sort((a, b) => a.range.compareBoundaryPoints(0, b.range))
    .map((item) => item.sentence);
}

export function pdfPassage(text: string, bookHash: string, locator: PdfLocator): SpokenSentence[] {
  return speechSpans(text).map((span) => ({
    id: `${bookHash}:pdf:${locator.page}:${span.start}:${stableHash(span.text)}`,
    text: span.text,
    locator,
    textStart: span.start,
    textEnd: span.end,
  }));
}
