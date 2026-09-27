"use client";

import { useEffect, useRef, useState } from "react";

type AccountUser = {
  email: string;
  firstName: string;
  lastName: string;
};

const accountLinks = [
  ["Личный кабинет", "s0"],
  ["Тариф и токены", "s1"],
  ["Купить токены", "s2"],
  ["История токенов", "s3"],
  ["История рендеров", "s4"],
  ["Платежи", "s5"],
  ["Настройки", "s6"],
  ["Безопасность", "s6"],
] as const;

export default function AccountDropdown({ user, studio = false }: { user: AccountUser; studio?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const initials = fullName
    ? fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/");
  };

  return <div className={studio ? "account-dropdown studio-account-dropdown" : "account-dropdown"} ref={rootRef}>
    <button
      className={studio ? "account-trigger studio-account-trigger" : "account-trigger"}
      type="button"
      aria-label="Открыть меню пользователя"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
    >
      <span className="account-trigger-avatar" aria-hidden="true">{initials}</span>
      {!studio && <span className="account-trigger-copy"><b>{fullName || user.email}</b>{fullName && <small>{user.email}</small>}</span>}
    </button>
    {open && <div className="account-dropdown-card" role="menu">
      <div className="account-dropdown-user">
        <span aria-hidden="true">{initials}</span>
        <div><b>{fullName || user.email}</b>{fullName && <small>{user.email}</small>}</div>
      </div>
      <nav>{accountLinks.map(([label, anchor]) => <a key={label} role="menuitem" href={`/account#${anchor}`} onClick={() => setOpen(false)}>{label}</a>)}</nav>
      <div className="account-dropdown-divider"/>
      <button className="account-dropdown-logout" type="button" role="menuitem" onClick={() => void logout()}>Выйти</button>
    </div>}
  </div>;
}
