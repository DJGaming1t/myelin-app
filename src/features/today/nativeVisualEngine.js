
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

export const CHALK_STAGE_HEX = '#151514';
export const CHALK_STAGE_RGB = 0x151514;
export const CHALK_CREAM_HEX = '#F2E7D0';
export const CHALK_CREAM_RGB = 0xF2E7D0;
export const CHALK_PROGRESS_HEX = '#7E98A4';
export const CHALK_PROGRESS_RGB = 0x7E98A4;
export const CHALK_ACCENT_HEX = '#9BB8C6';
export const CHALK_ACCENT_RGB = 0x9BB8C6;

const CREAM_RGB_NORM = Object.freeze([0.9490, 0.9059, 0.8157]); // #F2E7D0
const PROGRESS_RGB_NORM = Object.freeze([0.4941, 0.5961, 0.6431]); // #7E98A4
const ACCENT_RGB_NORM = Object.freeze([0.6078, 0.7216, 0.7765]); // #9BB8C6

export function getBottleMeniscusNormalizedY(percent) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
  // Maps 0..100% bottle fill to normalized screen Y [0.76 (bottom) .. 0.26 (top)]
  return Number((0.76 - clamped * 0.50).toFixed(4));
}

// Bundled module: completion.mjs
const {COMPLETION_RGB, SECTOR_SEGMENTS, sectorIndexCount} = (()=>{
/** Shared visual language for material-based completion indicators. */
const COMPLETION_HEX = CHALK_PROGRESS_HEX;
const COMPLETION_RGB = CHALK_PROGRESS_RGB;
const SECTOR_SEGMENTS = 240;
const clampPercent = value => Math.max(0,Math.min(100,Number(value)||0));
const secondsFromPercent = value => clampPercent(value) * 0.6;
/** THREE.BufferGeometry.setDrawRange takes vertices, not triangles. */
function sectorIndexCount(value,segments=SECTOR_SEGMENTS){
 return Math.round(clampPercent(value)/100*segments)*3;
}

return {COMPLETION_RGB, SECTOR_SEGMENTS, sectorIndexCount};
})();

// Each object returns to a deliberate resting pose when it becomes visible.
const DEFAULT_POSES = Object.freeze({
  brain: {yaw:.38,pitch:-.10,scale:1},
  bottle: {yaw:.38,pitch:-.12,scale:1.05},
  stopwatch: {yaw:.53,pitch:-.26,scale:1},
  cube: {yaw:.59,pitch:.38,scale:.83},
  chess: {yaw:.30,pitch:-.08,scale:.78},
});
function easeInOutCubic(t){
  const v=Math.max(0,Math.min(1,t));
  return v<.5?4*v*v*v:1-Math.pow(-2*v+2,3)/2;
}

// Bundled module: progress-reveal.mjs
const {PROGRESS_REVEAL_MS, getRevealProgress, CUBE_REVEAL_MS, getCubeRevealDuration, getCubeRevealProgress, easeOutCubic} = (()=>{
/** Visual-only progress reveal used after the quick spin. */
const PROGRESS_REVEAL_MS = 420;
function easeOutCubic(t){
 const v=Math.min(1,Math.max(0,Number(t)||0));
 return 1-(1-v)**3;
}
function getRevealProgress(savedProgress, elapsedMs, durationMs=PROGRESS_REVEAL_MS){
 const target=Math.min(100,Math.max(0,Number(savedProgress)||0));
 const duration=Math.max(1,durationMs);
 return target*easeOutCubic(elapsedMs/duration);
}

/** Fast reveal: short enough to feel snappy, with visible legal quarter turns. */
const CUBE_REVEAL_MS = 510;
function getCubeRevealDuration(saved){
 const p=Math.min(100,Math.max(0,Number(saved)||0));
 return Math.max(160,Math.round(CUBE_REVEAL_MS*(.12+.88*p/100)));
}
function getCubeRevealProgress(saved,elapsed){
 const target=Math.min(100,Math.max(0,Number(saved)||0));
 const duration=getCubeRevealDuration(target);
 const t=Math.min(1,Math.max(0,(Number(elapsed)||0)/duration));
 return target*t;
}

return {PROGRESS_REVEAL_MS, getRevealProgress, CUBE_REVEAL_MS, getCubeRevealDuration, getCubeRevealProgress, easeOutCubic};
})();

// Bundled module: liquid-motion.mjs
const {LiquidMotion, getFluidTransform} = (()=>{
/** Lightweight gesture-driven water inertia; no fluid simulation or dependency. */
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
const finite = (v,fallback=0) => Number.isFinite(v) ? v : fallback;
const angleDelta = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));

class LiquidMotion {
  constructor(){ this.reset(); }
  reset(yaw=null,pitch=null){
    this.tiltX=0;this.tiltZ=0;this.velocityX=0;this.velocityZ=0;
    this.yaw=yaw;this.pitch=pitch;
    return {tiltX:0,tiltZ:0,wave:0};
  }
  // dtMs is elapsed wall-clock time; angles are the bottle group's current yaw and pitch.
  update(dtMs,{yaw=0,pitch=0,reducedMotion=false}={}){
    const y=finite(yaw),p=finite(pitch);
    if(reducedMotion)return this.reset(y,p);
    const dt=clamp(finite(dtMs,16),0,48)/1000;
    if(this.yaw===null){this.yaw=y;this.pitch=p;}
    const dyaw=clamp(angleDelta(y,this.yaw),-.20,.20);
    const dpitch=clamp(angleDelta(p,this.pitch),-.20,.20);
    this.yaw=y;this.pitch=p;
    // Rotational change imparts momentum, but the water then returns to its rest surface.
    this.velocityX=clamp(this.velocityX-dpitch*11.4,-2.9,2.9);
    this.velocityZ=clamp(this.velocityZ+dyaw*5.8,-2.2,2.2);
    // Spring + damping: around 0.8–1.4 s for the liquid to settle after a gesture.
    const stiffness=55,damping=9.3;
    this.velocityX+=(-stiffness*this.tiltX-damping*this.velocityX)*dt;
    this.velocityZ+=(-stiffness*this.tiltZ-damping*this.velocityZ)*dt;
    this.tiltX=clamp(this.tiltX+this.velocityX*dt,-.30,.30);
    this.tiltZ=clamp(this.tiltZ+this.velocityZ*dt,-.30,.30);
    const wave=clamp(Math.hypot(this.tiltX,this.tiltZ)*.15 + Math.hypot(this.velocityX,this.velocityZ)*.023,0,.072);
    return {tiltX:this.tiltX,tiltZ:this.tiltZ,wave};
  }
  nudge(){
    this.velocityX=clamp(this.velocityX+1.05,-2.9,2.9);
    this.velocityZ=clamp(this.velocityZ-.48,-2.2,2.2);
  }
}

/** Transform for the *entire* liquid volume, not only its top surface.
 * The fluid stays visually contained by keeping the transform modest.
 */
function getFluidTransform(motion,fillPercent=0.5){
 const f=clamp(finite(fillPercent,.5),0,1);
 const room=1-.32*f;
 const tiltX=clamp(finite(motion.tiltX),-.30,.30)*room;
 const tiltZ=clamp(finite(motion.tiltZ),-.30,.30)*room;
 const wave=clamp(finite(motion.wave),0,.1);
 return {
  rotationX:tiltZ*.94,
  rotationZ:tiltX*.94,
  x:tiltX*.22,
  z:tiltZ*.22,
  y:-wave*.13,
 };
}

return {LiquidMotion, getFluidTransform};
})();

// Bundled module: liquid-surface.mjs
const {surfaceDisplacement, fluidHeightDelta, deformFluidPoint} = (()=>{
/** Surface-led liquid motion. The bottom stays anchored; waves concentrate
 * near the top of the water rather than shaking the whole volume rigidly.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=v=>Number.isFinite(v)?v:0;
function surfaceDisplacement(x,z,motion,fillPercent=.5,phase=0){
 const f=clamp(finite(fillPercent),0,1),room=clamp(1-.5*f,.52,1);
 const tx=clamp(finite(motion?.tiltX),-.3,.3),tz=clamp(finite(motion?.tiltZ),-.3,.3);
 const wave=clamp(finite(motion?.wave),0,.1);
 const slope=.38*room*(tx*x+tz*z)/.465;
 const ripple=wave*.22*room*Math.sin(finite(phase)+x*8+z*5);
 return clamp(slope+ripple,-.145,.145);
}
function fluidHeightDelta(x,y,z,motion,yBottom,fillHeight,phase=0,fillPercent=.5){
 const h=Math.max(.001,fillHeight-yBottom);
 const u=clamp((y-yBottom)/h,0,1);
 if(u<.24)return 0;
 const envelope=u*u*u*u;
 return envelope*surfaceDisplacement(x,z,motion,fillPercent,phase);
}
function deformFluidPoint(x,y,z,motion,yBottom,fillHeight,phase=0,fillPercent=.5){
 return [x,y+fluidHeightDelta(x,y,z,motion,yBottom,fillHeight,phase,fillPercent),z];
}

return {surfaceDisplacement, fluidHeightDelta, deformFluidPoint};
})();

// Bundled module: hand-motion.mjs
const {HandMotion} = (()=>{
/** Damped physical hand motion with restrained overshoot; 100% = one revolution. */
const handClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
class HandMotion {
 constructor(initialPercent=0){this.angle=0;this.targetAngle=0;this.velocity=0;this.snap(initialPercent);}
 static angleFromPercent(percent){
  const value=handClamp(Number.isFinite(percent)?percent:0,0,100);
  return value===0?0:-Math.PI*2*value/100;
 }
 setTarget(percent){this.targetAngle=HandMotion.angleFromPercent(percent);}
 snap(percent){this.targetAngle=HandMotion.angleFromPercent(percent);this.angle=this.targetAngle;this.velocity=0;return this.angle;}
 // End-of-reveal impulse makes the hand visibly click into its final marker.
 kick(){
  const direction = this.targetAngle===0 ? 1 : -1;
  this.velocity += direction*5.8;
 }
 update(dtMs,{reducedMotion=false}={}){
  if(reducedMotion){this.angle=this.targetAngle;this.velocity=0;return this.angle;}
  const elapsed=handClamp(Number.isFinite(dtMs)?dtMs:16,0,64)/1000;
  // Use substeps for predictable motion on both 60 Hz and slower devices.
  let remaining=elapsed;
  while(remaining>0){
   const dt=Math.min(remaining,1/120);
   const stiffness=440;
   const damping=23;
   const acceleration=stiffness*(this.targetAngle-this.angle)-damping*this.velocity;
   this.velocity+=acceleration*dt;
   this.angle+=this.velocity*dt;
   remaining-=dt;
  }
  if(Math.abs(this.targetAngle-this.angle)<.00035 && Math.abs(this.velocity)<.006){
   this.angle=this.targetAngle;this.velocity=0;
  }
  return this.angle;
 }
}

return {HandMotion};
})();

// Bundled module: watch-reveal.mjs
const {getWatchHandProgress} = (()=>{
/** Immediate stopwatch response: slight early momentum, no late bounce.
 * From 45% of the reveal onward, hand and cyan sector are exactly aligned.
 */
function getWatchHandProgress(savedProgress,elapsedMs,durationMs=560){
 const target=Math.max(0,Math.min(100,Number(savedProgress)||0));
 const t=Math.max(0,Math.min(1,(Number(elapsedMs)||0)/Math.max(1,durationMs)));
 const base=target*(1-(1-t)**3);
 const phase=Math.min(1,t/.45);
 const earlyLead=t<.45 && target>0 ? Math.min(1.8,target*.036)*Math.sin(Math.PI*phase) : 0;
 return base+earlyLead;
}

return {getWatchHandProgress};
})();

// Bundled module: cube-logic.mjs
const {COLORS, SCRAMBLE, CUBE_TURNS, getTargetStage, rotateInteger, solvedCubies, applyMove, getTurnForStage, cubeAtStage, cubeAtProgress, isSolved} = (()=>{
/** Deterministic, reversible 3x3 cube used as a *metaphor* for completing work.
 * Each completed step undoes one legal turn of a reproducible scramble.
 * A task percentage is NOT a mathematical percentage of correctly placed stickers.
 */
const COLORS = Object.freeze({
 U:0xF4D64E,D:0xEDEDE8,F:0xF38A4C,B:0xD74F5F,L:0x42BA82,R:0x4D86EF
});
// Axis is 0=x,1=y,2=z. dir is right-hand +/- quarter turn.
const SCRAMBLE=Object.freeze([
 {axis:0,layer:1,dir:-1}, {axis:1,layer:1,dir:-1},
 {axis:2,layer:1,dir:-1}, {axis:0,layer:-1,dir:1},
 {axis:1,layer:-1,dir:1}, {axis:2,layer:-1,dir:1},
 {axis:1,layer:1,dir:1}, {axis:0,layer:1,dir:1},
 {axis:2,layer:1,dir:1}, {axis:0,layer:-1,dir:-1},
 {axis:1,layer:-1,dir:-1}, {axis:2,layer:-1,dir:-1}
]);
const CUBE_TURNS=SCRAMBLE.length;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function getTargetStage(percent){return Math.round(clamp(Number(percent)||0,0,100)/100*CUBE_TURNS);}
function rotateInteger(vec,axis,dir){
 const next=vec.slice(),b=(axis+1)%3,c=(axis+2)%3;
 next[b]=-dir*vec[c];next[c]=dir*vec[b];return next;
}
function solvedCubies(){
 const st=[];
 for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
  if(x===0&&y===0&&z===0)continue;
  const pos=[x,y,z];const stickers=[];
  if(y===1)stickers.push({f:'U',normal:[0,1,0]});
  if(y===-1)stickers.push({f:'D',normal:[0,-1,0]});
  if(z===1)stickers.push({f:'F',normal:[0,0,1]});
  if(z===-1)stickers.push({f:'B',normal:[0,0,-1]});
  if(x===-1)stickers.push({f:'L',normal:[-1,0,0]});
  if(x===1)stickers.push({f:'R',normal:[1,0,0]});
  st.push({id:`${x},${y},${z}`,home:pos.slice(),pos:pos.slice(),basis:[[1,0,0],[0,1,0],[0,0,1]],stickers});
 }
 return st;
}
function applyMove(cubies,move){
 for(const c of cubies){
  if(c.pos[move.axis]!==move.layer)continue;
  c.pos=rotateInteger(c.pos,move.axis,move.dir);
  c.basis=c.basis.map(v=>rotateInteger(v,move.axis,move.dir));
 }
 return cubies;
}
function getTurnForStage(stage,direction){
 if(direction===1){
  if(stage<0||stage>=CUBE_TURNS)throw RangeError('stage');
  const move=SCRAMBLE[CUBE_TURNS-1-stage];
  return {axis:move.axis,layer:move.layer,dir:-move.dir};
 }
 if(direction===-1){
  if(stage<=0||stage>CUBE_TURNS)throw RangeError('stage');
  const move=SCRAMBLE[CUBE_TURNS-stage];
  return {...move};
 }
 throw RangeError('direction');
}
function cubeAtStage(stage){
 const n=clamp(Math.round(stage)||0,0,CUBE_TURNS);
 const cubies=solvedCubies();
 for(const m of SCRAMBLE)applyMove(cubies,m);
 for(let i=0;i<n;i++)applyMove(cubies,getTurnForStage(i,1));
 return cubies;
}
function cubeAtProgress(percent){return cubeAtStage(getTargetStage(percent));}
function isSolved(cubies){return cubies.every(c=>c.pos.every((v,i)=>v===c.home[i])&&c.basis.every((b,i)=>b.every((v,j)=>v===(i===j?1:0))));}

return {COLORS, SCRAMBLE, CUBE_TURNS, getTargetStage, rotateInteger, solvedCubies, applyMove, getTurnForStage, cubeAtStage, cubeAtProgress, isSolved};
})();

// Bundled module: cube-particles.mjs
const {buildCubieParticles} = (()=>{
/** Luminous, clearly segmented 3D Rubik's cubies formed exclusively from
 * white pearly grains and vivid colored sticker-core grains. */
const rng=seed=>{let v=(seed>>>0)||1;return()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296;};};
const add=(part,p,n,c)=>{part.positions.push(...p);part.normals.push(...n);part.colors.push(...c);};
const rgb=n=>[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];
const empty=()=>({positions:[],normals:[],colors:[]});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function buildCubieParticles(stickers,{density=1,seed=1}={}){
 const r=rng(seed),edge=empty(),sticker=empty();
 // Grain-white bevel seam; two inset glints per edge make each of the 26
 // individual cubies distinguishable without drawing actual lines.
 const edgeN=Math.max(38,Math.round(51*density));
 for(let axis=0;axis<3;axis++)for(const a of [-1,1])for(const b of [-1,1]){
  const other=[0,1,2].filter(i=>i!==axis);
  for(let i=0;i<edgeN;i++){
   const p=[0,0,0];
   p[axis]=-.348+.696*(i+.1+.8*r())/edgeN;
   p[other[0]]=a*(.347+(r()-.5)*.016);
   p[other[1]]=b*(.347+(r()-.5)*.016);
   const lum=.89+.11*r(),normal=[0,0,0];
   normal[other[0]]=a*.707;normal[other[1]]=b*.707;
   add(edge,p,normal,[lum,lum,lum]);
  }
 }
 const stickerN=Math.max(370,Math.round(790*density));
 for(const face of stickers){
  const normal=face.normal,axis=normal.findIndex(v=>v!==0),[ax,ay]=[0,1,2].filter(i=>i!==axis);
  const base=rgb(COLORS[face.f]).map(v=>Math.pow(v,.68));
  let count=0,tries=0;
  while(count<stickerN&&tries++<stickerN*5){
   const u=(r()-.5)*.684,v=(r()-.5)*.684;
   const cornerX=Math.max(0,Math.abs(u)-.300),cornerY=Math.max(0,Math.abs(v)-.300);
   if(cornerX*cornerX+cornerY*cornerY>.044*.044)continue;
   const p=[0,0,0];p[axis]=normal[axis]*(.363+(r()-.5)*.016);p[ax]=u;p[ay]=v;
   // Broad, vivid sticker color fades only at the outermost edge, leaving
   // a pearly white particle rim rather than flat opaque sticker tiles.
   const radius=Math.hypot(u,v);
   const saturation=clamp((.323-radius)/.027,0,1);
   const probability=.045+.945*(saturation*saturation*(3-2*saturation));
   const lum=.89+.11*r();
   const color=r()<probability?
    base.map(c=>clamp((.075+c*.925)*lum,0,1)):
    [lum,lum,lum];
   add(sticker,p,normal,color);count++;
  }
 }
 return {edge,sticker};
}

return {buildCubieParticles};
})();

// Bundled module: cube-renderer.mjs
const {CUBE_TURN_MS, CubeRenderer} = (()=>{

/** Particle-only Rubik's Cube. The 26 cubies are rotating groups of colored
 * dots and faint white dot outlines, using the same grain shader as the brain.
 */
const CUBE_TURN_MS=34;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const AXES=['x','y','z'];
const ease=t=>{const u=clamp(t,0,1);return u<.5?4*u*u*u:1-(-2*u+2)**3/2;};
class CubeRenderer{
 constructor(cubeGroup,THREE,particleMaterial,{large=false}={}){
  this.group=cubeGroup;this.THREE=THREE;this.particleMaterial=particleMaterial;
  this.root=new THREE.Group();this.pivot=new THREE.Group();
  this.group.add(this.root,this.pivot);this.meshes=new Map();this.occlusionGeometry=null;this.occlusionMaterial=null;
  this.stage=0;this.targetStage=0;this.active=null;this.disposables=[];this.ready=false;
  this.large=large;this.build();
 }
 dispose(){
  if(this.active)this.finishTurn();
  for(const obj of this.meshes.values())this.root.remove(obj);
  for(const item of this.disposables)item.dispose();
  this.disposables=[];this.meshes.clear();this.occlusionGeometry=null;this.occlusionMaterial=null;this.ready=false;
 }
 cloud({positions,normals,colors},size,opacity,rear,fadeBackFaces=false){
  const T=this.THREE;
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('grainNormal',new T.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  const material=this.particleMaterial({size,opacity,rear,vertexColors:true});
  // The brain keeps its original softly translucent dots. Only cube sticker
  // particles suppress reverse-facing colors that otherwise show through
  // neighbouring cubies as noisy overlapping tiles.
  if(fadeBackFaces){
   const baseCompile=material.onBeforeCompile;
   material.onBeforeCompile=(shader)=>{
    baseCompile(shader);
    shader.fragmentShader=shader.fragmentShader.replace(
      'diffuseColor.a *= visibility;',
      'diffuseColor.a *= visibility * mix(0.48,1.0,smoothstep(-0.12,0.55,vFacing));\n' +
      'diffuseColor.a *= 1.0 - smoothstep(.36,.50,length(gl_PointCoord.xy - vec2(.5)));'
    );
   };
   material.customProgramCacheKey=()=> 'myelin-cube-front-grain-v5';
  }
  const points=new T.Points(geometry,material);
  this.disposables.push(geometry,material);
  return points;
 }
 build(){
  const originalStage=this.ready?this.stage:0;
  this.dispose();
  const T=this.THREE;
  // Depth-only invisible interior. All visible geometry is still grain dots.
  // This masks rear faces / through-the-cube lines, which made v16 skeletal.
  const occlusionGeometry=new T.BoxGeometry(.675,.675,.675);
  const occlusionMaterial=new T.MeshBasicMaterial({colorWrite:false,depthWrite:true,depthTest:true});
  this.disposables.push(occlusionGeometry,occlusionMaterial);
  this.occlusionGeometry=occlusionGeometry;this.occlusionMaterial=occlusionMaterial;
  for(const cubie of cubeAtStage(CUBE_TURNS)){
   const unit=new T.Group();unit.userData.cubieId=cubie.id;
   // The occluder writes depth but never a colored pixel or a visible face.
   const invisibleDepth=new T.Mesh(occlusionGeometry,occlusionMaterial);
   invisibleDepth.renderOrder=-1;
   unit.add(invisibleDepth);
   const serial=cubie.home.reduce((a,v)=>a*7+v+2,19);
   const particles=buildCubieParticles(cubie.stickers,{density:this.large?1.65:1,seed:serial});
   unit.add(this.cloud(particles.edge,this.large?.0185:.016,.98,.18,true));
   unit.add(this.cloud(particles.sticker,this.large?.019:.017,.99,.14,true));
   this.root.add(unit);this.meshes.set(cubie.id,unit);
  }
  this.stage=originalStage;this.targetStage=originalStage;this.active=null;this.ready=true;
  this.applyStage(this.stage);
 }
 applyStage(stage){
  const T=this.THREE,m=new T.Matrix4();
  for(const cubie of cubeAtStage(stage)){
   const obj=this.meshes.get(cubie.id);
   obj.position.set(...cubie.pos).multiplyScalar(.75);
   m.makeBasis(...cubie.basis.map(v=>new T.Vector3(...v)));
   obj.quaternion.setFromRotationMatrix(m);
  }
 }
 finishTurn(){
  if(!this.active)return;
  for(const m of this.active.members)this.root.attach(m);
  this.pivot.rotation.set(0,0,0);
  this.stage+=this.active.direction;
  this.active=null;this.applyStage(this.stage);
 }
 startTurn(now){
  if(this.active||this.targetStage===this.stage)return;
  const direction=Math.sign(this.targetStage-this.stage);
  const move=getTurnForStage(this.stage,direction);
  const cubies=cubeAtStage(this.stage);
  const members=cubies.filter(c=>c.pos[move.axis]===move.layer).map(c=>this.meshes.get(c.id));
  if(members.length!==9)throw Error(`Expected nine cubies, got ${members.length}`);
  this.pivot.rotation.set(0,0,0);this.group.updateMatrixWorld(true);
  for(const mesh of members)this.pivot.attach(mesh);
  this.active={move,direction,members,start:now};
 }
 setProgress(percent,{animate=true}={}){
  this.targetStage=getTargetStage(percent);
  if(!animate){
   if(!this.active&&this.stage===this.targetStage)return;
   if(this.active)this.finishTurn();
   this.stage=this.targetStage;this.applyStage(this.stage);
  }
 }
 update(now,reducedMotion=false){
  if(!this.ready)return;
  if(reducedMotion){this.setProgress(this.targetStage/CUBE_TURNS*100,{animate:false});return;}
  if(this.active){
   const a=this.active,t=clamp((now-a.start)/CUBE_TURN_MS,0,1);
   this.pivot.rotation[AXES[a.move.axis]]=a.move.dir*Math.PI/2*ease(t);
   if(t>=1)this.finishTurn();
  }
  if(!this.active&&this.stage!==this.targetStage)this.startTurn(now);
 }
 setDensity(large=this.large){
  const queuedTarget=this.targetStage;
  this.large=large;this.build();
  this.targetStage=queuedTarget;
 }
}

return {CUBE_TURN_MS, CubeRenderer};
})();

// Bundled module: chess-logic.mjs
const {CHESS_MOVES, getChessMoveCount} = (()=>{
/** Visual chess move progress. This is not a playable chess game. */
const CHESS_MOVES=24;
const clamp=v=>Math.max(0,Math.min(100,Number(v)||0));
const getChessMoveCount=percent=>Math.round(clamp(percent)*CHESS_MOVES/100);

return {CHESS_MOVES, getChessMoveCount};
})();

// Bundled module: chess-particles.mjs
const {KNIGHT_PROFILE, buildKnightParticles} = (()=>{
/** White-grain chess knight with sculpted 3D relief. Its surrounding
 * miniatures are independently generated in chess-miniatures.mjs. */
const rng=seed=>{let s=(seed>>>0)||1;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};};
const empty=()=>({positions:[],normals:[],colors:[]});
const add=(out,x,y,z,nx,ny,nz,r,g,b)=>{out.positions.push(x,y,z);out.normals.push(nx,ny,nz);out.colors.push(r,g,b);};
const lim=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{const v=lim(t,0,1);return v*v*(3-2*v);};
// One continuous Staunton-inspired silhouette: ear, forehead, cheek, muzzle,
// throat and a smoothly carved nape without anatomical eye detailing.
const KNIGHT_PROFILE=Object.freeze([
 // A classic Staunton-style chess knight: one short ear, smooth nape,
 // broad carved neck, projecting nose and a crisp under-jaw.
 [-.44,-.64],[-.52,-.46],[-.58,-.25],[-.62,.03],[-.65,.28],
 [-.655,.42],[-.67,.54],[-.66,.78],[-.64,.96],[-.57,1.10],[-.51,1.16],[-.47,1.20],
 [-.34,1.29],[-.24,1.35],[-.17,1.39],[-.12,1.27],
 [-.06,1.25],[.04,1.27],[.10,1.14],[.18,1.08],
 [.29,1.02],[.37,.93],[.48,.88],[.59,.83],[.63,.76],
 [.59,.69],[.53,.66],[.51,.635],[.44,.63],[.34,.64],
 [.28,.59],[.25,.53],[.23,.48],[.18,.40],[.12,.25],
 [.11,.09],[.17,-.12],[.27,-.36],[.40,-.64]
]);
function inside(x,y,poly){
 let result=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))result=!result;
 }return result;
}
function edgeDistance(x,y,poly){
 let best=1e9,dx=0,dy=0;
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],vx=b[0]-a[0],vy=b[1]-a[1];
  const u=lim(((x-a[0])*vx+(y-a[1])*vy)/(vx*vx+vy*vy||1),0,1);
  const tx=x-a[0]-u*vx,ty=y-a[1]-u*vy,d=Math.hypot(tx,ty);
  if(d<best){best=d;dx=tx;dy=ty;}
 }return {d:best,dx,dy};
}
const relief=d=>.14+.255*smooth(d/.31);
function addSurface(out,r,x,y,sign){
 const {d,dx,dy}=edgeDistance(x,y,KNIGHT_PROFILE),z=sign*(relief(d)+(r()-.5)*.011);
 const deriv=.255*6*lim(d/.31,0,1)*(1-lim(d/.31,0,1))/.31;
 let nx=-sign*deriv*dx/(d||1),ny=-sign*deriv*dy/(d||1),nz=sign;
 const nl=Math.hypot(nx,ny,nz)||1;nx/=nl;ny/=nl;nz/=nl;
 const diffuse=.80+.20*r();
 // Slight silver-blue grains on the neck, so the knight isn't a flat white slab.
 const silver=(x<-.31&&y>-.02&&y<1.1&&r()<.055);
 const col=silver?[diffuse*.68,diffuse*.88,diffuse]:[diffuse,diffuse,diffuse*.992];
 add(out,x,y,z,nx,ny,nz,...col);
}
function buildKnightParticles({density=1,seed=1405}={}){
 const r=rng(seed),body=empty(),base=empty(),details=empty(),face=empty();
 // Inward-curved, genuinely 3D side surfaces; not stacked flat point sheets.
 const nFace=Math.round(6800*density);
 let made=0,attempts=0;
 while(made<nFace&&attempts++<nFace*15){
  const x=-.68+r()*1.30,y=-.64+r()*2.15;
  if(!inside(x,y,KNIGHT_PROFILE))continue;
  const sign=made%3===0?-1:1;
  addSurface(body,r,x,y,sign);made++;
 }
 // Rim at the continuous, variable-thickness perimeter. Deliberate grain
 // density at the nose/crest gives silhouette priority over interior noise.
 const segments=KNIGHT_PROFILE.map((a,i)=>{
  const b=KNIGHT_PROFILE[(i+1)%KNIGHT_PROFILE.length];return {a,b,len:Math.hypot(b[0]-a[0],b[1]-a[1])};
 });
 const total=segments.reduce((s,v)=>s+v.len,0);
 for(let i=0;i<Math.round(2250*density);i++){
  let q=r()*total,j=0;while(j<segments.length-1&&q>segments[j].len)q-=segments[j++].len;
  const {a,b}=segments[j],t=r(),x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;
  const z=(r()-.5)*.285,dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;
  const lum=.84+.16*r();
  add(body,x,y,z,dy/l,-dx/l,0,lum,lum,lum);
 }
 // Rounded, narrow black-chess-piece pedestal. Whole base remains grain.
 const profile=[[-1.27,.48],[-1.245,.56],[-1.20,.63],[-1.155,.64],[-1.12,.60],[-1.08,.52],[-1.01,.48],[-.94,.49],[-.86,.50],[-.79,.46],[-.70,.42],[-.64,.46]];
 const strips=profile.slice(0,-1).map((p,i)=>({a:p,b:profile[i+1],weight:Math.hypot(profile[i+1][0]-p[0],profile[i+1][1]-p[1])}));
 const sum=strips.reduce((a,b)=>a+b.weight,0);
 for(let i=0;i<Math.round(3400*density);i++){
  let q=r()*sum,j=0;while(j<strips.length-1&&q>strips[j].weight)q-=strips[j++].weight;
  const {a,b}=strips[j],t=r(),y=a[0]+(b[0]-a[0])*t,rad=a[1]+(b[1]-a[1])*t;
  const theta=r()*Math.PI*2,lum=.81+.19*r();
  add(base,rad*Math.cos(theta),y,rad*Math.sin(theta),Math.cos(theta),0,Math.sin(theta),lum,lum,lum);
 }
 // Quiet carved mane grooves following the back of the neck. There are no
 // individual spikes or thick contrasting face stripes.
 const curve=(out,fn,count,side,color,offset=.023,spread=.005)=>{
  for(let j=0;j<Math.round(count*density);j++){
   const t=r(),[x,y]=fn(t),{d}=edgeDistance(x,y,KNIGHT_PROFILE);
   const z=side*(relief(d)+offset+(r()-.5)*.006);
   add(out,x+(r()-.5)*spread,y+(r()-.5)*spread,z,0,0,side,...color);
  }
 };
 for(const side of [1,-1]){
  for(let k=0;k<3;k++){
   const x=-.49+k*.050;
   curve(details,t=>[x+.018*Math.sin(t*Math.PI),.38+.67*t],47,side,[.69,.74,.78],.018,.01);
  }
 }
 // A simple carved muzzle only. The upper face remains plain, with no eyes
 // or eye socket: the chess-knight profile is legible from the silhouette.
 for(const side of [1,-1]){
  // Small, restrained oval nostril close to the nose.
  const nx=.518,ny=.770;
  for(let j=0;j<Math.round(57*density);j++){
   const a=2*Math.PI*r(),rr=Math.sqrt(r()),x=nx+.022*rr*Math.cos(a),y=ny+.013*rr*Math.sin(a);
   const {d}=edgeDistance(x,y,KNIGHT_PROFILE);
   add(face,x,y,side*(relief(d)+.024),0,0,side,.20,.22,.24);
  }
  // Just enough carved lip and jaw definition to read as the classic piece.
  curve(face,t=>[.35+.13*t,.654-.014*Math.sin(Math.PI*t)],57,side,[.72,.76,.80],.027,.003);
 }
 return {body,base,details,face};
}

return {KNIGHT_PROFILE, buildKnightParticles};
})();

// Bundled module: chess-miniatures.mjs
const {MINIATURE_TYPES, MINIATURE_REVEAL_ORDER, MINIATURE_ORBIT, MINIATURE_PALETTE, buildChessMiniatures, miniatureProgress} = (()=>{
/** Actual miniature chess sculptures built entirely from THREE.Points-compatible
 * deterministic surface samples. No solid visible models or external assets. */

// 24 move markers from v20 are replaced one-for-one by miniature chess pieces.
// Their centers use the original 24-slot circular orbit, gently tilted so the figures still have depth without making
// the progress ring look like an upright wheel.
const TYPES=Object.freeze(['queen','pawn','bishop','rook','pawn','king']);
const MINIATURE_TYPES=Object.freeze(Array.from({length:CHESS_MOVES},(_,i)=>TYPES[i%TYPES.length]));
const MINIATURE_REVEAL_ORDER=Object.freeze(Array.from({length:CHESS_MOVES},(_,i)=>i));
const MINIATURE_ORBIT=Object.freeze({radiusX:1.42,radiusY:.39,depth:.72,centerY:.06});
const ORIGINS=Object.freeze(MINIATURE_TYPES.map((_,i)=>{
 const a=Math.PI/2-i*2*Math.PI/CHESS_MOVES;
 return Object.freeze([MINIATURE_ORBIT.radiusX*Math.cos(a),
  MINIATURE_ORBIT.centerY+MINIATURE_ORBIT.radiusY*Math.sin(a),
  MINIATURE_ORBIT.depth*Math.sin(a)]);
}));
// v21 companions were .82–.90 scale; shrink them to make room for 24 on orbit.
const SCALES=Object.freeze(MINIATURE_TYPES.map((_,i)=>i%6===0?.41:i%6===5?.42:.39));
// Subtle yet distinctly colored: cyan, warm gold, violet, turquoise, coral, blue.
const MINIATURE_PALETTE=Object.freeze([
 Object.freeze([.58,.86,1]),Object.freeze([1,.77,.48]),
 Object.freeze([.78,.66,1]),Object.freeze([.47,1,.82]),
 Object.freeze([1,.63,.68]),Object.freeze([.59,.77,1])
]);
const rng=seed=>{let s=seed>>>0||1;return()=>((s=(Math.imul(1664525,s)+1013904223)>>>0)/4294967296);};
const empty=()=>({positions:[],normals:[],colors:[]});
function push(out,x,y,z,nx,ny,nz,col,r){
 const len=Math.hypot(nx,ny,nz)||1;
 const bright=.84+.16*r();
 out.positions.push(x,y,z);
 out.normals.push(nx/len,ny/len,nz/len);
 out.colors.push(...col.map(v=>Math.min(1,v*bright)));
}
const ivory=[1,1,.976],warm=[1,.89,.69],ice=[.70,.91,1];
function lathe(out,profile,count,r,col=ivory){
 const segments=profile.slice(0,-1).map((a,i)=>{
  const b=profile[i+1];return {a,b,w:Math.max(.001,(a[1]+b[1])*.5*Math.hypot(b[0]-a[0],b[1]-a[1]))};
 });
 const total=segments.reduce((sum,s)=>sum+s.w,0);
 for(let i=0;i<count;i++){
  let u=r()*total,j=0;
  while(j<segments.length-1&&u>segments[j].w)u-=segments[j++].w;
  const {a,b}=segments[j],t=r(),y=a[0]+(b[0]-a[0])*t,rad=a[1]+(b[1]-a[1])*t;
  const angle=2*Math.PI*r(),slope=(b[1]-a[1])/(b[0]-a[0]||1e-5);
  push(out,rad*Math.cos(angle),y,rad*Math.sin(angle),Math.cos(angle),-slope,Math.sin(angle),col,r);
 }
}
function sphere(out,cx,cy,cz,rx,ry,rz,count,r,col=ivory,accept=()=>true){
 let made=0,attempts=0;
 while(made<count&&attempts++<count*8){
  const phi=2*Math.PI*r(),v=2*r()-1,s=Math.sqrt(1-v*v),xx=s*Math.cos(phi),zz=s*Math.sin(phi);
  const x=cx+rx*xx,y=cy+ry*v,z=cz+rz*zz;
  if(!accept(x,y,z))continue;
  push(out,x,y,z,xx/rx,v/ry,zz/rz,col,r);made++;
 }
}
function boxSurface(out,x,y,z,w,h,d,count,r,col=ivory){
 for(let i=0;i<count;i++){
  const side=Math.floor(r()*6),u=r()-.5,v=r()-.5;
  let px=x+u*w,py=y+v*h,pz=z+(r()-.5)*d,nx=0,ny=0,nz=0;
  if(side<2){px=x+(side?-.5:.5)*w;nx=side?-1:1;}
  else if(side<4){py=y+(side===2?.5:-.5)*h;ny=side===2?1:-1;}
  else{pz=z+(side===4?.5:-.5)*d;nz=side===4?1:-1;}
  push(out,px,py,pz,nx,ny,nz,col,r);
 }
}
function roundedCollar(out,y,rad,count,r,col){
 for(let i=0;i<count;i++){
  const theta=r()*Math.PI*2,rr=rad+(r()-.5)*.014;
  push(out,rr*Math.cos(theta),y+(r()-.5)*.023,rr*Math.sin(theta),Math.cos(theta),0,Math.sin(theta),col,r);
 }
}
const STEM=[
 [0,.21],[.032,.225],[.062,.216],[.086,.183],[.115,.126],
 [.168,.103],[.248,.10],[.33,.113],[.42,.116]
];
const PROFILES={
 pawn:[...STEM,[.463,.081],[.49,.071]],
 bishop:[...STEM,[.50,.101],[.565,.127],[.62,.125]],
 rook:[...STEM,[.51,.124],[.63,.144],[.675,.174],[.697,.174]],
 queen:[...STEM,[.54,.124],[.61,.171],[.665,.198],[.685,.168]],
 king:[...STEM,[.55,.126],[.63,.173],[.675,.183],[.705,.164]]
};
function makePiece(type,density,r){
 const body=empty(),details=empty(),features=[];
 lathe(body,PROFILES[type],Math.round(680*density),r,ivory);
 roundedCollar(details,.078,.213,Math.round(65*density),r,ice);
 roundedCollar(details,.175,.106,Math.round(45*density),r,ivory);
 if(type==='pawn'){
  sphere(body,0,.575,0,.129,.129,.129,Math.round(410*density),r,ivory);
  roundedCollar(details,.477,.087,Math.round(65*density),r,warm);
  sphere(details,0,.575,0,.130,.130,.130,Math.round(70*density),r,ivory);
  features.push('orb');
 }else if(type==='bishop'){
  sphere(body,0,.657,0,.128,.191,.127,Math.round(430*density),r,ivory,
   (x,y,z)=>!(z>.065&&Math.abs((y-.67)+.95*x)<.026));
  sphere(details,0,.861,0,.038,.040,.038,Math.round(100*density),r,warm);
  roundedCollar(details,.531,.127,Math.round(60*density),r,ice);
  features.push('mitre','slit');
 }else if(type==='rook'){
  // A deliberately crenellated silhouette: six separate square merlons.
  for(let k=0;k<6;k++){
   const a=(k+.5)*Math.PI/3;
   boxSurface(details,.144*Math.cos(a),.755,.144*Math.sin(a),.082,.144,.082,
    Math.round(94*density),r,k%2?ivory:ice);
  }
  roundedCollar(details,.698,.171,Math.round(130*density),r,warm);
  features.push('battlements');
 }else if(type==='queen'){
  for(let k=0;k<6;k++){
   const a=k*Math.PI/3,ex=.220*Math.cos(a),ez=.220*Math.sin(a);
   for(let j=0;j<Math.round(45*density);j++){
    const t=r(),rad=.16+(.06*t),yy=.677+.16*t;
    const jit=(r()-.5)*.014;
    push(details,rad*Math.cos(a)+jit,yy,rad*Math.sin(a)+jit,Math.cos(a),.3,Math.sin(a),warm,r);
   }
   sphere(details,ex,.841,ez,.034,.038,.034,Math.round(45*density),r,ivory);
  }
  roundedCollar(details,.672,.176,Math.round(118*density),r,ice);
  features.push('crown');
 }else if(type==='king'){
  // A crown and a raised, legible cross (not a generic ball).
  roundedCollar(details,.693,.175,Math.round(120*density),r,warm);
  boxSurface(details,0,.840,.018,.075,.259,.082,Math.round(225*density),r,ivory);
  boxSurface(details,0,.869,.020,.242,.069,.084,Math.round(225*density),r,ice);
  sphere(details,0,.973,.02,.043,.043,.043,Math.round(62*density),r,warm);
  features.push('cross','crown');
 }
 return {body,details,features};
}
function tintCloud(cloud,tint){
 // Keep original cool/warm detailing in the lathed model, but make each piece
 // legibly colored. Vertex colors remain independent real grain points.
 for(let i=0;i<cloud.colors.length;i+=3){
  for(let c=0;c<3;c++)cloud.colors[i+c]=Math.min(1,cloud.colors[i+c]*(c===1?.21:.24)+tint[c]*(c===1?.79:.76));
 }
}
function buildChessMiniatures({density=1,seed=614}={}){
 const r=rng(seed);
 return MINIATURE_TYPES.map((type,index)=>{
  const geometry=makePiece(type,density,r),tint=MINIATURE_PALETTE[index%MINIATURE_PALETTE.length];
  tintCloud(geometry.body,tint);tintCloud(geometry.details,tint);
  return {type,index,origin:[...ORIGINS[index]],scale:SCALES[index],tint:[...tint],...geometry};
 });
}
/** Each of the 24 actual chess pieces now tracks one move, not four moves. */
function miniatureProgress(percent,index){
 if(!Number.isInteger(index)||index<0||index>=CHESS_MOVES)return 0;
 const moves=Math.min(CHESS_MOVES,Math.max(0,(Number(percent)||0)*CHESS_MOVES/100));
 return Math.max(0,Math.min(1,moves-index));
}

return {MINIATURE_TYPES, MINIATURE_REVEAL_ORDER, MINIATURE_ORBIT, MINIATURE_PALETTE, buildChessMiniatures, miniatureProgress};
})();

// Bundled module: chess-renderer.mjs
const {ChessRenderer} = (()=>{

/** White-grain knight surrounded by 24 colored chess-piece sculptures.
 * All visible models are THREE.Points; zero-progress pieces are faint but present.
 * Each of 24 moves brightens one miniature along the circular orbit. */
class ChessRenderer{
 constructor(group,THREE,particleMaterial,{large=false}={}){
  this.group=group;this.THREE=THREE;this.particleMaterial=particleMaterial;
  this.root=new THREE.Group();this.knight=new THREE.Group();this.root.add(this.knight);this.group.add(this.root);
  this.disposables=[];this.large=large;this.percent=0;this.moves=0;
  this.miniatures=[];this.pulseStart=-1;this.pulseIndex=-1;
  this.build();
 }
 cloud({positions,normals,colors},size,opacity,rear=1){
  const T=this.THREE,geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('grainNormal',new T.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  const material=this.particleMaterial({size,opacity,vertexColors:true,rear});
  const cloud=new T.Points(geometry,material);
  this.disposables.push(geometry,material);
  return cloud;
 }
 dispose(){
  this.knight.clear();
  for(const item of [...this.root.children])if(item!==this.knight)this.root.remove(item);
  for(const disposable of this.disposables)disposable.dispose();
  this.disposables=[];this.miniatures=[];
 }
 build(){
  const previous=this.percent;
  this.dispose();
  const T=this.THREE,factor=this.large?1.35:1;
  // Depth-only knight profile: never draws a solid pixel. Rear interior dots
  // cannot show through the face, matching the other sculpted grain objects.
  const shape=new T.Shape();
  KNIGHT_PROFILE.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));
  shape.closePath();
  const maskGeometry=new T.ShapeGeometry(shape);
  const maskMaterial=new T.MeshBasicMaterial({colorWrite:false,depthWrite:true,depthTest:true,side:T.DoubleSide});
  const invisibleMask=new T.Mesh(maskGeometry,maskMaterial);
  invisibleMask.renderOrder=-1;
  this.knight.add(invisibleMask);
  this.disposables.push(maskGeometry,maskMaterial);
  const sculpture=buildKnightParticles({density:factor,seed:1405});
  this.knight.add(this.cloud(sculpture.base,this.large?.016:.014,.99,.20));
  this.knight.add(this.cloud(sculpture.body,this.large?.018:.0153,.99,.20));
  this.knight.add(this.cloud(sculpture.details,this.large?.019:.017,.99,.30));
  // Facial expression has dedicated, slightly larger particles so it does
  // not vanish among body grain at normal mobile viewing distance.
  const facial=this.cloud(sculpture.face,this.large?.029:.025,1,.38);
  facial.renderOrder=3;
  this.knight.add(facial);
  // 24 colored chess miniatures replace the 24 move-dot positions exactly:
  // there are no separate floating dots or abstract fragments.
  const pieces=buildChessMiniatures({density:factor,seed:614});
  for(const piece of pieces){
   const pedestal=new T.Group();
   pedestal.position.set(...piece.origin);pedestal.scale.setScalar(piece.scale);
   const restBody=this.cloud(piece.body,this.large?.022:.020,.21,.46);
   const restDetails=this.cloud(piece.details,this.large?.023:.021,.25,.48);
   const activeBody=this.cloud(piece.body,this.large?.023:.021,0,.65);
   const activeDetails=this.cloud(piece.details,this.large?.026:.023,0,.70);
   pedestal.add(restBody,restDetails,activeBody,activeDetails);
   this.root.add(pedestal);
   this.miniatures.push({type:piece.type,group:pedestal,origin:piece.origin,
    scale:piece.scale,activeBody,activeDetails});
  }
  this.moves=-1;
  this.setProgress(previous,{animate:false});
 }
 setProgress(percent,{animate=true}={}){
  const clamped=Math.max(0,Math.min(100,Number(percent)||0));
  const moves=getChessMoveCount(clamped);
  if(animate&&this.moves>=0&&moves>this.moves){
   this.pulseStart=this.motionTime||0;this.pulseIndex=MINIATURE_REVEAL_ORDER[Math.max(0,Math.min(23,moves-1))];
  }
  this.percent=clamped;this.moves=moves;
  this.miniatures.forEach((item,i)=>{
   const f=miniatureProgress(clamped,i);
   item.activeBody.visible=f>0;
   item.activeDetails.visible=f>0;
   item.activeBody.material.opacity=.94*f;
   item.activeDetails.material.opacity=.99*f;
   if(this.pulseIndex!==i)item.group.position.y=item.origin[1];
  });
  if(!animate){this.pulseStart=-1;this.pulseIndex=-1;}
 }
 update(now,reducedMotion=false){
  this.motionTime=now;
  if(this.pulseIndex<0||this.pulseStart<0)return;
  const item=this.miniatures[this.pulseIndex];if(!item)return;
  const t=Math.max(0,Math.min(1,(now-this.pulseStart)/280));
  item.group.position.y=item.origin[1]+(reducedMotion?0:.028*Math.sin(Math.PI*t));
  if(t>=1||reducedMotion){item.group.position.y=item.origin[1];this.pulseStart=-1;this.pulseIndex=-1;}
 }
 setDensity(large=this.large){this.large=large;this.build();}
}

return {ChessRenderer};
})();

// Bundled module: dashboard-ornament.mjs
const {DASHBOARD_DOT_COUNT, dashboardArcDots, dashboardDotOpacity, dashboardNumber} = (()=>{
// Screenshot-inspired, UI-only progress decor. Does not touch the 3D renderers.
const DASHBOARD_DOT_COUNT=12;
// A gentle horseshoe: the outer column bows left near the middle and
// returns inward at the bottom. Two staggered rows preserve the screenshot rhythm.
const LEFT_ARC=Object.freeze([
 [0.245,0.260], [0.295,0.290],
 [0.195,0.330], [0.245,0.360],
 [0.155,0.410], [0.205,0.440],
 [0.130,0.500], [0.180,0.530],
 [0.140,0.590], [0.190,0.620],
 [0.170,0.680], [0.220,0.710]
]);
function dashboardArcDots(side){
 if(side!=='left'&&side!=='right') throw new RangeError('Arc side must be left or right');
 return LEFT_ARC.map(([x,y])=>({x:side==='left'?x:1-x,y}));
}
function dashboardNumber(percent){
 return String(Math.round(Math.max(0,Math.min(100,Number(percent)||0))));
}
function dashboardDotOpacity(percent,index){
 const n=Math.round(Math.max(0,Math.min(100,Number(percent)||0))/100*DASHBOARD_DOT_COUNT);
 return index>=DASHBOARD_DOT_COUNT-n?1:.48;
}

return {DASHBOARD_DOT_COUNT, dashboardArcDots, dashboardDotOpacity, dashboardNumber};
})();


// Bundled module: lego-icons.mjs
export const LEGO_ISOMETRIC_DEGREES = Object.freeze({ pitchX: 35, yawY: 45, rollZ: 0 });
export const LEGO_ISOMETRIC_EULER = Object.freeze({
  x: THREE.MathUtils.degToRad(35),
  y: THREE.MathUtils.degToRad(45),
  z: 0,
  order: 'XYZ',
});

export const LEGO_VIBRANT_COLORS = Object.freeze([
  Object.freeze({ name: 'Bright Red', hex: '#E3000B', rgb: 0xE3000B, baseColorFactor: Object.freeze([0.890, 0.000, 0.043, 1.0]) }),
  Object.freeze({ name: 'Bright Yellow', hex: '#F5CD2F', rgb: 0xF5CD2F, baseColorFactor: Object.freeze([0.961, 0.804, 0.184, 1.0]) }),
  Object.freeze({ name: 'Bright Blue', hex: '#0055BF', rgb: 0x0055BF, baseColorFactor: Object.freeze([0.000, 0.333, 0.749, 1.0]) }),
  Object.freeze({ name: 'Bright Green', hex: '#237841', rgb: 0x237841, baseColorFactor: Object.freeze([0.137, 0.471, 0.255, 1.0]) }),
  Object.freeze({ name: 'Bright Orange', hex: '#FE8A18', rgb: 0xFE8A18, baseColorFactor: Object.freeze([0.996, 0.541, 0.094, 1.0]) }),
  Object.freeze({ name: 'Medium Lavender', hex: '#923978', rgb: 0x923978, baseColorFactor: Object.freeze([0.573, 0.224, 0.471, 1.0]) }),
  Object.freeze({ name: 'Bright Teal', hex: '#008F9B', rgb: 0x008F9B, baseColorFactor: Object.freeze([0.000, 0.561, 0.608, 1.0]) }),
  Object.freeze({ name: 'Coral Red', hex: '#FF698F', rgb: 0xFF698F, baseColorFactor: Object.freeze([1.000, 0.412, 0.561, 1.0]) }),
]);

export function resolveLegoBaseColorFactor(colorInput, fallbackIndex = 0) {
  if (Array.isArray(colorInput) && colorInput.length >= 3) {
    return [
      Math.max(0, Math.min(1, Number(colorInput[0]) || 0)),
      Math.max(0, Math.min(1, Number(colorInput[1]) || 0)),
      Math.max(0, Math.min(1, Number(colorInput[2]) || 0)),
      colorInput.length >= 4 ? Math.max(0, Math.min(1, Number(colorInput[3]) || 1)) : 1.0,
    ];
  }
  if (typeof colorInput === 'number' && Number.isFinite(colorInput)) {
    if (Number.isInteger(colorInput) && colorInput >= 0 && colorInput < 64) {
      const preset = LEGO_VIBRANT_COLORS[colorInput % LEGO_VIBRANT_COLORS.length];
      return [...preset.baseColorFactor];
    }
    const c = new THREE.Color(colorInput);
    return [c.r, c.g, c.b, 1.0];
  }
  if (typeof colorInput === 'string' && colorInput.trim()) {
    const matched = LEGO_VIBRANT_COLORS.find(
      item => item.name.toLowerCase() === colorInput.trim().toLowerCase() || item.hex.toLowerCase() === colorInput.trim().toLowerCase()
    );
    if (matched) return [...matched.baseColorFactor];
    const c = new THREE.Color(colorInput.trim());
    return [c.r, c.g, c.b, 1.0];
  }
  const preset = LEGO_VIBRANT_COLORS[Math.abs(Math.round(fallbackIndex) || 0) % LEGO_VIBRANT_COLORS.length];
  return [...preset.baseColorFactor];
}

/**
 * Clones the PBR material for each list item and dynamically overrides
 * its glTF pbrMetallicRoughness.baseColorFactor with a vibrant Lego color.
 */
export function cloneLegoPbrMaterial(sourceMaterial, colorInput, fallbackIndex = 0) {
  const baseColorFactor = resolveLegoBaseColorFactor(colorInput, fallbackIndex);
  const [r, g, b, a] = baseColorFactor;
  const cloned = sourceMaterial && typeof sourceMaterial.clone === 'function'
    ? sourceMaterial.clone()
    : new THREE.MeshStandardMaterial({
        name: 'Lego_Brick',
        metalness: 0.0,
        roughness: 0.22,
      });

  if (cloned.normalMap && !cloned.normalMap.image) {
    cloned.normalMap = null;
  }
  cloned.color = new THREE.Color(r, g, b);
  cloned.metalness = 0.02;
  cloned.roughness = 0.22;
  cloned.opacity = a;
  cloned.transparent = a < 0.999;
  cloned.userData = {
    ...(cloned.userData || {}),
    baseColorFactor: [...baseColorFactor],
    pbrMetallicRoughness: {
      ...(cloned.userData?.pbrMetallicRoughness || {}),
      baseColorFactor: [...baseColorFactor],
      metallicFactor: 0.0,
      roughnessFactor: 0.22,
    },
  };
  cloned.needsUpdate = true;
  return cloned;
}

/**
 * Applies the isometric Euler rotation to the 3D Lego brick mesh:
 * Pitched up ~35° on the X-axis, angled right ~45° on the Y-axis.
 */
export function applyIsometricLegoRotation(target, { pitchDeg = 35, yawDeg = 45, rollDeg = 0 } = {}) {
  if (!target?.rotation) return target;
  target.rotation.order = 'XYZ';
  target.rotation.set(
    THREE.MathUtils.degToRad(pitchDeg),
    THREE.MathUtils.degToRad(yawDeg),
    THREE.MathUtils.degToRad(rollDeg),
  );
  return target;
}

export function sanitizeGlbForReactNative(glbBuffer) {
  if (!glbBuffer || !(glbBuffer instanceof ArrayBuffer) || glbBuffer.byteLength < 20) {
    return glbBuffer;
  }
  try {
    const view = new DataView(glbBuffer);
    const magic = view.getUint32(0, true);
    const version = view.getUint32(4, true);
    if (magic !== 0x46546C67 || version !== 2) return glbBuffer;

    const jsonChunkLength = view.getUint32(12, true);
    const jsonChunkType = view.getUint32(16, true);
    if (jsonChunkType !== 0x4E4F534A) return glbBuffer;

    const jsonBytes = new Uint8Array(glbBuffer, 20, jsonChunkLength);
    let jsonText = '';
    if (typeof TextDecoder !== 'undefined') {
      jsonText = new TextDecoder('utf-8').decode(jsonBytes);
    } else {
      for (let i = 0; i < jsonBytes.length; i++) jsonText += String.fromCharCode(jsonBytes[i]);
    }
    const gltfJson = JSON.parse(jsonText);
    let modified = false;
    if (Array.isArray(gltfJson.materials)) {
      for (const mat of gltfJson.materials) {
        if (mat.normalTexture) {
          delete mat.normalTexture;
          modified = true;
        }
        if (mat.occlusionTexture) {
          delete mat.occlusionTexture;
          modified = true;
        }
        if (mat.emissiveTexture) {
          delete mat.emissiveTexture;
          modified = true;
        }
        if (mat.pbrMetallicRoughness?.baseColorTexture) {
          delete mat.pbrMetallicRoughness.baseColorTexture;
          modified = true;
        }
        if (mat.pbrMetallicRoughness?.metallicRoughnessTexture) {
          delete mat.pbrMetallicRoughness.metallicRoughnessTexture;
          modified = true;
        }
      }
    }
    if (gltfJson.textures) {
      delete gltfJson.textures;
      modified = true;
    }
    if (gltfJson.images) {
      delete gltfJson.images;
      modified = true;
    }
    if (!modified) return glbBuffer;

    const updatedJsonStr = JSON.stringify(gltfJson);
    const rawBytes = new Uint8Array(updatedJsonStr.length);
    for (let i = 0; i < updatedJsonStr.length; i++) {
      rawBytes[i] = updatedJsonStr.charCodeAt(i) & 0xff;
    }
    const paddedLength = (rawBytes.length + 3) & ~3;
    const paddedJsonBytes = new Uint8Array(paddedLength);
    paddedJsonBytes.fill(0x20);
    paddedJsonBytes.set(rawBytes, 0);

    const restOffset = 20 + jsonChunkLength;
    const restBytes = new Uint8Array(glbBuffer, restOffset, glbBuffer.byteLength - restOffset);
    const totalLength = 12 + 8 + paddedLength + restBytes.byteLength;

    const outBuffer = new ArrayBuffer(totalLength);
    const outView = new DataView(outBuffer);
    const outBytes = new Uint8Array(outBuffer);

    outView.setUint32(0, 0x46546C67, true);
    outView.setUint32(4, 2, true);
    outView.setUint32(8, totalLength, true);
    outView.setUint32(12, paddedLength, true);
    outView.setUint32(16, 0x4E4F534A, true);
    outBytes.set(paddedJsonBytes, 20);
    outBytes.set(restBytes, 20 + paddedLength);
    return outBuffer;
  } catch {
    return glbBuffer;
  }
}

export function createProceduralLegoBrickMesh(colorInput = 0, fallbackIndex = 0) {
  const group = new THREE.Group();
  group.name = '2x2_Lego_Brick_Root';
  const baseMat = cloneLegoPbrMaterial(null, colorInput, fallbackIndex);

  const bodyGeo = new THREE.BoxGeometry(1.58, 1.02, 1.58);
  const bodyMesh = new THREE.Mesh(bodyGeo, baseMat);
  bodyMesh.name = '2x2 Brick.162_Lego Brick_0';
  group.add(bodyMesh);

  const studGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.22, 24);
  const studOffsets = [
    [-0.39, 0.61, -0.39],
    [0.39, 0.61, -0.39],
    [-0.39, 0.61, 0.39],
    [0.39, 0.61, 0.39],
  ];
  for (const [sx, sy, sz] of studOffsets) {
    const stud = new THREE.Mesh(studGeo, baseMat);
    stud.position.set(sx, sy, sz);
    group.add(stud);
  }

  applyIsometricLegoRotation(group);
  group.userData = {
    isLegoBrick: true,
    baseColorFactor: baseMat.userData.baseColorFactor,
    material: baseMat,
  };
  return group;
}

export class LegoBrickLoader {
  constructor(legoBuffer = null, onError = () => {}) {
    this.buffer = legoBuffer;
    this.onError = onError;
    this.loaded = false;
    this.loading = false;
    this.templateGeometry = null;
    this.templateMaterial = null;
    this.listeners = new Set();
  }

  load(buffer = this.buffer) {
    if (buffer) this.buffer = buffer;
    if (!this.buffer) return;
    if (this.loaded) {
      for (const cb of this.listeners) cb(this);
      this.listeners.clear();
      return;
    }
    if (this.loading) return;
    this.loading = true;
    ensureLoaderNavigator();

    const safeBuffer = sanitizeGlbForReactNative(this.buffer);
    new GLTFLoader().parse(
      safeBuffer,
      '',
      gltf => {
        try {
          const root = gltf.scene;
          root.updateMatrixWorld(true);
          let foundMesh = null;
          root.traverse(node => {
            if (!foundMesh && node.isMesh && node.geometry?.attributes?.position) {
              foundMesh = node;
            }
          });
          if (!foundMesh) throw new Error('No mesh found in 2x2_lego_brick.glb');

          const bakedGeometry = foundMesh.geometry.clone();
          bakedGeometry.applyMatrix4(foundMesh.matrixWorld);
          bakedGeometry.computeBoundingBox();
          const box = bakedGeometry.boundingBox;
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const normalizeScale = 1.72 / maxDim;

          bakedGeometry.translate(-center.x, -center.y, -center.z);
          bakedGeometry.scale(normalizeScale, normalizeScale, normalizeScale);
          bakedGeometry.computeVertexNormals();

          this.templateGeometry = bakedGeometry;
          this.templateMaterial = foundMesh.material
            ? foundMesh.material.clone()
            : new THREE.MeshStandardMaterial({ metalness: 0.0, roughness: 0.22 });

          this.loaded = true;
          this.loading = false;
          for (const cb of this.listeners) cb(this);
          this.listeners.clear();
        } catch (err) {
          this.loading = false;
          this.onError(String(err));
        }
      },
      err => {
        this.loading = false;
        this.onError(String(err));
      }
    );
  }

  onReady(callback) {
    if (this.loaded) {
      callback(this);
      return () => {};
    }
    this.listeners.add(callback);
    if (this.buffer && !this.loading) this.load();
    return () => this.listeners.delete(callback);
  }

  createBrickInstance(colorInput, itemIndex = 0, rotationOptions = {}) {
    const material = cloneLegoPbrMaterial(this.templateMaterial, colorInput, itemIndex);
    const holder = new THREE.Group();
    holder.name = `LegoTimelineItem_${itemIndex}`;

    if (this.loaded && this.templateGeometry) {
      const mesh = new THREE.Mesh(this.templateGeometry, material);
      mesh.name = '2x2 Brick.162_Lego Brick_0';
      holder.add(mesh);
    } else {
      const fallback = createProceduralLegoBrickMesh(colorInput, itemIndex);
      fallback.rotation.set(0, 0, 0);
      fallback.traverse(child => {
        if (child.isMesh) child.material = material;
      });
      holder.add(fallback);
      this.onReady(() => {
        if (!this.templateGeometry) return;
        holder.clear();
        const glbMesh = new THREE.Mesh(this.templateGeometry, material);
        glbMesh.name = '2x2 Brick.162_Lego Brick_0';
        holder.add(glbMesh);
      });
    }

    applyIsometricLegoRotation(holder, rotationOptions);
    holder.userData = {
      isLegoBrick: true,
      itemIndex,
      baseColorFactor: material.userData.baseColorFactor,
      material,
      setColor: nextColor => {
        const nextFactor = resolveLegoBaseColorFactor(nextColor, itemIndex);
        material.color.setRGB(nextFactor[0], nextFactor[1], nextFactor[2]);
        material.opacity = nextFactor[3];
        material.userData.baseColorFactor = nextFactor;
        if (material.userData.pbrMetallicRoughness) {
          material.userData.pbrMetallicRoughness.baseColorFactor = nextFactor;
        }
        material.needsUpdate = true;
      },
    };
    return holder;
  }

  dispose() {
    this.listeners.clear();
  }
}

let sharedLegoLoaderInstance = null;
export function getSharedLegoBrickLoader(legoBuffer = null, onError = () => {}) {
  if (!sharedLegoLoaderInstance) {
    sharedLegoLoaderInstance = new LegoBrickLoader(legoBuffer, onError);
  }
  if (legoBuffer && !sharedLegoLoaderInstance.loaded && !sharedLegoLoaderInstance.loading) {
    sharedLegoLoaderInstance.load(legoBuffer);
  }
  return sharedLegoLoaderInstance;
}

export function createLegoIconScene(legoModelBuffer, { color, colorIndex = 0, onError = () => {}, onMeshSwapped = () => {} } = {}) {
  ensureLoaderNavigator();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0.08, 4.15);
  camera.lookAt(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.55);
  keyLight.position.set(2.8, 4.2, 3.6);
  const fillLight = new THREE.DirectionalLight(0xf8fafc, 0.75);
  fillLight.position.set(-2.6, 1.4, 2.2);
  scene.add(ambientLight, keyLight, fillLight);

  const loader = getSharedLegoBrickLoader(legoModelBuffer, onError);
  const brick = loader.createBrickInstance(color ?? colorIndex, colorIndex, {
    pitchDeg: 35,
    yawDeg: 45,
    rollDeg: 0,
  });
  scene.add(brick);
  const unsub = loader.onReady(() => {
    onMeshSwapped();
  });

  return {
    scene,
    camera,
    brick,
    loader,
    setColor(nextColor, nextIndex = colorIndex) {
      brick.userData.setColor(nextColor ?? nextIndex);
    },
    update() {
      applyIsometricLegoRotation(brick, { pitchDeg: 35, yawDeg: 45, rollDeg: 0 });
    },
    dispose() {
      unsub();
    },
  };
}

// GLTFLoader r162 assumes navigator.userAgent exists when navigator exists.
// React Native provides navigator without the browser userAgent field.
export function ensureLoaderNavigator(root = globalThis) {
 if (typeof root.navigator === 'undefined') root.navigator = {};
 if (typeof root.navigator.userAgent !== 'string') {
  Object.defineProperty(root.navigator, 'userAgent', { value: 'ReactNative', configurable: true });
 }
}
export function createNativeScene(modelBuffer, onError = () => {}, legoModelBuffer = null, options = {}) {
 ensureLoaderNavigator();
 const scene=new THREE.Scene();
 const camera=new THREE.PerspectiveCamera(32,1,.1,100); camera.position.set(0,0,7.9);
 const state={large:false,progress:0,rearVisibility:.07};
 const brainGroup=new THREE.Group(),bottleGroup=new THREE.Group(),stopwatchGroup=new THREE.Group(),cubeGroup=new THREE.Group(),chessGroup=new THREE.Group();
 scene.add(brainGroup,bottleGroup,stopwatchGroup,cubeGroup,chessGroup);
function pointMaterial({size=.012, opacity=.92, vertexColors=false, color=0xffffff, rear=.34, brainSurface=false}={}){
 const m=new THREE.PointsMaterial({
  size,vertexColors,color,transparent:true,opacity,
  blending:THREE.NormalBlending,depthTest:true,depthWrite:false,
  sizeAttenuation:true,toneMapped:false
 });
 const back={value:rear};
 m.userData.backUniform=back;
 m.onBeforeCompile=(shader)=>{
  shader.uniforms.uBackVisibility=back;
  shader.vertexShader=shader.vertexShader.replace(
   '#include <common>',
   '#include <common>\nattribute vec3 grainNormal;\nvarying float vFacing;\nvarying float vRelativeDepth;'
  );
  shader.vertexShader=shader.vertexShader.replace(
   '#include <project_vertex>',
   '#include <project_vertex>\n' +
   'vec3 eyeNormal = normalize(normalMatrix * grainNormal);\n' +
   'vFacing = dot(eyeNormal, normalize(-mvPosition.xyz));\n' +
   'vec4 viewOrigin = modelViewMatrix * vec4(0.0,0.0,0.0,1.0);\n' +
   'vRelativeDepth = mvPosition.z - viewOrigin.z;'
  );
  shader.fragmentShader=shader.fragmentShader.replace(
   '#include <common>',
   '#include <common>\nuniform float uBackVisibility;\nvarying float vFacing;\nvarying float vRelativeDepth;'
  );
  shader.fragmentShader=shader.fragmentShader.replace(
   '#include <alphatest_fragment>',
   'float normalWeight = smoothstep(-0.32,0.52,vFacing);\n' +
   'float depthWeight = smoothstep(-1.04,0.68,vRelativeDepth);\n' +
   (brainSurface ? 'float visibility = mix(uBackVisibility,1.0,normalWeight*depthWeight);\n' : 'float visibility = mix(uBackVisibility,1.0,clamp(0.62*normalWeight + 0.38*depthWeight,0.0,1.0));\n') +
   'diffuseColor.a *= visibility;\n' +
   '#include <alphatest_fragment>'
  );
 };
 m.customProgramCacheKey=()=> brainSurface?'myelin-brain-depth-v2':'myelin-grain-back-visibility-v1';
 return m;
}

// BLOCK 2: the original approved MRI particle brain renderer.
class BrainRenderer {
 constructor(){
  this.loaded=false;this.loading=false;this.failed=false;this.points=null;
  this.rawMeshes=[];this.center=new THREE.Vector3();this.scale=1;
  this.temp=new THREE.Vector3();this.norm=new THREE.Vector3();this.matN=new THREE.Matrix3();
 }
 load(){
  if(this.loading||this.loaded)return;
  this.loading=true;
  new GLTFLoader().parse(modelBuffer, '', gltf=>{
   try{
    const root=gltf.scene;root.updateMatrixWorld(true);let meshes=[];
    root.traverse(o=>{
     if(!o.isMesh||!o.geometry?.attributes?.position)return;
     let name=(o.name||'').toLowerCase();
     if(/hit.proxy|interactive|internal|amygdala|hippocampus|thalamus|callosum|nucleus|caudate|ventric|striat|putamen|brick|lego/.test(name))return;
     meshes.push(o);
    });
    if(!meshes.length)throw Error('No brain surface mesh found');
    let cortex=meshes.filter(m=>/cortex|frontal|temporal|occipital|parietal|cerebell|brain.stem|pial|hemisphere/i.test(m.name));
    if(cortex.length<2)throw Error('Invalid brain-atlas.glb: expected at least 2 cortical brain surface meshes');
    this.rawMeshes=cortex;
    let box=new THREE.Box3();
    this.rawMeshes.forEach(m=>{m.geometry.computeBoundingBox();box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld))});
    box.getCenter(this.center);
    let size=box.getSize(new THREE.Vector3());this.scale=3.4/Math.max(size.x,size.y,size.z);
    this.makeCloud();this.loaded=true;this.failed=false;


   }catch(err){this.failed=true;console.error('MRI particle renderer:',err);onError(String(err));}
  },err=>{
   this.failed=true;console.warn('Remote MRI atlas unavailable',err);
   onError(String(err));

  });
 }
 makeCloud(){
  if(!this.rawMeshes.length)return;
  if(this.points){brainGroup.remove(this.points);this.points.geometry.dispose();this.points.material.dispose();}
  const budget=state.large?75000:44000;
  let weighted=this.rawMeshes.map(m=>{m.geometry.computeBoundingBox();let g=m.geometry,box=g.boundingBox;let s=box.getSize(new THREE.Vector3());return{m,weight:Math.max(0.01,s.x*s.y+s.z*s.x+s.y*s.z)}});
  let total=weighted.reduce((a,b)=>a+b.weight,0),coords=[],cols=[],normals=[];
  let light=new THREE.Vector3(-.38,.64,.72).normalize();
  for(const {m,weight} of weighted){
   let n=Math.round(budget*weight/total),sampler=new MeshSurfaceSampler(m).build();this.matN.getNormalMatrix(m.matrixWorld);
   for(let i=0;i<n;i++){
    sampler.sample(this.temp,this.norm);
    this.temp.applyMatrix4(m.matrixWorld).sub(this.center).multiplyScalar(this.scale);
    this.norm.applyMatrix3(this.matN).normalize();
    coords.push(this.temp.x,this.temp.y,this.temp.z);
    normals.push(this.norm.x,this.norm.y,this.norm.z);
    const shade=Math.max(.24,.36+Math.max(0,this.norm.dot(light))*.55);let noise=(.82+Math.random()*.18)*shade;
    cols.push(noise,noise,noise);
   }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));
  geometry.setAttribute('grainNormal',new THREE.Float32BufferAttribute(normals,3));
  // Exact v2 MRI geometry and density, original white dots restored.
  // Only change: the far side is softly dimmed, never deleted.
  const mat=pointMaterial({size:state.large?.013:.012,vertexColors:true,opacity:.95,rear:state.rearVisibility,brainSurface:true});
  this.points=new THREE.Points(geometry,mat);brainGroup.add(this.points);

 }
 setDensity(){if(this.loaded)this.makeCloud();}
 setRearVisibility(value){
  if(this.points?.material?.userData?.backUniform)this.points.material.userData.backUniform.value=value;
 }
}

// BLOCK 3: independently generated monochrome particle-water bottle.
// Same point-based language as the brain, without replacing or modifying it.
class BottleRenderer {
 constructor(){
  this.ready=false;this.shell=null;this.cap=null;this.water=null;this.waterline=null;this.surface=null;
  this.fluidRoot=new THREE.Group();this.waterBody=null;this.fillPercent=0;bottleGroup.add(this.fluidRoot);
  this.waterPoints=0;this.yBottom=-1.26;this.yTop=.88;this.shellMaxY=1.35;this.gravitySlope=.22;this.materials=[];
  this.motion=new LiquidMotion();this.wavePhase=0;
 }
 // Profile (Y, radius): flat base, ribbed bottle body, tapered shoulders, narrow neck, screw cap.
 radius(y){
  if(y<-1.26) return .20 + (y+1.34)/.08*.17;
  if(y<-1.16) return .37+((y+1.26)/.10)*.095;
  if(y<.53){
   let waist=1-.055*Math.exp(-Math.pow((y+.13)/.24,2));
   let ridges=.0095*Math.sin((y+.38)*60)*Math.exp(-Math.pow((y+.5)/.55,4));
   return .465*waist+ridges;
  }
  if(y<.90){
   const t=(y-.53)/.37;
   const s=t*t*(3-2*t);
   return .465*(1-s)+.174*s;
  }
  if(y<1.11)return .174;
  if(y<1.17)return .186;
  if(y<1.32)return .208 + .012*Math.sin((y-1.17)*175);
  return .208;
 }
 dispose(){
  for(const obj of [this.shell,this.cap,this.water,this.waterline,this.surface,this.waterBody]){
   if(!obj)continue;
   obj.parent?.remove(obj);obj.geometry.dispose();obj.material.dispose();
  }
  this.shell=this.cap=this.water=this.waterline=this.surface=this.waterBody=null;
 }
 makePointGeometry(pos,normals,colors){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('grainNormal',new THREE.Float32BufferAttribute(normals,3));
  if(colors)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return g;
 }
 build(){
  this.dispose();
  const rand=(()=>{let s=0x5f3759df;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};})();
  const light=new THREE.Vector3(-.42,.58,.72).normalize();
  const pos=[],norms=[],creamCols=[],blueCols=[];
  const bodyN=state.large?21000:15000;
  const profile=[];
  for(let i=0;i<=235;i++){
   const y=-1.34+(1.32+1.34)*i/235;
   profile.push(new THREE.Vector2(this.radius(y),y));
  }
  const lathe=new THREE.LatheGeometry(profile,88);
  const tmpMaterial=new THREE.MeshBasicMaterial();
  const samplingMesh=new THREE.Mesh(lathe,tmpMaterial);
  samplingMesh.updateMatrixWorld(true);
  const sampler=new MeshSurfaceSampler(samplingMesh).build();
  const p=new THREE.Vector3(),n=new THREE.Vector3();
  const pushShellGrain=(px,py,pz,nx,ny,nz,creamLum,blueLum,jitter)=>{
   pos.push(px,py,pz);norms.push(nx,ny,nz);
   const vc=Math.min(1.0,creamLum*jitter);
   creamCols.push(vc*CREAM_RGB_NORM[0],vc*CREAM_RGB_NORM[1],vc*CREAM_RGB_NORM[2]);
   const vb=Math.min(1.0,blueLum*jitter);
   blueCols.push(vb*PROGRESS_RGB_NORM[0],vb*PROGRESS_RGB_NORM[1],vb*PROGRESS_RGB_NORM[2]);
  };
  for(let i=0;i<bodyN;i++){
   sampler.sample(p,n);
   // Fresnel-like chalk stipple: silhouette edges are crisp & bright (#F2E7D0),
   // while center-facing empty glass is dark and airy like the reference image.
   const absZ=Math.abs(n.z);
   if(absZ>.58 && rand()<.42) continue;
   const diffuse=Math.max(0,n.dot(light));
   const rim=Math.pow(Math.max(0,1-absZ),1.55);
   const isNeckOrCap=p.y>.82;
   const creamLit=Math.min(1.0,(isNeckOrCap?.46:.24)+.36*diffuse+.52*rim);
   const blueLit=Math.min(1.0,.48+.34*diffuse+.32*rim);
   pushShellGrain(p.x,p.y,p.z,n.x,n.y,n.z,creamLit,blueLit,.84+.16*rand());
  }
  // Crisp silhouette & cap/neck contour rings
  const bands=[-1.31,-1.23,-1.13,-.94,-.68,.48,.86,.94,1.02,1.11,1.16,1.21,1.26,1.30,1.32];
  for(const y of bands){
   const r=this.radius(y)+.004;
   const isCap=y>=.86;
   const count=isCap?(state.large?260:190):(state.large?160:110);
   for(let i=0;i<count;i++){
    const a=(i+rand()*.25)/count*Math.PI*2;
    const nx=Math.cos(a),nz=Math.sin(a);
    const rim=Math.pow(Math.max(0,1-Math.abs(nz)),1.2);
    const creamLit=isCap?(.62+.34*rim):(.38+.48*rim);
    pushShellGrain(r*nx,y+(rand()-.5)*.003,r*nz,nx,0,nz,creamLit,.78,.86+.14*rand());
   }
  }
  const shellG=this.makePointGeometry(pos,norms,creamCols);
  this.shell=new THREE.Points(shellG,pointMaterial({size:state.large?.0116:.0108,opacity:.92,vertexColors:true,rear:.15}));
  this.shell.userData.creamColors=new Float32Array(creamCols);
  this.shell.userData.blueColors=new Float32Array(blueCols);
  bottleGroup.add(this.shell);
  lathe.dispose();tmpMaterial.dispose();

  // Interior + wall dusty-blue liquid point cloud; sorted by gravity-compensated height
  // (effectiveY = y - gravitySlope * x) so the water level sits horizontal inside the tilted bottle.
  const nWater=state.large?23000:15500;
  const rawWater=[];
  for(let i=0;i<nWater;i++){
   const frac=(i+.1+rand()*.8)/nWater;
   const y=this.yBottom+frac*(this.yTop-this.yBottom);
   const maxR=Math.max(.04,this.radius(y)-.018);
   const radialFrac=i%3===0?(.84+.16*rand()):Math.pow(rand(),.44);
   const radius=maxR*radialFrac;
   const a=rand()*Math.PI*2;
   const nx=Math.cos(a),nz=Math.sin(a);
   const px=radius*nx,pz=radius*nz;
   const effY=y-this.gravitySlope*px;
   const diffuse=Math.max(0,nx*light.x+.18*light.y+nz*light.z);
   const rim=Math.pow(Math.max(0,1-Math.abs(nz)),1.3);
   const shade=Math.min(1.0,(.56+.30*diffuse+.24*rim)*(.82+.18*rand()));
   const highlight=radialFrac>.86?.24:0;
   const rCol=(PROGRESS_RGB_NORM[0]*(1-highlight)+ACCENT_RGB_NORM[0]*highlight)*shade;
   const gCol=(PROGRESS_RGB_NORM[1]*(1-highlight)+ACCENT_RGB_NORM[1]*highlight)*shade;
   const bCol=(PROGRESS_RGB_NORM[2]*(1-highlight)+ACCENT_RGB_NORM[2]*highlight)*shade;
   rawWater.push({px,py:y,pz,nx,ny:.18,nz,rCol,gCol,bCol,effY});
  }
  rawWater.sort((a,b)=>a.effY-b.effY);
  const waterPos=[],waterNormals=[],waterCols=[];
  for(const w of rawWater){
   waterPos.push(w.px,w.py,w.pz);
   waterNormals.push(w.nx,w.ny,w.nz);
   waterCols.push(w.rCol,w.gCol,w.bCol);
  }
  const waterGeo=this.makePointGeometry(waterPos,waterNormals,waterCols);
  this.water=new THREE.Points(waterGeo,pointMaterial({
   size:state.large?.0114:.0106,opacity:.90,vertexColors:true,rear:.24
  }));
  this.fluidRoot.add(this.water);this.waterPoints=nWater;
  this.water.userData.basePositions=this.water.geometry.attributes.position.array.slice();

  this.waterBody=new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(.33,this.yBottom),new THREE.Vector2(.33,this.yBottom+.01)],64),
   new THREE.MeshBasicMaterial({color:CHALK_PROGRESS_RGB,side:THREE.DoubleSide,transparent:true,opacity:.14,depthTest:true,depthWrite:false,toneMapped:false}));
  this.waterBody.renderOrder=0;this.fluidRoot.add(this.waterBody);

  this.surface=new THREE.Mesh(
   new THREE.CircleGeometry(1,72),
   new THREE.MeshBasicMaterial({color:CHALK_PROGRESS_RGB,side:THREE.DoubleSide,transparent:true,
    opacity:.16,depthWrite:false,depthTest:true,toneMapped:false})
  );
  this.surface.rotation.x=-Math.PI/2;
  this.surface.renderOrder=1;
  this.fluidRoot.add(this.surface);
  this.surface.userData.basePositions=this.surface.geometry.attributes.position.array.slice();

  // Subtle chalk-blue meniscus waterline grains aligned to the gravity-compensated surface
  const wavePos=[];
  const waveN=[];
  const count=state.large?440:320;
  for(let i=0;i<count;i++){
   const a=i/count*Math.PI*2;
   const r=.36*(.92+.08*rand());
   const wx=r*Math.cos(a),wz=r*Math.sin(a);
   wavePos.push(wx,this.gravitySlope*wx,wz);
   waveN.push(0,1,0);
  }
  this.waterline=new THREE.Points(this.makePointGeometry(wavePos,waveN,null),new THREE.PointsMaterial({
   color:CHALK_ACCENT_RGB,size:.015,transparent:true,opacity:.72,depthWrite:false,blending:THREE.NormalBlending,toneMapped:false
  }));
  this.fluidRoot.add(this.waterline);
  this.waterline.userData.basePositions=this.waterline.geometry.attributes.position.array.slice();
  bottleGroup.scale.setScalar(1.05);
  this.ready=true;this.setFill(state.progress);
  this.resetMotion();
 }
 resetMotion(yaw=null,pitch=null){
  this.motion.reset(yaw,pitch);this.wavePhase=0;
  this.fluidRoot.rotation.set(0,0,0);
  this.fluidRoot.position.set(0,0,0);
  if(this.surface)this.surface.rotation.set(-Math.PI/2,0,0);
  this.applyLiquidSurfaceDeformation({tiltX:0,tiltZ:0,wave:0});
 }
 applyLiquidSurfaceDeformation(motion){
  if(!this.ready||!this.waterBody?.geometry)return;
  const fill=this.fillPercent;
  const fillY=this.yBottom+fill*(this.yTop-this.yBottom);
  const phase=this.wavePhase;
  for(const obj of [this.water,this.waterBody]){
   if(!obj?.visible)continue;
   const attr=obj.geometry.attributes.position;
   const base=obj.userData.basePositions;
   if(!base||base.length!==attr.array.length)continue;
   for(let i=0;i<attr.count;i++){
    const j=i*3;
    const delta=fluidHeightDelta(base[j],base[j+1],base[j+2],motion,this.yBottom,fillY,phase,fill);
    attr.array[j]=base[j];attr.array[j+1]=base[j+1]+delta;attr.array[j+2]=base[j+2];
   }
   attr.needsUpdate=true;
  }
  if(this.waterline?.visible){
   const attr=this.waterline.geometry.attributes.position;
   const base=this.waterline.userData.basePositions;
   for(let i=0;i<attr.count;i++){
    const j=i*3,x=base[j]*this.waterline.scale.x,z=base[j+2]*this.waterline.scale.z;
    attr.array[j+1]=base[j+1]+surfaceDisplacement(x,z,motion,fill,phase);
   }
   attr.needsUpdate=true;
  }
  if(this.surface?.visible){
   const attr=this.surface.geometry.attributes.position;
   const base=this.surface.userData.basePositions;
   for(let i=0;i<attr.count;i++){
    const j=i*3;
    const x=base[j]*this.surface.scale.x;
    const z=-base[j+1]*this.surface.scale.y;
    attr.array[j+2]=surfaceDisplacement(x,z,motion,fill,phase);
   }
   attr.needsUpdate=true;
  }
 }
 nudge(){this.motion.nudge();}
 updateMotion(dtMs,yaw,pitch,reducedMotion=false){
  if(!this.ready)return;
  const motion=this.motion.update(dtMs,{yaw,pitch,reducedMotion});
  this.wavePhase+=Math.min(dtMs,48)*.006;
  this.applyLiquidSurfaceDeformation(motion);
 }
 setFill(percent){
  if(!this.ready)return;
  const fill=THREE.MathUtils.clamp((Number(percent)||0)/100,0,1);
  this.fillPercent=fill;
  this.water.geometry.setDrawRange(0,Math.floor(this.waterPoints*fill));
  this.water.visible=fill>.001;
  this.waterBody.visible=fill>.001;
  this.waterline.visible=fill>.001&&fill<.997;
  this.surface.visible=fill>.001&&fill<.997;
  const y=fill>=.999?this.shellMaxY:(this.yBottom+fill*(this.yTop-this.yBottom));
  if(this.shell?.geometry?.attributes?.color && this.shell.userData.creamColors && this.shell.userData.blueColors){
   const posAttr=this.shell.geometry.attributes.position;
   const colAttr=this.shell.geometry.attributes.color;
   const cream=this.shell.userData.creamColors;
   const blue=this.shell.userData.blueColors;
   for(let i=0;i<posAttr.count;i++){
    const j=i*3;
    const px=posAttr.array[j],py=posAttr.array[j+1];
    const effY=fill>=.999?py:(py-this.gravitySlope*px);
    const submerged=fill>.001 && effY<=y;
    colAttr.array[j]=submerged?blue[j]:cream[j];
    colAttr.array[j+1]=submerged?blue[j+1]:cream[j+1];
    colAttr.array[j+2]=submerged?blue[j+2]:cream[j+2];
   }
   colAttr.needsUpdate=true;
  }
  if(fill>.001){
   const profile=[];
   const topLatheY=Math.min(this.yTop,y);
   for(let i=0;i<=28;i++){
    const yy=this.yBottom+(topLatheY-this.yBottom)*i/28;
    profile.push(new THREE.Vector2(Math.max(.04,this.radius(yy)-.065),yy));
   }
   this.waterBody.geometry.dispose();
   this.waterBody.geometry=new THREE.LatheGeometry(profile,64);
   this.waterBody.userData.basePositions=this.waterBody.geometry.attributes.position.array.slice();
  }
  const surfaceY=Math.min(this.yTop,y);
  this.waterline.position.y=surfaceY;
  this.surface.position.y=surfaceY;
  const r=Math.max(.07,this.radius(surfaceY)-.048);
  this.waterline.scale.set(r/.36,1,r/.36);
  this.surface.scale.set(r,r,1);
 }
 setDensity(){this.build();}
}


// BLOCK 3B: procedural grain stopwatch. Independent of the MRI brain and bottle.
// References: conventional Three.js watch geometry and hand rotations.
// The dial maps 0–100% to one complete 60-second revolution.
class StopwatchRenderer {
 constructor(){
  this.ready=false;
  this.decor=[];
  this.handGroup=new THREE.Group();
  this.progressDots=null;
  this.completionSector=null;
  this.trackCount=140;
  this.handMotion=new HandMotion(0);
  stopwatchGroup.add(this.handGroup);
 }
 pointCloud(coords,normals,{size=.011,opacity=.85,colors=null,rear=.35,dim=false}={}){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  g.setAttribute('grainNormal',new THREE.Float32BufferAttribute(normals,3));
  if(colors)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const m=pointMaterial({size,opacity,vertexColors:!!colors,rear:dim?rear:1});
  const pts=new THREE.Points(g,m);
  stopwatchGroup.add(pts);
  this.decor.push(pts);
  return pts;
 }
 clean(){
  for(const o of this.decor){stopwatchGroup.remove(o);o.geometry.dispose();o.material.dispose();}
  this.decor=[];
  this.completionSector=null;
  for(const o of [...this.handGroup.children]){this.handGroup.remove(o);o.geometry.dispose();o.material.dispose();}
 }
 build(){
  this.clean();
  const rand=(()=>{let n=0x7b9e4127;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296}})();
  const pi=Math.PI, tau=pi*2;
  const body=[],norm=[],colors=[];
  const push=(x,y,z,nx,ny,nz,light=1)=>{
   body.push(x,y,z);norm.push(nx,ny,nz);
   const q=light*(.75+rand()*.25);
   colors.push(q*CREAM_RGB_NORM[0],q*CREAM_RGB_NORM[1],q*CREAM_RGB_NORM[2]);
  };
  // All three-dimensional case surfaces consist of white particle grains.
  // Cylinder ring: bezel / sides / front and back ridges.
  let N=state.large?19000:11500;
  for(let i=0;i<N;i++){
   const a=rand()*tau;
   const option=rand();
   let r,z,nx,ny,nz;
   if(option<.65){
    r=1.21+rand()*.085;z=-.24+rand()*.40;
    nx=Math.cos(a);ny=Math.sin(a);nz=0;
   }else{
    r=1.11+rand()*.18;z=option<.90?.205:-.24;
    nx=0;ny=0;nz=z>0?1:-1;
   }
   const lit=.48+.45*Math.max(0,nx*(-.40)+ny*.55+nz*.75);
   push(Math.cos(a)*r,Math.sin(a)*r,z,nx,ny,nz,lit);
  }
  // Continuous thin concentric edge rings keep the metal silhouette identifiable.
  for(const [r,z] of [[1.3,.13],[1.295,-.21],[1.21,.23],[1.09,.24]]){
   const count=state.large?1400:920;
   for(let j=0;j<count;j++){
    const a=j/count*tau+(rand()-.5)*.001;
    push(r*Math.cos(a),r*Math.sin(a),z,Math.cos(a),Math.sin(a),.35,.66);
   }
  }
  // A faint sparse dial interior lets the tick marks and hand stay prominent.
  const interior=state.large?2300:1050;
  for(let i=0;i<interior;i++){
   const r=Math.sqrt(rand())*1.035,a=rand()*tau;
   push(Math.cos(a)*r,Math.sin(a)*r,.18,0,0,1,.19);
  }
  // Particle backplate: a full disc closes the rear of the case.
  for(let i=0;i<(state.large?7200:4200);i++){
   const r=Math.sqrt(rand())*1.10,a=rand()*tau;
   push(r*Math.cos(a),r*Math.sin(a),-.245,0,0,-1,.50);
  }
  // Stopwatch crown top: central stem, button and hanger ring.
  for(let i=0;i<(state.large?2000:1150);i++){
   let a=rand()*tau;
   if(i%3===0){
    const y=1.29+rand()*.24,r=.125;
    push(r*Math.cos(a),y,r*Math.sin(a),Math.cos(a),0,Math.sin(a),.78);
   }else{
    const y=1.54+rand()*.13,r=.225;
    push(r*Math.cos(a),y,r*Math.sin(a),Math.cos(a),0,Math.sin(a),.87);
   }
  }
  // Two top-side pushers, separated from the main crown.
  for(const side of [-1,1]){
   for(let i=0;i<(state.large?800:430);i++){
    const a=rand()*tau, t=rand(),x=side*(.56+.07*t),y=1.20+.18*t,z=Math.cos(a)*.095;
    push(x,y,z,side,0,Math.cos(a),.6);
   }
  }
  this.pointCloud(body,norm,{size:state.large?.0128:.0115,opacity:.85,colors,rear:.32,dim:true});

  // Opaque back-facing depth surface keeps the front dial from showing through the rear.
  const backplate=new THREE.Mesh(new THREE.CircleGeometry(1.105,64),new THREE.MeshBasicMaterial({color:CHALK_STAGE_RGB,side:THREE.BackSide,depthWrite:true}));
  backplate.position.z=-.238;
  stopwatchGroup.add(backplate);this.decor.push(backplate);

  // Completion material: one translucent 3D sector, not thousands of
  // transparent particles layered on top of each other. At 50%, it fills
  // precisely half the face; the grain case, minute marks and hand stay white.
  // Pre-build all triangles once and change drawRange during progress updates.
  const sectorXYZ=[];
  for(let i=0;i<SECTOR_SEGMENTS;i++){
   const a=Math.PI/2-2*Math.PI*i/SECTOR_SEGMENTS;
   const b=Math.PI/2-2*Math.PI*(i+1)/SECTOR_SEGMENTS;
   sectorXYZ.push(0,0,.228,
    .955*Math.cos(a),.955*Math.sin(a),.228,
    .955*Math.cos(b),.955*Math.sin(b),.228);
  }
  const sectorGeometry=new THREE.BufferGeometry();
  sectorGeometry.setAttribute('position',new THREE.Float32BufferAttribute(sectorXYZ,3));
  this.completionSector=new THREE.Mesh(sectorGeometry,new THREE.MeshBasicMaterial({
   color:COMPLETION_RGB,side:THREE.DoubleSide,transparent:true,opacity:.23,
   blending:THREE.NormalBlending,depthTest:true,depthWrite:false,toneMapped:false
  }));
  this.completionSector.renderOrder=1;
  stopwatchGroup.add(this.completionSector);
  this.decor.push(this.completionSector);

  // Dial: minute indices from 0 to 60 and 4 cardinal number labels made of dots.
  const tick=[],tn=[];
  const tickPoint=(x,y,z=.252)=>{tick.push(x,y,z);tn.push(0,0,1)};
  for(let i=0;i<60;i++){
   const a=pi/2-i*tau/60;
   const major=i%5===0;
   const start=major?.86:.935,end=1.045;
   const steps=major?14:5;
   for(let j=0;j<steps;j++){
    const r=start+(end-start)*j/Math.max(1,steps-1);
    tickPoint(r*Math.cos(a),r*Math.sin(a));
   }
  }
  const digitShapes={
   '0':['111','101','101','101','111'],
   '1':['010','110','010','010','111'],
   '3':['111','001','111','001','111'],
   '4':['101','101','111','001','001'],
   '5':['111','100','111','001','111'],
   '6':['111','100','111','101','111']
  };
  const stamp=(str,cx,cy)=>{
   const cell=.029;
   const width=str.length*4-1;
   for(let k=0;k<str.length;k++){
    const shape=digitShapes[str[k]];
    if(!shape)continue;
    for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(shape[row][col]==='1'){
     const x=cx + (k*4+col-(width-1)/2)*cell;
     const y=cy+(2-row)*cell;
     // a cluster of small grains at each bitmap location
     for(let q=0;q<2;q++)tickPoint(x+(rand()-.5)*.006,y+(rand()-.5)*.006,.255);
    }
   }
  };
  stamp('60',0,.68); stamp('15',.70,0); stamp('30',0,-.68); stamp('45',-.70,0);
  const indexCloud=this.pointCloud(tick,tn,{size:state.large?.020:.017,opacity:.98});
  indexCloud.material.color.setHex(CHALK_CREAM_RGB);
  indexCloud.renderOrder=2;

  // Fine progress track is a physical part of the dial, never a surrounding UI ring.
  const track=[],trackN=[];
  for(let i=0;i<this.trackCount;i++){
   const a=pi/2-i*tau/this.trackCount;
   track.push(1.095*Math.cos(a),1.095*Math.sin(a),.264);
   trackN.push(0,0,1);
  }
  this.progressDots=this.pointCloud(track,trackN,{size:.021,opacity:.96});
  this.progressDots.material.color.setHex(CHALK_ACCENT_RGB);
  this.progressDots.renderOrder=2;
  this.progressDots.geometry.setDrawRange(0,0);

  // Separate hand group so its rotation can be animated without resampling geometry.
  const pointer=[],pointerN=[];
  const pPush=(x,y,z)=>{pointer.push(x,y,z);pointerN.push(0,0,1)};
  for(let j=0;j<148;j++){
   const y=-.20 + 1.10*j/147;
   const width=y<0?.027:.019;
   pPush((rand()-.5)*width,y,.322);
   if(j%2===0)pPush((rand()-.5)*width,y,.325);
  }
  // Center pivot and small counterweight disc.
  for(let i=0;i<180;i++){
   const a=rand()*tau,r=Math.sqrt(rand())*.073;
   pPush(r*Math.cos(a),r*Math.sin(a),.337);
  }
  const handGeo=new THREE.BufferGeometry();
  handGeo.setAttribute('position',new THREE.Float32BufferAttribute(pointer,3));
  handGeo.setAttribute('grainNormal',new THREE.Float32BufferAttribute(pointerN,3));
  const hand=new THREE.Points(handGeo,pointMaterial({size:state.large?.020:.018,opacity:1,color:CHALK_CREAM_RGB,rear:1}));
  this.handGroup.add(hand);
  hand.renderOrder=3;
  this.handGroup.position.set(0,0,0);
  this.ready=true;
  this.setPercent(state.progress);
 }
 setPercent(value,{animateHand=false,handPercent=value}={}){
  const p=THREE.MathUtils.clamp(value/100,0,1);
  // The hand tracks the sector on the same frame. Any tiny lead is computed
  // *within* the active reveal; there is no spring catching up afterward.
  this.handMotion.snap(handPercent);
  this.handGroup.rotation.z=this.handMotion.angle;
  if(this.completionSector)this.completionSector.geometry.setDrawRange(0,sectorIndexCount(value));
  if(this.progressDots)this.progressDots.geometry.setDrawRange(0,Math.round(this.trackCount*p));
 }
 snapHand(percent){
  this.handMotion.snap(percent);this.handGroup.rotation.z=this.handMotion.angle;
 }
 kickHand(){this.handMotion.kick();}
 updateMotion(dtMs,reducedMotion=false){
  this.handMotion.update(dtMs,{reducedMotion});
  this.handGroup.rotation.z=this.handMotion.angle;
 }
 setDensity(){this.build();}
}


 const brain = new BrainRenderer(), bottle = new BottleRenderer(), watch = new StopwatchRenderer();
 let cube, chess;
 function prepareModels(mode) {
  if (mode !== 'stopwatch' && !bottle.ready) bottle.build();
  if (mode !== 'bottle' && !watch.ready) watch.build();
  if (mode === 'cycle' && !cube) {
   cube = new CubeRenderer(cubeGroup, THREE, pointMaterial, { large: false });
   chess = new ChessRenderer(chessGroup, THREE, pointMaterial, { large: false });
   if (modelBuffer) brain.load();
  }
 }
 prepareModels(options.mode || 'cycle');
 const groups=[brainGroup,bottleGroup,stopwatchGroup,cubeGroup,chessGroup];
 const keys=['brain','bottle','stopwatch','cube','chess'];
 function resolveModeIndex(m){
  if(m==='bottle')return 1;
  if(m==='stopwatch')return 2;
  return null;
 }
 let activeMode=options?.mode||'cycle';
 let lockedIndex=resolveModeIndex(activeMode);
 let current=lockedIndex!==null?lockedIndex:0,elapsed=0,localTime=0,transition=null,lastProgress=NaN;
 const framing=new Map(), fadedMaterials=new Map();
 // Compute framing once per object/aspect, after the offline model is ready.
 // Uniform scaling preserves the sculpture; camera distance fits its silhouette.
 function frameObject(index){
  const group=groups[index];
  if(index===0&&!brain.loaded)return;
  const cacheKey=`${index}:${camera.aspect}`;
  let frame=framing.get(cacheKey);
  if(!frame){
   const rotation=group.rotation.clone(),scale=group.scale.clone(),position=group.position.clone();
   const p=DEFAULT_POSES[keys[index]];
   group.rotation.set(p.pitch,p.yaw,index===1?-.35:0);
   group.scale.setScalar(p.scale*1.04);group.position.set(0,0,0);
   group.updateMatrixWorld(true);
   const box=new THREE.Box3().setFromObject(group,true);
   if(!box.isEmpty()){
    const center=box.getCenter(new THREE.Vector3());
    const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),vertex=new THREE.Vector3();
    // Fit the actual vertices, including unrevealed progress geometry. A box
    // alone leaves too much empty space around the brain and the narrow bottle.
    let distance=2;
    group.traverse(o=>{
     const positions=o.geometry?.attributes.position;
     if(!positions||o.material?.colorWrite===false)return;
     for(let i=0;i<positions.count;i++){
      vertex.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld).sub(center);
      distance=Math.max(distance,vertex.z+Math.max(Math.abs(vertex.y)/(tan*.84),Math.abs(vertex.x)/(tan*camera.aspect*.84)));
     }
    });
    frame={center,distance};framing.set(cacheKey,frame);
   }
   group.rotation.copy(rotation);group.scale.copy(scale);group.position.copy(position);
   group.updateMatrixWorld(true);
  }
  if(frame){camera.position.set(frame.center.x,frame.center.y,frame.center.z+frame.distance);camera.lookAt(frame.center);camera.updateMatrixWorld(true);}
 }
 function restoreOpacity(){
  for(const [material,opacity] of fadedMaterials)material.opacity=opacity;
  fadedMaterials.clear();
 }
 function fade(group,amount){
  group.traverse(o=>{
   for(const m of (Array.isArray(o.material)?o.material:o.material?[o.material]:[])){
    // Depth-only masks stay intact; all visible surfaces are already transparent.
    if(m.colorWrite===false)continue;
    if(!fadedMaterials.has(m))fadedMaterials.set(m,m.opacity);
    m.opacity=fadedMaterials.get(m)*amount;
   }
  });
 }
 function idlePose(index,time,reduced,drag){
  const p=DEFAULT_POSES[keys[index]],g=groups[index],t=reduced?0:time/1000;
  const yaw=reduced?0:.14*Math.sin(t*.65),pitch=reduced?0:.018*Math.sin(t*.82);
  const pulse=reduced?1:1+.014*Math.sin(t*(index===0?1.9:1.25));
  const roll=index===1?-.35+(reduced?0:.022*Math.sin(t*.8)):(reduced?0:.012*Math.sin(t*.7));
  g.rotation.set(p.pitch+drag.y+pitch,p.yaw+drag.x+yaw,roll);
  g.scale.setScalar(p.scale*pulse);
  g.position.y=reduced?0:.025*Math.sin(t*(index===4?1.15:.75));
 }
 const legoLoader = getSharedLegoBrickLoader(legoModelBuffer, onError);
 return {scene,camera,legoLoader,bottle,watch,
 getModel(){return activeMode;},
 setModel(nextMode){
  const nextLocked=resolveModeIndex(nextMode);
  activeMode=nextLocked!==null?nextMode:'cycle';
  prepareModels(activeMode);
  lastProgress=NaN;
  if(nextLocked!==null&&nextLocked!==current){
   const from=current;current=nextLocked;localTime=0;
   transition={from,to:nextLocked,time:0};
   if(nextLocked===1)bottle.resetMotion(DEFAULT_POSES.bottle.yaw,DEFAULT_POSES.bottle.pitch);
  }
  lockedIndex=nextLocked;
 },
 createLegoItemBrick(colorOrIndex, index = 0, rotationOptions = { pitchDeg: 35, yawDeg: 45, rollDeg: 0 }) {
  return legoLoader.createBrickInstance(colorOrIndex, index, rotationOptions);
 },
 update(dt,progress,reduced,drag={x:0,y:0}){
  restoreOpacity();
  const delta=Math.max(0,Math.min(64,dt));elapsed+=delta;localTime+=delta;
  progress=Math.max(0,Math.min(100,Number(progress)||0));state.progress=progress;
  const next=lockedIndex!==null?lockedIndex:(Math.floor(elapsed/6000)%5);
  if(next!==current){
   const from=current;current=next;localTime=0;
   transition=reduced?null:{from,to:next,time:0};
   drag.x=0;drag.y=0;
   if(next===1)bottle.resetMotion(DEFAULT_POSES.bottle.yaw,DEFAULT_POSES.bottle.pitch);
  }
  groups.forEach(g=>{g.visible=false;});
  let displayed=current,alpha=1;
  if(transition&&!reduced){
   transition.time+=delta;
   const t=transition.time;
   // A short fade-through avoids superimposed particle silhouettes. No turn,
   // sideways squash, or scale jump. Incoming motion starts at its resting pose.
   if(t<220){displayed=transition.from;alpha=1-easeInOutCubic(t/220);}
   else {displayed=transition.to;alpha=easeInOutCubic((t-220)/340);idlePose(displayed,t-220,false,drag);localTime=t-220;}
   if(t>=560)transition=null;
  }else{
   transition=null;idlePose(current,localTime,reduced,drag);
  }
  const visible=groups[displayed];visible.visible=true;frameObject(displayed);
  if(progress!==lastProgress){if(bottle.ready)bottle.setFill(progress);if(watch.ready)watch.setPercent(progress);cube?.setProgress(progress,{animate:!reduced});chess?.setProgress(progress,{animate:!reduced});lastProgress=progress;}
  if(displayed===1)bottle.updateMotion(delta,bottleGroup.rotation.y,bottleGroup.rotation.x,reduced);
  if(displayed===2)watch.updateMotion(delta,reduced);
  if(displayed===3)cube?.update(elapsed,reduced);
  if(displayed===4)chess?.update(elapsed,reduced);
  if(alpha<1)fade(visible,alpha);
 },dispose(){scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of (Array.isArray(o.material)?o.material:[o.material]))m.dispose();}});}
 };
}
