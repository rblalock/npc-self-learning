import { parentPort, workerData } from 'node:worker_threads';
import { createExperimentRunner } from './adaptation-trial.mjs';

const runner = createExperimentRunner(workerData.protocol);
parentPort.postMessage(runner.runTrial(workerData.seed));
