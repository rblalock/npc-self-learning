import { parentPort, workerData } from "node:worker_threads";
import { runPopulationSeed } from "./runner.mjs";
parentPort.postMessage(
  runPopulationSeed(
    workerData.protocol,
    workerData.seed,
    workerData.selectedFixed,
  ),
);
