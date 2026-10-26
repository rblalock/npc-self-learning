import assert from 'node:assert/strict';
import { mkdir, readFile, realpath, writeFile, unlink, open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { sha } from './design.mjs';

// A live study gets one durable output directory. A different --out cannot
// reset costs, request counts or the failure latch. Replacements require an
// explicitly audited protocol/accounting amendment, not an automatic restart.
export async function claimLiveStudy({ registry, out, protocol }) {
  await mkdir(out, {recursive: true});
  const directory = await realpath(out), lock = resolve(registry + '.writer-lock');
  await mkdir(dirname(registry), {recursive: true});
  const entry = {schema: 1, studyId: protocol.id, protocolSha256: sha(protocol), directory};
  try { await writeFile(registry, JSON.stringify(entry) + '\n', {flag: 'wx', mode: 0o600}); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    assert.deepEqual(JSON.parse(await readFile(registry, 'utf8')), entry,
      'This live study already has a registered directory or protocol. A replacement is blocked until prior spending and unknown calls are audited in a new protocol amendment. Resume the registered journal instead.');
  }
  // Persist both the content and directory entry before any request can run.
  // Sync adopted claims too: a previous process may have exited mid-creation.
  for (const path of [registry, dirname(registry)]) {
    const handle = await open(path, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  }
  try { await writeFile(lock, JSON.stringify({pid: process.pid}) + '\n', {flag: 'wx', mode: 0o600}); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw Error('A live-study writer lock exists. Do not start another process or reset its journal; inspect the existing run first.');
  }
  return {
    publicRecord: {schema: 1, studyId: entry.studyId, protocolSha256: entry.protocolSha256, mode: 'single-live-directory'},
    release: () => unlink(lock),
  };
}
