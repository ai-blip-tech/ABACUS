export class RecognitionRequestError extends Error {
 constructor(message:string,public status=0,public terminal=false){super(message);}
}
/** All requests have a deadline, including reading/parsing the response body. */
export async function recognitionJSON(url:string,init:RequestInit={},timeout=20000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(url,{...init,signal:controller.signal,cache:'no-store'});
  const text=await response.text();let value:any;try{value=JSON.parse(text);}catch{throw new RecognitionRequestError('Сервер временно не отвечает. Запущенный анализ можно проверить повторным нажатием.',response.status);}
  if(!response.ok)throw new RecognitionRequestError(value.error||'Не удалось получить результат анализа.',response.status,value.terminal===true||[400,401,403,404,409].includes(response.status));
  return value;
 }catch(error){if(error instanceof RecognitionRequestError)throw error;throw new RecognitionRequestError('Не удалось дождаться ответа сервера. Файл сохранён; повторное нажатие проверит тот же анализ.');}finally{clearTimeout(timer);}
}
export async function waitForRecognition(url:string,onPhase:(phase:string)=>void,options:{duration?:number;interval?:number;request?:typeof recognitionJSON;foregroundDuration?:number;onBackground?:()=>void}={}){
 const started=Date.now(),deadline=started+(options.duration??900000),request=options.request??recognitionJSON;let failures=0,background=false;
 while(Date.now()<deadline){
  if(!background&&Date.now()-started>=(options.foregroundDuration??120000)){background=true;options.onBackground?.();}
  try{const value=await request(url,{},Math.min(20000,Math.max(1,deadline-Date.now())));failures=0;if(value.status==='completed')return value;
   onPhase(value.status==='queued'?'Файл в очереди на анализ':'Распознаём стены, двери, окна и размеры');
  }catch(error){if(error instanceof RecognitionRequestError&&error.terminal)throw error;failures++;onPhase('Восстанавливаем связь с сервером');if(failures>=3)throw error;}
  await new Promise(resolve=>setTimeout(resolve,Math.min(options.interval??2500,Math.max(0,deadline-Date.now()))));
 }
 return null;
}
