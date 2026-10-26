import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { claimLiveStudy } from './agentic-v3/live-guard.mjs';

test('one persistent live directory prevents a replacement budget and concurrent writers', async t => {
  const root=await mkdtemp(join(tmpdir(),'npc-v3-live-guard-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const registry=join(root,'study.json'),out=join(root,'first'),protocol={id:'fixture',cap:12.8};
  const first=await claimLiveStudy({registry,out,protocol});
  const before=await readFile(registry,'utf8');
  await assert.rejects(claimLiveStudy({registry,out:join(root,'replacement'),protocol}),/replacement is blocked/);
  await assert.rejects(claimLiveStudy({registry,out,protocol}),/writer lock exists/);
  await first.release();
  await assert.rejects(claimLiveStudy({registry,out,protocol:{...protocol,cap:99}}),/replacement is blocked/);
  await symlink(out,join(root,'alias'));
  const resume=await claimLiveStudy({registry,out:join(root,'alias'),protocol});
  assert.deepEqual(resume.publicRecord,first.publicRecord);
  assert.equal(await readFile(registry,'utf8'),before);
  assert.ok(!JSON.stringify(first.publicRecord).includes(root));
  await resume.release();
});

test('concurrent first attempts cannot both claim the study', async t => {
  const root=await mkdtemp(join(tmpdir(),'npc-v3-live-race-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const registry=join(root,'study.json'),protocol={id:'fixture'};
  const outcomes=await Promise.allSettled(['a','b'].map(name=>claimLiveStudy({registry,out:join(root,name),protocol})));
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  await outcomes.find(x=>x.status==='fulfilled').value.release();
});
