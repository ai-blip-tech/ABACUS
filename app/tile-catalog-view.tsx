'use client';
import {useEffect,useId,useRef,useState,type CSSProperties} from 'react';
import type {CatalogProduct,Filters} from './furniture-catalog-page';
import './tile-catalog.css';

type Facet='color'|'format'|'design'|'brand'|'price';
type Props={designs:string[];products:CatalogProduct[];brands:{id:string;name:string;count:number}[];colors:string[];formats:string[];
 filters:Filters;search:string;onSearch:(v:string)=>void;update:(v:Partial<Filters>)=>void;reset:()=>void;
 total:number;loading:boolean;error:string;notice:string;retry:()=>void;more:()=>void;onClose:()=>void;
 onSelect:(product:CatalogProduct,category:string)=>void;selectedIds:string[];requiredFormat:string};
const money=(value:number)=>new Intl.NumberFormat('ru-RU').format(value);
const format=(value:string)=>value.replace('x',' × ')+' мм';
const groups={color:'Цвет',format:'Формат',design:'Дизайн',brand:'Бренд',price:'Цена'};
const swatch=(name:string)=>{const values:[RegExp,string][]=[[/бел|white/i,'#eeeae0'],[/сер|grey|gray/i,'#999b98'],[/чер|black/i,'#393632'],[/беж|beige|cream/i,'#d3c3ab'],[/корич|brown/i,'#8a6650'],[/зелен|зелён|green/i,'#75816a'],[/син|blue/i,'#69818e'],[/роз|pink/i,'#cda7a2'],[/золот|gold/i,'#c5a56b']];return values.find(([rx])=>rx.test(name))?.[1]||'#bdb5a8';};

export default function TileCatalogView(p:Props){
 const [open,setOpen]=useState<Facet|null>(null),[price,setPrice]=useState([p.filters.priceMin,p.filters.priceMax]),[width,setWidth]=useState([p.filters.widthMin,p.filters.widthMax]);
 const [priceError,setPriceError]=useState(''),[widthError,setWidthError]=useState(''),[choosing,setChoosing]=useState(''),[choiceError,setChoiceError]=useState('');
 const root=useRef<HTMLElement>(null),buttons=useRef<Partial<Record<Facet,HTMLButtonElement|null>>>({}),id=useId();
 useEffect(()=>{setPrice([p.filters.priceMin,p.filters.priceMax]);setPriceError('');},[p.filters.priceMin,p.filters.priceMax]);
 useEffect(()=>{setWidth([p.filters.widthMin,p.filters.widthMax]);setWidthError('');},[p.filters.widthMin,p.filters.widthMax]);
 useEffect(()=>{root.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();},[]);
 useEffect(()=>{
  const outside=(e:PointerEvent)=>{if(open&&e.target instanceof Element&&!e.target.closest('[data-tile-facet="'+open+'"]'))setOpen(null);};
  const key=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;e.preventDefault();e.stopImmediatePropagation();if(open){buttons.current[open]?.focus();setOpen(null);}else p.onClose();};
  document.addEventListener('pointerdown',outside,true);window.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('keydown',key,true);};
 },[open,p.onClose]);
 const toggle=(key:'colors'|'formats'|'brands'|'designs',value:string)=>p.update({[key]:p.filters[key].includes(value)?p.filters[key].filter(v=>v!==value):[...p.filters[key],value]});
 const range=(kind:'price'|'width',index:number,value:string)=>{
  const next=[...(kind==='price'?price:width)];next[index]=value;
  (kind==='price'?setPrice:setWidth)(next);
  const invalid=next.some(v=>v!==''&&(!Number.isFinite(Number(v))||Number(v)<0))||next.every(v=>v!=='')&&Number(next[0])>Number(next[1]);
  (kind==='price'?setPriceError:setWidthError)(invalid?'Минимум не должен превышать максимум.':'');
  if(!invalid)p.update(kind==='price'?{priceMin:next[0],priceMax:next[1]}:{widthMin:next[0],widthMax:next[1]});
 };
 const active=Boolean(p.search||p.filters.available||p.filters.designs.length||p.filters.colors.length||p.filters.formats.length||p.filters.brands.length||p.filters.priceMin||p.filters.priceMax||p.filters.widthMin||p.filters.widthMax||priceError||widthError);
 const reset=()=>{setPrice(['','']);setWidth(['','']);setPriceError('');setWidthError('');p.reset();};
 const label=(key:Facet)=>{
  if(key==='price'){const [min,max]=[p.filters.priceMin,p.filters.priceMax];return min&&max?`${money(Number(min))}–${money(Number(max))} ₽/м²`:min?`От ${money(Number(min))} ₽/м²`:max?`До ${money(Number(max))} ₽/м²`:'Цена';}
  const values=key==='design'?p.filters.designs:key==='color'?p.filters.colors:key==='brand'?p.filters.brands:p.requiredFormat?[p.requiredFormat]:p.filters.formats;
  return values.length>1?groups[key]+' · '+values.length:values.length?key==='format'?format(values[0]):key==='brand'?p.brands.find(b=>b.id===values[0])?.name||values[0]:values[0]:groups[key];
 };
 const choose=async(product:CatalogProduct)=>{if(choosing)return;setChoosing(product.id);setChoiceError('');try{await p.onSelect(product,'porcelain');}catch(e){setChoiceError((e as Error).message);}finally{setChoosing('');}};
 return <section className="rd-tile-catalog" ref={root} aria-label="Каталог плитки и керамогранита">
  <header className="rd-tile-catalog-header"><div><h1>Плитка и керамогранит</h1></div><button type="button" className="rd-tile-close" aria-label="Закрыть каталог" onClick={p.onClose}>×</button></header>
  <div className="rd-tile-catalog-content">
   <div className="rd-tile-catalog-tools">
    <label className="rd-tile-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg><input type="search" placeholder="Название, бренд или артикул" aria-label="Название, бренд или артикул" value={p.search} onChange={e=>p.onSearch(e.target.value)}/></label>
    <label className="rd-tile-stock"><input type="checkbox" role="switch" checked={p.filters.available} onChange={e=>p.update({available:e.target.checked})}/><span aria-hidden="true"/>Только в наличии</label>
    <select aria-label="Сортировка" value={p.filters.sort} onChange={e=>p.update({sort:e.target.value})}><option value="price_asc">Сначала дешевле</option><option value="price_desc">Сначала дороже</option><option value="discount_desc">По величине скидки</option><option value="">Без сортировки</option></select>
   </div>
   <div className="rd-tile-filterbar" aria-label="Фильтры плитки">
    {(Object.keys(groups) as Facet[]).map(key=><div key={key} className="rd-tile-facet" data-tile-facet={key}>
     <button ref={node=>{buttons.current[key]=node;}} type="button" className="rd-tile-facet-button" data-active={label(key)!==groups[key]||key==='format'&&Boolean(p.filters.widthMin||p.filters.widthMax)} aria-expanded={open===key} aria-controls={id+'-'+key} aria-label={groups[key]+': '+label(key)} title={groups[key]+': '+label(key)} onClick={()=>setOpen(current=>current===key?null:key)}><span>{label(key)}</span><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m3 6 5 5 5-5"/></svg></button>
     {open===key&&<div className="rd-tile-options" id={id+'-'+key} role="group" aria-label={'Фильтр: '+groups[key]}>
      {key==='color'&&<div className="rd-tile-color-options">{p.colors.map(value=><label key={value}><input type="checkbox" checked={p.filters.colors.includes(value)} onChange={()=>toggle('colors',value)}/><i style={{background:swatch(value)}} aria-hidden="true"/><span>{value}</span></label>)}{!p.colors.length&&<p>Поставщик не указал цвета.</p>}</div>}
      {key==='format'&&<><div className="rd-tile-format-options">{[...new Set([...(p.requiredFormat?[p.requiredFormat]:[]),...p.formats])].map(value=><label key={value}><input type="checkbox" disabled={!!p.requiredFormat} checked={p.requiredFormat?value===p.requiredFormat:p.filters.formats.includes(value)} onChange={()=>toggle('formats',value)}/>{format(value)}</label>)}</div><fieldset><legend>Ширина, мм</legend><div className="rd-tile-range">{['От','До'].map((value,index)=><input key={value} type="number" min="0" placeholder={value} aria-label={value==='От'?'Минимальная ширина, мм':'Максимальная ширина, мм'} value={width[index]} onChange={e=>range('width',index,e.target.value)}/>)}</div>{widthError&&<p role="alert">{widthError}</p>}</fieldset></>}
      {key==='design'&&<div>{p.designs.map(value=><label key={value}><input type="checkbox" checked={p.filters.designs.includes(value)} onChange={()=>toggle('designs',value)}/><span>{value}</span></label>)}{!p.designs.length&&<p>Дизайн не указан поставщиком.</p>}</div>}
      {key==='brand'&&p.brands.map(b=><label key={b.id}><input type="checkbox" checked={p.filters.brands.includes(b.id)} onChange={()=>toggle('brands',b.id)}/><span>{b.name}</span></label>)}
      {key==='price'&&<fieldset><legend>Цена, ₽/м²</legend><div className="rd-tile-range">{['От','До'].map((value,index)=><input key={value} type="number" min="0" step="any" placeholder={value} aria-label={value==='От'?'Минимальная цена, ₽/м²':'Максимальная цена, ₽/м²'} value={price[index]} onChange={e=>range('price',index,e.target.value)}/>)}</div>{priceError&&<p role="alert">{priceError}</p>}</fieldset>}
     </div>}
    </div>)}
   </div>
   <div className="rd-tile-summary"><span role="status" aria-live="polite">{p.loading&&p.filters.page===1?'Загружаем материалы…':`${money(p.total)} материалов`}</span>{active&&<button type="button" onClick={reset}>Сбросить фильтры</button>}</div>
   {p.notice&&<p className="rd-tile-notice" role="status">{p.notice}</p>}{choiceError&&<p role="alert" className="rd-tile-notice">{choiceError}</p>}
   {p.error&&p.filters.page===1?<div className="rd-tile-empty" role="alert"><h2>Каталог не загрузился</h2><p>{p.error}</p><button type="button" onClick={p.retry}>Повторить</button></div>:<div className="rd-tile-cards" aria-busy={p.loading}>
    {p.loading&&p.filters.page===1?Array.from({length:8},(_,i)=><div className="rd-tile-skeleton" key={i}/>):p.products.map(product=><article className="rd-tile-card" key={product.id}>
     <div className="rd-tile-card-image"><div className="rd-tile-sample" style={{'--tile-ratio':(product.widthMm||1)/(product.depthMm||1)} as CSSProperties}>{product.image?<img src={product.image} alt={product.name} loading="lazy"/>:<span>Нет изображения</span>}</div></div>
     <div className="rd-tile-card-info"><small className="rd-tile-brand">{product.brand}</small><h2 title={product.name}>{product.name}</h2><p>{product.widthMm&&product.depthMm?`${product.widthMm} × ${product.depthMm} мм`:'Формат не указан'}{product.heightMm?` · Толщина ${product.heightMm} мм`:''}</p><p className="rd-tile-article">Арт. {product.article||'не указан'}</p>
      <div className="rd-tile-card-price"><strong>{product.price>0?<>{money(product.price)} <small>₽/м²</small></>:'Цена по запросу'}</strong><span>{product.available?'В наличии':'Под заказ'}</span></div>
      <button className="room-catalog-choose rd-tile-choose" type="button" disabled={!!choosing} onClick={()=>void choose(product)}>{choosing===product.id?'Выбираем…':p.selectedIds.includes(product.id)?'✓ Выбрано':'Выбрать'}</button>
     </div>
    </article>)}
   </div>}
   {!p.loading&&!p.error&&!p.products.length&&<div className="rd-tile-empty"><h2>Плитка с такими параметрами не найдена</h2><button type="button" onClick={reset}>Сбросить фильтры</button></div>}
   {p.products.length<p.total&&!(p.error&&p.filters.page===1)&&<button type="button" className="rd-tile-more" disabled={p.loading} onClick={p.more}>{p.loading?'Загружаем…':'Показать ещё'}</button>}
   {p.error&&p.filters.page>1&&<p role="alert">{p.error} <button type="button" onClick={p.retry}>Повторить</button></p>}
  </div>
 </section>;
}
