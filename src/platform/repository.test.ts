import { it, expect } from 'vitest';
import { repository } from './repository';
import { inspectDocument } from '../documents/import';
import { createSampleBook } from '../documents/samples';
import { DEFAULT_PREFERENCES } from '../domain/types';

it('keeps durable content anchors and prevents late saves from recreating a removed book', async () => {
  const { entry, bytes } = await inspectDocument(await createSampleBook());
  await repository.insert(entry, bytes);
  const saved = {
    ...entry,
    locator: {
      kind: 'epub' as const,
      cfi: 'epubcfi(/6/2!/4/2/1:5)',
      href: 'chapter1.xhtml',
      section: 0,
      progress: 0.25,
    },
    bookmarks: [
      {
        id: 'mark',
        label: 'A place',
        createdAt: 1,
        locator: {
          kind: 'epub' as const,
          cfi: 'epubcfi(/6/2!/4/2/1:5)',
          href: 'chapter1.xhtml',
          section: 0,
        },
      },
    ],
  };
  await repository.update(saved);
  expect((await repository.list()).find((book) => book.id === entry.id)?.locator).toEqual(
    saved.locator,
  );
  await repository.update({ ...saved, hash: 'changed', filename: 'changed.pdf', byteSize: 0 });
  const reopened = (await repository.list()).find((book) => book.id === entry.id)!;
  expect(reopened.hash).toBe(entry.hash);
  expect(reopened.filename).toBe(entry.filename);
  expect(await repository.read(entry.id)).toEqual(bytes);
  await repository.remove(entry.id);
  await repository.update(saved);
  expect((await repository.list()).some((book) => book.id === entry.id)).toBe(false);
  await expect(repository.read(entry.id)).rejects.toThrow(/missing/);
});
it('persists bounded room preferences', async () => {
  await repository.setPreferences({ ...DEFAULT_PREFERENCES, theme: 'night', fontSize: 24 });
  expect(await repository.getPreferences()).toMatchObject({ theme: 'night', fontSize: 24 });
});
