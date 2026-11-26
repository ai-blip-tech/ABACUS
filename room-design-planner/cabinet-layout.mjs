export const MAX_CABINET_WIDTH_MM = 2600;
export const CABINET_BASE_HEIGHT_MM = 35;
export const CABINET_BASE_COLOR = '#45464a';
export const CABINET_GLASS_THICKNESS_MM = 4;
export const CABINET_DOOR_GAP_MM = 2;

export const cabinetCategoryLabels = {
 sideboards:'Комоды',
 tv:'ТВ-тумбы',
 wall:'Настенные шкафы',
 'transparent-wall':'Прозрачные настенные шкафы',
 bars:'Бары',
};

export function cabinetInCategory(model,category) {
 const sideboard=model.categories?.includes('sideboards')||model.categories?.includes('drawers');
 return model.categories?.includes(category)||(sideboard&&(category==='sideboards'||category==='tv'&&model.heightMm===390));
}

export function isStandaloneCabinet(model) {
 return !!model?.categories?.some(category=>['wall','transparent-wall','bars'].includes(category));
}

export function cabinetCombinationConflict(first,second) {
 if(isStandaloneCabinet(first)||isStandaloneCabinet(second)){
  return 'Настенные шкафы и бары добавляются по одному.';
 }
 if(Boolean(first.categories?.includes('tv'))!==Boolean(second.categories?.includes('tv'))){
  return 'ТВ-модули и модули комодов собираются в отдельные композиции.';
 }
 if(first.heightMm!==second.heightMm||first.depthMm!==second.depthMm){
  return 'Объединять можно только модули одинаковой высоты и глубины.';
 }
}

export function cabinetDimensionsMm(configuration, catalog) {
 const specifications=configuration.modules.map(module=>{
  const model=catalog.models.find(item=>item.id===module.model&&!item.id.startsWith('base'));
  if(!model)throw Error('Модель комода отсутствует.');
  return model;
 });
 const first=specifications[0];
 if(!first)throw Error('Добавьте хотя бы один комод.');
 for(const model of specifications.slice(1)){
  const conflict=cabinetCombinationConflict(first,model);
  if(conflict)throw Error(conflict);
 }
 return {
  widthMm:specifications.reduce((sum,model)=>sum+model.widthMm,0),
  heightMm:first.heightMm,
  depthMm:first.depthMm,
 };
}

export function cabinetWidthMm(configuration, catalog) {
 return cabinetDimensionsMm(configuration,catalog).widthMm;
}

export function normalizeCabinetConfig(configuration) {
 const glassSurface=surface=>surface?.sample?.startsWith('ceramic-')?{sample:'WHT',finish:'gloss'}:surface;
 const modules=configuration.modules.map(module=>{
  const body=glassSurface({sample:module.glass,finish:module.finish});
  const surfaces=module.surfaces&&Object.fromEntries(Object.entries(module.surfaces).map(([key,value])=>[key,glassSurface(value)]));
  return {...module,glass:body.sample,finish:body.finish,surfaces};
 });
 const first = modules[0];
 if (!first) throw Error('Добавьте хотя бы один комод.');
 const support=configuration.support||{kind:(configuration.base?.enabled??first.legs)?'base':'none'};
 return {
  ...configuration,
  version: 3,
  modules,
  support,
  front: configuration.front || first.front,
  frontType:configuration.frontType||'ceramic',
  frontGlass:configuration.frontGlass||{sample:first.glass,finish:first.finish},
  top: glassSurface(configuration.top) || first.surfaces?.top || {sample:first.glass, finish:first.finish},
  base: {enabled:support.kind==='base',color:CABINET_BASE_COLOR},
 };
}

export function slabCut(configuration, catalog) {
 const widthMm = cabinetWidthMm(configuration, catalog);
 if (widthMm > MAX_CABINET_WIDTH_MM) throw Error('Максимальная общая ширина комодов — 260 см.');
 if (widthMm <= 0) throw Error('Добавьте хотя бы один комод.');
 const heightMm=cabinetDimensionsMm(configuration,catalog).heightMm;
 const transparentOnly=configuration.modules.every(module=>catalog.models.find(item=>item.id===module.model)?.fixedFront==='transparent-glass');
 if(configuration.frontType==='glass'||transparentOnly)return {widthMm,heightMm,slabWidthMm:widthMm,slabHeightMm:heightMm,xMm:0,yMm:0};
 const sample=catalog.samples.find(item=>item.id===(configuration.front||configuration.modules[0].front));
 if(!sample?.slabWidthMm||!sample?.slabHeightMm)throw Error('Для этого декора не подтверждён размер слэба.');
 const slabWidthMm=sample.slabWidthMm,slabHeightMm=sample.slabHeightMm;
 if(heightMm>slabHeightMm)throw Error('Высота корпуса превышает короткую сторону выбранного слэба.');
 if(widthMm>slabWidthMm)throw Error('Длина выбранного слэба — '+slabWidthMm/10+' см. Для композиции выберите другой декор.');
 return {
  slabWidthMm,
  slabHeightMm,
  xMm: (slabWidthMm - widthMm) / 2,
  yMm: (slabHeightMm - heightMm) / 2,
  widthMm,
  heightMm,
 };
}

export function slabUV(point, moduleWidthM, offsetMm, cut) {
 return [
  // Rotate the portrait slab photograph so its long edge runs across the cabinets.
  (cut.yMm + point.y * 1000) / cut.slabHeightMm,
  1 - (cut.xMm + offsetMm + (point.x + moduleWidthM / 2) * 1000) / cut.slabWidthMm,
 ];
}


export function cabinetLegPositions(widthMm, depthMm, footWidthMm, footDepthMm) {
 const inset=35;
 const x=widthMm/2-inset-footWidthMm/2;
 const z=depthMm/2-inset-footDepthMm/2;
 if(x<=0||z<=0)throw Error('Ножки не помещаются под комодом.');
 const columns=widthMm>2000?[-x,0,x]:[-x,x];
 return columns.flatMap(position=>[-z,z].map(depth=>[position/1000,0,depth/1000]));
}
