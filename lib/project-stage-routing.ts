export const projectStages=[
 {id:'sources',label:'Обмерный план',path:'/measured-plan'},
 {id:'installation',label:'Монтаж, демонтаж',path:'/partition-plan'},
 {id:'planning',label:'Планировочное решение',path:'/planning-plan'},
 {id:'materials',label:'Концепция и материалы',path:'/materials-concept'},
 {id:'interior',label:'Интерьер и меблировка',path:'/interior-editor'},
 {id:'lighting',label:'Технический свет',path:'/technical-lighting'},
 {id:'bathroom',label:'Санузел',path:null},
 {id:'porcelain',label:'Керамогранит',path:null},
 {id:'documentation',label:'Документация',path:null},
];
export function projectStageFrameUrl(stageId:string,projectId:string){
 const stage=projectStages.find(s=>s.id===stageId);if(!stage?.path)return null;
 const url=new URL(stage.path,'https://roomdesign.invalid');url.searchParams.set('project',projectId);url.searchParams.set('embeddedStage','1');
 if(stage.id==='interior'){url.searchParams.set('studioPreview','unified');url.searchParams.set('studioMode','image');}
 return url.pathname+url.search;
}
