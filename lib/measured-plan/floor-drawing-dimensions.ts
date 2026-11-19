import type {MultiPolygon} from 'polygon-clipping';
import type {Point} from './measure-model';
export type FloorDrawingDimension={kind:'width'|'height'|'clearance';side:'top'|'right'|'bottom'|'left';a:Point;b:Point;value:number};
type Interval=[number,number];
/** Cross-sections use actual clear floor faces, including partitions, openings and column holes. */
export function floorCrossSection(polygons:MultiPolygon,axis:0|1,at:number):Interval[]{
 const other=1-axis,result:Interval[]=[];
 for(const polygon of polygons){const crossings:number[]=[];for(const ring of polygon)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if((a[other]>at)!==(b[other]>at))crossings.push(a[axis]+(b[axis]-a[axis])*(at-a[other])/(b[other]-a[other]));}
  crossings.sort((a,b)=>a-b);for(let i=0;i+1<crossings.length;i+=2)if(crossings[i+1]-crossings[i]>.001)result.push([crossings[i],crossings[i+1]]);
 }
 result.sort((a,b)=>a[0]-b[0]);const merged:Interval[]=[];for(const interval of result){const last=merged.at(-1);if(last&&interval[0]<=last[1]+.001)last[1]=Math.max(last[1],interval[1]);else merged.push([...interval]);}return merged;
}
export function floorDrawingDimensions(selection:MultiPolygon,surface:MultiPolygon):FloorDrawingDimension[]{
 const dimensions:FloorDrawingDimension[]=[];
 // A marquee may include multiple rooms: dimension each separate selected contour.
 for(const polygon of selection){const points=polygon[0];if(points.length<3)continue;const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  dimensions.push({kind:'width',side:'top',a:[minX,minY],b:[maxX,minY],value:maxX-minX},{kind:'height',side:'right',a:[maxX,minY],b:[maxX,maxY],value:maxY-minY});
  for(const axis of [0,1] as const){const at=axis===0?(minY+maxY)/2:(minX+maxX)/2,selected=floorCrossSection([polygon],axis,at),floor=floorCrossSection(surface,axis,at);if(!selected.length)continue;
   const low=selected[0][0],high=selected.at(-1)![1];
   for(const [edge,side] of [[low,axis===0?'left':'top'],[high,axis===0?'right':'bottom']] as const){const interval=floor.find(([a,b])=>edge>=a-.01&&edge<=b+.01);if(!interval)continue;const boundary=side==='left'||side==='top'?interval[0]:interval[1],value=Math.abs(boundary-edge);if(value<.5)continue;
    const a:Point=axis===0?[boundary,at]:[at,boundary],b:Point=axis===0?[edge,at]:[at,edge];dimensions.push({kind:'clearance',side,a,b,value});
   }
  }
 }
 return dimensions;
}
