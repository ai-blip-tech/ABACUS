import PptxGenJS from 'pptxgenjs';
import {PROPOSAL_BRAND} from '../lib/proposal-brand';
import type {CabinetSpecification} from './cabinet-specification';

const W=11.6929, H=8.2677;
const INK='1A1917', MUTED='756B60', IVORY='F7F5F1', RUBY='6E242A', LINE='DDD6CB';
const sizeText=({width,height,depth}:CabinetSpecification['size'])=>`${width} × ${height} × ${depth} мм`;

function addText(slide:PptxGenJS.Slide,text:string,x:number,y:number,w:number,h:number,style:PptxGenJS.TextPropsOptions={}){
 slide.addText(text,{x,y,w,h,fontFace:'Arial',fontSize:10,color:INK,margin:0,fit:'shrink',...style});
}

function photoData(blob:Blob):Promise<string>{
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result));
  reader.onerror=()=>reject(Error('Не удалось прочитать снимок комода.'));
  reader.readAsDataURL(blob);
 });
}

function fittedImage(src:string):Promise<{data:string;width:number;height:number}>{
 return new Promise((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>resolve({data:src,width:image.naturalWidth,height:image.naturalHeight});
  image.onerror=()=>reject(Error('Не удалось открыть изображение для PowerPoint.'));
  image.src=src;
 });
}

function brandImage(path:string):Promise<string>{
 return new Promise((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>{
   const canvas=document.createElement('canvas');
   canvas.width=image.naturalWidth;
   canvas.height=image.naturalHeight;
   const context=canvas.getContext('2d');
   if(!context){reject(Error('Не удалось подготовить фирменную графику.'));return;}
   context.drawImage(image,0,0);
   resolve(canvas.toDataURL('image/png'));
  };
  image.onerror=()=>reject(Error('Не удалось загрузить фирменную графику NORR MØBLER.'));
  image.src=path;
 });
}

async function addCabinetSlide(pptx:PptxGenJS,item:CabinetSpecification,index:number){
 const [view,front]=await Promise.all([item.photos.view,item.photos.front].map(async blob=>fittedImage(await photoData(blob))));
 const slide=pptx.addSlide();
 slide.background={color:'FFFFFF'};
 addText(slide,PROPOSAL_BRAND.officialName,.55,.33,4,.24,{color:RUBY,fontSize:8,charSpacing:2});
 addText(slide,'Позиция '+String(index+1).padStart(2,'0'),9.3,.33,1.8,.24,{color:RUBY,align:'right',fontSize:8});
 slide.addShape(pptx.ShapeType.line,{x:.55,y:.66,w:10.59,h:0,line:{color:LINE,width:.65}});
 addText(slide,item.name,.55,.89,4,.46,{fontFace:'Georgia',fontSize:26});
 addText(slide,'Ширина × высота × глубина',.55,1.45,4,.22,{color:MUTED,fontSize:9});
 addText(slide,sizeText(item.size),.55,1.69,4,.27,{fontSize:13,bold:true});
 if(item.support)addText(slide,'Опора · '+item.support,.55,2.01,4,.25,{fontSize:9});

 for(const [image,y,h,caption] of [[view,2.37,2.63,'3D-вид'],[front,5.27,1.32,'Фронтальный вид']] as const){
  slide.addShape(pptx.ShapeType.rect,{x:.55,y,w:4.14,h,line:{color:IVORY,transparency:100},fill:{color:IVORY}});
  const scale=Math.min(4.14/image.width,h/image.height);
  const width=image.width*scale,height=image.height*scale;
  slide.addImage({data:image.data,x:.55+(4.14-width)/2,y:y+(h-height)/2,w:width,h:height});
  addText(slide,caption,.55,y+h+.035,4.14,.18,{color:MUTED,fontSize:8});
 }
 addText(slide,'Стоимость композиции',.55,7.06,4,.23,{fontSize:9,color:MUTED});
 addText(slide,item.price,.55,7.34,4,.4,{fontSize:21,bold:true,color:'28583E'});
 if(item.priceNote)addText(slide,item.priceNote,.55,7.84,4,.2,{fontSize:8,color:MUTED});

 addText(slide,'Состав и отделка модулей',5,.91,6.14,.32,{fontFace:'Georgia',fontSize:18});
 const split=item.modules.length>2?Math.ceil(item.modules.length/2):item.modules.length;
 const columns=[item.modules.slice(0,split),item.modules.slice(split)].filter(column=>column.length);
 const columnWidth=columns.length===1?6.14:2.98;
 const rowsInColumn=(column:CabinetSpecification['modules'])=>column.reduce((rows,module)=>rows+1+Math.max(1,module.finishes?.length||0),0);
 const rowHeight=Math.min(columns.length===1?.28:.23,...columns.map(column=>(6.45-column.length*.54)/rowsInColumn(column)));
 const fontSize=Math.min(columns.length===1?10:8,Math.max(6,Math.floor(rowHeight*45)));
 for(const [columnIndex,column] of columns.entries()){
  const x=5+columnIndex*(columnWidth+.18);
  let y=1.42;
  for(const module of column){
   addText(slide,module.article+' · '+module.type,x,y,columnWidth,.22,{bold:true,color:RUBY,fontSize:9});
   addText(slide,sizeText(module.size),x,y+.23,columnWidth,.18,{fontSize:8,color:MUTED});
   const finishes=module.finishes?.length
    ?module.finishes
    :[{surface:'—',material:'Данные недоступны',article:undefined}];
   const rows:PptxGenJS.TableRow[]=[
    [{text:'Поверхность',options:{bold:true,fill:{color:IVORY}}},
     {text:'Отделка',options:{bold:true,fill:{color:IVORY}}},
     {text:'Артикул',options:{bold:true,fill:{color:IVORY}}}],
    ...finishes.map(finish=>[{text:finish.surface},{text:finish.material},{text:finish.article||'—'}]),
   ];
   slide.addTable(rows,{x,y:y+.43,w:columnWidth,colW:[columnWidth*.27,columnWidth*.47,columnWidth*.26],
    rowH:rowHeight,margin:1.2,fontFace:'Arial',fontSize,color:INK,
    border:{type:'solid',color:LINE,pt:.35},valign:'middle',autoPage:false});
   y+=.54+rows.length*rowHeight;
  }
 }
}

export async function downloadCabinetSpecification(items:CabinetSpecification[]){
 const [coverBrand,closingBrand]=await Promise.all([brandImage(PROPOSAL_BRAND.coverAsset),brandImage(PROPOSAL_BRAND.circleAsset)]);
 const pptx=new PptxGenJS();
 pptx.defineLayout({name:'CABINET_A4',width:W,height:H});
 pptx.layout='CABINET_A4';
 pptx.author=PROPOSAL_BRAND.officialName;
 pptx.company=PROPOSAL_BRAND.contactDomain;
 pptx.title='Коммерческое предложение · '+PROPOSAL_BRAND.officialName;
 pptx.theme={headFontFace:'Georgia',bodyFontFace:'Arial'};

 const cover=pptx.addSlide();
 cover.background={color:IVORY};
 cover.addImage({data:coverBrand,x:0,y:0,w:6.63,h:H});
 cover.addShape(pptx.ShapeType.line,{x:7.28,y:1.35,w:.42,h:0,line:{color:RUBY,width:1.2}});
 addText(cover,'Коммерческое\nпредложение',7.28,1.77,3.78,1.24,{fontFace:'Georgia',fontSize:27});
 addText(cover,'Спецификация мебели',7.28,3.25,3.7,.35,{color:MUTED,fontSize:12});
 addText(cover,PROPOSAL_BRAND.domain,8.89,7.65,2.22,.22,{color:MUTED,align:'right',fontSize:8,charSpacing:1.2});

 for(const [index,item] of items.entries())await addCabinetSlide(pptx,item,index);

 const closing=pptx.addSlide();
 closing.background={color:IVORY};
 closing.addImage({data:closingBrand,x:(W-4.85)/2,y:.87,w:4.85,h:4.85});
 addText(closing,'Спасибо за ваш выбор',1.2,6.12,W-2.4,.57,{fontFace:'Georgia',fontSize:24,align:'center'});
 addText(closing,PROPOSAL_BRAND.contactDomain,1.2,6.91,W-2.4,.25,{color:RUBY,fontSize:11,align:'center'});

 await pptx.writeFile({fileName:'NORR_Mobler_Спецификация_мебели.pptx',compression:true});
}
