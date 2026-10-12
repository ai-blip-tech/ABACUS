import type { RoomDesignContext } from "./types.ts";

const pageValues = new Set(["landing", "projects", "project-setup", "studio", "templates", "template", "catalog", "product", "account", "admin", "proposal", "other"]);
const sectionValues = new Set(["image-editor", "planogram", "templates", "template-workspace", "account", "admin", "proposal", "project-setup", "other"]);
const allowedActions = new Set(["get_current_context", "search_catalog", "open_link"]);

const short = (value: unknown, max = 160) => typeof value === "string" ? value.trim().slice(0, max) : "";
const finite = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function validateRoomDesignContext(value: unknown): RoomDesignContext {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const render = input.render && typeof input.render === "object" ? input.render as Record<string, unknown> : {};
  const workspace = input.workspace && typeof input.workspace === "object" ? input.workspace as Record<string, unknown> : {};
  const planogram = input.planogram && typeof input.planogram === "object" ? input.planogram as Record<string, unknown> : {};
  const room = planogram.room && typeof planogram.room === "object" ? planogram.room as Record<string, unknown> : {};
  const selected = planogram.selectedItem && typeof planogram.selectedItem === "object" ? planogram.selectedItem as Record<string, unknown> : null;
  const selectedObject = input.selectedObject && typeof input.selectedObject === "object" ? input.selectedObject as Record<string, unknown> : null;
  const template = input.template && typeof input.template === "object" ? input.template as Record<string, unknown> : null;
  const commerce = input.commerce && typeof input.commerce === "object" ? input.commerce as Record<string, unknown> : null;
  const product = commerce?.product && typeof commerce.product === "object" ? commerce.product as Record<string, unknown> : null;
  const rawPage = short(input.page, 40);
  const rawSection = short(input.section, 40);
  const page = pageValues.has(rawPage) ? rawPage as RoomDesignContext["page"] : "other";
  const section = sectionValues.has(rawSection) ? rawSection as RoomDesignContext["section"] : "other";
  return {
    route: short(input.route, 500) || "/",
    page,
    projectId: short(input.projectId, 120) || null,
    projectName: short(input.projectName, 160),
    section,
    activeTool: short(input.activeTool, 160),
    furnitureAction: input.furnitureAction === "replace" || input.furnitureAction === "remove" ? input.furnitureAction : "add",
    selectedObject: selectedObject ? { id: short(selectedObject.id, 120), name: short(selectedObject.name, 160) } : null,
    render: { hasSource: Boolean(render.hasSource), hasResult: Boolean(render.hasResult), isGenerating: Boolean(render.isGenerating) },
    planogram: {
      itemCount: Math.max(0, Math.trunc(finite(planogram.itemCount))),
      selectedItemId: short(planogram.selectedItemId, 120) || null,
      selectedItem: selected ? {
        id: short(selected.id, 120),
        name: short(selected.name, 160),
        kind: short(selected.kind, 80),
        widthMm: Math.max(0, finite(selected.widthMm)),
        depthMm: Math.max(0, finite(selected.depthMm)),
        rotation: finite(selected.rotation),
        hasReference: Boolean(selected.hasReference),
        referenceName: short(selected.referenceName, 160) || null,
      } : null,
      room: { widthMm: Math.max(0, finite(room.widthMm)), lengthMm: Math.max(0, finite(room.lengthMm)) },
      hasFloorReference: Boolean(planogram.hasFloorReference),
      hasWallReference: Boolean(planogram.hasWallReference),
      hasCamera: Boolean(planogram.hasCamera),
    },
    workspace: {
      isAuthenticated: Boolean(workspace.isAuthenticated),
      projectSaved: Boolean(workspace.projectSaved),
      historyCount: Math.max(0, Math.trunc(finite(workspace.historyCount))),
      queuedEditCount: Math.max(0, Math.trunc(finite(workspace.queuedEditCount))),
      hasFurnitureReference: Boolean(workspace.hasFurnitureReference),
    },
    template: template ? {
      slug: short(template.slug, 120),
      title: short(template.title, 160),
      status: short(template.status, 80),
      category: short(template.category, 120),
      audience: short(template.audience, 120),
      description: short(template.description, 600),
      inputSummary: short(template.inputSummary, 600),
      resultType: short(template.resultType, 120),
      inputs: Array.isArray(template.inputs) ? template.inputs.slice(0, 20).map((value) => {
        const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return { label: short(item.label, 160), required: Boolean(item.required), minCount: Math.max(0, finite(item.minCount)), maxCount: Math.max(0, finite(item.maxCount)) };
      }) : [],
    } : null,
    ...(commerce ? { commerce: { product: product ? {
      id: short(product.id, 120),
      sku: short(product.sku, 120),
      name: short(product.name, 200),
      category: short(product.category, 120),
      brand: short(product.brand, 120),
      collection: short(product.collection, 120),
      price: Number.isFinite(Number(product.price)) && Number(product.price) >= 0 ? Number(product.price) : null,
      currency: "RUB",
      availability: ["in_stock", "out_of_stock", "preorder"].includes(short(product.availability, 40))
        ? short(product.availability, 40) as "in_stock" | "out_of_stock" | "preorder"
        : "unknown",
      canonicalUrl: (() => {
        const value = short(product.canonicalUrl, 500);
        try { return value && new URL(value).protocol === "https:" ? value : ""; } catch { return ""; }
      })(),
      attributes: Array.isArray(product.attributes) ? product.attributes.slice(0, 30).map((value) => {
        const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return { name: short(item.name, 80), value: short(item.value, 240) };
      }).filter((item) => item.name && item.value) : [],
    } : null } } : {}),
    availableActions: Array.isArray(input.availableActions)
      ? input.availableActions.map((item) => short(item, 80)).filter((item) => allowedActions.has(item)).slice(0, 10)
      : [],
  };
}
