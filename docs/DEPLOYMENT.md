# GitHub Pages delivery

Canonical application: **https://krishnuni.github.io/hush/**  
Source: **https://github.com/krishnuni/hush**

Hush is a static browser application. GitHub Pages serves the built files; EPUB/PDF processing, IndexedDB storage, neural inference and media playback execute in the visitor's browser. No application backend or voice subscription is required.

## Release path

1. Complete changes on a branch and inspect the actual production layouts.
2. Run unit, interface, reading, real-neural and offline tests. The [browser workflow](https://github.com/krishnuni/hush/actions/workflows/verify.yml) adds standard Chromium and WebKit coverage; inspect the exact commit's run.
3. Merge the verified change to `main`. [Deploy Hush reader](https://github.com/krishnuni/hush/actions/workflows/pages.yml) reads the Pages base path, installs locked dependencies, stages pinned voice files, runs units, builds and verifies browser/offline flows before uploading `dist/`.
4. Confirm the build and deploy jobs succeed and the `github-pages` environment points to the expected commit.
5. Open the canonical HTTPS URL, confirm the new identity appears, and smoke-test sample import, reading, navigation, preferences and narration setup. A source upload or workflow definition alone is not a deployed application.

The application remains scoped to `/hush/`: fonts, workers, EPUB resources, voice URLs, service-worker scope and caches all use the build base. There are no server-side routes. The static artifact includes the optional voice assets; the browser downloads the approximately 115 MB pack only after explicit enable. Model binaries are ignored by git and prepared reproducibly from the pinned upstream revision at build time.

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
