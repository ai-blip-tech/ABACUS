import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getTemplateBySlug, resultLabels, statusLabels, templateRegistry } from "@/lib/templates/registry";
import TemplateWorkspace from "./template-workspace";
import TemplatesHeader from "../templates-header";

export function generateStaticParams() {
  return templateRegistry.map((template) => ({ slug: template.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const template = getTemplateBySlug((await params).slug);
  if (!template) return {};
  const title = `${template.title} — ROOM DESIGN`;
  return {
    title,
    description: template.hook,
    openGraph: { title, description: template.hook, images: [] },
    twitter: { card: "summary", title, description: template.hook, images: [] },
  };
}

export default async function TemplateDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const template = getTemplateBySlug((await params).slug);
  if (!template) notFound();
  const isFurnitureCasting = template.slug === "furniture-casting";
  return (
    <main className="template-detail-page">
      <TemplatesHeader />
      <div className="template-detail-back"><Link href="/templates">← Все шаблоны</Link><span>{template.id} / 40</span></div>
      <section className={`template-detail-hero${isFurnitureCasting ? " is-furniture-casting" : ""}`}>
        {!isFurnitureCasting && <div className="template-detail-media">
          <Image src={template.preview.src} alt={template.preview.alt} fill priority sizes="(max-width: 800px) 100vw, 58vw" />
          <span className="template-fixture-label">PREVIEW / PLACEHOLDER</span>
          <p>Fixture показывает только композицию экрана и не обещает качество будущего AI-результата.</p>
        </div>}
        <div className="template-detail-copy">
          <p className="templates-section-kicker"><b>{template.id}</b><i aria-hidden="true" /> {isFurnitureCasting ? "ROOM DESIGN" : statusLabels[template.status]}</p>
          <h1>{template.title}</h1>
          <h2>{template.hook}</h2>
          <p>{template.description}</p>
          {!isFurnitureCasting && <dl>
            <div><dt>Результат</dt><dd>{resultLabels[template.resultType]}</dd></div>
            <div><dt>Что нужно</dt><dd>{template.inputSummary}</dd></div>
            <div><dt>Статус</dt><dd>{statusLabels[template.status]}</dd></div>
          </dl>}
          {!isFurnitureCasting && <a href="#workspace">Создать со своей комнатой <span>↓</span></a>}
        </div>
      </section>
      <TemplateWorkspace template={template} />
    </main>
  );
}
