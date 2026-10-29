'use client';
import {useEffect,useRef,useState} from 'react';
import {furnitureCatalogCategories} from '@/lib/furniture-catalog-options';
import type {CatalogProduct} from '@/lib/furniture-catalog-product';
export default function FurnitureCatalogPicker({onSelect,onClose,onUploadReference,canGenerate=false,onGenerate,isGenerating=false,selectionCount=0,persistent=false,referenceLabel="Загрузить референс",footerMessage,selectedProductIds=[],initialCategory='sofa'}:{onSelect:(product:CatalogProduct,category:string)=>void;onClose:()=>void;onUploadReference?:(file?:File)=>void;canGenerate?:boolean;onGenerate?:()=>void;isGenerating?:boolean;selectionCount?:number;persistent?:boolean;referenceLabel?:string;footerMessage?:string;selectedProductIds?:string[];initialCategory?:string}){
  const referenceUpload=useRef<HTMLInputElement>(null);
  const [fullscreen,setFullscreen]=useState(false);
  const [category,setCategory]=useState<(typeof furnitureCatalogCategories)[number]>(furnitureCatalogCategories.find(c=>c.type===initialCategory)||furnitureCatalogCategories[0]);
  const [searchInput,setSearchInput]=useState("");
  const [query,setQuery]=useState("");
  const [availableOnly,setAvailableOnly]=useState(false);
  const [brands,setBrands]=useState<Array<"norrmobler"|"leve-home">>([]);
  const [subtype,setSubtype]=useState("");
  const [subtypes,setSubtypes]=useState<string[]>([]);
  const [products,setProducts]=useState<CatalogProduct[]>([]);
  const [page,setPage]=useState(1);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{const timer=window.setTimeout(()=>setQuery(searchInput.trim()),250);return()=>window.clearTimeout(timer);},[searchInput]);
  useEffect(()=>{setProducts([]);setPage(1);},[category?.type,query,availableOnly,subtype,brands]);
  useEffect(()=>{if(!category)return;const controller=new AbortController();setLoading(true);setError("");const params=new URLSearchParams({type:category.type,page:String(page),limit:"18"});if(query)params.set("q",query);if(availableOnly)params.set("available","1");if(subtype)params.set("subtype",subtype);if(brands.length)params.set("brands",brands.join(","));fetch(`/api/catalog?${params}`,{signal:controller.signal}).then(async(response)=>{const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Каталог временно недоступен.");setProducts((items)=>page===1?payload.products:[...items,...payload.products.filter((product:CatalogProduct)=>!items.some((item)=>item.id===product.id))]);setTotal(payload.total||0);setSubtypes(payload.subtypes||[]);}).catch((reason)=>{if(reason.name!=="AbortError")setError(reason.message||"Не удалось загрузить каталог.");}).finally(()=>setLoading(false));return()=>controller.abort();},[category,page,query,availableOnly,subtype,brands,retry]);
  const toggleBrand=(brand:"norrmobler"|"leve-home")=>setBrands((current)=>current.includes(brand)?current.filter((item)=>item!==brand):[...current,brand]);
  return <div className={`furniture-catalog furniture-catalog-products studio-bottom-catalog${fullscreen?" catalog-fullscreen":""}`}>
    <header className="studio-catalog-bar">
      <span className="studio-catalog-number">04</span>
      <div className="catalog-brand-filter" role="group" aria-label="Выбор бренда"><span>ВЫБОР БРЕНДА</span><div><button className={!brands.length?"active":""} type="button" onClick={()=>setBrands([])}>Все бренды</button><button className={brands.includes("norrmobler")?"active":""} type="button" onClick={()=>toggleBrand("norrmobler")}><i/>NORR Møbler</button><button className={brands.includes("leve-home")?"active":""} type="button" onClick={()=>toggleBrand("leve-home")}><i/>LEVE HOME</button></div></div>
      <div className="catalog-search"><input value={searchInput} onChange={(event)=>setSearchInput(event.target.value)} placeholder="Поиск по названию или артикулу"/><label><input type="checkbox" checked={availableOnly} onChange={(event)=>setAvailableOnly(event.target.checked)}/> В наличии</label></div>
      <nav aria-label="Категории мебели">{furnitureCatalogCategories.map((item)=><button key={item.type} className={category.type===item.type?"active":""} type="button" onClick={()=>{setCategory(item);setSubtype("");}}>{item.name}</button>)}</nav>
      <span className="studio-catalog-total">{loading?"Загрузка…":`${total} товаров`}</span>
      <div className="catalog-window-actions"><button type="button" onClick={()=>setFullscreen((value)=>!value)} aria-label={fullscreen?"Свернуть каталог":"Открыть каталог на весь экран"} title={fullscreen?"Свернуть":"На весь экран"}>{fullscreen?"↙":"⛶"}</button>{!persistent&&<button type="button" onClick={onClose} aria-label="Закрыть каталог">×</button>}</div>
    </header>
    {subtypes.length>1&&<div className="catalog-chips"><button className={!subtype?"active":""} type="button" onClick={()=>setSubtype("")}>Все</button>{subtypes.map((item)=><button key={item} className={subtype===item?"active":""} type="button" onClick={()=>setSubtype(item)}>{item}</button>)}</div>}
    {onUploadReference&&<input ref={referenceUpload} className="studio-catalog-reference-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>onUploadReference(event.target.files?.[0])}/>}
    <div className="furniture-catalog-grid" onScroll={(event)=>{const node=event.currentTarget;if(!loading&&products.length<total&&node.scrollLeft+node.clientWidth>=node.scrollWidth-160)setPage((value)=>value+1);}}>{onUploadReference&&<button className="furniture-catalog-card furniture-reference-upload-card" type="button" onClick={()=>referenceUpload.current?.click()}><span><strong>＋</strong><em>REF</em></span><b>{referenceLabel}</b><small>JPG, PNG или WEBP</small><strong>Свой предмет</strong></button>}{products.map((product)=>{const selected=selectedProductIds.includes(product.id);return <button className={selected?"furniture-catalog-card selected":"furniture-catalog-card"} type="button" key={product.id} aria-pressed={selected} onClick={()=>onSelect(product,category.type)}><span><img src={product.image} alt={product.name}/><em>{product.brand}</em>{selected&&<i className="catalog-selected-mark">✓</i>}</span><b>{product.name}</b><small>Арт. {product.article}</small>{product.price>0&&<strong>{new Intl.NumberFormat("ru-RU").format(product.price)} руб.</strong>}</button>})}{loading&&<div className="catalog-loading">Загружаем товары…</div>}{error&&<div className="catalog-error"><span>{error}</span><button type="button" onClick={()=>setRetry((value)=>value+1)}>Повторить</button></div>}</div>
    {products.length<total&&!loading&&!error&&<button type="button" className="catalog-more" onClick={()=>setPage(p=>p+1)}>Показать ещё</button>}
    <footer><span>{footerMessage||selectionCount?footerMessage||`Выбрано для рендера: ${selectionCount}`:onUploadReference?"Поставьте точку, выберите режим и товар или загрузите референс.":"Выберите товар для отмеченного предмета."}</span>{onGenerate&&<button className="studio-catalog-generate" type="button" disabled={!canGenerate||isGenerating} onClick={onGenerate}>{isGenerating?"Создаём рендер…":"Создать рендер"}</button>}</footer>
  </div>;
}
