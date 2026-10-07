"use client";

import type { TemplateDefinition } from "@/lib/templates/types";
import TemplateEditorialWorkbench from "./template-editorial-workbench";
import TemplateScenarioWorkbench from "./template-scenario-workbench";

export default function TemplateWorkspace({ template }: { template: TemplateDefinition }) {
  return template.slug === "furniture-casting"
    ? <TemplateEditorialWorkbench template={template} />
    : <TemplateScenarioWorkbench template={template} />;
}
