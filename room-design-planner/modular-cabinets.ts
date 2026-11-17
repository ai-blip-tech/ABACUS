import {Box3,BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshPhysicalMaterial,SRGBColorSpace,TextureLoader,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export const CABINET_PRODUCT='roomdesign:modular-cabinet';
export type GlassPart='body'|'top'|'left'|'right';
export type CabinetModule={id:string;model:string;front:string;glass:string;finish:'gloss'|'matte';legs:boolean;metal:string;surfaces?:Partial<Record<GlassPart,{sample:string;finish:'gloss'|'matte'}>>};
export type CabinetConfig={modules:CabinetModule[]};
export type CabinetSample={id:string;label:string;image:string;kind:'ceramic'|'glass'|'metal';color?:string};
export type CabinetCatalog={models:{id:string;widthMm:number;heightMm:number;depthMm:number}[];samples:CabinetSample[]};
export const cabinetURL=(file:string)=>new URL(import.meta.env.BASE_URL+'cabinets/'+file,location.origin).href;
export const newCabinet=(model='5041'):CabinetModule=>({id:crypto.randomUUID(),model,front:'ceramic-0',glass:'WHT',finish:'gloss',legs:true,metal:'#333333'});
export async function cabinetCatalog():Promise<CabinetCatalog>{
 const response=await fetch(cabinetURL('catalog.json'));
 if(!response.ok)throw Error('Не удалось загрузить каталог комодов.');
 const catalog=await response.json();
 return {...catalog,samples:catalog.samples.map((sample:CabinetSample)=>({...sample,image:cabinetURL(sample.image.split('/').pop()!)}))};
}
const sources=new Map<string,Promise<Group>>();
async function source(id:string){
 if(!sources.has(id))sources.set(id,new GLTFLoader().loadAsync(cabinetURL(id+'.glb')).then(result=>result.scene));
 return sources.get(id)!;
}
const textures=new Map<string,ReturnType<TextureLoader['loadAsync']>>();
async function surface(sample:CabinetSample|undefined,finish='matte'){
 if(!sample)throw Error('Выбранный декор отсутствует в каталоге.');
 if(!textures.has(sample.id))textures.set(sample.id,new TextureLoader().loadAsync(sample.image).then(texture=>{
  texture.colorSpace=SRGBColorSpace;
  texture.flipY=false;
  return texture;
 }));
 return new MeshPhysicalMaterial({map:await textures.get(sample.id),color:'#ffffff',roughness:finish==='gloss'?.12:.72,clearcoat:finish==='gloss'?1:0,clearcoatRoughness:.08});
}
export function splitCabinetBody(model:Group,module:CabinetModule,width:number,frontMaterial:MeshPhysicalMaterial,bodyMaterial:MeshPhysicalMaterial,glassMaterials:Partial<Record<GlassPart,MeshPhysicalMaterial>>={}){
 const group=new Group();
 model.traverse(object=>{
  if(!(object instanceof Mesh))return;
  const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry;
  const positions=geometry.attributes.position;
  for(const role of ['front','body','top','left','right']){
   const points:number[]=[],uvs:number[]=[];
   for(let i=0;i<positions.count;i+=3){
    const centre=(positions.getZ(i)+positions.getZ(i+1)+positions.getZ(i+2))/3;
    // The supplied FBX front slab occupies the last 17 mm on the positive Z side.
    const a=new Vector3().fromBufferAttribute(positions,i),b=new Vector3().fromBufferAttribute(positions,i+1),c=new Vector3().fromBufferAttribute(positions,i+2);
    const normal=b.clone().sub(a).cross(c.clone().sub(a));
    const top=Math.abs(normal.y)>Math.abs(normal.x)&&Math.abs(normal.y)>Math.abs(normal.z);
    const x=(a.x+b.x+c.x)/3,y=(a.y+b.y+c.y)/3;
    const assigned=centre>.207?'front':top&&y>.37?'top':x< -width/2+.017?'left':x>width/2-.017?'right':'body';
    if(assigned!==role)continue;
    const side=Math.abs(normal.x)>Math.abs(normal.z);
    for(const point of [a,b,c]){
     points.push(...point.toArray());
     uvs.push(top?point.x/width+.5:side?point.z/.45+.5:point.x/width+.5,top?point.z/.45+.5:point.y/.39);
    }
   }
   if(!points.length)continue;
   const g=new BufferGeometry();
   g.setAttribute('position',new Float32BufferAttribute(points,3));
   g.setAttribute('uv',new Float32BufferAttribute(uvs,2));
   g.computeVertexNormals();
   const mesh=new Mesh(g,role==='front'?frontMaterial:glassMaterials[role as GlassPart]||bodyMaterial);
   mesh.name=role==='front'?'Фасад':'Корпус';
   mesh.userData={cabinetModule:module.id,cabinetPart:role};
   group.add(mesh);
  }
 });
 return group;
}
export async function assembleCabinets(config:CabinetConfig,catalog:CabinetCatalog){
 if(!config.modules.length||config.modules.length>8)throw Error('В композиции должно быть от 1 до 8 модулей.');
 const root=new Group();
 let offset=0;
 for(const module of config.modules){
  const specification=catalog.models.find(item=>item.id===module.model&&!item.id.startsWith('base'));
  if(!specification)throw Error('Модель комода отсутствует.');
  const width=specification.widthMm/1000;
  const [body,frontMaterial,bodyMaterial]=await Promise.all([source(module.model),surface(catalog.samples.find(sample=>sample.id===module.front)),surface(catalog.samples.find(sample=>sample.id===module.glass),module.finish)]);
  const glassMaterials=Object.fromEntries(await Promise.all(
   Object.entries(module.surfaces||{}).map(async([part,value])=>[
    part,await surface(catalog.samples.find(sample=>sample.id===value.sample),value.finish),
   ]),
  ));
  const bodyGroup=splitCabinetBody(body,module,width,frontMaterial,bodyMaterial,glassMaterials);
  bodyGroup.position.set(offset+width/2,module.legs?.035:0,0);
  root.add(bodyGroup);
  if(module.legs){
   const base=await source(specification.widthMm===500?'base01':'base02');
   const material=new MeshPhysicalMaterial({color:module.metal,metalness:.85,roughness:.3});
   base.traverse(object=>{
    if(!(object instanceof Mesh))return;
    const mesh=new Mesh(object.geometry.clone(),material);
    mesh.position.set(offset+width/2,0,0);
    mesh.userData={cabinetModule:module.id,cabinetPart:'legs'};
    mesh.name='Основание';
    root.add(mesh);
   });
  }
  offset+=width;
 }
 root.position.x=-offset/2;
 const centered=new Group();
 centered.add(root);
 return centered;
}
export function cabinetBounds(model:Group){
 const isolated=model.clone(true);
 isolated.updateMatrixWorld(true);
 const box=new Box3().setFromObject(isolated);
 return {box,dimensions:box.getSize(new Vector3()).toArray() as [number,number,number]};
}
