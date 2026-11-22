'use client';
import {useCallback,useEffect,useState} from 'react';
import type {CoverProduct} from '@/lib/floor-2/model';
export function useCoveringHistory(projectId?:string){
 const [id,setId]=useState(projectId||''),[products,setProducts]=useState<CoverProduct[]>([]),[ready,setReady]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setId(projectId||new URLSearchParams(location.search).get('project')||'');},[projectId]);
 const reload=useCallback(async()=>{if(!id){setReady(true);return;}try{const r=await fetch('/api/projects/'+encodeURIComponent(id)+'/covering-history',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setProducts(d.products||[]);setError('');}catch{setError('История покрытий пока недоступна.');}finally{setReady(true);}},[id]);
 useEffect(()=>{setProducts([]);setReady(false);void reload();if(!id)return;const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('roomdesign:covering-history:'+id):null;const update=()=>void reload();channel?.addEventListener('message',update);window.addEventListener('roomdesign:covering-history:'+id,update);return()=>{channel?.close();window.removeEventListener('roomdesign:covering-history:'+id,update);};},[id,reload]);
 const remember=useCallback(async(product:CoverProduct,seed=false)=>{if(!id)return;setProducts(old=>seed?(old.some(p=>p.id===product.id)?old:[...old,product]):[product,...old.filter(p=>p.id!==product.id)]);try{const r=await fetch('/api/projects/'+encodeURIComponent(id)+'/covering-history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product,seed})});if(!r.ok)throw Error();setError('');window.dispatchEvent(new Event('roomdesign:covering-history:'+id));if(typeof BroadcastChannel!=='undefined'){const c=new BroadcastChannel('roomdesign:covering-history:'+id);c.postMessage({changed:true});c.close();}}catch{setError('Не удалось сохранить историю. Выбранное покрытие остаётся в редакторе.');}},[id]);
 return {products,ready,error,remember};
}
