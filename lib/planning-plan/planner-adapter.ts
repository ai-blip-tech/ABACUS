import {floorRegionGeometry,validateFloorRegions} from '../measured-plan/measure-floor-finishes.ts';
import type {MeasureDoc} from '../measured-plan/measure-model';

/** Exchange boundary: Room Design XY millimetres -> Pascal XZ metres.
 * Furniture rotation is clockwise in source XY, hence negative Three.js Y.
 * Unknown heights require explicit preview overrides; never invent survey data.
 */
export function planningToPlanner(plan:MeasureDoc,options:{wallHeightMm?:number;doorHeightMm?:number;windowHeightMm?:number;windowSillMm?:number;furnitureHeightsMm?:Record<string,number>;assetFor:(kind:string,id?:string)=>string}){
 const nodes:Record<string,any>={},warnings:string[]=[];
 const positive=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0;
 const mm=(v:number)=>v/1000;
 const height=(actual:number|null|undefined,fallback:number|undefined,label:string)=>{if(positive(actual))return mm(actual!);if(!positive(fallback))throw Error('Не задана высота: '+label);warnings.push(`${label}: временно ${fallback} мм`);return mm(fallback!);};
 const point=(p:number[])=>{if(p.length!==2||p.some(v=>!Number.isFinite(v)))throw Error('Некорректные координаты');return p.map(mm);};
 const add=(type:string,id:string,parentId:string|null,body:Record<string,unknown>):any=>{if(nodes[id])throw Error('Повторный ID: '+id);return nodes[id]={object:'node',type,id,parentId,visible:true,metadata:{},...body};};
 const site=add('site','site_roomdesign',null,{name:plan.name,children:['building_roomdesign']});
 add('building','building_roomdesign',site.id,{name:plan.name,children:['level_roomdesign']});
 const level=add('level','level_roomdesign','building_roomdesign',{name:'Планировочное решение',level:0,baseElevation:0,height:height(plan.height,options.wallHeightMm,'Высота этажа'),children:[]});
 const child=(type:string,id:string,body:Record<string,unknown>)=>{level.children.push(id);return add(type,id,level.id,body);};
 const wallIds=new Map<string,string>();
 for(const w of plan.walls){if(!positive(w.thickness)||Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])<1)throw Error('Некорректная стена: '+w.name);const id='wall_'+w.id;wallIds.set(w.id,id);child('wall',id,{name:w.name,material:{preset:'white',properties:{color:'#efede8',roughness:1}},start:point(w.a),end:point(w.b),thickness:mm(w.thickness),height:height(w.height||plan.height,options.wallHeightMm,w.name),children:[],metadata:{roomDesignId:w.id,group:w.group}});}
 for(const o of plan.openings){const wallId=wallIds.get(o.wallId);if(!wallId)throw Error('Проём без стены: '+o.id);const type=o.kind==='window'?'window':'door',id=type+'_'+o.id;
  const h=height(o.height,o.kind==='window'?options.windowHeightMm:options.doorHeightMm,'Проём '+o.id);
  let sill=o.kind==='window'?o.sill:0;if(sill===null||sill===undefined){if(options.windowSillMm===undefined)throw Error('Не задан подоконник: '+o.id);sill=options.windowSillMm;warnings.push(`Подоконник ${o.id}: временно ${sill} мм`);}
  const wall=plan.walls.find(w=>w.id===o.wallId)!;if(!positive(o.width)||o.offset-o.width/2<-.5||o.offset+o.width/2>Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1])+.5)throw Error('Проём выходит за стену: '+o.id);
  const n=add(type,id,wallId,{name:o.kind==='window'?'Окно':o.kind==='opening'?'Проход':'Дверь',wallId,position:[mm(o.offset),mm(sill)+h/2,0],width:mm(o.width),height:h,openingKind:o.kind==='opening'?'opening':type,verticalAnchor:'wall',hingesSide:o.hingesSide||'left',swingDirection:o.swingDirection||'inward',swingAngle:0,metadata:{roomDesignId:o.id}});nodes[wallId].children.push(n.id);
 }
 if(plan.floor.length<3)throw Error('Не задан контур пола');
 child('slab','slab_roomdesign',{name:'Пол',material:{preset:'white',properties:{color:'#dfddd6',roughness:1}},polygon:plan.floor.map(point),elevation:0,thickness:.1,autoFromWalls:false,metadata:{roomDesignFloor:true,roomDesignFloorRegions:validateFloorRegions(plan.floorRegions||[]),roomDesignFloorGeometry:(plan.floorRegions||[]).map(region=>({id:region.id,...floorRegionGeometry(plan,region)}))}});
 const within=(p:number[],polygon:number[][])=>{let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 const elevation=(p:number[])=>{const zones=plan.zones.filter(z=>within(p,z.polygon));if(zones.length>1)throw Error('Пересечение зон высоты');return zones[0]?.elevation||0;};
 for(const z of plan.zones){child('slab','slab_zone_'+z.id,{name:z.name,polygon:z.polygon.map(point),elevation:mm(z.elevation),thickness:.1,autoFromWalls:false,metadata:{roomDesignId:z.id,ceilingHeightMm:z.height}});if(z.height&&z.height!==plan.height)warnings.push(`${z.name}: отдельная высота потолка сохранена в metadata, сложный потолок не построен`);}
 for(const c of plan.columns||[]){child('item','item_column_'+c.id,{name:c.name,position:[mm(c.a[0]+c.width/2),mm(elevation(c.a)),mm(c.a[1]+c.depth/2)],rotation:[0,0,0],scale:[mm(c.width),height(c.height||plan.height,options.wallHeightMm,c.name),mm(c.depth)],children:[],asset:{id:'roomdesign-column',name:c.name,category:'column',thumbnail:'',src:options.assetFor('column'),dimensions:[1,1,1]},metadata:{roomDesignId:c.id,column:true}});}
 for(const f of plan.furniture||[]){if(!positive(f.width)||!positive(f.depth))throw Error('Укажите габариты мебели: '+f.name);const dimensions=[mm(f.width),height(f.height,options.furnitureHeightsMm?.[f.id],f.name),mm(f.depth)];if(f.cad?.classification==='unknown')warnings.push(`${f.name}: назначение не определено, показан CAD-контур без подмены типом мебели`);child('item','item_'+f.id,{name:f.name,position:[mm(f.position[0]),mm(elevation(f.position)),mm(f.position[1])],rotation:[0,-f.rotation*Math.PI/180,0],scale:dimensions,children:[],asset:{id:'roomdesign-'+f.kind,name:f.name,category:f.kind,thumbnail:f.catalog?.image||'',src:options.assetFor(f.kind,f.id),dimensions:[1,1,1]},metadata:{roomDesignId:f.id,kind:f.kind,dimensionsSource:f.dimensionsSource,roomDesignFurniture:structuredClone(f),representation:f.cad?'extruded-cad-footprint':'schematic-not-exact-catalog-model'}});}
 return{scene:{nodes,rootNodeIds:[site.id],installedPlugins:['pascal:core']},warnings,report:{walls:plan.walls.length,openings:plan.openings.length,furniture:plan.furniture?.length||0,columns:plan.columns?.length||0,units:'m',sourceUnits:'mm'}};
}
