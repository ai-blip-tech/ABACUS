import json,re,sys
from pathlib import Path
import pdfplumber
import pypdfium2 as pdfium
source=Path(sys.argv[1])
output=Path(sys.argv[2])
output.mkdir(parents=True,exist_ok=True)
transparent_codes={'5164','10162','3186','4186','5186','6183','41101','51101','61101','101101'}
items=[]
rendered=pdfium.PdfDocument(source)
with pdfplumber.open(source) as pdf:
 for index in range(3,15):
  page=pdf.pages[index]
  rendered_page=rendered[index].render(scale=4).to_pil()
  codes=[]
  for low,high in [(193,278),(807,892)]:
   lines={}
   for char in page.chars:
    if low<=char['x0']<=high and char['top']>285:
     lines.setdefault(round(char['top'],1),[]).append(char)
   for chars in lines.values():
    chars.sort(key=lambda char:char['x0'])
    text=''.join(char['text'] for char in chars).strip().replace(' ','')
    if re.fullmatch(r'\d{4,6}[A-Z]*',text):
     codes.append({'text':text,'x0':min(char['x0'] for char in chars),'x1':max(char['x1'] for char in chars),'top':min(char['top'] for char in chars),'bottom':max(char['bottom'] for char in chars)})
  images=[im for im in page.images if im['top']>285 and im['srcsize'][0]>50 and (index!=14 or im['x0']<page.width/2)]
  for im in images:
   centre=(im['top']+im['bottom'])/2
   candidates=[w for w in codes if im['x1']+15<w['x0']<im['x1']+230 and abs((w['top']+w['bottom'])/2-centre)<85]
   if not candidates: raise RuntimeError(('no code',index+1,im['x0'],im['top']))
   code=min(candidates,key=lambda w:abs((w['top']+w['bottom'])/2-centre))
   area=(code['x0']-35,code['top']+8,code['x1']+32,min(page.height,code['top']+70))
   chars=[char for char in page.chars if area[0]<=char['x0']<=area[2] and area[1]<=char['top']<=area[3]]
   lines={}
   for char in chars:lines.setdefault(round(char['top'],1),[]).append(char)
   text=' '.join(''.join(char['text'] for char in sorted(line,key=lambda char:char['x0'])) for _,line in sorted(lines.items()))
   dimensions=re.search(r'L\s*:\s*(\d+)\s*D\s*:\s*(\d+)\s*H\s*:\s*(\d+)',text)
   if not dimensions:raise RuntimeError(('no dimensions',index+1,code['text'],text))
   width,depth,height=map(int,dimensions.groups())
   padding=2
   rectangle=(max(0,round((im['x0']-padding)*4)),max(0,round((im['top']-padding)*4)),round((im['x1']+padding)*4),round((im['bottom']+padding)*4))
   rendered_page.crop(rectangle).save(output/(code['text']+'-catalog.png'))
   items.append({'id':code['text'],'widthMm':width*10,'heightMm':height*10,'depthMm':depth*10,'thumbnail':code['text']+'-catalog.png','sourcePdfPage':index+1,'sourcePrintedPage':2*index+(1 if im['x0']>page.width/2 else 0)})
for item in items:
 if item['id'] in transparent_codes:item['fixedFront']='transparent-glass'
ids=[item['id'] for item in items]
if len(ids)!=len(set(ids)):raise RuntimeError(('duplicate codes',[v for v in ids if ids.count(v)>1]))
(output/'sideboards-catalog.json').write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'count':len(items),'heights':sorted(set(item['heightMm'] for item in items)),'depths':sorted(set(item['depthMm'] for item in items)),'four':[item for item in items if item['id'] in ['5041','5042','6541','6542']]},ensure_ascii=False))


# The price-list shows clipped images inside the ten equal-height support rows.
page=rendered[23].render(scale=4).to_pil()
definitions=[
 ('BS','База',35,'base',0,0),('S13','Spike 13',130,'feet',0,1),
 ('S20','Spike 20',200,'feet',0,2),('PLN','Plain',130,'feet',0,3),
 ('TBE','Tube',130,'feet',0,4),('CRB','Crab',130,'feet',1,0),
 ('WL','Подвес',0,'wall',1,1),('CG2','Cage 20',200,'frame',1,2),
 ('CG4','Cage 40',400,'frame',1,3),('GPLN','Glass Plain',160,'frame',1,4),
]
supports=[]
for code,label,height,kind,side,row in definitions:
 x0,x1=(64.5,221) if side==0 else (690,833.5)
 y0=165+row*130.4
 page.crop((round(x0*4),round(y0*4),round(x1*4),round((y0+130.4)*4))).save(output/('support-'+code+'.png'))
 supports.append({'id':code,'label':label,'heightMm':height,'kind':kind,'thumbnail':'support-'+code+'.png','sourcePdfPage':24,'sourcePrintedPage':46+side})
(output/'supports-catalog.json').write_text(json.dumps(supports,ensure_ascii=False,indent=2)+'\n')
