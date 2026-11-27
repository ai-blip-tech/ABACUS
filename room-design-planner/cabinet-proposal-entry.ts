import {cabinetProposalData,cabinetProposalReady} from './cabinet-proposal-window';
import {createCabinetSpecification} from './cabinet-specification-pptx';
import {fetchCabinetEuroRate,type CabinetEuroRate} from './cabinet-currency';
import type {CabinetSpecification} from './cabinet-specification';
import './cabinet-proposal.css';

const status=document.querySelector<HTMLParagraphElement>('.proposal-status')!;
const slides=document.querySelector<HTMLDivElement>('.proposal-slides')!;
const download=document.querySelector<HTMLAnchorElement>('.proposal-download')!;
const opener=window.opener as Window|null;
const origin=location.origin;
const noSelection='Вернитесь в конфигуратор, добавьте товары в избранное и снова откройте PowerPoint.';

function showError(message:string){
  status.textContent=message;
  status.setAttribute('role','alert');
}

if(!opener){
  showError(noSelection);
}else{
  const receive=async(event:MessageEvent<{type:string;items:CabinetSpecification[];rate:CabinetEuroRate|null}>)=>{
    if(event.origin!==origin||event.source!==opener||event.data?.type!==cabinetProposalData)return;
    window.removeEventListener('message',receive);
    window.clearTimeout(deadline);
    window.opener=null;
    if(!event.data.items?.length){
      showError(noSelection);
      return;
    }
    try{
      const rate=await fetchCabinetEuroRate().catch(()=>event.data.rate?{...event.data.rate,stale:true}:null);
      const proposal=await createCabinetSpecification(event.data.items,rate);
      slides.append(...proposal.slides);
      const file=await proposal.write();
      const url=URL.createObjectURL(file);
      download.href=url;
      download.download='NORR_Mobler_Спецификация_мебели.pptx';
      download.hidden=false;
      status.remove();
      window.addEventListener('pagehide',event=>{if(!event.persisted)URL.revokeObjectURL(url);});
    }catch{
      showError('Не удалось подготовить PowerPoint. Откройте предпросмотр из конфигуратора ещё раз.');
    }
  };
  const deadline=window.setTimeout(()=>{
    window.removeEventListener('message',receive);
    showError(noSelection);
  },25000);
  window.addEventListener('message',receive);
  opener.postMessage(cabinetProposalReady,origin);
}
