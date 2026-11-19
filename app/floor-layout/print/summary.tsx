import type {floorMaterialSpecification} from '@/lib/floor-2/print-spec';

type Report=ReturnType<typeof floorMaterialSpecification>;
const num=(v:number)=>v.toLocaleString('ru-RU',{maximumFractionDigits:2});
const money=(v:number)=>num(v)+' ₽';

export function FloorSummary({report,part,pageSize}:{report:Report;part:number;pageSize:number}){
 const totalPages=Math.max(1,Math.ceil(report.materials.length/pageSize)),last=part===totalPages-1,rows=report.materials.slice(part*pageSize,(part+1)*pageSize);
 return <>
  <div className="floor-page-heading"><div><small>ВСЕ ПОКРЫТИЯ ПРОЕКТА{totalPages>1?` · ${part+1} / ${totalPages}`:''}</small><h1>Сводная спецификация и смета</h1><p>Керамогранит, плитка и паркет · закупка с учётом подрезки</p></div><span>{num(report.materials.reduce((n,m)=>n+m.area,0))} м²<small>общая площадь покрытий</small></span></div>
  <table className="floor-summary-table"><colgroup><col style={{width:'3%'}}/><col style={{width:'25%'}}/><col style={{width:'10%'}}/><col style={{width:'8%'}}/><col style={{width:'6%'}}/><col style={{width:'10%'}}/><col style={{width:'11%'}}/><col style={{width:'8%'}}/><col style={{width:'9%'}}/></colgroup><thead><tr><th>№</th><th>Материал / артикул</th><th>Помещения / участки</th><th>Формат, мм</th><th>Площадь, м²</th><th>Без / с подрезкой, шт.</th><th>Закупка</th><th>Цена</th><th>Стоимость</th></tr></thead><tbody>
   {rows.map((m,i)=><tr key={m.id}><td>{part*pageSize+i+1}</td><td><div className="floor-summary-material">{m.product.image&&<img src={m.product.image} alt={m.product.name}/>}<div><strong>{m.product.name}</strong><small>{m.product.brand}</small><small>Арт. {m.product.article||m.product.id}</small></div></div></td><td>{[...new Set(m.areas.map(r=>r.name))].join('; ')}</td><td>{m.product.repeat?<>Повтор текстуры<br/>{m.product.widthMm} × {m.product.heightMm}<small>Формат доски не задан</small></>:<>{m.product.widthMm} × {m.product.heightMm}</>}</td><td>{num(m.area)}</td><td>{m.quantity?<>{m.quantity.whole} / {m.quantity.cut}<small>Всего {m.quantity.count} шт.</small></>:'Не рассчитано'}</td><td>{m.quantity?<>{m.quantity.purchaseCount} шт.<small>{num(m.quantity.stockArea)} м²</small><small>Подрезка: {num(m.quantity.wasteArea)} м²</small></>:'Нужны размеры доски и упаковки'}</td><td>{m.product.price!=null?<>{money(m.product.price)}<small>за {m.product.priceUnit||'ед. не указана'}</small></>:'Стоимость не задана'}</td><td>{m.quantity?.cost!=null?<strong>{money(m.quantity.cost)}</strong>:'Стоимость не задана'}</td></tr>)}
  </tbody></table>
  {!rows.length&&<p className="floor-note">В проекте пока нет назначенных покрытий.</p>}
  {last&&<div className="floor-summary-totals"><div><span>Общая стоимость покрытий пола</span><strong>{money(report.knownCost)}</strong></div>{report.missingCosts>0&&<p>Для {report.missingCosts} позиций стоимость не задана. В итог включены только материалы с рассчитанной стоимостью; неизвестные цены приняты за 0 ₽.</p>}<p>Закупка рассчитана целыми изделиями, включая подрезанные. Доставка, работы, клей, затирка и дополнительный запас не включены.</p></div>}
 </>;
}
