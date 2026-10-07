import Link from "next/link";

export default function TemplatesHeader() {
  return (
    <header className="template-site-header">
      <Link className="templates-wordmark" href="/">ROOM DESIGN</Link>
      <i aria-hidden="true" />
      <nav aria-label="Навигация по шаблонам">
        <Link href="/templates">Шаблоны</Link>
        <Link href="/#templates">Возможности</Link>
        <Link href="/#как-это-работает">Как это работает</Link>
      </nav>
      <div>
        <Link href="/#кабинет">Войти</Link>
        <Link className="template-header-cta" href="/#новый-проект">Начать проект <span>→</span></Link>
      </div>
    </header>
  );
}
