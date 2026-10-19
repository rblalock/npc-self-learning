import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
async function files(dir) { const list=[]; for(const entry of await readdir(dir,{withFileTypes:true})) {const p=join(dir,entry.name); if(entry.isDirectory())list.push(...await files(p));else list.push(p);}return list; }
const paths=(await Promise.all(['apps/arena/src','apps/arena/public/wasm','packages/browser/src'].map(p=>files(join(root,p))))).flat().filter(p=>!p.endsWith('/build-info.ts')).sort();
const hash=createHash('sha256');const sources={};
for(const path of paths) {const name=relative(root,path),bytes=await readFile(path);const sha=createHash('sha256').update(bytes).digest('hex');sources[name]=sha;hash.update(name+'\0'+sha+'\n');}
const id=hash.digest('hex');
await writeFile(join(root,'apps/arena/src/build-info.ts'),`// Content fingerprint of game, study, typed client and generated Wasm.\nexport const BUILD_ID = '${id}';\n`);
await writeFile(join(root,'apps/arena/public/build-manifest.json'),JSON.stringify({schema:1,build:id,sources},null,2)+'\n');
console.log(`Study build: ${id}`);
