import type { Metadata } from "next";

import { categoryLabels, previewTemplates, templateRegistry } from "@/lib/templates/registry";
import type { TemplateAudience, TemplateCategory } from "@/lib/templates/types";
import TemplateCatalogClient from "./template-catalog-client";
import TemplatesHeader from "./templates-header";

export const metadata: Metadata = {
  title: "AI-шаблоны — ROOM DESIGN",
  description: "Сценарии Room Design для персонализированной работы с интерьером.",
};

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ category?: string; audience?: string }> }) {
  const params = await searchParams;
  const requested = params.category as TemplateCategory | undefined;
  const initialCategory = requested && requested in categoryLabels ? requested : "all";
  const initialAudience: TemplateAudience | "all" = params.audience === "professional" || params.audience === "personal" ? params.audience : "all";
  return (
    <main className="template-catalog-page">
      <TemplatesHeader />
      <section className="template-catalog-intro">
        <p className="templates-section-kicker"><b>02</b><i aria-hidden="true" /> КАТАЛОГ ШАБЛОНОВ</p>
        <div><h1>Выберите, что<br />изменить <em>сегодня.</em></h1><p>{templateRegistry.length} интерьерных сценариев — от быстрой идеи для дома до точной профессиональной выдачи.</p></div>
      </section>
      <section className="template-catalog-content" aria-label="Каталог шаблонов">
        {process.env.NODE_ENV !== "production" && <div className="template-dev-overlay" aria-hidden="true">DEV · PLACEHOLDER MEDIA</div>}
        <TemplateCatalogClient templates={previewTemplates} initialCategory={initialCategory} initialAudience={initialAudience} />
      </section>
      <footer className="templates-footer"><span>ROOM DESIGN</span><p>{templateRegistry.length} СЦЕНАРИЕВ · 1 TEMPLATE RUNTIME</p><b>ROOM DESIGN · 2026</b></footer>
    </main>
  );
}
