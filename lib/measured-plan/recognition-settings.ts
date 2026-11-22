import 'server-only';
import {measureAIPrompt,measureAISchema} from './measure-ai.ts';
export const recognitionProfile='analysis-20261122-v3';
export const recognitionSettings=Object.freeze({model:process.env.ROOM_DESIGN_MEASURE_AI_MODEL?.trim()||'',service_tier:process.env.ROOM_DESIGN_MEASURE_AI_SERVICE_TIER?.trim()||'',reasoning:Object.freeze({effort:'medium'})});
export function recognitionRequest(image:string){if(!recognitionSettings.model||!recognitionSettings.service_tier)throw Error('Настройки анализа файла не заданы.');return{...recognitionSettings,background:true,max_output_tokens:16000,input:[{role:'user',content:[{type:'input_text',text:measureAIPrompt},{type:'input_image',image_url:image,detail:'high'}]}],text:{format:{type:'json_schema',name:'measured_floor_plan',strict:true,schema:measureAISchema}}};}
export function isCurrentRecognitionSnapshot(value:unknown){const s=value as {profile?:string;model?:string;serviceTier?:string;reasoningEffort?:string}|null;return !!s&&s.profile===recognitionProfile&&s.model===recognitionSettings.model&&s.serviceTier===recognitionSettings.service_tier&&s.reasoningEffort===recognitionSettings.reasoning.effort;}
export const recognitionSnapshotSettings=()=>({profile:recognitionProfile,model:recognitionSettings.model,serviceTier:recognitionSettings.service_tier,reasoningEffort:recognitionSettings.reasoning.effort});
