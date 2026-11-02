import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {PDFDocument,PDFName,PDFDict} from 'pdf-lib';
import JSZip from 'jszip';
import sharp from 'sharp';
import {defaultProposalDocument} from '../lib/commercial-proposal.ts';

const base=process.env.PROPOSAL_SMOKE_BASE,u=new URL(base);
assert.equal(u.hostname,'127.0.0.1');assert.equal(u.protocol,'http:');assert.ok(['3901','3902'].includes(u.port),'Isolated candidate only; never production');
const out=process.env.PROPOSAL_SMOKE_OUTPUT||'/private/tmp/roomdesign-proposal-visual-only-results';await mkdir(out,{recursive:true});
async function account(suffix){const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`proposal-${Date.now()}-${suffix}@example.test`,password:'LocalProposal-Only-2026!',firstName:'Проверка',lastName:'Выгрузки'})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
const owner=await account('owner'),other=await account('other');
const req=(path,method='GET',body,cookie=owner)=>fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),Origin:base,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
const created=await req('/api/projects','POST',{name:'Только визуализация — проверка экспорта'});assert.equal(created.status,200);const {project}=await created.json(),id=project.id,path='/api/projects/'+id;
const bytes=await sharp({create:{width:960,height:540,channels:3,background:'#be8c63'}}).png().toBuffer();
const image='data:image/png;base64,'+bytes.toString('base64');
const inline=async(path,mime)=>'data:'+mime+';base64,'+(await readFile(new URL('../public'+path,import.meta.url))).toString('base64');
const fonts=await Promise.all(['/fonts/Arial.ttf','/fonts/Arial-Bold.ttf','/fonts/Georgia.ttf','/fonts/Georgia-Italic.ttf','/fonts/Georgia-Bold.ttf'].map(p=>inline(p,'font/ttf')));
const assets={coverBrandAsset:await inline('/proposal/cover-brand-official.svg','image/svg+xml'),managerBrandAsset:await inline('/proposal/norr-circle.svg','image/svg+xml'),fontData:fonts[0],fontBoldData:fonts[1],serifFontData:fonts[2],serifItalicFontData:fonts[3],serifBoldFontData:fonts[4]};
let state={interiorImage:image,generatedImage:image,proposalVisualization:image,planItems:[],proposalItems:[],proposalHistoryId:'visual-only',historyVersions:[{id:'visual-only',image,proposalItems:[]}]};
async function save(){const r=await req(path,'PUT',{name:project.name,projectType:'Квартира',state});assert.equal(r.status,200,await r.clone().text());const selected=await req(path+'/proposal','PATCH',{items:[],visualization:image,historyId:state.proposalHistoryId});assert.equal(selected.status,200,await selected.clone().text());}
await save();
const payload={projectId:id,projectName:project.name,coverImage:image,withPrices:true,products:[],document:defaultProposalDocument(project.name,0),managerName:'Тестовый менеджер',...assets};
const results=[];
async function exportFile(format,body,label,pages){
 const r=await req(format==='pdf'?'/api/proposal':'/api/proposal/pptx','POST',body);assert.equal(r.status,200,await r.clone().text());const data=Buffer.from(await r.arrayBuffer());
 if(format==='pdf'){
  assert.match(r.headers.get('content-type'),/application\/pdf/);const pdf=await PDFDocument.load(data);assert.equal(pdf.getPageCount(),pages);
  const images=pdf.getPage(1).node.Resources().lookup(PDFName.of('XObject'),PDFDict);assert.ok(images.keys().length>0,'Visualization page must contain an embedded image');
 }else{
  assert.match(r.headers.get('content-type'),/presentationml/);const zip=await JSZip.loadAsync(data);const slides=Object.keys(zip.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p));assert.equal(slides.length,pages);
  const slide=await zip.file('ppt/slides/slide2.xml').async('string');assert.match(slide,/<p:pic>/,'Visualization slide must contain an image');
  if(!body.products.length)for(const name of slides)assert.doesNotMatch(await zip.file(name).async('string'),/<a:tbl>/,'No empty specification tables');
 }
 await writeFile(`${out}/${label}.${format}`,data);results.push({format,scenario:label,bytes:data.length,pages});
}
await exportFile('pdf',payload,'visualization-only',4);await exportFile('pptx',payload,'visualization-only',4);
for(const endpoint of ['/api/proposal','/api/proposal/pptx']){
 assert.equal((await req(endpoint,'POST',payload,null)).status,401);
 assert.equal((await req(endpoint,'POST',payload,other)).status,404);
 assert.equal((await req(endpoint,'POST',{...payload,coverImage:''})).status,400);
 assert.equal((await req(endpoint,'POST',{...payload,products:[{objectIds:['foreign-object'],name:'Forbidden'}]})).status,403);
}
const product={id:'test-chair',name:'Тестовое кресло',kind:'chair',width:600,depth:530,referenceImage:image,referenceName:'Кресло'};
state={...state,planItems:[product],proposalItems:[product],proposalHistoryId:'with-products',historyVersions:[...state.historyVersions,{id:'with-products',image,proposalItems:[product]}]};await save();
const withProducts={...payload,document:defaultProposalDocument(project.name,1),products:[{source:'reference',objectIds:[product.id],name:product.name,referenceImage:image,width:600,depth:530,height:820,quantity:1,price:12000,priceText:'12 000 руб.'}]};
await exportFile('pdf',withProducts,'with-products',6);await exportFile('pptx',withProducts,'with-products',6);
state={...state,proposalHistoryId:'visual-only'};await save();
for(const endpoint of ['/api/proposal','/api/proposal/pptx'])assert.equal((await req(endpoint,'POST',withProducts)).status,403,'Old products cannot leak into the selected empty snapshot');
await exportFile('pdf',{...payload,withPrices:false},'selected-visualization-only-no-prices',4);await exportFile('pptx',{...payload,withPrices:false},'selected-visualization-only-no-prices',4);
const report={passed:true,projectId:id,checks:['visualization-only PDF and PPTX','embedded visualization','no empty specification','existing product export','authentication and ownership','no visualization rejected','foreign products rejected','selected snapshot isolation'],exports:results};await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
