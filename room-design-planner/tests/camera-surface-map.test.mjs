import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Group,Mesh,BoxGeometry,MeshStandardMaterial,Color,PerspectiveCamera} from 'three';
import {captureSurfaceMap} from '../camera-surface-map.mjs';

function fixture(fail=false){
 const scene=new Scene(), wall=new Mesh(new BoxGeometry(),new MeshStandardMaterial({color:'#e8e0d2'}));
 wall.userData.roomDesignFinishWallId='wall-light';scene.add(wall);
 const furniture=new Mesh(new BoxGeometry(),new MeshStandardMaterial({color:'#222222'}));scene.add(furniture);
 const hidden=new Group();hidden.visible=false;
 hidden.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial({color:'#000000'})));scene.add(hidden);
 const originalTarget={name:'existing'},clear=new Color('#aabbcc');let target=originalTarget;
 const renderer={domElement:{width:4,height:2},autoClear:false,
  getRenderTarget:()=>target,setRenderTarget:value=>{target=value;},
  getClearColor:out=>out.copy(clear),getClearAlpha:()=>.5,setClearColor:()=>{},clear:()=>{},
  render:()=>{if(fail)throw Error('GPU failure');},
  readRenderTargetPixels:(_target,_x,_y,w,h,pixels)=>{
   for(let i=0;i<w*h;i++)pixels.set([0x9e,0x37,0x79,255],i*4);
  }};
 return {renderer,scene,wall,furniture,originalTarget};
}
const documentStub={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},drawImage(){},
 createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}}),toDataURL:()=> 'data:image/png;base64,AA=='})};

test('only depth-pass-visible materials become references; occluded furniture and hidden ancestors do not',async()=>{
 const before=globalThis.document;globalThis.document=documentStub;
 try{
  const {renderer,scene,wall,furniture,originalTarget}=fixture();
  const wallMaterial=wall.material,furnitureMaterial=furniture.material;
  const result=await captureSurfaceMap(renderer,scene,new PerspectiveCamera(),{nodes:new Map()});
  assert.equal(result.samples.length,1);assert.equal(result.surfaces.length,1);
  assert.equal(result.surfaces[0].ownerId,'wall-light');assert.equal(result.surfaces[0].baseColour,'#e8e0d2');
  assert.deepEqual(result.surfaces[0].screenBounds,[0,0,1,1]);
  assert.equal(wall.material,wallMaterial);assert.equal(furniture.material,furnitureMaterial);
  assert.equal(renderer.getRenderTarget(),originalTarget);assert.equal(renderer.autoClear,false);
 }finally{globalThis.document=before;}
});

test('failed ID pass restores original materials, render target and scene before propagating error',async()=>{
 const {renderer,scene,wall,originalTarget}=fixture(true),material=wall.material;
 scene.background=new Color('#eeeeee');const background=scene.background;
 await assert.rejects(()=>captureSurfaceMap(renderer,scene,new PerspectiveCamera(),{nodes:new Map()}),/GPU failure/);
 assert.equal(wall.material,material);assert.equal(scene.background,background);
 assert.equal(renderer.getRenderTarget(),originalTarget);assert.equal(renderer.autoClear,false);
});

test('supports asynchronous pixel readback and restores the scene before awaiting the GPU',async()=>{
 const previousDocument=globalThis.document;globalThis.document=documentStub;
 try{
  const {renderer,scene,wall,originalTarget}=fixture(),material=wall.material;
  delete renderer.readRenderTargetPixels;
  let resolveRead;
  renderer.readRenderTargetPixelsAsync=()=>new Promise(resolve=>{resolveRead=resolve;});
  const pending=captureSurfaceMap(renderer,scene,new PerspectiveCamera(),{nodes:new Map()});
  assert.equal(wall.material,material);assert.equal(renderer.getRenderTarget(),originalTarget);
  const pixels=new Uint8Array(4*2*4);for(let i=0;i<8;i++)pixels.set([0x9e,0x37,0x79,255],i*4);
  resolveRead(pixels);const result=await pending;
  assert.equal(result.surfaces[0].ownerId,'wall-light');assert.equal(result.samples.length,1);
 }finally{globalThis.document=previousDocument;}
});

test('native WebGPU rows retain top-down orientation and strip 256-byte padding',async()=>{
 const {surfacePixelRows}=await import('../camera-surface-map.mjs');const pixels=new Uint8Array(264);
 pixels.set([10,20,30,255,40,50,60,255],0);pixels.set([70,80,90,255,100,110,120,255],256);
 assert.deepEqual([...surfacePixelRows(pixels,2,2,true)],[10,20,30,255,40,50,60,255,70,80,90,255,100,110,120,255]);
 assert.throws(()=>surfacePixelRows(new Uint8Array(16),2,2,true),/Incomplete/);
});

test('WebGL rows are flipped once to match screenshot top-down coordinates',async()=>{
 const {surfacePixelRows}=await import('../camera-surface-map.mjs');
 assert.deepEqual([...surfacePixelRows(new Uint8Array([1,2,3,255,4,5,6,255]),1,2)],[4,5,6,255,1,2,3,255]);
});
