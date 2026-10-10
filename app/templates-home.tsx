"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { categoryLabels, featuredTemplates, templateRegistry } from "@/lib/templates/registry";
import type { TemplateAudience, TemplateCategory, TemplateDefinition } from "@/lib/templates/types";
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
  const showVideoPreview = template.preview.type === "video";
  return (
    <div className={`home-template-triptych${compact ? " is-compact" : ""}${showVideoPreview ? " has-video-preview" : ""}`} aria-label={`Превью шаблона «${template.title}»`}>
      {showVideoPreview ? <TemplatePreviewMedia className="home-template-video-preview" preview={template.preview} sizes="(max-width: 760px) 100vw, 50vw" /> : ["Исходник", "Трансформация", "Результат"].map((label, index) => (
          <div className={`home-template-stage stage-${index + 1}`} key={label}>
            <span>{label}</span>{index === 1 && <i aria-hidden="true">→</i>}
          </div>
        ))}
      <small>{showVideoPreview ? "VIDEO PREVIEW" : "VIDEO ASSET SLOT"}</small>
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
        <b>{template.ctaLabel || "Открыть шаблон"} <span>→</span></b>
      </div>
    </Link>
  );
}

function ScrollScrubHero({ onStartProject }: { onStartProject: () => void }) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [staticMode, setStaticMode] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const updateMode = () => setStaticMode(reducedMotion.matches || Boolean(connection?.saveData));
    updateMode();
    reducedMotion.addEventListener("change", updateMode);
    return () => reducedMotion.removeEventListener("change", updateMode);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const video = videoRef.current;
    if (!section || !video || staticMode || videoFailed) return;

    const syncVideoToScroll = () => {
      animationFrameRef.current = null;
      const travel = Math.max(section.offsetHeight - window.innerHeight, 1);
      const progress = Math.min(Math.max(-section.getBoundingClientRect().top / travel, 0), 1);
      if (video.readyState < HTMLMediaElement.HAVE_METADATA || !Number.isFinite(video.duration)) return;
      const targetTime = progress * Math.max(video.duration - 0.04, 0);
      if (Math.abs(video.currentTime - targetTime) > 0.016) video.currentTime = targetTime;
    };

    const requestSync = () => {
      if (animationFrameRef.current === null) animationFrameRef.current = window.requestAnimationFrame(syncVideoToScroll);
    };

    video.pause();
    window.addEventListener("scroll", requestSync, { passive: true });
    window.addEventListener("resize", requestSync);
    video.addEventListener("loadedmetadata", requestSync);
    requestSync();
    return () => {
      window.removeEventListener("scroll", requestSync);
      window.removeEventListener("resize", requestSync);
      video.removeEventListener("loadedmetadata", requestSync);
      if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    };
  }, [staticMode, videoFailed]);

  return (
    <section ref={sectionRef} className="home-cinematic-hero" aria-labelledby="home-hero-title">
      <div className="home-hero-sticky">
        <div className="home-hero-media" role="img" aria-label="Интерьер превращается из архитектурного эскиза в готовое пространство">
          {staticMode || videoFailed ? (
            <Image className="home-hero-poster" src="/media/room-design-hero-poster.png" alt="" fill priority sizes="100vw" />
          ) : (
            <video
              ref={videoRef}
              className="home-hero-video"
              src="/media/room-design-hero.mp4"
              poster="/media/room-design-hero-poster.png"
              preload="auto"
              muted
              playsInline
              tabIndex={-1}
              aria-hidden="true"
              onError={() => setVideoFailed(true)}
            />
          )}
        </div>
        <div className="home-hero-overlay">
          <h1 id="home-hero-title">Пространство начинается с возможности <em>увидеть его иначе.</em></h1>
          <p>Персональная AI-студия для интерьера: выберите сценарий, добавьте своё пространство и получите результат, который можно продолжить.</p>
          <div className="templates-hero-actions"><button type="button" onClick={onStartProject}>Начать проект <span>→</span></button></div>
        </div>
      </div>
    </section>
  );
}

export default function TemplatesHome({ accountControl, onStartProject }: { accountControl: ReactNode; onStartProject: () => void }) {
  const [audience, setAudience] = useState<TemplateAudience>("personal");
  const matchesAudience = (template: TemplateDefinition) => template.audience === "both" || template.audience === audience;
  const homepagePriority = ["design-battle", "light-scenarios", "next-chapter", "moodboard-to-room", "kitchen-cad-to-photo"];
  const matchedFeatured = [...featuredTemplates].sort((left, right) => {
    const leftPriority = homepagePriority.indexOf(left.slug);
    const rightPriority = homepagePriority.indexOf(right.slug);
    return (leftPriority < 0 ? Number.MAX_SAFE_INTEGER : leftPriority) - (rightPriority < 0 ? Number.MAX_SAFE_INTEGER : rightPriority);
  }).filter(matchesAudience);
  const featured = [...matchedFeatured, ...templateRegistry.filter(matchesAudience)].filter((template, index, all) => all.findIndex((item) => item.slug === template.slug) === index).slice(0, 6);

  return (
    <main className="templates-home">
      <header className="templates-nav">
        <Link className="templates-wordmark room-design-wordmark" href="/" aria-label="ROOM DESIGN — на главную">ROOM DESIGN</Link>
        <i aria-hidden="true" />
        <nav aria-label="Главная навигация">
          <Link href="/templates">Шаблоны</Link><a href="#templates">Возможности</a><a href="#как-это-работает">Как это работает</a><a href="#для-дизайнеров">Для дизайнеров</a>
        </nav>
        <div className="templates-nav-actions">{accountControl}</div>
      </header>

      <ScrollScrubHero onStartProject={onStartProject} />

      <section className="home-template-entry" id="templates" aria-labelledby="home-templates-title">
        <div className="home-template-entry-head">
          <div><p className="templates-section-kicker"><i aria-hidden="true" /> ШАБЛОНЫ</p><h2 id="home-templates-title">Выберите, что изменить</h2></div>
          <div className="home-audience-switch" role="group" aria-label="Аудитория шаблонов"><button type="button" aria-pressed={audience === "personal"} onClick={() => setAudience("personal")}>Для себя</button><button type="button" aria-pressed={audience === "professional"} onClick={() => setAudience("professional")}>Для профессионалов</button></div>
          <Link href="/templates">Все шаблоны <span>→</span></Link>
        </div>
        <div className="home-featured-grid">{featured.map((template, index) => <EditorialCard key={template.slug} template={template} compact={index > 2} />)}</div>
      </section>

      {homeSections.map((section, sectionIndex) => {
        const items = templateRegistry.filter((template) => template.category === section.category && matchesAudience(template)).slice(0, 4);
        if (!items.length) return null;
        return <section className={`home-editorial-section rhythm-${sectionIndex % 4}`} key={section.category}>
          <header><p className="templates-section-kicker"><i aria-hidden="true" /> {section.title.toUpperCase()}</p><h2>{section.title}</h2><Link href={`/templates?category=${section.category}&audience=${audience}`}>Смотреть раздел <span>→</span></Link></header>
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
