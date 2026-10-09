"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-html-link-for-pages, @next/next/no-img-element, react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useState } from "react";
import "../account/account.css";
import "./admin.css";

const sections = [
  ["overview", "Обзор"], ["users", "Пользователи"], ["tokens", "Токены"],
  ["plans", "Тарифы"], ["packages", "Пакеты токенов"], ["payments", "Платежи"],
  ["tenants", "Тенанты"], ["generations", "Генерации"], ["settings", "Настройки"], ["audit", "Журнал действий"],
] as const;
type Section = typeof sections[number][0];

const nf = new Intl.NumberFormat("ru-RU");
const money = (kopecks: unknown, currency = "RUB") => new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(Number(kopecks || 0) / 100);
const when = (value: unknown) => value ? new Date(String(value)).toLocaleString("ru-RU") : "—";
const text = (value: unknown) => value === null || value === undefined || value === "" ? "Нет данных" : String(value);

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Не удалось загрузить данные.");
  return payload;
}

export default function GlobalAdminClient({ admin }: { admin: { id: string; email: string; firstName: string; lastName: string } }) {
  const [section, setSection] = useState<Section>("overview");
  const [data, setData] = useState<any>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const paths = ["overview", "users", "token-transactions", "plans", "token-packages", "payments", "tenants", "generations", "settings", "audit-log"];
      const payloads = await Promise.all(paths.map((path) => api(`/api/admin/${path}`)));
      setData(Object.assign({}, ...payloads));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить админку."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openUser = async (id: string) => {
    setError("");
    try { setSelectedUser((await api(`/api/admin/users/${id}`)).user); setSection("users"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Пользователь не загружен."); }
  };
  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = String(new FormData(event.currentTarget).get("q") || "");
    try { const result = await api(`/api/admin/users?q=${encodeURIComponent(q)}`); setData((current: any) => ({ ...current, users: result.users })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Поиск не выполнен."); }
  };
  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      await api("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token_exchange_rate: Number(form.get("rate")), brutto_coefficient: Number(form.get("brutto")), usd_to_rub_rate: Number(form.get("usd")), token_charging_enabled: form.get("charging") === "on", custom_token_purchase_enabled: form.get("customPurchase") === "on" }) });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Настройки не сохранены."); }
  };
  const transfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      await api("/api/admin/tokens/transfer", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ sourceUserId: form.get("source"), targetUserId: form.get("target"), amount: Number(form.get("amount")), reason: form.get("reason") }) });
      event.currentTarget.reset(); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Перевод не выполнен."); }
  };

  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <a className="admin-logo room-design-wordmark" href="/">ROOM DESIGN</a>
      <nav>{sections.map(([id, label]) => <button className={section === id ? "active" : ""} key={id} onClick={() => { setSection(id); setSelectedUser(null); }}>{label}</button>)}</nav>
      <div className="admin-person"><b>{[admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email}</b><small>{admin.email}</small><a href="/account">Личный кабинет →</a></div>
    </aside>
    <div className="admin-main">
      <header className="admin-header"><div><small>GLOBAL ADMIN</small><h1>{sections.find(([id]) => id === section)?.[1]}</h1></div><button onClick={() => void load()}>Обновить</button></header>
      {error && <p className="admin-alert" role="alert">{error}</p>}
      {loading ? <p className="admin-empty">Загружаем реальные данные…</p> : <>
        {section === "overview" && <Overview data={data.overview}/>}
        {section === "users" && (selectedUser ? <UserDetail user={selectedUser} plans={data.plans || []} onBack={() => setSelectedUser(null)} onChanged={() => void openUser(selectedUser.profile.id)}/> : <Users users={data.users || []} onSearch={search} onOpen={openUser}/>)}
        {section === "tokens" && <Tokens users={data.users || []} transactions={data.transactions || []} onTransfer={transfer}/>}
        {section === "plans" && <Plans plans={data.plans || []}/>}
        {section === "packages" && <Packages packages={data.packages || []}/>}
        {section === "payments" && <Payments payments={data.payments || []}/>}
        {section === "tenants" && <Tenants tenants={data.tenants || []}/>}
        {section === "generations" && <Generations generations={data.generations || []} tracking={data.tracking || {}}/>}
        {section === "settings" && <Settings data={data} onSave={saveSettings}/>}
        {section === "audit" && <Audit entries={data.entries || []}/>}
      </>}
    </div>
  </main>;
}

function Overview({ data }: { data: any }) {
  if (!data) return <Empty/>;
  const cards = [
    ["Всего пользователей", data.users?.total], ["Новые за 30 дней", data.users?.new_users], ["Активные за 30 дней", data.users?.active_users],
    ["Проекты", data.projects?.total], ["Успешные AI operations", data.generations?.successful], ["Ошибки AI", data.generations?.failed],
    ["Общий token balance", data.balances?.total], ["Начислено токенов", data.ledger?.credited], ["Списано токенов", data.ledger?.debited],
  ];
  return <><div className="admin-cards">{cards.map(([label, value]) => <article key={String(label)}><small>{label}</small><b>{value === null || value === undefined ? "Не отслеживается" : nf.format(Number(value))}</b></article>)}</div><div className="admin-grid-two"><Panel title="Платежи"><p>Записей: <b>{nf.format(Number(data.payments?.total || 0))}</b></p><p>Mock/test: <b>{nf.format(Number(data.payments?.mock_count || 0))}</b></p><p>Подтверждённая выручка real provider: <b>{Number(data.payments?.paid_real_count || 0) ? money(data.payments?.paid_real_rub_kopecks) : "Нет реальных платежей"}</b></p></Panel><Panel title="AI economics"><p>Расчётный NET: <b>${Number(data.generations?.estimated_net_usd || 0).toFixed(4)}</b></p><p className="admin-note">Это оценка по provider tokens. Фактическая стоимость провайдера исторически не сохранялась.</p></Panel></div></>;
}

function Users({ users, onSearch, onOpen }: { users: any[]; onSearch: (event: FormEvent<HTMLFormElement>) => void; onOpen: (id: string) => void }) {
  return <Panel title="Зарегистрированные пользователи" action={<form className="admin-search" onSubmit={onSearch}><input name="q" placeholder="Email, имя или компания"/><button>Найти</button></form>}>
    {!users.length ? <Empty/> : <div className="admin-table"><div className="admin-row admin-table-head"><span>Пользователь</span><span>Доступ</span><span>Тариф</span><span>Токены</span><span>Проекты / AI</span></div>{users.map((user) => <button className="admin-row" key={user.id} onClick={() => onOpen(user.id)}><span><b>{[user.first_name, user.last_name].filter(Boolean).join(" ") || "Без имени"}</b><small>{user.email}<br/>{user.company_role || "Компания не указана"}</small></span><span><b>{user.global_role}</b><small>{user.memberships?.map((membership: any) => `${membership.name}: ${membership.role}`).join(" · ") || "Без tenant membership"}</small></span><span>{user.plan_name}</span><span>{nf.format(Number(user.token_balance || 0))}</span><span>{user.project_count} / {user.generation_count}</span></button>)}</div>}
  </Panel>;
}

function UserDetail({ user, plans, onBack, onChanged }: { user: any; plans: any[]; onBack: () => void; onChanged: () => void }) {
  const adjust = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api(`/api/admin/users/${user.profile.id}/tokens`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ direction: form.get("direction"), amount: Number(form.get("amount")), reason: form.get("reason") }) }); event.currentTarget.reset(); onChanged(); } catch (reason) { alert(reason instanceof Error ? reason.message : "Операция не выполнена."); } };
  const assignPlan = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api(`/api/admin/users/${user.profile.id}/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: form.get("planId") }) }); onChanged(); } catch (reason) { alert(reason instanceof Error ? reason.message : "Тариф не назначен."); } };
  return <><button className="admin-back" onClick={onBack}>← Все пользователи</button><div className="admin-user-title"><div><h2>{[user.profile.first_name, user.profile.last_name].filter(Boolean).join(" ") || user.profile.email}</h2><p>{user.profile.email}</p></div><span>{user.profile.global_role}</span></div>
    <div className="admin-grid-two"><Panel title="Профиль"><Key label="Компания" value={user.profile.company_role}/><Key label="Телефон" value={user.profile.phone}/><Key label="Регистрация" value={when(user.profile.created_at)}/><Key label="Последний вход" value={when(user.profile.last_login_at)}/></Panel><Panel title="Доступ">{user.memberships.length ? user.memberships.map((item: any) => <p key={item.id}><b>{item.name}</b> · {item.role}</p>) : <p className="admin-note">Tenant memberships отсутствуют.</p>}</Panel></div>
    <div className="admin-grid-two"><Panel title="Тариф"><p>Текущий: <b>{user.plan?.name || "Free"}</b></p><form className="admin-form" onSubmit={assignPlan}><select name="planId" required defaultValue={user.plan?.plan_id || user.plan?.id}>{plans.map((plan) => <option value={plan.id} key={plan.id}>{plan.name}</option>)}</select><button>Назначить тариф</button></form></Panel><Panel title="Токены"><p>Баланс: <b>{nf.format(Number(user.account.balance || 0))}</b></p><form className="admin-form" onSubmit={adjust}><select name="direction"><option value="credit">Начислить</option><option value="debit">Списать</option></select><input name="amount" type="number" min="1" step="1" required placeholder="Количество"/><input name="reason" required maxLength={500} placeholder="Причина / комментарий"/><button>Выполнить</button></form></Panel></div>
    <Panel title={`Проекты (${user.counts.project_count || 0})`}><MiniRows rows={user.projects} render={(item) => <><span><b>{item.name}</b><small>{item.project_type}</small></span><span>{when(item.updated_at)}</span></>}/></Panel>
    <Panel title={`Генерации (${user.counts.generation_count || 0})`} subtitle="Нажмите на миниатюру, чтобы открыть исходное изображение."><GenerationGallery userId={user.profile.id} initialRows={user.generations || []} total={Number(user.counts.generation_count || 0)}/></Panel>
    <Panel title="Платежи"><MiniRows rows={user.payments} render={(item) => <><span><b>{money(item.amount, item.currency)}</b><small>{item.provider === "mock" ? "MOCK / TEST" : item.provider} · {item.status}</small></span><span>{when(item.created_at)}</span></>}/></Panel>
    <Panel title="История токенов"><MiniRows rows={user.tokenHistory} render={(item) => <><span><b>{item.type}</b><small>{item.description || "Без комментария"}</small></span><span className={Number(item.amount) >= 0 ? "positive" : "negative"}>{Number(item.amount) >= 0 ? "+" : ""}{nf.format(Number(item.amount))}</span></>}/></Panel>
  </>;
}

function GenerationGallery({ userId, initialRows, total }: { userId: string; initialRows: any[]; total: number }) {
  const [rows, setRows] = useState(initialRows);
  const [active, setActive] = useState<any>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!active) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setActive(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [active]);

  const loadMore = async () => {
    setLoadingMore(true); setLoadError("");
    try {
      const payload = await api(`/api/admin/users/${userId}/generations?offset=${rows.length}&limit=24`);
      setRows((current: any[]) => [...current, ...payload.generations.filter((item: any) => !current.some((row) => row.id === item.id))]);
    } catch (reason) { setLoadError(reason instanceof Error ? reason.message : "Не удалось загрузить генерации."); }
    finally { setLoadingMore(false); }
  };

  if (!rows.length) return <Empty/>;
  return <>
    <div className="admin-generation-grid">
      {rows.map((item) => <button className="admin-generation-card" type="button" key={item.id} onClick={() => setActive(item)} aria-label={`Открыть генерацию ${item.operation} от ${when(item.created_at)}`}>
        <span className="admin-generation-thumb"><img src={`/api/admin/generations/${item.id}?variant=thumbnail`} alt="" loading="lazy" decoding="async"/></span>
        <span className="admin-generation-meta"><b>{item.operation}</b><small>{when(item.created_at)}</small></span>
      </button>)}
    </div>
    {loadError && <p className="admin-generation-error" role="alert">{loadError}</p>}
    {rows.length < total && <button className="admin-load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Загружаем…" : `Показать ещё (${Math.min(24, total - rows.length)})`}</button>}
    {active && <div className="admin-generation-modal">
      <button className="admin-generation-backdrop" type="button" aria-label="Закрыть просмотр" onClick={() => setActive(null)}/>
      <div className="admin-generation-dialog" role="dialog" aria-modal="true" aria-label={`Генерация ${active.operation}`}>
        <header><div><b>{active.operation}</b><small>{when(active.created_at)}</small></div><button type="button" aria-label="Закрыть просмотр" onClick={() => setActive(null)}>×</button></header>
        <div className="admin-generation-full"><img src={`/api/admin/generations/${active.id}`} alt={`Результат генерации ${active.operation}`}/></div>
      </div>
    </div>}
  </>;
}

function Tokens({ users, transactions, onTransfer }: { users: any[]; transactions: any[]; onTransfer: (event: FormEvent<HTMLFormElement>) => void }) { return <><Panel title="Перевод токенов"><form className="admin-form transfer" onSubmit={onTransfer}><select name="source" required><option value="">Source account</option>{users.map((user) => <option key={user.id} value={user.id}>{user.email} · {user.token_balance}</option>)}</select><select name="target" required><option value="">Target user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}</select><input name="amount" type="number" min="1" step="1" required placeholder="Количество"/><input name="reason" required placeholder="Причина"/><button>Перевести</button></form></Panel><Panel title="История операций"><MiniRows rows={transactions} render={(item) => <><span><b>{item.email} · {item.type}</b><small>{item.description || "Без комментария"}{item.admin_email ? ` · admin: ${item.admin_email}` : ""}</small></span><span className={Number(item.amount) >= 0 ? "positive" : "negative"}>{Number(item.amount) >= 0 ? "+" : ""}{nf.format(Number(item.amount))}</span></>}/></Panel></>; }
function Plans({ plans }: { plans: any[] }) { return <Panel title="Тарифы" subtitle="Параметры тарифов доступны только для просмотра; назначение выполняется в карточке пользователя."><CardGrid rows={plans} render={(plan) => <><small>{plan.code} · {plan.active ? "активен" : "отключён"}</small><h3>{plan.name}</h3><p>{plan.description || "Без описания"}</p><b>{money(plan.price, plan.currency)} / {plan.billing_period || "—"}</b><p>Включено: {nf.format(Number(plan.included_tokens || 0))} токенов</p><p>Пользователей: {plan.user_count}</p><code>{plan.limits_json || "{}"}</code></>}/></Panel>; }
function Packages({ packages }: { packages: any[] }) { return <Panel title="Пакеты токенов" subtitle="Используются реальные записи token_packages; редактирование в этой итерации не добавлялось."><CardGrid rows={packages} render={(item) => <><small>{item.code} · {item.active ? "активен" : "отключён"}</small><h3>{item.name}</h3><b>{nf.format(Number(item.token_amount))} токенов</b><p>{money(item.price, item.currency)}</p></>}/></Panel>; }
function Payments({ payments }: { payments: any[] }) { return <Panel title="Платежи"><MiniRows rows={payments} render={(item) => <><span><b>{item.email} · {money(item.amount, item.currency)}</b><small>{item.provider === "mock" ? "MOCK / TEST" : item.provider} · {item.purpose} · tokens: {item.token_amount}</small></span><span><b>{item.status}</b><small>{when(item.created_at)}</small></span></>}/></Panel>; }
function Tenants({ tenants }: { tenants: any[] }) { return <Panel title="Тенанты"><CardGrid rows={tenants} render={(tenant) => <><small>{tenant.id}</small><h3>{tenant.name}</h3><p>{tenant.slug} · {tenant.status}</p><b>{tenant.member_count} участников · {tenant.admin_count} admin/owner</b><div className="admin-members">{tenant.memberships?.map((item: any) => <span key={item.user_id}>{item.email} · {item.role}</span>)}</div></>}/></Panel>; }
function Generations({ generations, tracking }: { generations: any[]; tracking: any }) { return <><p className="admin-info">Model, status/error, project, duration и actual provider cost исторически не сохранялись. Эти поля показаны как «Нет данных» и не подменяются оценками.</p><Panel title="Генерации"><MiniRows rows={generations} render={(item) => <><span><b>{item.email} · {item.operation}</b><small>{item.tenant_name || item.tenant_id} · {when(item.created_at)}</small></span><span><b>{text(item.token_cost)} tokens</b><small>Model: {tracking.model ? text(item.model) : "Нет данных"} · NET estimate: ${Number(item.estimated_net_usd || 0).toFixed(4)}</small></span></>}/></Panel></>; }
function Settings({ data, onSave }: { data: any; onSave: (event: FormEvent<HTMLFormElement>) => void }) { const settings = data.settings; return <><Panel title="Global settings" subtitle="Raw secrets и API keys не загружаются и не отображаются.">{settings ? <form className="admin-settings" onSubmit={onSave}><label>Tokens / RUB<input name="rate" type="number" min="1" step="1" defaultValue={settings.token_exchange_rate}/></label><label>Brutto coefficient<input name="brutto" type="number" min="0.01" step="0.01" defaultValue={settings.brutto_coefficient}/></label><label>USD / RUB<input name="usd" type="number" min="0.01" step="0.01" defaultValue={settings.usd_to_rub_rate}/></label><label className="check"><input name="charging" type="checkbox" defaultChecked={settings.token_charging_enabled}/> Списание токенов за AI</label><label className="check"><input name="customPurchase" type="checkbox" defaultChecked={settings.custom_token_purchase_enabled}/> Произвольная покупка токенов</label><button>Сохранить настройки</button></form> : <Empty/>}</Panel><Panel title="Generation pricing (read-only)"><MiniRows rows={data.aiOperationPrices || []} render={(item) => <><span><b>{item.operation}</b><small>{item.active ? "Активно" : "Отключено"}</small></span><span>${Number(item.estimated_netto_usd).toFixed(4)} NET estimate</span></>}/></Panel><Panel title="История настроек"><MiniRows rows={data.history || []} render={(item) => <><span><b>{item.setting_key}</b><small>{item.old_value_json} → {item.new_value_json}</small></span><span>{when(item.created_at)}</span></>}/></Panel></>; }
function Audit({ entries }: { entries: any[] }) { return <Panel title="Журнал действий"><MiniRows rows={entries} render={(item) => { let details: any = {}; try { details = JSON.parse(item.metadata_json || "{}"); } catch { details = {}; } return <><span><b>{item.action}</b><small>admin: {item.admin_email || "system"} · target: {item.target_user_email || item.entity_id || "—"}</small><small>{details.reason || details.planName || ""}</small></span><span>{when(item.created_at)}</span></>; }}/></Panel>; }

function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) { return <section className="admin-panel"><header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}</section>; }
function Empty() { return <p className="admin-empty">Записей пока нет.</p>; }
function Key({ label, value }: { label: string; value: unknown }) { return <p className="admin-key"><small>{label}</small><b>{text(value)}</b></p>; }
function MiniRows({ rows, render }: { rows: any[]; render: (row: any) => React.ReactNode }) { return !rows?.length ? <Empty/> : <div className="admin-list">{rows.map((row, index) => <div key={row.id || `${row.operation || "row"}-${index}`}>{render(row)}</div>)}</div>; }
function CardGrid({ rows, render }: { rows: any[]; render: (row: any) => React.ReactNode }) { return !rows?.length ? <Empty/> : <div className="admin-card-grid">{rows.map((row, index) => <article key={row.id || index}>{render(row)}</article>)}</div>; }
