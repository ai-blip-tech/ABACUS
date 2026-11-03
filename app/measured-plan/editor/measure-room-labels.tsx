import type {DetectedRoom} from '@/lib/measured-plan/measure-rooms';

export function MeasureRoomLabels({rooms,font,showNames,showAreas,onSelect}:{rooms:DetectedRoom[];font:number;showNames:boolean;showAreas:boolean;onSelect:(room:DetectedRoom)=>void}){
 if(!showNames&&!showAreas)return null;
 return <g data-room-labels>{rooms.map(room=><g key={room.id} data-room-label={room.id} role="button" tabIndex={0} aria-label={`${room.name}, ${room.squareMetres.toFixed(2)} м²`} style={{cursor:'pointer'}} onClick={event=>{event.stopPropagation();onSelect(room);}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(room);}}}>
  <rect x={room.anchor[0]-font*4.4} y={room.anchor[1]-font*1.65} width={font*8.8} height={font*3.3} rx={font*.45} fill="#fffdf9" fillOpacity=".94" stroke="#bcb0a3" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
  {showNames&&<text x={room.anchor[0]} y={room.anchor[1]-(showAreas?font*.18:-font*.25)} textAnchor="middle" fontSize={font*.85} fontWeight="600" fill="#342d28">{room.name}</text>}
  {showAreas&&<text x={room.anchor[0]} y={room.anchor[1]+(showNames?font*.85:font*.3)} textAnchor="middle" fontSize={font*.78} fill="#76685d">{room.squareMetres.toFixed(2)} м²</text>}
 </g>)}</g>;
}
