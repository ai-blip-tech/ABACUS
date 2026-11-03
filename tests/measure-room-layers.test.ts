import test from 'node:test';
import assert from 'node:assert/strict';
import {detectedRooms,renameDetectedRoom} from '../lib/measured-plan/measure-rooms.ts';
import {resizeOpeningFromSide,snapOpeningOffset} from '../lib/measured-plan/measure-opening-guides.ts';
import {setWallThicknessFromReference} from '../lib/measured-plan/measure-wall-editing.ts';
import type {MeasureDoc,Wall} from '../lib/measured-plan/measure-model.ts';

const wall=(id:string,a:[number,number],b:[number,number],thickness=200):Wall=>({id,name:id,a,b,thickness,thicknessConfirmed:true,lengthConfirmed:true,height:2700,group:id==='divider'?'inner':'outer',provenance:'test'});
function document():MeasureDoc{return{schemaVersion:1,id:'rooms',name:'rooms',source:{name:'',mime:'image/png',hash:'',width:1,height:1,page:1,pages:1,method:'test',image:'',words:[],pixelScale:1},walls:[wall('north',[0,0],[4000,0]),wall('east',[4000,0],[4000,3000]),wall('south',[4000,3000],[0,3000]),wall('west',[0,3000],[0,0]),wall('divider',[2000,0],[2000,3000],100)],openings:[],floor:[[0,0],[4000,0],[4000,3000],[0,3000]],floorConfirmed:false,scaleConfirmed:true,calibration:null,height:2700,heightMode:'uniform',zones:[],geometryReviewed:true,drawingReviewed:true,conflictNotes:{},updatedAt:''};}

test('detects separate clean rooms and preserves a room name after geometry moves',()=>{
 const doc=document(),rooms=detectedRooms(doc);assert.equal(rooms.length,2);assert.ok(rooms.every(room=>room.squareMetres>5&&room.squareMetres<6));
 const named=renameDetectedRoom(doc,rooms[0],'Спальня');named.walls.find(w=>w.id==='divider')!.a[0]=2100;named.walls.find(w=>w.id==='divider')!.b[0]=2100;
 assert.equal(detectedRooms(named).find(room=>room.name==='Спальня')?.name,'Спальня');
});

test('subtracts an independent column from clean room area',()=>{
 const doc=document(),before=detectedRooms(doc).reduce((sum,room)=>sum+room.squareMetres,0);doc.columns=[{id:'column',name:'К1',a:[300,300],width:400,depth:400,height:2700,confirmed:true,structuralStatus:'bearing',provenance:'test'}];
 const after=detectedRooms(doc).reduce((sum,room)=>sum+room.squareMetres,0);assert.ok(Math.abs((before-after)-.16)<.01);
});

test('snaps openings to a balanced position and keeps selected edge while resizing',()=>{
 const doc=document(),host=doc.walls[0];doc.openings=[{id:'door',wallId:host.id,kind:'door',offset:1940,width:900,height:2100,sill:0,confirmed:true}];
 assert.equal(snapOpeningOffset(doc,doc.openings[0],1940,80),2000);
 const resized=resizeOpeningFromSide(doc,'door',1000,'start').openings[0];assert.equal(resized.offset-resized.width/2,1490);
});

test('keeps the chosen wall face fixed when thickness changes',()=>{
 const doc=document(),target=doc.walls[0];target.referenceLine='outside';const before=target.a[1]+target.thickness/2,next=setWallThicknessFromReference(doc,target.id,400).walls[0];
 assert.equal(next.a[1]+next.thickness/2,before);
 assert.equal(next.thickness,400);
});
