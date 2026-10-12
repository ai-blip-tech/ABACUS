export type OnoNavigationEntry = {
  id: string;
  label: string;
  path: string;
  pageType: "templates" | "template" | "project" | "catalog" | "product" | "help" | "contact";
  allowedActions: readonly string[];
};

export type OnoNavigationManifest = {
  version: string;
  siteId: "roomdesign" | "norrmobler";
  entries: readonly OnoNavigationEntry[];
};

export const roomDesignNavigationManifest: OnoNavigationManifest = {
  version: "2026-10-11.2",
  siteId: "roomdesign",
  entries: [
    { id: "templates", label: "Шаблоны", path: "/templates", pageType: "templates", allowedActions: ["open_link", "search_catalog"] },
    { id: "projects", label: "Проекты", path: "/account", pageType: "project", allowedActions: ["open_link"] },
    { id: "studio", label: "Студия", path: "/#студия", pageType: "project", allowedActions: ["open_link", "search_catalog"] },
    { id: "help", label: "Помощь", path: "/templates", pageType: "help", allowedActions: ["open_link"] },
    ...templateRegistry.map((template) => ({
      id: `template-${template.slug}`,
      label: template.title,
      path: `/templates/${template.slug}`,
      pageType: "template" as const,
      allowedActions: ["open_link"] as const,
    })),
  ],
};

export const norrNavigationManifest: OnoNavigationManifest = {
  version: "2026-10-11.2",
  siteId: "norrmobler",
  entries: [
    { id: "catalog", label: "Каталог", path: "/catalog/", pageType: "catalog", allowedActions: ["open_link", "search_catalog"] },
    { id: "sofas", label: "Диваны", path: "/catalog/divany/", pageType: "catalog", allowedActions: ["open_link", "search_catalog"] },
    { id: "contact", label: "Связаться с менеджером", path: "/contacts/", pageType: "contact", allowedActions: ["open_link", "handoff"] },
  ],
};

export const navigationManifestFor = (siteId: OnoNavigationManifest["siteId"]) => siteId === "norrmobler"
  ? norrNavigationManifest
  : roomDesignNavigationManifest;
import { templateRegistry } from "../templates/registry.ts";
