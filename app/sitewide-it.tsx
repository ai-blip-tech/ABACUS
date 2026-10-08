"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import ItOrb from "./it-orb";
import { categoryLabels, getTemplateBySlug, resultLabels, statusLabels } from "@/lib/templates/registry";
import type { ItUiAction, RoomDesignContext } from "@/lib/it/types";

const emptyWorkspace = {
  isAuthenticated: false,
  projectSaved: false,
  historyCount: 0,
  queuedEditCount: 0,
  hasFurnitureReference: false,
};

const contextForPath = (pathname: string): RoomDesignContext => {
  const templateSlug = pathname.startsWith("/templates/") ? pathname.slice("/templates/".length).split("/")[0] : "";
  const template = templateSlug ? getTemplateBySlug(templateSlug) : null;
  const page: RoomDesignContext["page"] = template
    ? "template"
    : pathname === "/templates"
      ? "templates"
      : pathname === "/account"
        ? "account"
        : pathname === "/admin"
          ? "admin"
          : pathname.startsWith("/proposal/")
            ? "proposal"
            : pathname === "/"
              ? "landing"
              : "other";
  const section: RoomDesignContext["section"] = page === "template"
    ? "template-workspace"
    : page === "templates"
      ? "templates"
      : page === "account"
        ? "account"
        : page === "admin"
          ? "admin"
          : page === "proposal"
            ? "proposal"
            : "other";

  return {
    route: pathname,
    page,
    projectId: page === "proposal" ? pathname.split("/").filter(Boolean).at(-1) || null : null,
    projectName: "",
    section,
    activeTool: template?.title || "",
    furnitureAction: "add",
    selectedObject: null,
    render: { hasSource: false, hasResult: false, isGenerating: false },
    planogram: {
      itemCount: 0,
      selectedItemId: null,
      selectedItem: null,
      room: { widthMm: 0, lengthMm: 0 },
      hasFloorReference: false,
      hasWallReference: false,
      hasCamera: false,
    },
    workspace: emptyWorkspace,
    template: template ? {
      slug: template.slug,
      title: template.title,
      status: statusLabels[template.status],
      category: categoryLabels[template.category],
      audience: template.audience,
      description: template.description,
      inputSummary: template.inputSummary,
      resultType: resultLabels[template.resultType],
      inputs: template.inputSlots.map((slot) => ({
        label: slot.label,
        required: slot.required,
        minCount: slot.minCount,
        maxCount: slot.maxCount,
      })),
    } : null,
    availableActions: ["get_current_context", "search_catalog"],
  };
};

const suggestionsFor = (context: RoomDesignContext) => {
  if (context.template) return [
    `Как работает шаблон «${context.template.title}»?`,
    "Что нужно загрузить для этого шаблона?",
    "Как получить хороший результат?",
  ];
  if (context.page === "templates") return [
    "Какой шаблон поможет с моей задачей?",
    "Какие шаблоны уже доступны?",
    "Чем отличаются шаблоны для дома и профессионалов?",
  ];
  if (context.page === "proposal") return [
    "Как редактировать коммерческое предложение?",
    "Как скачать PDF или PowerPoint?",
    "Откуда берутся товары и цены?",
  ];
  if (context.page === "account" || context.page === "projects") return [
    "Как открыть сохранённый проект?",
    "Где найти историю генераций?",
    "Как создать новый проект?",
  ];
  return undefined;
};

function RouteAwareIt({ pathname }: { pathname: string }) {
  const routeContext = useMemo(() => contextForPath(pathname), [pathname]);
  const [context, setContext] = useState(routeContext);

  useEffect(() => {
    const updateContext = (event: Event) => {
      const nextContext = (event as CustomEvent<RoomDesignContext>).detail;
      if (nextContext) setContext(nextContext);
    };
    window.addEventListener("roomdesign:it-context", updateContext);
    return () => window.removeEventListener("roomdesign:it-context", updateContext);
  }, []);

  if (context.page === "landing") return null;

  const suggestions = suggestionsFor(context);
  const closedLabel = context.page === "template" ? "Подскажу по шаблону" : context.page === "templates" ? "Помогу выбрать шаблон" : "Оно";
  const handleAction = (action: ItUiAction) => window.dispatchEvent(new CustomEvent("roomdesign:it-action", { detail: action }));

  return <ItOrb context={context} onAction={handleAction} suggestions={suggestions} closedLabel={closedLabel}/>;
}

export default function SitewideIt() {
  const pathname = usePathname();
  return <RouteAwareIt key={pathname} pathname={pathname}/>;
}
