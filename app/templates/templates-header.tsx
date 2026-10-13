"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AccountDropdown from "../account-dropdown";

type TemplateHeaderUser = {
  email: string;
  firstName: string;
  lastName: string;
  role: "user" | "admin";
  features?: { purchase?: boolean; payments?: boolean };
};

export default function TemplatesHeader() {
  const [user, setUser] = useState<TemplateHeaderUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => response.ok ? response.json() : { user: null })
      .then((payload: { user?: TemplateHeaderUser | null }) => setUser(payload.user || null))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setUser(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setAuthChecked(true);
      });
    return () => controller.abort();
  }, []);

  return (
    <header className="template-site-header">
      <Link className="templates-wordmark room-design-wordmark" href="/">ROOM DESIGN</Link>
      <i aria-hidden="true" />
      <nav aria-label="Навигация по шаблонам">
        <Link href="/templates">Шаблоны</Link>
        <Link href="/#templates">Возможности</Link>
        <Link href="/#как-это-работает">Как это работает</Link>
      </nav>
      <div>
        {!authChecked ? <span className="template-header-session-loading" aria-label="Проверяем вход" /> : user ? (
          <AccountDropdown user={user} />
        ) : <>
          <Link href="/#кабинет">Войти</Link>
          <Link className="template-header-cta" href="/#новый-проект">Начать проект <span>→</span></Link>
        </>}
      </div>
    </header>
  );
}
