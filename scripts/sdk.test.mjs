import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as module from '../apps/arena/public/wasm/tactical_air.js';
import { TacticalPolicy } from '../packages/browser/dist/index.js';
await module.default({module_or_path:await readFile(new URL('../apps/arena/public/wasm/tactical_air_bg.wasm',import.meta.url))});
test('typed client supports a separate host vocabulary, ownership and native errors',()=>{
  const config={seed:8,roles:[{id:'sentry',actions:['signal','hide']}],contexts:['courtyard'],learning_rate:.22,exploration:.16,temperature:.3,decay:.025,max_update:.16};
  const a=TacticalPolicy.fromModule(module,config),b=TacticalPolicy.fromModule(module,config);
  try {
    const d=a.choose('sentry','courtyard',['signal']);assert.equal(d.action,'signal');
    assert.equal(a.feedback(d.decision_id,.7),true);a.commit();
    const snapshot=a.snapshot();b.restore(snapshot);assert.deepEqual(b.inspect(),a.inspect());
    b.age();assert.ok(b.inspect().cells[0].score<a.inspect().cells[0].score);
    assert.throws(()=>a.choose('unknown','courtyard',['signal']),/unknown/);
    a.dispose();a.dispose();assert.throws(()=>a.inspect(),/disposed/);
  } finally {a.dispose();b.dispose();}
});
