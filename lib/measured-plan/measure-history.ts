import type {MeasureDoc} from './measure-model';
import {syncCeilingOpenings} from './measure-editing.ts';
export type HistoryState={present:MeasureDoc|null,past:MeasureDoc[],future:MeasureDoc[],transaction:MeasureDoc|null};
export const initialHistory:HistoryState={present:null,past:[],future:[],transaction:null};
export type HistoryAction={type:'set',value:MeasureDoc|null|((doc:MeasureDoc|null)=>MeasureDoc|null)}|{type:'begin'|'end'|'cancel'|'undo'|'redo'};
const append=(list:MeasureDoc[],doc:MeasureDoc)=>[...list,doc].slice(-40);
export function historyReducer(state:HistoryState,action:HistoryAction):HistoryState{
 if(action.type==='set'){
  const next=syncCeilingOpenings(typeof action.value==='function'?action.value(state.present):action.value);
  if(next===state.present)return state;
  if(!state.present||!next||next.id!==state.present.id)return {...initialHistory,present:next};
  return {...state,present:next,past:state.transaction?state.past:append(state.past,state.present),future:state.transaction?state.future:[]};
 }
 if(action.type==='begin')return {...state,transaction:state.present};
 if(action.type==='cancel')return state.transaction?{...state,present:state.transaction,transaction:null}:state;
 if(action.type==='end')return state.transaction?{...state,past:state.transaction===state.present?state.past:append(state.past,state.transaction),future:state.transaction===state.present?state.future:[],transaction:null}:state;
 if(state.transaction)return state;
 if(action.type==='undo'&&state.past.length&&state.present)return {present:state.past.at(-1)!,past:state.past.slice(0,-1),future:append(state.future,state.present),transaction:null};
 if(action.type==='redo'&&state.future.length&&state.present)return {present:state.future.at(-1)!,future:state.future.slice(0,-1),past:append(state.past,state.present),transaction:null};
 return state;
}
