import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getTemplateBySlug, templateRegistry } from "@/lib/templates/registry";
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
  return (
    <main className="template-detail-page">
      <TemplatesHeader />
      <div className="template-detail-back"><Link href="/templates">← Все шаблоны</Link><span>{template.id} / {templateRegistry.length}</span></div>
      <section className="template-editorial-heading">
        <p><b>{template.id} / {templateRegistry.length}</b><i aria-hidden="true" /></p>
        <div><h1>{template.title}</h1><h2>{template.hook}.</h2></div>
        <p>{template.description}</p>
        <aside>БОЛЬШЕ, ЧЕМ<br />ИНТЕРЬЕР<i aria-hidden="true" /></aside>
      </section>
      <TemplateWorkspace template={template} />
    </main>
  );
}
