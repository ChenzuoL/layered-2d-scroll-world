import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const validator=join(root,'scripts/validate-scene-contract.mjs');
const base=JSON.parse(readFileSync(join(root,'templates/scene-contract.example.json')));
const dir=mkdtempSync(join(tmpdir(),'layered-world-test-'));
function run(name,mutate){
 const contract=structuredClone(base);mutate?.(contract);
 const file=join(dir,name+'.json');writeFileSync(file,JSON.stringify(contract));
 const result=spawnSync(process.execPath,[validator,file],{encoding:'utf8'});
 return {code:result.status,data:JSON.parse(result.stdout)};
}
let result=run('valid');assert.equal(result.code,0);assert.equal(result.data.valid,true);
result=run('no-ending',c=>{c.chapters.at(-1).ending=false;});assert.equal(result.code,1);assert.match(result.data.errors.join('\n'),/ending chapter/);
result=run('scroll-driven-actor',c=>{c.chapters[1].elements[2].motion.driver='scroll';});assert.equal(result.code,1);assert.match(result.data.errors.join('\n'),/must use time/);
result=run('floating-shadow',c=>{c.assets['hero-leaf'].shadow='contact';c.assets['hero-leaf'].contacts=[{x:.5,y:.9,width:.2}];});assert.equal(result.code,1);assert.match(result.data.errors.join('\n'),/cannot have floor shadows/);
result=run('shallow-depth',c=>{for(const e of c.chapters[1].elements)e.z=-5;});assert.equal(result.code,1);assert.match(result.data.errors.join('\n'),/depth span/);
result=run('forced-wait',c=>{c.transition.forcedWait=true;});assert.equal(result.code,1);assert.match(result.data.errors.join('\n'),/must be false/);
result=run('eased-autoplay',c=>{c.autoplay.constantSpeed=false;});assert.equal(result.code,1);assert.match(result.data.errors.join('\n'),/must be true/);
console.log('validator tests passed: valid + 6 required failures');
