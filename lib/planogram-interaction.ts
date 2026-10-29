/** Shared with the interior planogram: retain the grab angle and rotate by its delta. */
export function rotationFromDrag(startRotation:number,startAngle:number,currentAngle:number){return Math.round(((startRotation+currentAngle-startAngle)%360+360)%360);}
export function rotatedPlanogramSize(width:number,depth:number,rotation:number){const a=rotation*Math.PI/180;return{width:Math.abs(width*Math.cos(a))+Math.abs(depth*Math.sin(a)),depth:Math.abs(width*Math.sin(a))+Math.abs(depth*Math.cos(a))};}
