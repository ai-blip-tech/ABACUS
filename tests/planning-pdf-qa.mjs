// Standalone print fixture only. Never connects to an application database.
import {register} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
register('./planning-pdf-json-loader.mjs',import.meta.url);
const {planningPDF}=await import('../lib/planning-plan/print.ts');
const {manualPlanning}=await import('../lib/planning-plan/model.ts');
const {newFurniture}=await import('../lib/planning-plan/furniture.ts');
const doc=manualPlanning().plan;
doc.walls=[[[0,0],[6000,0]],[[6000,0],[6000,4000]],[[6000,4000],[0,4000]],[[0,4000],[0,0]]].map(([a,b],i)=>({id:'qa_wall_'+i,name:'Стена '+(i+1),a,b,thickness:150,height:2800,group:'outer',lengthConfirmed:false,thicknessConfirmed:false,provenance:'isolated print fixture'}));
doc.floor=[[0,0],[6000,0],[6000,4000],[0,4000]];
doc.dimensions=[{id:'qa_dimension',a:[0,4300],b:[6000,4300]}];
doc.openings=[{id:'qa_door',wallId:'qa_wall_2',kind:'door',offset:3000,width:900,height:2100,sill:0,confirmed:false}];
doc.furniture=[newFurniture('bed',[1300,1300]),{...newFurniture('sofa',[4700,1200]),rotation:90},newFurniture('table',[3500,3000])];
const output='/private/tmp/planning-ui-backup-9yfyPa/print-qa';await mkdir(output,{recursive:true});
await writeFile(output+'/planning-qa.pdf',await planningPDF(doc,'Проверка печати — тестовый проект'));
console.log(output+'/planning-qa.pdf');
