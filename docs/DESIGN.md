# Hush — a contemporary literary instrument

The library is composed like a small independent publication; the reader is a precise tool. The identity comes from typesetting, book jackets, rules and proportions rather than a component-library skin.

## Audit and preserved boundaries

The actual Pages application and source were inspected before editing. A persistent sidebar consumed smaller screens, small similar covers weakened book identity, and the continue row lacked a focal point. Narration setup, navigation and reading tools felt disconnected. Phone controls inherited the desktop arrangement. Reader drawers changed the available reading width; paused playback still announced “Reading aloud”.

| Boundary          | Implementation preserved                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| Import            | Bounded EPUB inflation, sanitisation, duplicate hashes and PDF inspection                                          |
| Storage           | Atomic browser IndexedDB insertion, originals, metadata, preferences, bookmarks and separate listening cursor      |
| EPUB              | Reflow, spine navigation, source-aligned sentences and CFI/href/section restoration                                |
| PDF               | Canvas and selectable text, order preview, page/zoom/rotation/vertical-offset restoration                          |
| Inference         | Dedicated Kokoro module worker, pinned q8 model, single WASM thread and same-origin assets                         |
| Voice setup       | Manifest restrictions, byte progress, SHA-256 checks, explicit enable, cancellation, retry and independent removal |
| Audio             | Framework-independent controller, reusable media element, media events, exact-WAV resume and bounded look-ahead    |
| Offline / release | Versioned shell, separate voice cache, bounded clip cache and existing Pages verification workflow                 |

No storage migration is required. Existing preferences remain respected. New reading defaults are 19 px, 1.6 line spacing, 680 px maximum measure and 40 px margins. Locations remain source anchors rather than a percentage-only cursor.

Verification also exposed two timing defects. EPUB.js can finish displaying before its RAF-backed location calculation; Hush now explicitly requests a fresh source location after restoration, and guards an empty `currentLocation()`. PDF navigation now checkpoints the validated requested view before asynchronous painting, so returning to the library immediately after a rotation does not save the previous orientation. These changes are covered by actual browser flows.

## Identity and type

The folded-page mark connects the masthead, install icon and edition imprint. Imported artwork is preserved. Generated jackets use stable mineral colours and three distinct geometric treatments; the original EPUB samples have individual artwork. SVG keeps that geometry sharp at every display density.

| Role                             | Typeface                                     | Reason                                                             |
| -------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Brand, editorial and book titles | Newsreader, variable upright and true italic | Literary proportions, optical sizing and expression through italic |
| Controls and navigation          | IBM Plex Sans, variable                      | Clear small forms and restrained technical character               |
| Indices and measurements         | System monospace                             | Alignment without another downloaded family                        |
| Reading                          | Noto Serif, Noto Sans or publisher type      | Independent, adjustable book typography                            |

Newsreader is by Production Type; IBM Plex is by IBM / Bold Monday. Upstream licences were verified and are included under `third-party/licenses/`. UI files are self-hosted WOFF2, converted losslessly from upstream variable TTFs. There is no runtime Google Fonts request. The existing Noto licence/loading remains intact. `collect-licenses.mjs` distributes all font notices.

## Tokens

`src/ui/styles.css` is the source of truth. The EPUB iframe has matching palette values because it is a separate document. PDFs keep white printed pages in every room theme.

| Token      | Warm      | Light     | Night     |
| ---------- | --------- | --------- | --------- |
| `--paper`  | `#f6f3eb` | `#fffefa` | `#20211f` |
| `--ink`    | `#292b27` | `#292b27` | `#deded0` |
| `--muted`  | `#65685e` | `#65685e` | `#a6a79c` |
| `--line`   | `#d4d3c7` | `#d8dbd0` | `#41443b` |
| `--accent` | `#ac442d` | `#ac442d` | `#e28a6d` |

Night has its own ink, line, accent and transport palette: the dock becomes a pale plane. Warm is natural paper; Light is a brighter neutral environment. The 4/8/12/16/24/32/48/64 px spacing scale sets the rhythm, with optical adjustments around type and spines. Edges are square or 2 px. The circular play control has a transport purpose; mobile sheets alone have a small top radius to communicate their edge.

## Composition and components

The desktop library combines a masthead, editorial introduction and focal current book. A narrow information strip connects local storage and narration with the collection. Search, filters and sorting sit beside the books they affect. First use offers actual original EPUBs and an explicit import area, with no pre-inserted library entries or simulated progress.

On phones the heading becomes two lines, current-book details sit beside a smaller jacket and the collection uses two columns. Quick bookmarking moves to the lower controls. Appearance, chapters and bookmarks become bottom sheets; their overlays keep the reading measure stable. Dynamic viewport units and safe-area insets keep the lower controls reachable. Ultrawide layouts use a wider, bounded publication spread rather than stretching prose across the monitor.

`LibraryView` owns collection presentation; `BookCover` owns jackets; `ReaderPanel` supplies modality and focus return; `NarrationDock` consumes the actual playback snapshot. `App` coordinates state and persistence. Validation and neural state management remain outside these views.

## Motion and accessibility

| Action / token           | Duration | Purpose                                     |
| ------------------------ | -------- | ------------------------------------------- |
| `--fast`                 | 160 ms   | Hover, focus and pressed feedback           |
| `--normal`               | 300 ms   | Panels, sheets and transport reveal         |
| `--slow`                 | 550 ms   | Book/library entrance and jacket movement   |
| Shared jacket transition | 450 ms   | Connect the selected jacket with the reader |

The main easing is `cubic-bezier(.22,1,.36,1)`. Motion uses transforms. View Transitions progressively connect the selected book with its reader object; navigation works without the API. Reduced-motion preferences bypass snapshots and disable movement, including sheets and playback pulses. There is no scroll hijacking.

The playback indicator pulses only in the media-backed playing state. Seeking uses the actual media clock and clip duration. Download percentages use received bytes. No decorative waveform or estimated readiness replaces real state.

Icon controls are named and have visible focus. Native modals make the background inert, support Escape and restore their trigger. Reader panels explicitly loop Tab. EPUB iframe keys are relayed through the host page-turn path so narration is checkpointed/stopped consistently. Space on a focused button activates that button rather than the global playback shortcut.

Axe WCAG A/AA checks cover the empty library and voice setup in all themes. Keyboard tests cover filtering, editing, focus containment/return, iframe navigation, focus mode and bookmarking. This is evidence for exercised screens, not complete accessibility certification or a substitute for screen-reader and physical-device review.

## Reproduce the screenshots

Screenshots in `docs/images/` show the running production application and original publications. They are not static designs. With Playwright Chromium installed:

```bash
HUSH_BASE_PATH=/hush/ npm run build
HUSH_BASE_PATH=/hush/ HUSH_CAPTURE_VOICE=1 npm run capture:interface
```

The optional capture flag installs and runs the real model before photographing the listening dock. Without it, screenshots cover reading and setup without fabricating playback. See `STATUS.md` for executed counts and limitations, including automated WebKit versus a physical iPhone.
