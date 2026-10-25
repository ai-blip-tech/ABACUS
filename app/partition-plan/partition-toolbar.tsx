'use client';
import {MeasureToolsMenu} from '../measured-plan/editor/measure-tools-menu';
import {PlanRulerIcon,PlanDimensionIcon,PlanDoorIcon,PlanWindowIcon,PlanPartitionIcon} from '../plan-tool-icons';
import {partitionToolEnabled} from '@/lib/partition-plan/tool-availability';
type Props={tool:string;mode:'demolition'|'installation';hasDoc:boolean;baseLocked:boolean;busy:boolean;showDimensions:boolean;hasDraft:boolean;canUndo:boolean;canRedo:boolean;zoom:number;onTool:(tool:string)=>void;onDimensions:()=>void;onCancelDraft:()=>void;onUndo:()=>void;onRedo:()=>void;onZoom:(zoom:number)=>void;onResetZoom:()=>void};
export function PartitionToolbar(p:Props){
 const enabled=(tool:string)=>partitionToolEnabled(tool,p.mode,p.hasDoc,p.baseLocked,p.busy);
 const activeLabel=p.tool==='wall'?'Стена':'';
 return <nav className="partition-tools" aria-label="Инструменты плана">
  <MeasureToolsMenu activeLabel={activeLabel}>
   <button aria-pressed={p.tool==='select'} className={p.tool==='select'?'active':''} disabled={!enabled('select')} onClick={()=>p.onTool('select')}>↖ Выбор / сдвиг</button>
   <button disabled title="Масштаб задаётся на этапе «Обмерный план»">↔ Масштаб</button>
   <button aria-pressed={p.tool==='wall'} className={p.tool==='wall'?'active':''} disabled={!enabled('wall')} title={enabled('wall')?'Построить стену':'На плане демонтажа исходная основа защищена'} onClick={()=>p.onTool('wall')}>＋ Стена</button>
   <button disabled title="Контур пола редактируется на этапе «Обмерный план»">⌑ Контур пола</button>
   <button disabled title="Зоны высот редактируются на этапе «Обмерный план»">▱ Зона высот</button>
   {p.hasDraft&&<button onClick={p.onCancelDraft}>Отменить разметку</button>}
   <button aria-pressed={p.showDimensions} disabled={!p.hasDoc||p.busy} onClick={p.onDimensions}>{p.showDimensions?'Скрыть размеры':'Показать размеры'}</button>
  </MeasureToolsMenu>
  <button className="partition-tool-icon" aria-label="Отменить действие" title="Отменить · ⌘Z / Ctrl+Z" disabled={!p.canUndo||p.busy} onClick={p.onUndo}>↶</button>
  <button className="partition-tool-icon" aria-label="Повторить действие" title="Повторить · ⌘⇧Z / Ctrl+Y" disabled={!p.canRedo||p.busy} onClick={p.onRedo}>↷</button>
  <button className="partition-tool-icon" aria-label="Линейка" title="Линейка — измерить расстояние" aria-pressed={p.tool==='ruler'} disabled={!enabled('ruler')} onClick={()=>p.onTool(p.tool==='ruler'?'select':'ruler')}><PlanRulerIcon/></button>
  <button className="partition-tool-icon" aria-label="Дополнительный размер" title="Дополнительный размер — сохранить на плане и в печати" aria-pressed={p.tool==='dimension'} disabled={!enabled('dimension')} onClick={()=>p.onTool(p.tool==='dimension'?'select':'dimension')}><PlanDimensionIcon/></button>
  <button className="partition-tool-icon" aria-label="Добавить дверь" title="Добавить дверь или дверной проём — выберите перегородку либо готовый проём" aria-pressed={p.tool==='opening'} disabled={!enabled('opening')} onClick={()=>p.onTool(p.tool==='opening'?'select':'opening')}><PlanDoorIcon/></button>
  <button className="partition-tool-icon" aria-label="Добавить окно" title="Добавить окно или оконный проём — выберите перегородку либо готовый проём" aria-pressed={p.tool==='window'} disabled={!enabled('window')} onClick={()=>p.onTool(p.tool==='window'?'select':'window')}><PlanWindowIcon/></button>
  <button className="partition-tool-icon" aria-label="Возвести перегородку" title="Возвести перегородку — укажите два конца" aria-pressed={p.tool==='wall'} disabled={!enabled('wall')} onClick={()=>p.onTool(p.tool==='wall'?'select':'wall')}><PlanPartitionIcon/></button>
  <div className="partition-zoom" aria-label="Масштаб плана"><button aria-label="Уменьшить план" disabled={p.zoom<=.5} onClick={()=>p.onZoom(Math.max(.5,p.zoom-.25))}>−</button><button aria-label="Сбросить масштаб до 100 процентов" title="Сбросить масштаб и положение" onClick={p.onResetZoom}>{Math.round(p.zoom*100)}%</button><button aria-label="Увеличить план" disabled={p.zoom>=5} onClick={()=>p.onZoom(Math.min(5,p.zoom+.25))}>+</button></div>
 </nav>;
}
