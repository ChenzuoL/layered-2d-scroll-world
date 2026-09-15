import {clamp,smooth} from './math.js';
export function atlasRegion(asset,frame=0){const a=asset.atlas;if(!a)return[0,0,1,1];const col=frame%a.cols,row=Math.floor(frame/a.cols);return[col/a.cols,(a.rows-1-row)/a.rows,1/a.cols,1/a.rows];}
export function sampleMotion(spec,time,asset,phase=0,reduced=false){
 const result={x:0,y:0,rotation:0,bend:0,frame:0,facing:1,opacity:1};
 if(reduced)return result;
 for(const m of Array.isArray(spec)?spec:[spec].filter(Boolean)){
  const f=m.frequency??1,a=m.amplitude??0;
  if(m.type==='float'||m.type==='bob')result.y+=Math.sin(time*f+phase)*a;
  if(m.type==='drift')result.x+=Math.sin(time*f+phase)*a;
  if(m.type==='sway')result.rotation+=Math.sin(time*f+phase)*a;
  if(m.type==='bend')result.bend+=Math.sin(time*f+phase)*a+Math.sin(time*f*.43+phase*.7)*a*.35;
  if(m.type==='atlas-loop'){
   const fps=asset.atlas?.fps??m.fps??8,count=asset.atlas?.frames??1,duration=count/fps,rest=m.rest??0,p=time%(duration+rest);
   result.frame=p<duration?Math.min(count-1,Math.floor(p*fps)):0;
  }
  if(m.type==='patrol'){
   const duration=m.duration??8,hold=m.hold??1,leg=duration+hold,cycle=time%(2*leg),back=cycle>=leg,p=cycle%leg,u=smooth(p/duration),distance=m.distance??1;
   result.x+=distance*((back?1-u:u)-.5);result.facing=back?-1:1;
   if(asset.atlas&&p<duration)result.frame=Math.floor(u*asset.atlas.frames)%asset.atlas.frames;
  }
  if(m.type==='travel'){
   const duration=m.duration??20,u=(time/duration+(m.offset??0))%1,distance=m.distance??4;
   result.x+=distance*(u-.5);result.opacity*=smooth(u/.08)*(1-smooth((u-.92)/.08));
   if(asset.atlas)result.frame=Math.floor(time*(asset.atlas.fps??8))%asset.atlas.frames;
  }
 }
 return result;
}
