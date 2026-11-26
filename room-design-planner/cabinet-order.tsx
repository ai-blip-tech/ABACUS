import React, {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {CABINET_ORDER_RECIPIENT,cabinetOrderTopics,isCabinetOrderPhone,type CabinetOrderProduct} from '../lib/cabinet-order';
import './cabinet-order.css';

function OrderSection({title,hint,children}:{title:string;hint:string;children:ReactNode}){
 return <details className="rd-order-section">
  <summary><span>{title}</span><small>{hint}</small><i aria-hidden="true"/></summary>
  <div className="rd-order-section-content">{children}</div>
 </details>;
}

export function CabinetOrder({product,photo,onClose}:{product:CabinetOrderProduct;photo:Blob;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [photoUrl,setPhotoUrl]=useState('');
 const [mode,setMode]=useState<'manual'|'ai'>('manual');
 const [sectionSummary,setSectionSummary]=useState({wishes:false,questions:0});
 const [sending,setSending]=useState(false);
 const [sent,setSent]=useState<{preview:boolean}|null>(null);
 const [error,setError]=useState('');

 useEffect(()=>{
  const element=dialog.current;
  element?.showModal();
  return()=>element?.close();
 },[]);
 useEffect(()=>{
  const url=URL.createObjectURL(photo);
  setPhotoUrl(url);
  return()=>URL.revokeObjectURL(url);
 },[photo]);

 function updateSummary(form:HTMLFormElement){
  const fields=new FormData(form);
  const has=(key:string)=>String(fields.get(key)||'').trim().length>0;
  setSectionSummary({wishes:['deadline','budget','city','note'].some(has),questions:fields.getAll('topics').length+Number(has('extra'))});
 }

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(sending||sent)return;
  const fields=new FormData(event.currentTarget);
  const name=String(fields.get('name')||'').trim();
  const phone=String(fields.get('phone')||'').trim();
  if(!name||!isCabinetOrderPhone(phone)){
   setError(!name?'Укажите имя.':'Проверьте номер телефона.');
   const field=event.currentTarget.elements.namedItem(!name?'name':'phone') as HTMLInputElement|null;
   field?.focus();
   return;
  }
  fields.set('name',name);
  fields.set('phone',phone);
  fields.set('productName',product.name);
  for(const key of ['dimensions','finish','construction','price'] as const)fields.set(key,product[key]);
  fields.set('photo',photo,'room-design-cabinet.jpg');
  setSending(true);
  setError('');
  try{
   const response=await fetch('/api/cabinet-order',{method:'POST',body:fields});
   const result=await response.json();
   if(!response.ok||!result.ok)throw Error(result.error||'Не удалось отправить заявку.');
   setSent({preview:result.preview===true});
  }catch(cause){
   setError(cause instanceof Error?cause.message:'Не удалось отправить заявку.');
  }finally{
   setSending(false);
  }
 }

 return <dialog ref={dialog} className="rd-order-page" aria-labelledby="rd-order-title" onCancel={event=>{
  event.preventDefault();
  event.stopPropagation();
  if(!sending)onClose();
 }}>
  <header className="rd-order-masthead"><div>
   <span className="rd-cabinet-wordmark">ROOM DESIGN</span>
   <button type="button" className="rd-order-back" disabled={sending} onClick={onClose}>Назад к конфигуратору</button>
  </div></header>
  <main className="rd-order-main">
   <h1 id="rd-order-title">Заказ товара</h1>
   <div className="rd-order-layout">
    <section className="rd-order-panel">
     <div className="rd-order-modes" role="group" aria-label="Способ оформления заказа">
      <button type="button" className="rd-order-button" aria-pressed={mode==='manual'} onClick={()=>setMode('manual')}>Самостоятельно</button>
      <button type="button" className="rd-order-button" aria-pressed={mode==='ai'} onClick={()=>setMode('ai')}>С помощью AI</button>
     </div>
     <form className="rd-order-form" hidden={mode!=='manual'} onSubmit={submit} onChange={event=>{updateSummary(event.currentTarget);setError('');}}>
      <div><h2>Как оформить заказ самостоятельно</h2><p className="rd-order-subtitle">Оставьте контакт для связи по заказу.</p></div>
      <div className="rd-order-fields">
       <label className="rd-order-field rd-order-full">Имя <input name="name" autoComplete="name" maxLength={80} required/></label>
       <label className="rd-order-field">Телефон <input name="phone" type="tel" autoComplete="tel" maxLength={35} placeholder="+7 999 000-00-00" required/></label>
       <label className="rd-order-field">Электронная почта <input name="email" type="email" autoComplete="email" maxLength={120} placeholder="name@example.com"/></label>
      </div>
      <p className="rd-order-hint">Имя и телефон обязательны.</p>
      <div className="rd-order-options">
       <OrderSection title="Пожелания" hint={sectionSummary.wishes?'Заполнено':'Добавить при необходимости'}>
        <div className="rd-order-fields">
         <label className="rd-order-field">Желаемый срок <input name="deadline" maxLength={80} placeholder="Например, до 15 января"/></label>
         <label className="rd-order-field">Ориентировочный бюджет <input name="budget" maxLength={100} placeholder="Сумма и валюта"/></label>
         <label className="rd-order-field">Город доставки <input name="city" maxLength={100}/></label>
         <label className="rd-order-field rd-order-full">Комментарий <textarea name="note" maxLength={800}/></label>
        </div>
       </OrderSection>
       <OrderSection title="Вопросы к фабрике" hint={sectionSummary.questions?'Выбрано · '+sectionSummary.questions:'Выбрать вопросы'}>
        {cabinetOrderTopics.map(topic=><label className="rd-order-check" key={topic}><input type="checkbox" name="topics" value={topic}/>{topic}</label>)}
        <label className="rd-order-field rd-order-extra">Свой вопрос фабрике <textarea name="extra" maxLength={500}/></label>
       </OrderSection>
      </div>
      {error&&<p className="rd-order-error" role="alert">{error}</p>}
      <div><button type="submit" className="rd-order-button rd-order-primary" disabled={sending||!!sent}>{sending?'Отправляем…':'Отправить заказ'}</button></div>
      {sent&&<p className="rd-order-status" role="status">{sent.preview?`Тестовая заявка сохранена в превью. Получатель — ${CABINET_ORDER_RECIPIENT}.`:'Заявка отправлена. Свяжемся с вами по указанному телефону.'}</p>}
     </form>
     {mode==='ai'&&<section className="rd-order-assistant"><h2>Оформление с помощью AI</h2><p className="rd-order-subtitle">Помощник скоро появится.</p>
      <button type="button" className="rd-order-button" onClick={()=>setMode('manual')}>Оформить самостоятельно</button>
     </section>}
    </section>
    <aside className="rd-order-product" aria-label="Выбранный товар">
     {photoUrl&&<img src={photoUrl} alt={product.name}/>}
     <div className="rd-order-product-body">
      <p>Товар</p><h2>{product.name}</h2>
      <dl><dt>Ш × Г × В</dt><dd>{product.dimensions}</dd><dt>Отделка</dt><dd>{product.finish}</dd>
       <dt>Конструкция</dt><dd>{product.construction}</dd><dt>Стоимость</dt><dd>{product.price}</dd></dl>
     </div>
    </aside>
   </div>
  </main>
 </dialog>;
}
