"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import "./account-menu.css";

type AccountMenuProps = {
  email: string | null;
  firstName?: string;
  lastName?: string;
  isGlobalAdmin?: boolean;
  onLogin: () => void;
  onLoggedOut: () => void;
};

const items = [
  ["Личный кабинет", "/account#profile", "user"],
  ["Тариф и токены", "/account#plan", "wallet"],
  ["История", "/account#token-history", "history"],
  ["Безопасность", "/account#security", "lock"],
] as const;

export default function AccountMenu({ email, firstName = "", lastName = "", isGlobalAdmin = false, onLogin, onLoggedOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [identity, setIdentity] = useState({ firstName, lastName });
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (!email || firstName || lastName) return;
    void fetch("/api/auth/me").then((response) => response.ok ? response.json() : null).then((payload) => {
      if (payload?.user) setIdentity({ firstName: payload.user.firstName || "", lastName: payload.user.lastName || "" });
    }).catch(() => undefined);
  }, [email, firstName, lastName]);

  if (!email) return <button className="account-login-button" aria-label="Войти в аккаунт" title="Войти в аккаунт" onClick={onLogin}><MenuIcon name="user"/><span>Войти</span></button>;
  const displayName = [identity.firstName, identity.lastName].filter(Boolean).join(" ") || "Пользователь Room Design";
  const initials = [identity.firstName, identity.lastName].filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || email.slice(0, 2).toUpperCase();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    onLoggedOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  };

  return <div className="account-menu" ref={root}>
    <button className="avatar" title={displayName} aria-label="Открыть меню пользователя" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{initials}</button>
    {open && <div className="account-menu-popover" role="menu">
      <div className="account-menu-identity"><span>{initials}</span><div><b>{displayName}</b><small>{email}</small></div></div>
      <div className="account-menu-links">
        {items.map(([label, href, icon]) => <Link key={href} href={href} role="menuitem" onClick={() => setOpen(false)}><MenuIcon name={icon}/>{label}</Link>)}
        {isGlobalAdmin && <Link href="/admin" role="menuitem" onClick={() => setOpen(false)}><MenuIcon name="admin"/>Global admin</Link>}
      </div>
      <button className="account-menu-logout" role="menuitem" onClick={() => void logout()}><MenuIcon name="logout"/>Выйти</button>
    </div>}
  </div>;
}

function MenuIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    user: <><circle cx="12" cy="8" r="3"/><path d="M5 20c.8-4 3.1-6 7-6s6.2 2 7 6"/></>,
    wallet: <><path d="M4 7h16v11H4z"/><path d="M4 7l3-3h10l3 3M15 12h5"/></>,
    history: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8"/><path d="M4 4v4h4M12 8v5l3 2"/></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    admin: <><path d="M12 3l7 3v5c0 4.6-2.7 7.8-7 10-4.3-2.2-7-5.4-7-10V6z"/><path d="M9 12l2 2 4-4"/></>,
    logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24">{paths[name]}</svg>;
}
