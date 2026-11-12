import assert from 'node:assert/strict';
import test from 'node:test';
import {materialProposalSnapshot} from '../lib/material-board/proposal.ts';

const node=(id,kind,title,image,extra={})=>({id,kind,title,image,x:100,y:100,width:220,height:220,...extra});

test('materials proposal keeps product specification and the complete material-edit lineage',()=>{
 const product=node('sofa','product','Диван DORADO','source.jpg',{catalogId:'dorado',brand:'NORR'});
 const fabric=node('fabric','material','Ткань букле','fabric.jpg');
 const variant=node('variant','reference','Диван DORADO · Ткань букле','variant.jpg',{generated:true,trayOnly:true,trayOrder:10,resultType:'material-variant',catalogId:'dorado',brand:'NORR'});
 const interior=node('interior','reference','Итоговый интерьер','room.jpg',{generated:true,trayOnly:true,trayOrder:20,resultType:'interior-render'});
 const workbook={version:2,activeSheetId:'sheet-1',sheets:[{id:'sheet-1',name:'Лист 1',board:{version:1,nodes:[product,fabric,variant,interior],links:[{id:'link',from:'fabric',to:'sofa'}],groups:[]}}]};
 const snapshot=materialProposalSnapshot(workbook);
 assert.equal(snapshot.items.length,1);
 assert.equal(snapshot.items[0].referenceProductId,'dorado');
 assert.equal(snapshot.items[0].referenceImage,'variant.jpg');
 assert.deepEqual(snapshot.visualizations.map(item=>item.image),['variant.jpg','room.jpg']);
 assert.deepEqual(snapshot.visualizations[0].steps.map(step=>step.image),['source.jpg','fabric.jpg','variant.jpg']);
 assert.deepEqual(snapshot.visualizations[0].steps.map(step=>step.role),['source','reference','result']);
});

test('materials proposal never adds material samples to the priced specification',()=>{
 const workbook={version:2,activeSheetId:'sheet-1',sheets:[{id:'sheet-1',name:'Лист 1',board:{version:1,nodes:[node('wood','material','Орех','wood.jpg'),node('colour','colour','Бежевый',undefined,{colour:'#eee'})],links:[],groups:[]}}]};
 assert.deepEqual(materialProposalSnapshot(workbook),{items:[],visualizations:[]});
});

test('solid colours stay in the visual lineage while sticker instructions stay out of the proposal',()=>{
 const product=node('chair','product','Кресло RICO','chair.jpg',{catalogId:'rico'});
 const colour=node('colour','colour','Терракотовый',undefined,{colour:'#b65f45'});
 const note=node('note','note','Инструкция',undefined,{text:'Сделать спинку терракотовой'});
 const variant=node('variant','reference','Кресло RICO · Терракотовый','chair-variant.jpg',{generated:true,resultType:'material-variant',catalogId:'rico'});
 const workbook={version:2,activeSheetId:'sheet-1',sheets:[{id:'sheet-1',name:'Лист 1',board:{version:1,nodes:[product,colour,note,variant],links:[{id:'colour-link',from:'colour',to:'chair'},{id:'note-link',from:'note',to:'chair'}],groups:[]}}]};
 const snapshot=materialProposalSnapshot(workbook);
 assert.equal(snapshot.items.length,1);
 assert.equal(snapshot.visualizations.length,1);
 assert.equal(snapshot.visualizations[0].steps.length,3);
 assert.match(snapshot.visualizations[0].steps[1].title,/Цвет/);
 assert.match(snapshot.visualizations[0].steps[1].image,/^data:image\/svg\+xml/);
 assert.ok(snapshot.visualizations[0].steps.every(step=>step.id!=='note'));
});

test('legacy generated tray references are recognized as product variants',()=>{
 const product=node('sofa','product','Диван FONTANE','sofa.jpg',{catalogId:'fontane'});
 const colour=node('red','colour','Красный',undefined,{colour:'#8f1627'});
 const legacyVariant=node('legacy','reference','Диван FONTANE · Красный','legacy.jpg',{generated:true,trayOnly:true,catalogId:'fontane'});
 const workbook={version:2,activeSheetId:'sheet-1',sheets:[{id:'sheet-1',name:'Лист 1',board:{version:1,nodes:[product,colour,legacyVariant],links:[{id:'red-link',from:'red',to:'sofa'}],groups:[]}}]};
 const snapshot=materialProposalSnapshot(workbook);
 assert.equal(snapshot.items[0].referenceImage,'legacy.jpg');
 assert.deepEqual(snapshot.visualizations.map(item=>item.image),['legacy.jpg']);
 assert.equal(snapshot.visualizations[0].steps[0].image,'sofa.jpg');
 assert.match(snapshot.visualizations[0].steps[1].title,/Цвет/);
 assert.equal(snapshot.visualizations[0].steps[2].image,'legacy.jpg');
});

test('catalog cards stored as references keep source, inputs and generated result',()=>{
 const product=node('chair','reference','Кресло RICO','chair.jpg',{catalogId:'rico',brand:'NORR'});
 const colour=node('orange','colour','Оранжевый',undefined,{colour:'#c86a2a'});
 const note=node('note','note','Стикер',undefined,{text:'Спинку сделать оранжевой'});
 const variant=node('variant','reference','Кресло RICO · Оранжевый','chair-orange.jpg',{generated:true,resultType:'material-variant',catalogId:'rico'});
 const workbook={version:2,activeSheetId:'sheet-1',sheets:[{id:'sheet-1',name:'Лист 1',board:{version:1,nodes:[product,colour,note,variant],links:[{id:'colour-link',from:'orange',to:'chair'},{id:'note-link',from:'note',to:'orange'}],groups:[]}}]};
 const snapshot=materialProposalSnapshot(workbook);
 assert.equal(snapshot.items.length,1);
 assert.equal(snapshot.items[0].referenceImage,'chair-orange.jpg');
 assert.equal(snapshot.visualizations.length,1);
 assert.deepEqual(snapshot.visualizations[0].steps.map(step=>step.title),[
  'Исходный референс',
  'Цвет · Оранжевый',
  'Результат изменения',
 ]);
});

test('selection keeps only chosen products, their lineage and chosen renders',()=>{
 const sofa=node('sofa','product','Диван DORADO','sofa.jpg',{catalogId:'dorado'});
 const sofaVariant=node('sofa-variant','reference','Диван DORADO · Букле','sofa-new.jpg',{catalogId:'dorado',generated:true,resultType:'material-variant'});
 const chair=node('chair','product','Кресло RICO','chair.jpg',{catalogId:'rico'});
 const room=node('room','reference','Интерьер','room.jpg',{generated:true,resultType:'interior-render'});
 const otherRoom=node('room-2','reference','Другой интерьер','room-2.jpg',{generated:true,resultType:'interior-render'});
 const workbook={version:2,activeSheetId:'sheet-1',sheets:[{id:'sheet-1',name:'Лист 1',board:{version:1,nodes:[sofa,sofaVariant,chair,room,otherRoom],links:[],groups:[]}}]};
 const snapshot=materialProposalSnapshot(workbook,['sofa-variant','room']);
 assert.deepEqual(snapshot.items.map(item=>item.referenceProductId),['dorado']);
 assert.deepEqual(snapshot.visualizations.map(item=>item.image),['sofa-new.jpg','room.jpg']);
 assert.ok(snapshot.visualizations.every(item=>item.image!=='room-2.jpg'));
});

test('selection keeps every chosen colour variant of the same catalog product on its own slide',()=>{
 const chair=node('chair','product','Кресло RICO','chair.jpg',{catalogId:'rico'});
 const yellow=node('yellow','colour','Жёлтый',undefined,{colour:'#d9a51d'});
 const red=node('red','colour','Красный',undefined,{colour:'#8f1627'});
 const yellowVariant=node('chair-yellow','reference','Кресло RICO · Жёлтый','chair-yellow.jpg',{catalogId:'rico',generated:true,resultType:'material-variant',materialId:'yellow',trayOrder:20});
 const redVariant=node('chair-red','reference','Кресло RICO · Красный','chair-red.jpg',{catalogId:'rico',generated:true,resultType:'material-variant',materialId:'red',trayOrder:10});
 const room=node('room','reference','Расстановка','room.jpg',{generated:true,resultType:'interior-render',trayOrder:30});
 const workbook={version:2,activeSheetId:'sheet-1',sheets:[{id:'sheet-1',name:'Лист 1',board:{version:1,nodes:[chair,yellow,red,yellowVariant,redVariant,room],links:[],groups:[]}}]};
 const snapshot=materialProposalSnapshot(workbook,['chair-yellow','chair-red','room']);
 assert.equal(snapshot.items.length,1);
 assert.deepEqual(snapshot.visualizations.map(item=>item.image),['chair-yellow.jpg','chair-red.jpg','room.jpg']);
 assert.deepEqual(snapshot.visualizations[0].steps.map(step=>step.id),['chair','yellow','chair-yellow']);
 assert.deepEqual(snapshot.visualizations[1].steps.map(step=>step.id),['chair','red','chair-red']);
});

test('edited planogram keeps the original room, the latest composition and real item quantities',()=>{
 const plan=node('plan','reference','Расстановка',undefined,{interior:{items:[
  {id:'old-sofa-item',kind:'sofa',name:'Старый диван',width:2000,depth:900,referenceImage:'old-sofa.jpg',referenceProductId:'old-sofa'},
  {id:'chair-one',kind:'chair',name:'Кресло',width:800,depth:800,referenceImage:'chair-grey.jpg',referenceProductId:'chair'},
  {id:'chair-two',kind:'chair',name:'Кресло',width:800,depth:800,referenceImage:'chair-red.jpg',referenceProductId:'chair'},
 ]}});
 const replacement=node('new-sofa','product','Новый диван','new-sofa.jpg',{catalogId:'new-sofa'});
 const room=node('room','reference','Интерьер по планограмме','room-new-sofa.jpg',{scene:true,generated:true,resultType:'interior-render',originalImage:'room-old-sofa.jpg',trayOrder:20});
 const duplicateLatest=node('latest','reference','Рендер · Новый диван','room-new-sofa.jpg',{generated:true,trayOnly:true,resultType:'interior-render',originalImage:'room-new-sofa.jpg',trayOrder:30});
 const workbook={version:2,activeSheetId:'sheet-1',sheets:[{id:'sheet-1',name:'Лист 1',board:{version:1,nodes:[plan,replacement,room,duplicateLatest],links:[{id:'replace-link',from:'new-sofa',to:'room'}],groups:[]}}]};
 const snapshot=materialProposalSnapshot(workbook,['room','latest']);
 assert.deepEqual(snapshot.visualizations.map(item=>item.image),['room-old-sofa.jpg','room-new-sofa.jpg']);
 assert.match(snapshot.visualizations[0].title,/исходная версия/);
 assert.match(snapshot.visualizations[1].title,/актуальная версия/);
 assert.equal(snapshot.items.filter(item=>item.referenceProductId==='chair').length,2);
 assert.deepEqual(snapshot.items.map(item=>item.referenceProductId),['old-sofa','chair','chair','new-sofa']);
});

test('materials commercial proposal is tenant-gated and Room Design keeps its print album',async()=>{
 const {readFile}=await import('node:fs/promises');
 const [page,styles,prepare,editor]=await Promise.all([
  readFile(new URL('../app/materials-concept/page.tsx',import.meta.url),'utf8'),
  readFile(new URL('../app/materials-concept/materials-concept.css',import.meta.url),'utf8'),
  readFile(new URL('../app/api/projects/[id]/materials-concept/proposal/route.ts',import.meta.url),'utf8'),
  readFile(new URL('../app/proposal/[projectId]/proposal-editor.tsx',import.meta.url),'utf8'),
 ]);
 assert.match(page,/const norrProposalMode=user\?\.tenantSlug==='norrmobler'\|\|proposalPreviewTenant/);
 assert.match(page,/if\(!norrProposalMode\)\{openPrintReview\(\);return;\}/);
 assert.match(page,/if\(!proposalSelecting\)/);
 assert.match(page,/selectedIds:printSelection/);
 assert.match(page,/process\.env\.NODE_ENV!=='production'/);
 assert.match(prepare,/user\.tenantSlug!=='norrmobler'/);
 assert.match(editor,/source==='materials'/);
 assert.match(editor,/materialsProposalItems/);
 assert.match(page,/\(n\.kind==='colour'\|\|n\.kind==='material'\).*concept-node-label/);
 assert.match(styles,/\.concept-node-label\{/);
});
