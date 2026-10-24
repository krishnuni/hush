# Mobile implementation boundary

The user's approval on 23 October 2026 added potential mobile functionality. This checkpoint interprets that as mobile-compatible structure and responsive reading layouts, with native mobile delivery subject to platform verification.

## Shared now

React/TypeScript UI, theme/type controls, chapter/bookmark interactions, source-to-sentence mapping, locator schema, library metadata and SQLite core are separated from a desktop process model. CSS adapts to narrow viewports and accounts for safe areas. The Tauri host exposes a library entry point with `mobile_entry_point`.

## Still device-specific

Android content URIs and persistent file access; iOS document-provider/security-scoped resource access; mobile suspension and termination; headphone/lock-screen controls; background audio sessions; memory/thermal budgets; native on-device model runtime; voice-pack storage; screen-reader and keyboard behaviour. None is represented as certified by a responsive browser layout.

The desktop synthesis sidecar will remain a desktop adapter. A future mobile engine implements the same sentence/job contract with an in-process/native inference API and OS audio session. It must not run a desktop executable or assume background webview timers remain alive.

## Gates

Phone-width Chromium flows pass for EPUB/PDF import, chapter/page navigation,
bookmarks, typography, theme restoration, PDF zoom/offsets and shared neural
controls. Offline EPUB/PDF reopening, exact audio-cache resume and automatic
chapter narration also passed in this viewport.
The phone viewport uses the local desktop worker; no phone inference benchmark
or native mobile certification is implied. Native packaging is the next gate.

Build an Android device prototype and, on macOS with Xcode, an iOS device
prototype. Require local import, semantic position restoration after
suspension/termination, reachable controls at large text sizes, and bounded
memory. Neural inference and uninterrupted background playback have independent
audible/device tests.

Sources: [Tauri mobile prerequisites](https://v2.tauri.app/start/prerequisites/) and [mobile plugin development](https://v2.tauri.app/develop/plugins/develop-mobile/). These support the platform path, not an assertion that Hush has passed it.

## Installable web reader

The production build now includes a standalone app manifest and a versioned
service worker for the app shell, reader engines and fonts. After successful
installation/loading, local books can be reopened without a network. The shell
cache deliberately excludes book text and inference responses; documents,
checkpoints and generated clips retain their own local storage boundaries.
This path shares actual reader code with desktop. It provides no mobile neural
inference or background audio guarantee. Browser storage can be evicted by the
OS; native document ownership and export/backup remain platform work.
