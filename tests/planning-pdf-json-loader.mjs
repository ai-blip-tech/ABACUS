// Next supports static JSON imports; mirror that only in this PDF test worker.
import {readFile} from 'node:fs/promises';
export async function load(url,context,nextLoad){
 if(url.endsWith('/lib/measured-plan/print-frame-reference.json'))return{format:'module',source:'export default '+await readFile(new URL(url),'utf8')+';',shortCircuit:true};
 return nextLoad(url,context);
}
