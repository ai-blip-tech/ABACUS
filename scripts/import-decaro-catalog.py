"""Reproducible, offline import of the supplied factory-price snapshot."""
import csv,json,sys
from pathlib import Path
source=Path(sys.argv[1]); rows=list(csv.DictReader(source.open(encoding='utf-8-sig'),delimiter=';'))
colors={'чёрный':('black','#242526'),'бронзовый':('bronze','#79604a'),'латунный':('brass','#b69b60'),'медный':('copper','#b77956'),'титановый':('titanium','#929394')}
config={
'D007':([15,13],['Полукруг','П-образный канал'],[13,15],[]),
'D008':([10,10],['Полукруг','П-образный паз'],[8,10],[]),
'D009':([5,10],['Тонкий стык','Основание для вставки'],[3,5],[]),
'D009.2A':([3,8.5],['Капля'],[3],[]),
'D009.3A':([7,7.5],['Т-образная полка'],[7],[]),
'Rizz':([5,11.539],['Капля в основании'],[3],['D009','D009.2A']),
'RizzT':([7,11.2044],['Т-полка в основании'],[7],['D009','D009.3A']),
'D00X':([10,10],['Зигзаг','Острый угол','Полукруг','Зубило'],[10,10,10,10],[])}
result=[]
for row in rows:
 model=row['Модель / исполнение']; model={'RizzT (D009 + D009.3)':'RizzT'}.get(model,model)
 # Table may include explanatory product aliases; canonical model is the leading token.
 model=next((k for k in sorted(config,key=len,reverse=True) if model.lower().startswith(k.lower())),model)
 assert model in config,model
 color,hex=next(v for k,v in colors.items() if k in row['Заводская отделка'])
 dims,sides,visible,components=config[model]
 image={'D009.2A':'d009.2','D009.3A':'d009.3','RizzT':'rizz-t'}.get(model,model.lower())
 manual='2023/05/teh.karta_d007.008.009-1.pdf' if model in ['D007','D008','D009'] else '2024/03/teh.karta_d00x.pdf' if model=='D00X' else '2024/06/teh.karta_d009.2.3-rizzrizzt.pdf'
 parameters={'D007':{'internalGrooveNote':'Канал 10 мм; полукруг и П-образная сторона','ledAvailable':True},'D008':{'internalGrooveNote':'Технический паз 7,5 мм; каталожный зазор 8 / 10 мм'},'D009':{'internalGrooveNote':'В техкарте 2,7 мм; в отдельных схемах 2,5 мм. Посадка — по официальной CAD-модели'},'D009.2A':{'stemMm':2,'headMm':3},'D009.3A':{'stemMm':2,'headMm':7},'Rizz':{'stemMm':2,'headMm':3},'RizzT':{'stemMm':2,'headMm':7},'D00X':{'internalGrooveNote':'Четыре рабочие стороны; сторона зубило имеет дополнительные монтажные плоскости'}}[model]
 result.append(dict(parameters=parameters,compatibleReference=['D001','D002','D003','D004'] if model in ['D007','D008','D009','D00X'] else [],id='decaro:'+model.lower()+':'+color,brand=row['Бренд'],model=model,article=model,drawingAlias={'D009.2A':'D009.2','D009.3A':'D009.3'}.get(model,model),factoryColor=row['Заводская отделка'],color=color,hex=hex,stockMm=int(row['Длина планки, мм']),sectionMm=dims,sectionLabel=row['Сечение Ш × В, мм / состав комплекта'],visibleMm=visible,sides=sides,components=components,price=int(row['Цена, руб./пог. м']),barPrice=int(row['Цена за 3 м, руб.']),priceDate=row['Дата сверки'],url=row['Карточка'],image='/materials/decaro/decaro_engineering_'+image+'.png',manual='https://decaro-engineering.ru/wp-content/uploads/'+manual,sitePaintAllowed=True,material='Алюминий, анодирование'))
assert len(result)==32
Path('lib/decaro').mkdir(exist_ok=True)
Path('lib/decaro/variants.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('Imported',len(result),'variants')
