export const BRIEF_FIELDS = [
 ['client','Заказчик и контактное лицо'],['object','Объект и адрес'],['goal','Цель проекта'],
 ['style','Стиль и настроение'],['requirements','Ключевые требования'],['budget','Бюджет и вилка'],
 ['timeline','Сроки и этапы'],['conditions','Особые условия'],
] as const;
export type BriefKey = typeof BRIEF_FIELDS[number][0];
export type BriefDraft = Record<BriefKey,string> & {other:string};
export function readBrief(description:string):BriefDraft {
 const draft = Object.fromEntries([...BRIEF_FIELDS.map(([key])=>[key,'']),['other','']]) as BriefDraft;
 let current: keyof BriefDraft='other';
 for(const line of description.split('\n')){
  const field=BRIEF_FIELDS.find(([,label])=>line.startsWith(label+':'));
  if(field){current=field[0];draft[current]+=(draft[current]?'\n':'')+line.slice(field[1].length+1).trimStart();}
  else draft[current]+=(draft[current]?'\n':'')+line;
 }
 return draft;
}
export function writeBrief(draft:BriefDraft){
 return [draft.other.trim(),...BRIEF_FIELDS.filter(([key])=>draft[key].trim()).map(([key,label])=>`${label}: ${draft[key].trim()}`)].filter(Boolean).join('\n');
}
