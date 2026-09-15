// Pure, serializable calibration state. Never mutates an imported object.
import {validateConfig} from './validate.js';
export const clone=value=>structuredClone(value);
const forbidden=new Set(['__proto__','prototype','constructor']);
export function assertCalibrationConfig(config){
  function safe(value,path=''){
    if(typeof value==='number'&&!Number.isFinite(value))throw new Error(`${path}: non-finite number`);
    if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){
      if(forbidden.has(key))throw new Error(`Unsafe field: ${path}/${key}`);
      safe(child,`${path}/${key}`);
    }
  }
  safe(config);
  validateConfig(config);
  const finite=(n,p)=>{if(typeof n!=='number'||!Number.isFinite(n))throw new Error(`${p}: expected a finite number`);};
  const vector=(v,p)=>{if(!Array.isArray(v)||v.length!==3)throw new Error(`${p}: expected [x,y,z]`);v.forEach((n,i)=>finite(n,`${p}[${i}]`));};
  for(const key of ['fovDesktop','fovPortrait']){finite(config.style?.[key],key);if(config.style[key]<5||config.style[key]>120)throw new Error(`${key}: must be 5–120`);}
  for(const [id,a] of Object.entries(config.assets)){
    for(const key of ['width','height','centroidX','groundLine'])finite(a[key],`${id}.${key}`);
    if(a.width<=0||a.height<=0||a.centroidX<0||a.centroidX>1||a.groundLine<0||a.groundLine>1)throw new Error(`${id}: invalid size or anchor`);
    if(typeof a.file!=='string'||!a.file||/^(?:javascript|data|file):/i.test(a.file))throw new Error(`${id}: use a relative file path or HTTPS image URL`);
    if(a.atlas){const at=a.atlas;for(const k of ['cols','rows','frames'])if(!Number.isInteger(at[k])||at[k]<1)throw new Error(`${id}.atlas.${k}: expected positive integer`);if(at.frames>at.cols*at.rows)throw new Error(`${id}: atlas exceeds grid`);}
  }
  for(const c of config.chapters){
    if(!c.id||typeof c.id!=='string')throw new Error('Every chapter needs a stable id');
    for(const k of ['from','to','look'])vector(c.camera[k],`${c.id}.camera.${k}`);
    for(const k of ['from','to'])if(c.camera[k].every((n,i)=>n===c.camera.look[i]))throw new Error(`${c.id}: camera and look target must differ`);
    // The bundled runtime evaluates quadratic guide paths.
    if(c.guidePath.length!==3)throw new Error(`${c.id}: this starter supports exactly 3 guide control points`);
    c.guidePath.forEach((v,i)=>vector(v,`${c.id}.guidePath[${i}]`));
    const ids=new Set();
    for(const [i,e] of c.elements.entries()){
      for(const k of ['x','y','z','height'])finite(e[k],`${c.id}.elements[${i}].${k}`);
      if(e.height<=0)throw new Error('Height must be positive');
      if(e.width!==undefined){finite(e.width,'width');if(e.width<=0)throw new Error('Width must be positive');}
      if(e.id!==undefined){if(typeof e.id!=='string'||!e.id||ids.has(e.id))throw new Error(`${c.id}: duplicate or invalid instance id`);ids.add(e.id);}
    }
  }
  return true;
}
export function elementKeys(elements){
  const counts=new Map();
  return elements.map(e=>{const n=(counts.get(e.asset)||0)+1;counts.set(e.asset,n);return e.id?`id:${e.id}`:`asset:${e.asset}#${n}`;});
}
const escapeToken=s=>String(s).replaceAll('~','~0').replaceAll('/','~1');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function changesBetween(before,after,path=''){
  if(equal(before,after))return [];
  const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  if(plain(before)&&plain(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key=>changesBetween(before[key],after[key],`${path}/${escapeToken(key)}`));
  if(Array.isArray(before)&&Array.isArray(after)&&before.length===after.length){
    // An id reorder is structural; replace the collection so patch indexes remain safe.
    const identified=before.every(x=>plain(x)&&typeof x.id==='string')&&after.every(x=>plain(x)&&typeof x.id==='string');
    if(!identified||before.every((x,i)=>x.id===after[i].id))return before.flatMap((value,i)=>changesBetween(value,after[i],`${path}/${i}`));
  }
  return [{path,op:before===undefined?'add':after===undefined?'remove':'replace',...(before===undefined?{}:{before:clone(before)}),...(after===undefined?{}:{after:clone(after)})}];
}
export function fingerprint(value){
  const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const text=JSON.stringify(canonical(value));let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return `fnv1a-${(h>>>0).toString(16).padStart(8,'0')}`;
}
export function exportPatch(base,current){return {schema:'layered-world-calibration-patch/v1',baseFingerprint:fingerprint(base),changes:changesBetween(base,current)};}
export function applyPatch(base,patch){
  if(patch.schema!=='layered-world-calibration-patch/v1'||patch.baseFingerprint!==fingerprint(base)||!Array.isArray(patch.changes))throw new Error('Patch baseline does not match; apply it to the exact original config');
  let result=clone(base);
  for(const change of patch.changes){
    if(!['add','remove','replace'].includes(change.op)||typeof change.path!=='string')throw new Error('Invalid patch operation');
    const tokens=change.path===''?[]:change.path.slice(1).split('/').map(t=>t.replaceAll('~1','/').replaceAll('~0','~'));
    if(tokens.some(t=>forbidden.has(t)))throw new Error('Unsafe patch path');
    let parent=result;for(const key of tokens.slice(0,-1)){if(parent===null||typeof parent!=='object'||!Object.hasOwn(parent,key))throw new Error('Missing patch path');parent=parent[key];}
    const key=tokens.at(-1),old=tokens.length?parent[key]:result;
    if(change.op!=='add'&&!equal(old,change.before))throw new Error(`Patch conflict at ${change.path}`);
    if(change.op==='add'&&old!==undefined)throw new Error('Add target already exists');
    if(tokens.length===0){if(change.op==='remove')throw new Error('Cannot remove whole config');result=clone(change.after);}
    else if(change.op==='remove'){if(Array.isArray(parent))parent.splice(Number(key),1);else delete parent[key];}
    else parent[key]=clone(change.after);
  }
  assertCalibrationConfig(result);return result;
}
export function semanticDiff(base,current){
  const rows=[];
  const push=(scope,b,a)=>{for(const c of changesBetween(b,a))rows.push({scope,...c});};
  const oldIds=base.chapters.map(c=>c.id),newIds=current.chapters.map(c=>c.id);
  if(!equal(oldIds,newIds))rows.push({scope:'Chapter order',path:'',op:'replace',before:oldIds,after:newIds});
  for(const id of new Set([...oldIds,...newIds])){
    const b=base.chapters.find(c=>c.id===id),a=current.chapters.find(c=>c.id===id);
    if(!b||!a){push(`Chapter ${id}`,b,a);continue;}
    const {elements:be,...bc}=b,{elements:ae,...ac}=a;push(`Chapter ${id}`,bc,ac);
    const bk=elementKeys(be),ak=elementKeys(ae);
    if(!equal(bk,ak))rows.push({scope:`${id} / instance order`,path:'',op:'replace',before:bk,after:ak});
    for(const key of new Set([...bk,...ak]))push(`${id} / ${key}`,be[bk.indexOf(key)],ae[ak.indexOf(key)]);
  }
  const {chapters:unusedB,...b}=base,{chapters:unusedA,...a}=current;push('World',b,a);
  return rows;
}
export class CalibrationState{
  constructor(config){assertCalibrationConfig(config);this.original=clone(config);this.committed=clone(config);this.draft=null;this.draftBase=null;}
  get current(){return this.draft??this.committed;}
  get comparison(){return this.draftBase??this.original;}
  stage(config){assertCalibrationConfig(config);this.draftBase=clone(this.committed);this.draft=clone(config);}
  apply(){if(!this.draft)return;this.committed=clone(this.draft);this.draft=null;this.draftBase=null;}
  revert(){this.draft=null;this.draftBase=null;}
  patch(){return exportPatch(this.original,this.current);}
  diff(){return semanticDiff(this.comparison,this.current);}
}
