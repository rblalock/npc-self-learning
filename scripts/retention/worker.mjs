import { parentPort,workerData } from 'node:worker_threads';
import { retentionTrial } from './trial.mjs';
parentPort.postMessage(retentionTrial(workerData.protocol,workerData.seed,workerData.suite));
