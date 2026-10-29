/** Shared with the original Interior Creation panel; dimensions are editable templates in mm. */
export const interiorFurnitureTemplates = [
 {kind:'sofa',name:'Диван',width:2200,depth:950},
 {kind:'table',name:'Стол обеденный',width:1600,depth:900},
 {kind:'table',name:'Стол журнальный',width:1100,depth:650},
 {kind:'table',name:'Стол письменный и туалетный',width:1200,depth:600},
 {kind:'chair',name:'Кресло',width:800,depth:800},
 {kind:'stool',name:'Стул',width:480,depth:480},
 {kind:'stool',name:'Пуф',width:600,depth:600},
 {kind:'rug',name:'Ковер',width:2000,depth:1400},
 {kind:'bed',name:'Кровать',width:2000,depth:1600},
 {kind:'cabinet',name:'Шкаф',width:1100,depth:550},
 {kind:'cabinet',name:'Стеллаж',width:1200,depth:400},
 {kind:'lamp',name:'Светильник',width:400,depth:400},
 {kind:'decor',name:'Декор для дома',width:500,depth:300},
 {kind:'plant',name:'Растение',width:550,depth:550},
 {kind:'dresser',name:'Комод',width:1200,depth:450},
 {kind:'nightstand',name:'Прикроватная тумба',width:500,depth:400},
 {kind:'tv_stand',name:'TV-тумба',width:1600,depth:450},
] as const;
export type InteriorFurnitureTemplate = (typeof interiorFurnitureTemplates)[number];
