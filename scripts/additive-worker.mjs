import { parentPort, workerData } from 'node:worker_threads';
import { runRewardTrial } from './additive-trial.mjs';
parentPort.postMessage(runRewardTrial(workerData.protocol, workerData.seed));
