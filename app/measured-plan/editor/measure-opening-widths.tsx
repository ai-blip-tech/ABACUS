import React from 'react';
import type {MeasureDoc} from '@/lib/measured-plan/measure-model';
import {openingWidthMarks} from '@/lib/measured-plan/measure-annotations';
export function OpeningWidths({doc,font}:{doc:MeasureDoc;font:number}){
 return <g pointerEvents="none" data-opening-widths>{openingWidthMarks(doc,font).map(m=>{const vertical=Math.abs(m.db[1]-m.da[1])>Math.abs(m.db[0]-m.da[0]);return <g key={m.id} data-opening-width={m.id} aria-label={'Ширина проёма: '+m.label}>
 {[{a:m.a,b:m.da},{a:m.b,b:m.db}].map((l,i)=><line key={i} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke="black" strokeWidth=".6" vectorEffect="non-scaling-stroke"/>)}
 <line x1={m.da[0]} y1={m.da[1]} x2={m.db[0]} y2={m.db[1]} stroke="black" strokeWidth="12" strokeDasharray="35 25"/>
 {[m.da,m.db].map((p,i)=><line key={i} x1={p[0]-m.nx*font*.5} y1={p[1]-m.ny*font*.5} x2={p[0]+m.nx*font*.5} y2={p[1]+m.ny*font*.5} stroke="black" strokeWidth="1" vectorEffect="non-scaling-stroke"/>)}
 <text x={(m.da[0]+m.db[0])/2+(vertical?font:0)} y={(m.da[1]+m.db[1])/2+(vertical?font*.35:-font*.6)} textAnchor={vertical?'start':'middle'} fontFamily="Arial, Helvetica, sans-serif" fontWeight="400" fontSize={font*1.05} fill="black" stroke="#fffdf7" strokeWidth={font*.35} paintOrder="stroke">{m.label}</text>
 </g>;})}</g>;
}
