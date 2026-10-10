"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-html-link-for-pages, @next/next/no-img-element, react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useState } from "react";
import "../account/account.css";
import "./admin.css";

const sections = [
  ["overview", "Обзор"], ["finance", "AI финансы"], ["users", "Пользователи"], ["tokens", "Токены"],
  ["plans", "Тарифы"], ["packages", "Пакеты токенов"], ["payments", "Платежи"],
  ["tenants", "Тенанты"], ["generations", "Генерации"], ["settings", "Настройки"], ["audit", "Журнал действий"],
] as const;
type Section = typeof sections[number][0];

const nf = new Intl.NumberFormat("ru-RU");
const money = (kopecks: unknown, currency = "RUB") => new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(Number(kopecks || 0) / 100);
const when = (value: unknown) => value ? new Date(String(value)).toLocaleString("ru-RU") : "—";
const text = (value: unknown) => value === null || value === undefined || value === "" ? "Нет данных" : String(value);
const usdFromMicro = (value: unknown) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(Number(value || 0) / 1_000_000);

function CostValues({ exactCount, exactValue, estimatedCount, estimatedValue }: { exactCount: unknown; exactValue: unknown; estimatedCount: unknown; estimatedValue: unknown }) {
  const hasExact = Number(exactCount || 0) > 0;
  const hasEstimate = Number(estimatedCount || 0) > 0;
  if (!hasExact && !hasEstimate) return <b>—</b>;
  return <span className="admin-cost-values">
    {hasExact && <b className="admin-cost-exact">{usdFromMicro(exactValue)}</b>}
    {hasEstimate && <b className="admin-cost-estimated">{usdFromMicro(estimatedValue)}</b>}
  </span>;
}

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
  const [usersFilter, setUsersFilter] = useState<any>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersFeedback, setUsersFeedback] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const usersQuery = typeof window === "undefined" ? "" : window.location.search;
      const paths = ["overview", "ai-finance", `users${usersQuery}`, "token-transactions", "plans", "token-packages", "payments", "tenants", "generations", "settings", "audit-log"];
      const payloads = await Promise.all(paths.map((path) => api(`/api/admin/${path}`)));
      const nextData = Object.assign({}, ...payloads);
      setData(nextData);
      setUsersFilter(nextData.usersFilter || null);
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
    setUsersLoading(true); setUsersFeedback(""); setError("");
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["search", "tenant", "from", "to"]) {
      const value = String(form.get(key) || "").trim();
      if (value) params.set(key, value);
    }
    const query = params.toString();
    try {
      const result = await api(`/api/admin/users${query ? `?${query}` : ""}`);
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
      setUsersFilter(result.usersFilter || null);
      setData((current: any) => ({ ...current, ...result }));
      setUsersFeedback("Фильтры применены, данные обновлены.");
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Поиск не выполнен."); }
    finally { setUsersLoading(false); }
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
        {section === "finance" && <AiFinance initial={data.finance} onError={setError}/>}
        {section === "users" && (selectedUser ? <UserDetail user={selectedUser} plans={data.plans || []} onBack={() => setSelectedUser(null)} onChanged={() => void openUser(selectedUser.profile.id)}/> : <Users users={data.users || []} totals={data.usersTotals || {}} filter={usersFilter || data.usersFilter} tenants={data.tenants || []} onSearch={search} onOpen={openUser} loading={usersLoading} feedback={usersFeedback}/>)}
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
    ["Проекты", data.projects?.total], ["AI operations с учётом", data.aiFinance?.operations], ["Успешные AI operations", data.aiFinance?.succeeded],
    ["Общий token balance", data.balances?.total], ["Начислено токенов", data.ledger?.credited], ["Списано токенов", data.ledger?.debited],
  ];
  return <><div className="admin-cards">{cards.map(([label, value]) => <article key={String(label)}><small>{label}</small><b>{value === null || value === undefined ? "Не отслеживается" : nf.format(Number(value))}</b></article>)}</div><div className="admin-grid-two"><Panel title="Платежи"><p>Записей: <b>{nf.format(Number(data.payments?.total || 0))}</b></p><p>Mock/test: <b>{nf.format(Number(data.payments?.mock_count || 0))}</b></p><p>Подтверждённая выручка real provider: <b>{Number(data.payments?.paid_real_count || 0) ? money(data.payments?.paid_real_rub_kopecks) : "Нет реальных платежей"}</b></p></Panel><Panel title="Фактические AI расходы"><p>NET: <b>{usdFromMicro(data.aiFinance?.net_micro_usd)}</b></p><p>GROSS: <b>{usdFromMicro(data.aiFinance?.gross_micro_usd)}</b></p><p>Точно рассчитано: <b>{nf.format(Number(data.aiFinance?.exactly_priced || 0))} из {nf.format(Number(data.aiFinance?.operations || 0))}</b></p><p className="admin-note">Исторические операции без сохранённой детализации provider usage не подменяются оценкой.</p></Panel></div></>;
}

function AiFinance({ initial, onError }: { initial: any; onError: (value: string) => void }) {
  const [finance, setFinance] = useState(initial);
  const [loading, setLoading] = useState(false);
  const loadPeriod = async (period: string) => { setLoading(true); onError(""); try { setFinance((await api(`/api/admin/ai-finance?period=${period}`)).finance); } catch (reason) { onError(reason instanceof Error ? reason.message : "Финансовые данные не загружены."); } finally { setLoading(false); } };
  if (!finance) return <Empty/>;
  const totals = finance.totals || {};
  return <>
    <div className="admin-period" aria-label="Период AI-финансов">{[["today","Сегодня"],["7d","7 дней"],["30d","30 дней"],["month","Этот месяц"],["last_month","Прошлый месяц"]].map(([key,label]) => <button type="button" className={finance.period?.key === key ? "active" : ""} disabled={loading} key={key} onClick={() => void loadPeriod(key)}>{label}</button>)}</div>
    <p className="admin-info">Фактические usage и цены сохраняются для новых операций. Период: <b>{finance.period?.label}</b>. Старые генерации без ledger не пересчитываются задним числом.</p>
    <Panel title="Действующая тарификация" subtitle="Снимок этих ставок и коэффициента фиксируется отдельно для каждой новой AI-операции."><div className="admin-finance-strip"><span><small>Модель</small><b>{finance.model}</b></span><span><small>Text input / 1M</small><b>{finance.currentPricing ? `$${finance.currentPricing.inputTextUsd}` : "Нет точной цены"}</b></span><span><small>Image input / 1M</small><b>{finance.currentPricing ? `$${finance.currentPricing.inputImageUsd}` : "Нет точной цены"}</b></span><span><small>Image output / 1M</small><b>{finance.currentPricing ? `$${finance.currentPricing.outputImageUsd}` : "Нет точной цены"}</b></span><span><small>GROSS коэффициент</small><b>× {Number(finance.grossCoefficient || 0).toFixed(2)}</b></span></div></Panel>
    <div className="admin-cards"><article><small>AI operations</small><b>{nf.format(Number(totals.operations || 0))}</b></article><article><small>RD tokens списано</small><b>{nf.format(Number(totals.rd_tokens_charged || 0))}</b></article><article><small>Пользователей</small><b>{nf.format(Number(totals.users || 0))}</b></article><article><small>NET</small><b>{usdFromMicro(totals.net_micro_usd)}</b></article><article><small>GROSS</small><b>{usdFromMicro(totals.gross_micro_usd)}</b></article><article><small>Точная цена</small><b>{nf.format(Number(totals.exactly_priced || 0))} / {nf.format(Number(totals.operations || 0))}</b></article></div>
    <div className="admin-grid-two"><Panel title="По дням"><MiniRows rows={finance.days || []} render={(row) => <><span><b>{row.day}</b><small>{row.operations} операций · RD {nf.format(Number(row.rd_tokens_charged || 0))}</small></span><span><b>{usdFromMicro(row.gross_micro_usd)} GROSS</b><small>{usdFromMicro(row.net_micro_usd)} NET</small></span></>}/></Panel><Panel title="По типам операций"><MiniRows rows={finance.operations || []} render={(row) => <><span><b>{row.operation_type}</b><small>{row.operations} операций · RD {nf.format(Number(row.rd_tokens_charged || 0))}</small></span><span><b>{usdFromMicro(row.gross_micro_usd)} GROSS</b><small>{usdFromMicro(row.net_micro_usd)} NET</small></span></>}/></Panel></div>
  </>;
}

function Users({ users, totals, filter, tenants, onSearch, onOpen, loading, feedback }: { users: any[]; totals: any; filter: any; tenants: any[]; onSearch: (event: FormEvent<HTMLFormElement>) => void; onOpen: (id: string) => void; loading: boolean; feedback: string }) {
  const params = new URLSearchParams();
  if (filter?.search) params.set("search", filter.search);
  if (filter?.tenantId) params.set("tenant", filter.tenantId);
  if (filter?.fromDate) params.set("from", filter.fromDate);
  if (filter?.toDate) params.set("to", filter.toDate);
  const exportHref = `/api/admin/users/export?${params.toString()}`;
  return <>
    <Panel title="Фильтры отчёта" subtitle="Период применяется к проектам, генерациям, AI-операциям, токенам и деньгам. Пользователи без активности остаются в списке.">
      <form className="admin-user-filters" key={params.toString()} onSubmit={onSearch}>
        <label>Tenant<select name="tenant" defaultValue={filter?.tenantId || ""}><option value="">Все tenant</option>{tenants.map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.name}</option>)}</select></label>
        <label>Дата с<input name="from" type="date" required defaultValue={filter?.fromDate || ""}/></label>
        <label>Дата по<input name="to" type="date" required defaultValue={filter?.toDate || ""}/></label>
        <label className="admin-user-search">Поиск<input name="search" defaultValue={filter?.search || ""} placeholder="Email, имя или компания"/></label>
        <button type="submit" disabled={loading}>{loading ? "Применяем…" : "Применить"}</button>
        <a className="admin-export" href={exportHref}>Скачать Excel</a>
      </form>
      <p className="admin-filter-status" role="status" aria-live="polite">{feedback}</p>
      <p className="admin-filter-note">Часовой пояс: <b>{filter?.timeZone || "Europe/Moscow"}</b>. Дата «по» включается целиком.</p>
    </Panel>
    <div className="admin-finance-strip admin-users-summary">
      <span><small>Пользователей</small><b>{nf.format(Number(totals.users || 0))}</b></span>
      <span><small>Проектов за период</small><b>{nf.format(Number(totals.project_count || 0))}</b></span>
      <span><small>Генераций за период</small><b>{nf.format(Number(totals.generation_count || 0))}</b></span>
      <span><small>AI operations за период</small><b>{nf.format(Number(totals.ai_operation_count || 0))}</b></span>
      <span><small>RD tokens списано</small><b>{nf.format(Number(totals.ai_rd_tokens_charged || 0))}</b></span>
      <span><small>NET</small><CostValues exactCount={totals.ai_operation_count} exactValue={totals.ai_net_micro_usd} estimatedCount={totals.legacy_estimated_count} estimatedValue={totals.legacy_net_estimate_micro_usd}/></span>
      <span><small>GROSS</small><CostValues exactCount={totals.ai_operation_count} exactValue={totals.ai_gross_micro_usd} estimatedCount={totals.legacy_gross_estimated_count} estimatedValue={totals.legacy_gross_estimate_micro_usd}/></span>
    </div>
    <Panel title="Зарегистрированные пользователи" subtitle={filter ? `Период: ${filter.fromDate} — ${filter.toDate}` : undefined}>
      {!users.length ? <Empty/> : <div className="admin-table admin-users-table"><div className="admin-row admin-table-head"><span>Пользователь</span><span>Доступ</span><span>Тариф</span><span>Токены</span><span>Проекты / генерации</span><span>NET</span><span>GROSS</span></div>{users.map((user) => <button className="admin-row" key={user.id} onClick={() => onOpen(user.id)}><span><b>{[user.first_name, user.last_name].filter(Boolean).join(" ") || "Без имени"}</b><small>{user.email}<br/>{user.company_role || "Компания не указана"}</small></span><span><b>{user.global_role}</b><small>{user.memberships?.map((membership: any) => `${membership.name}: ${membership.role}`).join(" · ") || "Без tenant membership"}</small></span><span>{user.plan_name}</span><span>{nf.format(Number(user.token_balance || 0))}</span><span><b>{nf.format(Number(user.project_count || 0))} / {nf.format(Number(user.generation_count || 0))}</b><small>за выбранный период</small></span><span><CostValues exactCount={user.ai_operation_count} exactValue={user.ai_net_micro_usd} estimatedCount={user.legacy_estimated_count} estimatedValue={user.legacy_net_estimate_micro_usd}/></span><span><CostValues exactCount={user.ai_operation_count} exactValue={user.ai_gross_micro_usd} estimatedCount={user.legacy_gross_estimated_count} estimatedValue={user.legacy_gross_estimate_micro_usd}/></span></button>)}</div>}
    </Panel>
  </>;
}

function UserDetail({ user, plans, onBack, onChanged }: { user: any; plans: any[]; onBack: () => void; onChanged: () => void }) {
  const adjust = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api(`/api/admin/users/${user.profile.id}/tokens`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ direction: form.get("direction"), amount: Number(form.get("amount")), reason: form.get("reason") }) }); event.currentTarget.reset(); onChanged(); } catch (reason) { alert(reason instanceof Error ? reason.message : "Операция не выполнена."); } };
  const assignPlan = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api(`/api/admin/users/${user.profile.id}/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: form.get("planId") }) }); onChanged(); } catch (reason) { alert(reason instanceof Error ? reason.message : "Тариф не назначен."); } };
  return <><button className="admin-back" onClick={onBack}>← Все пользователи</button><div className="admin-user-title"><div><h2>{[user.profile.first_name, user.profile.last_name].filter(Boolean).join(" ") || user.profile.email}</h2><p>{user.profile.email}</p></div><span>{user.profile.global_role}</span></div>
    <div className="admin-grid-two"><Panel title="Профиль"><Key label="Компания" value={user.profile.company_role}/><Key label="Телефон" value={user.profile.phone}/><Key label="Регистрация" value={when(user.profile.created_at)}/><Key label="Последний вход" value={when(user.profile.last_login_at)}/></Panel><Panel title="Доступ">{user.memberships.length ? user.memberships.map((item: any) => <p key={item.id}><b>{item.name}</b> · {item.role}</p>) : <p className="admin-note">Tenant memberships отсутствуют.</p>}</Panel></div>
    <div className="admin-grid-two"><Panel title="Тариф"><p>Текущий: <b>{user.plan?.name || "Free"}</b></p><form className="admin-form" onSubmit={assignPlan}><select name="planId" required defaultValue={user.plan?.plan_id || user.plan?.id}>{plans.map((plan) => <option value={plan.id} key={plan.id}>{plan.name}</option>)}</select><button>Назначить тариф</button></form></Panel><Panel title="Токены"><p>Баланс: <b>{nf.format(Number(user.account.balance || 0))}</b></p><form className="admin-form" onSubmit={adjust}><select name="direction"><option value="credit">Начислить</option><option value="debit">Списать</option></select><input name="amount" type="number" min="1" step="1" required placeholder="Количество"/><input name="reason" required maxLength={500} placeholder="Причина / комментарий"/><button>Выполнить</button></form></Panel></div>
    <Panel title="Фактическая AI-тарификация" subtitle="Только операции, для которых уже записан финансовый ledger."><div className="admin-finance-strip"><span><small>AI operations</small><b>{nf.format(Number(user.aiFinance?.operations || 0))}</b></span><span><small>RD tokens списано</small><b>{nf.format(Number(user.aiFinance?.rd_tokens_charged || 0))}</b></span><span><small>NET</small><b>{usdFromMicro(user.aiFinance?.net_micro_usd)}</b></span><span><small>GROSS</small><b>{usdFromMicro(user.aiFinance?.gross_micro_usd)}</b></span></div></Panel>
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
      {rows.map((item) => item.image_deleted_at ? <article className="admin-generation-card is-deleted" key={item.id}>
        <span className="admin-generation-thumb admin-generation-placeholder">Изображение удалено по политике хранения</span>
        <span className="admin-generation-meta"><b>{item.operation}</b><small>{when(item.created_at)}</small><small>{item.cost_status ? `${usdFromMicro(item.net_micro_usd)} NET · ${usdFromMicro(item.gross_micro_usd)} GROSS` : "Историческая операция — точная цена не записана"}</small></span>
      </article> : <button className="admin-generation-card" type="button" key={item.id} onClick={() => setActive(item)} aria-label={`Открыть генерацию ${item.operation} от ${when(item.created_at)}`}>
        <span className="admin-generation-thumb"><img src={`/api/admin/generations/${item.id}?variant=thumbnail`} alt="" loading="lazy" decoding="async"/></span>
        <span className="admin-generation-meta"><b>{item.operation}</b><small>{when(item.created_at)}</small><small>{item.cost_status ? `${usdFromMicro(item.net_micro_usd)} NET · ${usdFromMicro(item.gross_micro_usd)} GROSS` : "Историческая операция — точная цена не записана"}</small></span>
      </button>)}
    </div>
    {loadError && <p className="admin-generation-error" role="alert">{loadError}</p>}
    {rows.length < total && <button className="admin-load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Загружаем…" : `Показать ещё (${Math.min(24, total - rows.length)})`}</button>}
    {active && <div className="admin-generation-modal">
      <button className="admin-generation-backdrop" type="button" aria-label="Закрыть просмотр" onClick={() => setActive(null)}/>
      <div className="admin-generation-dialog" role="dialog" aria-modal="true" aria-label={`Генерация ${active.operation}`}>
        <header><div><b>{active.operation}</b><small>{when(active.created_at)}</small><small>{active.model || "Модель не записана"} · {active.cost_status || "historical"} · {active.cost_status ? `${usdFromMicro(active.net_micro_usd)} NET / ${usdFromMicro(active.gross_micro_usd)} GROSS` : "нет точной цены"}</small></div><button type="button" aria-label="Закрыть просмотр" onClick={() => setActive(null)}>×</button></header>
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
