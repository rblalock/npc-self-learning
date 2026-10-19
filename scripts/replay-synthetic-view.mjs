/** The measured v1 exporter remains immutable. Presentation evolves independently. */
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { root, sha, writeNew } from "./synthetic/io.mjs";

const args = process.argv.slice(2);
if (!args.includes("--out"))
  args.push("--out", "docs/experiments/synthetic-population-v1-view");
const exported = JSON.parse(
  execFileSync(
    process.execPath,
    [resolve(root, "scripts/replay-synthetic.mjs"), ...args],
    { encoding: "utf8" },
  ),
);
const bytes = await readFile(exported.json),
  payload = JSON.parse(bytes);
const template = await readFile(
  resolve(root, "scripts/synthetic-replay-view.html"),
  "utf8",
);
const html = template.replace(
  "__PAYLOAD__",
  JSON.stringify(payload).replaceAll("<", "\\u003c"),
);
// Only replace the HTML just created by this invocation, never prior evidence.
await writeFile(exported.html, html);
await writeNew(exported.html.replace(/\.html$/, ".view.json"), {
  rendererVersion: 2,
  templateSha256: sha(template),
  htmlSha256: sha(html),
  replaySha256: sha(bytes),
  resultsSha256: payload.resultsSha256,
});
console.log(JSON.stringify({ ...exported, rendererVersion: 2 }, null, 2));
