import type {MeasureDoc} from '../measured-plan/measure-model';
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function refreshDecoratedPlan(current:MeasureDoc,baseline:MeasureDoc,latest:MeasureDoc):MeasureDoc{
 const next=structuredClone(latest);if(current.id!==latest.id)return next;
 next.walls=next.walls.map(w=>{const local=current.walls.find(v=>v.id===w.id),old=baseline.walls.find(v=>v.id===w.id);if(!local||equal(local.plannerFinish,old?.plannerFinish))return w;
  if(!equal(w.plannerFinish,old?.plannerFinish)&&!equal(w.plannerFinish,local.plannerFinish))throw Error('Отделка этой стены изменена в другой вкладке. Текущие правки сохранены в редакторе; обновление остановлено.');
  return {...w,plannerFinish:structuredClone(local.plannerFinish)};
 });
 if(!equal(current.furniture,baseline.furniture)){if(!equal(latest.furniture,baseline.furniture)&&!equal(latest.furniture,current.furniture))throw Error('Мебель изменена в другой вкладке. Сначала сохраните текущие правки.');next.furniture=structuredClone(current.furniture);}
 return next;
}
