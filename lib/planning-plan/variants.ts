import {type MeasureDoc} from '../measured-plan/measure-model.ts';
import {validateFurniture} from './furniture.ts';
import type {PlanningDoc} from './model.ts';
import type {ManualWorkspace} from './manual-workspace.ts';

export const variantIds=['manual','ai-1','ai-2','ai-3'] as const;
export type VariantId=typeof variantIds[number];
export const variantLabels:Record<VariantId,string>={manual:'Моя планировка','ai-1':'Вариант 1','ai-2':'Вариант 2','ai-3':'Вариант 3'};
export const plannerContract={requiredSkill:'interior-space-planner',generatorStatus:'not-connected',output:'editable-measure-doc',concepts:['functional','comfortable','alternative']} as const;
// Preserve opaque historical metadata without importing experimental AI modules.
export type PlanningVariant={report?:unknown;generation?:unknown;id:VariantId;plan:MeasureDoc;revision:number;origin:'manual'|'demo'|'ai';concept:string;updatedAt:string};
export type PlanningAlbum={manualWorkspace?:ManualWorkspace;variantHistory?:PlanningVariant[];brief?:unknown;version:2;source:PlanningDoc['source'];baseline:MeasureDoc;activeVariantId:VariantId;variants:Record<VariantId,PlanningVariant|null>;selected:{variantId:VariantId;revision:number;selectedAt:string}|null;planner:Omit<typeof plannerContract,'generatorStatus'>&{generatorStatus:'not-connected'|'connected'}};
export function isVariantId(v:unknown):v is VariantId{return typeof v==='string'&&variantIds.includes(v as VariantId);}
const content=(d:MeasureDoc)=>JSON.stringify({...d,updatedAt:''});
export function createAlbum(doc:PlanningDoc,baseline:MeasureDoc=doc.plan):PlanningAlbum{const base=structuredClone(baseline),plan=structuredClone(doc.plan);return{version:2,source:structuredClone(doc.source),baseline:base,activeVariantId:'manual',variants:{manual:{id:'manual',plan,revision:1,origin:'manual',concept:'Самостоятельное планирование',updatedAt:new Date().toISOString()},'ai-1':null,'ai-2':null,'ai-3':null},selected:null,planner:plannerContract};}
export function readAlbum(value:PlanningAlbum|PlanningDoc,baseline?:MeasureDoc):PlanningAlbum{if(value.version===2)return structuredClone(value);if(value.version===1)return createAlbum(value,baseline);throw Error('Неподдерживаемая версия планировки');}
export function activeVariant(album:PlanningAlbum){const variant=album.variants[album.activeVariantId];if(!variant)throw Error('Вариант не создан');return variant;}
export function chosenPlan(album:PlanningAlbum){return album.selected?album.variants[album.selected.variantId]!.plan:activeVariant(album).plan;}
export function dependentStagesNeedUpdate(album:PlanningAlbum){return !!album.selected&&album.variants[album.selected.variantId]?.revision!==album.selected.revision;}
export function saveVariant(album:PlanningAlbum,id:unknown,value:unknown,validatePlan:(value:unknown)=>MeasureDoc):PlanningAlbum{if(!isVariantId(id)||!album.variants[id])throw Error('Вариант не создан');const old=album.variants[id]!;if((value as MeasureDoc)?.id!==old.plan.id)throw Error('Документ не принадлежит выбранному варианту');const plan=validatePlan(value);plan.furniture=validateFurniture(plan.furniture||[]);if(content(plan)===content(old.plan))return album;return{...album,variants:{...album.variants,[id]:{...old,plan:structuredClone(plan),revision:old.revision+1,updatedAt:new Date().toISOString()}}};}
export function switchVariant(album:PlanningAlbum,id:unknown):PlanningAlbum{if(!isVariantId(id)||!album.variants[id])throw Error('Сначала создайте варианты');return{...album,activeVariantId:id};}
export function chooseVariant(album:PlanningAlbum,id:unknown):PlanningAlbum{if(!isVariantId(id)||!album.variants[id])throw Error('Вариант не создан');return{...album,selected:{variantId:id,revision:album.variants[id]!.revision,selectedAt:new Date().toISOString()}};}
