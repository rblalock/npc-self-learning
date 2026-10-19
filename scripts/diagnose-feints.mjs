import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { baselineRoot, verifyBaseline } from "./evidence-baseline.mjs";
import {
  readProtocol,
  outputPrefix,
  hashes,
  writeNew,
  SOURCE_PATHS,
  root,
  checkHashes,
} from "./synthetic/io.mjs";
import {
  diagnosticWorlds,
  diagnosticMatrix,
  diagnose,
  diagnosticReport,
} from "./synthetic/diagnostic.mjs";
const { protocol: p, path, hash } = await readProtocol("feint-interactions-v1"),
  prefix = await outputPrefix(p.id);
console.error(verifyBaseline());
const referencePath = resolve(baselineRoot, p.reference),
  scenarioPath = "docs/experiments/scenario-transfer-v1.protocol.json";
const sourceHashes = await hashes([
  ...SOURCE_PATHS,
  path,
  scenarioPath,
  `target/evidence-baseline-v1/${p.reference}`,
]);
await writeNew(prefix + ".started.json", {
  startedAt: new Date().toISOString(),
  protocolSha256: hash,
  sourceHashes,
});
const reference = JSON.parse(await readFile(referencePath)),
  scenarioProtocol = JSON.parse(await readFile(resolve(root, scenarioPath))),
  worlds = diagnosticWorlds(scenarioProtocol);
const matrix = diagnosticMatrix(p, worlds),
  summary = { ...diagnose(p, matrix, reference), protocolSha256: hash };
await checkHashes(sourceHashes);
const result = {
  schema: 1,
  protocol: p,
  provenance: { generatedAt: new Date().toISOString(), sourceHashes },
  worlds,
  matrix,
  summary,
};
await writeNew(prefix + ".results.json", result);
await writeNew(
  prefix + ".summary.json",
  JSON.stringify(summary, null, 2) + "\n",
);
await writeNew(prefix + ".md", diagnosticReport(p, summary, matrix).join("\n"));
console.log(
  JSON.stringify(
    {
      encounters: matrix.length,
      creditBlindPairs: summary.creditBlindPairs.length,
      expectedChange: summary.originalFeintExpectedChange,
      roleContributions: summary.roleContributions,
    },
    null,
    2,
  ),
);
