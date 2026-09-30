"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";

type AccountSection = "profile" | "plan" | "purchase" | "tokens" | "renders" | "payments" | "settings" | "security";

type AccountUser = {
  email: string;
  firstName: string;
  lastName: string;
  role: "user" | "admin";
  features?: { purchase?: boolean; payments?: boolean };
};

const accountLinks: Array<{ label: string; anchor: AccountSection; feature?: "purchase" | "payments" }> = [
  { label: "Личный кабинет", anchor: "profile" },
  { label: "Тариф и токены", anchor: "plan" },
  { label: "Купить токены", anchor: "purchase", feature: "purchase" },
  { label: "История токенов", anchor: "tokens" },
  { label: "История рендеров", anchor: "renders" },
  { label: "Платежи", anchor: "payments", feature: "payments" },
  { label: "Настройки", anchor: "settings" },
  { label: "Безопасность", anchor: "security" },
];

const sectionFromLocation = (): AccountSection => {
  if (typeof window === "undefined") return "profile";
  const hash = window.location.hash.slice(1) as AccountSection;
  return accountLinks.some((item) => item.anchor === hash) ? hash : "profile";
};

export default function AccountDropdown({ user, studio = false, dashboard = false }: { user: AccountUser; studio?: boolean; dashboard?: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<AccountSection>("profile");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const focusFirstOnOpen = useRef(false);
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const displayName = fullName || user.email;
  const initials = fullName
    ? fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase();
  const visibleLinks = accountLinks.filter((item) => !item.feature || user.features?.[item.feature] !== false);

  useEffect(() => {
    const syncLocation = () => setActive(sectionFromLocation());
    syncLocation();
    window.addEventListener("hashchange", syncLocation);
    window.addEventListener("popstate", syncLocation);
    return () => {
      window.removeEventListener("hashchange", syncLocation);
      window.removeEventListener("popstate", syncLocation);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    if (focusFirstOnOpen.current) requestAnimationFrame(() => firstLinkRef.current?.focus());
    focusFirstOnOpen.current = false;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  const toggle = (event: ReactMouseEvent<HTMLButtonElement>) => {
    focusFirstOnOpen.current = event.detail === 0 && !open;
    setOpen((value) => !value);
  };

  const toggleWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    focusFirstOnOpen.current = !open;
    setOpen((value) => !value);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/");
  };

  const rootClassName = studio ? "account-dropdown studio-account-dropdown" : dashboard ? "account-dropdown dashboard-account-dropdown" : "account-dropdown";
  const triggerClassName = studio ? "account-trigger studio-account-trigger" : dashboard ? "account-trigger dashboard-account-trigger" : "account-trigger";

  return <div className={rootClassName} ref={rootRef}>
    <button
      ref={triggerRef}
      className={triggerClassName}
      type="button"
      aria-label={`Меню пользователя: ${displayName}`}
      aria-haspopup="true"
      aria-controls="account-profile-menu"
      aria-expanded={open}
      onClick={toggle}
      onKeyDown={toggleWithKeyboard}
    >
      <span className="account-trigger-avatar" aria-hidden="true">{initials}</span>
      {!studio && <span className="account-trigger-copy"><b title={displayName}>{displayName}</b></span>}
      {!studio && <span className="account-trigger-chevron" aria-hidden="true">⌄</span>}
    </button>
    {open && <section id="account-profile-menu" className="account-dropdown-card" aria-label="Навигация по аккаунту">
      <div className="account-dropdown-user">
        <span aria-hidden="true">{initials}</span>
        <div><b title={displayName}>{displayName}</b><small title={user.email}>{user.email}</small></div>
      </div>
      <div className="account-dropdown-divider"/>
      <nav aria-label="Разделы аккаунта">{visibleLinks.map((item, index) => <a
        key={item.anchor}
        ref={index === 0 ? firstLinkRef : undefined}
        href={`/account#${item.anchor}`}
        aria-current={active === item.anchor ? "page" : undefined}
        onClick={() => { setActive(item.anchor); setOpen(false); }}
      ><span>{String(accountLinks.indexOf(item) + 1).padStart(2, "0")}</span><i aria-hidden="true"/><b>{item.label}</b></a>)}</nav>
      {user.role === "admin" && <><div className="account-dropdown-divider account-dropdown-admin-divider"/><a className="account-dropdown-admin" href="/admin" onClick={() => setOpen(false)}>Админ-панель</a></>}
      <div className="account-dropdown-divider account-dropdown-logout-divider"/>
      <button className="account-dropdown-logout" type="button" onClick={() => void logout()}><span>09</span><i aria-hidden="true"/><b>Выйти</b></button>
    </section>}
  </div>;
}
