import sonorousCatalogue from './sonorous-catalog.mjs';
import {cabinetDimensionsMm,MAX_CABINET_WIDTH_MM} from '../../room-design-planner/cabinet-layout.mjs';

const models=Object.entries(sonorousCatalogue).map(([id,model])=>({id,...model}));
const modelIds=new Set(models.map(model=>model.id));

export type GlassPart='body'|'top'|'left'|'right';
export type CabinetFrontFinish={type:'glass'|'ceramic';sample:string;finish?:'gloss'|'matte'};
export type CabinetModule={id:string;model:string;front:string;glass:string;finish:'gloss'|'matte';legs:boolean;metal:string;frontFinishes?:Record<string,CabinetFrontFinish>;surfaces?:Partial<Record<GlassPart,{sample:string;finish:'gloss'|'matte'}>>};
export type CabinetConfig={version?:number;modules:CabinetModule[];front?:string;frontType?:'ceramic'|'glass';frontGlass?:{sample:string;finish:'gloss'|'matte'};top?:{sample:string;finish:'gloss'|'matte'};base?:{enabled:boolean;color:string};support?:{kind:'base'|'legs'|'none'|'WL';legId?:string;color?:string}};

export function validateModularCabinet(value:unknown):asserts value is CabinetConfig {
 const config=value as CabinetConfig;
 if(!config||config.version!==3||!Array.isArray(config.modules)||!config.modules.length||config.modules.length>Math.floor(MAX_CABINET_WIDTH_MM/Math.min(...models.map(model=>model.widthMm)))||JSON.stringify(config).length>16000)throw Error('Некорректная композиция комода');
 const ids=new Set<string>();
 for(const module of config.modules){
  if(!module||typeof module.id!=='string'||module.id.length>140||ids.has(module.id)||!modelIds.has(module.model)||!['front','glass','metal'].every(key=>typeof (module as any)[key]==='string'&&(module as any)[key].length<=100)||!['gloss','matte'].includes(module.finish))throw Error('Некорректный модуль комода');
  if(module.frontFinishes!==undefined){
   const model=models.find(item=>item.id===module.model)!;
   if(!module.frontFinishes||typeof module.frontFinishes!=='object'||Array.isArray(module.frontFinishes))throw Error('Некорректная отделка фасада');
   for(const [key,finish] of Object.entries(module.frontFinishes)){
    const row=model.fronts[Number(key)];
    if(!/^[0-9]$/.test(key)||!row||row.every(price=>price===null)||'fixedFront' in model||!finish||
      !['glass','ceramic'].includes(finish.type)||typeof finish.sample!=='string'||finish.sample.length>100||
      (finish.type==='glass'&&finish.finish!=='matte'&&finish.finish!=='gloss'))throw Error('Некорректная отделка фасада');
   }
  }
  ids.add(module.id);
 }
 if(cabinetDimensionsMm(config,{models}).widthMm>MAX_CABINET_WIDTH_MM)throw Error('Максимальная ширина комода — 260 см');
}
