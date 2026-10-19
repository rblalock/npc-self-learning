# NPC self-learning exhibit

Static research site with a playable Tactical Air arena, recorded trials,
full methods and library downloads. Source lives in `src/`; action artwork
lives in `art/`. The arena uses its own terrain asset.

From the repository root, run `npm ci`, `npm run prepare:publication`, then
`npm run build:microsite`. Serve `dist/` over HTTP. Production deploys to
https://npc-self-learning.vercel.app/ using the root Vercel config.

`public-notes.json` lists the reviewed documents rendered on the site. New repository Markdown is not published automatically, and a link to an unlisted document fails the build. Keep editorial notes and internal handoffs out of this list.
