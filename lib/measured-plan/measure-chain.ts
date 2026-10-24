import {dimensionChecks,length,type MeasureDoc,type Point} from './measure-model.ts';
import {openingMissing} from './measure-editing.ts';

export function chainSpan(doc:MeasureDoc,id:string){
 const index=Number(id.replace('chain-',''));if(!/^chain-\d+$/.test(id)||index>10)return null;
 const w=(name:string)=>doc.walls.find(w=>w.id==='wall_bti_'+name);
 const x=(name:string,side:number)=>{const wall=w(name);return wall?wall.a[0]+side*wall.thickness/2:NaN;};
 const y=(name:string,side:number)=>{const wall=w(name);return wall?wall.a[1]+side*wall.thickness/2:NaN;};
 const specs:[string,string,number,number,number][]=[
 ['west','small_right',x('west',1),x('small_right',-1),(y('entry_bottom',1)+y('left_horizontal',-1))/2],
 ['entry_bottom','left_horizontal',y('entry_bottom',1),y('left_horizontal',-1),x('west',1)+350],
 ['west','left_bottom_right',x('west',1),x('left_bottom_right',-1),y('south',-1)-450],
 ['left_horizontal','south',y('left_horizontal',1),y('south',-1),x('left_bottom_right',-1)-350],
 ['left_bottom_right','right_vertical',x('left_bottom_right',1),x('right_vertical',-1),y('south',-1)-450],
 ['entry_right','right_vertical',x('entry_right',1),x('right_vertical',-1),y('north',1)+450],
 ['right_vertical','east',x('right_vertical',1),x('east',-1),y('south',-1)-450],
 ['north','right_horizontal',y('north',1),y('right_horizontal',-1),x('east',-1)-350],
 ['right_horizontal','south',y('right_horizontal',1),y('south',-1),x('east',-1)-350],
 ];
 if(index<9){const [from,to,start,end,at]=specs[index],vertical=[1,3,7,8].includes(index),a:Point=vertical?[at,start]:[start,at],b:Point=vertical?[at,end]:[end,at];if(![...a,...b].every(Number.isFinite)||!w(from)||!w(to))return null;return {a,b,wallIds:[w(from)!.id,w(to)!.id],openingIds:[] as string[],axis:vertical?1:0,target:w(to)!.id,description:'Между внутренними гранями: «'+w(from)!.name+'» и «'+w(to)!.name+'»'};}
 const lower=doc.openings.find(o=>o.id==='door_bti_right_lower'),upper=doc.openings.find(o=>o.id==='door_bti_right_upper'),wall=lower&&doc.walls.find(w=>w.id===lower.wallId);if(!lower||!wall||(index===10&&!upper))return null;
 const size=length(wall),point=(offset:number):Point=>[wall.a[0]+(wall.b[0]-wall.a[0])*offset/size,wall.a[1]+(wall.b[1]-wall.a[1])*offset/size];
 return {a:point(index===9?lower.offset-lower.width/2:upper!.offset+upper!.width/2),b:point(index===9?lower.offset+lower.width/2:lower.offset-lower.width/2),wallIds:[wall.id],openingIds:index===9?[lower.id]:[upper!.id,lower.id],axis:1,target:wall.id,description:index===9?'Между двумя краями нижнего прохода справа':'Между ближайшими краями двух проходов в правой перегородке'};
}

export function applyChainSize(doc:MeasureDoc,id:string,mm:number){
 const span=chainSpan(doc,id),check=dimensionChecks(doc).find(c=>c.id===id);if(!span||check?.model==null)throw Error('Не удалось найти границы измерения. Проверьте стены и проёмы.');
 if(!Number.isFinite(mm)||mm<100||mm>50000)throw Error('Размер должен быть от 100 до 50 000 мм');
 const next=structuredClone(doc),delta=mm-check.model,index=Number(id.slice(6));
 if(index===9)next.openings.find(o=>o.id==='door_bti_right_lower')!.width=mm;
 else if(index===10)next.openings.find(o=>o.id==='door_bti_right_lower')!.offset+=delta;
 else{const target=next.walls.find(w=>w.id===span.target)!,axis=span.axis,coordinate=target.a[axis];if(Math.abs(target.b[axis]-coordinate)>1)throw Error('Стена повёрнута: сначала уточните её направление.');const move=(p:Point):Point=>Math.abs(p[axis]-coordinate)<1?(axis===0?[p[0]+delta,p[1]]:[p[0],p[1]+delta]):p;
 for(const w of next.walls){w.a=move(w.a);w.b=move(w.b);}next.floor=next.floor.map(move);next.zones=next.zones.map(z=>({...z,polygon:z.polygon.map(move)}));}
 if(next.walls.some(w=>!Number.isFinite(length(w))||length(w)<100))throw Error('Такой размер делает соседнюю стену слишком короткой.');
 for(const o of next.openings){const before=openingMissing(doc,doc.openings.find(old=>old.id===o.id)!,false);if(openingMissing(next,o,false).some(reason=>!before.includes(reason)))throw Error('Размер конфликтует с положением проёмов. Сначала уточните соседние проёмы.');}
 if(dimensionChecks(next).find(c=>c.id===id)?.model!==Math.round(mm))throw Error('Размер нельзя применить к текущим границам.');
 next.conflictNotes={...doc.conflictNotes,[id]:'Уточнённый обмер: '+Math.round(mm)+' мм; исходная подпись '+check.source+' мм'};next.geometryReviewed=false;return next;
}
