import type { RefObject } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  Headphones,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react';
import type { BookEntry, NarrationStatus } from '../domain/types';
import { coverSvg, SAMPLE_BOOKS } from '../documents/samples';
import { Brand, FoldMark } from './Brand';
import { BookCover } from './BookCover';
import { IconButton } from './IconButton';

type Filter = 'all' | 'reading' | 'finished';
type Sort = 'recent' | 'title' | 'author';
interface Props {
  books: BookEntry[];
  filtered: BookEntry[];
  continued?: BookEntry;
  ready: boolean;
  importing: string;
  query: string;
  filter: Filter;
  sort: Sort;
  voice: NarrationStatus;
  storage: 'browser' | 'native';
  searchRef: RefObject<HTMLInputElement | null>;
  onQuery(value: string): void;
  onFilter(value: Filter): void;
  onSort(value: Sort): void;
  onImport(): void;
  onSettings(): void;
  onOpen(book: BookEntry, listen?: boolean, origin?: HTMLElement): void;
  onManage(book: BookEntry): void;
  onSample(index: number): void;
}
const progress = (book: BookEntry) => Math.round((book.locator?.progress ?? 0) * 100);

export function LibraryView(p: Props) {
  const showSamples = !p.query && p.filter === 'all' && p.books.length < 3;
  return (
    <div className="library-page">
      <a href="#collection" className="skip-link">
        Skip to collection
      </a>
      <header className="masthead">
        <a
          className="brand-link"
          href="#"
          aria-label="Hush home"
          onClick={(e) => {
            e.preventDefault();
            p.onFilter('all');
            p.onQuery('');
          }}
        >
          <Brand />
        </a>
        <div className="masthead-note">
          <span className="eyebrow">A personal reading instrument</span>
          <span>For the written word. And the spoken one.</span>
        </div>
        <div className="masthead-actions">
          <IconButton label="Library settings" onClick={p.onSettings}>
            <Settings size={19} />
          </IconButton>
          <button className="primary import-button" onClick={p.onImport} disabled={!!p.importing}>
            <Plus size={17} />
            <span>Import books</span>
          </button>
        </div>
      </header>
      <main>
        <section
          className={`library-opening ${p.continued ? 'has-current' : ''}`}
          aria-label="Your reading room"
        >
          <div className="opening-copy">
            <p className="eyebrow">
              <span className="accent-dash" />
              Your reading room
            </p>
            <h1 className="visually-hidden">Your reading room.</h1>
            <h2>
              <span>Somewhere</span>
              <span>between</span>
              <em>the lines.</em>
            </h2>
            <p>
              A quieter space for the books
              <br className="desktop-break" /> you want to get lost in.
            </p>
            <a className="text-link" href="#collection">
              Explore your collection <ArrowDown size={15} />
            </a>
          </div>
          {!p.ready ? (
            <div className="library-loading" role="status">
              <FoldMark />
              <span>Opening your reading room…</span>
            </div>
          ) : p.continued ? (
            <section className="featured-book" aria-labelledby="current-label">
              <button
                className="featured-cover"
                aria-label={`Continue ${p.continued.title}`}
                onClick={(e) => p.onOpen(p.continued!, false, e.currentTarget)}
              >
                <BookCover book={p.continued} eager />
              </button>
              <div className="featured-copy">
                <p className="eyebrow" id="current-label">
                  The book you’re in
                </p>
                <h3>{p.continued.title}</h3>
                <p className="featured-author">{p.continued.author}</p>
                <div className="featured-position">
                  <span>
                    {p.continued.locator?.kind === 'epub'
                      ? `Chapter ${p.continued.locator.section + 1}`
                      : p.continued.locator?.kind === 'pdf'
                        ? `Page ${p.continued.locator.page}`
                        : 'At the beginning'}
                  </span>
                  <span>{progress(p.continued)}% read</span>
                </div>
                <div
                  className="book-progress"
                  role="progressbar"
                  aria-label="Reading progress"
                  aria-valuenow={progress(p.continued)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <i style={{ width: `${progress(p.continued)}%` }} />
                </div>
                <div className="featured-actions">
                  <button
                    className="primary"
                    onClick={(e) => p.onOpen(p.continued!, false, e.currentTarget)}
                  >
                    Continue reading <ArrowRight size={17} />
                  </button>
                  <button
                    className="text-button"
                    onClick={(e) => p.onOpen(p.continued!, true, e.currentTarget)}
                  >
                    <Headphones size={17} />
                    Listen
                  </button>
                </div>
                <span className="position-kept">
                  <span className="status-dot" />
                  Your place, kept.
                </span>
              </div>
            </section>
          ) : (
            <div className="first-pages">
              <div className="first-pages-head">
                <span className="eyebrow">The Hush editions</span>
                <span className="edition-number">№ 001—003</span>
              </div>
              <div className="sample-jackets">
                {SAMPLE_BOOKS.map((sample, index) => {
                  const existing = p.books.find(
                    (book) => book.sample && book.title === sample.title,
                  );
                  return (
                    <button
                      key={sample.title}
                      disabled={!!p.importing}
                      aria-label={
                        existing
                          ? `Open ${sample.title} — 0${index + 1}`
                          : `${sample.title} — 0${index + 1} — Add to your library`
                      }
                      onClick={(e) =>
                        existing ? p.onOpen(existing, false, e.currentTarget) : p.onSample(index)
                      }
                    >
                      <span className="cover-object">
                        <img
                          src={`data:image/svg+xml,${encodeURIComponent(coverSvg(sample.title, sample.tone))}`}
                          alt={sample.title}
                          width="300"
                          height="450"
                        />
                      </span>
                      <span className="jacket-index" aria-hidden="true">
                        0{index + 1}
                        {existing ? <ArrowRight size={14} /> : <Plus size={14} />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p>Three original short reads. A good place to begin.</p>
            </div>
          )}
        </section>
        <div className="library-colophon">
          <span>
            <span className="status-dot" />
            Stored in this {p.storage === 'browser' ? 'browser' : 'computer'}
          </span>
          <button onClick={p.onSettings}>
            <Headphones size={15} />
            <span>{p.voice.available ? 'Local voice ready' : 'Discover on-device narration'}</span>
            <ArrowRight size={14} />
          </button>
          <span className="colophon-detail">EPUB / PDF / A little peace</span>
        </div>
        <section id="collection" className="collection" aria-labelledby="collection-title">
          <header className="collection-header">
            <div className="collection-heading">
              <span className="section-index">01 /</span>
              <h2 id="collection-title">
                The collection<span>{String(p.books.length).padStart(2, '0')}</span>
              </h2>
            </div>
            <label className="search-field">
              <Search size={17} />
              <input
                ref={p.searchRef}
                aria-label="Search your books"
                placeholder="Find a book or author"
                value={p.query}
                onChange={(e) => p.onQuery(e.target.value)}
              />
              {p.query ? (
                <button aria-label="Clear search" onClick={() => p.onQuery('')}>
                  <X size={16} />
                </button>
              ) : (
                <kbd>⌘ K</kbd>
              )}
            </label>
          </header>
          <div className="collection-controls">
            <nav aria-label="Library filters">
              {(
                [
                  ['all', 'All books'],
                  ['reading', 'Reading'],
                  ['finished', 'Finished'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={p.filter === value}
                  onClick={() => p.onFilter(value)}
                >
                  {label}
                  {value === 'finished' && <Check size={12} />}
                </button>
              ))}
            </nav>
            <label className="sort-control">
              <span className="visually-hidden">Sort your books</span>
              <select value={p.sort} onChange={(e) => p.onSort(e.target.value as Sort)}>
                <option value="recent">Recently opened</option>
                <option value="title">Title, A–Z</option>
                <option value="author">Author, A–Z</option>
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
          {p.importing && (
            <div className="import-status" role="status">
              <span className="loading-dot" />
              Importing {p.importing}…
            </div>
          )}
          {p.ready && !p.books.length && !p.query && p.filter === 'all' ? (
            <div className="empty-library">
              <div className="empty-library-copy">
                <span className="section-index">An open invitation</span>
                <h2>Make room for a good book.</h2>
                <p>Bring an EPUB or PDF. We’ll keep your place.</p>
              </div>
              <button className="empty-import" onClick={p.onImport} disabled={!!p.importing}>
                <Plus size={25} strokeWidth={1.2} />
                <span>
                  Choose your first book<small>or drop it anywhere · EPUB & PDF</small>
                </span>
                <ArrowRight size={20} />
              </button>
            </div>
          ) : (
            <div className="book-shelf">
              {p.filtered.map((book, index) => (
                <article className="shelf-book" key={book.id}>
                  <button
                    className="book-open"
                    aria-label={`${book.title} ${book.author}`}
                    onClick={(e) => p.onOpen(book, false, e.currentTarget)}
                  >
                    <BookCover book={book} />
                    <span className="shelf-title">{book.title}</span>
                    <span className="shelf-author">{book.author}</span>
                  </button>
                  <div className="book-caption">
                    <span>
                      {String(index + 1).padStart(2, '0')}
                      <span className="caption-divider">/</span>
                      {book.format.toUpperCase()}
                      {book.status === 'finished'
                        ? ' · FINISHED'
                        : book.locator
                          ? ` · ${progress(book)}%`
                          : ' · UNREAD'}
                    </span>
                    <IconButton label={`Manage ${book.title}`} onClick={() => p.onManage(book)}>
                      <MoreHorizontal size={19} />
                    </IconButton>
                  </div>
                </article>
              ))}
            </div>
          )}
          {p.ready && p.books.length > 0 && !p.filtered.length && (
            <div className="no-results">
              <Search size={25} strokeWidth={1.2} />
              <h3>{p.query ? 'No matching titles.' : 'A little space on this shelf.'}</h3>
              <p>
                {p.query
                  ? 'Try another title or author.'
                  : 'Books appear here as you read and finish them.'}
              </p>
              <button
                className="text-link"
                onClick={() => {
                  p.onQuery('');
                  p.onFilter('all');
                }}
              >
                See all books <ArrowRight size={15} />
              </button>
            </div>
          )}
        </section>
        {showSamples && p.books.length > 0 && (
          <section className="sample-section">
            <header>
              <span className="section-index">02 /</span>
              <div>
                <p className="eyebrow">Written for Hush</p>
                <h2>A few pages. A different world.</h2>
              </div>
              <span>Original short reads · EPUB</span>
            </header>
            <div className="sample-list">
              {SAMPLE_BOOKS.filter(
                (sample) => !p.books.some((b) => b.sample && b.title === sample.title),
              ).map((sample) => (
                <button
                  key={sample.title}
                  disabled={!!p.importing}
                  onClick={() => p.onSample(SAMPLE_BOOKS.indexOf(sample))}
                >
                  <span className="sample-mini-cover">
                    <img
                      src={`data:image/svg+xml,${encodeURIComponent(coverSvg(sample.title, sample.tone))}`}
                      alt=""
                    />
                  </span>
                  <span>
                    <strong>{sample.title}</strong>
                    <small>{sample.subtitle}</small>
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
      <footer className="library-footer">
        <span className="footer-signature">
          A little less noise.
          <br />
          <em>A little more story.</em>
        </span>
        <span>
          Your books stay with you.<small>No account. No book uploads.</small>
        </span>
        <a href="https://github.com/krishnuni/hush" target="_blank" rel="noreferrer">
          About the instrument <ArrowRight size={14} />
        </a>
        <FoldMark />
      </footer>
    </div>
  );
}
