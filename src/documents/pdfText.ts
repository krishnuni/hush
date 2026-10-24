export interface PdfTextSource {
  str?: string;
  hasEOL?: boolean;
}
export interface PdfTextSegment {
  index: number;
  start: number;
  end: number;
}
/** Keep narration offsets aligned with PDF.js textDivs, including inserted item spacing. */
export function pdfPageText(items: unknown[]): { text: string; segments: PdfTextSegment[] } {
  let raw = '';
  let index = 0;
  const segments: PdfTextSegment[] = [];
  for (const value of items) {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('str' in value) ||
      typeof value.str !== 'string'
    )
      continue;
    const item = value as PdfTextSource;
    const start = raw.length;
    raw += item.str;
    segments.push({ index: index++, start, end: raw.length });
    raw += item.hasEOL ? '\n' : ' ';
  }
  const leading = raw.length - raw.trimStart().length;
  return {
    text: raw.trim(),
    segments: segments.map((s) => ({ ...s, start: s.start - leading, end: s.end - leading })),
  };
}
