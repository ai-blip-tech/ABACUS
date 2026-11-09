import type {BoardView} from './model';
type Rect={x:number;y:number;width:number;height:number};
/** Include the permanent furniture launcher in the same frame as the visible cards. */
export function frameWorkspace(items:Rect[],width:number,height:number):BoardView{
 if(!items.length||width<=0||height<=0)return{x:0,y:0,scale:1};
 const padding=70,left=Math.min(...items.map(n=>n.x))-padding,top=Math.min(...items.map(n=>n.y))-padding;
 const spanX=Math.max(...items.map(n=>n.x+n.width))+padding-left,spanY=Math.max(...items.map(n=>n.y+n.height))+padding-top;
 const scale=Math.min(1,width/spanX,height/spanY);
 return{x:(width-spanX*scale)/2-left*scale,y:(height-spanY*scale)/2-top*scale,scale};
}
