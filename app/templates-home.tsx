"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { categoryLabels, featuredTemplates, templateRegistry } from "@/lib/templates/registry";
import type { TemplateCategory, TemplateDefinition } from "@/lib/templates/types";
import TemplatePreviewMedia from "./template-preview-media";

const homeSections: Array<{ category: TemplateCategory; title: string }> = [
  { category: "home", title: "Для дома" },
  { category: "make_yours", title: "Сделай своим" },
  { category: "control", title: "Правки и контроль" },
  { category: "visualization", title: "Камеры, материалы и визуализация" },
  { category: "experiments", title: "Эксперименты" },
  { category: "delivery", title: "Post-production и клиентская выдача" },
];

function TemplateTriptych({ template, compact = false }: { template: TemplateDefinition; compact?: boolean }) {
  const showMediaPreview = template.preview.type === "video" || template.preview.type === "image";
  return (
    <div className={`home-template-triptych${compact ? " is-compact" : ""}${showMediaPreview ? " has-media-preview" : ""}`} aria-label={`Превью шаблона «${template.title}»`}>
      {template.badges.includes("НОВИНКА") && <span className="template-new-badge">Новинка</span>}
      {showMediaPreview ? <TemplatePreviewMedia className="home-template-media-preview" preview={template.preview} sizes="(max-width: 760px) 100vw, 50vw" /> : ["Исходник", "Трансформация", "Результат"].map((label, index) => (
          <div className={`home-template-stage stage-${index + 1}`} key={label}>
            <span>{label}</span>{index === 1 && <i aria-hidden="true">→</i>}
          </div>
        ))}
    </div>
  );
}

function EditorialCard({ template, compact = false, prominent = false }: { template: TemplateDefinition; compact?: boolean; prominent?: boolean }) {
  return (
    <Link className={`home-template-card${compact ? " is-compact" : ""}${prominent ? " is-prominent" : ""}`} href={`/templates/${template.slug}`}>
      <TemplateTriptych template={template} compact={compact} />
      <div className="home-template-card-copy">
        <div><small>{template.id} / {categoryLabels[template.category]}</small><span>{template.inputSummary}</span></div>
        <h3>{template.title}</h3>
        {!compact && <p>{template.hook}</p>}
        <b>{template.ctaLabel || "Открыть шаблон"} <span>→</span></b>
      </div>
    </Link>
  );
}

function Model3DHomepageHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setPaused(true));
    else video.pause();
  };

  return (
    <section className="home-model3d-hero" aria-labelledby="home-hero-title">
      <video ref={videoRef} className="home-model3d-video" autoPlay loop muted playsInline preload="auto" poster="/video/photo-to-3d-poster.jpg" aria-hidden="true" onPlay={() => setPaused(false)} onPause={() => setPaused(true)}>
        <source src="/video/photo-to-3d.mp4" type="video/mp4" />
      </video>
      <div className="home-model3d-shade" aria-hidden="true" />
      <div className="home-model3d-copy">
        <p className="home-model3d-eyebrow">От фотографии — к объёму</p>
        <h1 id="home-hero-title">Создай 3D модель<br />по фото</h1>
        <p className="home-model3d-description">Один референс. Новый ракурс.<br />Преврати идею в модель, которую можно рассмотреть со всех сторон.</p>
        <button type="button" className="home-model3d-cta home-primary-cta">Создать 3D модель <span aria-hidden="true">→</span></button>
      </div>
      <button type="button" className="home-model3d-playback" onClick={togglePlayback} aria-label={paused ? 'Продолжить видео' : 'Приостановить видео'}>
        {paused ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6Z" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14" /></svg>}
      </button>
    </section>
  );
}

function ProjectEnvironment({ onStartProject }: { onStartProject: () => void }) {
  return (
    <section className="home-project-environment" aria-labelledby="home-project-title">
      <div className="home-project-copy">
        <p>ПРОЕКТНАЯ СРЕДА</p>
        <h2 id="home-project-title">Не отдельный рендер.<br />Целый проект.</h2>
      </div>
      <span className="home-project-divider" aria-hidden="true" />
      <div className="home-project-action">
        <p>Соберите пространство в одном рабочем процессе: создавайте планограммы, редактируйте интерьер по исходному изображению, примеряйте мебель из каталога или любого референса, сравнивайте версии и возвращайтесь к истории рендеров. Проект сохраняет всё — от первой идеи до готового решения.</p>
        <button type="button" className="home-primary-cta" onClick={onStartProject}>Начать проект <span aria-hidden="true">→</span></button>
      </div>
    </section>
  );
}

export default function TemplatesHome({ accountControl, onStartProject }: { accountControl: ReactNode; onStartProject: () => void }) {
  const [stackFeatured, setStackFeatured] = useState(false);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 760px)");
    const updateLayout = () => setStackFeatured(mobile.matches);
    updateLayout();
    mobile.addEventListener("change", updateLayout);
    return () => mobile.removeEventListener("change", updateLayout);
  }, []);

  const homepagePriority = ["planogram-3d", "design-battle", "light-scenarios", "moodboard-to-room", "kitchen-cad-to-photo"];
  const matchedFeatured = [...featuredTemplates].sort((left, right) => {
    const leftPriority = homepagePriority.indexOf(left.slug);
    const rightPriority = homepagePriority.indexOf(right.slug);
    return (leftPriority < 0 ? Number.MAX_SAFE_INTEGER : leftPriority) - (rightPriority < 0 ? Number.MAX_SAFE_INTEGER : rightPriority);
  });
  const featured = [...matchedFeatured, ...templateRegistry].filter((template, index, all) => all.findIndex((item) => item.slug === template.slug) === index).slice(0, 6);
  const featuredColumns = stackFeatured ? [featured] : [featured.filter((_, index) => index % 2 === 0), featured.filter((_, index) => index % 2 === 1)];

  return (
    <main className="templates-home">
      <header className="templates-nav">
        <Link className="templates-wordmark room-design-wordmark" href="/" aria-label="ROOM DESIGN — на главную">ROOM DESIGN</Link>
        <i aria-hidden="true" />
        <nav aria-label="Главная навигация">
          <button type="button" className="home-nav-start" onClick={onStartProject}>Начать проект</button><Link href="/templates">Шаблоны</Link><a href="#templates">Возможности</a><a href="#как-это-работает">Как это работает</a>
        </nav>
        <div className="templates-nav-actions"><button type="button" className="home-model3d-nav"><span className="home-model3d-new">NEW</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 9 5v10l-9 5-9-5V7Z" /><path d="m3 7 9 5 9-5M12 12v10" /></svg><span>Создать 3D-модель</span></button>{accountControl}</div>
      </header>

      <Model3DHomepageHero />
      <ProjectEnvironment onStartProject={onStartProject} />

      <section className="home-template-entry" id="templates" aria-labelledby="home-templates-title">
        <div className="home-template-entry-head">
          <div><p className="templates-section-kicker"><i aria-hidden="true" /> ШАБЛОНЫ</p><h2 id="home-templates-title">Выберите, что изменить</h2></div>
          <Link href="/templates">Все шаблоны <span>→</span></Link>
        </div>
        <div className={`home-featured-grid${stackFeatured ? " is-stacked" : ""}`}>
          {featuredColumns.map((column, columnIndex) => (
            <div className="home-featured-column" key={stackFeatured ? "stacked" : `column-${columnIndex}`}>
              {column.map((template) => {
                const index = featured.findIndex((item) => item.slug === template.slug);
                return <EditorialCard key={template.slug} template={template} compact={index > 2} prominent={index === 0} />;
              })}
            </div>
          ))}
        </div>
      </section>

      {homeSections.map((section, sectionIndex) => {
        const items = templateRegistry.filter((template) => template.category === section.category).slice(0, 4);
        if (!items.length) return null;
        return <section className={`home-editorial-section rhythm-${sectionIndex % 4}`} key={section.category}>
          <header><p className="templates-section-kicker"><i aria-hidden="true" /> {section.title.toUpperCase()}</p><h2>{section.title}</h2><Link href={`/templates?category=${section.category}`}>Смотреть раздел <span>→</span></Link></header>
          <div className="home-editorial-grid">{items.map((template, index) => <EditorialCard key={template.slug} template={template} compact={sectionIndex === 3 || index > 1} />)}</div>
        </section>;
      })}

      <section className="home-all-templates-cta"><p>{templateRegistry.length} сценария для дома, работы и эксперимента</p><Link href="/templates">Открыть все {templateRegistry.length} шаблона <span>→</span></Link></section>

      <section className="templates-how" id="как-это-работает">
        <p className="templates-section-kicker"><i aria-hidden="true" /> КАК ЭТО РАБОТАЕТ</p><h2>Один сценарий.<br /><em>Ваше пространство.</em></h2>
        <ol><li><span>01</span><b>Выберите шаблон</b><p>Сразу увидьте механику и нужные материалы.</p></li><li><span>02</span><b>Добавьте своё</b><p>Комнату, предметы или референсы — только то, что нужно.</p></li><li><span>03</span><b>Получите результат</b><p>Сохраните вариант в проекте или попробуйте следующий.</p></li></ol>
      </section>

      <footer className="templates-footer" id="для-дизайнеров"><span>ROOM DESIGN</span><p>ПРОСТРАНСТВА ДЛЯ ЛУЧШЕЙ ЖИЗНИ</p><b>{templateRegistry.length} TEMPLATES · 2026</b></footer>
    </main>
  );
}
