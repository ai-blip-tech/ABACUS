function bevelProfile(width, depth) {
  const half = width / 2;
  const crossSection = [[-half,0],[-half,depth*.25],[-half*.68,depth],[half*.68,depth],[half,depth*.25],[half,0]];
  const positions = [];
  for (let i=0; i<crossSection.length; i++) {
    const a = crossSection[i], b = crossSection[(i+1)%crossSection.length];
    positions.push(0,...a,0,...b,1,...a,1,...a,0,...b,1,...b);
  }
  return {width,depth,positions};
}
export const PROFILES={M40:bevelProfile(.04,.02), M25:bevelProfile(.025,.009)};
export function rails(m){const [x0,y0,x1,y1]=m.bounds,h=PROFILES[m.profile]?.width/2||.02;if(m.shape==='horizontal')return [[x0-h,y0-h,x1+h,y0+h]];if(m.shape==='vertical')return [[x0-h,y0-h,x0+h,y1+h]];return [[x0-h,y0-h,x1+h,y0+h],[x0-h,y1-h,x1+h,y1+h],[x0-h,y0+h,x0+h,y1-h],[x1-h,y0+h,x1+h,y1-h]];}
export function mouldingError(m,length,height,openings){if(!PROFILES[m.profile]||!m.bounds?.every(Number.isFinite))return 'Некорректные параметры профиля';const [x0,y0,x1,y1]=m.bounds,h=PROFILES[m.profile].width/2;if((m.shape!=='vertical'&&x1-x0<.1-1e-8)||(m.shape!=='horizontal'&&y1-y0<.1-1e-8))return 'Размер должен быть не меньше 100 мм';for(const r of rails(m)){if(r[0]<0||r[1]<0||r[2]>length||r[3]>height)return 'Профиль выходит за границы стены';if(openings.some(o=>r[0]<o[2]&&r[2]>o[0]&&r[1]<o[3]&&r[3]>o[1]))return 'Молдинг пересекает оконный или дверной проём. Измените положение или размеры.';}return '';}
export function hitMoulding(m,x,y){return rails(m).some(r=>x>=r[0]-.025&&x<=r[2]+.025&&y>=r[1]-.025&&y<=r[3]+.025);}
export function mouldingMesh(profile,m,thickness){const out=[],[x0,y0,x1,y1]=m.bounds,w=x1-x0,h=y1-y0,segments=m.shape==='horizontal'?[[x0,y0,w,0]]:m.shape==='vertical'?[[x0,y0,h,Math.PI/2]]:[[x0,y0,w,0],[x1,y0,h,Math.PI/2],[x1,y1,w,Math.PI],[x0,y1,h,-Math.PI/2]];for(const [x,y,length,angle] of segments){const c=Math.cos(angle),s=Math.sin(angle);for(let i=0;i<profile.positions.length;i+=3){const t=profile.positions[i],cross=profile.positions[i+1],depth=profile.positions[i+2],along=m.shape==='frame'?cross+t*(length-2*cross):(m.miterStart||0)*cross+t*(length+((m.miterEnd||0)-(m.miterStart||0))*cross);out.push(x+along*c-cross*s,y+along*s+cross*c,m.side*(thickness/2+.002+depth));}}return out;}

// Split at paint boundaries so an inherited finish does not interpolate across colors.
export function inheritedMouldingMesh(positions,patches,side,fallback='#d8d3c9'){
 const paint=patches.filter(p=>p.side===side),out=[],hexes=[];
 const clip=(poly,axis,bound,sign)=>{const r=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[axis]-bound),db=sign*(b[axis]-bound),ina=da>=-1e-9,inb=db>=-1e-9;if(ina)r.push(a);if(ina!==inb){const t=da/(da-db);r.push(a.map((n,j)=>n+(b[j]-n)*t));}}return r;};
 for(let i=0;i<positions.length;i+=9){let polys=[[positions.slice(i,i+3),positions.slice(i+3,i+6),positions.slice(i+6,i+9)]];
  for(const p of paint)for(const [axis,bound] of [[0,p.bounds[0]],[0,p.bounds[2]],[1,p.bounds[1]],[1,p.bounds[3]]])polys=polys.flatMap(poly=>{const vals=poly.map(v=>v[axis]);if(Math.min(...vals)>=bound-1e-9||Math.max(...vals)<=bound+1e-9)return [poly];return [clip(poly,axis,bound,1),clip(poly,axis,bound,-1)].filter(v=>v.length>=3);});
  for(const poly of polys){const x=poly.reduce((s,p)=>s+p[0],0)/poly.length,y=poly.reduce((s,p)=>s+p[1],0)/poly.length,color=[...paint].reverse().find(p=>x>=p.bounds[0]-1e-9&&x<=p.bounds[2]+1e-9&&y>=p.bounds[1]-1e-9&&y<=p.bounds[3]+1e-9)?.hex||fallback;for(let j=1;j<poly.length-1;j++){out.push(...poly[0],...poly[j],...poly[j+1]);hexes.push(color,color,color);}}
 }
 return {positions:out,hexes};
}

export function joinedMoulding(m,all){
 if(m.shape==='frame')return m;
 const ends=n=>n.shape==='horizontal'?[[n.bounds[0],n.bounds[1]],[n.bounds[2],n.bounds[1]]]:[[n.bounds[0],n.bounds[1]],[n.bounds[0],n.bounds[3]]];
 const p=ends(m),cross=m.shape==='horizontal'?[0,1]:[-1,0],factors=[0,0];
 for(let i=0;i<2;i++){const matches=[];for(const n of all){if(n.id===m.id||n.side!==m.side||n.shape==='frame'||n.shape===m.shape||n.profile!==m.profile)continue;const q=ends(n);for(let j=0;j<2;j++)if(Math.hypot(p[i][0]-q[j][0],p[i][1]-q[j][1])<.021){const v=[q[1-j][0]-q[j][0],q[1-j][1]-q[j][1]],length=Math.hypot(...v);if(length)matches.push({n,q,dot:(v[0]*cross[0]+v[1]*cross[1])/length});}}
  if(matches.length===1){const {n,q,dot}=matches[0];factors[i]=(i===0?1:-1)*Math.sign(dot);if(m.shape==='horizontal')p[i][0]=n.bounds[0];else p[i][1]=n.bounds[1];}
 }
 const bounds=m.shape==='horizontal'?[p[0][0],p[0][1],p[1][0],m.bounds[3]]:[p[0][0],p[0][1],m.bounds[2],p[1][1]];
 return {...m,bounds,miterStart:factors[0],miterEnd:factors[1]};
}
