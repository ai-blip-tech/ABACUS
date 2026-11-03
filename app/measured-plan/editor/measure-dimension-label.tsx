import type {ReactNode} from 'react';
import type {Point} from '@/lib/measured-plan/measure-model';

/** One typography and baseline gap for ruler and every automatic dimension. */
export function DimensionLabel({a,b,font,color='#000000',children}:{a:Point;b:Point;font:number;color?:string;children:ReactNode}){
 const angle=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI,readable=angle>90||angle<-90?angle+180:angle,x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;
 return <g transform={`translate(${x} ${y}) rotate(${readable})`} pointerEvents="none"><text y={-font*.4} textAnchor="middle" fontSize={font*.9} fontFamily="Arial, Helvetica, sans-serif" fontWeight="600" fill={color} stroke="#fffdf9" strokeWidth={font*.32} paintOrder="stroke">{children}</text></g>;
}
