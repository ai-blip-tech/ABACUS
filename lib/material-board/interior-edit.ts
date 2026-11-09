import type {MaterialNode} from './model';
export function interiorEditPayload(scene:MaterialNode,command:MaterialNode,point=scene.editPoint){
 if(!scene.scene)throw Error('Выберите изображение интерьера.');
 const base={operation:'global_edit',prompt:'',roomImage:'',projectId:undefined as string|undefined};
 if(command.kind==='note'){
  const text=command.text?.trim();if(!text)throw Error('Сначала напишите изменение на стикере.');
  return {...base,globalEdit:{instruction:text},prompt:text};
 }
 if(!point||![point.x,point.y].every(v=>Number.isFinite(v)&&v>=0&&v<=100))throw Error('Сначала поставьте точку на изображении.');
 const material=command.kind==='colour'||command.kind==='material'||scene.editAction==='material';
 const furnitureReference={name:command.title,widthMm:command.widthMm,depthMm:command.depthMm,heightMm:command.heightMm};
 if(!material&&!command.catalogId&&![command.widthMm,command.depthMm,command.heightMm].every(v=>typeof v==='number'&&v>0))throw Error('Укажите ширину, глубину и высоту референса в миллиметрах.');
 const instruction=material?`Change only the material/colour of the complete existing object containing the marked point. Target: ${command.title}${command.colour?'; screen colour '+command.colour:''}. Preserve its geometry, seams, texture relief and all unrelated objects.`:`${scene.editAction==='add'?'Add exactly one':'Replace only the existing marked object with exactly one'} ${command.title}. Copy only the reference product, not its background. Preserve its identity, proportions and details. Match room scale, perspective, contact shadows and illumination.`;
 return {...base,operation:material?'material':scene.editAction==='add'?'place':'replace',prompt:instruction,pointEdit:{x:point.x,y:point.y,markedImage:''},referenceImage:'',furnitureReference,...(material?{material:{instruction}}:scene.editAction==='add'?{placement:{x:point.x,y:point.y},product:command.title}:{replacement:{name:command.title}})};
}
