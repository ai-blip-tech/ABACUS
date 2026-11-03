import type {OpeningAlignmentGuide} from '@/lib/measured-plan/measure-opening-alignment';
export function OpeningAlignmentGuides({guides,font}:{guides:OpeningAlignmentGuide[];font:number}){
 return <g data-opening-alignment-guides pointerEvents="none">{guides.map((guide,i)=><g key={i} opacity={guide.snapped?1:.45}>
  <line x1={guide.a[0]} y1={guide.a[1]} x2={guide.b[0]} y2={guide.b[1]} stroke="#842b39" strokeWidth={guide.snapped?1.8:1} strokeDasharray="7 5" vectorEffect="non-scaling-stroke"/>
  {[guide.a,guide.b].map((p,index)=><path key={index} d={`M ${p[0]-font*.35} ${p[1]} H ${p[0]+font*.35} M ${p[0]} ${p[1]-font*.35} V ${p[1]+font*.35}`} stroke="#842b39" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>)}
  {i===0&&<text x={(guide.a[0]+guide.b[0])/2} y={(guide.a[1]+guide.b[1])/2-font*.55} textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="600" fontSize={font*.8} fill="#842b39" stroke="#fffdf9" strokeWidth={font*.3} paintOrder="stroke">{guide.label}{guide.snapped?' · точно':''}</text>}
 </g>)}</g>;
}
