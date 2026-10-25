"use client";

import { useEffect, useRef, useState } from "react";
import { furnitureCatalogCategories } from "@/lib/furniture-catalog-options";
import { catalogDiscount } from "@/lib/catalog-search";
import "./furniture-catalog-page.css";

type CatalogProduct = { id:string; source?:"norrmobler"|"leve-home"|"gomoon"; brand:string; name:string; article:string; image:string; images:string[]; url:string; price:number; oldPrice:number; available:boolean; category:string; subtype:string; color:string; material:string; widthMm:number|null; depthMm:number|null; heightMm:number|null; description:string; parameters:Array<{name:string;value:string}> };
type Brand = { id:string; name:string; count:number };
const colorFilterEnabled=false;
type Filters = { type:string; brands:string[]; query:string; subtype:string; color:string; recliner:string; sleeper:string; ottoman:string; available:boolean; sort:string; priceMin:string; priceMax:string; widthMin:string; widthMax:string; page:number };
const initialFilters: Filters = {type:"sofa",brands:[],query:"",subtype:"",color:"",recliner:"",sleeper:"",ottoman:"",available:false,sort:"",priceMin:"",priceMax:"",widthMin:"",widthMax:"",page:1};
const brandLogos:Record<string,string> = {"brand:fuga":"/catalog-brands/fuga.png","brand:leve home":"/catalog-brands/leve-home.png","brand:norr møbler":"/catalog-brands/norr-mobler.png","brand:norr carpets":"/catalog-brands/norr-carpets.png","brand:seyvaa paris":"/catalog-brands/seyvaa.svg","brand:mobliberica":"/catalog-brands/mobliberica.webp"};

export default function FurnitureCatalogPage({projectName,roomName,selectedIds,onClose,onSelect}:{projectName:string;roomName:string;selectedIds:string[];onClose:()=>void;onSelect:(product:CatalogProduct)=>void}) {
  const [filters,setFilters]=useState<Filters>(initialFilters);
  const [searchInput,setSearchInput]=useState("");
  const [products,setProducts]=useState<CatalogProduct[]>([]);
  const [brands,setBrands]=useState<Brand[]>([]);
  const [categorySubtypes,setCategorySubtypes]=useState<Record<string,string[]>>({});
  const [categoryColors,setCategoryColors]=useState<Record<string,string[]>>({});
  const [categoryCounts,setCategoryCounts]=useState<Record<string,number>>({});
  const [expandedCategory,setExpandedCategory]=useState<string|null>(null);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [unavailableSources,setUnavailableSources]=useState<string[]>([]);
  const [retry,setRetry]=useState(0);
  const [detail,setDetail]=useState<CatalogProduct|null>(null);
  const firstControl=useRef<HTMLButtonElement>(null);
  const update=(patch:Partial<Filters>)=>setFilters(current=>({...current,...(patch.type&&patch.type!==current.type?{color:"",recliner:"",sleeper:"",ottoman:""}:{}),...patch,page:1}));

  useEffect(()=>{firstControl.current?.focus();},[]);
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key!=="Escape")return;if(detail)setDetail(null);else onClose();};window.addEventListener("keydown",escape);return()=>window.removeEventListener("keydown",escape);},[detail,onClose]);
  useEffect(()=>{const timer=window.setTimeout(()=>setFilters(current=>current.query===searchInput.trim()?current:{...current,query:searchInput.trim(),page:1}),300);return()=>window.clearTimeout(timer);},[searchInput]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError("");
    const params=new URLSearchParams({type:filters.type,page:String(filters.page),limit:"24"});
    if(filters.brands.length)params.set("brands",filters.brands.join(","));
    if(filters.available)params.set("available","1");
    for(const [key,value] of Object.entries({q:filters.query,subtype:filters.subtype,color:colorFilterEnabled?filters.color:"",recliner:filters.recliner,sleeper:filters.sleeper,ottoman:filters.ottoman,sort:filters.sort,minPrice:filters.priceMin,maxPrice:filters.priceMax,widthMinMm:filters.widthMin,widthMaxMm:filters.widthMax}))if(value)params.set(key,value);
    fetch(`/api/catalog?${params}`,{signal:controller.signal}).then(async response=>{
      const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Каталог временно недоступен.");if(controller.signal.aborted)return;
      const next=Array.isArray(payload.products)?payload.products:[];
      setProducts(items=>filters.page===1?next:[...items,...next.filter((product:CatalogProduct)=>!items.some(item=>item.id===product.id))]);
      setTotal(Number(payload.total)||0);
      setBrands(Array.isArray(payload.productBrands)?payload.productBrands:[]);
      setCategorySubtypes(payload.categorySubtypes||{});
      setCategoryColors(payload.categoryColors||{});
      setCategoryCounts(payload.categoryCounts||{});
      setUnavailableSources(Array.isArray(payload.unavailableSources)?payload.unavailableSources:[]);
    }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message||"Не удалось загрузить каталог.");}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[filters,retry]);

  const toggleBrand=(id:string)=>{const selected=filters.brands.includes(id);update({brands:selected?filters.brands.filter(item=>item!==id):[...filters.brands,id],...(!selected&&id==="brand:gomoon"?{type:"technical_light",subtype:""}:{})});};
  const reset=()=>{setFilters(initialFilters);setSearchInput("");};
  const filterCount=filters.brands.length+Number(Boolean(filters.query))+Number(Boolean(filters.subtype))+Number(Boolean(filters.color))+Number(Boolean(filters.recliner))+Number(Boolean(filters.sleeper))+Number(Boolean(filters.ottoman))+Number(filters.available)+Number(Boolean(filters.sort))+Number(Boolean(filters.priceMin||filters.priceMax))+Number(Boolean(filters.widthMin||filters.widthMax));
  const selectedCategory=furnitureCatalogCategories.find(item=>item.type===filters.type);

  return <section className="room-catalog-page" role="dialog" aria-modal="true" aria-labelledby="room-catalog-title">
    <header className="room-catalog-header"><button className="room-catalog-selection-count" ref={firstControl} type="button" onClick={onClose} title="Вернуться в проект">Выбрано товаров — <span aria-live="polite" aria-atomic="true">{new Set(selectedIds).size}</span></button><div><span>{projectName} · {roomName}</span><h1 id="room-catalog-title">Каталог брендов партнеров</h1></div><button className="room-catalog-close" type="button" onClick={onClose} aria-label="Закрыть каталог">×</button></header>
    <section className="room-catalog-brands" aria-label="Выбор бренда">
      <button type="button" className={!filters.brands.length?"active":""} aria-pressed={!filters.brands.length} onClick={()=>update({brands:[]})}><i>RD</i><span><b>Все бренды</b><small>Вся мебель</small></span></button>
      {brands.map(brand=><button key={brand.id} type="button" className={filters.brands.includes(brand.id)?"active":""} disabled={brand.count===0&&!filters.brands.includes(brand.id)} aria-pressed={filters.brands.includes(brand.id)} onClick={()=>toggleBrand(brand.id)}>{brandLogos[brand.id]?<img className="room-catalog-brand-logo" src={brandLogos[brand.id]} alt="" aria-hidden="true"/>:<i aria-hidden="true">{brand.name.split(/\s+/).map(word=>word[0]).join("").slice(0,2)}</i>}<span><b>{brand.name}</b><small>{brand.count.toLocaleString("ru-RU")} товаров</small></span></button>)}
    </section>
    {unavailableSources.length>0&&<p className="room-catalog-warning" role="status">Некоторые бренды временно недоступны. Показываем товары доступных партнёров.</p>}
    <div className="room-catalog-layout">
      <aside className="room-catalog-filters" aria-label="Фильтры каталога">
        <div className="room-catalog-filter-head"><span>ФИЛЬТРЫ</span>{filterCount>0&&<button type="button" onClick={reset}>Сбросить всё</button>}</div>
        <label className="room-catalog-available"><input type="checkbox" role="switch" checked={filters.available} onChange={event=>update({available:event.target.checked})}/><span className="room-catalog-switch-track" aria-hidden="true"/><span>В наличии</span></label>
        <details className="room-catalog-types"><summary>Тип товара <span>{selectedCategory?.name}{filters.subtype?` · ${filters.subtype}`:""}</span></summary>
          <div className="room-catalog-category-list">{furnitureCatalogCategories.filter(item=>filters.brands.length!==1||categoryCounts[item.type]===undefined||categoryCounts[item.type]>0).map(item=>{
            const expanded=expandedCategory===item.type;
            return <div className="room-catalog-category" key={item.type}>
              <button type="button" className={filters.type===item.type?"active":""} aria-expanded={expanded} aria-controls={`catalog-variants-${item.type}`} onClick={()=>{setExpandedCategory(expanded?null:item.type);if(filters.type!==item.type)update({type:item.type,subtype:""});}}>{item.name}<span aria-hidden="true">{expanded?"−":"+"}</span></button>
              {expanded&&<div className="room-catalog-variants" id={`catalog-variants-${item.type}`} role="group" aria-label={`Варианты: ${item.name}`}>
                <button type="button" className={filters.type===item.type&&!filters.subtype?"active":""} aria-pressed={filters.type===item.type&&!filters.subtype} onClick={()=>update({type:item.type,subtype:""})}>Все варианты</button>
                {(categorySubtypes[item.type]||[]).map(value=><button type="button" key={value} className={filters.type===item.type&&filters.subtype===value?"active":""} aria-pressed={filters.type===item.type&&filters.subtype===value} onClick={()=>update({type:item.type,subtype:value})}>{value}</button>)}
              </div>}
            </div>;
          })}</div>
        </details>
        {colorFilterEnabled&&<details className="room-catalog-types room-catalog-colors"><summary>Выбор цвета{filters.color&&<span>{filters.color}</span>}</summary>
          <div className="room-catalog-variants" role="group" aria-label="Варианты цвета">
            <button type="button" className={!filters.color?"active":""} aria-pressed={!filters.color} onClick={()=>update({color:""})}>Все цвета</button>
            {(categoryColors[filters.type]||[]).map(color=><button type="button" key={color} className={filters.color===color?"active":""} aria-pressed={filters.color===color} onClick={()=>update({color:filters.color===color?"":color})}>{color}</button>)}
            {!categoryColors[filters.type]?.length&&<small>Поставщики не указали цвета для этого типа товаров.</small>}
          </div>
        </details>}
        {(filters.type==="sofa"||filters.type==="armchair")&&([{key:"recliner",title:"Реклайнер"},{key:"sleeper",title:"Спальное место"},{key:"ottoman",title:"Оттоманка"}] as const).filter(item=>item.key!=="ottoman"||filters.type==="sofa").map(({key,title})=><details className="room-catalog-types room-catalog-feature" key={key}><summary>{title}{filters[key]&&<span>{filters[key]==="yes"?"Да":"Нет"}</span>}</summary><div className="room-catalog-variants" role="group" aria-label={title}>{[{value:"",label:"Неважно"},{value:"yes",label:"Да"},{value:"no",label:"Нет"}].map(option=><button type="button" key={option.value} className={filters[key]===option.value?"active":""} aria-pressed={filters[key]===option.value} onClick={()=>update({[key]:option.value})}>{option.label}</button>)}</div></details>)}
        <fieldset><legend>Цена, руб.</legend><div className="room-catalog-range"><input inputMode="numeric" value={filters.priceMin} onChange={event=>update({priceMin:event.target.value.replace(/\D/g,"")})} placeholder="от" aria-label="Минимальная цена"/><input inputMode="numeric" value={filters.priceMax} onChange={event=>update({priceMax:event.target.value.replace(/\D/g,"")})} placeholder="до" aria-label="Максимальная цена"/></div></fieldset>
        <fieldset><legend>Ширина, мм</legend><div className="room-catalog-range"><input inputMode="numeric" value={filters.widthMin} onChange={event=>update({widthMin:event.target.value.replace(/\D/g,"")})} placeholder="от" aria-label="Минимальная ширина"/><input inputMode="numeric" value={filters.widthMax} onChange={event=>update({widthMax:event.target.value.replace(/\D/g,"")})} placeholder="до" aria-label="Максимальная ширина"/></div></fieldset>
      </aside>
      <main className="room-catalog-results">
        <div className="room-catalog-toolbar"><form onSubmit={event=>{event.preventDefault();update({query:searchInput.trim()});}}><span>⌕</span><input value={searchInput} onChange={event=>setSearchInput(event.target.value)} placeholder="Название, бренд или артикул" aria-label="Поиск по каталогу"/></form><div><span>{loading&&filters.page===1?"Загружаем…":`${total.toLocaleString("ru-RU")} товаров`}</span><select value={filters.sort} onChange={event=>update({sort:event.target.value})} aria-label="Сортировка"><option value="">Без сортировки</option><option value="price_asc">Сначала дешевле</option><option value="price_desc">Сначала дороже</option><option value="discount_desc">По величине скидки</option></select></div></div>
        {filters.query&&<p className="room-catalog-search-note" role="status">Поиск по всему каталогу. Фильтры слева временно не применяются; сортировка сохраняется.</p>}
        {filterCount>0&&<div className="room-catalog-active-filters"><span>Выбрано фильтров: {filterCount}</span><button type="button" onClick={reset}>Сбросить фильтры</button></div>}
        {error&&filters.page===1?<div className="room-catalog-error"><b>Каталог не загрузился</b><p>{error}</p><button type="button" onClick={()=>setRetry(value=>value+1)}>Повторить</button></div>:<div className="room-catalog-grid">{loading&&filters.page===1?Array.from({length:8},(_,index)=><div className="room-catalog-skeleton" key={index}/>):products.map(product=><article key={product.id} className={selectedIds.includes(product.id)?"room-catalog-card selected":"room-catalog-card"}>
          <button className="room-catalog-card-body" type="button" onClick={()=>setDetail(product)}><span className="room-catalog-card-image">{product.image?<img src={product.image} alt={product.name}/>:<i>Нет фото</i>}<em>{product.available?"В наличии":"Под заказ"}</em>{catalogDiscount(product)>0&&<span className="room-catalog-discount" aria-label={`Скидка ${Math.round(catalogDiscount(product)*100)}%`}>−{Math.round(catalogDiscount(product)*100)}%</span>}</span><small>{product.brand}</small><h3>{product.name}</h3><p>{product.article?`Арт. ${product.article}`:"Артикул не указан"}</p><p>{[product.widthMm,product.depthMm,product.heightMm].some(Boolean)?`${product.widthMm||"—"} × ${product.depthMm||"—"} × ${product.heightMm||"—"} мм`:"Габариты уточняются"}</p><span className="room-catalog-price">{catalogDiscount(product)>0&&<del aria-label="Старая цена">{new Intl.NumberFormat("ru-RU").format(product.oldPrice)} руб.</del>}<strong>{product.price>0?`${new Intl.NumberFormat("ru-RU").format(product.price)} руб.`:"Цена по запросу"}</strong></span></button>
          <button className="room-catalog-choose" type="button" onClick={()=>onSelect(product)}>{selectedIds.includes(product.id)?"Уже выбран":"Выбрать"}</button>
        </article>)}</div>}
        {!loading&&!error&&!products.length&&<div className="room-catalog-empty"><b>По этим условиям товаров нет</b><p>Измените запрос или сбросьте фильтры.</p><button type="button" onClick={reset}>Сбросить фильтры</button></div>}
        {products.length<total&&<button className="room-catalog-more" type="button" disabled={loading} onClick={()=>setFilters(current=>({...current,page:current.page+1}))}>{loading?"Загружаем…":"Показать ещё"}</button>}
        {error&&filters.page>1&&<p role="alert">{error} <button type="button" onClick={()=>setRetry(value=>value+1)}>Повторить</button></p>}
      </main>
    </div>
    {detail&&<aside className="room-catalog-detail" aria-label="Подробности товара"><button className="room-catalog-detail-close" type="button" onClick={()=>setDetail(null)} aria-label="Закрыть подробности">×</button><div className="room-catalog-detail-gallery">{(detail.images?.length?detail.images:[detail.image]).slice(0,4).map((image,index)=><img src={image} alt={`${detail.name}, изображение ${index+1}`} key={`${image}-${index}`}/>)}</div><small>{detail.brand}</small><h2>{detail.name}</h2><p>Арт. {detail.article||"не указан"}</p><dl><div><dt>Габариты</dt><dd>{detail.widthMm||"—"} × {detail.depthMm||"—"} × {detail.heightMm||"—"} мм</dd></div>{detail.material&&<div><dt>Материал</dt><dd>{detail.material}</dd></div>}{detail.color&&<div><dt>Цвет</dt><dd>{detail.color}</dd></div>}<div><dt>Наличие</dt><dd>{detail.available?"В наличии":"Под заказ"}</dd></div></dl>{detail.description&&<p className="room-catalog-description">{detail.description}</p>}<strong>{detail.price>0?`${new Intl.NumberFormat("ru-RU").format(detail.price)} руб.`:"Цена по запросу"}</strong><button className="room-catalog-detail-choose" type="button" onClick={()=>onSelect(detail)}>Выбрать для проекта</button>{detail.url&&<a href={detail.url} target="_blank" rel="noreferrer">Открыть у партнёра ↗</a>}</aside>}
  </section>;
}
