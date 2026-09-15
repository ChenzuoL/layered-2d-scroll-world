#!/usr/bin/env node
import fs from 'node:fs';

const file=process.argv[2];
if(!file){console.error('Usage: validate-scene-contract.mjs <scene-contract.json>');process.exit(2);}
let data;
try{data=JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){console.error(JSON.stringify({valid:false,errors:['Invalid JSON: '+error.message]}));process.exit(1);}
const errors=[],warnings=[];
const fail=(path,msg)=>errors.push(`${path}: ${msg}`);
const finite=(v,path)=>{if(typeof v!=='number'||!Number.isFinite(v))fail(path,'must be finite');};
const vector=(v,path)=>{if(!Array.isArray(v)||v.length!==3)return fail(path,'must be [x,y,z]');v.forEach((n,i)=>finite(n,`${path}[${i}]`));};
if(data.schema!=='layered-2d-scroll-world/v1')fail('schema','must be layered-2d-scroll-world/v1');
if(typeof data.title!=='string'||!data.title.trim())fail('title','required');
const chapters=data.chapters;
if(!Array.isArray(chapters)||chapters.length<3||chapters.length>10)fail('chapters','must contain 3-10 chapters');
const assets=data.assets;
if(!assets||typeof assets!=='object'||Array.isArray(assets))fail('assets','object required');
const assetIds=new Set(Object.keys(assets||{}));
const validCategories=new Set(['grounded','surface','airborne','underwater','band','actor']);
const forbiddenShadow=new Set(['surface','airborne','underwater','band']);
for(const [id,a] of Object.entries(assets||{})){
 const p=`assets.${id}`;
 if(typeof a.file!=='string'||!a.file)fail(p+'.file','required');
 if(!validCategories.has(a.category))fail(p+'.category','invalid category');
 for(const key of ['width','height']){finite(a[key],p+'.'+key);if(a[key]<=0)fail(p+'.'+key,'must be > 0');}
 for(const key of ['centroidX','groundLine']){finite(a[key],p+'.'+key);if(a[key]<0||a[key]>1)fail(p+'.'+key,'must be normalized 0..1');}
 if(forbiddenShadow.has(a.category)&&a.shadow!=='none')fail(p+'.shadow',`${a.category} assets cannot have floor shadows`);
 if(a.shadow==='contact'){
  if(!Array.isArray(a.contacts)||!a.contacts.length)fail(p+'.contacts','contact shadow needs measured points');
  for(const [i,c] of (a.contacts||[]).entries())for(const key of ['x','y','width']){finite(c[key],`${p}.contacts[${i}].${key}`);if(c[key]<0||c[key]>1)fail(`${p}.contacts[${i}].${key}`,'must be normalized 0..1');}
 }
}
const ids=new Set();let endingCount=0;
const autonomousTypes=new Set(['walk','run','cycle','fly','flap','nibble','hop','rain','wind','swim','bubble','sway']);
for(const [ci,c] of (chapters||[]).entries()){
 const p=`chapters[${ci}]`;
 if(typeof c.id!=='string'||!c.id)fail(p+'.id','required');else if(ids.has(c.id))fail(p+'.id','duplicate');else ids.add(c.id);
 if(c.ending){endingCount++;if(ci!==chapters.length-1)fail(p+'.ending','ending must be final');}
 if(!c.camera)fail(p+'.camera','required');else{
  vector(c.camera.from,p+'.camera.from');vector(c.camera.to,p+'.camera.to');vector(c.camera.look,p+'.camera.look');
  if(c.camera.from?.[2]<=c.camera.to?.[2])warnings.push(`${p}.camera: camera does not travel forward`);
 }
 if(!Array.isArray(c.guidePath)||c.guidePath.length<3)fail(p+'.guidePath','needs at least 3 points');else c.guidePath.forEach((v,i)=>vector(v,`${p}.guidePath[${i}]`));
 if(!Array.isArray(c.elements))fail(p+'.elements','array required');
 const zs=[];
 for(const [ei,e] of (c.elements||[]).entries()){
  const q=`${p}.elements[${ei}]`;
  if(!assetIds.has(e.asset))fail(q+'.asset','unknown asset');
  for(const key of ['x','y','z','height'])finite(e[key],q+'.'+key);
  if(e.height<=0)fail(q+'.height','must be > 0');
  zs.push(e.z);
  if(e.motion){
   if(autonomousTypes.has(e.motion.type)&&e.motion.driver!=='time')fail(q+'.motion.driver',`${e.motion.type} must use time`);
   if(!['time','scroll','guide'].includes(e.motion.driver))fail(q+'.motion.driver','invalid driver');
  }
 }
 if(!c.ending&&c.elements?.length>=3&&Math.max(...zs)-Math.min(...zs)<8)fail(p+'.elements','z depth span must be >= 8');
}
if(endingCount!==1)fail('chapters','exactly one final ending chapter required');
if(data.guide?.singleton!==true)fail('guide.singleton','must be true');
if(data.guide?.driver!=='guide')fail('guide.driver','must be guide');
if(!assetIds.has(data.guide?.asset))fail('guide.asset','unknown asset');
if(data.transition?.stableFraction<.75||data.transition?.stableFraction>.9)fail('transition.stableFraction','recommended range is 0.75..0.9');
if(data.transition?.forcedWait!==false)fail('transition.forcedWait','must be false');
const auto=data.autoplay||{};
if(auto.enabled){
 if(auto.constantSpeed!==true)fail('autoplay.constantSpeed','must be true');
 if(!(auto.secondsPerChapter>0))fail('autoplay.secondsPerChapter','must be > 0');
 if(auto.audioBlocksVisuals!==false)fail('autoplay.audioBlocksVisuals','must be false');
 if(auto.manualInputPauses!==true)fail('autoplay.manualInputPauses','must be true');
}
const narration=data.narration?.chapters;
if(!Array.isArray(narration)||narration.join(',')!==(chapters||[]).map(c=>c.id).join(','))fail('narration.chapters','must exactly match chapter order');
const result={valid:errors.length===0,errors,warnings,summary:{chapters:chapters?.length||0,assets:assetIds.size,ending:endingCount,autoplay:!!auto.enabled}};
console.log(JSON.stringify(result,null,2));if(errors.length)process.exit(1);
