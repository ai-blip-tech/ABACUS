export function regionFromDrag(a,b,L,H){const clamp=(v,max)=>Math.max(0,Math.min(max,v));return [clamp(Math.min(a[0],b[0]),L),clamp(Math.min(a[1],b[1]),H),clamp(Math.max(a[0],b[0]),L),clamp(Math.max(a[1],b[1]),H)];}
export function validRegion(b){return b&&b.every(Number.isFinite)&&b[2]-b[0]>=.02&&b[3]-b[1]>=.02;}
