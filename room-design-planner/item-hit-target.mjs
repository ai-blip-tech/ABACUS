import {generatedPointerHook} from './generated-pointer-hook.mjs';
import {readFile} from 'node:fs/promises';
// Generated GLBs may have deeply transformed meshes. Give the item body a
// predictable invisible hit volume, independent of mesh hierarchy/materials.
export function itemHitTransform(code){
 const anchor='const content = (_jsx("group", { position: node.position';
 const body='children: [_jsx(ModelWithRetry, { node: node, setSettled: setSettled }';
 if(!code.includes(anchor)||!code.includes(body))throw Error('Pascal item renderer contract changed');
 const component=`const RoomDesignHitTarget = ({node}) => {
 useRoomDesignPointer(node.id);
 const handlers = useNodeEvents(node, 'item');
 const d = getScaledDimensions(node);
 const selected = useViewer(s=>s.selection.selectedIds.includes(node.id));
 const [active,setActive]=useState(false);
 useEffect(()=>{const update=e=>setActive(e.detail.id===node.id);window.addEventListener('roomdesign:rotation-mode',update);return()=>window.removeEventListener('roomdesign:rotation-mode',update);},[node.id]);
 return _jsxs(_Fragment,{children:[_jsxs('mesh', {...handlers, position: [0,d[1]/2,0], children: [
 _jsx('boxGeometry', {args:d}),
 _jsx('meshBasicMaterial', {transparent:true,opacity:0,depthWrite:false,colorWrite:false})]}),selected&&_jsx(RDHtml,{position:[d[0]/2+.18,Math.min(d[1]/2,.45),d[2]/2+.18],center:true,children:_jsx('button',{'aria-label':'Повернуть предмет','aria-pressed':active,title:'Поворот: движение курсора или ← → по 10°. Клик / Enter — закончить. Esc — отменить.',type:'button',style:{width:40,height:40,borderRadius:'50%',border:'1px solid #8b122b',background:active?'#8b122b':'#fffdf9',color:active?'white':'#8b122b',fontSize:27,cursor:'ew-resize',pointerEvents:'auto'},onPointerDown:e=>e.stopPropagation(),onPointerUp:e=>e.stopPropagation(),onClick:e=>{e.stopPropagation();roomDesignSend('rotation-toggle',{id:node.id,x:e.clientX});},children:'↻'})})]});
};\n`;
 return "import {Raycaster as RDRaycaster,Vector2 as RDVector2,Vector3 as RDVector3,Plane as RDPlane,Box3 as RDBox3} from 'three';\nimport {Html as RDHtml} from '@react-three/drei';\n"+generatedPointerHook+component+code.replace(body,"children: [!node.asset.attachTo && !node.metadata?.column ? _jsx(RoomDesignHitTarget, {node}) : null, _jsx(ModelWithRetry, { node: node, setSettled: setSettled }");
}
export function itemBatchTransform(code){const anchor='excluded: (node) => Boolean(node.asset?';if(!code.includes(anchor))throw Error('Pascal item batching contract changed');return code.replace(anchor,'excluded: (node) => Boolean(node.metadata?.roomDesignModelAsset) || Boolean(node.asset?');}
export function floorHandleTransform(code){const anchor='return [itemRotateHandle(), itemMoveHandle()];';if(!code.includes(anchor))throw Error('Pascal item handles contract changed');return code.replace(anchor,'return []; // Room Design: accessible latched rotation handle');}
const matches=p=>p.replaceAll('\\','/').endsWith('/item/renderer.js');
export function itemHitPrebundle(){return{name:'roomdesign-generated-item-hit',setup(build){build.onLoad({filter:/[/\\]item[/\\]definition\.js$/},async args=>({contents:floorHandleTransform(await readFile(args.path,'utf8')),loader:'js'}));build.onLoad({filter:/[/\\]node-batch[/\\]batchable\.js$/},async args=>({contents:itemBatchTransform(await readFile(args.path,'utf8')),loader:'js'}));build.onLoad({filter:/[/\\]item[/\\]renderer\.js$/},async args=>({contents:itemHitTransform(await readFile(args.path,'utf8')),loader:'js'}));}};}
export default function itemHitPlugin(){return{name:'roomdesign-generated-item-hit',enforce:'pre',transform(code,id){if(id.split('?')[0].endsWith('/item/definition.js'))return{code:floorHandleTransform(code),map:null};if(id.split('?')[0].endsWith('/node-batch/batchable.js'))return{code:itemBatchTransform(code),map:null};if(matches(id.split('?')[0]))return{code:itemHitTransform(code),map:null};}};}
