import clipping from 'polygon-clipping';
import type {MeasureDoc,Point} from './measure-model';
import {detectedRooms,type DetectedRoom} from './measure-rooms.ts';
import {floorPolygon,floorRegionPath} from './measure-floor-finishes.ts';
import {multiArea,usablePlanArea} from '../planning-plan/usable-area.ts';

export function floorSelectionRectangle(a:Point,b:Point):Point[]{
 if([...a,...b].some(n=>!Number.isFinite(n)||Math.abs(n)>200000))throw Error('Некорректные границы выделения');
 const x0=Math.min(a[0],b[0]),y0=Math.min(a[1],b[1]),x1=Math.max(a[0],b[0]),y1=Math.max(a[1],b[1]);
 return [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
}
/** Intersect the marquee with usable floor, never its bounding box or wall axes. */
export function selectFloorByRectangle(doc:MeasureDoc,a:Point,b:Point,surface=usablePlanArea(doc).polygons,rooms:DetectedRoom[]=detectedRooms(doc)){
 const rectangle=floorSelectionRectangle(a,b);
 if(Math.abs(a[0]-b[0])<1||Math.abs(a[1]-b[1])<1)return{rectangle,polygons:[],regions:[],path:'',squareMetres:0};
 let polygons=surface.length?clipping.intersection([rectangle],surface):[];
 // A rough box around most of a room selects its complete contour. The live
 // highlight makes the expansion visible before release; smaller boxes stay partial.
 const selected=rooms.filter(room=>multiArea(clipping.intersection([rectangle],[room.polygon,...room.holes]))>=room.squareMetres*1e6*.8);
 if(selected.length){const full=clipping.union(...selected.map(room=>[room.polygon,...room.holes]) as [clipping.Polygon,...clipping.Polygon[]]);const captured=multiArea(clipping.intersection(polygons,full));if(captured>=multiArea(polygons)*.85)polygons=full;}

 const retained=polygons.filter(poly=>multiArea([poly])>=10000);
 const regions=retained.map(poly=>floorPolygon(poly[0]));
 return{rectangle,polygons:retained,regions,path:floorRegionPath(retained),squareMetres:multiArea(retained)/1e6};
}
