import PptxGenJS from 'pptxgenjs';
import {PROPOSAL_BRAND} from '../lib/proposal-brand';
import {cabinetEuroCents,cabinetRateLabel,cabinetRubles,type CabinetEuroRate} from './cabinet-currency';
import type {CabinetSpecification} from './cabinet-specification';

const W=11.6929, H=8.2677;
const INK='1A1917', MUTED='756B60', IVORY='F7F5F1', RUBY='6E242A', LINE='DDD6CB';
const sizeText=({width,height,depth}:CabinetSpecification['size'])=>`${width} × ${height} × ${depth} мм`;

const slideFont=(points:number)=>100*points/72/W+'cqw';

class CabinetSlide {
 readonly preview=document.createElement('article');
 private readonly slide:PptxGenJS.Slide;

 constructor(private readonly pptx:PptxGenJS,background:string,title:string){
  this.slide=pptx.addSlide();
  this.slide.background={color:background};
  this.preview.className='proposal-slide';
  this.preview.setAttribute('aria-label',title);
  this.preview.style.backgroundColor='#'+background;
 }

 private place(element:HTMLElement,x:number,y:number,w:number,h?:number){
  element.style.left=100*x/W+'%';
  element.style.top=100*y/H+'%';
  element.style.width=100*w/W+'%';
  if(h!==undefined)element.style.height=100*h/H+'%';
  this.preview.append(element);
 }

 addText(text:string,x:number,y:number,w:number,h:number,style:PptxGenJS.TextPropsOptions={}){
  const {fontFace='Arial',fontSize=10,color=INK,bold,align,charSpacing}=style;
  this.slide.addText(text,{x,y,w,h,fontFace,fontSize,color,margin:0,fit:'shrink',...style});
  const element=document.createElement('div');
  element.className='proposal-slide-text';
  element.textContent=text;
  element.style.fontFamily=fontFace+(fontFace==='Georgia'?',serif':',sans-serif');
  element.style.fontSize=slideFont(fontSize);
  element.style.color='#'+color;
  if(bold)element.style.fontWeight='bold';
  if(align)element.style.textAlign=align;
  if(charSpacing)element.style.letterSpacing=slideFont(charSpacing);
  this.place(element,x,y,w,h);
 }

 addImage(data:string,x:number,y:number,w:number,h:number,alt:string){
  this.slide.addImage({data,x,y,w,h});
  const image=document.createElement('img');
  image.src=data;
  image.alt=alt;
  this.place(image,x,y,w,h);
 }

 addRule(x:number,y:number,w:number,color:string,points:number){
  this.slide.addShape(this.pptx.ShapeType.line,{x,y,w,h:0,line:{color,width:points}});
  const rule=document.createElement('span');
  rule.style.borderTop=slideFont(points)+' solid #'+color;
  this.place(rule,x,y,w);
 }

 addBackground(x:number,y:number,w:number,h:number,color:string){
  this.slide.addShape(this.pptx.ShapeType.rect,{x,y,w,h,line:{color,transparency:100},fill:{color}});
  const background=document.createElement('span');
  background.style.backgroundColor='#'+color;
  this.place(background,x,y,w,h);
 }

 addTable(rows:PptxGenJS.TableRow[],x:number,y:number,w:number,rowH:number,fontSize:number){
  const columnWidths=[.27,.47,.26];
  this.slide.addTable(rows,{x,y,w,colW:columnWidths.map(fraction=>w*fraction),
   rowH,margin:1.2,fontFace:'Arial',fontSize,color:INK,
   border:{type:'solid',color:LINE,pt:.35},valign:'middle',autoPage:false});
  const table=document.createElement('table');
  table.className='proposal-slide-table';
  table.style.fontSize=slideFont(fontSize);
  const cols=document.createElement('colgroup');
  for(const fraction of columnWidths){
   const col=document.createElement('col');
   col.style.width=100*fraction+'%';
   cols.append(col);
  }
  table.append(cols);
  const head=table.createTHead();
  const body=table.createTBody();
  rows.forEach((row,index)=>{
   const line=(index===0?head:body).insertRow();
   line.style.height=slideFont(rowH*72);
   row.forEach(({text})=>{
    const cell=document.createElement(index===0?'th':'td');
    cell.textContent=typeof text==='string'?text:'';
    line.append(cell);
   });
  });
  this.place(table,x,y,w);
 }
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

async function addCabinetSlide(pptx:PptxGenJS,item:CabinetSpecification,index:number,rate:CabinetEuroRate|null){
 const [view,front]=await Promise.all([item.photos.view,item.photos.front].map(async blob=>fittedImage(await photoData(blob))));
 const slide=new CabinetSlide(pptx,'FFFFFF',item.name);
 slide.addText(PROPOSAL_BRAND.officialName,.55,.33,4,.24,{color:RUBY,fontSize:8,charSpacing:2});
 slide.addText('Позиция '+String(index+1).padStart(2,'0'),9.3,.33,1.8,.24,{color:RUBY,align:'right',fontSize:8});
 slide.addRule(.55,.66,10.59,LINE,.65);
 slide.addText(item.name,.55,.89,4,.46,{fontFace:'Georgia',fontSize:26});
 slide.addText('Ширина × высота × глубина',.55,1.45,4,.22,{color:MUTED,fontSize:9});
 slide.addText(sizeText(item.size),.55,1.69,4,.27,{fontSize:13,bold:true});
 if(item.support)slide.addText('Опора · '+item.support,.55,2.01,4,.25,{fontSize:9});

 for(const [image,y,h,caption] of [[view,2.37,2.63,'3D-вид'],[front,5.27,1.32,'Фронтальный вид']] as const){
  slide.addBackground(.55,y,4.14,h,IVORY);
  const scale=Math.min(4.14/image.width,h/image.height);
  const width=image.width*scale,height=image.height*scale;
  slide.addImage(image.data,.55+(4.14-width)/2,y+(h-height)/2,width,height,caption);
  slide.addText(caption,.55,y+h+.035,4.14,.18,{color:MUTED,fontSize:8});
 }
 slide.addText('Стоимость композиции',.55,7.06,4,.23,{fontSize:9,color:MUTED});
 const cents=cabinetEuroCents(item.price,item.priceInCents);
 const rubles=cabinetRubles(cents,rate);
 const currencyNote=rubles?item.price+' · '+cabinetRateLabel(rate):cents!==undefined?cabinetRateLabel(rate):undefined;
 const notes=[currencyNote,item.priceNote].filter(Boolean).join('\n');
 slide.addText(rubles||item.price,.55,7.34,4,.4,{fontSize:21,bold:true,color:'28583E'});
 if(notes)slide.addText(notes,.55,7.77,4.14,.34,{fontSize:8,color:MUTED});

 slide.addText('Состав и отделка модулей',5,.91,6.14,.32,{fontFace:'Georgia',fontSize:18});
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
   slide.addText(module.article+' · '+module.type,x,y,columnWidth,.22,{bold:true,color:RUBY,fontSize:9});
   slide.addText(sizeText(module.size),x,y+.23,columnWidth,.18,{fontSize:8,color:MUTED});
   const finishes=module.finishes?.length
    ?module.finishes
    :[{surface:'—',material:'Данные недоступны',article:undefined}];
   const rows:PptxGenJS.TableRow[]=[
    [{text:'Поверхность',options:{bold:true,fill:{color:IVORY}}},
     {text:'Отделка',options:{bold:true,fill:{color:IVORY}}},
     {text:'Артикул',options:{bold:true,fill:{color:IVORY}}}],
    ...finishes.map(finish=>[{text:finish.surface},{text:finish.material},{text:finish.article||'—'}]),
   ];
   slide.addTable(rows,x,y+.43,columnWidth,rowHeight,fontSize);
   y+=.54+rows.length*rowHeight;
  }
 }
 return slide.preview;
}

export async function createCabinetSpecification(items:CabinetSpecification[],rate:CabinetEuroRate|null){
 const [coverBrand,closingBrand]=await Promise.all([brandImage(PROPOSAL_BRAND.coverAsset),brandImage(PROPOSAL_BRAND.circleAsset)]);
 const pptx=new PptxGenJS();
 pptx.defineLayout({name:'CABINET_A4',width:W,height:H});
 pptx.layout='CABINET_A4';
 pptx.author=PROPOSAL_BRAND.officialName;
 pptx.company=PROPOSAL_BRAND.contactDomain;
 pptx.title='Коммерческое предложение · '+PROPOSAL_BRAND.officialName;
 pptx.theme={headFontFace:'Georgia',bodyFontFace:'Arial'};

 const cover=new CabinetSlide(pptx,IVORY,'Обложка');
 cover.addImage(coverBrand,0,0,6.63,H,PROPOSAL_BRAND.officialName);
 cover.addRule(7.28,1.35,.42,RUBY,1.2);
 cover.addText('Коммерческое\nпредложение',7.28,1.77,3.78,1.24,{fontFace:'Georgia',fontSize:27});
 cover.addText('Спецификация мебели',7.28,3.25,3.7,.35,{color:MUTED,fontSize:12});
 cover.addText(PROPOSAL_BRAND.domain,8.89,7.65,2.22,.22,{color:MUTED,align:'right',fontSize:8,charSpacing:1.2});

 const slides=[cover.preview];
 for(const [index,item] of items.entries())slides.push(await addCabinetSlide(pptx,item,index,rate));

 const closing=new CabinetSlide(pptx,IVORY,'Заключительный слайд');
 closing.addImage(closingBrand,(W-4.85)/2,.87,4.85,4.85,PROPOSAL_BRAND.officialName);
 closing.addText('Спасибо за ваш выбор',1.2,6.12,W-2.4,.57,{fontFace:'Georgia',fontSize:24,align:'center'});
 closing.addText(PROPOSAL_BRAND.contactDomain,1.2,6.91,W-2.4,.25,{color:RUBY,fontSize:11,align:'center'});

 slides.push(closing.preview);
 return {slides,write:async()=>{
  const file=await pptx.write({outputType:'blob',compression:true});
  if(!(file instanceof Blob))throw Error('Не удалось создать файл PowerPoint.');
  return file;
 }};
}
