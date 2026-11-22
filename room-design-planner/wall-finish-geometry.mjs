export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function cells(bounds,holes){if(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite)||bounds[2]<=bounds[0]||bounds[3]<=bounds[1])return [];const [a,b,c,d]=bounds,xs=[a,c,...holes.flatMap(h=>[clamp(h[0],a,c),clamp(h[2],a,c)])].sort((a,b)=>a-b),ys=[b,d,...holes.flatMap(h=>[clamp(h[1],b,d),clamp(h[3],b,d)])].sort((a,b)=>a-b),out=[];for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++){const x=(xs[i]+xs[i+1])/2,y=(ys[j]+ys[j+1])/2;if(xs[i+1]-xs[i]<.0001||ys[j+1]-ys[j]<.0001||holes.some(h=>x>h[0]&&x<h[2]&&y>h[1]&&y<h[3]))continue;out.push([xs[i],ys[j],xs[i+1],ys[j+1]]);}return out;}

// Replace existing paint in the new rectangle, retaining previous paint outside it.
// Separate opposite wall faces; never stack coplanar opaque paint surfaces.
export function replacePaint(patches,patch,makeId=()=>crypto.randomUUID()){
 const remaining=patches.filter(p=>p.id!==patch.id).flatMap(p=>{
  if(p.side!==patch.side)return [p];
  return cells(p.bounds,[patch.bounds]).map((bounds,i)=>({...p,id:i===0?p.id:makeId(),bounds}));
 });
 return [...remaining,patch];
}

const clip=(polygon,axis,bound,sign)=>{const result=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=sign*(a[axis]-bound),db=sign*(b[axis]-bound),ina=da>=-1e-8,inb=db>=-1e-8;if(ina)result.push(a);if(ina!==inb){const t=da/(da-db);result.push(a.map((v,k)=>v+(b[k]-v)*t));}}return result;};

// Clip the actual vertical wall triangles, including mitered ends and exposed caps.
// Window/door cut-outs are already present in the source mesh.
export function paintedWallTriangles(positions,indices,patch,length,height,masks=[],skip){
 const out=[],count=indices?indices.length:positions.length/3;
 let lo=Infinity,hi=-Infinity;for(let i=0;i<positions.length;i+=3){lo=Math.min(lo,positions[i]);hi=Math.max(hi,positions[i]);}
 const b=patch.bounds,[x0,y0,x1,y1]=[b[0]<=.001?lo:clamp(b[0],0,length),clamp(b[1],0,height),b[2]>=length-.001?hi:clamp(b[2],0,length),clamp(b[3],0,height)];
 const regions=cells([x0,y0,x1,y1],masks.map(m=>[m[0]<=.001?lo:m[0],m[1],m[2]>=length-.001?hi:m[2],m[3]]));

 for(let i=0;i<count;i+=3){if(skip?.has(i))continue;const tri=[0,1,2].map(k=>{const j=indices?indices[i+k]:i+k;return [positions[j*3],positions[j*3+1],positions[j*3+2]];});const a=tri[0],u=tri[1].map((n,k)=>n-a[k]),v=tri[2].map((n,k)=>n-a[k]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],n=Math.hypot(...normal);if(n<1e-10)continue;normal.forEach((v,k)=>normal[k]=v/n);if(Math.abs(normal[1])>.1||normal[2]*patch.side<-.001)continue;
  for(const r of regions){let poly=tri;for(const [axis,bound,sign] of [[0,r[0],1],[0,r[2],-1],[1,r[1],1],[1,r[3],-1]]){poly=clip(poly,axis,bound,sign);if(poly.length<3)break;}if(Math.abs(normal[2])<.001)poly=clip(poly,2,0,patch.side);for(let j=1;j<poly.length-1;j++)for(const p of [poly[0],poly[j],poly[j+1]])out.push(...p.map((v,k)=>v+normal[k]*.0015));}
 }
 return out;
}

// Unfold each inner face of the actual opening mesh into the adjoining wall.
// Clip in the same coordinate system as the paint, tiles and their joints.
export function windowRevealProjections(positions,indices,windows,wallSize,faceDepths){
 const skip=new Set(),faces=[];
 if(!windows.length)return {skip,faces};
 const tolerance=.00002;
 const count=indices?indices.length:positions.length/3;
 for(const {bounds,frameZ} of windows){
  for(const axis of [0,1]){
   const across=1-axis;
   for(const direction of [-1,1]){
    const edge=bounds[axis+(direction===1?2:0)];
    const room=direction===-1?edge:wallSize[axis]-edge;
    if(room<=tolerance)continue;
    const front=faceDepths.map((faceZ,index)=>{
     const side=index===0?-1:1;
     const depth=(faceZ-frameZ)*side;
     if(depth<=tolerance)return null;
     const scale=Math.min(1,room/depth);
     const projectionBounds=[...bounds],outer=edge+direction*depth*scale;
     projectionBounds[axis]=Math.min(edge,outer);
     projectionBounds[axis+2]=Math.max(edge,outer);
     const projection={axis,edge,direction,side,scale,faceZ,bounds:projectionBounds,data:[]};
     faces.push(projection);
     return projection;
    });
    for(let i=0;i<count;i+=3){
     const triangle=[0,1,2].map(k=>{
      const index=indices?indices[i+k]:i+k;
      return [positions[index*3],positions[index*3+1],positions[index*3+2]];
     });
     if(!triangle.every(p=>Math.abs(p[axis]-edge)<tolerance&&
         p[across]>=bounds[across]-tolerance&&p[across]<=bounds[across+2]+tolerance))continue;
     if(Math.max(...triangle.map(p=>p[2]))-Math.min(...triangle.map(p=>p[2]))<tolerance)continue;
     skip.add(i);
     for(const projection of front){
      if(!projection)continue;
      const part=clip(triangle,2,frameZ,projection.side);
      for(let k=1;k<part.length-1;k++){
       for(const corner of [part[0],part[k],part[k+1]]){
        const point=[corner[0],corner[1],0];
        point[axis]=edge+direction*(projection.faceZ-corner[2])*projection.side*projection.scale;
        projection.data.push(...point);
       }
      }
     }
    }
   }
  }
 }
 return {skip,faces:faces.filter(face=>face.data.length)};
}

export function clippedRevealTriangles(face,regions){
 const triangles=[];
 for(let i=0;i<face.data.length;i+=9){
  const triangle=[face.data.slice(i,i+3),face.data.slice(i+3,i+6),face.data.slice(i+6,i+9)];
  for(const [x0,y0,x1,y1] of regions){
   let polygon=triangle;
   for(const [axis,bound,sign] of [[0,x0,1],[0,x1,-1],[1,y0,1],[1,y1,-1]])polygon=clip(polygon,axis,bound,sign);
   for(let j=1;j<polygon.length-1;j++)triangles.push(...polygon[0],...polygon[j],...polygon[j+1]);
  }
 }
 return triangles;
}
