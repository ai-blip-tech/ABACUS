export const EYE_HEIGHT=1.6, BODY_RADIUS=.2;
export function inside(point,polygon){let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
export function walkable(point,plan){
 const mm=point.map(n=>n*1000),r=BODY_RADIUS*1000;if(!inside(mm,plan.floor))return false;
 for(const w of plan.walls){const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],length=Math.hypot(dx,dz);if(!length)continue;const along=((mm[0]-w.a[0])*dx+(mm[1]-w.a[1])*dz)/length,t=Math.max(0,Math.min(length,along));const distance=Math.hypot(mm[0]-w.a[0]-dx*t/length,mm[1]-w.a[1]-dz*t/length);if(distance>=w.thickness/2+r)continue;
  const passage=plan.openings.some(o=>o.wallId===w.id&&o.kind!=='window'&&Math.abs(along-o.offset)<=o.width/2-r);if(!passage)return false;
 }
 for(const c of plan.columns||[])if(mm[0]>=c.a[0]-r&&mm[0]<=c.a[0]+c.width+r&&mm[1]>=c.a[1]-r&&mm[1]<=c.a[1]+c.depth+r)return false;
 for(const f of plan.furniture||[]){if(['rug','lamp','decor','tv'].includes(f.kind))continue;const a=-f.rotation*Math.PI/180,x=mm[0]-f.position[0],z=mm[1]-f.position[1],u=x*Math.cos(a)-z*Math.sin(a),v=x*Math.sin(a)+z*Math.cos(a);if(Math.abs(u)<f.width/2+r&&Math.abs(v)<f.depth/2+r)return false;}
 return true;
}
export function walkStep(position,delta,plan){let p=[...position];const n=Math.max(1,Math.ceil(Math.hypot(...delta)/.06));for(let i=0;i<n;i++){const dx=delta[0]/n,dz=delta[1]/n,next=[p[0]+dx,p[1]+dz];if(walkable(next,plan))p=next;else{const x=[p[0]+dx,p[1]],z=[p[0],p[1]+dz];if(walkable(x,plan))p=x;else if(walkable(z,plan))p=z;}}return p;}
export function findWalkStart(plan,preferred){if(walkable(preferred,plan))return preferred;const xs=plan.floor.map(p=>p[0]/1000),zs=plan.floor.map(p=>p[1]/1000),center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2];let best=null,score=Infinity;for(let x=Math.min(...xs)+.3;x<Math.max(...xs);x+=.25)for(let z=Math.min(...zs)+.3;z<Math.max(...zs);z+=.25){const p=[x,z];if(walkable(p,plan)){const d=Math.hypot(x-center[0],z-center[1]);if(d<score){best=p;score=d;}}}return best;}

/** Navigation must use furniture's current 3D position after a user drags it. */
export function currentWalkPlan(plan,nodes){
 const furniture=Object.values(nodes).filter(n=>n.type==='item'&&!n.metadata?.column&&!n.asset?.attachTo&&n.visible!==false).map(n=>{const old=plan.furniture?.find(f=>f.id===n.metadata?.roomDesignId),size=n.asset.dimensions.map((v,i)=>v*n.scale[i]*1000);return{...old,id:old?.id||n.id,kind:n.metadata?.kind||old?.kind||'decor',position:[n.position[0]*1000,n.position[2]*1000],rotation:-(n.rotation?.[1]||0)*180/Math.PI,width:size[0],depth:size[2],height:size[1]};});
 return{...plan,furniture};
}
