/** Metres. Binary hiding, with a small return margin to prevent boundary flicker. */
export function wallProximityOpacity(position,direction,min,max,wasHidden=false){
 const closest=position.map((n,i)=>Math.max(min[i],Math.min(max[i],n)));
 const toward=closest.map((n,i)=>n-position[i]),distance=Math.hypot(...toward);
 if(distance>0.001&&toward.reduce((sum,n,i)=>sum+n*direction[i],0)/distance<-.05)return 1;
 return distance<=(wasHidden?2.35:2)?0:1;
}
