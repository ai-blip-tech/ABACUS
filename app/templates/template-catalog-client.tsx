"use client";

import { useEffect, useState } from "react";

import { categoryLabels } from "@/lib/templates/registry";
import type { TemplateAudience, TemplateCategory, TemplateDefinition } from "@/lib/templates/types";
import TemplateCard from "./template-card";

type CategoryFilter = TemplateCategory | "all";
type AudienceFilter = TemplateAudience | "all";
const filters = Object.keys(categoryLabels) as CategoryFilter[];

export default function TemplateCatalogClient({ templates, initialCategory, initialAudience }: { templates: TemplateDefinition[]; initialCategory: CategoryFilter; initialAudience: AudienceFilter }) {
  const [category, setCategory] = useState<CategoryFilter>(initialCategory);
  const [audience, setAudience] = useState<AudienceFilter>(initialAudience);

  useEffect(() => {
    const onPopState = () => {
      const value = new URLSearchParams(window.location.search).get("category") as CategoryFilter | null;
      const audienceValue = new URLSearchParams(window.location.search).get("audience") as AudienceFilter | null;
      setCategory(value && filters.includes(value) ? value : "all");
      setAudience(audienceValue === "professional" || audienceValue === "personal" ? audienceValue : "all");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const choose = (value: CategoryFilter) => {
    setCategory(value);
    const url = new URL(window.location.href);
    if (value === "all") url.searchParams.delete("category"); else url.searchParams.set("category", value);
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
  };

  const chooseAudience = (value: AudienceFilter) => {
    setAudience(value);
    const url = new URL(window.location.href);
    if (value === "all") url.searchParams.delete("audience"); else url.searchParams.set("audience", value);
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
  };

  const visible = templates.filter((template) => (category === "all" || template.category === category) && (audience === "all" || template.audience === "both" || template.audience === audience));

  return (
    <>
      <div className="template-catalog-controls">
        <div className="template-catalog-audience" role="group" aria-label="Аудитория шаблонов">
          <button type="button" aria-pressed={audience === "all"} onClick={() => chooseAudience("all")}>Все</button>
          <button type="button" aria-pressed={audience === "personal"} onClick={() => chooseAudience("personal")}>Для себя</button>
          <button type="button" aria-pressed={audience === "professional"} onClick={() => chooseAudience("professional")}>Для профессионалов</button>
        </div>
        <div className="template-catalog-filters" role="group" aria-label="Категории шаблонов">
          {filters.map((filter) => <button key={filter} type="button" aria-pressed={category === filter} onClick={() => choose(filter)}>{categoryLabels[filter]}</button>)}
        </div>
      </div>
      <p className="template-catalog-count" aria-live="polite">{visible.length} {visible.length === 1 ? "сценарий" : "сценариев"}</p>
      <div className="template-catalog-grid">
        {visible.map((template) => <TemplateCard key={template.slug} template={template} />)}
      </div>
    </>
  );
}
