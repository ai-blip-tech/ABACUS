// Injected beside Pascal's item renderer. Uses that renderer's own R3F canvas
// and camera, so an imported asset can be picked independently of GLB nesting.
export const generatedPointerHook = String.raw`
const roomDesignPickers = new WeakMap();
const roomDesignSend = (type,data={}) => window.dispatchEvent(new CustomEvent('roomdesign:item-interaction',{detail:{type,...data}}));
function useRoomDesignPointer(id) {
 const state = useThree();
 useEffect(() => {
  const canvas = state.gl.domElement;
  let picker = roomDesignPickers.get(canvas);
  if (!picker) {
   const ids = new Set(), ray = new RDRaycaster(), ndc = new RDVector2();
   const ground = new RDPlane(new RDVector3(0,1,0),0);
   let drag = null, hovered = null;
   const updateRay = e => {
    const rect = canvas.getBoundingClientRect();
    ndc.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    ray.setFromCamera(ndc,state.camera);
   };
   const pick = e => {
    updateRay(e);let best = null;
    for (const itemId of ids) {
     const node = useScene.getState().nodes[itemId], root = sceneRegistry.nodes.get(itemId);
     if (!node || !root || node.visible === false) continue;
     root.updateWorldMatrix(true,true);
     const box = new RDBox3().setFromObject(root), point = new RDVector3();
     if (!ray.ray.intersectBox(box,point)) continue;
     const distance = point.distanceTo(ray.ray.origin);
     if (!best || distance < best.distance) best = {id:itemId,node,root,point,distance};
    }
    return best;
   };
   const stop = e => {e.preventDefault();e.stopImmediatePropagation();};
   const select = id => roomDesignSend('select',{id});
   const down = e => {
    if (e.target !== canvas || (e.button !== 0 && e.button !== 2) || e.altKey || e.metaKey || e.ctrlKey) return;
    const hit = pick(e);if (!hit) return;
    stop(e);select(hit.id);
    if (e.button === 2) return;
    ground.constant = -hit.node.position[1];
    const start = new RDVector3();
    if (!ray.ray.intersectPlane(ground,start)) return;
    drag = {id:hit.id,start,position:[...hit.node.position],pointerId:e.pointerId};
    roomDesignSend('dragging',{value:true});
    canvas.setPointerCapture(e.pointerId);
   };
   const move = e => {
    if (drag) {
     stop(e);updateRay(e);const point=new RDVector3();
     if (ray.ray.intersectPlane(ground,point)) {
      const delta=point.sub(drag.start);
      roomDesignSend('move',{id:drag.id,position:[drag.position[0]+delta.x,drag.position[1],drag.position[2]+delta.z]});
     }
     return;
    }
    if(e.buttons) return;
    const hit=pick(e);
    if(hit){stop(e);hovered=hit.id;roomDesignSend('hover',{id:hit.id});canvas.style.cursor='grab';}
    else if(hovered){roomDesignSend('hover',{id:null});hovered=null;canvas.style.cursor='';}
   };
   const up = e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    stop(e);const pointerId=drag.pointerId, selectedId=drag.id;drag=null;
    if(canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId);
    queueMicrotask(()=>{roomDesignSend('dragging',{value:false});select(selectedId);});canvas.style.cursor='grab';
   };
   const cancel = () => {drag=null;roomDesignSend('dragging',{value:false});};
   const context = e => {
    if(e.target!==canvas)return;const hit=pick(e);if(!hit)return;
    stop(e);select(hit.id);
    roomDesignSend('menu',{id:hit.id});
   };
   canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);
   canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',cancel,true);
   canvas.addEventListener('contextmenu',context,true);window.addEventListener('blur',cancel);
   picker={ids,dispose:()=>{canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move,true);canvas.removeEventListener('pointerup',up,true);canvas.removeEventListener('pointercancel',cancel,true);canvas.removeEventListener('contextmenu',context,true);window.removeEventListener('blur',cancel);cancel();}};
   roomDesignPickers.set(canvas,picker);
  }
  picker.ids.add(id);
  return()=>{picker.ids.delete(id);queueMicrotask(()=>{if(!picker.ids.size){picker.dispose();roomDesignPickers.delete(canvas);}})};
 },[id,state.gl]);
}
`;
