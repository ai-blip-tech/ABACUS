"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, @next/next/no-html-link-for-pages */

import { useEffect, useState } from "react";
import "./account.css";

type Data = Record<string, any>;
const nf = new Intl.NumberFormat("ru-RU");
const when = (value?: string) => value ? new Date(value).toLocaleDateString("ru-RU") : "—";

export default function AccountPage() {
  const [data, setData] = useState<Data>({});
  const [error, setError] = useState("");
  const [google, setGoogle] = useState(false);
  const [rubles, setRubles] = useState(1000);
  const load = async () => {
    const names = ["profile", "tokens", "plan", "token-history", "generations", "payments"];
    const responses = await Promise.all(names.map((name) => fetch(`/api/account/${name}`)));
    if (responses.some((response) => response.status === 401)) throw new Error("Войдите в Room Design, чтобы открыть личный кабинет.");
    setData(Object.assign({}, ...await Promise.all(responses.map((response) => response.json()))));
  };
  useEffect(() => {
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить кабинет."));
    void fetch("/api/auth/google/status").then((r) => r.json()).then((v) => setGoogle(Boolean(v.enabled))).catch(() => undefined);
  }, []);
  const buy = async (packageId?: string) => {
    const response = await fetch("/api/account/payments", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(packageId ? { packageId } : { rubles }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Не удалось создать платёж."); else await load();
  };
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); location.assign("/"); };
  if (!data.profile) return <main className="account-shell solo"><section className="account-signin"><b>ROOM design</b><h1>Личный кабинет</h1><p>{error || "Загружаем…"}</p>{error && <><a href="/">Войти по email и паролю</a>{google && <a className="secondary" href="/api/auth/google">Продолжить с Google</a>}</>}</section></main>;
  return <main className="account-shell">
    <aside><a className="logo" href="/">ROOM <span>design</span></a><nav>{["Профиль","Тариф и токены","Купить токены","История токенов","История генераций","Платежи","Настройки","Безопасность"].map((x,i)=><a key={x} href={`#s${i}`}>{x}</a>)}</nav><button onClick={logout}>Выйти</button></aside>
    <div className="account-content"><header><small>ЛИЧНЫЙ КАБИНЕТ</small><h1>Здравствуйте, {data.profile.first_name || data.profile.email}</h1><p>Глобальный профиль Room Design, тарифы и операции с токенами.</p></header>{error && <p className="alert">{error}</p>}
      <section className="stats"><article><small>ТАРИФ</small><b>{data.plan?.name || "Free"}</b></article><article><small>БАЛАНС</small><b>{nf.format(data.account?.balance || 0)}</b><span>токенов</span></article><article><small>ОПЕРАЦИИ</small><b>{data.transactions?.length || 0}</b></article></section>
      <Panel id="s0" title="Профиль"><div className="grid">{[["Имя",data.profile.first_name],["Фамилия",data.profile.last_name],["Email",data.profile.email],["Телефон",data.profile.phone],["Компания / должность",data.profile.company_role],["Дата регистрации",when(data.profile.created_at)]].map(([a,b])=><p key={a}><small>{a}</small>{b || "—"}</p>)}</div><h3>Способы входа</h3><div className="tags">{data.identities?.map((x:any)=><span key={x.provider}>{x.provider === "google" ? "Google" : "Email + пароль"}</span>)}</div><h3>Tenant memberships</h3>{data.memberships?.length ? data.memberships.map((x:any)=><p key={x.id}>{x.name} · {x.role}</p>) : <p className="muted">Привязок к организациям нет.</p>}</Panel>
      <Panel id="s1" title="Тариф и токены"><p>{data.plan?.name || "Free"} · включено {nf.format(data.plan?.included_tokens || 0)} токенов</p><p>Расчётная стоимость новой AI-операции: <b>{nf.format(data.generationQuote?.tokenCost || 0)} токенов</b>{data.generationQuote?.chargingEnabled ? "" : " · списание пока отключено глобальной настройкой"}</p></Panel>
      <Panel id="s2" title="Купить токены"><div className="buy"><input type="number" min="1" value={rubles} onChange={(e)=>setRubles(Number(e.target.value))}/><span>₽ — итог по текущему серверному курсу</span><button onClick={()=>void buy()}>Создать mock-платёж</button></div><div className="packages">{data.packages?.map((x:any)=><button key={x.id} onClick={()=>void buy(x.id)}><b>{x.name}</b><span>{nf.format(x.token_amount)} токенов · {(x.price/100).toLocaleString("ru-RU")} ₽</span></button>)}</div></Panel>
      <Panel id="s3" title="История токенов"><List rows={data.transactions} left="type" right="amount"/></Panel>
      <Panel id="s4" title="История генераций"><List rows={data.generations} left="operation" right="token_cost"/></Panel>
      <Panel id="s5" title="Платежи"><List rows={data.payments} left="status" right="token_amount"/></Panel>
      <Panel id="s6" title="Настройки и безопасность"><p className="muted">Глобальный профиль отделён от tenant membership. Пароли и OAuth-секреты никогда не выводятся в кабинет.</p></Panel>
    </div>
  </main>;
}

function Panel({id,title,children}:{id:string;title:string;children:React.ReactNode}) { return <section id={id} className="panel"><h2>{title}</h2>{children}</section>; }
function List({rows=[],left,right}:{rows?:any[];left:string;right:string}) { return <div className="list">{rows.map((x)=><p key={x.id}><span>{x[left]}<small>{when(x.created_at)}</small></span><b>{nf.format(Number(x[right]||0))}</b></p>)}</div>; }
