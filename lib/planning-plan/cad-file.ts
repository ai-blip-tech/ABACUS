import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,stat,rm,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {constants} from 'node:fs';
const run=promisify(execFile);
let converting=false;
function decode(bytes:Uint8Array){let text=new TextDecoder('utf-8').decode(bytes);if(text.includes('\uFFFD')){if(!/ANSI_1251/.test(text))throw Error('Не удалось определить кодировку CAD. Экспортируйте DXF UTF-8.');text=new TextDecoder('windows-1251').decode(bytes);}return text;}
/** Local, bounded external conversion. No shell, remote services or client paths. */
export async function readCadFile(bytes:Uint8Array,fileName:string){
 if(!fileName||fileName.length>200||!bytes.length||bytes.length>2_000_000)throw Error('Выберите DWG или DXF размером до 2 МБ.');
 if(/\.dxf$/i.test(fileName))return{text:decode(bytes),fileName,warnings:[] as string[]};
 if(!/\.dwg$/i.test(fileName)||!/^AC10\d{2}$/.test(new TextDecoder().decode(bytes.slice(0,6))))throw Error('Файл не является поддерживаемым DWG или DXF.');
 const executable=process.env.ROOM_DWG_CONVERTER||(process.env.NODE_ENV==='production'?'':resolve('.local-tools/dwg2dxf'));
 if(!executable)throw Error('DWG-конвертер не настроен на сервере. Используйте DXF.');
 try{await access(executable,constants.X_OK);}catch{throw Error('DWG-конвертер недоступен. Используйте DXF.');}
 if(converting)throw Error('Другой DWG сейчас обрабатывается. Повторите загрузку через несколько секунд.');
 converting=true;let dir='';
 try{dir=await mkdtemp(join(tmpdir(),'room-dwg-import-'));const input=join(dir,'input.dwg'),output=join(dir,'output.dxf');await writeFile(input,bytes,{mode:0o600});
  let diagnostics='';try{const result=await run(executable,['-v1','--as','r2004','-o',output,input],{cwd:dir,timeout:30_000,maxBuffer:512_000,encoding:'utf8',killSignal:'SIGKILL',env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',NODE_ENV:process.env.NODE_ENV||'development'}});diagnostics=result.stderr+'\n'+result.stdout;}catch(error){
   const failure=error as {code?:string|number;killed?:boolean;signal?:string;stderr?:string};
   if(failure.killed||failure.signal||typeof failure.code!=='number')throw Error('Не удалось конвертировать DWG. Текущая планировка не изменена. Попробуйте экспорт в DXF.');
   diagnostics='ERROR: Decoder returned a partial result.\n'+(failure.stderr||'');
  }
  // A usable partial drawing may be repaired manually. The route must still
  // parse/convert the DXF before it can replace a workspace; diagnostics alone
  // do not establish whether the missing data is auxiliary or geometric.
  let info;try{info=await stat(output);}catch{throw Error('Конвертер не создал DXF. Текущая планировка не изменена.');}
  if(!info.size||info.size>2_000_000)throw Error('После конвертации DXF превышает лимит 2 МБ или пуст. Экспортируйте один этаж.');
  return{text:decode(await readFile(output)),fileName:fileName.replace(/\.dwg$/i,'.dwg.dxf'),warnings:/warning:|error:/i.test(diagnostics)?['DWG конвертирован с замечаниями. Часть объектов или линий могла измениться либо не перенестись. Проверьте размеры и состав плана; недостающее можно исправить в редакторе.']:[]};
 }finally{try{if(dir)await rm(dir,{recursive:true,force:true});}finally{converting=false;}}
}
