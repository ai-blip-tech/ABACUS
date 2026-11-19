import type {MeasureDoc,Point} from '@/lib/measured-plan/measure-model';
import {detectedRooms} from '@/lib/measured-plan/measure-rooms';
import {wallBodies,wallJoins} from '@/lib/measured-plan/measure-display';
import {doorSymbol} from '@/lib/measured-plan/measure-editing';
import {planDrawingDimensions,openingWidthMarks} from '@/lib/measured-plan/measure-annotations';
import {floorRegionPath} from '@/lib/measured-plan/measure-floor-finishes';
import {MeasureFloorLayer} from '../../measured-plan/editor/measure-floor-layer';
import {MeasureWallDimensions} from '../../measured-plan/editor/measure-wall-dimensions';
import {DimensionLabel} from '../../measured-plan/editor/measure-dimension-label';
import {geometry,type Floor2Region} from '@/lib/floor-2/model';
export function FloorPrintDrawing({plan,ids,small=false}:{plan:MeasureDoc;ids:string[];small?:boolean}){
 const points=[...plan.floor,...plan.walls.flatMap(w=>[w.a,w.b]),...(plan.floorRegions||[]).flatMap(r=>r.polygon)],xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(0,...xs),y=Math.min(0,...ys),w=Math.max(...xs,1000)-x,h=Math.max(...ys,1000)-y,pad=650,scale=[25,50,75,100,150,200,500].find(s=>(w+pad*2)/s<=(small?145:370)&&(h+pad*2)/s<=(small?66:170))||500,font=scale*(small?2.2:2.8),bodies=wallBodies(plan.walls),rooms=detectedRooms(plan);
 return <figure className={small?'floor-mini-plan':'floor-main-plan'}><svg role="img" aria-label={small?'Расположение выбранного декора на плане':'План напольных покрытий с размерами'} viewBox={`${x-pad} ${y-pad} ${w+pad*2} ${h+pad*2}`} style={{width:(w+pad*2)/scale+'mm',height:(h+pad*2)/scale+'mm'}}>
 {!small&&<MeasureFloorLayer doc={plan} visibleIds={ids} selected="" active={false} onSelect={()=>{}}/>}
 {small&&(plan.floorRegions as Floor2Region[]||[]).filter(r=>ids.includes(r.id)).map(r=><path key={r.id} d={floorRegionPath(geometry(plan,r).polygons)} fill="#f5d8df" stroke="#c68d9b" strokeWidth={scale*.3} fillRule="evenodd"/>)}
 {bodies.map(w=><line key={w.id} x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke="#2b2622" strokeWidth={w.thickness}/>)}{wallJoins(bodies,0).map((j,i)=><polygon key={i} points={j.polygon.map(p=>p.join(',')).join(' ')} fill="#2b2622"/>)}
 {plan.openings.map(o=>{const wall=plan.walls.find(w=>w.id===o.wallId);if(!wall)return null;const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]),ux=(wall.b[0]-wall.a[0])/length,uy=(wall.b[1]-wall.a[1])/length,a:Point=[wall.a[0]+ux*(o.offset-o.width/2),wall.a[1]+uy*(o.offset-o.width/2)],b:Point=[a[0]+ux*o.width,a[1]+uy*o.width],door=doorSymbol(wall,o);return <g key={o.id}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#fffdf9" strokeWidth={wall.thickness+2}/>{o.kind==='door'&&<><path d={door.path} fill="none" stroke="#514841" strokeWidth={scale*.2}/><line x1={door.hinge[0]} y1={door.hinge[1]} x2={door.leaf[0]} y2={door.leaf[1]} stroke="#514841" strokeWidth={scale*.2}/></>}</g>;})}
 {(plan.columns||[]).map(c=><rect key={c.id} x={c.a[0]} y={c.a[1]} width={c.width} height={c.depth} fill="#2b2622"/>)}
 {rooms.map(room=><g key={room.id}><text x={room.anchor[0]} y={room.anchor[1]-font*.7} fontSize={font} textAnchor="middle" stroke="#fffdf9" strokeWidth={font*.35} paintOrder="stroke" fill="#24201d">{room.name}</text><text x={room.anchor[0]} y={room.anchor[1]+font*.7} fontSize={font*.85} textAnchor="middle" stroke="#fffdf9" strokeWidth={font*.35} paintOrder="stroke" fill="#24201d">{room.squareMetres.toFixed(2)} м²</text></g>)}
 <g pointerEvents="none"><MeasureWallDimensions walls={plan.walls} floor={plan.floor} font={font} onEdit={()=>{}}/></g>
 {!small&&planDrawingDimensions(plan).map(d=><g key={d.id}><line x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} stroke="black" strokeWidth={scale*.2}/><DimensionLabel a={d.a} b={d.b} font={font}>{Math.round(d.value)} мм</DimensionLabel></g>)}
 {!small&&openingWidthMarks(plan,font).map(d=><g key={d.id}><line x1={d.da[0]} y1={d.da[1]} x2={d.db[0]} y2={d.db[1]} stroke="black" strokeWidth={scale*.2}/><DimensionLabel a={d.da} b={d.db} font={font}>{d.label}</DimensionLabel></g>)}

 </svg><figcaption>{small&&<><i className="floor-highlight-key"/>Розовым отмечена зона выбранного декора · </>}М 1:{scale} · размеры в мм</figcaption></figure>;
}
