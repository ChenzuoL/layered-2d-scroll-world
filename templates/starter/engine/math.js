export const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
export function bezier3(points,t){const u=clamp(t),v=1-u;return points[0].map((_,i)=>v*v*points[0][i]+2*v*u*points[1][i]+u*u*points[2][i]);}
export function sceneState(index,progress,count,stable=.82){
 const p=clamp(progress,0,count),base=Math.min(Math.floor(p),count-1),local=p-base;
 const blend=base===count-1?0:smooth((local-stable)/(1-stable));
 if(index===base)return{visible:true,opacity:1-blend,local:clamp(local/stable)};
 if(index===base+1&&blend>0)return{visible:true,opacity:blend,local:0};
 return{visible:false,opacity:0,local:0};
}
