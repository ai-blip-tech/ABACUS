// A narrow desktop window is not a phone. Do not expose capture on a mouse/trackpad PC.
export function canUsePlanCamera(coarsePointer:boolean,touchPoints:number,userAgent:string,platform=''){const mobileOS=/Android|iPhone|iPad|iPod/i.test(userAgent)||(platform==='MacIntel'&&touchPoints>1);return mobileOS&&coarsePointer&&touchPoints>0;}
