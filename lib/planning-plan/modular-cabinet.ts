export type GlassPart='body'|'top'|'left'|'right';
export type CabinetModule={id:string;model:string;front:string;glass:string;finish:'gloss'|'matte';legs:boolean;metal:string;surfaces?:Partial<Record<GlassPart,{sample:string;finish:'gloss'|'matte'}>>};
export type CabinetConfig={version?:number;modules:CabinetModule[];front?:string;frontType?:'ceramic'|'glass';frontGlass?:{sample:string;finish:'gloss'|'matte'};top?:{sample:string;finish:'gloss'|'matte'};base?:{enabled:boolean;color:string};support?:{kind:'base'|'legs'|'none';legId?:string;color?:string}};

export function validateModularCabinet(value:unknown):asserts value is CabinetConfig {
 const config=value as CabinetConfig;
 if(!config||config.version!==3||!Array.isArray(config.modules)||!config.modules.length||config.modules.length>5||JSON.stringify(config).length>16000)throw Error('Некорректная композиция комода');
 const ids=new Set<string>();let width=0;
 for(const module of config.modules){
  if(!module||typeof module.id!=='string'||module.id.length>140||ids.has(module.id)||!['5041','5042','6541','6542'].includes(module.model)||!['front','glass','metal'].every(key=>typeof (module as any)[key]==='string'&&(module as any)[key].length<=100)||!['gloss','matte'].includes(module.finish))throw Error('Некорректный модуль комода');
  ids.add(module.id);width+=module.model.startsWith('65')?650:500;
 }
 if(width>2600)throw Error('Максимальная ширина комода — 260 см');
}
