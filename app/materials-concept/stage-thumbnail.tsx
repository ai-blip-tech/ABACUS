"use client";

import {useEffect,useMemo,useState} from "react";

import {fitBoard,type MaterialBoard,type MaterialNode} from "@/lib/material-board/model";

type LoadState={status:"loading"|"ready"|"empty"|"error";board:MaterialBoard|null};
const WIDTH=1000;
const HEIGHT=500;

function nodeSurface(node:MaterialNode){
 if(node.image)return <img src={node.image} alt=""/>;
 if(node.kind==="note")return <span className="materials-stage-note">{node.text||node.title}</span>;
 return <span className="materials-stage-swatch" style={{background:node.colour||node.pattern||"#bca88f"}}/>;
}

export default function MaterialsConceptStageThumbnail({projectId}:{projectId:string}){
 const[state,setState]=useState<LoadState>({status:"loading",board:null});
 useEffect(()=>{
  const controller=new AbortController();
  if(!projectId){setState({status:"empty",board:null});return()=>controller.abort();}
  setState({status:"loading",board:null});
  void fetch(`/api/projects/${encodeURIComponent(projectId)}/materials-concept`,{cache:"no-store",signal:controller.signal})
   .then(async response=>{if(!response.ok)throw Error();const payload=await response.json() as {document?:MaterialBoard|null};const board=payload.document||null;setState({status:board?.nodes.some(node=>!node.trayOnly)?"ready":"empty",board});})
   .catch(error=>{if((error as Error).name!=="AbortError")setState({status:"error",board:null});});
  return()=>controller.abort();
 },[projectId]);
 const canvasNodes=useMemo(()=>state.board?.nodes.filter(node=>!node.trayOnly)||[],[state.board]);
 const view=useMemo(()=>fitBoard(canvasNodes,WIDTH,HEIGHT),[canvasNodes]);
 const nodeById=useMemo(()=>new Map(canvasNodes.map(node=>[node.id,node])),[canvasNodes]);
 return <div className="materials-stage-thumbnail" aria-label="Актуальное превью песочницы материалов">
  <div className="materials-stage-grid"/>
  {state.status==="ready"&&<>
   <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">{state.board?.links.map(link=>{const a=nodeById.get(link.from),b=nodeById.get(link.to);if(!a||!b)return null;const x1=a.x+a.width/2,y1=a.y+a.height/2,x2=b.x+b.width/2,y2=b.y+b.height/2;return <line key={link.id} x1={view.x+x1*view.scale} y1={view.y+y1*view.scale} x2={view.x+x2*view.scale} y2={view.y+y2*view.scale}/>;})}</svg>
   {canvasNodes.map(node=><div key={node.id} className={`materials-stage-node is-${node.kind}`} style={{left:view.x+node.x*view.scale,top:view.y+node.y*view.scale,width:node.width*view.scale,height:node.height*view.scale}}>{nodeSurface(node)}</div>)}
  </>}
  {state.status!=="ready"&&<div className="materials-stage-empty">
   <span>{state.status==="loading"?"ЗАГРУЖАЕМ ПЕСОЧНИЦУ":state.status==="error"?"ПРЕВЬЮ ВРЕМЕННО НЕДОСТУПНО":"ПЕСОЧНИЦА ПОКА ПУСТА"}</span>
   <h4>{state.status==="loading"?"Собираем актуальный вид":"Рабочий стол материалов"}</h4>
   <p>{state.status==="error"?"Откройте раздел, чтобы продолжить работу.":"Добавьте референсы, материалы и мебель — они появятся здесь."}</p>
   <div><i/><i/><i/></div>
  </div>}
  <span className="materials-stage-badge">Песочница материалов</span>
 </div>;
}
