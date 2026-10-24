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
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Import,
  Library,
  List,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { repository } from '../platform/repository';
import { inspectDocument } from '../documents/import';
import { createSampleBook, coverSvg, SAMPLE_BOOKS } from '../documents/samples';
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

type Panel = 'contents' | 'appearance' | 'bookmarks' | 'pdf-text' | null;
const EpubReader = lazy(() =>
  import('../readers/EpubReader').then((module) => ({ default: module.EpubReader })),
);
const PdfReader = lazy(() =>
  import('../readers/PdfReader').then((module) => ({ default: module.PdfReader })),
);
const friendly = (error: unknown) => (error instanceof Error ? error.message : String(error));
const percent = (book: BookEntry) =>
  book.locator?.progress === undefined ? null : Math.round(book.locator.progress * 100);
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
    engine: 'Pocket TTS',
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
          ? '#1c211f'
          : preferences.theme === 'warm'
            ? '#fcf8ef'
            : '#ffffff',
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
      if (
        target.matches('input,textarea,select') ||
        target.isContentEditable ||
        settings.current?.open ||
        editDialog.current?.open
      )
        return;
      if (event.key === 'Escape') {
        setPanel(null);
        setFocus(false);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
      }
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

  const openBook = (book: BookEntry) => {
    narrationRequest.current++;
    flushPosition();
    narration.stop();
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
  };
  const closeBook = async () => {
    narrationRequest.current++;
    flushPosition();
    if (active) patchBook(active.id, { preferences });
    narration.stop();
    try {
      await saves.current;
      await repository.setPreferences(preferences);
      setActiveId(null);
      setPanel(null);
      setFocus(false);
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
  };
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
        <>
          <aside className="library-rail">
            <a className="wordmark" href="#" onClick={(e) => e.preventDefault()}>
              hush<span>Your reading room</span>
            </a>
            <nav aria-label="Library filters">
              {[
                ['all', Library, 'Library'],
                ['reading', BookOpen, 'Reading'],
                ['finished', Check, 'Finished'],
              ].map(([key, Icon, label]) => {
                const I = Icon as typeof Library;
                return (
                  <button
                    key={String(key)}
                    className={filter === key ? 'selected' : ''}
                    onClick={() => setFilter(key as typeof filter)}
                    aria-current={filter === key ? 'page' : undefined}
                  >
                    <I size={18} />
                    <span>{String(label)}</span>
                  </button>
                );
              })}
            </nav>
            <div className="rail-bottom">
              <p>Stored on this {repository.kind === 'native' ? 'computer' : 'browser'}</p>
              <button onClick={() => settings.current?.showModal()}>
                <Settings size={17} />
                Settings
              </button>
            </div>
          </aside>
          <main className="library-main">
            <header className="library-header">
              <div>
                <p className="eyebrow mobile-brand">HUSH · YOUR READING ROOM</p>
                <h1>Your reading room.</h1>
                <p>A little space for the next chapter.</p>
              </div>
              <div className="library-tools">
                <label className="search-field">
                  <Search size={16} />
                  <input
                    ref={searchInput}
                    aria-label="Search your books"
                    placeholder="Search your books"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <kbd>⌘ K</kbd>
                </label>
                <button
                  className="primary import-button"
                  onClick={() => fileInput.current?.click()}
                  disabled={!!importing}
                >
                  <Plus size={16} />
                  <span>Import books</span>
                </button>
                <IconButton label="Library settings" onClick={() => settings.current?.showModal()}>
                  <Settings size={18} />
                </IconButton>
              </div>
            </header>
            <nav className="mobile-library-filters" aria-label="Library filters">
              {(
                [
                  ['all', 'All books'],
                  ['reading', 'Reading'],
                  ['finished', 'Finished'],
                ] as const
              ).map(([key, label]) => (
                <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                  {label}
                </button>
              ))}
            </nav>
            {importing && (
              <div className="import-status" role="status">
                <span className="loading-dot" />
                Importing {importing}…
              </div>
            )}
            {!ready ? (
              <div className="empty-library" role="status">
                <span className="loading-dot" />
                Opening your reading room…
              </div>
            ) : books.length === 0 ? (
              <section className="empty-library">
                <div className="empty-illustration" aria-hidden="true">
                  <BookOpen strokeWidth={0.7} size={90} />
                  <span />
                  <span />
                  <span />
                </div>
                <p className="eyebrow">A PLACE TO BEGIN</p>
                <h2>Make room for a good book.</h2>
                <p>
                  Bring an EPUB or PDF into Hush.
                  <br />
                  Your library stays right here, on your device.
                </p>
                <button className="primary" onClick={() => fileInput.current?.click()}>
                  <Import size={17} />
                  Choose your first book
                </button>
                <p className="drop-hint">Or drop a file anywhere in this room.</p>
              </section>
            ) : (
              <>
                {!query && filter === 'all' && continued && (
                  <section className="continuation" aria-labelledby="continue-label">
                    <h2 id="continue-label" className="eyebrow">
                      CONTINUE READING
                    </h2>
                    <div className="continue-row">
                      <button
                        className="continue-cover"
                        onClick={() => openBook(continued)}
                        aria-label={`Continue ${continued.title}`}
                      >
                        <Cover book={continued} />
                      </button>
                      <div className="continue-copy">
                        <h3>{continued.title}</h3>
                        <p>{continued.author}</p>
                        <p className="chapter-meta">
                          {continued.locator?.kind === 'epub'
                            ? `Chapter ${continued.locator.section + 1}`
                            : continued.locator?.kind === 'pdf'
                              ? `Page ${continued.locator.page}`
                              : 'Your next chapter awaits'}
                        </p>
                        <div className="progress-row">
                          <span className="book-progress">
                            <i style={{ width: `${percent(continued) ?? 0}%` }} />
                          </span>
                          <span>
                            {percent(continued) === null ? 'Beginning' : `${percent(continued)}%`}
                          </span>
                        </div>
                      </div>
                      <button className="primary return-book" onClick={() => openBook(continued)}>
                        Return to your book
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </section>
                )}
                <section className="shelf-section" aria-labelledby="shelf-label">
                  <header>
                    <h2 id="shelf-label">
                      {query
                        ? 'Search results'
                        : filter === 'reading'
                          ? 'Reading now'
                          : filter === 'finished'
                            ? 'Finished books'
                            : 'On your shelf'}
                    </h2>
                    <label className="sort-control">
                      <span className="visually-hidden">Sort your books</span>
                      <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                        <option value="recent">Recently opened</option>
                        <option value="title">Title</option>
                        <option value="author">Author</option>
                      </select>
                      <ChevronDown size={13} />
                    </label>
                  </header>
                  <div className="book-shelf">
                    {filtered.map((book) => (
                      <article className="shelf-book" key={book.id}>
                        <button
                          className="book-open"
                          aria-label={`${book.title} ${book.author}`}
                          onClick={() => openBook(book)}
                        >
                          <Cover book={book} />
                          <span className="shelf-title">{book.title}</span>
                          <span className="shelf-author">{book.author}</span>
                        </button>
                        <div className="book-caption">
                          <span>
                            {book.format.toUpperCase()}
                            {book.sample ? ' · SAMPLE' : ''}
                          </span>
                          <button
                            className="book-menu"
                            aria-label={`Manage ${book.title}`}
                            onClick={() => setEditing(book)}
                          >
                            <MoreHorizontal size={18} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {!filtered.length && (
                    <p className="no-results">
                      {query ? 'No books match your search.' : 'There are no books here yet.'}
                    </p>
                  )}
                </section>
              </>
            )}
            {(!books.length || books.length < 3) && !query && filter === 'all' && (
              <section className="sample-section">
                <header>
                  <div>
                    <p className="eyebrow">SOMETHING TO TRY</p>
                    <h2>A few pages, made for this room.</h2>
                  </div>
                  <p>Original Hush samples · EPUB</p>
                </header>
                <div className="sample-list">
                  {SAMPLE_BOOKS.map((sample, index) => (
                    <button
                      className="sample-book"
                      key={sample.title}
                      disabled={!!importing}
                      onClick={() => void addSample(index)}
                    >
                      <img
                        src={`data:image/svg+xml,${encodeURIComponent(coverSvg(sample.title, sample.tone))}`}
                        alt=""
                      />
                      <span>
                        <strong>{sample.title}</strong>
                        <span>{sample.subtitle}</span>
                        <em>
                          Add to your library <Plus size={13} />
                        </em>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </main>
        </>
      ) : (
        <>
          <header className="reader-toolbar">
            <button className="back-library" aria-label="Library" onClick={() => void closeBook()}>
              <ArrowLeft size={18} />
              <span>Library</span>
            </button>
            <div className="reader-book-name" title={active.title}>
              {active.title}
            </div>
            <div className="reader-actions">
              <IconButton
                label="Contents"
                aria-expanded={panel === 'contents'}
                onClick={() => togglePanel('contents')}
              >
                <List size={20} />
              </IconButton>
              <IconButton label="Bookmark this position" onClick={bookmark} disabled={!location}>
                <Bookmark size={19} />
              </IconButton>
              <IconButton label="Show bookmarks" onClick={() => togglePanel('bookmarks')}>
                <BookOpen size={19} />
              </IconButton>
              {active.format === 'epub' ? (
                <button
                  className="type-button"
                  aria-label="Appearance"
                  aria-expanded={panel === 'appearance'}
                  onClick={() => togglePanel('appearance')}
                >
                  Aa
                </button>
              ) : (
                <IconButton label="PDF reading order" onClick={() => togglePanel('pdf-text')}>
                  <SlidersHorizontal size={19} />
                </IconButton>
              )}
              <IconButton
                label={focus ? 'Leave focus mode' : 'Focus mode'}
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
              <aside className="drawer contents-drawer" aria-label="Contents">
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
              </aside>
            )}
            {panel === 'bookmarks' && (
              <aside className="drawer" aria-label="Bookmarks">
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
              </aside>
            )}
            {panel === 'pdf-text' && (
              <aside className="drawer pdf-text-drawer" aria-label="PDF reading order">
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
              </aside>
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
              <button className="listen-button" onClick={listen}>
                <Headphones size={16} />
                Listen
              </button>
              <IconButton label="Next page" onClick={() => turnPage('next')}>
                <ChevronRight size={20} />
              </IconButton>
            </div>
          </footer>
          {narration.state !== 'idle' && (
            <section className="narration-bar" aria-label="Narration controls">
              <div className="narration-description">
                <Volume2 size={22} />
                <span>
                  <strong>
                    {narration.state === 'buffering'
                      ? 'Preparing the next sentence…'
                      : narration.state === 'error'
                        ? 'Narration paused'
                        : narration.state === 'ended'
                          ? 'End of this passage'
                          : 'Reading aloud'}
                  </strong>
                  <small>
                    {narration.error ||
                      (narration.resumeAdjusted
                        ? 'Audio was cleared; continuing from this sentence.'
                        : location?.chapter)}
                  </small>
                </span>
              </div>
              <div className="transport">
                <IconButton label="Previous sentence" onClick={narration.previous}>
                  <SkipBack size={20} />
                </IconButton>
                <button
                  className="play-pause"
                  onClick={narration.toggle}
                  aria-label={narration.state === 'playing' ? 'Pause narration' : 'Play narration'}
                >
                  {narration.state === 'playing' ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <IconButton label="Next sentence" onClick={narration.next}>
                  <SkipForward size={20} />
                </IconButton>
              </div>
              <label className="narration-seek">
                <span className="visually-hidden">Position in sentence</span>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0.01, narration.duration)}
                  step=".05"
                  value={Math.min(narration.position, narration.duration)}
                  disabled={!narration.duration}
                  onChange={(e) => narration.seek(Number(e.target.value))}
                />
                <output>
                  {Math.floor(narration.position)}s / {Math.ceil(narration.duration)}s
                </output>
              </label>
              <label className="speed-control">
                <span className="visually-hidden">Narration speed</span>
                <select
                  value={narration.speed}
                  onChange={(e) => narration.setSpeed(Number(e.target.value))}
                >
                  {[0.75, 1, 1.25, 1.5].map((rate) => (
                    <option key={rate} value={rate}>
                      {rate}×
                    </option>
                  ))}
                </select>
              </label>
              <label className="volume-control">
                <Volume2 size={17} />
                <span className="visually-hidden">Volume</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={narration.volume}
                  onChange={(e) => narration.setVolume(Number(e.target.value))}
                />
              </label>
              <IconButton
                label="Stop narration"
                onClick={() => {
                  narration.stop();
                  reader.current?.highlight(null);
                }}
              >
                <X size={18} />
              </IconButton>
            </section>
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
      <dialog ref={settings} className="settings-dialog">
        <header>
          <p className="eyebrow">HUSH · YOUR READING ROOM</p>
          <IconButton label="Close settings" onClick={() => settings.current?.close()}>
            <X size={20} />
          </IconButton>
        </header>
        <h2>A voice, close at hand.</h2>
        <p className="settings-lead">
          Your books stay on your device.
          <br />
          Local narration is a separate, optional part of the room.
        </p>
        <div className="voice-status">
          <Headphones size={28} />
          <div>
            <strong>{narrationStatus.engine}</strong>
            <span>{narrationStatus.available ? 'Local voice ready' : 'Voice unavailable'}</span>
          </div>
        </div>
        <p className="setup-explanation">
          {narrationStatus.reason ??
            'The neural voice is connected. This development integration still needs audible output and synchronisation verification.'}
        </p>
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
          Generated audio stays on this device. Clearing it keeps your books and saved places.
        </p>
        <button className="primary" onClick={() => settings.current?.close()}>
          Back to your book
        </button>
      </dialog>
      <dialog ref={editDialog} className="manage-dialog" onClose={() => setEditing(null)}>
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
            <h2>Book details</h2>
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

function Cover({ book }: { book: BookEntry }) {
  const fallback = coverSvg(
    book.title,
    ['forest', 'clay', 'slate'][parseInt(book.hash.slice(0, 2), 16) % 3],
  );
  return (
    <img
      className="book-cover"
      src={book.cover || `data:image/svg+xml,${encodeURIComponent(fallback)}`}
      alt={`Cover of ${book.title}`}
      loading="lazy"
    />
  );
}
