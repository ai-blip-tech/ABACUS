import {cabinetDimensionsMm,normalizeCabinetConfig} from './cabinet-layout.mjs';

import {cabinetFrontFinish,isFixedCabinetFront} from './cabinet-front-finishes.mjs';

const RETAIL_MULTIPLIER = 5.5;
const standardRanges = [[1000,1300],[1500,1950],[2000,2600]];
const cageRanges = [[500,1300],...standardRanges.slice(1)];
const supportPrices = {
 S13:[71,93,119], S20:[71,93,119], PLN:[81,102,140], TBE:[72,91,128],
 CRB:[78,97,131], CG2:[66,89,117], CG4:[66,89,117], GPLN:[133,149,197],
};

export function cabinetSupportPrice(id,widthMm,models) {
 if (id==='BS'||id==='none') return 0;
 if (id==='WL') {
  const brackets = models.map(model=>[500,650,1000].includes(model.widthMm)?20:[1300,1600].includes(model.widthMm)?30:null);
  return brackets.includes(null)?null:brackets.reduce((sum,amount)=>sum+amount,0);
 }
 const ranges = id==='CG2'||id==='CG4'?cageRanges:standardRanges;
 return supportPrices[id]?.[ranges.findIndex(([min,max])=>widthMm>=min&&widthMm<=max)]??null;
}

function priceGroup(samples,selection) {
 const sample = samples.find(item=>item.id===selection?.sample);
 if (!sample) return null;
 return sample.kind==='glass'?(selection.finish==='matte'?2:1):sample.priceGroup??null;
}

export function cabinetRetailPrice(configuration,catalog) {
 const config = normalizeCabinetConfig(configuration);
 const {widthMm} = cabinetDimensionsMm(config,catalog);
 const models = config.modules.map(module=>catalog.models.find(model=>model.id===module.model));
 let units = 0;
 let estimated = false;
 for (const [index,module] of config.modules.entries()) {
  const model = models[index];
  const body = {sample:module.glass,finish:module.finish};
  const surfaces = [config.top,module.surfaces?.left||body,module.surfaces?.right||body];
  const groups = surfaces.map(selection=>priceGroup(catalog.samples,selection));
  if (groups.includes(null)) return {reason:'В прайсе нет выбранной отделки корпуса'};
  const bodyGroup = Math.max(...groups);
  // The supplier lists one group per body. Mixed groups can only be estimated.
  if (groups.some(group=>group!==bodyGroup)) estimated = true;
  const bodyPrice = model.body?.[bodyGroup-1];
  if (bodyPrice==null) return {reason:'В прайсе нет цены для этой отделки корпуса'};
  units += bodyPrice;
  for (const [frontIndex,prices] of (model.fronts||[]).entries()){
   if(isFixedCabinetFront(model,frontIndex))continue;
   const selection=cabinetFrontFinish(config,module,frontIndex);
   const group=priceGroup(catalog.samples,selection);
   if(group===1)continue;
   const amount=prices[(group??0)-1];
   if(amount==null)return {reason:'В прайсе нет цены для фасада '+(frontIndex+1)+' модуля '+model.id};
   units+=amount;
  }
 }
 const supportId = config.support.kind==='legs'?config.support.legId:config.support.kind==='base'?'BS':config.support.kind;
 const support = cabinetSupportPrice(supportId,widthMm,models);
 if (support==null) return {reason:'В прайсе нет цены для этой опоры на выбранную ширину'};
 const discountedUnitsInCents = units * (models.length>=2?95:100);
 const priceInCents = Math.round((discountedUnitsInCents+support*100)*RETAIL_MULTIPLIER);
 return estimated?{priceInCents,estimated:true}:{priceInCents};
}
