# Building the published experiment

The source repository includes the Rust library, arena, experimental hosts,
protocols, complete evidence and documentation. Large JSON evidence files are
stored as deterministic gzip siblings to stay within GitHub's per-file limit.
Their uncompressed bytes and checksums are unchanged.

Run `npm ci && npm run prepare:publication` after cloning. Preparation verifies
every stored and decoded SHA-256, then restores the JSON paths used by the
research tools. It refuses to overwrite different local files.

`inputs/` contains the already-verified 0.3.0 library downloads, later headless
research kits, and browser binaries needed by the static exhibit. It lets
Vercel build the documentation without installing the Rust toolchain. It does
not replace the source build: `npm run build` rebuilds the current arena and
library from Rust and TypeScript. See the root README for prerequisites.

`npm run build:microsite` renders the current article, report and experiment
pages into `apps/microsite/dist`. Vercel runs preparation and this renderer on
each deployment.

To refresh browser inputs after a source change, rebuild the arena/SDK/Wasm,
copy those outputs into the corresponding input directories, and regenerate
their entries in `inputs.json`. Never regenerate or change a frozen research
record merely to refresh the website.

The checked-in distributions are privacy edition 1. `privacy-edition-v1.json` records the content-hash transformation; `docs/releases/privacy-edition-v1.md` explains its scope. `npm run check:privacy` checks tracked files, nested archives, and commit authors before publication.
