const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
function shape(node,angle=node.rotation[1]){
 const [w,,d]=node.asset.dimensions.map((v,i)=>v*node.scale[i]);
 return {u:[Math.cos(angle),-Math.sin(angle)],v:[Math.sin(angle),Math.cos(angle)],hw:w/2,hd:d/2};
}
export function furnitureWalls(node,nodes){
 const h=node.asset.dimensions[1]*node.scale[1],y=node.position[1];
 return Object.values(nodes).filter(w=>w.type==='wall'&&w.visible!==false&&w.parentId===node.parentId&&y<(w.height||2.8)&&y+h>0);
}
function axesFor(s,w){
 const dx=w.end[0]-w.start[0],dz=w.end[1]-w.start[1],length=Math.hypot(dx,dz);
 if(length<1e-8)return null;
 const tangent=[dx/length,dz/length],normal=[-tangent[1],tangent[0]];
 const center=[(w.start[0]+w.end[0])/2,(w.start[1]+w.end[1])/2];
 return [s.u,s.v,tangent,normal].map(axis=>({axis,center,radius:s.hw*Math.abs(dot(s.u,axis))+s.hd*Math.abs(dot(s.v,axis))+length/2*Math.abs(dot(tangent,axis))+(w.thickness/2+.001)*Math.abs(dot(normal,axis))}));
}
function sweep(s,position,delta,wall){
 const axes=axesFor(s,wall);if(!axes)return null;
 let entry=-Infinity,exit=Infinity,normal=null,inside=true,minDepth=Infinity,outward=null;
 for(const a of axes){
  const c=dot([position[0]-a.center[0],position[1]-a.center[1]],a.axis),speed=dot(delta,a.axis),depth=a.radius-Math.abs(c);
  if(depth<0)inside=false;
  if(depth<minDepth){minDepth=depth;outward=a.axis.map(x=>x*(c>=0?1:-1));}
  if(Math.abs(speed)<1e-12){if(Math.abs(c)>a.radius)return null;continue;}
  const t1=(-a.radius-c)/speed,t2=(a.radius-c)/speed,near=Math.min(t1,t2),far=Math.max(t1,t2);
  if(near>entry){entry=near;normal=a.axis.map(x=>x*(speed>0?-1:1));}
  exit=Math.min(exit,far);
  if(entry>exit)return null;
 }
 // An older saved pose may already overlap a wall: let it escape, never go deeper.
 if(inside){if(dot(delta,outward)>=-1e-10)return null;return {time:0,normal:outward};}
 if(entry<0||entry>1||exit<0)return null;
 return {time:entry,normal};
}
export function constrainMove(node,target,walls){
 const s=shape(node),position=[node.position[0],node.position[2]];
 let delta=[target[0]-position[0],target[2]-position[1]];
 for(let iteration=0;iteration<4&&Math.hypot(...delta)>1e-8;iteration++){
  let hit=null;
  for(const wall of walls){const result=sweep(s,position,delta,wall);if(result&&(!hit||result.time<hit.time))hit=result;}
  if(!hit){position[0]+=delta[0];position[1]+=delta[1];break;}
  const fraction=Math.max(0,hit.time-1e-6/Math.hypot(...delta));
  position[0]+=delta[0]*fraction;position[1]+=delta[1]*fraction;
  delta=delta.map(v=>v*(1-fraction));
  const inward=dot(delta,hit.normal);
  if(inward<0)delta=delta.map((v,i)=>v-hit.normal[i]*inward);
 }
 return [position[0],node.position[1],position[1]];
}
function penetration(node,angle,walls){
 const s=shape(node,angle);let maximum=0;
 for(const wall of walls){const axes=axesFor(s,wall);if(!axes)continue;let minimum=Infinity;
  for(const a of axes){const c=dot([node.position[0]-a.center[0],node.position[2]-a.center[1]],a.axis);minimum=Math.min(minimum,a.radius-Math.abs(c));}
  if(minimum>0)maximum=Math.max(maximum,minimum);
 }
 return maximum;
}
export function constrainRotation(node,target,walls){
 const initial=node.rotation[1],delta=target-initial,steps=Math.max(1,Math.ceil(Math.abs(delta)/(Math.PI/360)));
 let accepted=initial,depth=penetration(node,initial,walls);
 for(let i=1;i<=steps;i++){
  const next=initial+delta*i/steps,nextDepth=penetration(node,next,walls);
  if(nextDepth>Math.max(1e-7,depth+1e-9))break;
  accepted=next;depth=nextDepth;
 }
 return [node.rotation[0],accepted,node.rotation[2]];
}
