"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-html-link-for-pages */
import { useEffect, useState } from "react";
import "../account/account.css";
import "./admin.css";

type Access = "loading" | "guest" | "user" | "admin" | "error";

export default function GlobalAdminPage() {
  const [access,setAccess]=useState<Access>("loading");
  const [data,setData]=useState<any>({});
  const [error,setError]=useState("");
  const load=async()=>{const names=["users","token-transactions","payments","settings"];const rs=await Promise.all(names.map(x=>fetch(`/api/admin/${x}`)));if(rs.some(x=>!x.ok))throw new Error("Не удалось загрузить данные администрирования.");setData(Object.assign({},...await Promise.all(rs.map(x=>x.json()))));};
  useEffect(()=>{void fetch("/api/auth/me").then(async response=>{if(response.status===401){setAccess("guest");return;}if(!response.ok)throw new Error("Не удалось проверить доступ.");const payload=await response.json();if(!payload.user){setAccess("guest");return;}if(payload.user.role!=="admin"){setAccess("user");return;}setAccess("admin");await load();}).catch(reason=>{setError(reason instanceof Error?reason.message:"Не удалось проверить доступ.");setAccess("error");});},[]);
  const save=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=new FormData(e.currentTarget);const response=await fetch("/api/admin/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({token_exchange_rate:Number(form.get("rate")),brutto_coefficient:Number(form.get("brutto"))})});if(!response.ok)setError((await response.json()).error);else await load();};
  const transfer=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=new FormData(e.currentTarget);const response=await fetch("/api/admin/tokens/transfer",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({sourceUserId:form.get("source"),targetUserId:form.get("target"),amount:Number(form.get("amount")),reason:form.get("reason")})});if(!response.ok)setError((await response.json()).error);else await load();};
  const assignPlan=async(userId:string,planCode:string)=>{setError("");const response=await fetch(`/api/admin/users/${userId}/plan`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({planCode})});if(!response.ok)setError((await response.json()).error);else await load();};

  if(access!=="admin")return <AdminAccess access={access} error={error}/>;
  return <main className="account-shell"><aside><a className="logo" href="/?view=projects">ROOM <span>admin</span></a><nav>{["Users","Token balances","Token transfers","Token history","Tariffs","Token packages","Payments","AI Netto / Brutto","Global settings","Tenants","Audit log"].map((x,i)=><a key={x} href={`#a${i}`}>{x}</a>)}</nav><a href="/account">Личный кабинет</a></aside><div className="account-content"><header><small>GLOBAL ADMIN</small><h1>Управление Room Design</h1><p>Глобальные настройки, пользователи, токены и платежи.</p></header>{error&&<p className="alert">{error}</p>}
    <section id="a0" className="panel"><h2>Users, plans & token balances</h2><div className="admin-user-list">{data.users?.map((x:any)=><article key={x.id}><span><b>{[x.first_name,x.last_name].filter(Boolean).join(" ")||x.email}</b><small>{x.email} · {x.global_role}</small></span><label>Тариф<select aria-label={`Тариф для ${x.email}`} value={x.plan_code} onChange={(event)=>void assignPlan(x.id,event.target.value)}>{data.plans?.map((plan:any)=><option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></label><strong>{Number(x.token_balance).toLocaleString("ru-RU")} tokens</strong></article>)}</div></section>
    <section id="a2" className="panel"><h2>Token transfer</h2><form className="buy" onSubmit={transfer}><select name="source" required>{data.users?.map((x:any)=><option key={x.id} value={x.id}>{x.email} ({x.token_balance})</option>)}</select><select name="target" required>{data.users?.map((x:any)=><option key={x.id} value={x.id}>{x.email}</option>)}</select><input name="amount" type="number" min="1" required placeholder="Tokens"/><input name="reason" placeholder="Reason"/><button>Перевести</button></form></section>
    <section id="a8" className="panel"><h2>Global settings</h2>{data.settings&&<form className="buy" onSubmit={save}><label>Tokens / RUB <input name="rate" type="number" min="1" defaultValue={data.settings.token_exchange_rate}/></label><label>Brutto coefficient <input name="brutto" type="number" min="0.01" step="0.01" defaultValue={data.settings.brutto_coefficient}/></label><button>Сохранить</button></form>}</section>
    <section id="a3" className="panel"><h2>Token history</h2><div className="list">{data.transactions?.map((x:any)=><p key={x.id}><span>{x.email} · {x.type}<small>{x.description}</small></span><b>{Number(x.amount).toLocaleString("ru-RU")}</b></p>)}</div></section>
    <section id="a6" className="panel"><h2>Payments</h2><div className="list">{data.payments?.map((x:any)=><p key={x.id}><span>{x.email} · {x.status}<small>rate snapshot: {x.exchange_rate_snapshot}</small></span><b>{(x.amount/100).toLocaleString("ru-RU")} {x.currency}</b></p>)}</div></section>
  </div></main>;
}

function AdminAccess({access,error}:{access:Access;error:string}){
  const guest=access==="guest";
  return <main className="admin-access-page"><section className="admin-access-card"><a className="admin-access-logo" href="/">ROOM <span>design</span></a><small>ДОСТУП</small><h1>{access==="loading"?"Проверяем доступ…":guest?"Вход в Room Design":access==="user"?"Доступ ограничен":"Не удалось проверить доступ"}</h1><p>{access==="loading"?"Это займёт несколько секунд.":guest?"Войдите в аккаунт, чтобы продолжить.":access==="user"?"Этот раздел доступен только администратору Room Design":error}</p>{guest&&<a className="admin-access-primary" href="/?auth=login&returnTo=/admin">Войти</a>}{access==="user"&&<a className="admin-access-primary" href="/account">Вернуться в личный кабинет</a>}{access==="error"&&<a className="admin-access-primary" href="/">Вернуться в Room Design</a>}</section></main>;
}
