import test from 'node:test';
import assert from 'node:assert/strict';
import {traceRasterOutlines} from '../app/measured-plan/editor/measure-raster-traces.ts';
import {withAutomaticFloor} from '../lib/measured-plan/measure-auto-floor.ts';
import {detectedRooms} from '../lib/measured-plan/measure-rooms.ts';
import {blankDoc,type Wall} from '../lib/measured-plan/measure-model.ts';
test('long strokes on a warm photographed page survive slight skew; a real gap remains',()=>{
 const width=600,height=600,data=new Uint8ClampedArray(width*height*4);for(let i=0;i<width*height;i++)data.set([180,164,132,255],i*4);
 for(const base of [60,180,300,420])for(let y=20;y<580;y++){if(y>=260&&y<310)continue;const x=Math.round(base+y*.02);for(let dx=0;dx<4;dx++)data.set([60,43,25,255],(y*width+x+dx)*4);}
 const r=traceRasterOutlines(data,width,height);assert.equal(r.skewed,true);assert.equal(r.segments.length,8);assert.ok(r.segments.every(s=>s.b[1]<=260||s.a[1]>=310));
});
test('cropped raster keeps genuinely closed rooms without filling the open part',()=>{
 const source={name:'photo',mime:'image/png',hash:'test',width:600,height:600,page:1,pages:1,method:'raster-estimated',image:'/test',words:[],pixelScale:1};
 const doc=blankDoc(source);doc.walls=([[0,0,4000,0],[4000,0,4000,3000],[4000,3000,0,3000],[0,3000,0,0],[0,0,0,-5000]] as number[][]).map(([x,y,x1,y1],i):Wall=>({id:'scan-'+i,name:'wall',a:[x,y],b:[x1,y1],thickness:100,height:null,group:'inner',thicknessConfirmed:false,lengthConfirmed:false,provenance:'test'}));
 const result=withAutomaticFloor(doc);const rooms=detectedRooms(result);assert.equal(rooms.length,1);assert.ok(rooms[0].squareMetres>11&&rooms[0].squareMetres<12);assert.equal(result.floorConfirmed,false);assert.equal(doc.floor.length,0);
 doc.walls.splice(2,1);assert.equal(withAutomaticFloor(doc).floor.length,0,'Open lines must not become an invented rectangle');
});
