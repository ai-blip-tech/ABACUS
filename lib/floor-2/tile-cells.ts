import clipping from 'polygon-clipping';
import type {MeasureDoc,Point} from '../measured-plan/measure-model';
import {floorPlacement} from '../measured-plan/measure-floor-finishes.ts';
import {multiArea} from '../planning-plan/usable-area.ts';
import {geometry,regionProduct,type Floor2Region,type CoverProduct} from './model.ts';

export type TileCell={key:string;row:number;col:number;x:number;y:number;width:number;height:number;polygon:Point[];visible:clipping.MultiPolygon};
/** Stable row/column identities follow the grid when its phase or angle changes. */
export function tileCells(plan:MeasureDoc,r:Floor2Region):TileCell[]{
 const p=regionProduct(r);if(!p||p.category!=='tile'||!['straight','diagonal','offset'].includes(r.scheme||'straight'))return [];
 const {origin,angle}=floorPlacement(r),a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),shape=geometry(plan,r).polygons,points=shape.flat(2).map(([x,y])=>[(x-origin[0])*c+(y-origin[1])*s,-(x-origin[0])*s+(y-origin[1])*c]);if(!points.length)return [];
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),w=p.widthMm,h=p.heightMm,j=r.tile?.jointMm??2,px=w+j,py=h+j,left=Math.floor(Math.min(...xs)/px)-1,right=Math.floor(Math.max(...xs)/px)+1,top=Math.floor(Math.min(...ys)/py),bottom=Math.floor(Math.max(...ys)/py);
 if((right-left+1)*(bottom-top+1)>100000)throw Error('Слишком много плит для редактирования');
 const result:TileCell[]=[];for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++){
  const x=col*px+(r.scheme==='offset'&&Math.abs(row%2)?px*(r.rowOffset??1/3):0),y=row*py;
  const polygon=([[x,y],[x+w,y],[x+w,y+h],[x,y+h]] as Point[]).map(([u,v])=>[origin[0]+u*c-v*s,origin[1]+u*s+v*c] as Point);
  const visible=clipping.intersection(shape,[polygon]);if(multiArea(visible)>.1)result.push({key:row+':'+col,row,col,x,y,width:w,height:h,polygon,visible});
 }return result;
}
export function replaceCell(r:Floor2Region,key:string,p:CoverProduct):Floor2Region{
 const base=regionProduct(r);if(!base||p.category!=='tile'||Math.abs(p.widthMm-base.widthMm)>.1||Math.abs(p.heightMm-base.heightMm)>.1)throw Error('Для замены одной плиты выберите плитку того же размера: '+base?.widthMm+' × '+base?.heightMm+' мм.');
 return {...r,tileCells:{...r.tileCells,[key]:{...r.tileCells?.[key],product:structuredClone(p)}}};
}

/** Split only the specification geometry; editing retains its original grid and cell identities. */
export function specificationPlan(plan:MeasureDoc):MeasureDoc{
 const regions=(plan.floorRegions||[]) as Floor2Region[];
 if(!regions.some(r=>Object.values(r.tileCells||{}).some(cell=>cell.product)))return plan;
 const expanded:Floor2Region[]=[];
 for(const r of regions){const cells=tileCells(plan,r).filter(cell=>r.tileCells?.[cell.key]?.product);if(!cells.length){expanded.push({...r});continue;}
  let base=geometry(plan,r).polygons;
  for(const cell of cells){const p=r.tileCells![cell.key].product!;base=clipping.difference(base,cell.visible);cell.visible.forEach((poly,i)=>expanded.push({...r,id:r.id+'-cell-'+cell.row+'-'+cell.col+'-'+i,product:p,tile:{...p.tile!,jointMm:r.tile?.jointMm??2,grout:r.tile?.grout||'#c8c2b6'},polygon:poly[0] as Point[],holes:poly.slice(1) as Point[][],tileCells:undefined}));}
  base.forEach((poly,i)=>expanded.push({...r,id:r.id+'-base-'+i,polygon:poly[0] as Point[],holes:poly.slice(1) as Point[][],tileCells:undefined}));
 }
 return {...plan,floorRegions:expanded};
}

export function cellRotation(r:Floor2Region,key:string){
 const p=r.tileCells?.[key]?.product||regionProduct(r),step=p&&Math.abs(p.widthMm-p.heightMm)<.1?90:180;
 return ((Math.round((r.tileCells?.[key]?.rotation||0)/step)*step)%360+360)%360;
}
export function rotateCell(r:Floor2Region,key:string):Floor2Region{
 const p=r.tileCells?.[key]?.product||regionProduct(r);if(p?.category!=='tile')throw Error('Выберите плиту');
 const step=Math.abs(p.widthMm-p.heightMm)<.1?90:180;
 return {...r,tileCells:{...r.tileCells,[key]:{...r.tileCells?.[key],rotation:(cellRotation(r,key)+step)%360}}};
}
