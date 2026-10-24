import type {Point,Wall} from './measure-model.ts';
export type WallJoin={walls:[string,string];polygon:Point[]};
// Raster runs include the thickness of crossing walls in their endpoints.
// Trim only an existing near-end crossing, never bridge a real gap or alter
// stored dimensions. Both the editor and print use this same wall-body layout.
export function wallBodies(walls:Wall[]):Wall[]{
 return walls.map(w=>{
  const body=structuredClone(w),dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],len=Math.hypot(dx,dy);
  if(len<1)return body;
  for(const end of ['a','b'] as const){
   let nearest=Infinity,point:Point|null=null;
   for(const host of walls){
    if(host.id===w.id)continue;
    const hx=host.b[0]-host.a[0],hy=host.b[1]-host.a[1],hl=Math.hypot(hx,hy),cross=dx*hy-dy*hx;
    if(!hl||Math.abs(dx*hx+dy*hy)>len*hl*.001||Math.abs(cross)<.001)continue;
    const qx=host.a[0]-w.a[0],qy=host.a[1]-w.a[1],t=(qx*hy-qy*hx)/cross,u=(qx*dy-qy*dx)/cross;
    if(t<0||t>1||u<0||u>1)continue;
    const distance=(end==='a'?t:1-t)*len;
    if(distance<.01||distance>Math.min(len*.25,(Math.max(w.thickness,70)+Math.max(host.thickness,70))/2)||distance>=nearest)continue;
    nearest=distance;point=[w.a[0]+t*dx,w.a[1]+t*dy];
   }
   if(point)body[end]=point;
  }
  return body;
 });
}
// Render-only corner infill. Never moves axes or changes measured dimensions.
// Only exactly connected endpoints join; genuine gaps and free ends stay open.
export function wallJoins(walls:Wall[],minimumThickness=70):WallJoin[]{
 const nodes:{point:Point;rays:{wall:Wall;direction:Point}[]}[]=[];
 for(const wall of walls)for(const [point,other]of [[wall.a,wall.b],[wall.b,wall.a]]){
  const len=Math.hypot(other[0]-point[0],other[1]-point[1]);if(len<.1)continue;
  let node=nodes.find(n=>Math.hypot(n.point[0]-point[0],n.point[1]-point[1])<.1);
  if(!node){node={point,rays:[]};nodes.push(node);}
  node.rays.push({wall,direction:[(other[0]-point[0])/len,(other[1]-point[1])/len]});
 }
 const joins:WallJoin[]=[];
 for(const {point:p,rays}of nodes)for(let i=0;i<rays.length;i++)for(let j=i+1;j<rays.length;j++){
  const a=rays[i],b=rays[j],u=a.direction,v=b.direction,cross=u[0]*v[1]-u[1]*v[0];
  if(Math.abs(cross)<1e-6)continue;
  // In multi-ray junctions these patches may overlap existing wall bodies.
  const sign=Math.sign(cross),normalA:Point=[-u[1],u[0]],normalB:Point=[-v[1],v[0]];
  const ha=Math.max(a.wall.thickness,minimumThickness)/2,hb=Math.max(b.wall.thickness,minimumThickness)/2;
  const pa:Point=[p[0]-sign*normalA[0]*ha,p[1]-sign*normalA[1]*ha];
  const pb:Point=[p[0]+sign*normalB[0]*hb,p[1]+sign*normalB[1]*hb];
  const delta:Point=[pb[0]-pa[0],pb[1]-pa[1]],t=(delta[0]*v[1]-delta[1]*v[0])/cross;
  const corner:Point=[pa[0]+u[0]*t,pa[1]+u[1]*t];
  const bounded=Math.hypot(corner[0]-p[0],corner[1]-p[1])<=4*Math.max(ha,hb);
  joins.push({walls:[a.wall.id,b.wall.id],polygon:bounded?[p,pa,corner,pb]:[p,pa,pb]});
 }
 return joins;
}
