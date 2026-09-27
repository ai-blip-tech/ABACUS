"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./account.css";
import "./account-forms.css";

type Data = Record<string, any>;
const nf = new Intl.NumberFormat("ru-RU");
const when = (value?: string) => value ? new Date(value).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" }) : "—";
const operationNames: Record<string, string> = { generate: "Генерация интерьера", replace: "Замена предмета", place: "Добавление предмета", remove: "Удаление предмета", adjust: "Корректировка", upscale: "Улучшение качества", plan_render: "Визуализация планировки" };

export default function AccountPage() {
  const router = useRouter();
  const [data, setData] = useState<Data>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [google, setGoogle] = useState(false);
  const [rubles, setRubles] = useState(1000);

  const load = async () => {
    const names = ["profile", "tokens", "plan", "token-history", "generations"];
    const responses = await Promise.all(names.map((name) => fetch(`/api/account/${name}`)));
    if (responses.some((response) => response.status === 401)) throw new Error("Войдите в Room Design, чтобы открыть личный кабинет.");
    const combined = Object.assign({}, ...await Promise.all(responses.map((response) => response.json())));
    if (combined.purchase?.paymentsEnabled) {
      const payments = await fetch("/api/account/payments");
      if (payments.ok) Object.assign(combined, await payments.json());
    }
    setData(combined);
  };

  useEffect(() => {
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить кабинет."));
    void fetch("/api/auth/google/status").then((response) => response.json()).then((value) => setGoogle(Boolean(value.enabled))).catch(() => undefined);
  }, []);

  const buy = async (packageId?: string) => {
    setError(""); setMessage("");
    const response = await fetch("/api/account/payments", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(packageId ? { packageId } : { rubles }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Не удалось перейти к оплате.");
    else { setMessage("Запрос на оплату создан."); await load(); }
  };

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: form.get("firstName"), lastName: form.get("lastName"), phone: form.get("phone"), companyRole: form.get("companyRole") }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Не удалось сохранить профиль.");
    else { setMessage("Профиль сохранён."); await load(); }
  };

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    if (form.get("newPassword") !== form.get("passwordConfirmation")) { setError("Новые пароли не совпадают."); return; }
    const response = await fetch("/api/account/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Не удалось изменить пароль.");
    else { event.currentTarget.reset(); setMessage("Пароль изменён."); }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  if (!data.profile) return <main className="account-shell solo"><section className="account-signin"><b>ROOM design</b><h1>Личный кабинет</h1><p>{error || "Загружаем…"}</p>{error && <><a href="/?auth=login&returnTo=/account">Войти по email и паролю</a>{google && <a className="secondary" href="/api/auth/google?returnTo=/account">Продолжить с Google</a>}</>}</section></main>;

  const paymentsEnabled = Boolean(data.purchase?.paymentsEnabled);
  const isFree = data.plan?.code === "free" && Boolean(data.plan?.no_debit);
  const aiTransactions = (data.transactions || []).filter((transaction:any) => transaction.type === "generation");
  const sections = [
    ["Профиль", "profile"],
    ["Тариф и токены", "plan"],
    ...(paymentsEnabled ? [["Купить токены", "buy-tokens"]] : []),
    ["История токенов", "token-history"],
    ["История генераций", "generation-history"],
    ...(paymentsEnabled ? [["Платежи", "payments"]] : []),
    ["Безопасность", "security"],
  ];

  return <main className="account-shell">
    <aside><a className="logo" href="/?view=projects">ROOM <span>design</span></a><a className="account-back" href="/?view=projects">← К проектам</a><nav>{sections.map(([label,id]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav><button className="account-logout" onClick={logout}>Выйти</button></aside>
    <div className="account-content"><header><small>ЛИЧНЫЙ КАБИНЕТ</small><h1>Здравствуйте, {data.profile.first_name || data.profile.email}</h1><p>Профиль, тариф и история работы в Room Design.</p></header>{error && <p className="alert">{error}</p>}{message && <p className="success">{message}</p>}
      <section className="stats"><article><small>ТАРИФ</small><b>{isFree ? "FREE" : data.plan?.name}</b><span>{isFree ? "Тестовый тариф" : "Текущий тариф"}</span></article><article><small>{isFree ? "РЕЖИМ" : "БАЛАНС"}</small><b>{isFree ? "Без списаний" : nf.format(data.account?.balance || 0)}</b><span>{isFree ? "для AI-генераций" : "токенов"}</span></article><article><small>AI-ОПЕРАЦИИ</small><b>{aiTransactions.length}</b><span>зафиксировано</span></article></section>
      <Panel id="profile" title="Профиль"><form className="settings-form" onSubmit={saveProfile}><label>Имя<input name="firstName" defaultValue={data.profile.first_name || ""}/></label><label>Фамилия<input name="lastName" defaultValue={data.profile.last_name || ""}/></label><label>Email<input value={data.profile.email} disabled readOnly/></label><label>Телефон<input name="phone" defaultValue={data.profile.phone || ""}/></label><label>Компания / должность<input name="companyRole" defaultValue={data.profile.company_role || ""}/></label><label>Дата регистрации<input value={when(data.profile.created_at)} disabled readOnly/></label><button>Сохранить профиль</button></form></Panel>
      <Panel id="plan" title="Тариф и токены">{isFree ? <div className="free-plan"><b>FREE</b><div><strong>Генерации в тестовом режиме без списания токенов</strong><p>Расчётная стоимость каждой операции продолжает фиксироваться в истории.</p></div></div> : <><p>Тариф: <b>{data.plan?.name}</b></p><p>Текущий баланс: <b>{nf.format(data.account?.balance || 0)} токенов</b></p></>}<p>Расчётная стоимость новой AI-операции: <b>{nf.format(data.generationQuote?.tokenCost || 0)} токенов</b></p></Panel>
      {paymentsEnabled && <Panel id="buy-tokens" title="Купить токены"><div className="buy"><input type="number" min="1" value={rubles} onChange={(event) => setRubles(Number(event.target.value))}/><span>₽ = {nf.format(Math.floor(rubles * Number(data.purchase?.exchangeRate || 0)))} токенов</span><button disabled={!data.purchase?.customPurchaseEnabled} onClick={() => void buy()}>Перейти к оплате</button></div><div className="packages">{data.packages?.map((tokenPackage:any) => <button key={tokenPackage.id} onClick={() => void buy(tokenPackage.id)}><b>{tokenPackage.name}</b><span>{nf.format(tokenPackage.token_amount)} токенов · {(tokenPackage.price/100).toLocaleString("ru-RU")} ₽</span></button>)}</div></Panel>}
      <Panel id="token-history" title="История токенов"><TokenHistory rows={aiTransactions}/></Panel>
      <Panel id="generation-history" title="История генераций"><GenerationHistory rows={data.generations}/></Panel>
      {paymentsEnabled && <Panel id="payments" title="Платежи"><SimpleList rows={data.payments}/></Panel>}
      <Panel id="security" title="Безопасность и способы входа"><div className="tags">{data.identities?.map((identity:any) => <span key={identity.provider}>{identity.provider === "google" ? "Google" : "Email + пароль"}</span>)}</div>{data.identities?.some((identity:any) => identity.provider === "password") && <form className="password-form" onSubmit={changePassword}><label>Текущий пароль<input name="currentPassword" type="password" autoComplete="current-password" required/></label><label>Новый пароль<input name="newPassword" type="password" autoComplete="new-password" minLength={10} required/></label><label>Повторите новый пароль<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={10} required/></label><button>Изменить пароль</button></form>}</Panel>
    </div>
  </main>;
}

function Panel({id,title,children}:{id:string;title:string;children:React.ReactNode}) { return <section id={id} className="panel"><h2>{title}</h2>{children}</section>; }

function TokenHistory({rows=[]}:{rows?:any[]}) {
  if (!rows.length) return <p className="empty-state">AI-операций пока нет.</p>;
  return <div className="token-history"><div className="history-row history-head"><span>Операция</span><span>Расчёт</span><span>Списано</span><span>Баланс после</span><span>Статус</span></div>{rows.map((row) => <div className="history-row" key={row.id}><span><b>{operationNames[row.operation] || row.operation}</b><small>{row.projectName || "Без проекта"} · {when(row.createdAt)}</small></span><span>{nf.format(row.calculatedTokenCost || 0)}</span><span>{nf.format(row.actualDebit || 0)}</span><span>{nf.format(row.balanceAfter || 0)}</span><span><em className={row.noDebit ? "status-free" : "status-complete"}>{row.noDebit ? row.status === "completed" ? "FREE · без списания" : "FREE · не завершено" : row.status === "completed" ? "Завершено" : "Не завершено"}</em></span></div>)}</div>;
}

function GenerationHistory({rows=[]}:{rows?:any[]}) {
  if (!rows.length) return <p className="empty-state">Сохранённых результатов пока нет.</p>;
  return <div className="generation-history">{rows.map((row) => <a href={row.previewUrl} target="_blank" rel="noreferrer" key={row.id}><img src={row.previewUrl} alt={operationNames[row.operation] || "Результат генерации"}/><span><b>{operationNames[row.operation] || row.operation}</b><small>{row.project_name_snapshot || "Без проекта"}</small><small>{when(row.created_at)} · {nf.format(row.token_cost || 0)} токенов</small></span><strong>Открыть ↗</strong></a>)}</div>;
}

function SimpleList({rows=[]}:{rows?:any[]}) { return <div className="list">{rows.length ? rows.map((row) => <p key={row.id}><span>{when(row.created_at)}</span><b>{nf.format(Number(row.token_amount || 0))}</b></p>) : <p className="empty-state">Записей пока нет.</p>}</div>; }
