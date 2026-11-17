'use client';
import {useEffect,useRef,useState} from 'react';
import './render-result-dialog.css';

export type PlannerRenderResult={id:string;image:string};
export default function RenderResultDialog({result,onClose}:{result:PlannerRenderResult;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[downloading,setDownloading]=useState(false),[error,setError]=useState(''),[fullscreen,setFullscreen]=useState(false);
 useEffect(()=>{const element=dialog.current;element?.showModal();const changed=()=>setFullscreen(document.fullscreenElement===element);document.addEventListener('fullscreenchange',changed);return()=>{document.removeEventListener('fullscreenchange',changed);element?.close();};},[]);
 async function close(){if(document.fullscreenElement===dialog.current)await document.exitFullscreen().catch(()=>{});onClose();}
 async function toggleFullscreen(){if(fullscreen&&document.fullscreenElement!==dialog.current){setFullscreen(false);return;}try{if(document.fullscreenElement===dialog.current)await document.exitFullscreen();else if(dialog.current?.requestFullscreen)await dialog.current.requestFullscreen();else setFullscreen(true);}catch{setFullscreen(true);}}
 async function download(){if(downloading)return;setDownloading(true);setError('');let url='';try{const response=await fetch(result.image);if(!response.ok)throw Error('Не удалось скачать рендер.');const blob=await response.blob();if(!blob.size||!blob.type.startsWith('image/'))throw Error('Изображение недоступно.');url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='room-design-render-'+result.id+(blob.type.includes('png')?'.png':blob.type.includes('jpeg')?'.jpg':'.webp');document.body.appendChild(anchor);anchor.click();anchor.remove();const objectURL=url;window.setTimeout(()=>URL.revokeObjectURL(objectURL),30000);url='';}catch(cause){setError((cause as Error).message);}finally{if(url)URL.revokeObjectURL(url);setDownloading(false);}}
 return <dialog ref={dialog} className={"planner-render-result"+(fullscreen?" is-expanded":"")} aria-label="Готовый рендер" onCancel={event=>{event.preventDefault();void close();}}>
  <header><div><h2>Рендер готов</h2><p>Сохранён в «Концепции и материалы»</p></div><button className="planner-render-close" type="button" aria-label="Закрыть рендер" onClick={()=>void close()}>×</button></header>
  <div className="planner-render-image"><img src={result.image} alt="Готовый фотореалистичный рендер" onError={()=>setError('Не удалось загрузить изображение. Рендер сохранён в «Концепции и материалы».')}/></div>
  <footer>{error&&<p role="alert">{error}</p>}<button type="button" onClick={()=>void toggleFullscreen()}>{fullscreen?'Выйти из полноэкранного режима':'На весь экран'}</button><button type="button" disabled={downloading} onClick={()=>void download()}>{downloading?'Скачиваем…':'Скачать рендер'}</button></footer>
 </dialog>;
}
