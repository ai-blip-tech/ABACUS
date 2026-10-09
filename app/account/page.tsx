"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AccountDropdown from "../account-dropdown";
import "../account-dropdown.css";
import "./account.css";

type Data = Record<string, any>;
type SectionId = "profile" | "plan" | "purchase" | "tokens" | "renders" | "payments" | "settings" | "security";

const nf = new Intl.NumberFormat("ru-RU");
const when = (value?: string, withTime = false) => value ? new Intl.DateTimeFormat("ru-RU", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value)) : "—";
const nav: Array<{ id: SectionId; label: string; eyebrow: string; title: string; subtitle: string }> = [
  { id: "profile", label: "Профиль", eyebrow: "01 / ЛИЧНЫЙ КАБИНЕТ", title: "Здравствуйте", subtitle: "Глобальный профиль Room Design, тарифы и операции с токенами." },
  { id: "plan", label: "Тариф и токены", eyebrow: "01 / ТАРИФ", title: "Ваш тариф и токены", subtitle: "Условия тарифа, баланс и расчётная стоимость операций." },
  { id: "purchase", label: "Купить токены", eyebrow: "01 / ПОПОЛНЕНИЕ", title: "Токены для новых идей", subtitle: "Выберите доступный объём пополнения." },
  { id: "tokens", label: "История токенов", eyebrow: "01 / ИСТОРИЯ", title: "Движение токенов", subtitle: "Расчётная история AI-операций и изменений баланса." },
  { id: "renders", label: "История рендеров", eyebrow: "01 / ВИЗУАЛИЗАЦИИ", title: "История рендеров", subtitle: "Все сохранённые результаты и операции в одном месте." },
  { id: "payments", label: "Платежи", eyebrow: "01 / ПЛАТЕЖИ", title: "Платежи", subtitle: "История доступных платёжных операций." },
  { id: "settings", label: "Настройки", eyebrow: "01 / НАСТРОЙКИ", title: "Настройки аккаунта", subtitle: "Персональные параметры работы с Room Design." },
  { id: "security", label: "Безопасность", eyebrow: "01 / БЕЗОПАСНОСТЬ", title: "Безопасность", subtitle: "Способы входа и защита аккаунта." },
];

const roleName = (role?: string) => ({ member: "Участник", admin: "Администратор", owner: "Владелец" }[role || ""] || "Участник");
const operationName = (type?: string) => ({ purchase: "Пополнение", generation: "AI-операция", refund: "Возврат", transfer_in: "Перевод получен", transfer_out: "Перевод отправлен", subscription_credit: "Тарифное начисление", correction: "Корректировка", generate: "Создание визуализации" }[type || ""] || "Операция");

export default function AccountPage() {
  const router = useRouter();
  const [data, setData] = useState<Data>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [google, setGoogle] = useState(false);
  const [active, setActive] = useState<SectionId>("profile");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  const load = async () => {
    const names = ["profile", "tokens", "plan", "token-history", "generations", "payments"];
    const responses = await Promise.all(names.map((name) => fetch(`/api/account/${name}`)));
    if (responses.some((response) => response.status === 401)) throw new Error("Войдите в Room Design, чтобы открыть личный кабинет.");
    if (responses.some((response) => !response.ok)) throw new Error("Не удалось загрузить данные кабинета.");
    setData(Object.assign({}, ...await Promise.all(responses.map((response) => response.json()))));
  };

  useEffect(() => {
    const syncHash = () => {
      const id = window.location.hash.slice(1) as SectionId;
      setActive(nav.some((item) => item.id === id) ? id : "profile");
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить кабинет."));
    void fetch("/api/auth/google/status").then((r) => r.json()).then((v) => setGoogle(Boolean(v.enabled))).catch(() => undefined);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/"); };
  const profileName = [data.profile?.first_name, data.profile?.last_name].filter(Boolean).join(" ");
  const current = nav.find((item) => item.id === active) || nav[0];
  const title = active === "profile" ? `Здравствуйте${data.profile?.first_name ? `, ${data.profile.first_name}` : ""}` : current.title;
  const userForDropdown = useMemo(() => data.profile ? ({ email: data.profile.email, firstName: data.profile.first_name || "", lastName: data.profile.last_name || "", role: data.profile.global_role === "admin" ? "admin" as const : "user" as const }) : null, [data.profile]);

  const choose = (id: SectionId) => { setActive(id); setMenuOpen(false); window.history.replaceState(null, "", `#${id}`); };
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: form.get("firstName"), lastName: form.get("lastName"), phone: form.get("phone"), companyRole: form.get("companyRole") }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return setError(result.error || "Не удалось сохранить профиль.");
    await load(); setNotice("Изменения сохранены.");
  };
  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") || "");
    const newPassword = String(form.get("newPassword") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    if (newPassword !== confirmPassword) return setError("Новые пароли не совпадают.");
    const response = await fetch("/api/account/password", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return setError(result.error || "Не удалось изменить пароль.");
    event.currentTarget.reset(); setNotice("Пароль изменён.");
  };

  if (!data.profile && !error) return <AccountLoading/>;
  if (!data.profile) return <main className="account-shell account-solo"><section className="account-signin"><span className="account-kicker">ROOM DESIGN</span><h1>Личный кабинет</h1><p>{error}</p><a href="/">Войти по email и паролю</a>{google && <a className="secondary" href="/api/auth/google">Продолжить с Google</a>}</section></main>;

  return <main className="account-shell">
    <button ref={menuButton} className="account-menu-trigger" type="button" aria-expanded={menuOpen} aria-controls="account-sidebar" onClick={() => setMenuOpen((value) => !value)}><span className="room-design-wordmark">ROOM DESIGN</span><b>{menuOpen ? "Закрыть" : "Меню"}</b></button>
    {menuOpen && <button
      className="account-menu-backdrop"
      aria-label="Закрыть меню"
      onClick={() => { setMenuOpen(false); menuButton.current?.focus(); }}
    />}
    <aside id="account-sidebar" className={menuOpen ? "is-open" : ""}>
      <a className="account-logo room-design-wordmark" href="/">ROOM DESIGN</a>
      <p className="account-sidebar-tagline">БОЛЬШЕ, ЧЕМ ИНТЕРЬЕР</p>
      <nav aria-label="Разделы личного кабинета">{nav.map((item) => <a key={item.id} href={`#${item.id}`} aria-current={active === item.id ? "page" : undefined} onClick={(event) => { event.preventDefault(); choose(item.id); }}>{item.label}</a>)}</nav>
      <div className="account-sidebar-bottom"><p>ПРОСТРАНСТВО<br/>ДЛЯ ЛУЧШИХ ИДЕЙ</p><button type="button" onClick={() => void logout()}>Выйти</button></div>
    </aside>

    <div className="account-content">
      <header className="account-masthead">
        <div className="account-masthead-top"><a href="/">← К проектам</a><span>СОЗДАЁМ ПРОСТРАНСТВА, В КОТОРЫХ ЖИВЁТ ЖИЗНЬ</span>{userForDropdown && <AccountDropdown user={userForDropdown} studio/>}</div>
        <div className="account-masthead-grid"><div className="account-heading"><span className="account-kicker">{current.eyebrow}</span><h1>{title}</h1><p>{current.subtitle}</p></div><div className="account-masthead-art"><img src="/images/room-design/room-design-projects-dashboard-hero-reference.avif" alt=""/><p><i/>Good<br/>Rooms<br/>Better<br/>Lives<i/></p></div></div>
      </header>

      <AccountLedger plan={data.plan?.name || "Free"} balance={Number(data.account?.balance || 0)} operations={data.transactions?.length || 0}/>
      {error && <div className="account-message is-error" role="alert">{error}<button type="button" onClick={() => { setError(""); void load().catch(() => setError("Не удалось обновить данные.")); }}>Повторить</button></div>}
      {notice && <div className="account-message is-success" role="status">{notice}</div>}
      <div className="account-view" key={active}>
        {active === "profile" && <ProfileSection data={data}/>}
        {active === "plan" && <PlanSection data={data} onPurchase={() => choose("purchase")}/>}
        {active === "purchase" && <PurchaseSection packages={data.packages || []}/>}
        {active === "tokens" && <TokenHistory rows={data.transactions || []}/>}
        {active === "renders" && <RenderHistory rows={data.generations || []}/>}
        {active === "payments" && <PaymentHistory rows={data.payments || []}/>}
        {active === "settings" && <SettingsSection profile={data.profile} onSubmit={saveProfile}/>}
        {active === "security" && <SecuritySection identities={data.identities || []} onSubmit={changePassword}/>}
      </div>
      <footer className="account-footer"><span>ROOM DESIGN</span><p>{profileName || data.profile.email}</p></footer>
    </div>
  </main>;
}

function AccountLedger({plan,balance,operations}:{plan:string;balance:number;operations:number}) { return <section className="account-ledger" aria-label="Сводка аккаунта">{[["01","ТАРИФ",plan],["02","БАЛАНС",nf.format(balance)],["03","ОПЕРАЦИИ",nf.format(operations)]].map(([number,label,value])=><article key={number}><span className="account-number">{number}<i/></span><div><small>{label}</small><strong>{value}</strong>{label === "БАЛАНС" && <em>токенов</em>}</div></article>)}</section>; }
function AccountSection({number,title,aside,children}:{number:string;title:string;aside?:string;children:React.ReactNode}) { return <section className="account-section"><header><span className="account-number">{number}<i/></span><h2>{title}</h2>{aside && <small>{aside}</small>}</header><div className="account-section-body">{children}</div></section>; }
function Field({label,value}:{label:string;value?:React.ReactNode}) { return <div className="account-field"><small>{label}</small><p>{value || "—"}</p></div>; }
function Empty({children}:{children:string}) { return <div className="account-empty"><span>—</span><p>{children}</p></div>; }

function ProfileSection({data}:{data:Data}) { return <>
  <AccountSection number="04" title="Профиль" aside="ВАШИ ДАННЫЕ И НАСТРОЙКИ"><div className="account-fields"><Field label="Имя" value={data.profile.first_name}/><Field label="Фамилия" value={data.profile.last_name}/><Field label="Email" value={data.profile.email}/><Field label="Телефон" value={data.profile.phone}/><Field label="Компания / должность" value={data.profile.company_role}/><Field label="Дата регистрации" value={when(data.profile.created_at)}/></div><div className="account-profile-meta"><div><small>Способы входа</small><div className="account-tags">{data.identities?.map((item:any)=><span key={item.provider}>{item.provider === "google" ? "Google" : "Email + пароль"}</span>)}</div></div>{data.memberships?.length > 0 && <div><small>Организация</small>{data.memberships.map((item:any)=><p key={item.id}>{item.name} · {roleName(item.role)}</p>)}</div>}</div></AccountSection>
  <AccountSection number="05" title="Тариф и токены" aside="ИНФОРМАЦИЯ О ВАШЕМ ТАРИФЕ"><div className="account-plan-summary"><p><strong>{data.plan?.name || "Free"}</strong> · включено {nf.format(data.plan?.included_tokens || 0)} токенов</p><p>Расчётная стоимость новой AI-операции: <b>{nf.format(data.generationQuote?.tokenCost || 0)} токенов</b></p>{!data.generationQuote?.chargingEnabled && <p className="account-free-note">Стоимость AI-операции рассчитывается и сохраняется в истории. В текущем режиме токены не списываются.</p>}</div></AccountSection>
  </>; }

function PlanSection({data,onPurchase}:{data:Data;onPurchase:()=>void}) { return <AccountSection number="04" title="Тариф и токены" aside="ТЕКУЩИЕ УСЛОВИЯ"><div className="account-plan-hero"><div><small>Текущий тариф</small><strong>{data.plan?.name || "Free"}</strong><p>{data.plan?.description || "Базовый доступ к возможностям Room Design."}</p></div><dl><div><dt>Включено</dt><dd>{nf.format(data.plan?.included_tokens || 0)} токенов</dd></div><div><dt>Баланс</dt><dd>{nf.format(data.account?.balance || 0)} токенов</dd></div><div><dt>Расчёт операции</dt><dd>{nf.format(data.generationQuote?.tokenCost || 0)} токенов</dd></div></dl></div>{!data.generationQuote?.chargingEnabled && <div className="account-info-line">Стоимость AI-операции рассчитывается и сохраняется в истории. В текущем режиме токены не списываются.</div>}<button className="account-primary" type="button" onClick={onPurchase}>Посмотреть варианты пополнения</button></AccountSection>; }
function PurchaseSection({packages}:{packages:any[]}) { return <AccountSection number="04" title="Купить токены" aside="ПОПОЛНИТЕ БАЛАНС"><div className="account-disabled"><span>Пополнение временно недоступно</span><p>Мы откроем покупку токенов после подключения платёжного сервиса. Никакие тестовые платежи с этой страницы не создаются.</p></div>{packages.length > 0 && <div className="account-packages" aria-label="Будущие варианты пополнения">{packages.map((item)=><article key={item.id}><small>{item.name}</small><strong>{nf.format(item.token_amount)} токенов</strong><span>{(item.price/100).toLocaleString("ru-RU")} ₽</span></article>)}</div>}</AccountSection>; }
function TokenHistory({rows}:{rows:any[]}) { return <AccountSection number="04" title="История токенов" aside="ДВИЖЕНИЕ БАЛАНСА">{rows.length ? <div className="account-table-wrap"><table><thead><tr><th>Операция</th><th>Дата</th><th>Статус</th><th>Токены</th></tr></thead><tbody>{rows.map((item)=><tr key={item.id}><td data-label="Операция">{operationName(item.type)}{item.description && <small>{item.description}</small>}</td><td data-label="Дата">{when(item.created_at,true)}</td><td data-label="Статус"><span className="account-status">{item.type === "generation" && Number(item.amount) === 0 ? "Расчёт" : "Проведено"}</span></td><td data-label="Токены" className="is-number">{Number(item.amount) > 0 ? "+" : ""}{nf.format(Number(item.amount || 0))}</td></tr>)}</tbody></table></div> : <Empty>История операций пока пуста.</Empty>}</AccountSection>; }
function RenderHistory({rows}:{rows:any[]}) { return <AccountSection number="04" title="История рендеров" aside="СОХРАНЁННЫЕ ВИЗУАЛИЗАЦИИ">{rows.length ? <div className="account-render-grid">{rows.map((item)=><article key={item.id}>{item.image_deleted_at ? <div className="account-render-deleted">Изображение удалено по политике хранения</div> : <a href={`/api/account/generations/${item.id}`}><img src={`/api/account/generations/${item.id}`} alt={`Результат визуализации ${operationName(item.operation)}`}/><span>Открыть изображение</span></a>}<div><small>{operationName(item.operation)}</small><strong>{when(item.created_at,true)}</strong><p>{nf.format(Number(item.token_cost || 0))} токенов · расчёт</p></div></article>)}</div> : <Empty>Сохранённых рендеров пока нет.</Empty>}</AccountSection>; }
function PaymentHistory({rows}:{rows:any[]}) { const visible = rows.filter((item) => item.provider !== "mock"); return <AccountSection number="04" title="Платежи" aside="ИСТОРИЯ ОПЕРАЦИЙ">{visible.length ? <div className="account-table-wrap"><table><thead><tr><th>Дата</th><th>Сумма</th><th>Статус</th><th>Токены</th></tr></thead><tbody>{visible.map((item)=><tr key={item.id}><td data-label="Дата">{when(item.created_at,true)}</td><td data-label="Сумма">{(item.amount/100).toLocaleString("ru-RU")} {item.currency}</td><td data-label="Статус"><span className="account-status">{item.status === "paid" ? "Оплачен" : "Обрабатывается"}</span></td><td data-label="Токены" className="is-number">{nf.format(Number(item.token_amount || 0))}</td></tr>)}</tbody></table></div> : <Empty>Платежей пока нет.</Empty>}</AccountSection>; }
function SettingsSection({profile,onSubmit}:{profile:any;onSubmit:(event:FormEvent<HTMLFormElement>)=>void}) { return <AccountSection number="04" title="Настройки аккаунта" aside="ЛИЧНЫЕ ДАННЫЕ"><form className="account-form" onSubmit={onSubmit}><label>Имя<input name="firstName" defaultValue={profile.first_name || ""}/></label><label>Фамилия<input name="lastName" defaultValue={profile.last_name || ""}/></label><label>Телефон<input name="phone" defaultValue={profile.phone || ""}/></label><label>Компания / должность<input name="companyRole" defaultValue={profile.company_role || ""}/></label><div className="account-form-actions"><button className="account-primary" type="submit">Сохранить изменения</button></div></form></AccountSection>; }
function SecuritySection({identities,onSubmit}:{identities:any[];onSubmit:(event:FormEvent<HTMLFormElement>)=>void}) { const hasPassword = identities.some((item) => item.provider === "password"); return <><AccountSection number="04" title="Способы входа" aside="ЗАЩИТА АККАУНТА"><div className="account-identities">{identities.map((item)=><article key={item.provider}><span>{item.provider === "google" ? "Google" : "Email + пароль"}</span><small>Подключено {when(item.created_at)}</small></article>)}</div></AccountSection>{hasPassword && <AccountSection number="05" title="Изменить пароль" aside="БЕЗОПАСНОСТЬ"><form className="account-form account-password-form" onSubmit={onSubmit}><label>Текущий пароль<input name="currentPassword" type="password" autoComplete="current-password" required/></label><label>Новый пароль<input name="newPassword" type="password" autoComplete="new-password" minLength={12} required/></label><label>Повторите новый пароль<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required/></label><div className="account-form-actions"><button className="account-primary" type="submit">Изменить пароль</button></div></form></AccountSection>}</>; }
function AccountLoading() { return <main className="account-loading" aria-busy="true"><aside><span className="room-design-wordmark">ROOM DESIGN</span></aside><div><i/><i/><i/><i/></div><span className="sr-only">Загружаем личный кабинет</span></main>; }
