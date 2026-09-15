import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CalibrationState,semanticDiff,applyPatch,elementKeys,assertCalibrationConfig} from '../templates/starter/engine/calibration.js';
const base=JSON.parse(fs.readFileSync(new URL('../templates/starter/config/world.json',import.meta.url)));

test('staged drafts preserve baseline; revert restores it; apply retains diffs for export',()=>{
 const state=new CalibrationState(base),draft=structuredClone(base);draft.chapters[1].elements[2].x+=1;
 state.stage(draft);draft.chapters[1].elements[2].x=99;
 assert.equal(state.current.chapters[1].elements[2].x,base.chapters[1].elements[2].x+1);
 assert.equal(state.committed.chapters[1].elements[2].x,base.chapters[1].elements[2].x);
 state.revert();assert.equal(state.patch().changes.length,0);
 draft.chapters[1].elements[2].x=4;state.stage(draft);state.apply();assert.ok(state.diff().length>0);assert.deepEqual(applyPatch(base,state.patch()),state.current);
});
test('duplicate assets are independent instances and chapter reorder uses IDs',()=>{
 const b=structuredClone(base);b.chapters[1].elements.push({...b.chapters[1].elements[2]});const a=structuredClone(b);a.chapters[1].elements.at(-1).z-=2;
 const diff=semanticDiff(b,a);assert.equal(diff.length,1);assert.ok(diff[0].scope.endsWith('maple-large#2'));
 assert.equal(new Set(elementKeys(b.chapters[1].elements)).size,b.chapters[1].elements.length);
 [a.chapters[1],a.chapters[2]]=[a.chapters[2],a.chapters[1]];
 assert.ok(semanticDiff(b,a).some(r=>r.scope==='Chapter order'));
});
test('camera look, guide changes, deletions and asset file changes round-trip',()=>{
 const state=new CalibrationState(base),a=structuredClone(base);a.chapters[1].camera.look[0]+=.1;a.chapters[1].guidePath[1][2]-=2;a.chapters[1].elements.splice(0,1);a.assets.cloud.file='assets/sample/maple-small.webp';
 state.stage(a);const patch=state.patch();assert.deepEqual(applyPatch(base,patch),a);
 assert.ok(state.diff().some(r=>r.path.includes('/camera/look')));assert.ok(state.diff().some(r=>r.path.includes('/guidePath')));assert.ok(state.diff().some(r=>r.op==='remove'));
});
test('patch rejects baseline drift and unsafe fields',()=>{
 const state=new CalibrationState(base);state.current.chapters[1].elements[0].x++;
 const changed=structuredClone(base);changed.title='Different';assert.throws(()=>applyPatch(changed,state.patch()),/baseline/);
 const poisoned=JSON.parse(JSON.stringify(base).replace('"title":','"__proto__": {}, "title":'));assert.throws(()=>assertCalibrationConfig(poisoned),/Unsafe/);
});
test('invalid numeric fields and broken references cannot be staged',()=>{
 const state=new CalibrationState(base),a=structuredClone(base);a.chapters[1].elements[0].height=-1;assert.throws(()=>state.stage(a));assert.equal(state.draft,null);
 a.chapters[1].elements[0].height=1;a.chapters[1].camera.from[2]=NaN;assert.throws(()=>state.stage(a));
 a.chapters[1].camera.from[2]=20;a.chapters[1].elements[0].asset='unknown';assert.throws(()=>state.stage(a));
});
