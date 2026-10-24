// Fixture data only. The measurement editor must not load the 3D engine.
const node=(type:string)=>({parse:(data:Record<string,unknown>)=>({...data,type})});
const SiteNode=node('site'),BuildingNode=node('building'),LevelNode=node('level'),WallNode=node('wall'),SlabNode=node('slab'),DoorNode=node('door'),WindowNode=node('window');

// First, manually verified digitisation of the supplied raster. Not an automatic OCR importer.
// Coordinates and dimensions below are millimetres; Pascal receives metres.
export function buildBtiScene(){
 const nodes:any={};const add=(schema:any,data:any)=>{const n=schema.parse(data);nodes[n.id]=n;return n;};
 const parent='level_bti';
 add(SiteNode,{id:'site_bti',name:'БТИ · пробная реконструкция',children:['building_bti']});
 add(BuildingNode,{id:'building_bti',name:'План по скриншоту',parentId:'site_bti',children:[parent]});
 const level=add(LevelNode,{id:parent,name:'БТИ · высота предположена 2800 мм',parentId:'building_bti',height:2.8,children:[]});
 const walls:any={};
 const wall=(id:string,a:number[],b:number[],thickness:number,name:string)=>{const n=add(WallNode,{id:'wall_bti_'+id,parentId:parent,name,start:a.map(x=>x/1000),end:b.map(x=>x/1000),thickness:thickness/1000,height:2.8,children:[],slots:{a:'library:preset-softwhite',b:'library:preset-softwhite'},metadata:{source:'user-plan-2026-10-23',method:'manual-digitisation',heightStatus:'assumed',thicknessStatus:'inferred-from-raster'}});level.children.push(n.id);walls[id]=n;return n;};
 const opening=(schema:any,id:string,host:string,u:number,width:number,height:number,y:number,extra:any={})=>{const w=walls[host];const n=add(schema,{id,parentId:w.id,wallId:w.id,name:extra.name||id,position:[u/1000,y/1000,0],width:width/1000,height:height/1000,metadata:{widthStatus:'read-from-dimension',heightStatus:'assumed',sillStatus:'assumed'},...extra});w.children.push(n.id);return n;};
 wall('north',[1230,-150],[9478,-150],300,'Наружная северная · 300 мм (оценка)');
 wall('west_niche',[1230,-150],[1230,1363],150,'Боковая прихожей · 150 мм (оценка)');
 wall('west_step',[-150,1363],[1230,1363],150,'Уступ входной части');
 wall('west',[-150,1363],[-150,6368],300,'Наружная западная · 300 мм (оценка)');
 wall('south',[-150,6368],[9478,6368],500,'Наружная южная · 500 мм (оценка)');
 wall('east',[9478,-150],[9478,6368],500,'Наружная восточная · 500 мм (оценка)');
 wall('entry_bottom',[1230,1363],[3110.5,1363],150,'Проходы прихожей · 600 + 600 мм');
 wall('entry_right',[3110.5,-150],[3110.5,1363],135,'Правая стенка прихожей · 135 мм (оценка)');
 wall('small_right',[2096,1363],[2096,3516],140,'Малая комната · чистая ширина 2026 мм');
 wall('left_horizontal',[-150,3516],[3110.5,3516],120,'Левые помещения · перегородка 120 мм (оценка)');
 wall('left_bottom_right',[3110.5,3516],[3110.5,6368],135,'Нижняя левая · чистая ширина 3043 мм');
 wall('right_vertical',[6741,-150],[6741,6368],150,'Правая перегородка · два сквозных прохода');
 wall('right_horizontal',[6741,1341],[9478,1341],180,'Верхняя правая · чистая высота 1251 мм');
 opening(DoorNode,'door_bti_entry','north',675,1000,2100,0,{name:'Вход 1000 мм · высота предположена',swingAngle:0.5,swingDirection:'outward'});
 opening(DoorNode,'door_bti_small','entry_bottom',432,600,2100,0,{name:'Проход 600 мм · без полотна',openingKind:'opening'});
 opening(DoorNode,'door_bti_corridor','entry_bottom',1296,600,2100,0,{name:'Проход 600 мм · без полотна',openingKind:'opening'});
 opening(DoorNode,'door_bti_left','left_horizontal',2733,700,2100,0,{name:'Проход 700 мм · без полотна',openingKind:'opening'});
 opening(DoorNode,'door_bti_right_upper','right_vertical',829,800,2800,0,{name:'Сквозной проход 800 мм',openingKind:'opening',frameThickness:0,threshold:false});
 opening(DoorNode,'door_bti_right_lower','right_vertical',4749.5,911,2800,0,{name:'Проход: на плане 900, в цепочке 911 мм',openingKind:'opening',frameThickness:0,threshold:false});
 opening(WindowNode,'window_bti_left','south',1592,1500,1400,1600,{name:'Окно 1500 мм · подоконник предположен 900 мм'});
 opening(WindowNode,'window_bti_center','south',4966,2230,1400,1600,{name:'Окно 2230 мм · подоконник предположен 900 мм'});
 opening(WindowNode,'window_bti_right','east',2849,1400,1400,1600,{name:'Окно справа 1400 мм · высота предположена'});
 const slab=add(SlabNode,{id:'slab_bti',name:'Контур пола по изображению',parentId:parent,polygon:[[-300,1288],[1155,1288],[1155,-300],[9728,-300],[9728,6618],[-300,6618]].map(p=>p.map(x=>x/1000)),elevation:0,thickness:0.1,autoFromWalls:false,slots:{surface:'library:preset-cream'}});level.children.push(slab.id);
 return {nodes,rootNodeIds:['site_bti'],installedPlugins:['pascal:core']};
}
export const btiChecks=[
 {name:'Малая слева · ширина',source:2026,model:2026,status:'read'},
 {name:'Малая слева · глубина',source:2018,model:2018,status:'read'},
 {name:'Нижняя слева · ширина',source:3043,model:3043,status:'derived: 692+1500+851'},
 {name:'Нижняя слева · глубина',source:2542,model:2542,status:'read'},
 {name:'Центр · ширина снизу',source:3488,model:3488,status:'read'},
 {name:'Центр · ширина сверху',source:3486,model:3488,status:'conflict'},
 {name:'Правая часть · ширина',source:2412,model:2412,status:'read'},
 {name:'Верхняя справа · глубина',source:1251,model:1251,status:'read'},
 {name:'Нижняя справа · глубина',source:4649,model:4687,status:'conflict: 568+1400+2681'},
 {name:'Нижний проход справа',source:900,model:911,status:'conflict'},
 {name:'Средняя перегородка',source:3065,model:3065,status:'read'},
];
export function liveBtiChecks(nodes:any){
 const w=(id:string)=>nodes['wall_bti_'+id];
 const x=(id:string,side:number)=>w(id)?.start[0]+side*w(id)?.thickness/2;
 const z=(id:string,side:number)=>w(id)?.start[1]+side*w(id)?.thickness/2;
 const first=nodes.door_bti_right_upper,last=nodes.door_bti_right_lower;
 const values=[
  x('small_right',-1)-x('west',1),
  z('left_horizontal',-1)-z('entry_bottom',1),
  x('left_bottom_right',-1)-x('west',1),
  z('south',-1)-z('left_horizontal',1),
  x('right_vertical',-1)-x('left_bottom_right',1),
  x('right_vertical',-1)-x('entry_right',1),
  x('east',-1)-x('right_vertical',1),
  z('right_horizontal',-1)-z('north',1),
  z('south',-1)-z('right_horizontal',1),
  last?.width,
  last?.position[0]-last?.width/2-(first?.position[0]+first?.width/2),
 ];
 return btiChecks.map((c,i)=>({...c,model:Number.isFinite(values[i])?Math.round(values[i]*1000):null}));
}
