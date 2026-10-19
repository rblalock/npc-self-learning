import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {dirname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../publication/inputs.json', import.meta.url), 'utf8'));
const hash = data => createHash('sha256').update(data).digest('hex');
const safe = path => {
  const absolute = resolve(root, path);
  if (!absolute.startsWith(resolve(root) + sep)) throw Error(`Path outside repository: ${path}`);
  return absolute;
};
let restored = 0;
for (const entry of manifest.files) {
  const stored = await readFile(safe(entry.source));
  if (hash(stored) !== entry.storedSha256) throw Error(`Stored input differs: ${entry.source}`);
  if (!['gzip', 'identity'].includes(entry.encoding)) throw Error(`Unknown encoding: ${entry.encoding}`);
  const data = entry.encoding === 'gzip' ? gunzipSync(stored) : stored;
  if (data.length !== entry.bytes || hash(data) !== entry.sha256) throw Error(`Input checksum differs: ${entry.destination}`);
  const destination = safe(entry.destination);
  try {
    const existing = await readFile(destination);
    if (hash(existing) === entry.sha256) continue;
    throw Error(`Refusing to overwrite a different local file: ${entry.destination}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(destination), {recursive: true});
  await writeFile(destination, data, {flag: 'wx'});
  restored++;
}
console.log(`Verified ${manifest.files.length} publication inputs; restored ${restored} files.`);
