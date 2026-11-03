'use client';
import type {MouseEvent} from 'react';
import {floorRegionGeometry,floorRegionPath,parquetLayouts,type FloorRegion} from '@/lib/measured-plan/measure-floor-finishes';
import type {MeasureDoc} from '@/lib/measured-plan/measure-model';
import {ParquetPattern} from './measure-parquet-pattern';

export function MeasureFloorLayer({doc,selected,active,onSelect}:{doc:MeasureDoc;selected:string;active:boolean;onSelect:(region:FloorRegion,event:MouseEvent<SVGPathElement>)=>void}){
 return <g data-floor-finish-layer>{(doc.floorRegions||[]).map(region=>{
  let geometry;try{geometry=floorRegionGeometry(doc,region);}catch{return null;}const path=floorRegionPath(geometry.polygons),id='floor-pattern-'+region.id;
  return <g key={region.id}>{region.layout&&<defs><ParquetPattern id={id} layout={region.layout} wood={region.wood}/></defs>}
   <path data-floor-region={region.id} d={path} fillRule="evenodd" fill={region.layout?`url(#${id})`:'#e8ddc9'} fillOpacity={region.layout?1:.65} stroke={selected===region.id?'#842b39':'#b6a28a'} strokeWidth={selected===region.id?2:.7} vectorEffect="non-scaling-stroke" strokeDasharray={selected===region.id?'7 4':undefined} pointerEvents={active?'visiblePainted':'none'} style={{cursor:active?'pointer':'default'}} role="button" tabIndex={active?0:-1} aria-label={`Участок пола, ${geometry.squareMetres.toFixed(2)} м²: ${parquetLayouts.find(layout=>layout.id===region.layout)?.name||'выбрать покрытие'}`} onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();onSelect(region,event);}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();onSelect(region,{clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2} as MouseEvent<SVGPathElement>);}}}/>
  </g>;
 })}</g>;
}
