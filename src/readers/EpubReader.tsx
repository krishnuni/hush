import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import ePub, { EpubCFI, type Book, type Rendition, type Contents, type NavItem } from 'epubjs';
import { prepareEpub } from '../documents/import';
import { epubPassage } from '../documents/passages';
import type {
  BookEntry,
  Chapter,
  EpubLocator,
  LibraryRepository,
  Preferences,
  ReaderHandle,
  ReaderUpdate,
  SpokenSentence,
} from '../domain/types';

interface Props {
  entry: BookEntry;
  repository: LibraryRepository;
  preferences: Preferences;
  onUpdate(update: ReaderUpdate): void;
  onChapters(chapters: Chapter[]): void;
}
const colours = {
  warm: ['#fcf8ef', '#2b302c', '#626b61'],
  light: ['#ffffff', '#252a27', '#5e665f'],
  night: ['#1c211f', '#e5e5da', '#adb5ac'],
};

export const EpubReader = forwardRef<ReaderHandle, Props>(function EpubReader(props, ref) {
  const container = useRef<HTMLDivElement>(null);
  const book = useRef<Book | null>(null);
  const rendition = useRef<Rendition | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const activeCfi = useRef<string | null>(null);
  const sentences = useRef<SpokenSentence[]>([]);
  const passages = useRef(new Map<number, SpokenSentence[]>());
  const current = useRef<EpubLocator | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useImperativeHandle(
    ref,
    () => ({
      next() {
        void rendition.current?.next();
      },
      previous() {
        void rendition.current?.prev();
      },
      async goTo(locator) {
        if (typeof locator === 'number') return;
        await rendition.current?.display(
          typeof locator === 'string'
            ? locator
            : locator.kind === 'epub'
              ? locator.cfi || locator.href
              : undefined,
        );
      },
      getSentences() {
        const passage = passages.current.get(current.current?.section ?? 0) ?? sentences.current;
        if (!current.current) return passage;
        const cfi = new EpubCFI();
        return passage.filter((sentence) => {
          if (sentence.locator.kind !== 'epub') return false;
          const end = new EpubCFI(sentence.locator.cfi);
          end.collapse(false);
          return cfi.compare(end, current.current!.cfi) >= 0;
        });
      },
      async nextPassage(after, signal) {
        const instance = book.current;
        if (!instance || after.locator.kind !== 'epub') return null;
        let next = instance.spine.get(after.locator.section).next();
        while (next && !signal.aborted) {
          const section = instance.spine.get(next.index);
          const cached = passages.current.get(section.index);
          if (cached?.length) return cached;
          await section.load(instance.load.bind(instance));
          let passage: SpokenSentence[] = [];
          try {
            if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
            passage = epubPassage(
              section.document,
              callbacks.current.entry.hash,
              section.index,
              section.href,
              (range) => section.cfiFromRange(range),
            );
          } finally {
            section.unload();
          }
          if (passage.length) return passage;
          next = section.next();
        }
        return null;
      },
      highlight(sentence) {
        if (activeCfi.current)
          rendition.current?.annotations.remove(activeCfi.current, 'highlight');
        activeCfi.current = null;
        if (sentence?.locator.kind === 'epub') {
          const highlight =
            sentence.highlightLocator?.kind === 'epub'
              ? sentence.highlightLocator.cfi
              : sentence.locator.cfi;
          activeCfi.current = highlight;
          const view = rendition.current;
          void view
            ?.display(sentence.locator.cfi)
            .then(() => {
              if (activeCfi.current !== highlight) return;
              view.annotations.highlight(highlight, {}, undefined, 'hush-current-sentence', {
                fill: '#9da660',
                'fill-opacity': '0.25',
                'mix-blend-mode': 'multiply',
              });
            })
            .catch(() => {});
        }
      },
    }),
    [],
  );

  const applyPreferences = (contents: Contents, preferences: Preferences) => {
    const [background, foreground, muted] = colours[preferences.theme];
    const style =
      contents.document.getElementById('hush-reader-style') ??
      contents.document.head.appendChild(contents.document.createElement('style'));
    style.id = 'hush-reader-style';
    style.textContent = `html,body{background:${background}!important;color:${foreground}!important}body{font-size:${preferences.fontSize}px!important;line-height:${preferences.lineHeight}!important;${preferences.font === 'publisher' ? '' : `font-family:${preferences.font === 'serif' ? 'HushSerif, Georgia, serif' : 'HushSans, sans-serif'}!important;`}padding:8px 6px!important;margin:0!important;text-align:left!important;}p,li,blockquote{font-size:inherit!important;line-height:${preferences.lineHeight}!important}p{margin:0 0 1.05em!important}h1,h2,h3{line-height:1.25!important;color:${foreground}!important;}h1{font-size:1.75em!important;font-weight:400!important;margin:1em 0 1.1em!important}img,svg{max-width:100%!important;height:auto!important}a{color:${foreground}!important;text-underline-offset:3px}figcaption{font-size:.75em;color:${muted}}::selection{background:#b8bc8c88}`;
    if (preferences.font !== 'publisher')
      style.textContent += `body p,body li,body blockquote,body h1,body h2,body h3,body h4,body figcaption{font-family:${preferences.font === 'serif' ? 'HushSerif, Georgia, serif' : 'HushSans, sans-serif'}!important}`;
  };

  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    let resizeFrame = 0;
    const fontUrls: string[] = [];
    setLoading(true);
    setError('');
    sentences.current = [];
    passages.current.clear();
    const run = async () => {
      const bytes = await props.repository.read(props.entry.id);
      const safe = await prepareEpub(bytes);
      if (cancelled || !container.current) return;
      const fonts = await Promise.all(
        ['NotoSerif-Regular.ttf', 'NotoSans-Regular.ttf'].map(async (name) => {
          const response = await fetch(`${import.meta.env.BASE_URL}fonts/${name}`);
          if (!response.ok) return '';
          const url = URL.createObjectURL(await response.blob());
          fontUrls.push(url);
          return url;
        }),
      );
      if (cancelled) return;
      const instance = ePub(safe.buffer as ArrayBuffer, { replacements: 'blobUrl' });
      book.current = instance;
      await instance.ready;
      if (cancelled) {
        instance.destroy();
        return;
      }
      const nav = await instance.loaded.navigation;
      const chapters: Chapter[] = [];
      const flatten = (items: NavItem[], level = 0) => {
        for (const item of items) {
          chapters.push({ id: item.id, label: item.label.trim(), href: item.href, level });
          if (item.subitems?.length) flatten(item.subitems, level + 1);
        }
      };
      flatten(nav.toc);
      callbacks.current.onChapters(chapters);
      const view = instance.renderTo(container.current!, {
        width: '100%',
        height: '100%',
        flow: 'paginated',
        spread: 'none',
        allowScriptedContent: false,
      });
      rendition.current = view;
      view.hooks.content.register(async (contents: Contents) => {
        const fontStyle = contents.document.createElement('style');
        fontStyle.textContent = `@font-face{font-family:HushSerif;src:url('${fonts[0]}')}@font-face{font-family:HushSans;src:url('${fonts[1]}')}`;
        contents.document.head.appendChild(fontStyle);
        applyPreferences(contents, callbacks.current.preferences);
        await Promise.all(
          ['HushSerif', 'HushSans'].map((family) =>
            contents.document.fonts.load(`21px ${family}`).catch(() => []),
          ),
        );
        if (cancelled) return;
        const passage = epubPassage(
          contents.document,
          props.entry.hash,
          contents.sectionIndex,
          instance.spine.get(contents.sectionIndex).href,
          (range) => contents.cfiFromRange(range),
        );
        sentences.current = passage;
        passages.current.set(contents.sectionIndex, passage);
        if (passages.current.size > 3)
          passages.current.delete(passages.current.keys().next().value!);
        contents.document.addEventListener(
          'click',
          (event) => {
            const link = (event.target as Element).closest?.('a');
            if (!link) return;
            const href = link.getAttribute('href') ?? '';
            if (/^(https?:|mailto:)/i.test(href)) {
              event.preventDefault();
              event.stopPropagation();
              if (window.confirm('Open this link outside Hush?'))
                window.open(href, '_blank', 'noopener,noreferrer');
            }
          },
          true,
        );
      });
      let positionReady = false;
      view.on(
        'relocated',
        (location: {
          start: {
            cfi: string;
            href: string;
            index: number;
            percentage: number;
            displayed: { page: number; total: number };
          };
        }) => {
          if (cancelled || !positionReady) return;
          const start = location.start;
          const progress =
            instance.locations.length() > 0
              ? instance.locations.percentageFromCfi(start.cfi)
              : undefined;
          const locator: EpubLocator = {
            kind: 'epub',
            cfi: start.cfi,
            href: start.href,
            section: start.index,
            progress,
          };
          current.current = locator;
          const chapter =
            chapters.find((item) => item.href.split('#')[0] === start.href)?.label ??
            `Chapter ${start.index + 1}`;
          callbacks.current.onUpdate({
            locator,
            chapter,
            pageLabel: `${start.displayed.page} / ${start.displayed.total} in chapter`,
          });
        },
      );
      const saved = props.entry.locator?.kind === 'epub' ? props.entry.locator : undefined;
      try {
        await view.display(saved?.cfi || saved?.href);
      } catch {
        await view.display(saved?.href || undefined);
      }
      if (cancelled) return;
      positionReady = true;
      setLoading(false);
      const location = view.currentLocation() as unknown as {
        start?: {
          cfi: string;
          href: string;
          index: number;
          displayed: { page: number; total: number };
        };
      };
      if (location.start) {
        current.current = {
          kind: 'epub',
          cfi: location.start.cfi,
          href: location.start.href,
          section: location.start.index,
        };
        callbacks.current.onUpdate({
          locator: current.current,
          chapter:
            chapters.find((item) => item.href.split('#')[0] === location.start!.href)?.label ??
            'Your book',
          pageLabel: `${location.start.displayed.page} / ${location.start.displayed.total} in chapter`,
        });
      }
      let lastWidth = container.current!.clientWidth,
        lastHeight = container.current!.clientHeight;
      resize = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          if (!container.current || cancelled) return;
          const { clientWidth: w, clientHeight: h } = container.current;
          if (w !== lastWidth || h !== lastHeight) {
            lastWidth = w;
            lastHeight = h;
            void view.resize(w, h);
          }
        });
      });
      resize.observe(container.current!);
      void instance.locations
        .generate(150)
        .then(() => {
          if (!cancelled && current.current) {
            const locator = {
              ...current.current,
              progress: instance.locations.percentageFromCfi(current.current.cfi),
            };
            callbacks.current.onUpdate({
              locator,
              chapter:
                chapters.find((item) => item.href.split('#')[0] === locator.href)?.label ??
                'Your book',
              pageLabel: 'Content position',
            });
          }
        })
        .catch(() => {});
    };
    void run().catch((error) => {
      if (!cancelled) {
        setError(error instanceof Error ? error.message : 'Hush could not render this EPUB.');
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      resize?.disconnect();
      cancelAnimationFrame(resizeFrame);
      book.current?.destroy();
      book.current = null;
      rendition.current = null;
      fontUrls.forEach(URL.revokeObjectURL);
    };
  }, [props.entry.id, props.repository]);

  useEffect(() => {
    const view = rendition.current;
    if (!view) return;
    for (const content of view.getContents() as unknown as Contents[])
      applyPreferences(content, props.preferences);
    const anchor = current.current?.cfi;
    const timer = setTimeout(() => {
      if (anchor) void view.display(anchor).catch(() => {});
    }, 80);
    return () => clearTimeout(timer);
  }, [props.preferences]);

  return (
    <div
      className="epub-surface"
      aria-label="Book content"
      style={{ maxWidth: props.preferences.contentWidth, marginInline: props.preferences.margin }}
    >
      <div ref={container} className="epub-mount" />
      {loading && (
        <div className="reader-message" role="status">
          <span className="loading-dot" />
          Opening your book…
        </div>
      )}
      {error && (
        <div className="reader-message error" role="alert">
          <h2>This book could not be opened.</h2>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
});
