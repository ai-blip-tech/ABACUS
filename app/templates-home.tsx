"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { categoryLabels, featuredTemplates, templateRegistry } from "@/lib/templates/registry";
import type { TemplateAudience, TemplateCategory, TemplateDefinition } from "@/lib/templates/types";

const homeSections: Array<{ category: TemplateCategory; number: string; title: string }> = [
  { category: "home", number: "03", title: "Для дома" },
  { category: "make_yours", number: "04", title: "Сделайте пространство своим" },
  { category: "control", number: "05", title: "Правки и контроль" },
  { category: "visualization", number: "06", title: "Камеры, материалы и визуализация" },
  { category: "experiments", number: "07", title: "Эксперименты" },
  { category: "delivery", number: "08", title: "Post-production и клиентская выдача" },
];

function TemplateTriptych({ template, compact = false }: { template: TemplateDefinition; compact?: boolean }) {
  return (
    <div className={`home-template-triptych${compact ? " is-compact" : ""}`} aria-label={`Asset slot для preview шаблона «${template.title}»`}>
      {["Исходник", "Трансформация", "Результат"].map((label, index) => (
        <div className={`home-template-stage stage-${index + 1}`} key={label}>
          <span>{label}</span>{index === 1 && <i aria-hidden="true">→</i>}
        </div>
      ))}
      <small>APPROVED MEDIA · ASSET SLOT</small>
    </div>
  );
}

function EditorialCard({ template, compact = false }: { template: TemplateDefinition; compact?: boolean }) {
  return (
    <Link className={`home-template-card${compact ? " is-compact" : ""}`} href={`/templates/${template.slug}`}>
      <TemplateTriptych template={template} compact={compact} />
      <div className="home-template-card-copy">
        <div><small>{template.id} / {categoryLabels[template.category]}</small><span>{template.inputSummary}</span></div>
        <h3>{template.title}</h3>
        {!compact && <p>{template.hook}</p>}
        <b>Открыть шаблон <span>→</span></b>
      </div>
    </Link>
  );
}

export default function TemplatesHome({ accountControl, onStartProject }: { accountControl: ReactNode; onStartProject: () => void }) {
  const [audience, setAudience] = useState<TemplateAudience>("personal");
  const matchesAudience = (template: TemplateDefinition) => template.audience === "both" || template.audience === audience;
  const matchedFeatured = featuredTemplates.filter(matchesAudience);
  const featured = [...matchedFeatured, ...templateRegistry.filter(matchesAudience)].filter((template, index, all) => all.findIndex((item) => item.slug === template.slug) === index).slice(0, 6);

  return (
    <main className="templates-home">
      <header className="templates-nav">
        <Link className="templates-wordmark" href="/" aria-label="ROOM DESIGN — на главную">ROOM DESIGN</Link>
        <i aria-hidden="true" />
        <nav aria-label="Главная навигация">
          <Link href="/templates">Шаблоны</Link><a href="#templates">Возможности</a><a href="#как-это-работает">Как это работает</a><a href="#для-дизайнеров">Для дизайнеров</a>
        </nav>
        <div className="templates-nav-actions">{accountControl}<button type="button" onClick={onStartProject}>Начать проект <span>→</span></button></div>
      </header>

      <section className="home-cinematic-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-media" role="img" aria-label="Слот для утверждённого hero-видео трансформации интерьера">
          <div className="home-hero-asset-request"><span>HERO FILM · 8–12 SEC</span><b>Требуется утверждённый poster + video asset</b><small>естественный свет · кремовый · древесный · графитовый · oxblood</small></div>
          <div className="home-hero-sequence" aria-hidden="true"><span>01 / ROOM</span><i /><span>02 / TRANSFORM</span><i /><span>03 / RESULT</span></div>
        </div>
        <div className="home-hero-overlay">
          <p className="templates-section-kicker"><b>01</b><i aria-hidden="true" /> ROOM DESIGN</p>
          <h1 id="home-hero-title">Пространство начинается с возможности <em>увидеть его иначе.</em></h1>
          <p>Персональная AI-студия для интерьера: выберите сценарий, добавьте своё пространство и получите результат, который можно продолжить.</p>
          <div className="templates-hero-actions"><button type="button" onClick={onStartProject}>Начать создавать <span>→</span></button><Link href="/templates">Смотреть шаблоны</Link></div>
        </div>
        <div className="home-hero-caption"><span>ROOM DESIGN / 2026</span><span>EDITORIAL AI INTERIORS</span></div>
      </section>

      <section className="home-template-entry" id="templates" aria-labelledby="home-templates-title">
        <div className="home-template-entry-head">
          <div><p className="templates-section-kicker"><b>02</b><i aria-hidden="true" /> TEMPLATES</p><h2 id="home-templates-title">Выберите, что изменить</h2></div>
          <div className="home-audience-switch" role="group" aria-label="Аудитория шаблонов"><button type="button" aria-pressed={audience === "personal"} onClick={() => setAudience("personal")}>Для себя</button><button type="button" aria-pressed={audience === "professional"} onClick={() => setAudience("professional")}>Для профессионалов</button></div>
          <Link href="/templates">Все шаблоны <span>→</span></Link>
        </div>
        <div className="home-featured-grid">{featured.map((template, index) => <EditorialCard key={template.slug} template={template} compact={index > 2} />)}</div>
      </section>

      {homeSections.map((section, sectionIndex) => {
        const items = templateRegistry.filter((template) => template.category === section.category && matchesAudience(template)).slice(0, 4);
        if (!items.length) return null;
        return <section className={`home-editorial-section rhythm-${sectionIndex % 4}`} key={section.category}>
          <header><p className="templates-section-kicker"><b>{section.number}</b><i aria-hidden="true" /> {categoryLabels[section.category].toUpperCase()}</p><h2>{section.title}</h2><Link href={`/templates?category=${section.category}&audience=${audience}`}>Смотреть раздел <span>→</span></Link></header>
          <div className="home-editorial-grid">{items.map((template, index) => <EditorialCard key={template.slug} template={template} compact={sectionIndex === 3 || index > 1} />)}</div>
        </section>;
      })}

      <section className="home-all-templates-cta"><p>40 сценариев для дома, работы и эксперимента</p><Link href="/templates">Открыть все 40 шаблонов <span>→</span></Link></section>

      <section className="templates-how" id="как-это-работает">
        <p className="templates-section-kicker"><b>09</b><i aria-hidden="true" /> КАК ЭТО РАБОТАЕТ</p><h2>Один сценарий.<br /><em>Ваше пространство.</em></h2>
        <ol><li><span>01</span><b>Выберите шаблон</b><p>Сразу увидьте механику и нужные материалы.</p></li><li><span>02</span><b>Добавьте своё</b><p>Комнату, предметы или референсы — только то, что нужно.</p></li><li><span>03</span><b>Получите результат</b><p>Сохраните вариант в проекте или попробуйте следующий.</p></li></ol>
      </section>

      <footer className="templates-footer" id="для-дизайнеров"><span>ROOM DESIGN</span><p>ПРОСТРАНСТВА ДЛЯ ЛУЧШЕЙ ЖИЗНИ</p><b>40 TEMPLATES · 2026</b></footer>
    </main>
  );
}
