const DATABASE = 'hush-audio-cache';
const MAX_BYTES = 128 * 1024 * 1024;
const MAX_CLIPS = 192;
const MAX_CLIP_BYTES = 5_000_000;
interface Record {
  key: string;
  usedAt: number;
  size: number;
}
export interface ClipCache {
  get(key: string): Promise<Blob | null>;
  put(key: string, blob: Blob): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}
const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(tx.error ?? new Error('The audio cache could not be saved.'));
  });
/** Disposable, bounded cache. Books and reading checkpoints live in their own store. */
export class AudioCache implements ClipCache {
  private database: Promise<IDBDatabase> | undefined;
  constructor(
    private name = DATABASE,
    private limit = MAX_BYTES,
    private count = MAX_CLIPS,
  ) {}
  private open() {
    return (this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.name, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (db.objectStoreNames.contains('clips')) db.deleteObjectStore('clips');
        db.createObjectStore('clips', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          this.database = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error('Close another Hush window to update the audio cache.'));
    }));
  }
  async get(key: string): Promise<Blob | null> {
    const db = await this.open();
    const tx = db.transaction(['clips', 'audio'], 'readwrite');
    const finished = done(tx);
    const store = tx.objectStore('clips');
    let found: Uint8Array | undefined;
    const request = store.get(key);
    request.onsuccess = () => {
      const record = request.result as Record | undefined;
      if (record) {
        store.put({ ...record, usedAt: Date.now() });
        const data = tx.objectStore('audio').get(key);
        data.onsuccess = () => {
          found = data.result as Uint8Array | undefined;
        };
      }
    };
    await finished;
    return found ? new Blob([new Uint8Array(found)], { type: 'audio/wav' }) : null;
  }
  async put(key: string, blob: Blob) {
    if (blob.size < 44 || blob.size > Math.min(this.limit, MAX_CLIP_BYTES)) return;
    const data = new Uint8Array(await blob.arrayBuffer());
    if (new TextDecoder().decode(data.subarray(0, 4)) !== 'RIFF')
      throw new Error('The voice returned an invalid audio clip.');
    const db = await this.open();
    const tx = db.transaction(['clips', 'audio'], 'readwrite');
    const finished = done(tx);
    const store = tx.objectStore('clips');
    const request = store.getAll();
    request.onsuccess = () => {
      const records = (request.result as Record[])
        .filter((item) => item.key !== key)
        .sort((a, b) => a.usedAt - b.usedAt);
      let size = records.reduce((sum, item) => sum + item.size, 0) + data.byteLength;
      while (records.length && (size > this.limit || records.length >= this.count)) {
        const old = records.shift()!;
        size -= old.size;
        store.delete(old.key);
        tx.objectStore('audio').delete(old.key);
      }
      store.put({ key, size: data.byteLength, usedAt: Date.now() });
      tx.objectStore('audio').put(data, key);
    };
    await finished;
  }
  async remove(key: string) {
    const db = await this.open();
    const tx = db.transaction(['clips', 'audio'], 'readwrite');
    const finished = done(tx);
    tx.objectStore('clips').delete(key);
    tx.objectStore('audio').delete(key);
    await finished;
  }
  async clear() {
    const db = await this.open();
    const tx = db.transaction(['clips', 'audio'], 'readwrite');
    const finished = done(tx);
    tx.objectStore('clips').clear();
    tx.objectStore('audio').clear();
    await finished;
  }
  async close() {
    if (this.database) (await this.database).close();
    this.database = undefined;
  }
}
export const audioCache = new AudioCache();
export async function clipKey(engineKey: string, text: string) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`hush-clip-v2\0${engineKey}\0${text}`),
  );
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
