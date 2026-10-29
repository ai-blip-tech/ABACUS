/** Bounded polyline HATCH reader for the parser's public entity-handler API.
 * Edge/spline boundaries and multiple rings are explicitly unsupported, never
 * replaced with a bounding box. No SVG/XML from the file is executed.
 */
type Group={code:number;value:unknown};
type Scanner={next:()=>Group;isEOF:()=>boolean};
export class DxfHatchHandler{
 ForEntityName='HATCH';
 parseEntity(scanner:Scanner,current:Group){
  const groups:Group[]=[];let curr=scanner.next();while(!scanner.isEOF()&&curr.code!==0){groups.push(curr);if(groups.length>20000)throw Error('Слишком сложная граница HATCH');curr=scanner.next();}
  const value=(code:number)=>groups.find(g=>g.code===code)?.value;
  const loops:{x:number;y:number;bulge?:number}[][]=[];let unsupported=false;
  for(let i=0;i<groups.length;i++){if(groups[i].code!==92)continue;if(!(Number(groups[i].value)&2)){unsupported=true;break;}
   let end=i+1;while(end<groups.length&&groups[end].code!==92)end++;const part=groups.slice(i+1,end),count=Number(part.find(g=>g.code===93)?.value),start=part.findIndex(g=>g.code===93)+1;
   if(!Number.isSafeInteger(count)||count<2||count>3000){unsupported=true;break;}const points:{x:number;y:number;bulge?:number}[]=[];
   for(let j=start;j<part.length&&points.length<count;j++){if(part[j].code!==10)continue;const p:{x:number;y:number;bulge?:number}={x:Number(part[j].value),y:NaN};while(j+1<part.length&&part[j+1].code!==10){j++;if(part[j].code===20)p.y=Number(part[j].value);if(part[j].code===42)p.bulge=Number(part[j].value);}points.push(p);}
   if(points.length!==count||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))){unsupported=true;break;}loops.push(points);i=end-1;
  }
  return{type:current.value,layer:String(value(8)||'0'),inPaperSpace:Number(value(67)||0)===1,handle:value(5),hatchLoops:loops,hatchUnsupported:unsupported||loops.length!==1,hatchColor:typeof value(420)==='number'?'#'+Number(value(420)).toString(16).padStart(6,'0'):'#eeeeea',hatchSolid:Number(value(70))===1};
 }
}
