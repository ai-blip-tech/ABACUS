import Image from "next/image";
import Link from "next/link";

import { resultLabels, statusLabels } from "@/lib/templates/registry";
import type { TemplateDefinition } from "@/lib/templates/types";

export default function TemplateCard({ template }: { template: TemplateDefinition }) {
  const available = template.status === "live" || template.status === "beta";
  return (
    <Link className={`template-catalog-card status-${template.status}`} href={`/templates/${template.slug}`}>
      <div className="template-catalog-media">
        <Image src={template.preview.src} alt={template.preview.alt} fill sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw" />
        {process.env.NODE_ENV !== "production" && <span className="template-fixture-label">DEV · PLACEHOLDER</span>}
        <b className="template-card-number">{template.id}</b>
        <span className="template-status-label">{statusLabels[template.status]}</span>
      </div>
      <div className="template-catalog-copy">
        <div className="template-card-meta"><span>{resultLabels[template.resultType]}</span><span>{template.inputSummary}</span></div>
        <h2>{template.title}</h2>
        <p>{template.hook}</p>
        <div className="template-card-footer">
          <span>{template.badges.join(" · ") || "ROOM DESIGN"}</span>
          <strong>{available ? "Использовать" : "Посмотреть preview"} <i>→</i></strong>
        </div>
      </div>
    </Link>
  );
}
