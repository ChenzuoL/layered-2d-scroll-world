#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {applyPatch} from '../templates/starter/engine/calibration.js';
const [baseFile,patchFile,outputFile]=process.argv.slice(2);
if(!baseFile||!patchFile||!outputFile){console.error('Usage: apply-calibration.mjs <original-world.json> <world-changes.json> <output-world.json>');process.exit(2);}
try{
 if(fs.existsSync(outputFile))throw Error('Output already exists; choose a new path to preserve the original');
 const original=JSON.parse(fs.readFileSync(baseFile,'utf8')),patch=JSON.parse(fs.readFileSync(patchFile,'utf8'));
 const result=applyPatch(original,patch);fs.mkdirSync(path.dirname(path.resolve(outputFile)),{recursive:true});fs.writeFileSync(outputFile,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({ok:true,output:outputFile,changes:patch.changes.length}));
}catch(error){console.error(error.message);process.exit(1);}
