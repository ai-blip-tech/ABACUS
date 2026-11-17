import {readFile,writeFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Box3,Vector3,EdgesGeometry} from 'three';
const catalog=JSON.parse(await readFile(new URL('./public/cabinets/catalog.json',import.meta.url),'utf8'));
for(const model of catalog.models.filter(item=>item.id.startsWith('base'))){
 const bytes=await readFile(new URL('./public/cabinets/'+model.id+'.glb',import.meta.url));
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
 scene.updateMatrixWorld(true);
 const box=new Box3().setFromObject(scene);
 const raw=v=>[v.x-.65*v.z,-v.y+.32*v.x+.4*v.z];
 const corners=[];
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(raw(new Vector3(x,y,z)));
 const min=[Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[1]))];
 const max=[Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[1]))];
 const scale=Math.min(270/(max[0]-min[0]),150/(max[1]-min[1]));
 const project=v=>{const p=raw(v);return[160+(p[0]-(min[0]+max[0])/2)*scale,95+(p[1]-(min[1]+max[1])/2)*scale];};
 const triangles=[],lines=[];
 scene.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry;
  const p=geometry.attributes.position;
  for(let i=0;i<p.count;i+=3){
   const points=[0,1,2].map(j=>new Vector3().fromBufferAttribute(p,i+j).applyMatrix4(mesh.matrixWorld));
   const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
   if(normal.dot(new Vector3(1,.9,1))<=0)continue;
   const shade=Math.round(220+normal.y*15-normal.x*22);
   const depth=points.reduce((sum,v)=>sum+v.x+v.y*.9+v.z,0)/3;
   triangles.push({depth,svg:'<polygon points="'+points.map(v=>project(v).join(',')).join(' ')+'" fill="rgb('+[shade,shade,shade].join(',')+')"/>'});
  }
  const edges=new EdgesGeometry(mesh.geometry,25).attributes.position;
  for(let i=0;i<edges.count;i+=2){
   const a=project(new Vector3().fromBufferAttribute(edges,i).applyMatrix4(mesh.matrixWorld));
   const b=project(new Vector3().fromBufferAttribute(edges,i+1).applyMatrix4(mesh.matrixWorld));
   lines.push('M'+a.join(',')+'L'+b.join(','));
  }
 });
 triangles.sort((a,b)=>a.depth-b.depth);
 const label=(model.widthMm/10)+' × '+(model.heightMm/10)+' × '+(model.depthMm/10)+' см';
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 215"><rect width="320" height="215" fill="#faf8f5"/>'+triangles.map(t=>t.svg).join('')+'<path d="'+lines.join('')+'" fill="none" stroke="#615b57" stroke-width=".8"/><text x="160" y="199" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" fill="#352b27">'+label+'</text></svg>';
 await writeFile(new URL('./public/cabinets/'+model.id+'-preview.svg',import.meta.url),svg);
}
