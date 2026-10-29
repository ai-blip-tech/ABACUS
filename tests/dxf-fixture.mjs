export const record=(type,pairs=[])=>[0,type,...pairs.flat()];
export const line=(a,b,layer='A-WALL')=>record('LINE',[[8,layer],[10,a[0]],[20,a[1]],[11,b[0]],[21,b[1]]]);
export const poly=(points,layer='0')=>record('LWPOLYLINE',[[8,layer],[90,points.length],[70,1],...points.flatMap(p=>[[10,p[0]],[20,p[1]]])]);
export const insert=(name,x=0,y=0,extra=[])=>record('INSERT',[[8,'A-WALL'],[2,name],[10,x],[20,y],...extra]);
export function dxf(entities,{unit=4,blocks=[]}={}){return [0,'SECTION',2,'HEADER',9,'$INSUNITS',70,unit,0,'ENDSEC',0,'SECTION',2,'BLOCKS',...blocks,0,'ENDSEC',0,'SECTION',2,'ENTITIES',...entities,0,'ENDSEC',0,'EOF',''].join('\n');}
export const block=(name,entities,base=[0,0])=>[...record('BLOCK',[[2,name],[70,0],[10,base[0]],[20,base[1]]]),...entities,...record('ENDBLK')];
export function apartmentDxf(){const walls=[[[0,-100],[6000,-100],[6000,100],[0,100]],[[0,3900],[6000,3900],[6000,4100],[0,4100]],[[-100,0],[100,0],[100,4000],[-100,4000]],[[5900,0],[6100,0],[6100,4000],[5900,4000]]];
 return dxf([...walls.flatMap((_,i)=>insert('WALL_'+i,100000,200000)),...insert('COLUMN_1',102800,201800),...insert('DOOR_1',101200,200000),...insert('WINDOW_1',102400,204000)],{blocks:[...walls.flatMap((p,i)=>block('WALL_'+i,poly(p))),...block('COLUMN_1',poly([[0,0],[300,0],[300,300],[0,300]])),...block('DOOR_1',[...line([0,0],[900,0],'0'),...record('ARC',[[8,'0'],[10,0],[20,0],[40,900],[50,0],[51,90]])]),...block('WINDOW_1',line([0,0],[1200,0],'0'))]});}
