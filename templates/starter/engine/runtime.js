import * as THREE from '../vendor/three.module.min.js';
import {validateConfig} from './validate.js';
import {clamp,bezier3,sceneState} from './math.js';
import {atlasRegion,sampleMotion} from './motions.js';
import {createShadows,updateShadows} from './shadows.js';
import {progressAtTime,timeAtProgress,formatTime} from './timeline.js';

const vertex=`varying vec2 vUv;varying float vDistance;uniform float bend;uniform float rootY;
void main(){vUv=uv;vec3 p=position;float h=max(0.,p.y-rootY);p.x+=bend*h*h;vec4 mv=modelViewMatrix*vec4(p,1.);vDistance=-mv.z;gl_Position=projectionMatrix*mv;}`;
const fragment=`uniform sampler2D map;uniform vec4 region;uniform vec3 paper;uniform float wash;uniform float opacity;
varying vec2 vUv;varying float vDistance;
void main(){vec4 c=texture2D(map,region.xy+vUv*region.zw);if(c.a<.02)discard;vec3 color=mix(c.rgb,paper,smoothstep(24.,70.,vDistance)*wash);gl_FragColor=vec4(color,c.a*opacity);\n#include <colorspace_fragment>\n}`;

export class LayeredWorld{
 constructor({configUrl='config/world.json'}={}){
  this.configUrl=configUrl;this.ready=false;this.progress=0;this.active=0;this.elapsed=0;this.motionTime=0;this.last=performance.now();this.playing=false;this.pausedByUser=false;this.drag=null;this.pan={x:0,y:0,cx:0,cy:0,vx:0,vy:0};this.meshes=[];this.groups=[];this.cameras=[];this.textures=new Map();this.shadows=[];this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 }
 async mount(){
  const response=await fetch(this.configUrl);if(!response.ok)throw new Error('Cannot load '+this.configUrl);this.config=await response.json();validateConfig(this.config);
  this.applyTheme();this.buildDom();this.initThree();await this.loadTextures();this.buildScenes();this.bind();this.resize();
  this.elapsed=timeAtProgress(clamp(scrollY/this.unit,0,this.config.chapters.length),this.config.autoplay.secondsPerChapter,this.config.chapters.length);
  this.playing=!!this.config.autoplay.enabled&&!!this.config.autoplay.autoStart&&!this.reduced;
  this.ready=true;document.body.classList.add('ready');this.updateControls();this.frame(performance.now());
 }
 applyTheme(){const s=this.config.style,root=document.documentElement;root.style.setProperty('--paper',s.background);root.style.setProperty('--ink',s.ink);root.style.setProperty('--accent',s.accent);document.title=this.config.title;}
 buildDom(){
  const track=document.getElementById('track'),copy=document.getElementById('copy'),nav=document.getElementById('chapters');this.copies=[];this.dots=[];
  this.config.chapters.forEach((chapter,index)=>{
   const section=document.createElement('section');section.className='chapter';section.id=chapter.id;track.appendChild(section);
   const text=document.createElement('div');text.className=`copy ${chapter.align==='center'?'center':''} ${chapter.ending?'ending':''}`;text.innerHTML=`<p class="eyebrow">${chapter.eyebrow||''}</p><${index===0?'h1':'h2'} class="title">${chapter.title}</${index===0?'h1':'h2'}>`;copy.appendChild(text);this.copies.push(text);
   const dot=document.createElement('button');dot.className='dot';dot.title=chapter.label;dot.setAttribute('aria-label',chapter.label);dot.onclick=()=>this.go(index);nav.appendChild(dot);this.dots.push(dot);
  });
 }
 initThree(){
  this.canvas=document.getElementById('world');this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.autoClear=false;this.paper=new THREE.Color(this.config.style.background);this.renderer.setClearColor(this.paper);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.scene=new THREE.Scene();this.guideScene=new THREE.Scene();this.guideCamera=new THREE.OrthographicCamera(0,1,0,1,-10,10);this.plane=new THREE.PlaneGeometry(1,1);
 }
 async loadTextures(){
  const loader=new THREE.TextureLoader();const files=[...new Set(Object.values(this.config.assets).map(a=>a.file))];
  await Promise.all(files.map(async file=>{const texture=await loader.loadAsync(file);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;this.textures.set(file,texture);}));
 }
 material(asset){return new THREE.ShaderMaterial({uniforms:{map:{value:this.textures.get(asset.file)},region:{value:new THREE.Vector4(...atlasRegion(asset,0))},paper:{value:this.paper},wash:{value:this.config.style.farWash??.25},opacity:{value:1},bend:{value:0},rootY:{value:.5-asset.groundLine}},vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,side:THREE.DoubleSide});}
 buildScenes(){
  for(const [chapterIndex,chapter] of this.config.chapters.entries()){
   const group=new THREE.Group();this.scene.add(group);this.groups.push(group);
   const camera=new THREE.PerspectiveCamera(this.config.style.fovDesktop,innerWidth/innerHeight,.1,250);this.cameras.push(camera);
   for(const [index,element] of chapter.elements.entries()){
    const asset=this.config.assets[element.asset],motions=Array.isArray(element.motion)?element.motion:[element.motion].filter(Boolean);const bends=motions.some(m=>m.type==='bend');
    const height=element.height,width=element.width??height*asset.width/asset.height;
    const mesh=new THREE.Mesh(bends?new THREE.PlaneGeometry(1,1,8,16):this.plane,this.material(asset));
    const base=new THREE.Vector3(element.x+(0.5-asset.centroidX)*width,element.y+(asset.groundLine-.5)*height,element.z);
    mesh.position.copy(base);mesh.scale.set(width,height,1);mesh.renderOrder=1000+Math.round(element.z*10);mesh.userData={chapter:chapterIndex,element,asset,motions,base,width,height,phase:index*1.73,frame:0};group.add(mesh);this.meshes.push(mesh);
    const records=createShadows(mesh,asset,group);if(records.length)this.shadows.push({records,asset,source:mesh});
   }
  }
  const guideAsset=this.config.assets[this.config.guide.asset];this.guide=new THREE.Mesh(this.plane,new THREE.MeshBasicMaterial({map:this.textures.get(guideAsset.file),transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide}));this.guide.renderOrder=2;this.guideScene.add(this.guide);
 }
 bind(){
  this.playButton=document.getElementById('play');this.soundButton=document.getElementById('sound');this.speed=document.getElementById('speed');this.time=document.getElementById('time');this.reset=document.getElementById('reset');
  const audioConfig=this.config.autoplay.audio;if(audioConfig?.track){this.audio=new Audio(audioConfig.track);this.audio.preload='auto';this.audio.muted=this.config.autoplay.defaultMuted!==false;this.soundButton.hidden=false;}else this.audio=null;
  this.playButton.onclick=()=>{this.playing?this.pause(false):this.play();};
  this.soundButton.onclick=async()=>{if(!this.audio)return;this.audio.muted=!this.audio.muted;if(!this.audio.muted){this.audio.currentTime=this.elapsed;try{await this.audio.play();}catch{this.audio.muted=true;}}this.updateControls();};
  this.speed.onchange=()=>{if(this.audio)this.audio.playbackRate=Number(this.speed.value);};this.reset.onclick=()=>{this.pan.x=this.pan.y=this.pan.vx=this.pan.vy=0;};
  addEventListener('resize',()=>this.resize());addEventListener('wheel',()=>this.takeOver(),{passive:true});addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)&&!event.target.closest('button,select'))this.takeOver();});
  addEventListener('scroll',()=>{if(this.playing&&Math.abs(scrollY/this.unit-this.progress)>.03)this.takeOver();},{passive:true});
  this.canvas.addEventListener('pointerdown',event=>this.pointerDown(event));this.canvas.addEventListener('pointermove',event=>this.pointerMove(event));for(const type of ['pointerup','pointercancel','lostpointercapture'])this.canvas.addEventListener(type,event=>this.pointerUp(event));
 }
 pointerDown(event){if(event.button!==0)return;this.takeOver();this.drag={id:event.pointerId,x:event.clientX,y:event.clientY,sx:event.clientX,sy:event.clientY,type:event.pointerType,engaged:event.pointerType==='mouse',at:performance.now()};if(this.drag.engaged){this.canvas.setPointerCapture(event.pointerId);this.canvas.classList.add('dragging');}}
 pointerMove(event){if(!this.drag||event.pointerId!==this.drag.id)return;const dx=event.clientX-this.drag.x,dy=event.clientY-this.drag.y;if(!this.drag.engaged){const x=event.clientX-this.drag.sx,y=event.clientY-this.drag.sy;if(Math.abs(y)>Math.abs(x)&&Math.abs(y)>8){this.drag=null;return;}if(Math.abs(x)<8)return;this.drag.engaged=true;this.canvas.setPointerCapture(event.pointerId);this.canvas.classList.add('dragging');}const now=performance.now(),dt=Math.max(.008,(now-this.drag.at)/1000),interaction=this.config.interaction;this.pan.x=clamp(this.pan.x+dx/innerWidth,-interaction.dragX,interaction.dragX);this.pan.y=clamp(this.pan.y+dy/innerHeight,-interaction.dragY,interaction.dragY);this.pan.vx=clamp(dx/innerWidth/dt,-.12,.12);this.pan.vy=clamp(dy/innerHeight/dt,-.1,.1);Object.assign(this.drag,{x:event.clientX,y:event.clientY,at:now});}
 pointerUp(event){if(!this.drag||event.pointerId!==this.drag.id)return;this.drag=null;this.canvas.classList.remove('dragging');if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);}
 takeOver(){if(this.playing)this.pause(true);}
 play(){if(this.elapsed>=this.total)this.elapsed=0;else if(this.pausedByUser)this.elapsed=timeAtProgress(scrollY/this.unit,this.config.autoplay.secondsPerChapter,this.config.chapters.length);this.playing=true;this.pausedByUser=false;this.last=performance.now();if(this.audio&&!this.audio.muted){this.audio.currentTime=this.elapsed;this.audio.playbackRate=Number(this.speed.value);this.audio.play().catch(()=>{this.audio.muted=true;this.updateControls();});}this.updateControls();}
 pause(manual=true){this.playing=false;this.pausedByUser=manual;this.audio?.pause();this.updateControls();}
 go(index){this.takeOver();scrollTo({top:index*this.unit,behavior:this.reduced?'instant':'smooth'});}
 get total(){return this.config.autoplay.secondsPerChapter*this.config.chapters.length;}
 resize(){const old=this.unit||1,p=scrollY/old,w=innerWidth,h=innerHeight,mobile=w<700;this.unit=h*(this.config.interaction.scrollScreensPerChapter??1.45);document.getElementById('track').style.height=`${this.unit*this.config.chapters.length+h}px`;[...document.querySelectorAll('.chapter')].forEach((e,i)=>{e.style.top=i*this.unit+'px';e.style.height=h+'px';});this.renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.5:2));this.renderer.setSize(w,h,false);for(const c of this.cameras){c.aspect=w/h;c.fov=mobile?this.config.style.fovPortrait:this.config.style.fovDesktop;c.updateProjectionMatrix();}this.guideCamera.right=w;this.guideCamera.bottom=h;this.guideCamera.updateProjectionMatrix();if(this.ready&&old!==this.unit)scrollTo({top:p*this.unit,behavior:'instant'});}
 cameraFor(index,state){const chapter=this.config.chapters[index],camera=this.cameras[index];camera.position.fromArray(chapter.camera.from).lerp(new THREE.Vector3(...chapter.camera.to),state.local);const look=new THREE.Vector3(...chapter.camera.look),distance=camera.position.z-look.z,viewHeight=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*distance,dx=-this.pan.cx*viewHeight*camera.aspect,dy=this.pan.cy*viewHeight;camera.position.x+=dx;camera.position.y+=dy;look.x+=dx;look.y+=dy;camera.lookAt(look);camera.updateMatrixWorld(true);return camera;}
 guidePoint(index,local){const chapter=this.config.chapters[index],world=new THREE.Vector3(...bezier3(chapter.guidePath,local)),camera=this.cameras[index],ndc=world.clone().project(camera),distance=-world.clone().applyMatrix4(camera.matrixWorldInverse).z,asset=this.config.assets[this.config.guide.asset];return{x:(ndc.x+1)/2,y:(1-ndc.y)/2,size:clamp(innerHeight*.9/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*distance),36,110),ratio:asset.width/asset.height};}
 frame(now){if(!this.ready)return;const dt=Math.max(0,(now-this.last)/1000);this.last=now;const rate=Number(this.speed?.value||1);if(this.playing){this.elapsed=Math.min(this.total,this.elapsed+dt*rate);this.progress=progressAtTime(this.elapsed,this.config.autoplay.secondsPerChapter,this.config.chapters.length);scrollTo({top:this.progress*this.unit,behavior:'instant'});if(this.audio&&!this.audio.muted&&this.audio.readyState>=2&&Math.abs(this.audio.currentTime-this.elapsed)>.3)this.audio.currentTime=this.elapsed;if(this.elapsed>=this.total)this.pause(false);}else{const target=clamp(scrollY/this.unit,0,this.config.chapters.length);this.progress=this.reduced?target:this.progress+(target-this.progress)*(1-Math.exp(-Math.min(dt,.25)/.105));}
  if(!document.hidden&&!this.reduced)this.motionTime+=Math.min(dt,.25);if(!this.drag&&this.config.interaction.inertia){this.pan.x+=this.pan.vx*dt;this.pan.y+=this.pan.vy*dt;this.pan.vx*=Math.exp(-dt*11);this.pan.vy*=Math.exp(-dt*11);}const damp=1-Math.exp(-Math.min(dt,.25)*18);this.pan.cx+=(this.pan.x-this.pan.cx)*damp;this.pan.cy+=(this.pan.y-this.pan.cy)*damp;this.reset.disabled=Math.abs(this.pan.x)+Math.abs(this.pan.y)<.001;
  const states=this.config.chapters.map((_,i)=>sceneState(i,this.progress,this.config.chapters.length,this.config.transition.stableFraction));let base=Math.min(Math.floor(this.progress),this.config.chapters.length-1),local=this.progress-base,blend=base===this.config.chapters.length-1?0:clamp((local-this.config.transition.stableFraction)/(1-this.config.transition.stableFraction));this.active=blend>.5?Math.min(base+1,this.config.chapters.length-1):base;
  this.copies.forEach((copy,i)=>{const opacity=i===base?1-blend:i===base+1?blend:0;copy.style.opacity=opacity;copy.style.visibility=opacity>.01?'visible':'hidden';this.dots[i].classList.toggle('active',i===this.active);});
  for(const [i,state] of states.entries())this.cameraFor(i,state);
  for(const mesh of this.meshes){const d=mesh.userData,state=states[d.chapter];mesh.visible=state.visible;if(!state.visible)continue;const motion=sampleMotion(d.motions,this.motionTime,d.asset,d.phase,this.reduced);d.frame=motion.frame;mesh.position.copy(d.base);mesh.position.x+=motion.x;mesh.position.y+=motion.y;mesh.rotation.z=motion.rotation;mesh.scale.set(d.width*motion.facing,d.height,1);mesh.material.uniforms.region.value.set(...atlasRegion(d.asset,motion.frame));mesh.material.uniforms.bend.value=motion.bend;mesh.material.uniforms.opacity.value=state.opacity*motion.opacity;}
  for(const shadow of this.shadows)updateShadows(shadow.records,shadow.asset,shadow.source.material.uniforms.opacity.value);
  let current=this.guidePoint(base,clamp(local/this.config.transition.stableFraction));if(blend>0){const next=this.guidePoint(base+1,0);current={x:current.x+(next.x-current.x)*blend,y:current.y+(next.y-current.y)*blend,size:current.size+(next.size-current.size)*blend,ratio:current.ratio};}this.guide.position.set(current.x*innerWidth+this.pan.cx*innerWidth*.25,current.y*innerHeight+this.pan.cy*innerHeight*.25,0);this.guide.scale.set(current.size*current.ratio,-current.size,1);this.guide.rotation.z=Math.sin(this.motionTime*.7)*.05;
  this.renderer.clear();for(const [i,state] of states.entries()){if(!state.visible)continue;this.groups.forEach((g,k)=>g.visible=k===i);this.renderer.clearDepth();this.renderer.render(this.scene,this.cameras[i]);}this.renderer.clearDepth();this.renderer.render(this.guideScene,this.guideCamera);document.getElementById('bar').style.transform=`scaleX(${this.progress/this.config.chapters.length})`;this.time.textContent=`${formatTime(this.elapsed)} / ${formatTime(this.total)}`;this.updateControls();requestAnimationFrame(t=>this.frame(t));
 }
 updateControls(){if(!this.playButton)return;const label=this.playing?'Pause journey':this.elapsed>=this.total?'Replay journey':'Start journey',signature=`${label}:${this.audio?.muted}`;if(signature===this.controlState)return;this.controlState=signature;this.playButton.setAttribute('aria-label',label);this.playButton.innerHTML=`<i data-lucide="${this.playing?'pause':this.elapsed>=this.total?'rotate-ccw':'play'}"></i><span>${label}</span>`;if(this.audio){this.soundButton.innerHTML=`<i data-lucide="${this.audio.muted?'volume-x':'volume-2'}"></i>`;this.soundButton.setAttribute('aria-pressed',String(this.audio.muted));}window.lucide.createIcons();}
 inspect(){return{ready:this.ready,progress:this.progress,active:this.active,playing:this.playing,elapsed:this.elapsed,motionTime:this.motionTime,guideCount:this.guideScene.children.length,pan:{...this.pan},chapters:this.config.chapters.map(c=>c.id),meshes:this.meshes.map(m=>({asset:m.userData.element.asset,chapter:m.userData.chapter,position:m.position.toArray(),frame:m.userData.frame,visible:m.visible}))};}
}
