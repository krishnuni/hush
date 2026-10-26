# GitHub Pages delivery

## Publication status — 27 October 2026

The source repository is public at **https://github.com/krishnuni/hush**.
The reader is deployed over HTTPS at **https://krishnuni.github.io/hush/**.
Pages uses **GitHub Actions** as its publishing source, with HTTPS enforced.

[Pages run 40373280828, attempt 2](https://github.com/krishnuni/hush/actions/runs/40373280828/attempts/2)
successfully built and deployed commit `65fbbe5f630d1361f04c42757fee56155b4a1762`.
It passed unit tests, real browser neural/reader checks and offline EPUB/PDF
checks before uploading and deploying the artifact. The earlier failure at
`configure-pages` was resolved by enabling Pages on the now-public repository.
The production browser code is unchanged by this documentation update.

[Browser verification run 40335757205](https://github.com/krishnuni/hush/actions/runs/40335757205)
also passed on that merged commit: 32 unit tests, eight Chromium reader/neural
cases, two offline cases and eight WebKit reader/neural cases. The four optional
desktop Pocket bridge cases are explicitly skipped in this browser run.

The hosted smoke check opens the real Pages URL, adds and renders an original
EPUB and installs/initializes the optional browser voice from the hosted assets.
Physical-device and audible-quality limits are recorded in STATUS.md.

## Production execution

The deployed artifact is static HTML, JS, CSS, fonts, service worker, PDF worker
and optional voice files. Kokoro/Transformers/ONNX WASM runs in a module worker
on the visitor's desktop or phone. Books stay in IndexedDB; generated audio has
an independent bounded cache. The Tauri host, Pocket worker, development bridge
and preview Node process do not execute on Pages.

The build fetches pinned model/tokenizer files from the official Hugging Face
revision, verifies hashes and copies the matching installed WASM runtime and
voice. `public/narration/` is generated and excluded from git; its approximately
115 MB contents are included in `dist/`. Runtime requests use the Pages origin,
not Hugging Face or an external inference API. Initial shell installation does
not precache the weights. The user enables/downloads the voice explicitly.

## Activate and deploy

1. Ensure this repository/account permits Pages hosting. For a public portfolio,
   make the approved source repository public through Settings → General.
2. In Settings → Pages → Build and deployment, choose **GitHub Actions**.
3. Push the final source to `main`, or run **Deploy Hush reader** manually.
4. Inspect both build and deploy jobs. Open the exact URL returned by deployment
   and verify import, voice setup and offline reopening at that hosted path.

`pages.yml` obtains `base_path` from `actions/configure-pages`, installs the
committed dependency graph, runs unit tests, builds the pinned static resources,
executes desktop/mobile reader and real browser neural tests, and checks offline
EPUB/PDF before uploading `dist/`. Only the deploy job has `pages: write` and
`id-token: write`. Builds have read-only source permissions; no workflow pushes
code or broadens connector access.

`verify.yml` independently runs browser checks and WebKit tests. `verify-desktop.yml`
is manual for the optional Linux/Windows native checks. `windows-preview.yml`
manually builds an unsigned attributed installer as a workflow artifact and does
not publish a release. These native jobs are not dependencies of Pages hosting.

## Reproduce the project path

Use Node 24 and a recent browser:

```bash
npm ci
npm test
HUSH_BASE_PATH=/hush/ npm run build
npx playwright install --with-deps chromium webkit
HUSH_BASE_PATH=/hush/ HUSH_TEST_WEB_VOICE=1 npm run test:e2e -- --workers=1
HUSH_BASE_PATH=/hush/ npm run test:offline
HUSH_BASE_PATH=/hush/ HUSH_TEST_WEB_VOICE=1 npm run test:webkit
node scripts/serve-preview.mjs --base /hush/
```

PowerShell: set `$env:HUSH_BASE_PATH = '/hush/'` and
`$env:HUSH_TEST_WEB_VOICE = '1'` before the corresponding commands. Unset the
base path for native desktop builds, which use `/`. A root-hosted build uses
`/`; custom-domain/root/project paths need a matching build and service-worker
scope. Do not open the output with `file://`.

## Repository boundaries

Commit source, lockfiles, original samples, tests, build/deployment scripts,
fonts and licences. Exclude personal books, databases, generated audio,
credentials, runtime weights, dependencies and `dist/`. CI retrieves pinned
assets without an account token. The static artifact is below Pages' 1 GB site
limit. See README for resource sizes, design rationale and upstream terms.

## Updates and recovery

Failed build/test jobs prevent deployment. The previously deployed artifact
remains available. Fix and push or revert with a new commit; do not rewrite
published history. Shell caches are scoped to the app path and content version.
Close existing Hush tabs and reopen to permit the installed update to activate.
Voice cache versions are independent; a model/runtime/voice change must bump
the voice version and engine key. Generated clip keys include the engine identity.

If voice setup fails, check storage space, connection and browser capabilities;
retry reuses verified completed files. Remove downloaded voice in Settings to
clear that cache without deleting books. Clearing all site data also removes
the local library, so keep the original documents. No browser can promise to
retain storage indefinitely or run workers while the OS suspends its tab.

GitHub configuration follows the [official custom workflow guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
