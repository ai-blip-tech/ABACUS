import type {Column} from '@/lib/measured-plan/measure-model';
export function MeasureColumns({columns=[],font,selected='',onSelect,monochrome=false}:{columns?:Column[];font:number;selected?:string;onSelect?:(id:string)=>void;monochrome?:boolean}){
 return <>{columns.map((c,i)=><g key={c.id} data-measure-column={c.id} role={onSelect?'button':undefined} tabIndex={onSelect?0:undefined} aria-label={c.name} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onSelect?.(c.id);}} onKeyDown={e=>{if(e.key==='Enter')onSelect?.(c.id);}}>
  <rect x={c.a[0]} y={c.a[1]} width={c.width} height={c.depth} fill={monochrome?'#292725':c.confirmed?'#42755c':'#bd6159'} stroke={selected===c.id?'#842b39':'#292725'} strokeWidth={selected===c.id?'3':'1'} vectorEffect="non-scaling-stroke"/>
  <text x={c.a[0]+c.width/2} y={c.a[1]+c.depth/2+Math.min(font,c.depth*.3)*.32} textAnchor="middle" fontSize={Math.min(font,c.width*.3,c.depth*.3)} fill="white">К{i+1}</text>
 </g>)}</>;
}
