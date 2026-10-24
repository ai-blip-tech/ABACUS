import test from 'node:test';
import assert from 'node:assert/strict';
import {detectWalls} from '../app/measured-plan/editor/measure-raster.ts';
import {detectRasterDoors} from '../app/measured-plan/editor/measure-raster-openings.ts';
type P=[number,number];
function canvas(){const width=600,height=600,data=new Uint8ClampedArray(width*height*4).fill(255);const dot=(x:number,y:number,gray=60,r=1)=>{for(let yy=Math.round(y)-r;yy<=Math.round(y)+r;yy++)for(let xx=Math.round(x)-r;xx<=Math.round(x)+r;xx++){if(xx<0||yy<0||xx>=width||yy>=height)continue;const i=(yy*width+xx)*4;data[i]=data[i+1]=data[i+2]=gray;}};const line=(a:P,b:P,r=1,gray=60)=>{const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));for(let i=0;i<=n;i++)dot(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n,gray,r);};return{width,height,data,dot,line};}
test('short perpendicular returns attached to a wall survive while isolated short noise does not',()=>{const c=canvas();c.line([300,280],[520,280],3);c.line([300,250],[300,280],3);c.line([100,100],[100,130],3);const walls=detectWalls(c.data,c.width,c.height);assert.ok(walls.some(w=>w.a[0]===w.b[0]&&Math.abs(w.a[0]-300)<5&&w.a[1]<=250&&w.b[1]>=280));assert.ok(!walls.some(w=>Math.abs(w.a[0]-100)<5));});
for(const axis of [0,1])for(const hingeEnd of [false,true])for(const side of [-1,1])test(`arc door orientation axis=${axis} end=${hingeEnd} side=${side}`,()=>{
 const c=canvas(),p=(t:number):P=>axis===0?[t,300]:[300,t],walls=[{a:p(70),b:p(200),thickness:8},{a:p(280),b:p(470),thickness:8}],hinge=p(hingeEnd?280:200),u:P=axis===0?[hingeEnd?-1:1,0]:[0,hingeEnd?-1:1],n:P=axis===0?[0,side]:[-side,0];
 for(const w of walls)c.line(w.a,w.b,3);c.line(hinge,[hinge[0]+n[0]*80,hinge[1]+n[1]*80],1);
 for(let a=0;a<=Math.PI/2;a+=.006)c.dot(hinge[0]+u[0]*80*Math.cos(a)+n[0]*80*Math.sin(a),hinge[1]+u[1]*80*Math.cos(a)+n[1]*80*Math.sin(a),185,0);
 const result=detectRasterDoors(c.data,c.width,c.height,walls);assert.equal(result.doors.length,1);assert.equal(result.walls.length,1);assert.equal(result.doors[0].width,80);assert.equal(result.doors[0].hingesSide,hingeEnd?'right':'left');assert.equal(result.doors[0].swingDirection,side===1?'inward':'outward');assert.equal(result.doors[0].offset,170);
});
test('a gap and a leaf without an arc are not declared a recognized swinging door',()=>{const c=canvas(),walls=[{a:[100,200] as P,b:[200,200] as P,thickness:8},{a:[280,200] as P,b:[450,200] as P,thickness:8}];for(const w of walls)c.line(w.a,w.b,3);c.line([200,200],[200,280],1);assert.equal(detectRasterDoors(c.data,c.width,c.height,walls).doors.length,0);});
test('an arc without the open leaf does not pass recognition',()=>{const c=canvas(),walls=[{a:[100,200] as P,b:[200,200] as P,thickness:8},{a:[280,200] as P,b:[450,200] as P,thickness:8}];for(const w of walls)c.line(w.a,w.b,3);for(let a=0;a<=Math.PI/2;a+=.006)c.dot(200+80*Math.cos(a),200+80*Math.sin(a),185,0);assert.equal(detectRasterDoors(c.data,c.width,c.height,walls).doors.length,0);});
