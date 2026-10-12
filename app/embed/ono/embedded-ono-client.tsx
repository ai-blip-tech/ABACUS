"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ItOrb from "@/app/it-orb";
import type { OnoPageContext, OnoWidgetEvent } from "@/lib/it/embed-contract";
import type { ItUiAction, RoomDesignContext } from "@/lib/it/types";
import { ONO_PROTOCOL_VERSION } from "@/lib/it/version";

const VERSION = ONO_PROTOCOL_VERSION;

const baseContext = (page: OnoPageContext): RoomDesignContext => ({
  route: page.pathname || "/",
  page: page.pageType === "templates" ? "templates" : page.pageType === "template" ? "template" : page.pageType === "catalog" ? "catalog" : page.pageType === "product" ? "product" : "other",
  projectId: null,
  projectName: "",
  section: page.pageType === "templates" ? "templates" : page.pageType === "template" ? "template-workspace" : "other",
  activeTool: page.title || "",
  furnitureAction: "add",
  selectedObject: null,
  render: { hasSource: false, hasResult: false, isGenerating: false },
  planogram: { itemCount: 0, selectedItemId: null, selectedItem: null, room: { widthMm: 0, lengthMm: 0 }, hasFloorReference: false, hasWallReference: false, hasCamera: false },
  workspace: { isAuthenticated: false, projectSaved: false, historyCount: 0, queuedEditCount: 0, hasFurnitureReference: false },
  template: null,
  ...(page.product ? { commerce: { product: {
    id: page.product.id,
    sku: page.product.sku || "",
    name: page.product.name,
    category: page.product.category || "",
    brand: page.product.brand || "",
    collection: page.product.collection || "",
    price: Number.isFinite(page.product.price) ? Number(page.product.price) : null,
    currency: "RUB",
    availability: page.product.availability || "unknown",
    canonicalUrl: page.product.canonicalUrl || "",
    attributes: page.product.attributes || [],
  } } } : {}),
  availableActions: ["get_current_context", "search_catalog", "open_link"],
});

type EmbeddedOnoClientProps = {
  parentOrigin: string;
  siteId: "roomdesign" | "norrmobler";
};

export default function EmbeddedOnoClient({ parentOrigin, siteId }: EmbeddedOnoClientProps) {
  const [page, setPage] = useState<OnoPageContext>({ pageType: "other", pathname: "/" });
  const context = useMemo(() => baseContext(page), [page]);
  const send = useCallback((payload: OnoWidgetEvent) => {
    window.parent.postMessage({ ...payload, version: VERSION }, parentOrigin);
  }, [parentOrigin]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== parentOrigin || event.source !== window.parent) return;
      const payload = event.data as { type?: string; version?: string; context?: OnoPageContext };
      if (payload?.type !== "page.changed" || payload.version !== VERSION || !payload.context) return;
      setPage({
        pageType: ["landing", "templates", "template", "project", "catalog", "product", "other"].includes(payload.context.pageType) ? payload.context.pageType : "other",
        pathname: String(payload.context.pathname || "/").slice(0, 500),
        title: String(payload.context.title || "").slice(0, 200),
        entityId: String(payload.context.entityId || "").slice(0, 120),
        templateSlug: String(payload.context.templateSlug || "").slice(0, 120),
        product: payload.context.product && typeof payload.context.product === "object" ? {
          id: String(payload.context.product.id || "").slice(0, 120),
          sku: String(payload.context.product.sku || "").slice(0, 120),
          name: String(payload.context.product.name || "").slice(0, 200),
          category: String(payload.context.product.category || "").slice(0, 120),
          brand: String(payload.context.product.brand || "").slice(0, 120),
          collection: String(payload.context.product.collection || "").slice(0, 120),
          price: Number.isFinite(Number(payload.context.product.price)) ? Number(payload.context.product.price) : undefined,
          currency: "RUB",
          availability: ["in_stock", "out_of_stock", "preorder", "unknown"].includes(String(payload.context.product.availability)) ? payload.context.product.availability : "unknown",
          canonicalUrl: String(payload.context.product.canonicalUrl || "").slice(0, 500),
          attributes: Array.isArray(payload.context.product.attributes) ? payload.context.product.attributes.slice(0, 30).map((item) => ({ name: String(item?.name || "").slice(0, 80), value: String(item?.value || "").slice(0, 240) })) : [],
        } : undefined,
      });
      send({ type: "page.changed", context: payload.context });
    };
    window.addEventListener("message", receive);
    send({ type: "widget.ready", siteId });
    return () => window.removeEventListener("message", receive);
  }, [parentOrigin, send, siteId]);

  const suggestions = siteId === "norrmobler" ? [
    "Подбери диван для гостиной",
    "Найди кресло до 150 тысяч",
    "Как выбрать обивку?",
  ] : undefined;

  const handleAction = (action: ItUiAction) => send({ type: "widget.ui_action", action });
  return <main className="ono-embed-root"><ItOrb context={context} onAction={handleAction} onWidgetEvent={send} suggestions={suggestions} brandLabel="ROOM DESIGN" headerTitle={siteId === "norrmobler" ? "«ОНО» - Ваш ИИ-ассистент" : undefined} closedLabel="Оно"/></main>;
}
