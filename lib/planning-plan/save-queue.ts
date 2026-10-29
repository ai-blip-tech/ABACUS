/** Serialises writes to the existing optimistic-revision endpoint, including tab switches. */
export class PlanningSaveQueue<T>{
 private tail:Promise<unknown>=Promise.resolve();
 private conflict=false;
 constructor(private revision:number,private transport:(body:Record<string,unknown>)=>Promise<{ok:boolean;status:number;document:T;revision:number;error?:string}>){ }
 /** Explicit replacement import only: caller flushes dirty edits first. The server
  * archives its current draft. Ordinary saves never retry on a newer revision. */
 importLatest(payload:Record<string,unknown>,loadRevision:()=>Promise<number>,isDirty:()=>boolean):Promise<{document:T;revision:number}>{
  const snapshot=structuredClone(payload);
  const task=this.tail.catch(()=>{}).then(async()=>{if(isDirty())throw Error('В этой вкладке есть несохранённые изменения. Сначала сохраните их; импорт не выполнен.');const revision=await loadRevision();if(!Number.isSafeInteger(revision)||revision<0)throw Error('Не удалось получить актуальную версию проекта.');if(isDirty())throw Error('План изменился во время подготовки импорта. Повторите после сохранения.');const result=await this.transport({...snapshot,action:'workspace-import-dxf',revision});if(result.status===409)this.conflict=true;if(!result.ok)throw Error(result.error||'Не удалось импортировать. Текущая планировка не заменена.');this.revision=result.revision;this.conflict=false;return{document:result.document,revision:result.revision};});this.tail=task;return task;
 }
 request(action:string,payload:Record<string,unknown>={}):Promise<{document:T;revision:number}>{
  const snapshot=structuredClone(payload);
  const task=this.tail.catch(()=>{}).then(async()=>{if(this.conflict)throw Error('Проект изменён в другой вкладке. Обновите страницу; локальные правки не перезаписаны.');const result=await this.transport({...snapshot,action,revision:this.revision});if(result.status===409)this.conflict=true;if(!result.ok)throw Error(result.error||'Не удалось сохранить. Изменения остаются в редакторе.');this.revision=result.revision;return{document:result.document,revision:result.revision};});this.tail=task;return task;
 }
}
