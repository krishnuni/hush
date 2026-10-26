# GitHub Pages delivery

## Publication status — 26 October 2026

The repository is https://github.com/krishnuni/hush. Public source/reader
publication is authorized. Repository settings/account re-verification have
previously blocked Pages activation; source upload and a workflow definition
alone do not establish a reachable site. The earlier Pages run 40101748786
failed at `configure-pages` because the repository had no enabled Pages site.
The earlier verification run 40101748707 passed all five reader/native jobs.
New browser-native code needs its own recorded remote result.

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
