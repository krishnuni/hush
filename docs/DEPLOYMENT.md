# GitHub Pages delivery

Canonical application: **https://krishnuni.github.io/hush/**  
Source: **https://github.com/krishnuni/hush**

Hush is a static browser application. GitHub Pages serves the built files; EPUB/PDF processing, IndexedDB storage, neural inference and media playback execute in the visitor's browser. No application backend or voice subscription is required.

## Published redesign

The literary redesign was merged in [#2](https://github.com/krishnuni/hush/pull/2) at `ffd7a906c23789855de1f3dbe16c549b5cb15a0d`. Its [Pages run](https://github.com/krishnuni/hush/actions/runs/41451226325) completed successfully. The hosted browser smoke check covered original-sample imports, chapter navigation, bookmarks, Night appearance and reload restoration, followed by explicit voice installation and actual playback state. Physical speaker output remains a separate check.

## Published voice choice

[Release #3](https://github.com/krishnuni/hush/pull/3) deployed application commit `7d42b3002926b17b8b03f2ec854c6a5785eef4a6` on 3 November 2026. The [Pages build/deploy run](https://github.com/krishnuni/hush/actions/runs/41644474610) succeeded, as did the [full Chromium/WebKit verification](https://github.com/krishnuni/hush/actions/runs/41644474824): 37 unit tests and 34 browser cases. The hosted check confirmed the installed engine survived the update, additional profiles downloaded individually, both American and British previews played, and saved book state remained available. See [STATUS.md](STATUS.md) for scope and hardware limitations.

## Release path

1. Complete changes on a branch and inspect the actual production layouts.
2. Run unit, interface, reading, real-neural and offline tests. The [browser workflow](https://github.com/krishnuni/hush/actions/workflows/verify.yml) adds standard Chromium and WebKit coverage; inspect the exact commit's run.
3. Merge the verified change to `main`. [Deploy Hush reader](https://github.com/krishnuni/hush/actions/workflows/pages.yml) reads the Pages base path, installs locked dependencies, stages pinned voice files, runs units, builds and verifies browser/offline flows before uploading `dist/`.
4. Confirm the build and deploy jobs succeed and the `github-pages` environment points to the expected commit.
5. Open the canonical HTTPS URL, confirm the new identity appears, and smoke-test sample import, reading, navigation, preferences and narration setup. A source upload or workflow definition alone is not a deployed application.

The application remains scoped to `/hush/`: fonts, workers, EPUB resources, voice URLs, service-worker scope and caches all use the build base. There are no server-side routes. The static artifact includes all 28 English voice profiles; the browser downloads the approximately 115 MB engine/first-voice pack only after explicit enable. Additional selected profiles download individually at 522,240 bytes each. The original Heart cache is retained across this update. Model binaries are ignored by git and prepared reproducibly from the pinned upstream revision at build time.

## Reproduce

```bash
npm ci
npm test
HUSH_BASE_PATH=/hush/ npm run build
HUSH_BASE_PATH=/hush/ HUSH_TEST_WEB_VOICE=1 npm run test:e2e -- --workers=1
HUSH_BASE_PATH=/hush/ npm run test:offline
HUSH_BASE_PATH=/hush/ HUSH_TEST_WEB_VOICE=1 npm run test:webkit
node scripts/serve-preview.mjs --base /hush/
```

Use Node 24 and install the standard Playwright browser/dependency packages before the browser commands. The full build, not an HTML file opened through `file://`, is required. The initial build downloads the pinned q8 model; later builds verify and reuse staged files.

## Recovery

- Check the failing workflow step and exact SHA before changing application code. Pages configuration, dependency installation, compilation, inference and publication are separate failure categories.
- Pages must use GitHub Actions as its publishing source. The existing public repository and HTTPS URL are retained.
- An older open tab can retain its active service worker. Reload online to fetch the new document; close older Hush tabs if an old worker is still waiting to retire. Do not clear site data as an update procedure: it removes local books and saved places.
- For a defective release, revert the change in git and let the same verified workflow publish the previous implementation. Keep the library/cache schema stable; this redesign requires no data migration.

See [STATUS.md](STATUS.md) for actual local counts, configured CI coverage and physical-device limitations. Each workflow run and the deployment environment provide the immutable commit-specific publication evidence.
