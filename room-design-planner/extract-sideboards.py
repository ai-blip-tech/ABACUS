import json,re,sys
from pathlib import Path
import pdfplumber
import pypdfium2 as pdfium
source=Path(sys.argv[1])
output=Path(sys.argv[2])
output.mkdir(parents=True,exist_ok=True)
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
ids=[item['id'] for item in items]
if len(ids)!=len(set(ids)):raise RuntimeError(('duplicate codes',[v for v in ids if ids.count(v)>1]))
(output/'sideboards-catalog.json').write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'count':len(items),'heights':sorted(set(item['heightMm'] for item in items)),'depths':sorted(set(item['depthMm'] for item in items)),'four':[item for item in items if item['id'] in ['5041','5042','6541','6542']]},ensure_ascii=False))
