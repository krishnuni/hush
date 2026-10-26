# Desktop and mobile browser support

The same GitHub Pages application runs in desktop and mobile browsers. No native Android/iOS build or desktop voice sidecar is required. React controls adapt to narrow layouts; EPUB.js/PDF.js, IndexedDB and the neural worker are shared.

## Browser behaviour

- Import via the browser file picker; originals are copied into this site's IndexedDB.
- Enable the optional 115 MB voice while the page is open, then use Listen. Single-threaded WASM is the baseline and does not require WebGPU or SharedArrayBuffer.
- The app activates one audio element during a tap and reuses it. If autoplay is refused, use the explicit Play control.
- Reading and listening places are checkpointed on lifecycle events. Model and generated-audio caches support offline reopening after successful setup.
- An installable manifest supports browser/home-screen installation where offered by the browser. It does not grant native background-audio privileges.

## Limits

Mobile operating systems may suspend workers/audio when the app is backgrounded or the screen locks. Storage can be evicted. Low-memory devices may terminate a neural worker even though reading works. A quantised model file is 92 MB, but inference needs substantially more working memory. Continuous speech can consume battery and produce heat. No physical-device RAM, thermal or battery guarantee is made.

Current executed browser/viewport evidence is recorded in [STATUS.md](STATUS.md). Chromium with phone dimensions is a layout test; Linux Playwright WebKit is a browser-engine test. Neither alone certifies an actual iPhone or iPad, Bluetooth behaviour, lock-screen controls or every iOS version.

## Device acceptance

On physical iPhone/iPad and Android hardware: import EPUB/PDF; reflow at large text sizes; enable the voice over Wi-Fi; listen to several chapters; test headphone/volume controls; rotate; background/reopen; force-close/reopen; clear only generated audio; remove/re-enable the voice; verify bookmarks and saved places remain. Record sustained performance before making device-specific claims.
