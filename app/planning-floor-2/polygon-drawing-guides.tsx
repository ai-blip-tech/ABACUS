import type {Point} from '@/lib/measured-plan/measure-model';
import {polygonSegmentDimensions,type PolygonGuide} from '@/lib/measured-plan/floor-polygon-guides';
import {DimensionLabel} from '../measured-plan/editor/measure-dimension-label';
export function PolygonDrawingGuides({draft,cursor,guide,unit,extent}:{draft:Point[];cursor:Point|null;guide:PolygonGuide|null;unit:number;extent:number}){
 const anchor=draft.at(-1),green='#27834a';
 return <g pointerEvents="none" aria-label="Размеры отрезков и направляющие многоугольника">
 {anchor&&guide&&<g data-polygon-wall-guide={guide.relation} aria-label={guide.relation==='parallel'?'Параллельно стене':'Перпендикулярно стене'}>
 <line x1={anchor[0]-guide.direction[0]*extent} y1={anchor[1]-guide.direction[1]*extent} x2={anchor[0]+guide.direction[0]*extent} y2={anchor[1]+guide.direction[1]*extent} stroke={green} strokeWidth=".9" strokeDasharray="6 4" vectorEffect="non-scaling-stroke"/>
 <line x1={guide.wall.a[0]} y1={guide.wall.a[1]} x2={guide.wall.b[0]} y2={guide.wall.b[1]} stroke={green} strokeWidth="1.2" vectorEffect="non-scaling-stroke"/>
 {cursor&&<text x={cursor[0]+unit} y={cursor[1]+unit*1.5} fontSize={unit*.85} fill={green} stroke="#fffdf9" strokeWidth={unit*.3} paintOrder="stroke">{guide.relation==='parallel'?'∥':'⊥'} {guide.wall.name||'стена'}</text>}
 </g>}
 {polygonSegmentDimensions(draft,cursor).map((d,i)=><g key={i} data-polygon-segment-length={Math.round(d.length)} aria-label={`${d.live?'Текущий отрезок':'Отрезок '+(i+1)}: ${Math.round(d.length)} мм`}><DimensionLabel a={d.a} b={d.b} font={unit*1.15} color={d.live&&guide?green:'#26211e'}>{Math.round(d.length).toLocaleString('ru-RU')} мм</DimensionLabel></g>)}
 </g>;
}
