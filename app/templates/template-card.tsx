import Link from "next/link";

import TemplatePreviewMedia from "@/app/template-preview-media";
import { resultLabels } from "@/lib/templates/registry";
import type { TemplateDefinition } from "@/lib/templates/types";

export default function TemplateCard({ template }: { template: TemplateDefinition }) {
  return (
    <Link className="template-catalog-card" href={`/templates/${template.slug}`}>
      <div className="template-catalog-media">
        <TemplatePreviewMedia className="template-catalog-preview" preview={template.preview} sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw" />
        <b className="template-card-number">{template.id}</b>
      </div>
      <div className="template-catalog-copy">
        <div className="template-card-meta"><span>{resultLabels[template.resultType]}</span><span>{template.inputSummary}</span></div>
        <h2>{template.title}</h2>
        <p>{template.hook}</p>
        <div className="template-card-footer">
          <strong>{template.ctaLabel || "Открыть шаблон"} <i>→</i></strong>
        </div>
      </div>
    </Link>
  );
}
