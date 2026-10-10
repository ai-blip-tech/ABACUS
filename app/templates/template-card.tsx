import Link from "next/link";

import TemplatePreviewMedia from "@/app/template-preview-media";
import { resultLabels, statusLabels } from "@/lib/templates/registry";
import type { TemplateDefinition } from "@/lib/templates/types";

export default function TemplateCard({ template }: { template: TemplateDefinition }) {
  const available = template.status === "live" || template.status === "beta";
  return (
    <Link className={`template-catalog-card status-${template.status}`} href={`/templates/${template.slug}`}>
      <div className="template-catalog-media">
        <TemplatePreviewMedia className="template-catalog-preview" preview={template.preview} sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw" />
        {template.preview.type === "placeholder" && <span className="template-fixture-label">ВИДЕО СКОРО</span>}
        <b className="template-card-number">{template.id}</b>
        <span className="template-status-label">{statusLabels[template.status]}</span>
      </div>
      <div className="template-catalog-copy">
        <div className="template-card-meta"><span>{resultLabels[template.resultType]}</span><span>{template.inputSummary}</span></div>
        <h2>{template.title}</h2>
        <p>{template.hook}</p>
        <div className="template-card-footer">
          <span>{template.badges.join(" · ") || "ROOM DESIGN"}</span>
          <strong>{template.ctaLabel || (available ? "Использовать" : "Посмотреть preview")} <i>→</i></strong>
        </div>
      </div>
    </Link>
  );
}
