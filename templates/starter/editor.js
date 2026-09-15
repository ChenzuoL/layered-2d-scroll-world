import * as THREE from './vendor/three.module.min.js';
import {CalibrationState,assertCalibrationConfig,applyPatch,elementKeys,clone} from './engine/calibration.js';
import {bezier3} from './engine/math.js';
import {atlasRegion} from './engine/motions.js';
import {createShadows,updateShadows} from './engine/shadows.js';

const $=id=>document.getElementById(id);
const canvas=$('editor'),chapterSelect=$('chapter'),assetSelect=$('asset'),inspector=$('inspector');
let store,chapterId='',selection=null,mode='scene',cameraField='from',guidePoint=0,records=[],handles=[],drag=null,requestId=0,ready=false;
const textures=new Map(),alphaMaps=new Map();
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene(),group=new THREE.Group(),helpers=new THREE.Group();scene.add(group,helpers);
const previewCamera=new THREE.PerspectiveCamera(26,1,.1,500),overviewCamera=new THREE.PerspectiveCamera(45,1,.1,1000);
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const config=()=>store.current;
const chapter=()=>config().chapters.find(c=>c.id===chapterId);
const visualConfig=()=>$('compare').checked?store.comparison:config();
const visualChapter=()=>visualConfig().chapters.find(c=>c.id===chapterId);
const viewCamera=()=>$('view-mode').value==='overview'?overviewCamera:previewCamera;
const status=(text,error=false)=>{$('status').textContent=text;$('status').dataset.error=String(error);};
const text=(tag,value,className)=>{const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;};
function disposeGroup(g){for(const child of [...g.children]){child.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});g.remove(child);}}
const vertex=`varying vec2 vUv;varying float distanceToView;
void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.0);distanceToView=-p.z;gl_Position=projectionMatrix*p;}`;
const fragment=`uniform sampler2D map;uniform vec4 region;uniform vec3 paper;uniform float wash;varying vec2 vUv;varying float distanceToView;
void main(){vec4 c=texture2D(map,region.xy+vUv*region.zw);if(c.a<.02)discard;gl_FragColor=vec4(mix(c.rgb,paper,smoothstep(24.,70.,distanceToView)*wash),c.a);
#include <colorspace_fragment>
}`;

async function ensureTextures(data){
 const loader=new THREE.TextureLoader(),files=[...new Set(Object.values(data.assets).map(a=>a.file))];
 await Promise.all(files.map(async file=>{
  if(textures.has(file))return;
  const url=new URL(file,location.href);if(!['https:','http:'].includes(url.protocol))throw Error('Unsupported image URL');
  let texture;try{texture=await loader.loadAsync(url.href);}catch{throw Error(`Cannot load asset: ${file}. Put its image beside this tool or use a CORS-enabled HTTPS URL.`);}
  texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;textures.set(file,texture);
  try{const c=document.createElement('canvas'),image=texture.image;c.width=image.width;c.height=image.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);alphaMaps.set(file,{w:c.width,h:c.height,bytes:ctx.getImageData(0,0,c.width,c.height).data});}catch{alphaMaps.set(file,null);}
 }));
}
function populateChapters(){
 const desired=chapterId;chapterSelect.replaceChildren();
 for(const c of config().chapters)chapterSelect.add(new Option(c.label||c.id,c.id));
 chapterId=config().chapters.some(c=>c.id===desired)?desired:(config().chapters.find(c=>c.elements.length)?.id||config().chapters[0].id);
 chapterSelect.value=chapterId;selection=null;populateInstances();
}
function populateInstances(){
 assetSelect.replaceChildren(new Option('Select an instance',''));
 const keys=elementKeys(chapter().elements);
 chapter().elements.forEach((e,i)=>assetSelect.add(new Option(`${e.asset} · ${e.id||'#'+(i+1)}`,keys[i])));
 if(!keys.includes(selection))selection=null;
 assetSelect.value=selection||'';
}
function makeRecord(e,i,cfg,key){
 const a=cfg.assets[e.asset],height=e.height,width=e.width??height*a.width/a.height;
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({uniforms:{map:{value:textures.get(a.file)},region:{value:new THREE.Vector4(...atlasRegion(a,0))},paper:{value:new THREE.Color(cfg.style.background)},wash:{value:cfg.style.farWash??.25}},vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
 mesh.position.set(e.x+(.5-a.centroidX)*width,e.y+(a.groundLine-.5)*height,e.z);mesh.scale.set(width,height,1);mesh.renderOrder=1000+Math.round(e.z*10);
 mesh.userData={key,index:i,element:e,asset:a,frame:0};group.add(mesh);
 const shadows=createShadows(mesh,a,group);updateShadows(shadows,a,1);
 return {mesh,shadows,element:e,asset:a,key,index:i};
}
function rebuild({fit=false}={}){
 if(!store)return;
 disposeGroup(group);records=[];
 const cfg=visualConfig(),c=visualChapter();renderer.setClearColor(new THREE.Color(cfg.style.background));
 if(c){const keys=elementKeys(c.elements);records=c.elements.map((e,i)=>makeRecord(e,i,cfg,keys[i]));}
 $('empty').hidden=!!c?.elements.length;
 $('empty').textContent=c?'This chapter contains only the guide. Use Guide path to inspect it.':'This chapter is absent from the comparison baseline.';
 $('scene-badge').textContent=`${chapterId} · ${$('compare').checked?'BEFORE':'CURRENT'} · world coordinates`;
 updateCamera();if(fit)fitOverview();renderInspector();renderLayers();renderDiff();render();
}
function updateCamera(){
 const c=visualChapter()||chapter();const t=Number($('preview-time').value);
 previewCamera.fov=visualConfig().style.fovDesktop;previewCamera.position.fromArray(c.camera.from).lerp(new THREE.Vector3(...c.camera.to),t);previewCamera.lookAt(new THREE.Vector3(...c.camera.look));previewCamera.updateProjectionMatrix();previewCamera.updateMatrixWorld(true);
 $('preview-value').value=`${Math.round(t*100)}%`;
}
function fitOverview(){
 const box=new THREE.Box3();group.updateMatrixWorld(true);if(records.length)box.setFromObject(group);
 const c=visualChapter()||chapter();for(const v of [...c.guidePath,c.camera.from,c.camera.to,c.camera.look])box.expandByPoint(new THREE.Vector3(...v));
 const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
 const radius=Math.max(size.length()*.55,4),fov=THREE.MathUtils.degToRad(overviewCamera.fov/2);
 const distance=radius/Math.sin(Math.atan(Math.tan(fov)*Math.min(1,overviewCamera.aspect)));
 overviewCamera.position.copy(center).add(new THREE.Vector3(.8,.55,1).normalize().multiplyScalar(distance*1.08));overviewCamera.lookAt(center);overviewCamera.updateMatrixWorld(true);
}
function addLine(points,color,dashed=false){
 const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>p.isVector3?p:new THREE.Vector3(...p)));
 const material=dashed?new THREE.LineDashedMaterial({color,dashSize:.25,gapSize:.15,depthTest:false,transparent:true,opacity:.75}):new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.85});
 const line=new THREE.Line(geometry,material);line.computeLineDistances();line.renderOrder=30000;helpers.add(line);
}
function addHandle(vector,kind,index,color){
 const camera=viewCamera(),distance=new THREE.Vector3(...vector).distanceTo(camera.position);const radius=Math.max(.07,distance*.009);
 const sphere=new THREE.Mesh(new THREE.SphereGeometry(radius,12,8),new THREE.MeshBasicMaterial({color,depthTest:false,transparent:true,opacity:.95}));
 sphere.position.fromArray(vector);sphere.userData={kind,index};sphere.renderOrder=31000;helpers.add(sphere);handles.push(sphere);
}
function updateHelpers(){
 disposeGroup(helpers);handles=[];const c=visualChapter()||chapter();
 if($('show-helpers').checked){
  if(mode==='guide'||$('view-mode').value==='overview'){
   addLine(Array.from({length:65},(_,i)=>bezier3(c.guidePath,i/64)),0x2b947e);
   addLine(c.guidePath,0x80b1a0,true);c.guidePath.forEach((p,i)=>addHandle(p,'guide',i,i===guidePoint?0xe4a247:0x2b947e));
  }
  if(mode==='camera'||$('view-mode').value==='overview'){
   addLine([c.camera.from,c.camera.to],0x677ccc);addLine([c.camera.from,c.camera.look],0xa3aed9,true);addLine([c.camera.to,c.camera.look],0xa3aed9,true);
   for(const [i,key] of ['from','to','look'].entries())addHandle(c.camera[key],'camera',key,key===cameraField?0xe4a247:0x677ccc);
   if($('view-mode').value==='overview')for(const key of ['from','to']){
    const cam=previewCamera.clone();cam.position.fromArray(c.camera[key]);cam.lookAt(new THREE.Vector3(...c.camera.look));cam.far=3;cam.updateProjectionMatrix();cam.updateMatrixWorld(true);const helper=new THREE.CameraHelper(cam);helper.renderOrder=29000;helper.material.depthTest=false;helpers.add(helper);
   }
  }
 }
 const record=records.find(r=>r.key===selection);
 if(mode==='scene'&&record){record.mesh.updateMatrixWorld(true);const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5],[-.5,-.5]].map(([x,y])=>new THREE.Vector3(x,y,0).applyMatrix4(record.mesh.matrixWorld));addLine(corners,0xd2a352);}
}
function choose(key){selection=key;assetSelect.value=key||'';renderInspector();renderLayers();render();}
function editingElement(){const keys=elementKeys(chapter().elements);return chapter().elements[keys.indexOf(selection)];}
function fields(){
 if(mode==='camera'){const v=chapter().camera[cameraField];return ['x','y','z'].map((key,i)=>({key,label:key.toUpperCase(),get:()=>v[i],set:n=>v[i]=n}));}
 if(mode==='guide'){const v=chapter().guidePath[guidePoint];return ['x','y','z'].map((key,i)=>({key,label:key.toUpperCase(),get:()=>v[i],set:n=>v[i]=n}));}
 const e=editingElement();if(!e)return [];
 return ['x','y','z','height',...(e.width!==undefined?['width']:[])].map(key=>({key,label:key==='height'?'Height':key==='width'?'Width':key.toUpperCase(),get:()=>e[key],set:n=>{
  // Height is uniform scaling; preserve the explicit width/height ratio if present.
  if(key==='height'&&e.width!==undefined)e.width*=n/e.height;
  e[key]=n;
 }}));
}
function renderInspector(){
 inspector.replaceChildren();
 if(mode==='scene'&&!editingElement()){inspector.append(text('p','Select an instance to inspect or fine-tune it.','empty'));return;}
 const name=mode==='scene'?editingElement().asset:mode==='camera'?`Camera · ${cameraField}`:`Guide · P${guidePoint}`;
 inspector.append(text('p',name,'selected-name'));
 inspector.append(text('p',mode==='scene'?'Fixed world-space transform. Height scales uniformly.':mode==='guide'?'Green curve = quadratic path; middle point controls its bend.':'Purple markers = start, end and look target. Overview shows both frustums.','selected-meta'));
 for(const field of fields()){
  const row=document.createElement('label');row.className='field';row.append(text('span',field.label));
  const range=document.createElement('input'),number=document.createElement('input');range.type='range';number.type='number';range.step=number.step='.01';
  const initial=field.get(),positive=['height','width'].includes(field.key);
  range.min=positive?.05:Math.min(-100,initial-10);range.max=Math.max(positive?15:100,initial+10);if(positive)number.min='.01';
  range.value=number.value=initial;range.dataset.field=number.dataset.field=field.key;range.setAttribute('aria-label',`${name} ${field.label} slider`);number.setAttribute('aria-label',`${name} ${field.label}`);
  const prefix=mode==='scene'?'i':mode==='camera'?'c':'g';range.id=prefix+field.key;number.id=prefix+field.key+'-number';
  range.disabled=number.disabled=$('compare').checked;
  const change=event=>{
   const input=event.target;if(!input.isConnected||input.value==='')return;
   const value=Number(input.value);if(!Number.isFinite(value)||(positive&&value<=0)){input.setCustomValidity('Enter a finite positive size');input.reportValidity();return;}
   input.setCustomValidity('');const previous=clone(chapter());field.set(Math.round(value*10000)/10000);
   try{assertCalibrationConfig(config());}catch(error){Object.assign(chapter(),previous);renderInspector();status(error.message,true);return;}
   number.value=range.value=field.get();refreshTransforms();status('Local calibration changed. Export to keep it.');
  };
  range.addEventListener('input',change);number.addEventListener('change',change);row.append(range,number);inspector.append(row);
 }
 if($('compare').checked)inspector.append(text('p','Before view is read-only. Uncheck Before to edit.','copy-note'));
}
function refreshTransforms(){
 if(mode==='scene'){
  const record=records.find(r=>r.key===selection),e=editingElement();
  if(record&&e){const a=record.asset,w=e.width??e.height*a.width/a.height;record.element=e;record.mesh.position.set(e.x+(.5-a.centroidX)*w,e.y+(a.groundLine-.5)*e.height,e.z);record.mesh.scale.set(w,e.height,1);record.mesh.renderOrder=1000+Math.round(e.z*10);for(const s of record.shadows)s.mesh.renderOrder=record.mesh.renderOrder-.1;updateShadows(record.shadows,a,1);}
 }else updateCamera();
 renderLayers();renderDiff();render();
}
function renderLayers(){
 const list=$('layer-list');list.replaceChildren();
 for(const r of [...records].sort((a,b)=>b.element.z-a.element.z||a.index-b.index)){
  const layer=r.element.z>=-4?'front':r.element.z>=-20?'middle':'back';const button=document.createElement('button');button.className=`layer ${layer} ${r.key===selection?'selected':''}`;button.dataset.instance=r.key;
  button.append(text('span',`${r.element.asset} · ${r.element.id||'#'+(r.index+1)}`),text('span',`${layer}  z ${r.element.z.toFixed(2)}`,'depth'));
  button.onclick=()=>{setMode('scene');choose(r.key);};list.append(button);
 }
 if(!records.length)list.append(text('p','No scene planes. The guide path is still available.','empty'));
}
function displayValue(v){if(v===undefined)return '∅';const s=JSON.stringify(v);return s.length>230?s.slice(0,227)+'…':s;}
function renderDiff(){
 $('diff-heading').textContent=store.draft?'Draft vs current composition':'Changes from loaded config';const list=$('diff-list');list.replaceChildren();
 const rows=store.diff();
 for(const r of rows){const row=document.createElement('div');row.className='diff-row';row.append(text('strong',`${r.scope} ${r.path} · ${r.op}`),text('p',`${displayValue(r.before)} → ${displayValue(r.after)}`,'diff-values'));list.append(row);}
 if(!rows.length)list.append(text('p','No differences.','empty'));
 $('apply').disabled=$('revert').disabled=!store.draft;
 $('download-patch').disabled=store.patch().changes.length===0;
 $('counts').textContent=`${records.length} planes · ${rows.length} differences`;
}
function projectedBounds(record){
 record.mesh.updateMatrixWorld(true);
 const points=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,y])=>new THREE.Vector3(x,y,0).applyMatrix4(record.mesh.matrixWorld).project(previewCamera));
 if(points.some(p=>p.z>1||p.z< -1))return null;
 return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.max(...points.map(p=>p.y)),bottom:Math.min(...points.map(p=>p.y))};
}
function overlaps(){
 const rows=[];const boxes=records.map(r=>({r,b:projectedBounds(r)})).filter(x=>x.b);
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const a=boxes[i],b=boxes[j];const w=Math.min(a.b.right,b.b.right,1)-Math.max(a.b.left,b.b.left,-1),h=Math.min(a.b.top,b.b.top,1)-Math.max(a.b.bottom,b.b.bottom,-1);
  if(w<=0||h<=0)continue;
  const nearer=a.r.mesh.renderOrder>b.r.mesh.renderOrder?a.r:b.r,farther=nearer===a.r?b.r:a.r;
  rows.push({front:nearer.key,back:farther.key,frontLabel:`${nearer.element.asset} #${nearer.index+1}`,backLabel:`${farther.element.asset} #${farther.index+1}`});
 }
 return rows;
}
function renderOverlaps(){const list=$('occlusion-list');list.replaceChildren();for(const pair of overlaps())list.append(text('div',`${pair.frontLabel} → ${pair.backLabel}`,'overlap-row'));if(!list.children.length)list.append(text('p','No projected bounds overlap in this view.','empty'));}
function render(){if(!store)return;updateHelpers();renderer.render(scene,viewCamera());renderOverlaps();}
function setMode(next){mode=next;document.querySelectorAll('[data-target]').forEach(b=>{b.classList.toggle('active',b.dataset.target===mode);b.setAttribute('aria-pressed',String(b.dataset.target===mode));});$('asset-wrap').hidden=mode!=='scene';$('camera-mode-wrap').hidden=mode!=='camera';$('guide-point-wrap').hidden=mode!=='guide';renderInspector();render();}

function pointerRay(event){const b=canvas.getBoundingClientRect();pointer.set((event.clientX-b.left)/b.width*2-1,1-(event.clientY-b.top)/b.height*2);scene.updateMatrixWorld(true);viewCamera().updateMatrixWorld(true);raycaster.setFromCamera(pointer,viewCamera());}
function alphaHit(hit){const a=hit.object.userData.asset;if(!a||!hit.uv)return true;const data=alphaMaps.get(a.file);if(!data)return true;const region=atlasRegion(a,0);const u=region[0]+hit.uv.x*region[2],v=region[1]+hit.uv.y*region[3];const x=Math.max(0,Math.min(data.w-1,Math.floor(u*data.w))),y=Math.max(0,Math.min(data.h-1,Math.floor((1-v)*data.h)));return data.bytes[(y*data.w+x)*4+3]>24;}
function dragPoint(){if(mode==='scene'){const e=editingElement();return e?[e.x,e.y,e.z]:null;}return mode==='camera'?chapter().camera[cameraField]:chapter().guidePath[guidePoint];}
canvas.addEventListener('pointerdown',event=>{
 if(event.button!==0||!ready||$('compare').checked)return;
 pointerRay(event);
 if(mode==='scene'){
  const hit=raycaster.intersectObjects(records.map(r=>r.mesh)).filter(alphaHit).sort((a,b)=>b.object.renderOrder-a.object.renderOrder)[0];
  if(!hit){choose(null);return;}choose(hit.object.userData.key);
 }else{
  const hit=raycaster.intersectObjects(handles)[0];if(!hit)return;
  if(hit.object.userData.kind==='camera'){cameraField=hit.object.userData.index;$('camera-mode').value=cameraField;setMode('camera');}
  else{guidePoint=hit.object.userData.index;$('guide-point').value=String(guidePoint);setMode('guide');}
 }
 const point=dragPoint();if(!point)return;
 const plane=new THREE.Plane(new THREE.Vector3(0,0,1),-point[2]),hit=new THREE.Vector3();
 if(!raycaster.ray.intersectPlane(plane,hit))return;
 drag={pointer:event.pointerId,plane,start:hit.clone(),origin:[...point],previous:clone(chapter())};canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove',event=>{
 if(!drag||drag.pointer!==event.pointerId)return;pointerRay(event);const hit=new THREE.Vector3();if(!raycaster.ray.intersectPlane(drag.plane,hit))return;
 const x=Math.round((drag.origin[0]+hit.x-drag.start.x)*10000)/10000,y=Math.round((drag.origin[1]+hit.y-drag.start.y)*10000)/10000;
 if(mode==='scene'){const e=editingElement();e.x=x;e.y=y;}else{const point=dragPoint();point[0]=x;point[1]=y;}
 refreshTransforms();for(const input of inspector.querySelectorAll('[data-field]')){const f=fields().find(f=>f.key===input.dataset.field);if(f)input.value=f.get();}
});
function finishDrag(event){if(!drag||event.pointerId!==drag.pointer)return;const previous=drag.previous;drag=null;canvas.classList.remove('dragging');if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);try{assertCalibrationConfig(config());status('Position updated.');}catch(error){Object.assign(chapter(),previous);rebuild();status(error.message,true);}}
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,finishDrag);

async function importDraft(file){
 if(!file)return;const token=++requestId;$('import').disabled=true;
 try{
  if(file.size>5*1024*1024)throw Error('JSON exceeds 5 MB');const parsed=JSON.parse(await file.text());
  const candidate=parsed.schema==='layered-world-calibration-patch/v1'?applyPatch(store.original,parsed):parsed;
  assertCalibrationConfig(candidate);status('Validating and loading draft assets…');await ensureTextures(candidate);if(token!==requestId)return;
  store.stage(candidate);$('compare').checked=false;populateChapters();rebuild({fit:true});status('Draft loaded. Review Before / Current, then Apply or Revert.');
 }catch(error){status(`Draft rejected: ${error.message}`,true);}finally{if(token===requestId)$('import').disabled=false;$('import-file').value='';}
}
function download(name,value){const blob=new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status(`${name} downloaded. Source files have not been overwritten.`);}
$('import').onclick=()=>$('import-file').click();$('import-file').onchange=e=>importDraft(e.target.files[0]);
$('apply').onclick=()=>{store.apply();$('compare').checked=false;rebuild();status('Draft applied in this tab. Export to retain it.');};
$('revert').onclick=()=>{store.revert();$('compare').checked=false;populateChapters();rebuild({fit:true});status('Draft reverted; current composition restored.');};
$('download').onclick=()=>{try{assertCalibrationConfig(config());download('world.json',config());}catch(e){status(e.message,true);}};
$('download-patch').onclick=()=>{try{assertCalibrationConfig(config());download('world-changes.json',store.patch());}catch(e){status(e.message,true);}};
chapterSelect.onchange=()=>{chapterId=chapterSelect.value;selection=null;populateInstances();rebuild({fit:true});};assetSelect.onchange=()=>choose(assetSelect.value||null);
$('camera-mode').onchange=()=>{cameraField=$('camera-mode').value;renderInspector();render();};$('guide-point').onchange=()=>{guidePoint=Number($('guide-point').value);renderInspector();render();};
document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>setMode(b.dataset.target));
$('compare').onchange=()=>rebuild({fit:true});$('show-helpers').onchange=render;
$('view-mode').onchange=()=>{$('overview-zoom-wrap').hidden=$('view-mode').value!=='overview';if($('view-mode').value==='overview')fitOverview();render();};
$('overview-zoom').oninput=()=>{overviewCamera.zoom=Number($('overview-zoom').value);overviewCamera.updateProjectionMatrix();render();};
$('preview-time').oninput=()=>{updateCamera();render();};$('reset').onclick=()=>{if($('view-mode').value==='overview'){$('overview-zoom').value=1;overviewCamera.zoom=1;overviewCamera.updateProjectionMatrix();fitOverview();}else{$('preview-time').value=0;updateCamera();}render();};
function resize(){const box=canvas.parentElement.getBoundingClientRect();renderer.setSize(Math.max(1,box.width),Math.max(1,box.height),false);previewCamera.aspect=overviewCamera.aspect=box.width/Math.max(1,box.height);previewCamera.updateProjectionMatrix();overviewCamera.updateProjectionMatrix();if(store){updateCamera();if($('view-mode').value==='overview')fitOverview();render();}}
new ResizeObserver(resize).observe(canvas.parentElement);
window.addEventListener('beforeunload',event=>{if(store&&store.patch().changes.length){event.preventDefault();event.returnValue='';}});
async function load(){const response=await fetch('config/world.json');if(!response.ok)throw Error('Cannot load config/world.json');store=new CalibrationState(await response.json());await ensureTextures(config());populateChapters();resize();rebuild({fit:true});ready=true;status('Agent composition loaded');}
load().catch(error=>{console.error(error);status(error.message,true);});
window.calibration={
 inspect(){return {ready,chapterId,mode,selection,pendingDraft:!!store?.draft,before:$('compare').checked,view:$('view-mode').value,changes:store?.patch().changes,diff:store?.diff(),helpers:helpers.children.length,overlap:store?overlaps():[],config:store?clone(config()):null};},
 point(kind,key){const record=kind==='scene'?records.find(r=>r.key===key):handles.find(h=>h.userData.kind===kind&&String(h.userData.index)===String(key));const object=record?.mesh||record;if(!object)return null;const p=object.getWorldPosition(new THREE.Vector3()).project(viewCamera());const r=canvas.getBoundingClientRect();return {x:r.left+(p.x+1)/2*r.width,y:r.top+(1-p.y)/2*r.height};},
};
