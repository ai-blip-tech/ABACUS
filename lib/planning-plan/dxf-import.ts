import DxfParser from 'dxf-parser';
import type {Point,Wall,MeasureDoc} from '../measured-plan/measure-model';
import {manualPlanning} from './model.ts';
import {withAutomaticFloor} from '../measured-plan/measure-auto-floor.ts';
import {straightDxfWallBlock} from './dxf-wall-block.ts';
import {DxfHatchHandler} from './dxf-hatch.ts';
import {dxfFurniture} from './dxf-furniture.ts';
import {furnitureTemplates,validateFurniture} from './furniture.ts';
import {groupLooseDxfObjects} from './dxf-loose-objects.ts';

export const dxfUnits={mm:{label:'Миллиметры',factor:1},cm:{label:'Сантиметры',factor:10},m:{label:'Метры',factor:1000},inch:{label:'Дюймы',factor:25.4},foot:{label:'Футы',factor:304.8}} as const;
export type DxfUnit=keyof typeof dxfUnits;
export type DxfRole='auto'|'wall-contour'|'wall-axis'|'column'|'reference'|'ignore';
export type DxfOptions={unit:DxfUnit;roles:Record<string,DxfRole>;axisThickness:number;furnitureKinds?:Record<string,import('./furniture').FurnitureKind>};
type Matrix=[number,number,number,number,number,number];
type Vertex={x:number;y:number;z?:number;bulge?:number};
type Entity={type:string;layer?:string;handle?:number;inPaperSpace?:boolean;visible?:boolean;vertices?:Vertex[];shape?:boolean;name?:string;position?:Vertex;xScale?:number;yScale?:number;rotation?:number;columnCount?:number;rowCount?:number;columnSpacing?:number;rowSpacing?:number;center?:Vertex;radius?:number;startAngle?:number;endAngle?:number;extrusionDirection?:Vertex;extrusionDirectionZ?:number;is3dPolyline?:boolean;isPolyfaceMesh?:boolean;is3dPolygonMesh?:boolean;hatchLoops?:Vertex[][];hatchUnsupported?:boolean;hatchColor?:string;fill?:string};
export type DxfPath={points:Point[];layer:string;block:string;instance:string;hostWall?:string;semantic:'wall'|'column'|'door'|'window'|'';curved:boolean;fill?:string};
export type DxfInstance={id:string;name:string;matrix:Matrix;semantic:DxfPath['semantic']};
export type DxfScene={paths:DxfPath[];instances:DxfInstance[];unit:DxfUnit|null;insunits:number;layers:string[];warnings:string[];blocks:number;entityCount:number;types:Record<string,number>};
export type DxfPreview={plan:MeasureDoc;reference:DxfPath[];warnings:string[];origin:Point;width:number;height:number;paired:number;unconverted:number};
const identity:Matrix=[1,0,0,1,0,0];
const transform=(p:Vertex,m:Matrix):Point=>[m[0]*p.x+m[2]*p.y+m[4],m[1]*p.x+m[3]*p.y+m[5]];
const multiply=(a:Matrix,b:Matrix):Matrix=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const project=(p:Point,u:Point)=>p[0]*u[0]+p[1]*u[1];
const semantic=(s:string):DxfPath['semantic']=>/^(?:WALL|Стена)_/iu.test(s)?'wall':/^(?:COLUMN|Колонна)_/iu.test(s)?'column':/^DOOR_/i.test(s)||/(?:^|\s)Дверь(?:\s|_|$)/iu.test(s)?'door':/^WINDOW_/i.test(s)||/^Окно(?:\s|_|$)/iu.test(s)?'window':'';
/** ASCII DXF only. No scripts, XREF downloads, network requests or embedded images. */
export function parseDxf(text:string):DxfScene{
 if(typeof text!=='string'||text.length>2_000_000)throw Error('Тестовый DXF: размер не более 2 МБ. Экспортируйте один этаж без лишних слоёв.');
 if(text.includes('\0')||text.startsWith('AutoCAD Binary DXF'))throw Error('Бинарный DXF не поддерживается. Экспортируйте текстовый ASCII DXF.');
 const rows=text.replace(/^\uFEFF/,'').trimEnd().split(/\r\n|\n|\r/);if(rows.length>320000||rows.length%2)throw Error('Некорректные пары кодов DXF или слишком большой файл.');
 const types:Record<string,number>=Object.create(null),geometryTypes:Record<string,number>=Object.create(null);let entities=0,hasEntities=false,section='',sectionNext=false;
 for(let i=0;i<rows.length;i+=2){if(!/^\s*\d+\s*$/.test(rows[i]))throw Error('Файл не похож на текстовый DXF.');const code=rows[i].trim(),value=rows[i+1].trim();if(code==='2'&&sectionNext){section=value;sectionNext=false;if(section==='ENTITIES')hasEntities=true;}if(code==='0'){if(value==='SECTION')sectionNext=true;else if(value==='ENDSEC')section='';types[value]=(types[value]||0)+1;if(section==='ENTITIES'||section==='BLOCKS')geometryTypes[value]=(geometryTypes[value]||0)+1;if(++entities>25000)throw Error('Слишком много элементов DXF для тестового импорта.');}}
 if(!hasEntities||!text.trimEnd().endsWith('EOF'))throw Error('В DXF нет секции ENTITIES или завершающей записи EOF.');
 let parsed;try{const parser=new DxfParser();parser.registerEntityHandler(DxfHatchHandler as unknown as Parameters<DxfParser['registerEntityHandler']>[0]);parsed=parser.parseSync(text);}catch{throw Error('Не удалось прочитать DXF. Сохраните 2D-вид этажа в текстовом DXF и повторите.');}if(!parsed)throw Error('Пустой DXF.');
 const warnings=new Set<string>(),paths:DxfPath[]=[],instanceData:DxfInstance[]=[];let visits=0,instances=0,totalPoints=0;
 const supported=new Set(['LINE','LWPOLYLINE','POLYLINE','ARC','CIRCLE','INSERT','BLOCK','ENDBLK','VERTEX','SEQEND','SECTION','ENDSEC','EOF','TABLE','ENDTAB','LAYER','LTYPE','VPORT','STYLE','APPID','UCS','VIEW','DIMSTYLE','BLOCK_RECORD']);
 supported.add('HATCH');for(const type of Object.keys(geometryTypes))if(!supported.has(type))warnings.add(`${type}: не преобразуется в редактируемые объекты (${geometryTypes[type]}).`);
 function walk(items:Entity[],matrix:Matrix,layer='0',block='',instance='',kind:DxfPath['semantic']='',stack:string[]=[],hostWall=''){
  for(const e of items){if(++visits>15000||paths.length>5000)throw Error('Превышен лимит раскрытия блоков DXF.');if(e.inPaperSpace||e.visible===false)continue;
   const ownLayer=e.layer&&e.layer!=='0'?e.layer:layer,table=parsed!.tables?.layer?.layers?.[ownLayer];if(table&&(table.visible===false||table.frozen))continue;
   const ex=e.extrusionDirection;if((ex&&(Math.abs(ex.x||0)>.000001||Math.abs(ex.y||0)>.000001||(ex.z!==undefined&&Math.abs(ex.z-1)>.000001)))||(e.extrusionDirectionZ!==undefined&&e.extrusionDirectionZ!==1)){warnings.add('Нестандартная OCS/3D-ориентация: элемент пропущен. Экспортируйте плоский 2D-вид.');continue;}
   if(e.type==='INSERT'){
    const name=e.name||'',b=parsed!.blocks?.[name];if(!b||b.xrefPath){warnings.add(`Блок ${name}: отсутствует или является внешней ссылкой; не загружен.`);continue;}
    if(stack.includes(name)||stack.length>=8)throw Error('Циклические или слишком глубоко вложенные блоки DXF.');
    if((e.rowCount||1)!==1||(e.columnCount||1)!==1){warnings.add(`Массив INSERT ${name}: пропущен; разложите массив перед экспортом.`);continue;}
    const a=(e.rotation||0)*Math.PI/180,sx=e.xScale??1,sy=e.yScale??1,p=e.position||{x:0,y:0},base=b.position||{x:0,y:0};
    if(![a,sx,sy,p.x,p.y,base.x,base.y].every(Number.isFinite)||sx===0||sy===0)throw Error('Некорректный масштаб или координаты INSERT.');
    const m:Matrix=[Math.cos(a)*sx,Math.sin(a)*sx,-Math.sin(a)*sy,Math.cos(a)*sy,0,0];m[4]=p.x-m[0]*base.x-m[2]*base.y;m[5]=p.y-m[1]*base.x-m[3]*base.y;
    const ownKind=semantic(name),id=`block_${++instances}`,world=multiply(matrix,m),root=ownKind||!instance;
    if(root)instanceData.push({id,name,matrix:world,semantic:ownKind});
    walk(b.entities as Entity[],world,ownLayer,name,root?id:instance,ownKind||kind,[...stack,name],ownKind==='wall'?id:hostWall);continue;
   }
   if(e.type==='HATCH'){if(e.hatchUnsupported){warnings.add('HATCH со сложной/многоконтурной границей не перенесён; требуется проверка.');continue;}for(const loop of e.hatchLoops||[])walk([{type:'LWPOLYLINE',vertices:loop,shape:true,layer:ownLayer,fill:e.hatchColor||'#eeeeea'}],matrix,ownLayer,block,instance,kind,stack,hostWall);continue;}
   let vertices:Vertex[]=[],curved=false;
   if(e.type==='LINE')vertices=e.vertices||[];
   else if(e.type==='LWPOLYLINE'||e.type==='POLYLINE'){
    if(e.is3dPolyline||e.isPolyfaceMesh||e.is3dPolygonMesh){warnings.add('Объёмная POLYLINE пропущена: нужен 2D DXF.');continue;}
    const v=e.vertices||[];for(let i=0;i<v.length;i++){const a=v[i],b=v[(i+1)%v.length];vertices.push(a);if(!e.shape&&i===v.length-1)break;if(a.bulge){curved=true;const chord=Math.hypot(b.x-a.x,b.y-a.y),theta=4*Math.atan(a.bulge),r=chord*(1+a.bulge*a.bulge)/(4*Math.abs(a.bulge)),h=chord*(1-a.bulge*a.bulge)/(4*a.bulge),cx=(a.x+b.x)/2-(b.y-a.y)/(chord||1)*h,cy=(a.y+b.y)/2+(b.x-a.x)/(chord||1)*h,start=Math.atan2(a.y-cy,a.x-cx),n=Math.min(128,Math.max(4,Math.ceil(Math.abs(theta)*16)));for(let j=1;j<n;j++)vertices.push({x:cx+r*Math.cos(start+theta*j/n),y:cy+r*Math.sin(start+theta*j/n)});}}
    if(e.shape&&v.length)vertices.push(v[0]);
   }else if(e.type==='ARC'||e.type==='CIRCLE'){
    if(!e.center||!Number.isFinite(e.radius)||e.radius!<=0)continue;curved=true;const start=e.startAngle||0;let span=e.type==='CIRCLE'?Math.PI*2:(e.endAngle||0)-start;if(span<=0)span+=Math.PI*2;const n=Math.min(128,Math.max(8,Math.ceil(span*16)));for(let i=0;i<=n;i++)vertices.push({x:e.center.x+e.radius!*Math.cos(start+span*i/n),y:e.center.y+e.radius!*Math.sin(start+span*i/n)});
   }else continue;
   if(vertices.length<2)continue;if(vertices.length>3000)throw Error('Слишком длинная полилиния.');if(vertices.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e12||Math.abs(p.y)>1e12))throw Error('Недопустимые координаты DXF.');
   if(vertices.some(p=>Math.abs(p.z||0)>1e-6))warnings.add('Координата Z не переносится: импортируется проекция XY одного этажа.');
   const points=vertices.map(p=>transform(p,matrix));if(points.some(p=>p.some(v=>!Number.isFinite(v)||Math.abs(v)>1e12)))throw Error('Выход координат блока за допустимый диапазон.');
   totalPoints+=points.length;if(totalPoints>30000)throw Error('Больше 30 000 точек: упростите DXF до одного этажа.');
   paths.push({points,layer:ownLayer,block,instance,hostWall,semantic:kind,curved,...(e.fill?{fill:e.fill}:{})});
  }
 }
 walk(parsed.entities as Entity[],identity);
 if(!paths.length)throw Error('В DXF нет поддерживаемых видимых 2D-линий в пространстве модели.');
 const insunits=Number(parsed.header?.$INSUNITS||0),unit=({1:'inch',2:'foot',4:'mm',5:'cm',6:'m'} as Record<number,DxfUnit>)[insunits]||null;
 if(unit&&groupLooseDxfObjects(paths,instanceData,dxfUnits[unit].factor))warnings.add('Разрозненные линии сгруппированы по замкнутому контуру. Назначение таких предметов необходимо указать вручную.');
 if(!unit)warnings.add('Единицы не заданы или не поддерживаются ($INSUNITS). Выберите их вручную. Масштаб листа не применяется.');
 if(types.INSERT)warnings.add('Блоки раскрыты с учётом базовой точки, вложенности, переноса, масштаба и поворота. Имена блоков — подсказка, не BIM-классификация.');
 return{paths,instances:instanceData,unit,insunits,layers:[...new Set(paths.map(p=>p.layer))].sort(),warnings:[...warnings],blocks:instances,entityCount:visits,types};
}
export function defaultDxfRoles(scene:DxfScene):Record<string,DxfRole>{return Object.fromEntries(scene.layers.map(layer=>[layer,scene.paths.some(p=>p.layer===layer&&p.instance)?'auto':/wall|стен|перегород/i.test(layer)?'wall-contour':/column|колонн/i.test(layer)?'column':'auto']));}
type Segment={a:Point;b:Point;layer:string;instance:string};
/** Conservative contour pairing: never turns an unmatched boundary into a second wall. */
export function convertDxf(scene:DxfScene,options:DxfOptions,fileName='Импорт DXF'):DxfPreview{
 if(!options||!Object.hasOwn(dxfUnits,options.unit)||!options.roles||typeof options.roles!=='object'||!Number.isFinite(options.axisThickness)||options.axisThickness<30||options.axisThickness>1500)throw Error('Выберите единицы и толщину осевых стен от 30 до 1500 мм.');
 if(Object.values(options.roles).some(r=>!['auto','wall-contour','wall-axis','column','reference','ignore'].includes(r)))throw Error('Неизвестное назначение слоя.');
 if(options.furnitureKinds&&(Object.keys(options.furnitureKinds).length>500||Object.values(options.furnitureKinds).some(kind=>!furnitureTemplates.some(t=>t.kind===kind))))throw Error('Некорректные типы мебели DXF.');
 const factor=dxfUnits[options.unit].factor,warnings=new Set(scene.warnings),roles=options.roles;
 const selected=scene.paths.filter(p=>roles[p.layer]!=='ignore');if(!selected.length)throw Error('Все слои отключены.');
 const xs=selected.flatMap(p=>p.points.map(v=>v[0])),ys=selected.flatMap(p=>p.points.map(v=>v[1]));const origin:Point=[Math.min(...xs),Math.max(...ys)];
 const width=(Math.max(...xs)-origin[0])*factor,height=(origin[1]-Math.min(...ys))*factor;
 if(!Number.isFinite(width)||!Number.isFinite(height)||width>190000||height>190000)throw Error('Габариты больше 190 м. Проверьте единицы, лишние слои и экспорт одного этажа.');
 const paths=selected.map(p=>({...p,points:p.points.map(v=>[(v[0]-origin[0])*factor,(origin[1]-v[1])*factor] as Point)}));
 const plan=manualPlanning().plan;plan.name='Планировка из DXF';plan.source={...plan.source,name:fileName.slice(0,300),mime:'application/x-room-plan',hash:'dxf-pending',method:'manual'};plan.scaleConfirmed=false;plan.columns=[];
 const contours:Segment[]=[],reference:DxfPath[]=[],columnGroups=new Map<string,DxfPath[]>(),openings=new Map<string,DxfPath[]>(),wallHosts=new Map<string,string>(),handledBlocks=new Set<string>(),handledOpenings=new Set<string>();let paired=0,unconverted=0;
 const wall=(a:Point,b:Point,thickness:number,layer:string,paired:boolean)=>{if(distance(a,b)<1)return;plan.walls.push({id:crypto.randomUUID(),name:`Стена DXF ${plan.walls.length+1}`,a,b,thickness,height:null,group:'inner',lengthConfirmed:false,thicknessConfirmed:false,provenance:`DXF · слой ${layer.slice(0,160)} · ${paired?'толщина между гранями':'осевая линия, толщина задана при импорте'}; несущий статус неизвестен`});};
 const namedWalls=new Map<string,DxfPath[]>();for(const p of paths)if(p.semantic==='wall'&&!p.fill&&(roles[p.layer]||'auto')==='auto')namedWalls.set(p.instance,[...(namedWalls.get(p.instance)||[]),p]);
 for(const [instance,group]of namedWalls){const shape=straightDxfWallBlock(group,paths.filter(p=>p.hostWall===instance&&(p.semantic==='door'||p.semantic==='window')&&(roles[p.layer]||'auto')==='auto'));if(!shape)continue;
  wall(shape.a,shape.b,shape.thickness,group[0].layer,true);const host=plan.walls.at(-1)!;host.name=group[0].block.slice(0,240);wallHosts.set(instance,host.id);handledBlocks.add(instance);paired++;
  for(const gap of shape.gaps){handledOpenings.add(gap.instance);plan.openings.push({id:crypto.randomUUID(),wallId:host.id,kind:gap.kind,offset:gap.offset,width:gap.width,height:null,sill:gap.kind==='door'?0:null,confirmed:false});}
 }
 for(const p of paths){const role=roles[p.layer]||'auto';
  if(p.semantic==='wall'&&(handledBlocks.has(p.instance)||p.fill))continue;
  if(role==='reference'){reference.push(p);continue;}
  if(role==='column'||(role==='auto'&&p.semantic==='column')){if(!p.instance&&distance(p.points[0],p.points[p.points.length-1])>1){reference.push(p);warnings.add('Колонны без блоков должны быть отдельными замкнутыми прямоугольными полилиниями.');continue;}const key=p.instance||`column_${columnGroups.size}`;columnGroups.set(key,[...(columnGroups.get(key)||[]),p]);continue;}
  if(role==='auto'&&(p.semantic==='door'||p.semantic==='window')){const key=p.instance;openings.set(key,[...(openings.get(key)||[]),p]);continue;}
  if(role==='auto'&&p.semantic!=='wall'){reference.push(p);continue;}
  if(p.curved){reference.push(p);warnings.add('Криволинейные стены показаны линиями, но не заменены ломаной стеной: модель редактора поддерживает прямые стены.');unconverted++;continue;}
  for(let i=1;i<p.points.length;i++){const a=p.points[i-1],b=p.points[i];if(distance(a,b)<1)continue;if(role==='wall-axis')wall(a,b,options.axisThickness,p.layer,false);else contours.push({a,b,layer:p.layer,instance:p.semantic==='wall'?p.instance:''});}
 }
 if(contours.length>2000)throw Error('Больше 2000 контурных отрезков: отключите штриховку, размеры и служебные слои.');
 // Deduplicate contour edges before pairing (a frequent DXF export artefact).
 const seen=new Set<string>(),segments=contours.filter(s=>{const ends=[s.a.map(v=>v.toFixed(2)).join(','),s.b.map(v=>v.toFixed(2)).join(',')].sort().join('|'),key=s.layer+'|'+s.instance+'|'+ends;if(seen.has(key))return false;seen.add(key);return true;});
 const used=new Set<number>();
 for(let i=0;i<segments.length;i++){
  if(used.has(i))continue;const a=segments[i],len=distance(a.a,a.b),u:Point=[(a.b[0]-a.a[0])/len,(a.b[1]-a.a[1])/len],n:Point=[-u[1],u[0]],a0=project(a.a,u),a1=project(a.b,u);let best=-1,bestGap=Infinity;
  for(let j=i+1;j<segments.length;j++){if(used.has(j))continue;const b=segments[j],bl=distance(b.a,b.b);if(a.layer!==b.layer||a.instance!==b.instance||Math.abs((b.b[0]-b.a[0])*n[0]+(b.b[1]-b.a[1])*n[1])>bl*.002)continue;
   const gap=Math.abs(project(b.a,n)-project(a.a,n)),lo=Math.min(project(b.a,u),project(b.b,u)),hi=Math.max(project(b.a,u),project(b.b,u));
   if(gap<30||gap>1000||gap>Math.min(len,bl)*.6||Math.abs(lo-a0)>Math.max(2,gap)||Math.abs(hi-a1)>Math.max(2,gap))continue;
   if(gap<bestGap){best=j;bestGap=gap;}
  }
  if(best<0)continue;used.add(i);used.add(best);const b=segments[best],lo=Math.max(a0,Math.min(project(b.a,u),project(b.b,u))),hi=Math.min(a1,Math.max(project(b.a,u),project(b.b,u))),v=(project(a.a,n)+project(b.a,n))/2;
  wall([u[0]*lo+n[0]*v,u[1]*lo+n[1]*v],[u[0]*hi+n[0]*v,u[1]*hi+n[1]*v],bestGap,a.layer,true);paired++;
  // End caps of the same outline are consumed with the two long faces.
  for(let k=0;k<segments.length;k++){const cap=segments[k];if(used.has(k)||cap.layer!==a.layer||cap.instance!==a.instance)continue;
   if([a.a,a.b].some(pa=>[b.a,b.b].some(pb=>(distance(cap.a,pa)<1&&distance(cap.b,pb)<1)||(distance(cap.b,pa)<1&&distance(cap.a,pb)<1))))used.add(k);
  }
 }
 for(let i=0;i<segments.length;i++)if(!used.has(i)){reference.push({points:[segments[i].a,segments[i].b],layer:segments[i].layer,block:'',instance:'',semantic:'',curved:false});unconverted++;}
 if(unconverted)warnings.add(`${unconverted} контурных отрезков/кривых не стали стенами. Проверьте пары граней; для настоящих осей выберите «Оси стен».`);
 for(const group of columnGroups.values()){
  const pts=group.flatMap(p=>p.points),x0=Math.min(...pts.map(p=>p[0])),y0=Math.min(...pts.map(p=>p[1])),w=Math.max(...pts.map(p=>p[0]))-x0,h=Math.max(...pts.map(p=>p[1]))-y0;
  if(group.some(p=>p.curved||p.points.some((a,i)=>i>0&&Math.abs(a[0]-p.points[i-1][0])>1&&Math.abs(a[1]-p.points[i-1][1])>1))||pts.some(p=>Math.min(Math.abs(p[0]-x0),Math.abs(p[0]-x0-w))>1||Math.min(Math.abs(p[1]-y0),Math.abs(p[1]-y0-h))>1)||!([[x0,y0],[x0+w,y0],[x0,y0+h],[x0+w,y0+h]] as Point[]).every(corner=>pts.some(p=>distance(p,corner)<1))||w<30||h<30){reference.push(...group);warnings.add('Непрямоугольная или повёрнутая колонна оставлена в линиях: требуется ручная проверка.');continue;}
  plan.columns.push({id:crypto.randomUUID(),name:`К${plan.columns.length+1}`,a:[x0,y0],width:w,depth:h,height:null,confirmed:false,structuralStatus:'unknown',provenance:'Блок/слой COLUMN в DXF; несущий статус не подтверждён'});
 }
 // Only attach unambiguous axis-aligned opening blocks to an existing wall.
 for(const group of openings.values()){
  if(handledOpenings.has(group[0].instance))continue;
  const pts=group.flatMap(p=>p.points),x0=Math.min(...pts.map(p=>p[0])),x1=Math.max(...pts.map(p=>p[0])),y0=Math.min(...pts.map(p=>p[1])),y1=Math.max(...pts.map(p=>p[1])),center:Point=[(x0+x1)/2,(y0+y1)/2];
  const namedHost=wallHosts.get(group[0].hostWall||'');
  const candidates=plan.walls.filter(w=>!namedHost||w.id===namedHost).map(w=>{const l=distance(w.a,w.b),u:Point=[(w.b[0]-w.a[0])/l,(w.b[1]-w.a[1])/l],n:Point=[-u[1],u[0]],projections=pts.map(p=>project(p,u)),offset=project(center,u)-project(w.a,u),openingWidth=Math.max(...projections)-Math.min(...projections);return{w,l,u,offset,openingWidth,dist:Math.min(...pts.map(p=>Math.abs(project(p,n)-project(w.a,n))))};}).filter(c=>c.dist<=c.w.thickness/2+10&&c.openingWidth>=100&&c.offset-c.openingWidth/2>=-1&&c.offset+c.openingWidth/2<=c.l+1).sort((a,b)=>a.dist-b.dist);
  if(candidates.length!==1){reference.push(...group);warnings.add(`Блок ${group[0].semantic==='door'?'двери':'окна'} ${group[0].block}: родительская стена неоднозначна. Проём не создан автоматически.`);continue;}
  const c=candidates[0];plan.openings.push({id:crypto.randomUUID(),wallId:c.w.id,kind:group[0].semantic==='door'?'door':'window',offset:c.offset,width:c.openingWidth,height:null,sill:group[0].semantic==='door'?0:null,confirmed:false});warnings.add('Проёмы из блоков требуют проверки ширины, навески и открывания; 2D-символ не содержит всех BIM-параметров.');
 }
 // Contours stop at wall faces; the editable axes must meet at the junction.
 // Only close a gap no larger than the evidenced half-thickness of its host.
 const originalWalls=structuredClone(plan.walls);
 const openingPoints=new Map(plan.openings.map(o=>{const w=originalWalls.find(w=>w.id===o.wallId)!,l=distance(w.a,w.b);return[o.id,[w.a[0]+(w.b[0]-w.a[0])*o.offset/l,w.a[1]+(w.b[1]-w.a[1])*o.offset/l] as Point];}));
 for(const w of plan.walls)for(const end of ['a','b'] as const){const original=originalWalls.find(p=>p.id===w.id)!,dx=original.b[0]-original.a[0],dy=original.b[1]-original.a[1],l=Math.hypot(dx,dy);let best:Point|null=null,bestDistance=Infinity;
  for(const host of originalWalls){if(host.id===w.id)continue;const hx=host.b[0]-host.a[0],hy=host.b[1]-host.a[1],hl=Math.hypot(hx,hy),den=dx*hy-dy*hx;if(Math.abs(den)<l*hl*.99)continue;const qx=host.a[0]-original.a[0],qy=host.a[1]-original.a[1],t=(qx*hy-qy*hx)/den,s=(qx*dy-qy*dx)/den,p:Point=[original.a[0]+dx*t,original.a[1]+dy*t],gap=distance(original[end],p);
   if(gap>host.thickness/2+1||gap>=bestDistance||s*hl<-(original.thickness/2+1)||(s-1)*hl>original.thickness/2+1)continue;best=p;bestDistance=gap;
  }if(best)w[end]=best;
 }
 for(const o of plan.openings){const w=plan.walls.find(w=>w.id===o.wallId)!,p=openingPoints.get(o.id)!,l=distance(w.a,w.b);o.offset=((p[0]-w.a[0])*(w.b[0]-w.a[0])+(p[1]-w.a[1])*(w.b[1]-w.a[1]))/l;}
 for(const instance of scene.instances||[]){if(instance.semantic)continue;const members=selected.filter(p=>p.instance===instance.id&&!p.semantic&&(roles[p.layer]||'auto')==='auto');if(!members.length)continue;const item=dxfFurniture(instance,members,factor,origin,options.furnitureKinds?.[instance.id]);if(item)plan.furniture!.push(item);else warnings.add(`Блок «${instance.name.slice(0,120)}» не стал предметом: нет допустимого двумерного габарита.`);}
 plan.furniture=validateFurniture(plan.furniture||[]);
 if(plan.furniture.some(f=>f.cad?.classification==='unknown'))warnings.add('Есть предметы с неизвестным назначением. Выберите тип в списке мебели; исходный векторный рисунок сохранён.');
 if(plan.walls.length>500||plan.columns.length>200||plan.openings.length>1000)throw Error('Слишком много объектов для редактора: импортируйте один этаж.');
 if(!plan.walls.length&&!plan.columns.length)warnings.add('Архитектурные объекты не распознаны. Назначьте слою контуры или оси стен; одни справочные линии не импортируются.');
 if(handledOpenings.size)warnings.add('Проёмы восстановлены по разрывам граней стены и вложенным блокам. Навеску и направление открывания нужно проверить.');
 warnings.add('DXF не подтверждает материал, высоты и несущий статус. Размеры из геометрии требуют проверки; это не согласованный строительный проект.');
 return{plan:withAutomaticFloor(plan),reference,warnings:[...warnings],origin,width,height,paired,unconverted};
}
