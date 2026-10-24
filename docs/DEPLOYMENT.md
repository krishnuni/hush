# Hush delivery

## Current status — 24 October 2026

GitHub publication is authorized. The source and workflows are prepared locally;
repository creation is currently waiting for GitHub browser authentication.
The secure sign-in returned Google as the selected method, but automatic
approval review blocked observation of Google's sign-in origin. That route
needs explicit user approval before it can continue. The GitHub connector
itself is connected and confirms the `krishnuni` account, but exposes no
repository-creation or Pages-configuration action.
No successful remote build, Pages deployment or Windows release is claimed yet.
Update this section with actual commit, run and deployment links after publishing.

Local deployment checks passed on 24 October: 30 frontend tests, the production
build, six EPUB/PDF/error browser cases and two offline cases under `/hush/` on
desktop and phone viewports. Production npm audit reported zero advisories.
Four neural browser cases explicitly skipped because this deployment check did
not load a voice worker. The earlier real-neural evidence is recorded separately
in STATUS.md; it was not re-run or extended by these web deployment checks.

## Web reader

`.github/workflows/pages.yml` installs locked dependencies, runs unit tests,
builds using the Pages base path, exercises EPUB/PDF reader flows on desktop and
phone viewports, verifies offline reopening, then deploys the resulting artifact.
Select **GitHub Actions** as the publishing source in repository Settings → Pages.
The deploy job alone receives `pages: write` and `id-token: write`.

The public web edition stores imports and reading state in the visitor's browser.
It has no document upload backend, paid API or hosted neural inference service.
The native Pocket TTS worker cannot execute on GitHub Pages. The interface
reports narration as unavailable in this edition.

To reproduce the project-path checks locally:

```bash
npm ci
HUSH_BASE_PATH=/hush/ npm run build
npx playwright install chromium
HUSH_BASE_PATH=/hush/ npm run test:e2e
HUSH_BASE_PATH=/hush/ npm run test:offline
node scripts/serve-preview.mjs --base /hush/
```

On PowerShell set `$env:HUSH_BASE_PATH = '/hush/'` before running those commands.
Unset the variable before building a desktop installer. Native builds use `/`.

## Windows preview

Run **Windows desktop preview** on `main`. It compiles the voice worker,
downloads only the pinned official model/voice assets, verifies their hashes,
runs actual Windows worker/reconnection tests, stages attribution and builds an
NSIS installer. The installer and SHA-256 checksum are uploaded as a workflow
artifact. Selecting `publish` creates a prerelease only after the build succeeds;
use a new tag such as `v0.1.0-preview.1` for each release.

The installer is unsigned. Automated inference and compilation do not establish
native GUI/audio behavior, physical listening quality or clean-machine setup.
Those checks remain required before promoting a preview to a stable release.
Native Android/iOS builds remain separate from the responsive mobile web reader.

## Source boundaries and verification

Commit application source, lockfiles, original samples, vendored runtime source
with its notices, fonts with their licence, and reproducible scripts. Exclude
user books, runtime model weights, generated audio, local databases, build
directories, credentials and machine-specific paths. A full source checkout is
about a few megabytes; optional voice assets are fetched by the build script.

`verify.yml` checks browser reading, Rust storage/voice code and native compilation
on Linux and Windows. Neural browser cases explicitly skip when the real engine
is absent. The Windows preview workflow runs the real engine separately.

Historical local test evidence and unresolved platform gates are in
[STATUS.md](STATUS.md). A workflow definition is not evidence of a completed
remote run. Only successful GitHub runs and a reachable deployed page establish
deployment. GitHub Pages configuration follows the
[official custom workflow guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Recovery

A failed check prevents the Pages deploy job. The previously deployed artifact
remains available. Fix the failing check and push again, or revert the offending
commit with a new commit; do not rewrite published history. Browser shell caches
are scoped to Hush's base path and versioned by build. Closing existing Hush tabs
and reopening lets an installed service-worker update activate.
