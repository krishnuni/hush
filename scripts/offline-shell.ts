import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
/** Cache only the built application shell. Books and speech remain in their own local stores. */
export function offlineShell(): Plugin {
  let base = '/';
  return {
    name: 'hush-offline-shell',
    apply: 'build',
    configResolved(config) {
      base = config.base;
      if (!/^\/(?:[a-zA-Z0-9._~-]+\/)*$/.test(base))
        throw new Error('Hush needs a local base path ending in a slash.');
    },
    async generateBundle(_options, bundle) {
      const publicFiles = await readdir(resolve('public'), {
        recursive: true,
        withFileTypes: true,
      });
      const files = publicFiles
        .filter((file) => file.isFile())
        .map((file) => resolve(file.parentPath, file.name));
      const assets = Object.keys(bundle).filter((name) => !name.endsWith('.map'));
      const hash = createHash('sha256');
      hash.update(assets.join('\n'));
      for (const file of files) hash.update(await readFile(file));
      const prefix =
        'hush-shell-' + createHash('sha256').update(base).digest('hex').slice(0, 8) + '-';
      const version = prefix + hash.digest('hex').slice(0, 16);
      const urls = [
        base,
        ...assets.map((name) => base + name),
        ...files.map(
          (file) => base + file.slice(resolve('public').length + 1).replaceAll('\\', '/'),
        ),
      ];
      const source = `const CACHE=${JSON.stringify(version)},PREFIX=${JSON.stringify(prefix)},BASE=${JSON.stringify(base)},URLS=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(URLS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(cache=>cache.match(BASE))));return;}if(URLS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.pathname)).then(cached=>cached||fetch(event.request)));});`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
