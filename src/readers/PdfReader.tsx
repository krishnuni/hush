import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  GlobalWorkerOptions,
  getDocument,
  TextLayer,
  type PDFDocumentProxy,
  type PDFDocumentLoadingTask,
  type RenderTask,
  type PDFPageProxy,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import { pdfPassage } from '../documents/passages';
import { pdfPageText, type PdfTextSegment } from '../documents/pdfText';
import type {
  BookEntry,
  Chapter,
  LibraryRepository,
  PdfLocator,
  ReaderHandle,
  ReaderUpdate,
  SpokenSentence,
} from '../domain/types';
GlobalWorkerOptions.workerSrc = workerUrl;
interface Props {
  entry: BookEntry;
  repository: LibraryRepository;
  onUpdate(update: ReaderUpdate): void;
  onChapters(chapters: Chapter[]): void;
  onText(text: string): void;
}
export const PdfReader = forwardRef<ReaderHandle, Props>(function PdfReader(props, ref) {
  const initial: PdfLocator =
    props.entry.locator?.kind === 'pdf'
      ? props.entry.locator
      : { kind: 'pdf', page: 1, scale: 1, rotation: 0, y: 0, progress: 0 };
  const canvas = useRef<HTMLCanvasElement>(null),
    layer = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    pageBox = useRef<HTMLDivElement>(null),
    highlights = useRef<HTMLDivElement>(null);
  const pdf = useRef<PDFDocumentProxy | null>(null),
    loadingTask = useRef<PDFDocumentLoadingTask | null>(null),
    callbacks = useRef(props);
  callbacks.current = props;
  const position = useRef(initial),
    target = useRef<PdfLocator | null>(initial),
    activeSentence = useRef<SpokenSentence | null>(null);
  const textMap = useRef<{ segments: PdfTextSegment[]; divs: HTMLElement[] }>({
    segments: [],
    divs: [],
  });
  const pending = useRef<{ resolve(): void; reject(error: Error): void } | null>(null);
  const sentences = useRef<SpokenSentence[]>([]),
    scaleRef = useRef(1),
    rendering = useRef(true),
    renderTask = useRef<RenderTask | null>(null);
  const [page, setPage] = useState(Math.max(1, initial.page)),
    [count, setCount] = useState(0),
    [zoom, setZoom] = useState(Math.max(0.5, Math.min(2, initial.scale || 1))),
    [rotation, setRotation] = useState(initial.rotation || 0),
    [revision, setRevision] = useState(0),
    [width, setWidth] = useState(680);
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [passwordPrompt, setPasswordPrompt] = useState(false),
    [password, setPassword] = useState('');
  const passwordCallback = useRef<((password: string) => void) | null>(null);
  function reportPosition() {
    if (!pdf.current || !scroll.current) return;
    const next = { ...position.current, y: scroll.current.scrollTop / scaleRef.current };
    next.progress = Math.min(
      1,
      (next.page -
        1 +
        (scroll.current.scrollHeight > scroll.current.clientHeight
          ? scroll.current.scrollTop / (scroll.current.scrollHeight - scroll.current.clientHeight)
          : 0)) /
        pdf.current.numPages,
    );
    position.current = next;
    callbacks.current.onUpdate({
      locator: next,
      chapter: `Page ${next.page}`,
      pageLabel: `${next.page} of ${pdf.current.numPages}`,
    });
  }
  function navigate(locator: PdfLocator): Promise<void> {
    pending.current?.reject(new Error('Navigation superseded.'));
    const next = {
      ...locator,
      page: Math.max(1, Math.min(pdf.current?.numPages || 2000, Math.floor(locator.page))),
      scale: Math.max(0.5, Math.min(2, locator.scale || 1)),
      rotation: (((locator.rotation || 0) % 360) + 360) % 360,
    };
    target.current = next;
    position.current = next;
    rendering.current = true;
    setPage(next.page);
    setZoom(next.scale);
    setRotation(next.rotation);
    setRevision((value) => value + 1);
    return new Promise((resolve, reject) => {
      pending.current = { resolve, reject };
    });
  }
  function changeZoom(value: number) {
    void navigate({ ...position.current, scale: Math.max(0.5, Math.min(2, value)) }).catch(
      () => {},
    );
  }
  function drawHighlight() {
    const overlay = highlights.current,
      sentence = activeSentence.current;
    if (!overlay) return;
    overlay.replaceChildren();
    if (
      sentence?.locator.kind !== 'pdf' ||
      sentence.locator.page !== position.current.page ||
      sentence.textStart === undefined ||
      sentence.textEnd === undefined
    )
      return;
    const { segments, divs } = textMap.current;
    const first = segments.find((s) => s.end > sentence.textStart!),
      last = [...segments].reverse().find((s) => s.start < sentence.textEnd!);
    if (!first || !last) return;
    const a = divs[first.index]?.firstChild,
      b = divs[last.index]?.firstChild;
    if (!a || !b || a.nodeType !== Node.TEXT_NODE || b.nodeType !== Node.TEXT_NODE) return;
    const range = document.createRange();
    range.setStart(
      a,
      Math.max(0, Math.min(a.textContent?.length || 0, sentence.textStart - first.start)),
    );
    range.setEnd(
      b,
      Math.max(0, Math.min(b.textContent?.length || 0, sentence.textEnd - last.start)),
    );
    const box = overlay.getBoundingClientRect();
    for (const rect of range.getClientRects()) {
      if (rect.width < 0.1) continue;
      const mark = document.createElement('span');
      mark.className = 'hush-current-sentence';
      Object.assign(mark.style, {
        left: `${rect.left - box.left}px`,
        top: `${rect.top - box.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      overlay.append(mark);
    }
    const mark = overlay.firstElementChild as HTMLElement | null;
    if (mark && scroll.current) {
      const rect = mark.getBoundingClientRect(),
        view = scroll.current.getBoundingClientRect();
      if (rect.top < view.top || rect.bottom > view.bottom)
        scroll.current.scrollTop += rect.top - view.top - 40;
    }
  }
  useImperativeHandle(
    ref,
    () => ({
      next() {
        if (count)
          void navigate({
            ...position.current,
            page: Math.min(count, position.current.page + 1),
            y: 0,
          }).catch(() => {});
      },
      previous() {
        void navigate({
          ...position.current,
          page: Math.max(1, position.current.page - 1),
          y: 0,
        }).catch(() => {});
      },
      async goTo(locator) {
        if (typeof locator === 'number' || typeof locator === 'string')
          await navigate({
            ...position.current,
            page: typeof locator === 'number' ? locator : Number(locator.replace('pdf:', '')) || 1,
            y: 0,
          });
        else if (locator.kind === 'pdf') await navigate(locator);
      },
      getSentences() {
        return sentences.current;
      },
      async nextPassage(after, signal) {
        const document = pdf.current;
        if (!document || after.locator.kind !== 'pdf') return null;
        for (let number = after.locator.page + 1; number <= document.numPages; number++) {
          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          const next = await document.getPage(number);
          const text = await next.getTextContent();
          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          const content = pdfPageText(text.items).text;
          next.cleanup();
          const passage = pdfPassage(content, callbacks.current.entry.hash, {
            ...after.locator,
            page: number,
            y: 0,
            progress: (number - 1) / document.numPages,
          });
          if (passage.length) return passage;
        }
        return null;
      },
      highlight(sentence) {
        activeSentence.current = sentence;
        if (sentence?.locator.kind === 'pdf' && sentence.locator.page !== position.current.page) {
          void navigate({ ...position.current, page: sentence.locator.page, y: 0 }).catch(() => {});
        } else drawHighlight();
      },
    }),
    [count],
  );
  useEffect(() => {
    let cancelled = false;
    setError('');
    setLoading(true);
    const task = props.repository.read(props.entry.id).then((bytes) => {
      if (cancelled) return;
      const load = getDocument({
        data: bytes,
        useSystemFonts: true,
        maxImageSize: 16000000,
        canvasMaxAreaInBytes: 32000000,
      });
      loadingTask.current = load;
      load.onPassword = (update: (password: string) => void) => {
        passwordCallback.current = update;
        setPasswordPrompt(true);
        setLoading(false);
      };
      return load.promise.then(async (document) => {
        if (cancelled) {
          void load.destroy();
          return;
        }
        if (document.numPages > 2000) {
          void load.destroy();
          throw new Error('This build supports PDFs with up to 2,000 pages.');
        }
        pdf.current = document;
        const outline = await document.getOutline();
        const chapters: Chapter[] = [];
        async function visit(items: NonNullable<typeof outline>, level = 0) {
          for (const item of items) {
            try {
              const destination =
                typeof item.dest === 'string'
                  ? await document.getDestination(item.dest)
                  : item.dest;
              if (destination?.[0] !== undefined) {
                const index =
                  typeof destination[0] === 'number'
                    ? destination[0]
                    : await document.getPageIndex(destination[0]);
                chapters.push({
                  id: `page${index + 1}-${chapters.length}`,
                  label: item.title,
                  href: `pdf:${index + 1}`,
                  level,
                });
              }
            } catch {}
            if (item.items?.length) await visit(item.items, level + 1);
          }
        }
        if (outline) await visit(outline);
        if (cancelled) return;
        callbacks.current.onChapters(
          chapters.length
            ? chapters
            : Array.from({ length: document.numPages }, (_, i) => ({
                id: `page${i + 1}`,
                label: `Page ${i + 1}`,
                href: `pdf:${i + 1}`,
                level: 0,
              })),
        );
        const clamped = Math.max(1, Math.min(document.numPages, position.current.page));
        position.current = { ...position.current, page: clamped };
        if (target.current) target.current.page = clamped;
        setPage(clamped);
        setCount(document.numPages);
      });
    });
    void task.catch((e) => {
      if (!cancelled) {
        setError(e.message ?? 'Hush could not read this PDF.');
        setLoading(false);
        pending.current?.reject(e);
        pending.current = null;
      }
    });
    return () => {
      cancelled = true;
      pending.current?.reject(new Error('The document was closed.'));
      pending.current = null;
      renderTask.current?.cancel();
      void loadingTask.current?.destroy();
      loadingTask.current = null;
      pdf.current = null;
    };
  }, [props.entry.id, props.repository]);
  useEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setWidth(Math.max(200, Math.min(820, node.clientWidth - 48))),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false,
      render: RenderTask | undefined,
      textLayer: TextLayer | undefined,
      pdfPage: PDFPageProxy | undefined;
    const run = async () => {
      const document = pdf.current;
      if (!document || !canvas.current || !layer.current || !pageBox.current) return;
      rendering.current = true;
      setLoading(true);
      setError('');
      const previous = renderTask.current;
      if (previous) {
        previous.cancel();
        await previous.promise.catch(() => {});
      }
      if (cancelled) return;
      pdfPage = await document.getPage(page);
      if (cancelled) return;
      const natural = pdfPage.getViewport({ scale: 1, rotation }),
        scale = Math.max(0.25, width / natural.width) * zoom;
      scaleRef.current = scale;
      const viewport = pdfPage.getViewport({ scale, rotation });
      const ratio = Math.min(
        devicePixelRatio || 1,
        2,
        Math.sqrt(16000000 / (viewport.width * viewport.height)),
      );
      const element = canvas.current!;
      element.width = Math.ceil(viewport.width * ratio);
      element.height = Math.ceil(viewport.height * ratio);
      element.style.width = `${viewport.width}px`;
      element.style.height = `${viewport.height}px`;
      pageBox.current!.style.width = `${viewport.width}px`;
      pageBox.current!.style.height = `${viewport.height}px`;
      pageBox.current!.style.setProperty('--scale-factor', String(scale));
      render = pdfPage.render({
        canvas: element,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      renderTask.current = render;
      await render.promise;
      if (cancelled) return;
      const text = await pdfPage.getTextContent();
      if (cancelled) return;
      layer.current!.replaceChildren();
      textLayer = new TextLayer({ textContentSource: text, container: layer.current!, viewport });
      await textLayer.render();
      if (cancelled) return;
      const { text: content, segments } = pdfPageText(text.items);
      textMap.current = { segments, divs: textLayer.textDivs };
      callbacks.current.onText(content);
      const restore =
        target.current?.page === page
          ? target.current
          : position.current.page === page
            ? position.current
            : null;
      const locator: PdfLocator = {
        kind: 'pdf',
        page,
        scale: zoom,
        rotation,
        y: restore?.y ?? 0,
        progress: (page - 1) / document.numPages,
      };
      position.current = locator;
      target.current = null;
      sentences.current = pdfPassage(content, props.entry.hash, locator);
      if (scroll.current) scroll.current.scrollTop = locator.y * scale;
      rendering.current = false;
      reportPosition();
      drawHighlight();
      setLoading(false);
      pending.current?.resolve();
      pending.current = null;
    };
    void run().catch((e) => {
      if (!cancelled && e.name !== 'RenderingCancelledException') {
        rendering.current = false;
        setError(e.message ?? 'This page could not be rendered.');
        setLoading(false);
        pending.current?.reject(e);
        pending.current = null;
      }
    });
    return () => {
      cancelled = true;
      render?.cancel();
      textLayer?.cancel();
      if (pdfPage)
        void (render?.promise ?? Promise.resolve()).catch(() => {}).then(() => pdfPage?.cleanup());
    };
  }, [page, count, zoom, rotation, width, revision, props.entry.id]);
  return (
    <div className="pdf-reader">
      <div
        className="pdf-scroll"
        ref={scroll}
        onScroll={() => {
          if (!rendering.current) reportPosition();
        }}
      >
        <div className="pdf-page" ref={pageBox}>
          <canvas ref={canvas} aria-label={`Page ${page}`} />
          <div ref={layer} className="textLayer" />
          <div ref={highlights} className="pdf-highlights" aria-hidden="true" />
        </div>
      </div>
      <div className="pdf-zoom">
        <button onClick={() => changeZoom(1)}>Fit width</button>
        <button aria-label="Zoom out" onClick={() => changeZoom(zoom - 0.15)}>
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button aria-label="Zoom in" onClick={() => changeZoom(zoom + 0.15)}>
          +
        </button>
        <button
          aria-label="Rotate page"
          onClick={() => {
            const target = { ...position.current, rotation: (rotation + 90) % 360 };
            void navigate(target).catch(() => {});
          }}
        >
          Rotate
        </button>
      </div>
      {loading && (
        <div className="reader-message" role="status">
          Opening page…
        </div>
      )}
      {error && (
        <div className="reader-message error" role="alert">
          <h2>This PDF could not be opened.</h2>
          <p>{error}</p>
        </div>
      )}
      {passwordPrompt && (
        <form
          className="password-prompt"
          onSubmit={(e) => {
            e.preventDefault();
            passwordCallback.current?.(password);
            setPassword('');
            setPasswordPrompt(false);
            setLoading(true);
          }}
        >
          <h2>This PDF needs a password.</h2>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </label>
          <button className="primary" type="submit">
            Open PDF
          </button>
          <p>Your password is kept in memory for this session.</p>
        </form>
      )}
    </div>
  );
});
