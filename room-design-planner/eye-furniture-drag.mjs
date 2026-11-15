/** Project a screen drag onto the ground plane, without intersecting a near-horizontal ray. */
export function eyeDragPosition(position,dx,dy,yaw,distance,fovDegrees,viewportHeight){
 const scale=2*Math.max(.3,distance)*Math.tan(fovDegrees*Math.PI/360)/Math.max(1,viewportHeight);
 const right=[Math.cos(yaw),-Math.sin(yaw)],forward=[-Math.sin(yaw),-Math.cos(yaw)];
 return[position[0]+(dx*right[0]-dy*forward[0])*scale,position[1],position[2]+(dx*right[1]-dy*forward[1])*scale];
}
