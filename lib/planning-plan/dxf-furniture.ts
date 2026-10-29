import type {Point} from '../measured-plan/measure-model';
import type {DxfInstance,DxfPath} from './dxf-import';
import {newFurniture,type FurnitureItem,type FurnitureKind} from './furniture.ts';
import {furnitureCatalogType} from './furniture-sidebar.ts';
import {dxfFurnitureKind} from './dxf-furniture-type.ts';
export {dxfFurnitureKind} from './dxf-furniture-type.ts';
/** Bake INSERT scale/reflection into the vector, while retaining an editable
 * origin/rotation. Normalised points preserve every detail when dimensions change. */
export function dxfFurniture(instance:DxfInstance,paths:DxfPath[],factor:number,origin:Point,override?:FurnitureKind):FurnitureItem|null{
 if(!paths.length)return null;const rotation=Math.atan2(-instance.matrix[1],instance.matrix[0])*180/Math.PI,a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 const world=paths.map(p=>({...p,points:p.points.map(v=>[(v[0]-origin[0])*factor,(origin[1]-v[1])*factor] as Point)}));
 const local=world.map(p=>({...p,points:p.points.map(([x,y])=>[x*c+y*s,-x*s+y*c] as Point)}));const pts=local.flatMap(p=>p.points),x0=Math.min(...pts.map(p=>p[0])),x1=Math.max(...pts.map(p=>p[0])),y0=Math.min(...pts.map(p=>p[1])),y1=Math.max(...pts.map(p=>p[1])),width=x1-x0,depth=y1-y0;
 if(width<10||depth<10||width>20000||depth>20000)return null;
 const named=dxfFurnitureKind(instance.name),kind=override||named||'decor',x=(x0+x1)/2,y=(y0+y1)/2;
 const f:FurnitureItem={...newFurniture(kind,[x*c-y*s,x*s+y*c]),id:`cad_${instance.id}`,name:instance.name.slice(0,240),width,depth,height:null,rotation,dimensionsSource:'dxf',cad:{version:1,blockName:instance.name.slice(0,240),instance:instance.id,classification:override?'review':named?'name':'unknown',paths:local.map(p=>({points:p.points.map(v=>[(v[0]-x)/width,(v[1]-y)/depth] as Point),...(p.fill?{fill:p.fill}:{})}))}};
 f.catalogType=furnitureCatalogType(f);return f;
}
export function cadWorldPaths(f:FurnitureItem){const a=f.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return(f.cad?.paths||[]).map(p=>({...p,points:p.points.map(([nx,ny])=>{const x=nx*f.width,y=ny*f.depth;return[f.position[0]+x*c-y*s,f.position[1]+x*s+y*c] as Point;})}));}
