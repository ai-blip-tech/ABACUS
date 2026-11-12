import type { ProposalPlanItem } from "../commercial-proposal.ts";
import { linkedNodeIds, type MaterialNode } from "./model.ts";
import type { MaterialWorkbook } from "./workbook.ts";

export type MaterialProposalStep = {
  id: string;
  role: "source" | "reference" | "result";
  title: string;
  image: string;
};

export type MaterialProposalVisualization = {
  id: string;
  title: string;
  image: string;
  resultType: MaterialNode["resultType"];
  steps?: MaterialProposalStep[];
};

export type MaterialProposalSnapshot = {
  items: ProposalPlanItem[];
  visualizations: MaterialProposalVisualization[];
};

type LocatedNode = { node: MaterialNode; sheetId: string; order: number };

const imageOf = (node: MaterialNode) => node.image || node.originalImage || "";
const xmlText = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] || character);
const svgDataUrl = (body: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">${body}</svg>`)}`;
const visualImageOf = (node: MaterialNode) => {
  const image = imageOf(node);
  if (image) return image;
  if (node.kind === "colour" && node.colour) {
    return svgDataUrl(`<rect width="1400" height="900" fill="${xmlText(node.colour)}"/><rect x="20" y="20" width="1360" height="860" rx="28" fill="none" stroke="rgba(255,255,255,.72)" stroke-width="5"/><text x="70" y="815" font-family="Arial, sans-serif" font-size="58" fill="white" stroke="rgba(0,0,0,.38)" stroke-width="1">${xmlText(node.title || node.colour)}</text>`);
  }
  return "";
};
const generatedOrder = (entry: LocatedNode) => entry.node.trayOrder ?? entry.order;
const newestFirst = (left: LocatedNode, right: LocatedNode) => generatedOrder(right) - generatedOrder(left);
const itemId = (sheetId: string, kind: string, id: string) => `materials-${sheetId}-${kind}-${id}`.slice(0, 120);
const isProductVariant = (node: MaterialNode) => node.resultType === "material-variant" || Boolean(
  node.kind === "reference" &&
  (node.generated || node.trayOnly) &&
  node.resultType !== "interior-render" &&
  !node.scene &&
  !node.interior &&
  (node.catalogId || node.title.includes(" · ")) &&
  imageOf(node),
);
const isCatalogSource = (node: MaterialNode) => Boolean(
  (node.kind === "product" || node.kind === "reference") &&
  node.catalogId &&
  imageOf(node) &&
  !node.generated &&
  !node.trayOnly &&
  !node.scene &&
  !node.interior &&
  !isProductVariant(node),
);

const nodeItem = (entry: LocatedNode, source: MaterialNode, image: string): ProposalPlanItem => ({
  id: itemId(entry.sheetId, "node", source.id),
  kind: "decor",
  name: source.title || "Предмет интерьера",
  width: source.widthMm || 500,
  depth: source.depthMm || 500,
  referenceHeightMm: source.heightMm ?? null,
  referenceImage: image,
  referenceImages: image ? [image] : [],
  referenceName: source.title || "Предмет интерьера",
  referenceProductId: source.catalogId,
  referenceBrand: source.brand,
});

const sourceForVariant = (variant: LocatedNode, sources: LocatedNode[]) => variant.node.catalogId
  ? sources.find((source) => source.node.catalogId === variant.node.catalogId)
  : sources.find((source) => variant.node.title.startsWith(`${source.node.title} ·`));

export function materialProposalSnapshot(workbook: MaterialWorkbook, selectedIds?: string[]): MaterialProposalSnapshot {
  const located: LocatedNode[] = workbook.sheets.flatMap((sheet) => sheet.board.nodes.map((node, order) => ({ node, sheetId: sheet.id, order })));
  const selected = selectedIds ? new Set(selectedIds) : null;
  const selectedNodes = selected ? located.filter(({ node }) => selected.has(node.id)) : located;
  const generatedVariants = located.filter(({ node }) => isProductVariant(node)).sort(newestFirst);
  const catalogSources = located.filter(({ node }) => isCatalogSource(node));
  const selectedVariants = selected ? generatedVariants.filter(({ node }) => selected.has(node.id)) : generatedVariants;
  const selectedCatalogIds = new Set(selectedNodes.map(({ node }) => node.catalogId).filter((id): id is string => Boolean(id)));
  // A later image edit can replace one item from the original planogram. The
  // replacement card is connected to the scene, so include that product in
  // the specification even when the manager selected only the edited scene.
  for (const entry of selectedNodes) {
    if (!entry.node.scene && entry.node.resultType !== "interior-render") continue;
    const sheet = workbook.sheets.find((candidate) => candidate.id === entry.sheetId);
    for (const linkedId of sheet ? linkedNodeIds(sheet.board, entry.node.id) : []) {
      const linked = sheet?.board.nodes.find((node) => node.id === linkedId);
      if (linked?.catalogId) selectedCatalogIds.add(linked.catalogId);
    }
  }
  const includeInteriorPlan = !selected || selectedNodes.some(({ node }) => node.resultType === "interior-render" || Boolean(node.scene));

  const relevantSources = catalogSources.filter((entry) => !selected || selected.has(entry.node.id) || Boolean(entry.node.catalogId && selectedCatalogIds.has(entry.node.catalogId)));
  const variantsForSource = (source: LocatedNode) => {
    const exact = selectedVariants.filter((variant) => sourceForVariant(variant, [source]));
    if (exact.length) return exact;
    if (selected && !selected.has(source.node.id)) return [];
    const fallback = generatedVariants.find((variant) => sourceForVariant(variant, [source]));
    return fallback ? [fallback] : [];
  };
  const planItems: ProposalPlanItem[] = [];
  for (const { node, sheetId } of located) for (const item of node.interior?.items || []) {
    if (!item.referenceImage || item.kind === "window" || item.kind === "door") continue;
    if (selected && !includeInteriorPlan && (!item.referenceProductId || !selectedCatalogIds.has(item.referenceProductId))) continue;
    planItems.push({ ...item, id: itemId(sheetId, "plan", item.id) });
  }
  const representedCatalogIds = new Set(planItems.map((item) => item.referenceProductId).filter((id): id is string => Boolean(id)));

  const productItems: ProposalPlanItem[] = [];
  const consumedVariants = new Set<string>();
  for (const entry of relevantSources) {
    const { node } = entry;
    if (node.catalogId && representedCatalogIds.has(node.catalogId)) continue;
    const variants = variantsForSource(entry);
    const variant = variants[0];
    for (const selectedVariant of variants) consumedVariants.add(selectedVariant.node.id);
    productItems.push(nodeItem(entry, node, variant ? imageOf(variant.node) : imageOf(node)));
  }

  const standaloneVariants = selectedVariants
    .filter((entry) => !consumedVariants.has(entry.node.id) && (!entry.node.catalogId || !representedCatalogIds.has(entry.node.catalogId)))
    .map((entry) => nodeItem(entry, entry.node, imageOf(entry.node)));

  const lineageVisualizations: MaterialProposalVisualization[] = [];
  for (const entry of relevantSources) {
    const variants = variantsForSource(entry);
    if (!variants.length) {
      // A product pulled in indirectly by a scene replacement belongs in the
      // specification, but should not create a redundant standalone slide.
      if (!selected || selected.has(entry.node.id)) lineageVisualizations.push({ id: `${entry.node.id}-source`, title: entry.node.title, image: imageOf(entry.node), resultType: undefined });
      continue;
    }
    const sheet = workbook.sheets.find((candidate) => candidate.id === entry.sheetId);
    const linkedIds = new Set(sheet ? linkedNodeIds(sheet.board, entry.node.id) : []);
    const referenceStep = (node: MaterialNode): MaterialProposalStep | undefined => {
      if (node.kind === "note" || isProductVariant(node)) return undefined;
      const image = visualImageOf(node);
      if (!image) return undefined;
      return { id: node.id, role: "reference", title: node.kind === "colour" ? `Цвет · ${node.title}` : `Материал · ${node.title}`, image };
    };
    const availableReferences = (sheet?.board.nodes || [])
      .filter((node) => linkedIds.has(node.id) && node.id !== entry.node.id && node.kind !== "note" && !isProductVariant(node))
      .map(referenceStep)
      .filter((step): step is MaterialProposalStep => Boolean(step));
    for (const variant of variants) {
      const persistedMaterial = variant.node.materialId ? sheet?.board.nodes.find((node) => node.id === variant.node.materialId) : undefined;
      const persistedReference = persistedMaterial ? referenceStep(persistedMaterial) : undefined;
      const exactReferences = persistedReference
        ? [persistedReference]
        : variant.node.materialId
          ? availableReferences.filter((step) => step.id === variant.node.materialId)
          : availableReferences;
      const references = (exactReferences.length ? exactReferences : availableReferences).slice(0, 4);
      const steps: MaterialProposalStep[] = [
        { id: entry.node.id, role: "source", title: "Исходный референс", image: imageOf(entry.node) },
        ...references,
        { id: variant.node.id, role: "result", title: "Результат изменения", image: imageOf(variant.node) },
      ];
      lineageVisualizations.push({
        id: `${entry.node.id}-result-${variant.node.id}`,
        title: variant.node.title || entry.node.title,
        image: imageOf(variant.node),
        resultType: "material-variant",
        steps,
      });
    }
  }

  const generatedEntries = located
    .filter(({ node }) => Boolean((node.generated || node.resultType) && !isProductVariant(node) && imageOf(node) && (!selected || selected.has(node.id))))
    .sort(newestFirst);

  // A planogram render is edited in place, while originalImage keeps its
  // initial state. Preserve both stages in the proposal instead of showing
  // the latest sofa on both pages.
  const interiorTimeline: MaterialProposalVisualization[] = [];
  const timelineImages = new Set<string>();
  for (const { node } of generatedEntries) {
    if (!node.scene || node.resultType !== "interior-render" || !node.originalImage || !node.image || node.originalImage === node.image) continue;
    interiorTimeline.push(
      { id: `${node.id}-planogram-original`, title: "Интерьер по планограмме · исходная версия", image: node.originalImage, resultType: "interior-render" },
      { id: `${node.id}-composition-current`, title: "Интерьерная композиция · актуальная версия", image: node.image, resultType: "interior-render" },
    );
    timelineImages.add(node.originalImage);
    timelineImages.add(node.image);
  }
  const generatedVisualizations: MaterialProposalVisualization[] = [
    ...interiorTimeline,
    ...generatedEntries
      .filter(({ node }) => !timelineImages.has(imageOf(node)))
      .map(({ node }) => ({ id: node.id, title: node.title || "Визуализация", image: imageOf(node), resultType: node.resultType })),
  ];

  const orderedVisualizations = interiorTimeline.length
    ? [...generatedVisualizations, ...lineageVisualizations]
    : [...lineageVisualizations, ...generatedVisualizations];
  const visualizations = [...new Map(orderedVisualizations.map((item) => [item.id, item])).values()].slice(0, 20);
  // Keep every object from the planogram: two identical chairs are quantity
  // 2 in the commercial proposal, even if one of them was recoloured. Only
  // extra catalog cards outside the planogram need de-duplication.
  const extraItems = [...productItems, ...standaloneVariants]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.referenceProductId && candidate.referenceProductId === item.referenceProductId || candidate.referenceProductId === item.referenceProductId && candidate.referenceName === item.referenceName) === index);
  const items = [...planItems, ...extraItems].slice(0, 100);

  return { items, visualizations };
}
