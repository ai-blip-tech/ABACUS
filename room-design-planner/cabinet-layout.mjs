export const MAX_CABINET_WIDTH_MM = 2600;
export const CABINET_BASE_HEIGHT_MM = 35;
export const CABINET_BASE_COLOR = '#45464a';
export const CABINET_GLASS_THICKNESS_MM = 4;
export const CABINET_DOOR_GAP_MM = 2;

export function cabinetDimensionsMm(configuration, catalog) {
 const specifications=configuration.modules.map(module=>{
  const model=catalog.models.find(item=>item.id===module.model&&!item.id.startsWith('base'));
  if(!model)throw Error('Модель комода отсутствует.');
  return model;
 });
 const first=specifications[0];
 if(!first)throw Error('Добавьте хотя бы один комод.');
 if(specifications.some(model=>model.heightMm!==first.heightMm||model.depthMm!==first.depthMm)){
  throw Error('Объединять можно только модули одинаковой высоты и глубины.');
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
 const first = configuration.modules[0];
 if (!first) throw Error('Добавьте хотя бы один комод.');
 const support=configuration.support||{kind:(configuration.base?.enabled??first.legs)?'base':'none'};
 return {
  ...configuration,
  version: 3,
  support,
  front: configuration.front || first.front,
  top: configuration.top || first.surfaces?.top || {sample:first.glass, finish:first.finish},
  base: {enabled:support.kind==='base',color:CABINET_BASE_COLOR},
 };
}

export function slabCut(configuration, catalog) {
 const widthMm = cabinetWidthMm(configuration, catalog);
 if (widthMm > MAX_CABINET_WIDTH_MM) throw Error('Максимальная общая ширина комодов — 260 см.');
 if (widthMm <= 0) throw Error('Добавьте хотя бы один комод.');
 const sample=catalog.samples.find(item=>item.id===(configuration.front||configuration.modules[0].front));
 if(!sample?.slabWidthMm||!sample?.slabHeightMm)throw Error('Для этого декора не подтверждён размер слэба.');
 const slabWidthMm=sample.slabWidthMm,slabHeightMm=sample.slabHeightMm;
 const heightMm = cabinetDimensionsMm(configuration,catalog).heightMm;
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
