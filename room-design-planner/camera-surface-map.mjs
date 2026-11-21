import {Color, MeshBasicMaterial, WebGLRenderTarget, NoColorSpace, NearestFilter} from 'three';

export function surfacePixelRows(pixels,width,height,nativeGPU=false){
  const rowBytes=width*4,stride=nativeGPU?Math.ceil(rowBytes/256)*256:rowBytes;
  if(pixels.length<(height-1)*stride+rowBytes)throw Error('Incomplete camera surface map');
  const result=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++){
    const source=(nativeGPU?y:height-1-y)*stride;
    result.set(pixels.subarray(source,source+rowBytes),y*rowBytes);
  }
  return result;
}

// A depth-tested ID pass ties references to pixels actually visible in this camera.
// It also handles finishes whose interactive raycast is intentionally disabled.
export async function captureSurfaceMap(renderer, scene, camera, registry) {
  const width = Math.min(1024, renderer.domElement.width);
  const height = Math.max(1, Math.round(width * renderer.domElement.height / renderer.domElement.width));
  const target = new WebGLRenderTarget(width, height, {minFilter:NearestFilter, magFilter:NearestFilter});
  target.texture.colorSpace = NoColorSpace;
  const previous = {target:renderer.getRenderTarget(), background:scene.background,
    override:scene.overrideMaterial, clear:renderer.getClearColor(new Color()).clone(),
    alpha:renderer.getClearAlpha(), autoClear:renderer.autoClear};
  const saved = [], temporary = [], groups = new Map(), colours = new Map();
  const owners = new Map();
  for (const [id, object] of registry?.nodes || []) if (object) owners.set(object, id);
  const ownerOf = object => {
    for (let parent=object; parent; parent=parent.parent) {
      const data=parent.userData || {};
      if (data.floorRegionId) return {kind:'floor', ownerId:data.floorRegionId};
      if (data.roomDesignFinishWallId) return {kind:'wall', ownerId:data.roomDesignFinishWallId};
      if (owners.has(parent)) return {kind:'scene-node', ownerId:owners.get(parent)};
    }
    return {kind:'scene-surface', ownerId:object.uuid};
  };
  let pixels, readback;
  try {
    scene.traverseVisible(object => {
      if (!object.isMesh || !object.material) return;
      const original=object.material, owner=ownerOf(object);
      const replace=material => {
        const key=JSON.stringify([owner.ownerId,material.map?.source?.uuid,material.color?.getHexString(),material.opacity,material.roughness,material.metalness]);
        let group=groups.get(key);
        if (!group) {
          const index=groups.size+1, colour=(index*0x9e3779)&0xffffff;
          group={...owner,id:'camera-surface-'+index,maskHex:'#'+colour.toString(16).padStart(6,'0'),
            name:object.name||material.name||owner.kind, colour:material.color?'#'+material.color.getHexString():null,
            material, pixels:0, bounds:[width,height,0,0]};
          groups.set(key,group);colours.set(colour,group);
        }
        const rgb=parseInt(group.maskHex.slice(1),16);
        const flat=new MeshBasicMaterial({color:new Color().setRGB(((rgb>>16)&255)/255,((rgb>>8)&255)/255,(rgb&255)/255),
          side:material.side, depthTest:material.depthTest, depthWrite:material.depthWrite,
          polygonOffset:material.polygonOffset, polygonOffsetFactor:material.polygonOffsetFactor,
          polygonOffsetUnits:material.polygonOffsetUnits, clippingPlanes:material.clippingPlanes,
          clipIntersection:material.clipIntersection, alphaMap:material.alphaMap,
          alphaTest:material.alphaTest, visible:material.visible, toneMapped:false});
        temporary.push(flat);return flat;
      };
      saved.push([object,original]);object.material=Array.isArray(original)?original.map(replace):replace(original);
    });
    scene.background=null;scene.overrideMaterial=null;renderer.autoClear=true;
    renderer.setClearColor(0x000000,1);renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);
    if(renderer.readRenderTargetPixels){pixels=new Uint8Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);}
    else readback=renderer.readRenderTargetPixelsAsync(target,0,0,width,height);
  } finally {
    for (const [object, material] of saved) object.material=material;
    scene.background=previous.background;scene.overrideMaterial=previous.override;renderer.autoClear=previous.autoClear;
    renderer.setClearColor(previous.clear,previous.alpha);renderer.setRenderTarget(previous.target);
    for (const material of temporary) material.dispose();
    if(!readback)target.dispose();
  }
  if(readback){try{pixels=await readback;}finally{target.dispose();}}
  pixels=surfacePixelRows(pixels,width,height,Boolean(renderer.backend?.isWebGPUBackend));
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const offset=(y*width+x)*4;
    const group=colours.get((pixels[offset]<<16)|(pixels[offset+1]<<8)|pixels[offset+2]);
    if(!group)continue;
    group.pixels++;const b=group.bounds;b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x+1);b[3]=Math.max(b[3],y+1);
  }
  const visible=[...groups.values()].filter(g=>g.pixels>0).sort((a,b)=>b.pixels-a.pixels);
  const samples=[],surfaces=visible.map((g,index)=>{
    const material=g.material, source=material.map?.image;
    // Keep the existing 48-sample budget, ranked by actual visible coverage.
    if(index<48) {
      const canvas=document.createElement('canvas'),w=source?.width||1,h=source?.height||1,scale=Math.min(1,512/Math.max(w,h));
      canvas.width=source?Math.max(1,Math.round(w*scale)):64;canvas.height=source?Math.max(1,Math.round(h*scale)):64;
      const c=canvas.getContext('2d');
      try {
        if(source){c.drawImage(source,0,0,canvas.width,canvas.height);c.globalCompositeOperation='multiply';}
        c.fillStyle=g.colour||'#ffffff';c.fillRect(0,0,canvas.width,canvas.height);
        samples.push({id:g.id,name:g.name,maskHex:g.maskHex,image:canvas.toDataURL('image/png')});
      } catch { /* The screenshot still authoritatively describes inaccessible maps. */ }
    }
    return {id:g.id,kind:g.kind,ownerId:g.ownerId,name:g.name,maskHex:g.maskHex,baseColour:g.colour,
      screenBounds:g.bounds.map((v,i)=>Number((v/(i%2?height:width)).toFixed(4))),
      coverage:Number((g.pixels/(width*height)).toFixed(4)),hasSample:samples.some(s=>s.id===g.id)};
  });
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const c=canvas.getContext('2d'),image=c.createImageData(width,height);
  image.data.set(pixels);
  c.putImageData(image,0,0);
  return {image:canvas.toDataURL('image/png'),surfaces,samples};
}
