import { parentPort, workerData } from 'node:worker_threads';
import { runScenarioTrial } from './scenario-trial.mjs';
const { protocol, scenario, seed, mode } = workerData;
parentPort.postMessage(runScenarioTrial(protocol, scenario, seed, mode));
