import type {PlanningDoc} from './model.ts';
import type {PlanningAlbum} from './variants.ts';
export type PlanningSourceMode='measured'|'manual'|'archicad';
export type ManualWorkspace={active:PlanningSourceMode;drafts:Partial<Record<PlanningSourceMode,PlanningDoc>>;history:PlanningDoc[];sheets?:Partial<Record<PlanningSourceMode,PlanningDoc[]>>;activeSheets?:Partial<Record<PlanningSourceMode,number>>};
function copies(base:PlanningDoc):PlanningDoc[]{return[structuredClone(base),...Array.from({length:2},()=>{const copy=structuredClone(base);copy.plan.id=crypto.randomUUID();return copy;})];}
/** Legacy draft becomes sheet 1. Never delete its geometry or historical variants. */
export function withManualSheets(album:PlanningAlbum,bases?:{measured:PlanningDoc|null;manual:PlanningDoc}):PlanningAlbum{
 const next=structuredClone(album),old=next.variants.manual;if(!old)return next;
 const state=next.manualWorkspace||{active:manualSourceMode(next),drafts:{},history:[]};state.sheets||={};state.activeSheets||={};
 state.drafts[state.active]={version:1,source:structuredClone(next.source),plan:structuredClone(old.plan)};
 for(const mode of ['measured','archicad','manual'] as const){const draft=state.drafts[mode];if(!draft)continue;if(!state.sheets[mode]){const base=mode==='measured'?bases?.measured:null;const sheets=copies(base||draft);sheets[0]=structuredClone(draft);state.sheets[mode]=sheets;state.activeSheets[mode]=0;}}
 state.sheets[state.active]![state.activeSheets[state.active]||0]=structuredClone(state.drafts[state.active]!);next.manualWorkspace=state;return next;
}
export function manualSheetIndex(album:PlanningAlbum){return album.manualWorkspace?.activeSheets?.[manualSourceMode(album)]||0;}
export function switchManualSheet(album:PlanningAlbum,index:unknown):PlanningAlbum{
 if(!Number.isInteger(index)||Number(index)<0||Number(index)>2)throw Error('Выберите лист 1, 2 или 3.');const next=withManualSheets(album),state=next.manualWorkspace!,old=next.variants.manual!,target=state.sheets![state.active]![Number(index)];if(!target)throw Error('Лист не найден');state.activeSheets![state.active]=Number(index);state.drafts[state.active]=structuredClone(target);
 return{...next,source:structuredClone(target.source),activeVariantId:'manual',selected:null,variants:{...next.variants,manual:{...old,plan:structuredClone(target.plan),revision:old.revision+1,updatedAt:new Date().toISOString()}}};
}
export function manualSourceMode(album:PlanningAlbum):PlanningSourceMode{return album.manualWorkspace?.active||(album.variants.manual?.plan.source.hash.startsWith('dxf-')?'archicad':album.source.kind==='manual'?'manual':'measured');}
/** Swap source drafts, never overwrite earlier stages or delete legacy AI variants. */
export function switchManualSource(album:PlanningAlbum,mode:unknown,bases:{measured:PlanningDoc|null;manual:PlanningDoc},refresh=false):PlanningAlbum{
 if(mode!=='measured'&&mode!=='manual'&&mode!=='archicad')throw Error('Выберите основу планировки.');
 const next=withManualSheets(album,bases),old=next.variants.manual;if(!old)throw Error('Ручная планировка не найдена');
 const state:ManualWorkspace=next.manualWorkspace||{active:manualSourceMode(next),drafts:{},history:[]};
 state.drafts[state.active]={version:1,source:structuredClone(next.source),plan:structuredClone(old.plan)};
 if(!state.drafts[mode]||refresh){
  const base=mode==='archicad'?null:bases[mode];if(!base)throw Error(mode==='archicad'?'Сначала загрузите и подтвердите DXF.':'Сначала сохраните обмерный план в этом проекте');
  if(state.drafts[mode])state.history.push(...(state.sheets?.[mode]||[state.drafts[mode]!]).map(d=>structuredClone(d)));
  state.drafts[mode]=structuredClone(base);
  state.sheets![mode]=copies(base);state.activeSheets![mode]=0;
 }
 const target=state.sheets![mode]![state.activeSheets![mode]||0];state.drafts[mode]=structuredClone(target);state.active=mode;
 return{...next,manualWorkspace:state,source:structuredClone(target.source),activeVariantId:'manual',selected:null,
  variants:{...next.variants,manual:{...old,plan:structuredClone(target.plan),revision:old.revision+1,origin:'manual',concept:'Самостоятельное планирование',updatedAt:new Date().toISOString()}}};
}
export function restoreManualDraft(album:PlanningAlbum,index:unknown):PlanningAlbum{
 if(!Number.isSafeInteger(index)||Number(index)<0||!album.manualWorkspace?.history[Number(index)])throw Error('Черновик не найден');
 const next=withManualSheets(album),state=next.manualWorkspace!,old=next.variants.manual!,target=state.history.splice(Number(index),1)[0];
 state.drafts[state.active]={version:1,source:structuredClone(next.source),plan:structuredClone(old.plan)};
 state.history.push(structuredClone(state.drafts[state.active]!));
 const mode:PlanningSourceMode=target.plan.source.hash.startsWith('dxf-')?'archicad':target.source.kind==='manual'?'manual':'measured';state.active=mode;state.drafts[mode]=target;
 if(!state.sheets![mode])state.sheets![mode]=copies(target);state.sheets![mode]![state.activeSheets![mode]||0]=structuredClone(target);
 return{...next,source:target.source,manualWorkspace:state,activeVariantId:'manual',selected:null,variants:{...next.variants,manual:{...old,plan:target.plan,revision:old.revision+1,origin:'manual',updatedAt:new Date().toISOString()}}};
}

/** User-confirmed CAD import lives in its own draft; prior modes and imports survive. */
export function importManualDxf(album:PlanningAlbum,plan:PlanningDoc['plan']):PlanningAlbum{
 const next=withManualSheets(album),old=next.variants.manual;if(!old)throw Error('Рабочая планировка не найдена');
 const state:ManualWorkspace=next.manualWorkspace||{active:manualSourceMode(next),drafts:{},history:[]};
 state.drafts[state.active]={version:1,source:structuredClone(next.source),plan:structuredClone(old.plan)};
 if(state.drafts.archicad)state.history.push(...(state.sheets?.archicad||[state.drafts.archicad]).map(d=>structuredClone(d)));
 const target:PlanningDoc={version:1,source:{kind:'manual',revision:null},plan:structuredClone(plan)};state.drafts.archicad=target;state.active='archicad';
 state.sheets!.archicad=copies(target);state.activeSheets!.archicad=0;
 return{...next,manualWorkspace:state,source:target.source,activeVariantId:'manual',selected:null,variants:{...next.variants,manual:{...old,plan:target.plan,revision:old.revision+1,origin:'manual',concept:'Импорт DXF из ArchiCAD',updatedAt:new Date().toISOString()}}};
}
