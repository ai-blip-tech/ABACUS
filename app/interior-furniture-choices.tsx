'use client';
import {interiorFurnitureTemplates,type InteriorFurnitureTemplate} from '@/lib/interior-furniture-templates';

function FurnitureIcon({kind,name}:{kind:string;name:string}){
 const common={fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
 let drawing:React.ReactNode;
 if(kind==='sofa')drawing=<><path d="M5 10v8h22v-8M8 10V7h16v3M5 14h22M8 18v2m16-2v2"/><path d="M5 10c0-1.7 3-1.7 3 0v5M27 10c0-1.7-3-1.7-3 0v5"/></>;
 else if(kind==='chair')drawing=<><path d="M9 10V6h14v4M7 11v7h18v-7M10 18v3m12-3v3M7 12c0-2 3-2 3 0v4m15-4c0-2-3-2-3 0v4"/></>;
 else if(kind==='stool')drawing=name==='Пуф'?<><rect x="7" y="6" width="18" height="13" rx="6"/><path d="M10 19v2m12-2v2M8 12h16"/></>:<><ellipse cx="16" cy="8" rx="8" ry="3"/><path d="M10 9.5 8 21m14-11.5L24 21M9 17h14"/></>;
 else if(kind==='table')drawing=name.includes('обеденный')?<><ellipse cx="16" cy="9" rx="11" ry="5"/><path d="M9 12v8m14-8v8M7 20h4m10 0h4"/></>:name.includes('журнальный')?<><rect x="5" y="7" width="22" height="9" rx="4"/><path d="M9 16v4m14-4v4"/></>:<><path d="M5 8h22v8H5zM8 16v5m16-5v5M20 8V5h6v3"/></>;
 else if(kind==='rug')drawing=name.includes('прямоугольный')?<><rect x="4" y="5" width="24" height="15" rx="1.5" strokeDasharray="2.5 2"/><path d="M8 9h16M8 16h16" opacity=".65"/></>:<><ellipse cx="16" cy="12" rx="12" ry="7.5" strokeDasharray="2.5 2"/><path d="M8 10c4 3 12 3 16 0M8 15c4-3 12-3 16 0" opacity=".65"/></>;
 else if(kind==='bed')drawing=<><rect x="4" y="5" width="24" height="15" rx="2"/><path d="M4 11h24M8 7h7v4H8zm9 0h7v4h-7zM6 20v2m20-2v2"/></>;
 else if(kind==='cabinet')drawing=name==='Стеллаж'?<><rect x="6" y="3" width="20" height="19" rx="1"/><path d="M6 9h20M6 15h20M13 3v19M20 3v19"/></>:<><rect x="6" y="3" width="20" height="19" rx="1"/><path d="M16 3v19M13 12h1m4 0h1"/></>;
 else if(kind==='lamp')drawing=<><circle cx="16" cy="11" r="5"/><path d="M16 2v3m0 12v5M7 11H3m26 0h-4M9.5 4.5 7 2m15.5 2.5L25 2M13 22h6"/></>;
 else if(kind==='decor')drawing=<><path d="M11 4h10l-2 5v9c0 3-6 3-6 0V9z"/><path d="M10 21h12M13 10h6"/></>;
 else if(kind==='plant')drawing=<><path d="M11 14h10l-1 8h-8zM16 14V6"/><path d="M16 8c-6 0-7-5-3-5 3 0 3 5 3 5Zm0 3c6 0 8-5 4-6-3-.5-4 6-4 6Zm0 3c-5 0-7-4-4-5 3-1 4 5 4 5Z"/></>;
 else if(kind==='dresser')drawing=<><rect x="5" y="5" width="22" height="15" rx="1"/><path d="M5 10h22M5 15h22M15 8h2m-2 5h2m-2 5h2M8 20v2m16-2v2"/></>;
 else if(kind==='nightstand')drawing=<><rect x="8" y="5" width="16" height="15" rx="1"/><path d="M8 11h16m-9-3h2m-2 6h2M10 20v2m12-2v2"/></>;
 else if(kind==='tv_stand')drawing=<><rect x="3" y="8" width="26" height="10" rx="1"/><path d="M11 8v10m10-10v10M6 18v3m20-3v3M6 12h2m6 0h4m6 0h2"/></>;
 else drawing=<rect x="5" y="5" width="22" height="15" rx="2"/>;
 return <svg className={`plan-icon-svg ${kind}`} viewBox="0 0 32 24" aria-hidden="true" {...common}>{drawing}</svg>;
}
/** The same choices and icon classes in Interior Creation and the planning workspace. */
export function InteriorFurnitureChoices({onAdd,rugVariants=false}:{onAdd:(item:InteriorFurnitureTemplate)=>void;rugVariants?:boolean}){
 const choices:InteriorFurnitureTemplate[]=[];
 interiorFurnitureTemplates.forEach(item=>{if(rugVariants&&item.kind==='rug'){choices.push({...item,name:'Ковёр прямоугольный',rugShape:'rectangular'},{...item,name:'Ковёр овальный',rugShape:'round'});}else choices.push(item);});
 return <div className="plan-template-grid">{choices.map(item=><button key={`${item.kind}:${item.name}`} type="button" onClick={()=>onAdd(item)}><FurnitureIcon kind={item.kind} name={item.name}/><span>{item.name}</span></button>)}</div>;
}
