import type {CabinetEuroRate} from './cabinet-currency';
import type {CabinetSpecification} from './cabinet-specification';

type CabinetProposal = {items:CabinetSpecification[];rate:CabinetEuroRate|null};
export const cabinetProposalReady = 'roomdesign:cabinet-proposal-ready';
export const cabinetProposalData = 'roomdesign:cabinet-proposal-data';

export async function openCabinetProposal(prepare:()=>Promise<CabinetProposal>) {
  const popup=window.open('/room-design-planner/view?cabinet=dresser&proposal=1','_blank');
  if(!popup)throw Error('Разрешите открытие новых вкладок для этого сайта и попробуйте снова.');
  const origin=location.origin;
  let cleanup=()=>{};
  try {
    const ready=new Promise<void>((resolve,reject)=>{
      const receive=(event:MessageEvent)=>{
        if(event.origin===origin&&event.source===popup&&event.data===cabinetProposalReady)resolve();
      };
      const deadline=window.setTimeout(()=>reject(Error('Предпросмотр PowerPoint не загрузился. Попробуйте открыть его ещё раз.')),20000);
      const closed=window.setInterval(()=>{if(popup.closed)reject(Error('Вкладка предпросмотра закрыта.'));},300);
      window.addEventListener('message',receive);
      cleanup=()=>{
        window.clearTimeout(deadline);
        window.clearInterval(closed);
        window.removeEventListener('message',receive);
      };
    });
    const [proposal]=await Promise.all([prepare(),ready]);
    if(popup.closed)return;
    popup.postMessage({type:cabinetProposalData,...proposal},origin);
  }catch(error){
    popup.close();
    throw error;
  }finally{
    cleanup();
  }
}
