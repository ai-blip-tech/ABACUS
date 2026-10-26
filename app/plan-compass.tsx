import React from 'react';

/** View-only control, outside the transformed SVG so it can never get lost. */
export function PlanCompass({onReset,disabled=false}:{onReset:()=>void;disabled?:boolean}){
 return <button type="button" className="plan-compass" aria-label="Вернуть план в исходный вид" title="Вернуть план в исходный вид — положение и масштаб по умолчанию" disabled={disabled}
  style={{position:'absolute',top:12,right:12,zIndex:5,width:40,height:40,padding:8,display:'grid',placeItems:'center',border:'1px solid #d9d0c5',borderRadius:'50%',background:'#fffdfa',color:'#842b39',boxShadow:'0 2px 8px #342d2814',cursor:disabled?'not-allowed':'pointer'}}
  onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onReset();}}>
  <svg viewBox="0 0 24 24" width="22" height="22" style={{width:22,height:22}} fill="none" stroke="#357fc0" strokeWidth="1.4" aria-hidden="true">
   <circle cx="12" cy="12" r="9" fill="#edf6ff"/><path d="M12 1v2M21 12h2M12 21v2M1 12h2"/>
   <path d="m15.6 8.4-2.2 5-1.4-1.4-1.4-1.4z" fill="#d74248" stroke="#d74248" strokeLinejoin="round"/>
   <path d="m8.4 15.6 2.2-5 1.4 1.4 1.4 1.4z" fill="#357fc0" stroke="#357fc0" strokeLinejoin="round"/>
   <circle cx="12" cy="12" r=".9" fill="#fffdfa" stroke="none"/>
  </svg>
 </button>;
}
