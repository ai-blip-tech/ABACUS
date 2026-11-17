import {Box3,BoxGeometry,BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshPhysicalMaterial,SRGBColorSpace,TextureLoader,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

import {cabinetWidthMm,cabinetDimensionsMm,normalizeCabinetConfig,slabCut,slabUV,cabinetLegPositions,CABINET_BASE_HEIGHT_MM,CABINET_GLASS_THICKNESS_MM,CABINET_DOOR_GAP_MM} from './cabinet-layout.mjs';
export {normalizeCabinetConfig,cabinetWidthMm} from './cabinet-layout.mjs';

export const CABINET_PRODUCT='roomdesign:modular-cabinet';
export type GlassPart='body'|'top'|'left'|'right';
export type CabinetModule={id:string;model:string;front:string;glass:string;finish:'gloss'|'matte';legs:boolean;metal:string;surfaces?:Partial<Record<GlassPart,{sample:string;finish:'gloss'|'matte'}>>};
export type CabinetConfig={version?:number;modules:CabinetModule[];front?:string;top?:{sample:string;finish:'gloss'|'matte'};base?:{enabled:boolean;color:string};support?:{kind:'base'|'legs'|'none';legId?:string;color?:string}};
export type CabinetSample={id:string;label:string;image:string;kind:'ceramic'|'glass'|'metal';color?:string;slabWidthMm?:number;slabHeightMm?:number};
export type CabinetLeg={id:string;label:string;widthMm:number;heightMm:number;depthMm:number};
export type CabinetCatalog={legs?:CabinetLeg[];models:{id:string;widthMm:number;heightMm:number;depthMm:number;thumbnail?:string;available3D?:boolean;sourcePdfPage?:number;sourcePrintedPage?:number}[];samples:CabinetSample[]};
export const cabinetURL=(file:string)=>new URL((import.meta.env?.BASE_URL||'/')+'cabinets/'+file,location.origin).href;
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
export function splitCabinetBody(model:Group,module:CabinetModule,width:number,frontMaterial:MeshPhysicalMaterial,bodyMaterial:MeshPhysicalMaterial,glassMaterials:Partial<Record<GlassPart,MeshPhysicalMaterial>>={},layout?:{offsetMm:number;cut:ReturnType<typeof slabCut>}){
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
    if(layout&&role==='top')continue;
    const side=Math.abs(normal.x)>Math.abs(normal.z);
    for(const point of [a,b,c]){
     const position=point.clone();
     if(layout&&role==='front'){
      // Keep each module pitch intact. Recess each door edge by 1 mm for a 2 mm joint.
      position.x*= (width-CABINET_DOOR_GAP_MM/1000)/width;
     }
     points.push(...position.toArray());
     if(layout&&role==='front')uvs.push(...slabUV(position,width,layout.offsetMm,layout.cut));
     else uvs.push(top?point.x/width+.5:side?point.z/.45+.5:point.x/width+.5,top?point.z/.45+.5:point.y/.39);
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
export async function assembleCabinets(configuration:CabinetConfig,catalog:CabinetCatalog){
 const config=normalizeCabinetConfig(configuration) as CabinetConfig;
 const cut=slabCut(config,catalog);
 const root=new Group();
 const actualDimensions=cabinetDimensionsMm(config,catalog);
 const totalWidth=actualDimensions.widthMm/1000;
 const bodyHeight=actualDimensions.heightMm/1000;
 const depth=actualDimensions.depthMm/1000;
 const leg=config.support?.kind==='legs'?catalog.legs?.find(item=>item.id===config.support?.legId):undefined;
 if(config.support?.kind==='legs'&&!leg)throw Error('Для выбранных ножек пока не подключена 3D-модель.');
 const baseHeight=leg?leg.heightMm/1000:config.base!.enabled?CABINET_BASE_HEIGHT_MM/1000:0;
 const frontMaterial=await surface(catalog.samples.find(sample=>sample.id===config.front));
 let offset=0;
 for(const module of config.modules){
  const specification=catalog.models.find(item=>item.id===module.model&&!item.id.startsWith('base'))!;
  if(specification.available3D===false)throw Error('Для модуля '+module.model+' ещё не подключена 3D-модель.');
  const width=specification.widthMm/1000;
  const [body,bodyMaterial]=await Promise.all([
   source(module.model),
   surface(catalog.samples.find(sample=>sample.id===module.glass),module.finish),
  ]);
  const glassMaterials=Object.fromEntries(await Promise.all(
   Object.entries(module.surfaces||{}).filter(([part])=>part!=='top').map(async([part,value])=>[
    part,await surface(catalog.samples.find(sample=>sample.id===value.sample),value.finish),
   ]),
  ));
  const bodyGroup=splitCabinetBody(body,module,width,frontMaterial,bodyMaterial,glassMaterials,{offsetMm:offset*1000,cut});
  bodyGroup.position.set(offset+width/2,baseHeight,0);
  root.add(bodyGroup);
  offset+=width;
 }

 // One real glass panel spans the entire composition, including module boundaries.
 const topMaterial=await surface(catalog.samples.find(sample=>sample.id===config.top!.sample),config.top!.finish);
 const thickness=CABINET_GLASS_THICKNESS_MM/1000;
 const topGeometry=new BoxGeometry(totalWidth,thickness,depth);
 // The surface editor expands material groups into an array. This panel has one glass material.
 topGeometry.clearGroups();
 const top=new Mesh(topGeometry,topMaterial);
 top.position.set(totalWidth/2,baseHeight+bodyHeight+thickness/2,0);
 top.name='Общая стеклянная столешница';
 top.userData={cabinetModule:config.modules[0].id,cabinetPart:'top',cabinetCommon:true};
 root.add(top);

 if(config.base!.enabled){
  const base=await source('base01');
  const dimensions=cabinetBounds(base).dimensions;
  const material=new MeshPhysicalMaterial({color:config.base!.color,metalness:.85,roughness:.3});
  const common=new Group();
  base.traverse(object=>{
   if(!(object instanceof Mesh))return;
   const mesh=new Mesh(object.geometry.clone(),material);
   mesh.name='Общая база';
   mesh.userData={cabinetModule:config.modules[0].id,cabinetPart:'legs',cabinetCommon:true};
   common.add(mesh);
  });
  common.scale.set((totalWidth-.034)/dimensions[0],baseHeight/dimensions[1],1);
  common.position.x=totalWidth/2;
  root.add(common);
 }
 if(leg){
  const template=await source(leg.id);
  const positions=cabinetLegPositions(totalWidth*1000,actualDimensions.depthMm,leg.widthMm,leg.depthMm);
  const material=new MeshPhysicalMaterial({color:config.support?.color||'#45464a',metalness:.85,roughness:.3});
  for(const [x,y,z] of positions){
   const foot=template.clone(true);
   foot.position.set(totalWidth/2+x,y,z);
   foot.traverse(object=>{
    if(!(object instanceof Mesh))return;
    object.material=material;
    object.name='Ножка';
    object.userData={cabinetModule:config.modules[0].id,cabinetPart:'legs',cabinetCommon:true};
   });
   root.add(foot);
  }
 }
 root.position.x=-totalWidth/2;
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
