import type {MaterialNode} from './model.ts';

const renderId=/^[a-f0-9-]{36}$/;
export function plannerRenderTray(payload:unknown,projectId:string):{nodes:MaterialNode[];hidden:string[]}{
 const data=payload as {items?:unknown[];trash?:unknown[]};
 const nodes:MaterialNode[]=[],prefix='/api/projects/'+projectId+'/assets/';
 for(const item of Array.isArray(data?.items)?data.items:[]){
  const row=item as {id:string;status:string;image:string;created_at:string};
  if(!row||!renderId.test(row.id)||row.status!=='ready'||typeof row.image!=='string'||!row.image.startsWith(prefix)||!/^visual-render-[a-zA-Z0-9-]{1,80}$/.test(row.image.slice(prefix.length)))continue;
  nodes.push({id:'planner-render-'+row.id,kind:'reference',title:'Рендер планировки',image:row.image,originalImage:row.image,x:0,y:0,width:450,height:300,generated:true,trayOnly:true,resultType:'interior-render',trayOrder:Date.parse(row.created_at)||0});
 }
 const hidden=(Array.isArray(data?.trash)?data.trash:[]).flatMap(item=>{const row=item as {id:string};return row&&renderId.test(row.id)?['planner-render-'+row.id]:[];});
 return{nodes,hidden};
}

/** Server render history is separate from editable sheets and their unsaved drafts. */
export function withPlannerRenderTray(nodes:MaterialNode[],renders:MaterialNode[],hidden:string[]=[]):MaterialNode[]{
 const removed=new Set(hidden),items=new Map<string,MaterialNode>();
 for(const node of [...nodes,...renders])if(!removed.has(node.id)&&!items.has(node.id))items.set(node.id,node);
 return [...items.values()].sort((a,b)=>Number(Boolean(b.generated||b.resultType))-Number(Boolean(a.generated||a.resultType))||(b.trayOrder??0)-(a.trayOrder??0));
}
