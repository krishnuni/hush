import { invoke, isTauri } from '@tauri-apps/api/core';
import { browserVoice } from '../audio/browserVoice';
import {
  boundPreferences,
  DEFAULT_PREFERENCES,
  type BookEntry,
  type LibraryRepository,
  type NarrationStatus,
  type Preferences,
} from '../domain/types';

let browserDatabase: Promise<IDBDatabase> | undefined;
const openBrowserDatabase = () =>
  (browserDatabase ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('hush-reading-room', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('books', { keyPath: 'id' });
      db.createObjectStore('documents');
      db.createObjectStore('settings');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error('Hush could not open local storage. Check that storage is enabled.'));
    request.onblocked = () =>
      reject(new Error('Close another Hush tab to finish opening the library.'));
  }));

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(new Error('Hush could not save locally. Your last saved copy is unchanged.'));
  });
}

class BrowserRepository implements LibraryRepository {
  kind = 'browser' as const;
  async list(): Promise<BookEntry[]> {
    const db = await openBrowserDatabase();
    return result(db.transaction('books').objectStore('books').getAll());
  }
  async insert(entry: BookEntry, data: Uint8Array): Promise<void> {
    const db = await openBrowserDatabase();
    const tx = db.transaction(['books', 'documents'], 'readwrite');
    tx.objectStore('books').add(entry);
    tx.objectStore('documents').add(data, entry.id);
    await committed(tx);
  }
  async update(entry: BookEntry): Promise<void> {
    const db = await openBrowserDatabase();
    const tx = db.transaction('books', 'readwrite');
    const store = tx.objectStore('books');
    // A delayed checkpoint must never recreate a removed book or change its source identity.
    const request = store.get(entry.id);
    request.onsuccess = () => {
      const original = request.result as BookEntry | undefined;
      if (original)
        store.put({
          ...entry,
          id: original.id,
          hash: original.hash,
          format: original.format,
          filename: original.filename,
          byteSize: original.byteSize,
          addedAt: original.addedAt,
        });
    };
    await committed(tx);
  }
  async remove(id: string): Promise<void> {
    const db = await openBrowserDatabase();
    const tx = db.transaction(['books', 'documents'], 'readwrite');
    tx.objectStore('books').delete(id);
    tx.objectStore('documents').delete(id);
    await committed(tx);
  }
  async read(id: string): Promise<Uint8Array> {
    const db = await openBrowserDatabase();
    const bytes = await result<Uint8Array | undefined>(
      db.transaction('documents').objectStore('documents').get(id),
    );
    if (!bytes) throw new Error('The saved document is missing. Import your original file again.');
    return new Uint8Array(bytes);
  }
  async getPreferences(): Promise<Preferences> {
    const db = await openBrowserDatabase();
    const prefs = await result<Preferences | undefined>(
      db.transaction('settings').objectStore('settings').get('preferences'),
    );
    return boundPreferences(prefs ?? DEFAULT_PREFERENCES);
  }
  async setPreferences(prefs: Preferences): Promise<void> {
    const db = await openBrowserDatabase();
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(prefs, 'preferences');
    await committed(tx);
  }
  async narrationStatus(): Promise<NarrationStatus> {
    if (import.meta.env.DEV) {
      try {
        const response = await fetch('/__hush/voice/status');
        if (response.ok) {
          const status = await response.json();
          if (status.available) return status;
        }
      } catch {}
    }
    return browserVoice.status();
  }
  async synthesize(text: string, signal: AbortSignal): Promise<Blob> {
    if (!import.meta.env.DEV || (await this.narrationStatus()).engine !== 'Pocket TTS')
      return browserVoice.synthesize(text, signal);
    const response = await fetch('/__hush/voice/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hush-Voice': '1' },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error ?? 'Local neural narration could not prepare this passage.');
    }
    return response.blob();
  }
}

class NativeRepository implements LibraryRepository {
  kind = 'native' as const;
  list(): Promise<BookEntry[]> {
    return invoke('library_list');
  }
  async insert(entry: BookEntry, data: Uint8Array): Promise<void> {
    const id = await invoke<string>('library_import_begin', { entry });
    try {
      for (let offset = 0; offset < data.byteLength; offset += 1024 * 1024) {
        await invoke('library_import_chunk', data.subarray(offset, offset + 1024 * 1024), {
          headers: { 'x-hush-id': id, 'x-hush-offset': String(offset) },
        });
      }
      await invoke('library_import_finish', { id });
    } catch (error) {
      await invoke('library_import_abort', { id }).catch(() => {});
      throw error;
    }
  }
  update(entry: BookEntry): Promise<void> {
    return invoke('library_update', { entry });
  }
  remove(id: string): Promise<void> {
    return invoke('library_remove', { id });
  }
  async read(id: string): Promise<Uint8Array> {
    const size = await invoke<number>('document_size', { id });
    if (!Number.isSafeInteger(size) || size < 1 || size > 50 * 1024 * 1024)
      throw new Error('The saved document has an invalid size.');
    const bytes = new Uint8Array(size);
    for (let offset = 0; offset < size; offset += 1024 * 1024) {
      const chunk = await invoke<ArrayBuffer>('document_read_range', {
        id,
        offset,
        length: Math.min(1024 * 1024, size - offset),
      });
      const view = new Uint8Array(chunk);
      if (view.byteLength !== Math.min(1024 * 1024, size - offset))
        throw new Error('The saved document is incomplete. Import the original again.');
      bytes.set(view, offset);
    }
    return bytes;
  }
  async getPreferences(): Promise<Preferences> {
    return boundPreferences(await invoke('preferences_read'));
  }
  setPreferences(prefs: Preferences): Promise<void> {
    return invoke('preferences_write', { preferences: prefs });
  }
  narrationStatus(): Promise<NarrationStatus> {
    return invoke('narration_status');
  }
  async synthesize(text: string, signal: AbortSignal): Promise<Blob> {
    if (signal.aborted) throw new DOMException('Narration cancelled', 'AbortError');
    const jobId = crypto.randomUUID();
    const cancel = () => {
      void invoke('narration_cancel', { jobId }).catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const bytes = await invoke<ArrayBuffer>('narration_synthesize', { text, jobId });
      if (signal.aborted) throw new DOMException('Narration cancelled', 'AbortError');
      return new Blob([bytes], { type: 'audio/wav' });
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }
}

export const repository: LibraryRepository = isTauri()
  ? new NativeRepository()
  : new BrowserRepository();
