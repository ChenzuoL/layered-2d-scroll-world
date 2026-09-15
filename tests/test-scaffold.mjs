import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'layered-scaffold-'));
const script=path.resolve(import.meta.dirname,'../scripts/scaffold.mjs');
const run=spawnSync(process.execPath,[script,'sample-world','Sample World','--root',root,'--no-init'],{encoding:'utf8'});
assert.equal(run.status,0,run.stderr);
const result=JSON.parse(run.stdout),dir=path.join(root,result.workRef);
assert.ok(fs.existsSync(path.join(dir,'index.html')));
assert.ok(fs.existsSync(path.join(dir,'engine/runtime.js')));
assert.ok(fs.existsSync(path.join(dir,'vendor/three.module.min.js')));
assert.ok(fs.readdirSync(path.join(dir,'assets/sample')).length>=10);
assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'config/world.json'))).title,'Sample World');
const second=spawnSync(process.execPath,[script,'sample-world','Again','--root',root,'--no-init'],{encoding:'utf8'});assert.notEqual(second.status,0);assert.match(second.stderr,/already exists/);
const bad=spawnSync(process.execPath,[script,'Bad Slug','Bad','--root',root,'--no-init'],{encoding:'utf8'});assert.equal(bad.status,2);assert.match(bad.stderr,/kebab-case/);
console.log('scaffold tests passed:',result.workRef);
