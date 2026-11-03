'use client';
import {useId} from 'react';
import type {FloorWood,ParquetLayout} from '@/lib/measured-plan/measure-floor-finishes';

const tones={oak:['#c7a273','#d4b387','#bc9565','#ddbd92','#cda77a'],walnut:['#69442d','#7b5235','#5c3b28','#8b5e3e','#724b30']};
function Board({x,y,width,height,wood,index=0,rotate=0}:{x:number;y:number;width:number;height:number;wood:FloorWood;index?:number;rotate?:number}){
 return <g transform={`translate(${x} ${y}) rotate(${rotate})`}><svg width={width} height={height} viewBox="0 0 100 20" preserveAspectRatio="none" overflow="hidden">
  <rect width="100" height="20" fill={tones[wood][Math.abs(index)%5]}/>
  {[3,6,10,14,17].map((y,i)=><path key={i} d={`M -4 ${y} C 14 ${y-3} 30 ${y+4} 51 ${y} S 83 ${y-2} 106 ${y+1}`} fill="none" stroke={wood==='oak'?'#785335':'#d3a474'} strokeWidth=".22" opacity=".3"/>)}
  <path d="M 24 11 C 32 5 56 6 64 10 C 54 14 34 15 24 11 M 32 11 C 42 8 50 8 57 10" fill="none" stroke={wood==='oak'?'#8c623b':'#c59669'} strokeWidth=".2" opacity=".25"/>
 </svg><rect width={width} height={height} fill="none" stroke={wood==='oak'?'#876744':'#3b281d'} strokeWidth="3"/></g>;
}

/** Native vector patterns: layout and wood are independent, without image crops or labels. */
export function ParquetPattern({id,layout,wood}:{id:string;layout:ParquetLayout;wood:FloorWood}){
 let width=1200,height=360,transform:string|undefined,content;
 if(layout==='straight'||layout==='diagonal'){
  transform=layout==='diagonal'?'rotate(-45)':undefined;
  content=[0,1,2].flatMap(row=>[-1,0,1].map(col=><Board key={`${row}-${col}`} x={col*1200+row*400} y={row*120} width={1200} height={120} wood={wood} index={row+col}/>));
 }else if(layout==='herringbone'){
  width=960;height=960;transform='rotate(45)';const boards=[];
  for(let i=-3;i<=3;i++)for(let j=-12;j<=12;j++){const x=i*480-j*120,y=i*480+j*120;
   if(x<width&&x+480>0&&y<height&&y+120>0)boards.push(<Board key={`h${i}-${j}`} x={x} y={y} width={480} height={120} wood={wood} index={i+j}/>);
   if(x+360<width&&x+480>0&&y+120<height&&y+600>0)boards.push(<Board key={`v${i}-${j}`} x={x+480} y={y+120} width={480} height={120} rotate={90} wood={wood} index={i-j+2}/>);
  }content=boards;
 }else if(layout==='chevron'){
  width=960;height=240;
  // Include adjacent V rows to make the repeating tile continuous.
  content=[-6,-5,-4,-3,-2,-1,0,1,2].flatMap(row=>[0,1].map(side=>{const y=row*120;return <g key={`${row}-${side}`}><polygon points={side===0?`0,${y} 480,${y+480} 480,${y+600} 0,${y+120}`:`480,${y+480} 960,${y} 960,${y+120} 480,${y+600}`} fill={tones[wood][Math.abs(row+side)%5]} stroke={wood==='oak'?'#876744':'#3b281d'} strokeWidth="3"/>{[28,57,86].map(line=><path key={line} d={side===0?`M 0 ${y+line} Q 240 ${y+line+235} 480 ${y+480+line}`:`M 480 ${y+480+line} Q 720 ${y+line+245} 960 ${y+line}`} fill="none" stroke={wood==='oak'?'#8c623b':'#c59669'} strokeWidth="2" opacity=".25"/>)}</g>;}));
 }else if(layout==='basket'){
  width=960;height=960;content=[0,1].flatMap(row=>[0,1].flatMap(col=>[0,1,2,3].map(plank=>(row+col)%2===0?<Board key={`${row}-${col}-${plank}`} x={col*480} y={row*480+plank*120} width={480} height={120} wood={wood} index={plank+row+col}/>:<Board key={`${row}-${col}-${plank}`} x={col*480+(plank+1)*120} y={row*480} width={480} height={120} rotate={90} wood={wood} index={plank+row+col}/>)));
 }else{
  width=1200;height=1200;content=<>
   <rect width="1200" height="1200" fill={tones[wood][1]}/>
   <svg x="100" y="100" width="1000" height="1000" viewBox="0 0 1000 1000" overflow="hidden"><g transform="rotate(45 500 500)">{Array.from({length:15},(_,row)=>Array.from({length:5},(_,col)=><Board key={`${row}-${col}`} x={col*480-700+(row%2)*240} y={row*100-300} width={480} height={100} wood={wood} index={row+col}/>))}</g><path d="M 500 0 L 1000 500 500 1000 0 500 Z M 250 250 L 750 750 M 750 250 L 250 750" fill="none" stroke={tones[wood][0]} strokeWidth="65"/><path d="M 500 0 L 1000 500 500 1000 0 500 Z" fill="none" stroke={wood==='oak'?'#876744':'#3b281d'} strokeWidth="3"/></svg>
   <Board x={0} y={0} width={1200} height={100} wood={wood}/><Board x={1200} y={100} width={1100} height={100} rotate={90} wood={wood} index={1}/><Board x={1100} y={1200} width={1100} height={100} rotate={180} wood={wood} index={2}/><Board x={0} y={1100} width={1000} height={100} rotate={-90} wood={wood} index={3}/>
  </>;
 }
 return <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse" patternTransform={transform}><rect width={width} height={height} fill={tones[wood][0]}/>{content}</pattern>;
}

export function ParquetSwatch({layout,wood}:{layout:ParquetLayout;wood:FloorWood}){
 const id='parquet-'+useId().replaceAll(':','');
 return <svg viewBox="0 0 1800 1000" role="img" aria-label={`${layout} · ${wood==='oak'?'дуб':'орех'}`} preserveAspectRatio="xMidYMid slice"><defs><ParquetPattern id={id} layout={layout} wood={wood}/></defs><rect width="1800" height="1000" fill={`url(#${id})`}/></svg>;
}
