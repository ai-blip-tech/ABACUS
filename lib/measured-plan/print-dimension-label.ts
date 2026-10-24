type PaperPoint={x:number;y:number};
type PaperBox={left:number;right:number;bottom:number;top:number};
/** PDF baseline offset in paper points, perpendicular to the dimension line.
 * Rotating text around an unrotated (+x,+y) offset makes vertical glyphs cross the line.
 */
export function dimensionLabelLayout(a:PaperPoint,b:PaperPoint,textWidth:number,gap=3,obstacles:PaperBox[]=[]){
 let angle=Math.atan2(b.y-a.y,b.x-a.x);
 if(angle>Math.PI/2)angle-=Math.PI;
 if(angle<=-Math.PI/2)angle+=Math.PI;
 const ux=Math.cos(angle),uy=Math.sin(angle),nx=-uy,ny=ux;
 const candidates=[.5,.35,.65,.2,.8].map(t=>{
  const x=a.x+(b.x-a.x)*t-ux*textWidth/2+nx*gap,y=a.y+(b.y-a.y)*t-uy*textWidth/2+ny*gap;
  const corners=[{x:x+nx*-1.5,y:y+ny*-1.5},{x:x+ux*textWidth+nx*-1.5,y:y+uy*textWidth+ny*-1.5},{x:x+nx*6,y:y+ny*6},{x:x+ux*textWidth+nx*6,y:y+uy*textWidth+ny*6}];
  const left=Math.min(...corners.map(p=>p.x)),right=Math.max(...corners.map(p=>p.x)),bottom=Math.min(...corners.map(p=>p.y)),top=Math.max(...corners.map(p=>p.y));
  return {x,y,angle:angle*180/Math.PI,collisions:obstacles.filter(b=>right>b.left&&left<b.right&&top>b.bottom&&bottom<b.top).length};
 });
 const {collisions,...result}=candidates.sort((a,b)=>a.collisions-b.collisions)[0];return result;
}
