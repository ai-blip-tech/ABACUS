import {asWorkbook,type MaterialWorkbook} from './workbook.ts';
export type WorkbookDraft={kind:'workbook-draft';workbook:MaterialWorkbook;revision:number;dirty:boolean};
export function asWorkbookDraft(value:unknown):WorkbookDraft|null{
 if(value&&typeof value==='object'&&'kind' in value&&value.kind==='workbook-draft'){
  const draft=value as WorkbookDraft,workbook=asWorkbook(draft.workbook);
  return workbook&&Number.isInteger(draft.revision)&&draft.revision>=0&&typeof draft.dirty==='boolean'?{...draft,workbook}:null;
 }
 const workbook=asWorkbook(value);return workbook?{kind:'workbook-draft',workbook,revision:0,dirty:true}:null;
}
// Keep an unsaved local draft and its base revision: a changed remote version must
// cause a save conflict instead of silently discarding or overwriting either copy.
export function resolveWorkbookDraft(local:WorkbookDraft|null,remote:MaterialWorkbook|null,revision:number):WorkbookDraft|null{
 if(local?.dirty)return local;
 if(!remote)return local;
 const active=local?.workbook.activeSheetId;
 return{kind:'workbook-draft',workbook:active&&remote.sheets.some(s=>s.id===active)?{...remote,activeSheetId:active}:remote,revision,dirty:false};
}
