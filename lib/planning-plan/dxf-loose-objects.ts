import type {DxfInstance,DxfPath} from './dxf-import';
/** Exploded symbols have no INSERT. A closed fill may provide a conservative
 * grouping envelope, but never a furniture TYPE: every such group needs review.
 * Unrelated text/lines are not turned into furniture indiscriminately.
 */
export function groupLooseDxfObjects(paths:DxfPath[],instances:DxfInstance[],factor:number){
 const loose=paths.filter(p=>!p.instance&&!p.semantic),candidates=loose.filter(p=>p.fill).map(p=>{const x0=Math.min(...p.points.map(v=>v[0])),y0=Math.min(...p.points.map(v=>v[1])),x1=Math.max(...p.points.map(v=>v[0])),y1=Math.max(...p.points.map(v=>v[1]));return{p,x0,y0,x1,y1,area:(x1-x0)*(y1-y0)};}).filter(b=>(b.x1-b.x0)*factor>=300&&(b.y1-b.y0)*factor>=300&&(b.x1-b.x0)*factor<=5000&&(b.y1-b.y0)*factor<=5000).sort((a,b)=>a.area-b.area);
 let count=0;for(const b of candidates){if(b.p.instance)continue;const tolerance=1/factor,members=loose.filter(p=>!p.instance&&p.points.every(([x,y])=>x>=b.x0-tolerance&&x<=b.x1+tolerance&&y>=b.y0-tolerance&&y<=b.y1+tolerance));if(members.filter(p=>!p.fill).length<3)continue;const id=`loose_${++count}`;for(const p of members){p.instance=id;p.block=`CAD-предмет без типа ${count}`;}instances.push({id,name:`CAD-предмет без типа ${count}`,matrix:[1,0,0,1,0,0],semantic:''});}return count;
}
