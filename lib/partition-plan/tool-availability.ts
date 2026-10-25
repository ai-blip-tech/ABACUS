export function partitionToolEnabled(tool:string,mode:'demolition'|'installation',hasDoc:boolean,baseLocked:boolean,busy:boolean){
 if(!hasDoc||busy)return false;
 if(['scale','floor','zone'].includes(tool))return false;
 if(['wall','opening','window'].includes(tool))return !baseLocked||mode==='installation';
 return ['select','ruler','dimension'].includes(tool);
}
