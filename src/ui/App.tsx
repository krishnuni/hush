import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Headphones,
  List,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { LibraryView } from './LibraryView';
import { NarrationDock } from './NarrationDock';
import { ReaderPanel } from './ReaderPanel';
import { FoldMark } from './Brand';
import { BookCover } from './BookCover';
import { changeScene } from './transition';
import { repository } from '../platform/repository';
import { inspectDocument } from '../documents/import';
import { createSampleBook, SAMPLE_BOOKS } from '../documents/samples';
import {
  boundPreferences,
  DEFAULT_PREFERENCES,
  type BookEntry,
  type Chapter,
  type Locator,
  type NarrationStatus,
  type Preferences,
  type ReaderHandle,
  type ReaderUpdate,
  type SpokenSentence,
} from '../domain/types';
import { useNarration, type Checkpoint } from '../audio/useNarration';
import { stableHash } from '../domain/sentences';
import { audioCache } from '../audio/cache';
import { Appearance } from './Appearance';
import { IconButton } from './IconButton';
import { BrowserVoicePanel } from './BrowserVoicePanel';

type Panel = 'contents' | 'appearance' | 'bookmarks' | 'pdf-text' | null;
const EpubReader = lazy(() =>
  import('../readers/EpubReader').then((module) => ({ default: module.EpubReader })),
);
const PdfReader = lazy(() =>
  import('../readers/PdfReader').then((module) => ({ default: module.PdfReader })),
);
const friendly = (error: unknown) => (error instanceof Error ? error.message : String(error));
const lastOpened = (a: BookEntry, b: BookEntry) =>
  (b.openedAt ?? b.addedAt) - (a.openedAt ?? a.addedAt);

export function App() {
  const [books, setBooks] = useState<BookEntry[]>([]);
  const booksRef = useRef(books);
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'reading' | 'finished'>('all');
  const [sort, setSort] = useState<'recent' | 'title' | 'author'>('recent');
  const [panel, setPanel] = useState<Panel>(null);
  const [focus, setFocus] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [location, setLocation] = useState<ReaderUpdate | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState('');
  const [pdfText, setPdfText] = useState('');
  const [narrationStatus, setNarrationStatus] = useState<NarrationStatus>({
    available: false,
    engine: repository.kind === 'browser' ? 'Kokoro · browser neural voice' : 'Pocket TTS',
  });
  const [editing, setEditing] = useState<BookEntry | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const reader = useRef<ReaderHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const settings = useRef<HTMLDialogElement>(null);
  const editDialog = useRef<HTMLDialogElement>(null);
  const saves = useRef(Promise.resolve());
  const positionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommit = useRef(0);
  const pendingPosition = useRef<{ id: string; update: ReaderUpdate } | null>(null);
  const hydrated = useRef(false);
  const prefsRef = useRef(preferences);
  prefsRef.current = preferences;
  const active = books.find((book) => book.id === activeId) ?? null;

  const replaceBooks = useCallback((next: BookEntry[]) => {
    booksRef.current = next;
    setBooks(next);
  }, []);
  const patchBook = useCallback((id: string, patch: Partial<BookEntry>) => {
    const original = booksRef.current.find((book) => book.id === id);
    if (!original) return;
    const entry = { ...original, ...patch };
    const next = booksRef.current.map((book) => (book.id === id ? entry : book));
    booksRef.current = next;
    setBooks(next);
    saves.current = saves.current
      .catch(() => {})
      .then(() => repository.update(entry))
      .catch((e) => setError(`Save failed: ${friendly(e)}`));
  }, []);
  const flushPosition = useCallback(() => {
    if (positionTimer.current) clearTimeout(positionTimer.current);
    positionTimer.current = null;
    const pending = pendingPosition.current;
    if (pending) {
      pendingPosition.current = null;
      lastCommit.current = Date.now();
      patchBook(pending.id, { locator: pending.update.locator });
    }
  }, [patchBook]);
  const [spokenSentence, setSpokenSentence] = useState<SpokenSentence | null>(null);
  const onSentence = useCallback((sentence: SpokenSentence | null) => {
    setSpokenSentence(sentence);
    reader.current?.highlight(sentence);
  }, []);
  const narrationBook = useRef<string | null>(null);
  const narrationRequest = useRef(0);
  const activeBookId = useRef(activeId);
  activeBookId.current = activeId;
  const onPlaybackCheckpoint = useCallback(
    (position: Checkpoint) => {
      const id = narrationBook.current;
      if (!id) return;
      const book = booksRef.current.find((item) => item.id === id);
      if (!book) return;
      patchBook(id, {
        listening: {
          sentenceId: position.sentence.id,
          locator: position.sentence.locator,
          offset: position.offset,
          textHash: stableHash(position.sentence.text),
          engineKey: position.engineKey,
          clipKey: position.clipKey,
          speed: position.speed,
          volume: position.volume,
        },
      });
    },
    [patchBook],
  );
  const nextPassage = useCallback(
    (after: SpokenSentence, signal: AbortSignal) =>
      reader.current?.nextPassage(after, signal) ?? Promise.resolve(null),
    [],
  );
  const narration = useNarration(repository, onSentence, onPlaybackCheckpoint, nextPassage);

  const turnPage = useCallback(
    (direction: 'next' | 'previous') => {
      narrationRequest.current++;
      narration.stop();
      flushPosition();
      reader.current?.[direction]();
    },
    [narration.stop, flushPosition],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([repository.list(), repository.getPreferences(), repository.narrationStatus()])
      .then(([entries, prefs, status]) => {
        if (cancelled) return;
        hydrated.current = true;
        replaceBooks(entries);
        setPreferences(prefs);
        setNarrationStatus(status);
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(friendly(e));
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [replaceBooks]);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        'content',
        preferences.theme === 'night'
          ? '#20211f'
          : preferences.theme === 'warm'
            ? '#f6f3eb'
            : '#fffefa',
      );
    if (!ready) return;
    void repository.setPreferences(preferences).catch((e) => setError(friendly(e)));
    return undefined;
  }, [preferences, ready]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const flush = () => {
      if (!hydrated.current) return;
      flushPosition();
      void repository.setPreferences(prefsRef.current).catch(() => {});
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('blur', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('blur', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [flushPosition]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') {
        setPanel(null);
        setFocus(false);
        return;
      }
      if (!activeId && (event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
        return;
      }
      if (
        target.closest('input,textarea,select,button,a,[contenteditable="true"]') ||
        target.isContentEditable
      )
        return;
      if (activeId && event.key === 'ArrowRight') {
        event.preventDefault();
        turnPage('next');
      }
      if (activeId && event.key === 'ArrowLeft') {
        event.preventDefault();
        turnPage('previous');
      }
      if (activeId && event.code === 'Space' && ['playing', 'paused'].includes(narration.state)) {
        event.preventDefault();
        narration.toggle();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [activeId, narration.state, narration.toggle]);
  useEffect(() => {
    if (editing) {
      setEditTitle(editing.title);
      setEditAuthor(editing.author);
      editDialog.current?.showModal();
    }
  }, [editing]);

  const pendingListen = useRef<string | null>(null);
  const openBook = (book: BookEntry, startListening = false, origin?: HTMLElement) => {
    pendingListen.current = startListening ? book.id : null;
    if (startListening) narration.unlock();
    narrationRequest.current++;
    flushPosition();
    narration.stop();
    const jacket =
      origin?.querySelector<HTMLElement>('.cover-object') ??
      origin?.closest('.featured-book')?.querySelector<HTMLElement>('.cover-object');
    changeScene(() => {
      setLocation(null);
      setChapters([]);
      setPdfText('');
      setPanel(null);
      setFocus(false);
      setPreferences(boundPreferences(book.preferences ?? prefsRef.current));
      setActiveId(book.id);
      patchBook(book.id, {
        openedAt: Date.now(),
        status: book.status === 'finished' ? 'finished' : 'reading',
      });
    }, jacket);
  };
  const closeBook = async () => {
    narrationRequest.current++;
    flushPosition();
    if (active) patchBook(active.id, { preferences });
    narration.stop();
    try {
      await saves.current;
      await repository.setPreferences(preferences);
      changeScene(() => {
        setActiveId(null);
        setPanel(null);
        setFocus(false);
      });
    } catch (e) {
      setError(`Save failed: ${friendly(e)}`);
    }
  };
  const importFiles = async (files: File[], sample = false) => {
    setError('');
    let imported = 0;
    for (const file of files) {
      setImporting(file.name);
      try {
        const { entry, bytes } = await inspectDocument(file);
        const duplicate = booksRef.current.find((book) => book.hash === entry.hash);
        if (duplicate) {
          setNotice(`“${duplicate.title}” is already in your library.`);
          continue;
        }
        entry.sample = sample;
        await repository.insert(entry, bytes);
        replaceBooks([...booksRef.current, entry]);
        imported++;
      } catch (e) {
        setError(`${file.name}: ${friendly(e)}`);
      }
    }
    setImporting('');
    if (imported)
      setNotice(`${imported === 1 ? 'Your book is' : `${imported} books are`} ready to read.`);
    if (fileInput.current) fileInput.current.value = '';
  };
  const addSample = async (index: number) => {
    setImporting(SAMPLE_BOOKS[index].title);
    try {
      await importFiles([await createSampleBook(index)], true);
    } catch (e) {
      setError(friendly(e));
      setImporting('');
    }
  };
  const onReaderUpdate = useCallback(
    (update: ReaderUpdate) => {
      setLocation(update);
      if (!activeId) return;
      pendingPosition.current = { id: activeId, update };
      if (positionTimer.current) clearTimeout(positionTimer.current);
      if (Date.now() - lastCommit.current > 2000) flushPosition();
      else positionTimer.current = setTimeout(flushPosition, 500);
    },
    [activeId, flushPosition],
  );
  const bookmark = () => {
    if (!active || !location) return;
    flushPosition();
    const existing = active.bookmarks.find(
      (mark) => JSON.stringify(mark.locator) === JSON.stringify(location.locator),
    );
    if (existing) {
      patchBook(active.id, {
        bookmarks: active.bookmarks.filter((mark) => mark.id !== existing.id),
      });
      setNotice('Bookmark removed.');
    } else {
      patchBook(active.id, {
        bookmarks: [
          ...active.bookmarks,
          {
            id: crypto.randomUUID(),
            label: location.chapter,
            locator: location.locator,
            createdAt: Date.now(),
          },
        ],
      });
      setNotice('Your place is bookmarked.');
    }
  };
  const seek = async (destination: Locator | string) => {
    narrationRequest.current++;
    narration.stop();
    flushPosition();
    try {
      await reader.current?.goTo(destination);
      setPanel(null);
    } catch (e) {
      setError(friendly(e));
    }
  };
  const listen = async () => {
    narration.unlock();
    if (!location) {
      setNotice('Your book is still opening. Listen will be ready in a moment.');
      return;
    }
    const request = ++narrationRequest.current;
    const bookId = activeId;
    if (['playing', 'paused', 'buffering'].includes(narration.state)) {
      narration.toggle();
      return;
    }
    const status = await repository.narrationStatus();
    if (request !== narrationRequest.current || activeBookId.current !== bookId) return;
    setNarrationStatus(status);
    if (!status.available || !status.engineKey) {
      settings.current?.showModal();
      return;
    }
    if (active?.format === 'pdf' && panel !== 'pdf-text') {
      setPanel('pdf-text');
      return;
    }
    const sentences = reader.current?.getSentences() ?? [];
    const saved = active?.listening;
    const index = saved
      ? sentences.findIndex(
          (sentence) =>
            sentence.id === saved.sentenceId && stableHash(sentence.text) === saved.textHash,
        )
      : -1;
    narrationBook.current = activeId;
    narration.start(sentences, status.engineKey, index >= 0 ? saved : undefined);
    if (active?.format === 'pdf') setPanel(null);
  };
  useEffect(() => {
    if (activeId && location && pendingListen.current === activeId) {
      pendingListen.current = null;
      void listen();
    }
  }, [activeId, location]);

  const filtered = books
    .filter(
      (book) =>
        (filter === 'all' || book.status === filter) &&
        `${book.title} ${book.author} ${book.filename}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )
    .sort(
      sort === 'recent'
        ? lastOpened
        : sort === 'title'
          ? (a, b) => a.title.localeCompare(b.title)
          : (a, b) => a.author.localeCompare(b.author),
    );
  const continued = [...books].filter((book) => book.status === 'reading').sort(lastOpened)[0];
  const togglePanel = (next: Panel) => setPanel((current) => (current === next ? null : next));

  return (
    <div
      className={`hush-app ${active ? 'reading' : ''} ${focus ? 'focus-mode' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        void importFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        ref={fileInput}
        className="visually-hidden"
        aria-label="Import EPUB or PDF documents"
        type="file"
        accept=".epub,.pdf,application/epub+zip,application/pdf"
        multiple
        onChange={(event) => {
          void importFiles(Array.from(event.target.files ?? []));
        }}
      />
      {!active ? (
        <LibraryView
          books={books}
          filtered={filtered}
          continued={continued}
          ready={ready}
          importing={importing}
          query={query}
          filter={filter}
          sort={sort}
          voice={narrationStatus}
          storage={repository.kind}
          searchRef={searchInput}
          onQuery={setQuery}
          onFilter={setFilter}
          onSort={setSort}
          onImport={() => fileInput.current?.click()}
          onSettings={() => settings.current?.showModal()}
          onOpen={openBook}
          onManage={setEditing}
          onSample={(index) => void addSample(index)}
        />
      ) : (
        <>
          <header className="reader-toolbar">
            <button className="back-library" aria-label="Library" onClick={() => void closeBook()}>
              <ArrowLeft size={17} />
              <span>Library</span>
            </button>
            <div className="reader-book-name" title={active.title}>
              <span className="reader-jacket" aria-hidden="true">
                <BookCover book={active} eager />
              </span>
              <span>
                {active.title}
                <small>{active.author}</small>
              </span>
            </div>
            <div className="reader-actions">
              <IconButton
                label="Contents"
                disabled={!location}
                aria-expanded={panel === 'contents'}
                onClick={() => togglePanel('contents')}
              >
                <List size={20} />
              </IconButton>
              <IconButton label="Bookmark this position" onClick={bookmark} disabled={!location}>
                <Bookmark size={19} />
              </IconButton>
              <IconButton
                label="Show bookmarks"
                disabled={!location}
                onClick={() => togglePanel('bookmarks')}
              >
                <BookOpen size={19} />
              </IconButton>
              {active.format === 'epub' ? (
                <button
                  className="type-button"
                  aria-label="Appearance"
                  disabled={!location}
                  aria-expanded={panel === 'appearance'}
                  onClick={() => togglePanel('appearance')}
                >
                  Aa
                </button>
              ) : (
                <IconButton
                  label="PDF reading order"
                  disabled={!location}
                  onClick={() => togglePanel('pdf-text')}
                >
                  <SlidersHorizontal size={19} />
                </IconButton>
              )}
              <IconButton
                label={focus ? 'Focus mode active' : 'Focus mode'}
                disabled={!location}
                onClick={() => {
                  setFocus(!focus);
                  setPanel(null);
                }}
              >
                {focus ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </IconButton>
            </div>
          </header>
          <main className={`reader-main ${panel ? 'has-panel' : ''}`}>
            <section
              className={`reader-stage ${active.format === 'pdf' ? 'pdf-stage' : ''}`}
              aria-label={`Reading ${active.title}`}
              style={{ '--reading-width': `${preferences.contentWidth}px` } as CSSProperties}
            >
              <Suspense
                fallback={
                  <div className="reader-message" role="status">
                    Opening your book…
                  </div>
                }
              >
                {active.format === 'epub' ? (
                  <EpubReader
                    ref={reader}
                    entry={active}
                    repository={repository}
                    preferences={preferences}
                    onUpdate={onReaderUpdate}
                    onChapters={setChapters}
                  />
                ) : (
                  <PdfReader
                    ref={reader}
                    entry={active}
                    repository={repository}
                    onUpdate={onReaderUpdate}
                    onChapters={setChapters}
                    onText={setPdfText}
                  />
                )}
              </Suspense>
            </section>
            {panel === 'appearance' && (
              <Appearance
                preferences={preferences}
                onChange={(next) => {
                  setPreferences(next);
                  patchBook(active.id, { preferences: next });
                }}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === 'contents' && (
              <ReaderPanel
                className="contents-drawer"
                label="Contents"
                onClose={() => setPanel(null)}
              >
                <header>
                  <h2>{active.format === 'pdf' ? 'Pages & contents' : 'Contents'}</h2>
                  <IconButton label="Close contents" onClick={() => setPanel(null)}>
                    <X size={19} />
                  </IconButton>
                </header>
                <p className="drawer-intro">Find your way through the book.</p>
                <nav>
                  {chapters.map((chapter) => (
                    <button
                      key={chapter.id}
                      style={{ paddingLeft: 16 + chapter.level * 14 }}
                      onClick={() => void seek(chapter.href)}
                    >
                      <span>{chapter.label}</span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </nav>
              </ReaderPanel>
            )}
            {panel === 'bookmarks' && (
              <ReaderPanel label="Bookmarks" onClose={() => setPanel(null)}>
                <header>
                  <h2>Your places</h2>
                  <IconButton label="Close bookmarks" onClick={() => setPanel(null)}>
                    <X size={19} />
                  </IconButton>
                </header>
                <p className="drawer-intro">A small marker for a place to return.</p>
                {!active.bookmarks.length ? (
                  <div className="drawer-empty">
                    <Bookmark size={28} />
                    <p>No bookmarks yet.</p>
                    <button className="text-button" onClick={bookmark}>
                      Mark this place
                    </button>
                  </div>
                ) : (
                  <div className="bookmark-list">
                    {active.bookmarks.map((mark) => (
                      <div key={mark.id}>
                        <button onClick={() => void seek(mark.locator)}>
                          <Bookmark size={16} />
                          <span>
                            {mark.label}
                            <small>{new Date(mark.createdAt).toLocaleDateString()}</small>
                          </span>
                        </button>
                        <IconButton
                          label={`Remove bookmark ${mark.label}`}
                          onClick={() =>
                            patchBook(active.id, {
                              bookmarks: active.bookmarks.filter((item) => item.id !== mark.id),
                            })
                          }
                        >
                          <X size={15} />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                )}
              </ReaderPanel>
            )}
            {panel === 'pdf-text' && (
              <ReaderPanel
                className="pdf-text-drawer"
                label="PDF reading order"
                onClose={() => setPanel(null)}
              >
                <header>
                  <h2>Reading order</h2>
                  <IconButton label="Close reading order" onClick={() => setPanel(null)}>
                    <X size={19} />
                  </IconButton>
                </header>
                <p className="order-note">
                  <strong>
                    {pdfText ? 'Review before listening' : 'No usable text on this page'}
                  </strong>
                  {pdfText
                    ? 'PDF text can follow an unexpected order on each page. Check this preview before listening; narration continues across pages.'
                    : 'This may be an image-only page. Hush does not run OCR in this build.'}
                </p>
                <div className="pdf-extracted-text">
                  {spokenSentence?.locator.kind === 'pdf' &&
                  spokenSentence.textStart !== undefined ? (
                    <>
                      {pdfText.slice(0, spokenSentence.textStart)}
                      <mark>{pdfText.slice(spokenSentence.textStart, spokenSentence.textEnd)}</mark>
                      {pdfText.slice(spokenSentence.textEnd)}
                    </>
                  ) : (
                    pdfText || 'The original page remains available to read.'
                  )}
                </div>
                {pdfText && (
                  <button className="primary" onClick={listen}>
                    <Headphones size={17} />
                    Listen to this PDF
                  </button>
                )}
              </ReaderPanel>
            )}
          </main>
          <footer className="reader-footer">
            <div className="position-info">
              <span>{location?.chapter ?? 'Opening your book'}</span>
              <span>
                {location?.locator.progress === undefined
                  ? (location?.pageLabel ?? '')
                  : `${Math.round(location.locator.progress * 100)}% of book`}
              </span>
            </div>
            <div className="reading-progress">
              <i style={{ width: `${(location?.locator.progress ?? 0) * 100}%` }} />
            </div>
            <div className="reader-bottom-controls">
              <IconButton label="Previous page" onClick={() => turnPage('previous')}>
                <ChevronLeft size={20} />
              </IconButton>
              <span className="page-label">{location?.pageLabel}</span>
              <span className="mobile-bookmark">
                <IconButton label="Bookmark this position" onClick={bookmark} disabled={!location}>
                  <Bookmark size={18} />
                </IconButton>
              </span>
              <button className="listen-button" onClick={listen} disabled={!location}>
                <Headphones size={16} />
                Listen
              </button>
              <IconButton label="Next page" onClick={() => turnPage('next')}>
                <ChevronRight size={20} />
              </IconButton>
            </div>
          </footer>
          {narration.state !== 'idle' && (
            <NarrationDock
              narration={narration}
              chapter={location?.chapter}
              onStop={() => {
                narration.stop();
                reader.current?.highlight(null);
              }}
            />
          )}
          {focus && (
            <button
              className="focus-return"
              aria-label="Leave focus mode"
              onClick={() => setFocus(false)}
            >
              <Minimize2 size={16} />
              <span>Return to controls</span>
            </button>
          )}
        </>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <IconButton label="Dismiss error" onClick={() => setError('')}>
            <X size={17} />
          </IconButton>
        </div>
      )}
      <dialog ref={settings} className="settings-dialog" aria-labelledby="settings-title">
        <header>
          <p className="eyebrow">
            <FoldMark />
            The spoken word
          </p>
          <IconButton label="Close settings" onClick={() => settings.current?.close()}>
            <X size={20} />
          </IconButton>
        </header>
        <h2 id="settings-title">
          A voice,
          <br />
          <em>close at hand.</em>
        </h2>
        <p className="settings-lead">
          From the page to your ears. A neural voice that runs entirely on your device.
        </p>
        <div className="voice-status">
          <Headphones size={28} />
          <div>
            <strong>{narrationStatus.engine}</strong>
            <span>
              {narrationStatus.available ? 'Local voice ready' : 'Optional · not yet enabled'}
            </span>
          </div>
        </div>
        <p className="setup-explanation">
          {narrationStatus.reason ??
            'Narration runs locally, with sentence tracking and saved listening positions.'}
        </p>
        {repository.kind === 'browser' && (
          <BrowserVoicePanel onStatus={setNarrationStatus} onStop={narration.stop} />
        )}
        <div className="voice-principles">
          <span>
            <strong>01</strong>Download once
          </span>
          <span>
            <strong>02</strong>Listen locally
          </span>
          <span>
            <strong>03</strong>Keep your place
          </span>
        </div>
        <p className="settings-meta">
          {repository.kind === 'native'
            ? 'Your books are kept as private copies on this computer.'
            : 'Your library stays in this browser. Clearing browser data removes these books and saved places.'}
        </p>
        <div className="settings-themes">
          <span>Room theme</span>
          {(['light', 'warm', 'night'] as const).map((theme) => (
            <button
              key={theme}
              aria-pressed={preferences.theme === theme}
              onClick={() => setPreferences({ ...preferences, theme })}
            >
              {theme[0].toUpperCase() + theme.slice(1)}
            </button>
          ))}
        </div>
        <button
          className="text-button"
          onClick={() => {
            narration.stop();
            void audioCache
              .clear()
              .then(() => setNotice('Generated audio cleared. Your books and places are saved.'))
              .catch((e) => setError(friendly(e)));
          }}
        >
          Clear generated audio
        </button>
        <p className="settings-footnote">
          Generated audio stays on this device. Clearing it keeps your books and saved places.{' '}
          <a
            href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`}
            target="_blank"
            rel="noreferrer"
          >
            Open-source notices and component sources
          </a>
        </p>
        <button className="primary" onClick={() => settings.current?.close()}>
          {active ? 'Back to your book' : 'Back to library'}
        </button>
      </dialog>
      <dialog
        ref={editDialog}
        className="manage-dialog"
        aria-labelledby="manage-title"
        onClose={() => setEditing(null)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (editing) {
              patchBook(editing.id, {
                title: editTitle.trim() || editing.title,
                author: editAuthor.trim() || 'Unknown author',
              });
              editDialog.current?.close();
              setNotice('Book details saved.');
            }
          }}
        >
          <header>
            <h2 id="manage-title">Book details</h2>
            <IconButton label="Close book details" onClick={() => editDialog.current?.close()}>
              <X size={19} />
            </IconButton>
          </header>
          <label>
            Title
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={512}
            />
          </label>
          <label>
            Author
            <input
              value={editAuthor}
              onChange={(e) => setEditAuthor(e.target.value)}
              maxLength={512}
            />
          </label>
          <div className="manage-status">
            <button
              type="button"
              onClick={() => {
                if (editing) {
                  patchBook(editing.id, {
                    status: editing.status === 'finished' ? 'reading' : 'finished',
                  });
                  editDialog.current?.close();
                }
              }}
            >
              <Check size={16} />
              {editing?.status === 'finished' ? 'Mark as reading' : 'Mark as finished'}
            </button>
            <button
              className="danger"
              type="button"
              onClick={() => {
                if (
                  !editing ||
                  !confirm(
                    `Remove “${editing.title}” and its bookmarks from Hush? Your source file stays untouched.`,
                  )
                )
                  return;
                const id = editing.id;
                void repository
                  .remove(id)
                  .then(() => {
                    replaceBooks(booksRef.current.filter((book) => book.id !== id));
                    editDialog.current?.close();
                    setNotice('Book removed from Hush.');
                  })
                  .catch((e) => setError(friendly(e)));
              }}
            >
              <Trash2 size={16} />
              Remove book
            </button>
          </div>
          <button className="primary" type="submit">
            Save details
          </button>
        </form>
      </dialog>
    </div>
  );
}
