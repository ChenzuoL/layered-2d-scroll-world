import * as THREE from '../vendor/three.module.min.js';
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragment=`uniform float opacity;varying vec2 vUv;void main(){vec2 d=(vUv-.5)*2.;float r=dot(d,d);float a=exp(-r*3.)*(1.-smoothstep(.55,1.,r));gl_FragColor=vec4(vec3(.25,.28,.24),a*opacity);}`;
export function createShadows(source,asset,group){
 if(asset.shadow!=='contact'||!asset.contacts?.length)return[];
 return asset.contacts.map(()=>{const material=new THREE.ShaderMaterial({uniforms:{opacity:{value:0}},vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,side:THREE.DoubleSide});const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);mesh.renderOrder=source.renderOrder-.1;group.add(mesh);return{mesh,source};});
}
const point=new THREE.Vector3();
export function updateShadows(records,asset,opacity){
 const contacts=asset.contactsByFrame?.[records[0]?.source.userData.frame??0]??asset.contacts??[];
 for(let i=0;i<records.length;i++){
  const {mesh,source}=records[i],c=contacts[i];mesh.visible=source.visible&&!!c;if(!c)continue;
  source.updateMatrixWorld(true);point.set(c.x-.5,.5-c.y,0).applyMatrix4(source.matrixWorld);mesh.parent.worldToLocal(point);
  mesh.position.copy(point);mesh.position.y-=.004;mesh.position.z-=.002;
  const width=Math.abs(source.scale.x)*c.width;mesh.scale.set(Math.max(.04,width*1.2),Math.min(.065,Math.max(.024,width*.1)),1);mesh.material.uniforms.opacity.value=opacity*.2;
 }
}
