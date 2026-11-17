export const MAX_CABINET_WIDTH_MM = 2600;
export const CABINET_BASE_HEIGHT_MM = 35;
export const CABINET_GLASS_THICKNESS_MM = 4;
export const CABINET_DOOR_GAP_MM = 2;

export function cabinetWidthMm(configuration, catalog) {
 return configuration.modules.reduce((sum, module) => {
  const model = catalog.models.find(item => item.id === module.model && !item.id.startsWith('base'));
  if (!model) throw Error('Модель комода отсутствует.');
  return sum + model.widthMm;
 }, 0);
}

export function normalizeCabinetConfig(configuration) {
 const first = configuration.modules[0];
 if (!first) throw Error('Добавьте хотя бы один комод.');
 return {
  ...configuration,
  version: 2,
  front: configuration.front || first.front,
  top: configuration.top || first.surfaces?.top || {sample:first.glass, finish:first.finish},
  base: configuration.base || {enabled:first.legs, color:first.metal},
 };
}

export function slabCut(configuration, catalog) {
 const widthMm = cabinetWidthMm(configuration, catalog);
 if (widthMm > MAX_CABINET_WIDTH_MM) throw Error('Максимальная общая ширина комодов — 260 см.');
 if (widthMm <= 0) throw Error('Добавьте хотя бы один комод.');
 const sample=catalog.samples.find(item=>item.id===(configuration.front||configuration.modules[0].front));
 if(!sample?.slabWidthMm||!sample?.slabHeightMm)throw Error('Для этого декора не подтверждён размер слэба.');
 const slabWidthMm=sample.slabWidthMm,slabHeightMm=sample.slabHeightMm;
 const heightMm = 390;
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
