import type { BookEntry } from '../domain/types';
import { coverSvg } from '../documents/samples';

/** An imported jacket remains the book's identity; generated jackets are stable per title. */
export function BookCover({ book, eager = false }: { book: BookEntry; eager?: boolean }) {
  const fallback = coverSvg(
    book.title,
    ['forest', 'clay', 'slate'][parseInt(book.hash.slice(0, 2), 16) % 3],
    book.author,
  );
  return (
    <span className="cover-object">
      <img
        className="book-cover"
        src={book.cover || `data:image/svg+xml,${encodeURIComponent(fallback)}`}
        alt={`Cover of ${book.title}`}
        loading={eager ? 'eager' : 'lazy'}
        width="300"
        height="450"
      />
    </span>
  );
}
