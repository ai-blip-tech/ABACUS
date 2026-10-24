"use client";

import "./planogram-controls";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type React from "react";
import AccountDropdown from "./account-dropdown";
import EditorImageActions from "./editor-image-actions";
import EditorHeader from "./editor-header";
import type { ItUiAction, ItUiTarget, RoomDesignContext } from "@/lib/it/types";
import TemplatesHome from "./templates-home";
import { normalizePlanReferenceImages } from "@/lib/plan-render";
import { clonePlanogramItem, isEditablePlanogramShortcutTarget } from "@/lib/planogram-clipboard";
import { downloadImageAsJpeg } from "@/lib/client-image-download";
import { clampPlanogramItemToRoom, planogramItemCenterPercent, planogramItemPositionBounds, planogramItemSizePercent } from "@/lib/planogram-geometry";
import { NORR_PRODUCT_QUERY_PARAMETER, NORR_PRODUCT_STORAGE_KEY, norrProductIdFromSearch, norrProductIdFromStorage, serializeNorrProductHandoff } from "@/lib/norr-product-handoff";

type Product = { name: string; type: string; price: string; image: string };
type DetectedObject = { id: string; name: string; x: number; y: number; width: number; height: number; polygon?: number[][] };
type HistoryItem = { id: string; name: string; image: string; generated: boolean; proposalItems?: PlanItem[] };
type LayerStroke = { id: string; name: string; points: number[][] };
type ProductParameter = { name: string; value: string };
type PlanItem = { id: string; kind: "sofa" | "table" | "chair" | "stool" | "bed" | "cabinet" | "dresser" | "nightstand" | "tv_stand" | "lamp" | "plant" | "rug" | "decor" | "window" | "door"; name: string; x: number; y: number; width: number; depth: number; rotation: number; rugShape?: "rectangular" | "round"; referenceImage?: string; referenceImages?: string[]; referenceName?: string; referenceProductId?: string; referenceArticle?: string; referenceBrand?: string; referenceCatalogSource?: "norrmobler"|"leve-home"; referenceUrl?: string; referencePrice?: number; referenceOldPrice?: number; referenceCategory?: string; referenceSubtype?: string; referenceColor?: string; referenceMaterial?: string; referenceHeightMm?: number|null; referenceDescription?: string; referenceParameters?: ProductParameter[]; proposalOverride?: { name?: string; width?: number; depth?: number; height?: number; price?: number; priceText?: string; quantity?: number; brand?: string; configuration?: string; option?: string; notes?: string } };
type PlanCamera = { x: number; y: number; height: number; rotation: number };
type CatalogProduct = { id:string; source?:"norrmobler"|"leve-home"; brand:string; name:string; article:string; image:string; images:string[]; url:string; price:number; oldPrice:number; available:boolean; category:string; subtype:string; color:string; material:string; widthMm:number|null; depthMm:number|null; heightMm:number|null; description:string; parameters:ProductParameter[] };
type StudioMaterial = { id:string; kind:"catalog"; product:CatalogProduct; addedAt:number };
type FurnitureReferenceDetails = { name:string; description:string; widthMm:string; depthMm:string; heightMm:string };
type FurnitureEdit = { id:string; action:"add"|"replace"; point:{x:number;y:number}; referenceName:string; referenceImage:string; product:CatalogProduct };
type MaterialSelection = { point:{x:number;y:number}; roomImage:string };
type MaterialReference = { image:string; name:string; description:string };
type PlanSurfaceReference = { image: string; name: string };
type SignedInUser = { id: string; email: string; role: "user" | "admin"; firstName: string; lastName: string; phone: string; companyRole: string };
type AccountProject = { id: string; name: string; project_type: string; description?: string | null; preview_image?: string | null; created_at: string; updated_at: string };
type AccountGeneration = { id: string; operation: string; created_at: string; total_tokens?: number | null; cost_usd?: number | null; image_deleted_at?: string | null };
type DashboardFurnitureItem = { identityKey:string; productId?:string; sku?:string; brandId?:string; brandName?:string; productName:string; imageUrl?:string; category?:string; variantLabel?:string; uniqueProjectCount:number; usageCount:number; lastUsedAt?:string; available?:boolean };
type DashboardBrand = { brandId:string; brandName:string; uniqueProductCount:number; projectCount:number; usageCount:number; sharePercent:number };
type PersonalCatalogDashboard = { projectsCount:number; uniqueProductsCount:number; favoritesCount:number; usedBrandsCount:number; topProducts:DashboardFurnitureItem[]; brands:DashboardBrand[]; furnitureState:"ready"|"empty"|"unavailable" };
type AccountOverview = { projects: AccountProject[]; generations: AccountGeneration[]; summary: { generation_count?: number; total_tokens?: number; cost_usd?: number }; dashboard?:PersonalCatalogDashboard };
type ProjectStateOverride = Partial<{ interiorImage: string; generatedImage: string; interiorName: string; generated: boolean; activeHistoryId: string | null; historyVersions: HistoryItem[]; proposalItems: PlanItem[]; studioMaterials:StudioMaterial[] }>;
type AppView = "home" | "account" | "newProject" | "projectMenu" | "studio";
type ProjectBrief = { client:string; object:string; goal:string; style:string; requirements:string; budget:string; timeline:string; conditions:string };

const EMPTY_PROJECT_BRIEF: ProjectBrief = { client:"", object:"", goal:"", style:"", requirements:"", budget:"", timeline:"", conditions:"" };

const products: Product[] = [
  { name: "Модульный диван Осло", type: "Диваны", price: "$2,400", image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=500&q=85" },
  { name: "Кресло Берген", type: "Кресла", price: "$890", image: "https://images.unsplash.com/photo-1592078615290-033ee584e267?auto=format&fit=crop&w=500&q=85" },
  { name: "Стол Стокгольм", type: "Журнальные столики", price: "$650", image: "https://images.unsplash.com/photo-1532372320572-cda25653a26d?auto=format&fit=crop&w=500&q=85" },
];

const escapeProposalText = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] || character));
const proposalPrice = (value?: number) => value ? `${new Intl.NumberFormat("ru-RU").format(value)} руб.` : "Цена по запросу";
const proposalKindForProduct = (product: CatalogProduct): PlanItem["kind"] => {
  const identity = `${product.category} ${product.subtype} ${product.name}`.toLowerCase();
  if (/диван|sofa/.test(identity)) return "sofa";
  if (/пуф|банкетк|оттоманк|ottoman|pouf/.test(identity)) return "stool";
  if (/кресл|chair/.test(identity)) return "chair";
  if (/стол|table/.test(identity)) return "table";
  if (/торшер|свет|ламп|light|lamp/.test(identity)) return "lamp";
  if (/ков[её]р|rug|carpet/.test(identity)) return "rug";
  if (/кровать|bed/.test(identity)) return "bed";
  if (/шкаф|cabinet/.test(identity)) return "cabinet";
  return "decor";
};

const proposalItemForEdit = (edit: FurnitureEdit): PlanItem => {
  const product = edit.product;
  return {
    id: `editor-${edit.id}`,
    kind: proposalKindForProduct(product),
    name: product.name,
    x: edit.point.x,
    y: edit.point.y,
    width: product.widthMm || 500,
    depth: product.depthMm || 500,
    rotation: 0,
    referenceImage: product.image,
    referenceImages: product.images,
    referenceName: product.name,
    referenceProductId: product.id,
    referenceArticle: product.article,
    referenceBrand: product.brand,
    referenceCatalogSource: product.source,
    referenceUrl: product.url,
    referencePrice: product.price,
    referenceOldPrice: product.oldPrice,
    referenceCategory: product.category,
    referenceSubtype: product.subtype,
    referenceColor: product.color,
    referenceMaterial: product.material,
    referenceHeightMm: product.heightMm,
    referenceDescription: product.description,
    referenceParameters: product.parameters,
  };
};

const removeNearestProposalItem = (items: PlanItem[], point: { x: number; y: number }, maximumDistance = 14) => {
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  items.forEach((item, index) => {
    const distance = Math.hypot(item.x - point.x, item.y - point.y);
    if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
  });
  return nearestIndex >= 0 && nearestDistance <= maximumDistance
    ? items.filter((_, index) => index !== nearestIndex)
    : items;
};

const applyProposalEdits = (items: PlanItem[], edits: FurnitureEdit[]) => edits.reduce((current, edit) => {
  const base = edit.action === "replace" ? removeNearestProposalItem(current, edit.point) : current;
  return [...base, proposalItemForEdit(edit)];
}, items);

const DEFAULT_PROJECT_PROMPT = "Создайте тёплую скандинавскую гостиную с натуральным дубом, нейтральным текстилем и мягким освещением.";
const DEFAULT_PRESERVED_PARTS = ["Архитектуру", "Окна", "Пол", "Потолок"];

export default function Home() {
  const [view, setView] = useState<AppView>("home");
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [norrEntryAuth, setNorrEntryAuth] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectType, setProjectType] = useState("Квартира");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectBrief, setProjectBrief] = useState<ProjectBrief>(EMPTY_PROJECT_BRIEF);
  const [projectError, setProjectError] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const skipNextProjectLoadRef = useRef("");
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [projectSaved, setProjectSaved] = useState(false);
  const [saveProjectDialogOpen, setSaveProjectDialogOpen] = useState(false);
  const [saveProjectName, setSaveProjectName] = useState("");
  const [saveProjectError, setSaveProjectError] = useState("");
  const [activeTool, setActiveTool] = useState("Добавить мебель"); const [selected, setSelected] = useState("Модульный диван Осло");
  const [unifiedStudioPreview, setUnifiedStudioPreview] = useState(true);
  const [imageStudioTool, setImageStudioTool] = useState("Добавить мебель");
  const [studioDrawer, setStudioDrawer] = useState<"context" | "history" | null>(null);
  const studioWorkspaceRef = useRef<HTMLElement>(null);
  const [isGenerating, setIsGenerating] = useState(false); const [generated, setGenerated] = useState(false); const [favorite, setFavorite] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_PROJECT_PROMPT);
  const [imageInstructionDraft, setImageInstructionDraft] = useState("");
  const [imageInstruction, setImageInstruction] = useState("");
  const [preserved, setPreserved] = useState(DEFAULT_PRESERVED_PARTS);
  const [creativity, setCreativity] = useState("Средняя");
  const [furnitureMode, setFurnitureMode] = useState<"choice" | "reference">("choice");
  const [furnitureAction, setFurnitureAction] = useState<"add" | "replace" | "remove">("add");
  const [referenceName, setReferenceName] = useState("");
  const [referenceImage, setReferenceImage] = useState("");
  const [referenceDetails, setReferenceDetails] = useState<FurnitureReferenceDetails>({name:"",description:"",widthMm:"",depthMm:"",heightMm:""});
  const [referenceSelected, setReferenceSelected] = useState(false);
  const [linkedCatalogProduct, setLinkedCatalogProduct] = useState<CatalogProduct | null>(null);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [, setExactMasks] = useState<Record<string, string>>({});
  const [exactPolygons, setExactPolygons] = useState<Record<string, number[][][]>>({});
  const isSegmenting = false;
  const [selectedObject, setSelectedObject] = useState<DetectedObject | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState("");
  const [interiorImage, setInteriorImage] = useState("");
  const [interiorName, setInteriorName] = useState("");
  const [canvasRatio, setCanvasRatio] = useState(16 / 9);
  const [hoveredObject, setHoveredObject] = useState<string | null>(null);
  const [historyVersions, setHistoryVersions] = useState<HistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [upscaleVersion, setUpscaleVersion] = useState<HistoryItem | null>(null);
  const [replacementTarget, setReplacementTarget] = useState<DetectedObject | null>(null);
  const [replacementMask, setReplacementMask] = useState("");
  const [layerBackground, setLayerBackground] = useState("");
  const [layerImages, setLayerImages] = useState<Record<string, string>>({});
  const [hiddenLayerIds, setHiddenLayerIds] = useState<string[]>([]);
  const [layerPoints, setLayerPoints] = useState<Array<{id:string;x:number;y:number;width:number;height:number;name:string}>>([]);
  const [layerStrokes, setLayerStrokes] = useState<LayerStroke[]>([]);
  const [layerDrawing, setLayerDrawing] = useState<number[][] | null>(null);
  const [placementPoint, setPlacementPoint] = useState<{x:number;y:number} | null>(null);
  useEffect(()=>{const node=studioWorkspaceRef.current;if(!node)return;if(!placementPoint){node.style.removeProperty("--studio-point-x");node.style.removeProperty("--studio-point-y");return;}node.style.setProperty("--studio-point-x",`${placementPoint.x}%`);node.style.setProperty("--studio-point-y",`${placementPoint.y}%`);},[placementPoint]);
  useEffect(()=>{const node=studioWorkspaceRef.current;if(!node)return;if(!placementPoint){delete node.dataset.studioOrbit;return;}node.dataset.studioOrbit=placementPoint.x<22?"right":placementPoint.x>78?"left":placementPoint.y<28?"below":"above";},[placementPoint]);
  const [furnitureEdits, setFurnitureEdits] = useState<FurnitureEdit[]>([]);
  const previousPlacementPointRef=useRef("");
  const [studioMaterials,setStudioMaterials]=useState<StudioMaterial[]>([]);
  const [studioCatalogOpen,setStudioCatalogOpen]=useState(false);
  const catalogReturnFocusRef=useRef<HTMLElement|null>(null);
  useEffect(()=>{if(!furnitureEdits.length)setLinkedCatalogProduct(null);},[furnitureEdits.length]);
  useEffect(()=>{const key=placementPoint?`${placementPoint.x.toFixed(3)}:${placementPoint.y.toFixed(3)}`:"";if(previousPlacementPointRef.current&&previousPlacementPointRef.current!==key){setFurnitureEdits([]);setLinkedCatalogProduct(null);}previousPlacementPointRef.current=key;},[placementPoint]);
  useEffect(()=>{
    if(!unifiedStudioPreview)return;
    const sync=()=>setStudioCatalogOpen(new URLSearchParams(window.location.search).get("catalog")==="furniture");
    sync();window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync);
  },[unifiedStudioPreview]);
  const [placementPrompt, setPlacementPrompt] = useState("");
  useEffect(()=>{if(unifiedStudioPreview&&imageInstruction&&!placementPrompt)setPlacementPrompt(imageInstruction);},[unifiedStudioPreview,imageInstruction,placementPrompt]);
  const [materialMenuOpen, setMaterialMenuOpen] = useState(false);
  const [materialSelection, setMaterialSelection] = useState<MaterialSelection | null>(null);
  const [materialReference, setMaterialReference] = useState<MaterialReference>({image:"",name:"",description:""});
  const materialInputRef = useRef<HTMLInputElement>(null);
  const [orbitAction, setOrbitAction] = useState<"add" | "replace" | "material" | "remove" | null>(null);
  const [orbitSuppressedAction, setOrbitSuppressedAction] = useState<"add" | "replace" | "material" | "remove" | null>(null);
  useEffect(()=>{
    if(!unifiedStudioPreview)return;
    if(!placementPoint){setOrbitAction(null);setOrbitSuppressedAction(null);return;}
    const root=studioWorkspaceRef.current;
    const actions=root?.querySelectorAll<HTMLButtonElement>(".studio-point-actions > button");
    const brush=root?.querySelector<HTMLButtonElement>(".material-brush-trigger");
    if(!actions||actions.length<3||!brush)return;
    const toggleAction=(action:"add"|"replace"|"material"|"remove")=>{const next=orbitAction===action?null:action;setOrbitAction(next);setOrbitSuppressedAction(next?null:action);};
    const chooseAdd=()=>{setMaterialMenuOpen(false);toggleAction("add");};
    const chooseReplace=()=>{setMaterialMenuOpen(false);toggleAction("replace");};
    const chooseRemove=()=>{setMaterialMenuOpen(false);toggleAction("remove");};
    const chooseMaterial=()=>toggleAction("material");
    const releaseAdd=()=>setOrbitSuppressedAction((current)=>current==="add"?null:current);
    const releaseReplace=()=>setOrbitSuppressedAction((current)=>current==="replace"?null:current);
    const releaseMaterial=()=>setOrbitSuppressedAction((current)=>current==="material"?null:current);
    const releaseRemove=()=>setOrbitSuppressedAction((current)=>current==="remove"?null:current);
    actions[0].addEventListener("click",chooseAdd);
    actions[1].addEventListener("click",chooseReplace);
    actions[2].addEventListener("click",chooseRemove);
    brush.addEventListener("click",chooseMaterial);
    actions[0].addEventListener("mouseleave",releaseAdd);
    actions[1].addEventListener("mouseleave",releaseReplace);
    actions[2].addEventListener("mouseleave",releaseRemove);
    brush.addEventListener("mouseleave",releaseMaterial);
    return()=>{actions[0].removeEventListener("click",chooseAdd);actions[1].removeEventListener("click",chooseReplace);actions[2].removeEventListener("click",chooseRemove);brush.removeEventListener("click",chooseMaterial);actions[0].removeEventListener("mouseleave",releaseAdd);actions[1].removeEventListener("mouseleave",releaseReplace);actions[2].removeEventListener("mouseleave",releaseRemove);brush.removeEventListener("mouseleave",releaseMaterial);};
  },[unifiedStudioPreview,placementPoint,orbitAction]);
  useEffect(()=>{
    if(!unifiedStudioPreview)return;
    const root=studioWorkspaceRef.current;
    const actions=root?.querySelectorAll<HTMLButtonElement>(".studio-point-actions > button");
    const brush=root?.querySelector<HTMLButtonElement>(".material-brush-trigger");
    actions?.[0]?.classList.toggle("active",orbitAction==="add");
    actions?.[1]?.classList.toggle("active",orbitAction==="replace");
    actions?.[2]?.classList.toggle("active",orbitAction==="remove");
    actions?.[0]?.classList.toggle("deactivated",orbitSuppressedAction==="add");
    actions?.[1]?.classList.toggle("deactivated",orbitSuppressedAction==="replace");
    actions?.[2]?.classList.toggle("deactivated",orbitSuppressedAction==="remove");
    actions?.[0]?.setAttribute("aria-pressed",String(orbitAction==="add"));
    actions?.[1]?.setAttribute("aria-pressed",String(orbitAction==="replace"));
    actions?.[2]?.setAttribute("aria-pressed",String(orbitAction==="remove"));
    brush?.classList.toggle("active",orbitAction==="material");
    brush?.classList.toggle("deactivated",orbitSuppressedAction==="material");
    brush?.setAttribute("aria-pressed",String(orbitAction==="material"));
  },[unifiedStudioPreview,placementPoint,orbitAction,orbitSuppressedAction]);
  useEffect(()=>{const confirmRemove=()=>{if(placementPoint)void removeAtPlacement(placementPoint,true);};window.addEventListener("room-confirm-remove",confirmRemove);return()=>window.removeEventListener("room-confirm-remove",confirmRemove);},[placementPoint]);
  const [layerDrag, setLayerDrag] = useState<{x:number;y:number}|null>(null);
  const [layerEdit, setLayerEdit] = useState<{id:string;mode:"move"|"n"|"s"|"e"|"w"|"ne"|"nw"|"se"|"sw";x:number;y:number;source:{x:number;y:number;width:number;height:number}}|null>(null);
  const [isBuildingLayers, setIsBuildingLayers] = useState(false);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [proposalItems, setProposalItems] = useState<PlanItem[]>([]);
  const [planSelectedId, setPlanSelectedId] = useState<string | null>(null);
  const [planRoom, setPlanRoom] = useState({ width: 6000, length: 4500 });
  const [planFloorReference, setPlanFloorReference] = useState<PlanSurfaceReference | null>(null);
  const [planWallReference, setPlanWallReference] = useState<PlanSurfaceReference | null>(null);
  const [planCamera, setPlanCamera] = useState<PlanCamera | null>(null);
  const [planInstructionDraft, setPlanInstructionDraft] = useState("");
  const [planInstruction, setPlanInstruction] = useState("");
  const [isPlanRendering, setIsPlanRendering] = useState(false);
  const [proposalMenuOpen, setProposalMenuOpen] = useState(false);
  const [proposalError, setProposalError] = useState("");
  const resetProjectWorkspace = (clearDetails = false) => {
    setProjectId("");
    if (clearDetails) { setProjectName(""); setProjectType("Квартира"); setProjectDescription(""); setProjectBrief(EMPTY_PROJECT_BRIEF); }
    setProjectError(""); setProjectSaved(false); setIsLoadingProject(false); setIsSavingProject(false);
    setSaveProjectDialogOpen(false); setSaveProjectName(""); setSaveProjectError("");
    setActiveTool("Добавить мебель"); setSelected("Модульный диван Осло"); setGenerated(false); setFavorite(false);
    setGeneratedImage(null); setGenerationError(""); setPrompt(DEFAULT_PROJECT_PROMPT); setImageInstructionDraft(""); setImageInstruction(""); setPreserved(DEFAULT_PRESERVED_PARTS); setCreativity("Средняя");
    setFurnitureMode("choice"); setFurnitureAction("add"); setReferenceName(""); setReferenceImage(""); setReferenceDetails({name:"",description:"",widthMm:"",depthMm:"",heightMm:""});setReferenceSelected(false);setMaterialReference({image:"",name:"",description:""}); setLinkedCatalogProduct(null);
    setDetectedObjects([]); setExactMasks({}); setExactPolygons({}); setSelectedObject(null); setIsDetecting(false); setDetectionError("");
    setInteriorImage(""); setInteriorName(""); setCanvasRatio(16 / 9); setHoveredObject(null); setHistoryVersions([]); setActiveHistoryId(null); setUpscaleVersion(null);
    setReplacementTarget(null); setReplacementMask(""); setLayerBackground(""); setLayerImages({}); setHiddenLayerIds([]); setLayerPoints([]); setLayerStrokes([]); setLayerDrawing(null);
    setPlacementPoint(null); setFurnitureEdits([]); setPlacementPrompt(""); setMaterialMenuOpen(false); setMaterialSelection(null); setLayerDrag(null); setLayerEdit(null); setIsBuildingLayers(false);
    setStudioMaterials([]);setStudioCatalogOpen(false);
    setPlanItems([]); setProposalItems([]); setPlanSelectedId(null); setPlanRoom({ width: 6000, length: 4500 }); setPlanFloorReference(null); setPlanWallReference(null); setPlanCamera(null);
    setPlanInstructionDraft(""); setPlanInstruction(""); setIsPlanRendering(false); setProposalMenuOpen(false); setProposalError("");
    skipNextProjectLoadRef.current = "";
  };
  const setRatioFromImage = (source: string) => { const preview = new Image(); preview.onload = () => setCanvasRatio(preview.naturalWidth / preview.naturalHeight); preview.src = source; };
  const addHistoryVersion = (image: string, name: string, isGenerated = true, nextProposalItems = proposalItems) => { const version: HistoryItem = { id: `${Date.now()}-${Math.random()}`, name, image, generated: isGenerated, proposalItems: nextProposalItems }; setHistoryVersions((items) => [...items, version].slice(-8)); setActiveHistoryId(version.id); setUpscaleVersion(version); setProjectSaved(false); };
  const blobAsDataUrl = async (url: string) => {
    const imageBlob = await fetch(url).then((response) => response.blob());
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Не удалось подготовить изображение интерьера."));
      reader.readAsDataURL(imageBlob);
    });
  };
  const blobToDataUrl = (imageBlob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Не удалось подготовить новую визуализацию.")); reader.readAsDataURL(imageBlob); });
  const imageForProjectSave = async (image: string | null) => !image ? "" : image.startsWith("data:") ? image : blobAsDataUrl(image);
  const imageForPdf = async (image: string) => {
    const source = await imageForProjectSave(image);
    if (/^data:image\/(?:png|jpe?g);/i.test(source)) return source;
    return new Promise<string>((resolve, reject) => {
      const preview = new Image();
      preview.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = preview.naturalWidth;
        canvas.height = preview.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) { reject(new Error("Не удалось подготовить изображение визуализации для PDF.")); return; }
        context.drawImage(preview, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      preview.onerror = () => reject(new Error("Не удалось подготовить изображение визуализации для PDF."));
      preview.src = source;
    });
  };
  const persistProject = async (targetId:string,targetName:string,override:ProjectStateOverride={}) => {
    const nextInterior = override.interiorImage ?? interiorImage;
    const nextGenerated = override.generatedImage ?? generatedImage;
    const nextHistory = override.historyVersions ?? historyVersions;
    const [savedInterior, savedGenerated, savedHistory] = await Promise.all([
      imageForProjectSave(nextInterior || nextGenerated),
      imageForProjectSave(nextGenerated || nextInterior),
      Promise.all(nextHistory.map(async (version) => ({ ...version, image: await imageForProjectSave(version.image) }))),
    ]);
    if (!savedInterior && !planItems.length) throw new Error("Добавьте предметы в планограмму или загрузите интерьер, затем сохраните проект.");
    const response = await fetch(`/api/projects/${encodeURIComponent(targetId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: targetName, projectType, description: projectDescription, state: { interiorImage: savedInterior, generatedImage: savedGenerated, interiorName: override.interiorName ?? interiorName, canvasRatio, generated: override.generated ?? generated, activeHistoryId: override.activeHistoryId ?? activeHistoryId, historyVersions: savedHistory, prompt, imageInstruction, preserved, creativity, planItems, proposalItems: override.proposalItems ?? proposalItems, studioMaterials:override.studioMaterials??studioMaterials, referenceImage,referenceName,referenceDetails,materialReference, planRoom, planFloorReference, planWallReference, planCamera, planInstruction } }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Не удалось сохранить проект.");
  };
  const saveProject = async () => { if (!user) { openAuth("login"); return; } if (!projectId) { setSaveProjectName(projectName.trim()); setSaveProjectError(""); setSaveProjectDialogOpen(true); return; } const name=projectName.trim(); if(!name){setGenerationError("Укажите название проекта перед сохранением.");return;} setIsSavingProject(true); setProjectSaved(false); setGenerationError(""); try { await persistProject(projectId,name); setProjectSaved(true); } catch (error) { setGenerationError(error instanceof Error ? error.message : "Не удалось сохранить проект."); } finally { setIsSavingProject(false); } };
  const saveGenerationAsProject = async (event:React.FormEvent) => { event.preventDefault(); if(isSavingProject)return; const name=saveProjectName.trim(); if(!name){setSaveProjectError("Введите название проекта.");return;} setIsSavingProject(true);setProjectSaved(false);setGenerationError("");setSaveProjectError("");try{let targetId=projectId;if(!targetId){const createResponse=await fetch("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,projectType,description:projectDescription})});const createPayload=await createResponse.json().catch(()=>({}));if(!createResponse.ok||!createPayload.project?.id)throw new Error(createPayload.error||"Не удалось создать проект.");targetId=String(createPayload.project.id);setProjectId(targetId);const url=new URL(window.location.href);url.searchParams.set("project",targetId);url.hash="#студия";window.history.replaceState({...window.history.state,norrView:"studio",projectId:targetId},"",`${url.pathname}${url.search}${url.hash}`);}setProjectName(name);await persistProject(targetId,name);setProjectSaved(true);setSaveProjectDialogOpen(false);}catch(error){setSaveProjectError(error instanceof Error?error.message:"Не удалось сохранить проект.");}finally{setIsSavingProject(false);}};
  const openCommercialProposal = async () => {
    if (isSavingProject) return;
    if (!user) { openAuth("login"); return; }
    const targetId = projectId;
    const name = projectName.trim();
    if (!targetId || !name) { setProposalError("Сначала сохраните проект."); return; }
    const popup = window.open("", "_blank");
    if (!popup) { setProposalError("Браузер заблокировал новую вкладку. Разрешите всплывающие окна для сайта."); return; }
    popup.opener = null;
    popup.document.write('<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Готовим коммерческое предложение…</title></head><body style="font:16px Arial,sans-serif;padding:40px;color:#2b1d14">Сохраняем проект и готовим коммерческое предложение…</body></html>');
    setIsSavingProject(true);
    setProjectSaved(false);
    setProposalError("");
    try {
      const selectedVersion = historyVersions.find((version) => version.id === activeHistoryId);
      if (activeHistoryId && !selectedVersion) throw new Error("Выбранная версия рендера не найдена. Выберите изображение повторно.");
      const selectedItems = selectedVersion?.proposalItems || proposalItems;
      const selectedImage = selectedVersion?.image || generatedImage || interiorImage;
      const proposalVisualization = await imageForProjectSave(selectedImage);
      await persistProject(targetId, name, {
        generatedImage: selectedImage,
        activeHistoryId: selectedVersion?.id || activeHistoryId,
        proposalItems: selectedItems,
      });
      const snapshotResponse = await fetch(`/api/projects/${encodeURIComponent(targetId)}/proposal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [], visualization: proposalVisualization, historyId: selectedVersion?.id || null }),
      });
      const snapshotPayload = await snapshotResponse.json().catch(() => ({}));
      if (!snapshotResponse.ok) throw new Error(snapshotPayload.error || "Не удалось зафиксировать выбранную визуализацию.");
      setProjectSaved(true);
      popup.location.replace(`/proposal/${encodeURIComponent(targetId)}`);
    } catch (error) {
      popup.close();
      setProposalError(error instanceof Error ? error.message : "Не удалось подготовить коммерческое предложение.");
    } finally {
      setIsSavingProject(false);
    }
  };
  const printCommercialProposalLegacy = async (withPrices: boolean) => {
    let proposalProducts = Array.from(new Map(planItems.filter((item) => item.referenceProductId && item.referenceImage).map((item) => [item.referenceProductId, item])).values());
    const coverImage = generatedImage || interiorImage;
    if (!coverImage) { setProposalError("Сначала создайте или загрузите визуализацию интерьера."); return; }
    if (!proposalProducts.length) { setProposalError("В планограмме нет товаров, выбранных из каталога."); return; }
    const popup = window.open("", "_blank");
    if (!popup) { setProposalError("Браузер заблокировал окно печати. Разрешите всплывающие окна для сайта."); return; }
    popup.opener = null;
    popup.document.write('<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Готовим коммерческое предложение…</title></head><body style="font:16px Arial;padding:40px">Получаем актуальные данные товаров…</body></html>');
    try {
      const ids = proposalProducts.map((item) => item.referenceProductId).filter(Boolean).join(",");
      const response = await fetch(`/api/catalog?ids=${encodeURIComponent(ids)}`);
      const payload = await response.json().catch(() => ({ products: [] }));
      if (response.ok && Array.isArray(payload.products)) {
        const currentProducts = new Map<string, CatalogProduct>(payload.products.map((product: CatalogProduct) => [product.id, product]));
        proposalProducts = proposalProducts.map((item) => { const product = currentProducts.get(item.referenceProductId || ""); return product ? {...item,referenceImage:product.image,referenceImages:product.images,referenceName:product.name,referenceArticle:product.article,referenceBrand:product.brand,referenceCatalogSource:product.source,referenceUrl:product.url,referencePrice:product.price,referenceOldPrice:product.oldPrice,referenceCategory:product.category,referenceSubtype:product.subtype,referenceColor:product.color,referenceMaterial:product.material,referenceHeightMm:product.heightMm,referenceDescription:product.description,referenceParameters:product.parameters} : item; });
      }
    } catch { /* Saved project metadata remains a valid offline fallback. */ }
    setProposalMenuOpen(false);
    setProposalError("");
    const productPages = proposalProducts.map((item, index) => {
      const secondaryImage = (item.referenceImages || []).find((image) => image && image !== item.referenceImage);
      const dimensions = [
        item.width ? `<div><span>Ширина</span><b>${escapeProposalText(item.width)} мм</b></div>` : "",
        item.referenceHeightMm ? `<div><span>Высота</span><b>${escapeProposalText(item.referenceHeightMm)} мм</b></div>` : "",
        item.depth ? `<div><span>Глубина</span><b>${escapeProposalText(item.depth)} мм</b></div>` : "",
      ].join("");
      const details = [
        item.referenceArticle ? `<div><span>Артикул</span><b>${escapeProposalText(item.referenceArticle)}</b></div>` : "",
        item.referenceCategory ? `<div><span>Категория</span><b>${escapeProposalText(item.referenceCategory)}</b></div>` : "",
        item.referenceSubtype ? `<div><span>Тип</span><b>${escapeProposalText(item.referenceSubtype)}</b></div>` : "",
        item.referenceMaterial ? `<div><span>Материал</span><b>${escapeProposalText(item.referenceMaterial)}</b></div>` : "",
        item.referenceColor ? `<div><span>Цвет</span><b>${escapeProposalText(item.referenceColor)}</b></div>` : "",
      ].join("");
      const extraParameters = (item.referenceParameters || []).filter((parameter) => !/артикул|габаритная (ширина|глубина|высота)|материал|цвет|тип/i.test(parameter.name)).slice(0, 10).map((parameter) => `<div><span>${escapeProposalText(parameter.name)}</span><b>${escapeProposalText(parameter.value)}</b></div>`).join("");
      return `<section class="page product-page">
        <aside><p class="page-number">${String(index + 2).padStart(2, "0")}</p><p class="eyebrow">ПРЕДМЕТ ИНТЕРЬЕРА</p><h1>${escapeProposalText(item.referenceName || item.name)}</h1><div class="spec-title">Размеры</div><div class="specs">${dimensions}</div><div class="spec-title">Характеристики</div><div class="specs">${details}${extraParameters}</div>${item.referenceUrl ? `<a href="${escapeProposalText(item.referenceUrl)}">Открыть карточку товара</a>` : ""}</aside>
        <main><div class="product-images">${secondaryImage ? `<img class="lifestyle" src="${escapeProposalText(secondaryImage)}" alt="">` : ""}<img class="main-product" src="${escapeProposalText(item.referenceImage)}" alt=""></div>${item.referenceDescription ? `<p class="description">${escapeProposalText(item.referenceDescription)}</p>` : ""}${withPrices ? `<div class="price">${item.referenceOldPrice && item.referenceOldPrice > (item.referencePrice || 0) ? `<del>${proposalPrice(item.referenceOldPrice)}</del>` : ""}<strong>${proposalPrice(item.referencePrice)}</strong></div>` : ""}</main>
      </section>`;
    }).join("");
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Коммерческое предложение — ${escapeProposalText(projectName || "ROOM design")}</title><style>
      @page{size:A4 landscape;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#eee;color:#111;font-family:Arial,Helvetica,sans-serif}.page{width:297mm;height:210mm;position:relative;overflow:hidden;background:#fff;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}.cover img{width:100%;height:100%;object-fit:cover}.cover:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 58%,rgba(255,255,255,.22))}.cover-logo{position:absolute;z-index:2;left:50%;top:28%;transform:translate(-50%,-50%);width:43mm;height:43mm;border:1.3px solid #111;border-radius:50%;display:grid;place-items:center;font-size:11mm;letter-spacing:1.2mm;background:rgba(255,255,255,.08)}.cover-title{position:absolute;z-index:2;right:14mm;bottom:12mm;font-size:7mm;font-weight:500;letter-spacing:.2mm}.product-page{display:grid;grid-template-columns:80mm 1fr}.product-page aside{background:#f1efed;padding:12mm 8mm 9mm;display:flex;flex-direction:column}.page-number{margin:0 0 11mm;font-size:3mm;color:#777}.eyebrow{font-size:2.8mm;letter-spacing:.5mm;margin:0 0 3mm;color:#777}.product-page h1{font-size:8mm;line-height:1.05;margin:0 0 13mm}.spec-title{font-size:4.3mm;margin:0 0 3mm;padding-bottom:3mm;border-bottom:.35mm solid #222}.specs{display:grid;gap:2mm;margin:0 0 8mm}.specs div{display:grid;grid-template-columns:1fr auto;gap:4mm;font-size:3.3mm}.specs span{color:#555}.specs b{text-align:right;font-weight:600}.product-page aside a{margin-top:auto;color:#111;font-size:3mm}.product-page main{position:relative;padding:7mm 8mm 10mm;display:flex;flex-direction:column}.product-images{height:112mm;display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:5mm;align-items:center}.product-images img{width:100%;height:100%;object-fit:contain}.product-images .lifestyle{object-fit:cover}.description{font-size:4mm;line-height:1.42;max-width:175mm;margin:6mm 0 0}.price{margin-top:auto;align-self:flex-end;display:flex;flex-direction:column;align-items:flex-end}.price del{font-size:5mm;color:#aaa}.price strong{font-size:8mm}.print-note{position:fixed;inset:auto 8px 8px auto;background:#2b1d14;color:#fff;border:0;border-radius:6px;padding:12px 18px;font-size:14px;z-index:10}@media print{body{background:#fff}.print-note{display:none}}
    </style></head><body><button class="print-note" onclick="window.print()">Печать / сохранить PDF</button><section class="page cover"><img src="${escapeProposalText(coverImage)}" alt=""><div class="cover-logo">NORR</div><div class="cover-title">КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</div></section>${productPages}<script>Promise.all(Array.from(document.images).map(function(image){return image.complete?Promise.resolve():new Promise(function(resolve){image.onload=image.onerror=resolve})})).then(function(){setTimeout(function(){window.print()},300)})<\/script></body></html>`);
    popup.document.close();
  };
  void printCommercialProposalLegacy;
  const printCommercialProposal = async (withPrices: boolean) => {
    let proposalProducts = Array.from(new Map(planItems.filter((item) => item.referenceProductId && item.referenceImage).map((item) => [item.referenceProductId, item])).values());
    const visualisation = generatedImage || interiorImage;
    if (!visualisation) { setProposalError("Сначала создайте или загрузите визуализацию интерьера."); return; }
    if (!proposalProducts.length) { setProposalError("В планограмме нет товаров, выбранных из каталога."); return; }
    const pdfWindow = window.open("about:blank", "_blank");
    if (!pdfWindow) { setProposalError("Браузер заблокировал новую вкладку. Разрешите всплывающие окна для просмотра PDF."); return; }
    pdfWindow.opener = null;
    pdfWindow.document.write('<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Готовим коммерческое предложение…</title></head><body style="font:16px Arial,sans-serif;padding:40px;color:#2b1d14">Готовим PDF…</body></html>');
    pdfWindow.document.close();
    setProposalError("Готовим PDF…");
    try {
      const ids = proposalProducts.map((item) => item.referenceProductId).filter(Boolean).join(",");
      const catalogResponse = await fetch(`/api/catalog?ids=${encodeURIComponent(ids)}`);
      const catalogPayload = await catalogResponse.json().catch(() => ({ products: [] }));
      if (catalogResponse.ok && Array.isArray(catalogPayload.products)) {
        const currentProducts = new Map<string, CatalogProduct>(catalogPayload.products.map((product: CatalogProduct) => [product.id, product]));
        proposalProducts = proposalProducts.map((item) => {
          const product = currentProducts.get(item.referenceProductId || "");
          return product ? { ...item, referenceImage: product.image, referenceImages: product.images, referenceName: product.name, referenceArticle: product.article, referenceBrand: product.brand, referenceCatalogSource: product.source, referenceUrl: product.url, referencePrice: product.price, referenceOldPrice: product.oldPrice, referenceCategory: product.category, referenceSubtype: product.subtype, referenceColor: product.color, referenceMaterial: product.material, referenceHeightMm: product.heightMm, referenceDescription: product.description, referenceParameters: product.parameters } : item;
        });
      }
      const [coverImage, proposalCoverImage, fontData] = await Promise.all([
        imageForPdf(visualisation),
        blobAsDataUrl("/proposal-cover.png"),
        blobAsDataUrl("/fonts/Arial.ttf"),
      ]);
      const response = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: projectName || "ROOM design", proposalCoverImage, coverImage, fontData, withPrices, products: proposalProducts }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Не удалось создать PDF.");
      }
      const pdfBlob = await response.blob();
      if (pdfBlob.type !== "application/pdf" || pdfBlob.size < 1000) throw new Error("Сервер вернул некорректный PDF.");
      const pdfUrl = URL.createObjectURL(pdfBlob);
      pdfWindow.location.replace(pdfUrl);
      setProposalMenuOpen(false);
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 10 * 60 * 1000);
    } catch (error) {
      pdfWindow.close();
      const message = error instanceof Error ? error.message : "Не удалось создать PDF.";
      setProposalError(message);
      setProposalMenuOpen(true);
    }
  };
  useEffect(() => {
    if ((view !== "studio" && view !== "projectMenu") || !projectId) return;
    if (skipNextProjectLoadRef.current === projectId) {
      skipNextProjectLoadRef.current = "";
      setIsLoadingProject(false);
      return;
    }
    let active = true;
    const loadingStartedAt = Date.now();
    setIsLoadingProject(true);
    void fetch(`/api/projects/${encodeURIComponent(projectId)}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Не удалось открыть проект.");
        return payload;
      })
      .then((payload) => {
        if (!active || !payload?.project) return;
        setProjectName(payload.project.name || "");
        setProjectType(payload.project.project_type || "Квартира");
        setProjectDescription(payload.project.description || "");
        if (!payload.state) { setProjectSaved(false); return; }
        const state = payload.state as { interiorImage?: string; generatedImage?: string; interiorName?: string; canvasRatio?: number; generated?: boolean; activeHistoryId?: string | null; historyVersions?: HistoryItem[]; prompt?: string; imageInstruction?: string; preserved?: string[]; creativity?: string; planItems?: PlanItem[]; proposalItems?: PlanItem[]; studioMaterials?:StudioMaterial[]; referenceImage?:string;referenceName?:string;referenceDetails?:FurnitureReferenceDetails;materialReference?:MaterialReference; planRoom?: { width?: number; length?: number }; planFloorReference?: PlanSurfaceReference | null; planWallReference?: PlanSurfaceReference | null; planCamera?: PlanCamera | null; planInstruction?: string };
        const savedProposalItems = Array.isArray(state.proposalItems) ? state.proposalItems : [];
        const versions = (Array.isArray(state.historyVersions) ? state.historyVersions : []).map((version) => ({ ...version, proposalItems: Array.isArray(version.proposalItems) ? version.proposalItems : version.id === state.activeHistoryId ? savedProposalItems : [] }));
        const current = versions.find((version) => version.id === state.activeHistoryId) || versions.at(-1) || null;
        setInteriorImage(state.interiorImage || current?.image || ""); setGeneratedImage(state.generatedImage || current?.image || state.interiorImage || ""); setInteriorName(state.interiorName || current?.name || "Сохранённая визуализация"); setCanvasRatio(typeof state.canvasRatio === "number" ? state.canvasRatio : 16 / 9); setGenerated(Boolean(state.generated ?? current)); setHistoryVersions(versions); setActiveHistoryId(state.activeHistoryId || current?.id || null); setUpscaleVersion(current); if (state.prompt) setPrompt(state.prompt); setImageInstruction(state.imageInstruction || ""); setImageInstructionDraft(state.imageInstruction || ""); if (state.preserved?.length) setPreserved(state.preserved); if (state.creativity) setCreativity(state.creativity); setPlanItems(Array.isArray(state.planItems) ? state.planItems : []); setProposalItems(current?.proposalItems || savedProposalItems); setStudioMaterials(Array.isArray(state.studioMaterials)?state.studioMaterials:[]);setReferenceImage(state.referenceImage||"");setReferenceName(state.referenceName||"");setReferenceDetails(state.referenceDetails||{name:"",description:"",widthMm:"",depthMm:"",heightMm:""});setReferenceSelected(false);setMaterialReference(state.materialReference||{image:"",name:"",description:""}); setPlanRoom(state.planRoom?.width && state.planRoom?.length ? { width: state.planRoom.width, length: state.planRoom.length } : { width: 6000, length: 4500 }); setPlanFloorReference(state.planFloorReference || null); setPlanWallReference(state.planWallReference || null); setPlanCamera(state.planCamera || null); setPlanInstruction(state.planInstruction || ""); setPlanInstructionDraft(state.planInstruction || ""); setProjectSaved(true);
      })
      .catch((error) => { if (active) setGenerationError(error instanceof Error ? error.message : "Не удалось открыть проект."); })
      .finally(() => {
        const remaining = Math.max(0, 1200 - (Date.now() - loadingStartedAt));
        window.setTimeout(() => { if (active) setIsLoadingProject(false); }, remaining);
      });
    return () => { active = false; };
  }, [view, projectId]);
  const layerPath = (context:CanvasRenderingContext2D,item:DetectedObject,width:number,height:number,left=0,top=0) => { const points=item.polygon?.filter((point)=>point.length>=2) || []; context.beginPath(); if(points.length>=3){points.forEach((point,index)=>{const x=width*point[0]/100-left,y=height*point[1]/100-top;if(index===0)context.moveTo(x,y);else context.lineTo(x,y);});context.closePath();return;} context.rect(width*item.x/100-left,height*item.y/100-top,width*item.width/100,height*item.height/100); };
  const extractOriginalLayer = (source:string,item:DetectedObject) => new Promise<string>((resolve,reject)=>{const image=new Image();image.onload=()=>{const pad=Math.max(12,Math.round(Math.min(image.naturalWidth,image.naturalHeight)*.012));const left=Math.max(0,Math.floor(image.naturalWidth*item.x/100)-pad),top=Math.max(0,Math.floor(image.naturalHeight*item.y/100)-pad),right=Math.min(image.naturalWidth,Math.ceil(image.naturalWidth*(item.x+item.width)/100)+pad),bottom=Math.min(image.naturalHeight,Math.ceil(image.naturalHeight*(item.y+item.height)/100)+pad);const canvas=document.createElement("canvas");canvas.width=right-left;canvas.height=bottom-top;const context=canvas.getContext("2d");if(!context)return reject(new Error("Не удалось выделить исходные пиксели предмета."));context.save();layerPath(context,item,image.naturalWidth,image.naturalHeight,left,top);context.clip();context.drawImage(image,-left,-top);context.restore();resolve(canvas.toDataURL("image/png"));};image.onerror=()=>reject(new Error("Не удалось выделить исходные пиксели предмета."));image.src=source;});
  const objectsMask = (source:string,_objects:DetectedObject[]) => manualBackgroundMask(source,layerPoints);
  // The manual selection is the source of truth for the background edit.  A
  // segmentation polygon is useful for a preview of the extracted object, but
  // it is deliberately never used to decide which scene pixels GPT may alter.
  // This keeps every pixel outside the user's rectangle byte-for-byte intact.
  const manualBackgroundMask = (source:string,points:Array<{x:number;y:number;width:number;height:number}>) => new Promise<string>((resolve,reject)=>{const image=new Image();image.onload=()=>{const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext("2d");if(!context)return reject(new Error("Не удалось подготовить область фона."));context.fillStyle="#000";context.fillRect(0,0,canvas.width,canvas.height);context.globalCompositeOperation="destination-out";const pad=Math.max(5,Math.round(Math.min(canvas.width,canvas.height)*.006));points.forEach((point)=>{const left=Math.max(0,Math.floor(canvas.width*point.x/100)-pad),top=Math.max(0,Math.floor(canvas.height*point.y/100)-pad),right=Math.min(canvas.width,Math.ceil(canvas.width*(point.x+point.width)/100)+pad),bottom=Math.min(canvas.height,Math.ceil(canvas.height*(point.y+point.height)/100)+pad);context.clearRect(left,top,right-left,bottom-top);});resolve(canvas.toDataURL("image/png"));};image.onerror=()=>reject(new Error("Не удалось подготовить область фона."));image.src=source;});
  const manualPolygonMask = (source:string,polygon:number[][]) => new Promise<string>((resolve,reject)=>{const image=new Image();image.onload=()=>{const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext("2d");if(!context)return reject(new Error("Не удалось подготовить область фона."));context.fillStyle="#000";context.fillRect(0,0,canvas.width,canvas.height);context.globalCompositeOperation="destination-out";context.beginPath();polygon.forEach(([x,y],index)=>{const px=canvas.width*x/100,py=canvas.height*y/100;if(index===0)context.moveTo(px,py);else context.lineTo(px,py);});context.closePath();context.fill();resolve(canvas.toDataURL("image/png"));};image.onerror=()=>reject(new Error("Не удалось подготовить область фона."));image.src=source;});
  // Keep all image edits on stable API-supported canvases.  The generated image
  // determines the displayed aspect ratio afterwards, so this must never block
  // a replacement just because an uploaded photo has an uncommon proportion.
  const outputSizeForRatio = (ratio:number) => ratio > 1.15 ? "1536x1024" : ratio < .87 ? "1024x1536" : "1024x1024";
  const imageRenderPrompt = (base:string) => [base.trim(), imageInstruction ? `Дополнительное изменение пользователя: ${imageInstruction}` : ""].filter(Boolean).join("\n\n");
  const previewObject = (item:DetectedObject) => { setSelectedObject(item); setGenerationError(""); };
  const prepareLocalEdit = (source:string,mask:string) => new Promise<{roomImage:string;mask:string;outputSize:string;compose:(generatedCrop:string)=>Promise<string>}>((resolve,reject)=>{const room=new Image();const area=new Image();let ready=0;const start=()=>{if(++ready!==2)return; const width=room.naturalWidth,height=room.naturalHeight; const full=document.createElement("canvas");full.width=width;full.height=height;const fullContext=full.getContext("2d");const maskCanvas=document.createElement("canvas");maskCanvas.width=width;maskCanvas.height=height;const maskContext=maskCanvas.getContext("2d");if(!fullContext||!maskContext)return reject(new Error("Не удалось подготовить локальную область редактирования."));fullContext.drawImage(room,0,0);maskContext.drawImage(area,0,0,width,height);const maskPixels=maskContext.getImageData(0,0,width,height).data;let minX=width,minY=height,maxX=-1,maxY=-1;for(let y=0;y<height;y+=1)for(let x=0;x<width;x+=1){if(maskPixels[(y*width+x)*4+3]<128){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}if(maxX<0)return reject(new Error("Контур предмета пуст."));const padding=Math.max(32,Math.round(Math.max(maxX-minX,maxY-minY)*.18));const left=Math.max(0,minX-padding),top=Math.max(0,minY-padding),right=Math.min(width,maxX+padding),bottom=Math.min(height,maxY+padding),cropWidth=right-left,cropHeight=bottom-top;const crop=document.createElement("canvas");crop.width=cropWidth;crop.height=cropHeight;crop.getContext("2d")?.drawImage(room,left,top,cropWidth,cropHeight,0,0,cropWidth,cropHeight);const cropMask=document.createElement("canvas");cropMask.width=cropWidth;cropMask.height=cropHeight;cropMask.getContext("2d")?.drawImage(area,left,top,cropWidth,cropHeight,0,0,cropWidth,cropHeight);resolve({roomImage:crop.toDataURL("image/png"),mask:cropMask.toDataURL("image/png"),outputSize:outputSizeForRatio(cropWidth/cropHeight),compose:(generatedCrop)=>new Promise<string>((finish,fail)=>{const generated=new Image();generated.onload=()=>{const generatedCanvas=document.createElement("canvas");generatedCanvas.width=cropWidth;generatedCanvas.height=cropHeight;const generatedContext=generatedCanvas.getContext("2d");const result=document.createElement("canvas");result.width=width;result.height=height;const resultContext=result.getContext("2d");if(!generatedContext||!resultContext)return fail(new Error("Не удалось собрать результат редактирования."));generatedContext.drawImage(generated,0,0,cropWidth,cropHeight);resultContext.drawImage(room,0,0);const original=resultContext.getImageData(left,top,cropWidth,cropHeight);const changed=generatedContext.getImageData(0,0,cropWidth,cropHeight);const localMask=cropMask.getContext("2d")!.getImageData(0,0,cropWidth,cropHeight);for(let index=0;index<original.data.length;index+=4){const edit=1-localMask.data[index+3]/255;if(edit<=0)continue;for(let channel=0;channel<4;channel+=1)original.data[index+channel]=Math.round(original.data[index+channel]*(1-edit)+changed.data[index+channel]*edit);}resultContext.putImageData(original,left,top);finish(result.toDataURL("image/png"));};generated.onerror=()=>fail(new Error("Не удалось подготовить локальную визуализацию."));generated.src=generatedCrop;})});};room.onload=start;area.onload=start;room.onerror=area.onerror=()=>reject(new Error("Не удалось подготовить локальную область редактирования."));room.src=source;area.src=mask;});
  const createPointMarkerImage = (source:string,point:{x:number;y:number}) => new Promise<string>((resolve,reject)=>{const image=new Image();image.onload=()=>{const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext("2d");if(!context)return reject(new Error("Не удалось подготовить выбранную точку."));context.drawImage(image,0,0);const x=canvas.width*point.x/100,y=canvas.height*point.y/100,radius=Math.max(14,Math.round(Math.min(canvas.width,canvas.height)*.025));context.save();context.lineCap="round";context.lineWidth=Math.max(4,radius*.22);context.strokeStyle="#fff";context.beginPath();context.arc(x,y,radius,0,Math.PI*2);context.moveTo(x-radius*1.7,y);context.lineTo(x+radius*1.7,y);context.moveTo(x,y-radius*1.7);context.lineTo(x,y+radius*1.7);context.stroke();context.lineWidth=Math.max(2,radius*.11);context.strokeStyle="#d7193f";context.beginPath();context.arc(x,y,radius,0,Math.PI*2);context.moveTo(x-radius*1.7,y);context.lineTo(x+radius*1.7,y);context.moveTo(x,y-radius*1.7);context.lineTo(x,y+radius*1.7);context.stroke();context.fillStyle="#d7193f";context.beginPath();context.arc(x,y,Math.max(3,radius*.18),0,Math.PI*2);context.fill();context.restore();resolve(canvas.toDataURL("image/png"));};image.onerror=()=>reject(new Error("Не удалось подготовить выбранную точку."));image.src=source;});
  const enterMaterialMode = () => { const source=generatedImage||interiorImage;const point=placementPoint?{...placementPoint}:null;if(!source||!point){setGenerationError("Сначала выберите точку на поверхности.");return;}setStudioDrawer(null);setMaterialSelection({point,roomImage:source});setMaterialMenuOpen(false);setGenerationError(""); };
  const loadMaterialReference = (file?:File) => { if(!file)return;if(!materialSelection){setGenerationError("Выберите поверхность повторно перед загрузкой материала.");return;} const reader=new FileReader(); reader.onload=()=>{setMaterialMenuOpen(false);setMaterialReference({image:String(reader.result||""),name:file.name.replace(/\.[^.]+$/,""),description:"Референс цвета и фактуры"});setGenerationError("");}; reader.onerror=()=>setGenerationError("Не удалось загрузить референс материала."); reader.readAsDataURL(file); };
  const upscaleHistoryVersion = async () => { if(!upscaleVersion||isGenerating||isUpscaling)return; setIsUpscaling(true);setIsGenerating(true);setGenerationError("");try{const roomImage=upscaleVersion.image.startsWith("data:")?upscaleVersion.image:await blobAsDataUrl(upscaleVersion.image);const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:"Сделать технический апскейл без изменения изображения.",roomImage,upscale:true,outputSize:outputSizeForRatio(canvasRatio)})});if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||"Не удалось выполнить апскейл.");}const imageBlob=await response.blob();if(!imageBlob.size)throw new Error("Модель не вернула изображение.");const imageUrl=URL.createObjectURL(imageBlob);const newInterior=await blobToDataUrl(imageBlob);const next:HistoryItem={id:`${Date.now()}-${Math.random()}`,name:`Апскейл: ${upscaleVersion.name}`,image:imageUrl,generated:true,proposalItems};setRatioFromImage(imageUrl);setGeneratedImage(imageUrl);setGenerated(true);setInteriorImage(newInterior);setInteriorName(next.name);setHistoryVersions((items)=>[...items,next].slice(-8));setActiveHistoryId(next.id);setUpscaleVersion(next);}catch(error){setGenerationError(error instanceof Error?error.message:"Не удалось выполнить апскейл.");}finally{setIsUpscaling(false);setIsGenerating(false);}};
  const generate = async (furnitureReference?: string,customReference?:FurnitureReferenceDetails) => { setIsGenerating(true); setGenerationError(""); try { if((furnitureReference || productMode) && !interiorImage && !generatedImage)throw new Error("Сначала загрузите интерьер в разделе «Добавить мебель»."); if((furnitureReference || productMode) && !placementPoint)throw new Error("Поставьте точку на изображении, куда хотите установить предмет.");
    const customReferenceDimensions={widthMm:Math.round(Number(customReference?.widthMm)),depthMm:Math.round(Number(customReference?.depthMm)),heightMm:Math.round(Number(customReference?.heightMm))};
    if(furnitureReference&&!linkedCatalogProduct&&Object.values(customReferenceDimensions).some((value)=>!Number.isFinite(value)||value<=0))throw new Error("Укажите ширину, глубину и высоту пользовательского референса.");
    const roomImage = (furnitureReference || productMode) ? generatedImage ? await blobAsDataUrl(generatedImage) : interiorImage || "sample-interior" : undefined;
    const editableRoomImage = typeof roomImage === "string" && roomImage !== "sample-interior" ? roomImage : null;
    const point=placementPoint?{...placementPoint}:replacementTarget?{x:replacementTarget.x+replacementTarget.width/2,y:replacementTarget.y+replacementTarget.height/2}:null;
    const pointEdit=point&&editableRoomImage?{...point,markedImage:await createPointMarkerImage(editableRoomImage,point)}:undefined;
    const replacement=furnitureReference&&furnitureAction==="replace"&&pointEdit?{name:replacementTarget?.name||"предмет под маркером"}:undefined;
    const placement=(furnitureReference||productMode)&&pointEdit&&!replacement?{x:pointEdit.x,y:pointEdit.y}:undefined;
    const furnitureReferenceDetails=furnitureReference&&!linkedCatalogProduct?{name:customReference?.name||referenceName||"Пользовательский референс",description:customReference?.description||"",widthMm:customReferenceDimensions.widthMm,depthMm:customReferenceDimensions.depthMm,heightMm:customReferenceDimensions.heightMm}:undefined;
    const response = await fetch("/api/generate", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ operation:replacement?"replace":placement?"place":undefined, prompt:imageRenderPrompt(prompt), additionalInstruction:imageInstruction||undefined, preserved, creativity, product:selected, roomImage, referenceImage:furnitureReference, furnitureReference:furnitureReferenceDetails, pointEdit, replacement, placement, outputSize:outputSizeForRatio(canvasRatio) }) });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || "Не удалось создать визуализацию"); }
    const imageBlob = await response.blob(); if (!imageBlob.size) throw new Error("Модель не вернула изображение"); const imageUrl = URL.createObjectURL(imageBlob); const linkedEdit = linkedCatalogProduct && furnitureReference && point ? {id:`handoff-${Date.now()}`,action:replacement?"replace" as const:"add" as const,point,referenceName:linkedCatalogProduct.name,referenceImage:linkedCatalogProduct.image,product:linkedCatalogProduct}:null; const nextProposalItems=linkedEdit?applyProposalEdits(proposalItems,[linkedEdit]).slice(-100):proposalItems; setRatioFromImage(imageUrl); setGeneratedImage(imageUrl); setGenerated(true); if(linkedEdit)setProposalItems(nextProposalItems); addHistoryVersion(imageUrl, furnitureReference ? replacement ? `Заменён: ${replacementTarget?.name || "предмет"}` : "Добавлен предмет" : productMode ? "Добавлен предмет" : "Новая визуализация",true,nextProposalItems); if (furnitureReference || productMode) { const newInterior = await blobToDataUrl(imageBlob); setInteriorImage(newInterior); setInteriorName("Новая визуализация"); setDetectedObjects([]); setSelectedObject(null); setHoveredObject(null); setReplacementTarget(null); setPlacementPoint(null); setActiveTool("Добавить мебель"); setFurnitureMode("choice"); if(linkedEdit){setLinkedCatalogProduct(null);sessionStorage.removeItem(NORR_PRODUCT_STORAGE_KEY);const currentUrl=new URL(window.location.href);currentUrl.searchParams.delete(NORR_PRODUCT_QUERY_PARAMETER);window.history.replaceState(window.history.state,"",`${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);} }
  } catch (error) { setGenerationError(error instanceof Error ? error.message : "Не удалось создать визуализацию"); } finally { setIsGenerating(false); } };
  const queueCatalogProduct = (product:CatalogProduct) => {
    if (!placementPoint) { setGenerationError("Сначала поставьте точку на изображении."); return false; }
    const selectedAction=unifiedStudioPreview?orbitAction:furnitureAction;
    if (selectedAction!=="add"&&selectedAction!=="replace") { setGenerationError("Выберите режим «Добавить» или «Заменить»."); return false; }
    setFurnitureEdits([{id:`edit-${Date.now()}-${Math.random()}`,action:selectedAction === "replace" ? "replace" : "add",point:{...placementPoint},referenceName:product.name,referenceImage:product.image,product}]);
    setReferenceSelected(false);
    setLinkedCatalogProduct(product); setGenerationError("");
    return true;
  };
  const openStudioCatalog=(trigger?:HTMLElement|null)=>{
    catalogReturnFocusRef.current=trigger||document.activeElement as HTMLElement;
    const url=new URL(window.location.href);url.searchParams.set("catalog","furniture");
    window.history.pushState({...window.history.state,roomCatalog:true},"",`${url.pathname}${url.search}${url.hash}`);
    setStudioCatalogOpen(true);
  };
  const closeStudioCatalog=()=>{
    const url=new URL(window.location.href);
    if(window.history.state?.roomCatalog){window.history.back();}
    else{url.searchParams.delete("catalog");window.history.replaceState(window.history.state,"",`${url.pathname}${url.search}${url.hash}`);setStudioCatalogOpen(false);}
    window.setTimeout(()=>catalogReturnFocusRef.current?.focus(),0);
  };
  const chooseStudioCatalogProduct=(product:CatalogProduct)=>{
    const existing=studioMaterials.find((item)=>item.product.id===product.id);
    if(existing){
      setStudioMaterials((items)=>items.filter((item)=>item.product.id!==product.id));
      if(linkedCatalogProduct?.id===product.id){setLinkedCatalogProduct(null);setFurnitureEdits([]);}
      setProjectSaved(false);setGenerationError("");
      return;
    }
    setStudioMaterials((items)=>[...items,{id:`material-${Date.now()}-${Math.random()}`,kind:"catalog",product,addedAt:Date.now()}]);
    setProjectSaved(false);setGenerationError("");
  };
  useEffect(()=>{
    if(!linkedCatalogProduct||!placementPoint||(orbitAction!=="add"&&orbitAction!=="replace"))return;
    setFurnitureEdits((items)=>{
      const current=items[0];
      if(current?.product.id===linkedCatalogProduct.id&&current.action===orbitAction&&current.point.x===placementPoint.x&&current.point.y===placementPoint.y)return items;
      return [{id:`edit-${Date.now()}-${Math.random()}`,action:orbitAction,point:{...placementPoint},referenceName:linkedCatalogProduct.name,referenceImage:linkedCatalogProduct.image,product:linkedCatalogProduct}];
    });
    setReferenceSelected(false);setGenerationError("");
  },[linkedCatalogProduct,placementPoint,orbitAction]);
  const generateFurnitureEdits = async () => {
    if (!furnitureEdits.length || isGenerating) return;
    const source = generatedImage || interiorImage;
    if (!source) { setGenerationError("Сначала загрузите интерьер."); return; }
    setIsGenerating(true); setGenerationError("");
    try {
      const edit=furnitureEdits[0];
      const roomImageSource = source.startsWith("data:") ? source : await blobAsDataUrl(source);
      const pointEdit={...edit.point,markedImage:await createPointMarkerImage(roomImageSource,edit.point)};
      const replacement=edit.action === "replace" ? {name:"предмет под маркером"} : undefined;
      const placement=edit.action === "add" ? {x:edit.point.x,y:edit.point.y} : undefined;
      const response = await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operation:replacement?"replace":"place",prompt:imageRenderPrompt(prompt),additionalInstruction:imageInstruction||undefined,preserved,creativity,roomImage:roomImageSource,referenceImage:edit.referenceImage,pointEdit,replacement,placement,outputSize:outputSizeForRatio(canvasRatio)})});
      if (!response.ok) { const payload=await response.json().catch(()=>({})); throw new Error(payload.error||"Не удалось создать визуализацию"); }
      const blob=await response.blob(); if(!blob.size)throw new Error("Модель не вернула изображение");
      const roomImage=await blobToDataUrl(blob);
      const finalBlob=await (await fetch(roomImage)).blob();
      const imageUrl=URL.createObjectURL(finalBlob);
      setRatioFromImage(imageUrl); setGeneratedImage(imageUrl); setGenerated(true); setInteriorImage(roomImage); setInteriorName("Новая визуализация");
      const nextProposalItems = applyProposalEdits(proposalItems, [edit]).slice(-100);
      setProposalItems(nextProposalItems);
      addHistoryVersion(imageUrl,edit.action==="replace"?`Заменён: ${edit.referenceName}`:`Добавлен: ${edit.referenceName}`,true,nextProposalItems);
      setPlacementPoint(null); setOrbitAction(null); setFurnitureEdits([]); setLinkedCatalogProduct(null); setDetectedObjects([]); setSelectedObject(null); setHoveredObject(null); setReplacementTarget(null); setFurnitureMode("choice");
    } catch(error) { setGenerationError(error instanceof Error?error.message:"Не удалось создать визуализацию"); }
    finally { setIsGenerating(false); }
  };
  const removeAtPlacement = async (point:{x:number;y:number},confirmRender=false) => { if(unifiedStudioPreview&&!confirmRender){setFurnitureAction("remove");setFurnitureMode("choice");setGenerationError("");return;}if(isGenerating)return; const source=generatedImage || interiorImage; if(!source){setGenerationError("Сначала загрузите интерьер.");return;} setIsGenerating(true);setGenerationError("");try{const roomImage=source.startsWith("data:")?source:await blobAsDataUrl(source);const pointEdit={...point,markedImage:await createPointMarkerImage(roomImage,point)};const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operation:"remove",prompt:imageRenderPrompt("Удалить целиком семантический объект под маркером и естественно восстановить скрытый фон."),additionalInstruction:imageInstruction||undefined,roomImage,pointEdit,removal:{name:"предмет под маркером"},outputSize:outputSizeForRatio(canvasRatio)})});if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||"Не удалось удалить предмет.");}const imageBlob=await response.blob();if(!imageBlob.size)throw new Error("Модель не вернула изображение.");const newInterior=await blobToDataUrl(imageBlob);const nextProposalItems=removeNearestProposalItem(proposalItems,point);setRatioFromImage(newInterior);setGeneratedImage(newInterior);setGenerated(true);setInteriorImage(newInterior);setInteriorName("Новая визуализация");setProposalItems(nextProposalItems);addHistoryVersion(newInterior,"Удалён предмет",true,nextProposalItems);setPlacementPoint(null);setOrbitAction(null);setDetectedObjects([]);setSelectedObject(null);setHoveredObject(null);setDetectionError("");setActiveTool("Добавить мебель");setFurnitureAction("add");setFurnitureMode("choice");}catch(error){setGenerationError(error instanceof Error?error.message:"Не удалось удалить предмет.");}finally{setIsGenerating(false);}};
  const editCurrentImage = async () => { const source=generatedImage || interiorImage; if(!source || !placementPrompt.trim()){setGenerationError("Опишите, что изменить на изображении.");return;} setIsGenerating(true);setGenerationError("");try{const roomImage=source.startsWith("data:")?source:await blobAsDataUrl(source);const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:placementPrompt,roomImage,globalEdit:{instruction:placementPrompt},outputSize:outputSizeForRatio(canvasRatio)})});if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||"Не удалось изменить изображение.");}const imageBlob=await response.blob();if(!imageBlob.size)throw new Error("Модель не вернула изображение.");const imageUrl=URL.createObjectURL(imageBlob);const newInterior=await blobToDataUrl(imageBlob);setRatioFromImage(imageUrl);setGeneratedImage(imageUrl);setGenerated(true);setInteriorImage(newInterior);setInteriorName("Изменённая визуализация");addHistoryVersion(imageUrl,"Изменение изображения");setPlacementPrompt("");setActiveTool("Добавить мебель");setFurnitureMode("choice");}catch(error){setGenerationError(error instanceof Error?error.message:"Не удалось изменить изображение.");}finally{setIsGenerating(false);}};
  const applyMaterial = async (materialReferenceImage:string,materialReferenceName:string) => { const selection=materialSelection;if(!selection||!materialReferenceImage){setGenerationError("Выберите поверхность и загрузите референс материала.");return;} setIsGenerating(true);setGenerationError("");try{const roomImage=selection.roomImage.startsWith("data:")?selection.roomImage:await blobAsDataUrl(selection.roomImage);const pointEdit={...selection.point,markedImage:await createPointMarkerImage(roomImage,selection.point)};const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operation:"material",prompt:imageRenderPrompt(`Использовать ${materialReferenceName||"загруженный референс"} только как источник материала, цвета и фактуры`),additionalInstruction:imageInstruction||undefined,roomImage,referenceImage:materialReferenceImage,pointEdit,material:{instruction:"Перенести только цвет, материал, текстуру и фактуру референса на полный объект или поверхность под маркером. Сохранить идентичность, форму, геометрию, размеры, положение, перспективу и конструкцию выбранного объекта. Не добавлять и не копировать объект, изображённый на референсе."},outputSize:outputSizeForRatio(canvasRatio)})});if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||"Не удалось применить материал.");}const imageBlob=await response.blob();if(!imageBlob.size)throw new Error("Модель не вернула изображение.");const newInterior=await blobToDataUrl(imageBlob);setRatioFromImage(newInterior);setGeneratedImage(newInterior);setGenerated(true);setInteriorImage(newInterior);setInteriorName("Изменённый материал");addHistoryVersion(newInterior,"Изменён материал");setPlacementPoint(null);setMaterialSelection(null);setMaterialReference({image:"",name:"",description:""});setOrbitAction(null);setMaterialMenuOpen(false);setDetectedObjects([]);setSelectedObject(null);setHoveredObject(null);setExactMasks({});setExactPolygons({});setActiveTool("Добавить мебель");setFurnitureAction("add");setFurnitureMode("choice");}catch(error){setGenerationError(error instanceof Error?error.message:"Не удалось применить материал.");}finally{setIsGenerating(false);}};
  const detectObjects = async (imageToDetect?: string):Promise<DetectedObject[]|null> => { const source = typeof imageToDetect === "string" ? imageToDetect : interiorImage; if (!source) { setDetectionError("Сначала загрузите изображение интерьера."); return null; } setIsDetecting(true); setDetectionError(""); try { const start = await fetch("/api/objects", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({image:source}) }); const job = await start.json(); if (!start.ok || !job.id) throw new Error(job.error || "Не удалось запустить распознавание"); for (let attempt=0; attempt<120; attempt+=1) { await new Promise(resolve=>setTimeout(resolve,2500)); const check = await fetch(`/api/objects?id=${encodeURIComponent(job.id)}`); const payload = await check.json(); if (!check.ok || payload.error) throw new Error(payload.error || "Не удалось проверить статус распознавания"); if (payload.status === "completed") { if (!payload.objects?.length) throw new Error("Не удалось определить крупные предметы на изображении. Попробуйте другое фото."); setDetectedObjects(payload.objects); setSelectedObject(null); return payload.objects; } if (["failed","cancelled","incomplete"].includes(payload.status)) throw new Error("Распознавание не завершилось. Попробуйте ещё раз."); } throw new Error("Распознавание всё ещё выполняется. Попробуйте ещё раз через минуту."); } catch (error) { setDetectionError(error instanceof Error ? error.message : "Не удалось распознать предметы"); return null; } finally { setIsDetecting(false); } };
  const layerCursorPosition = (event:MouseEvent<HTMLElement>) => { const target=event.currentTarget.closest(".room-canvas") as HTMLElement|null; const box=(target||event.currentTarget).getBoundingClientRect(); return {x:Math.max(0,Math.min(100,(event.clientX-box.left)*100/box.width)),y:Math.max(0,Math.min(100,(event.clientY-box.top)*100/box.height))}; };
  const startLayerArea = (event:MouseEvent<HTMLButtonElement>) => { setLayerDrag(layerCursorPosition(event)); };
  const finishLayerArea = (event:MouseEvent<HTMLButtonElement>) => { if(!layerDrag)return; const end=layerCursorPosition(event); const rawWidth=Math.abs(end.x-layerDrag.x),rawHeight=Math.abs(end.y-layerDrag.y); const width=Math.max(8,rawWidth||16),height=Math.max(8,rawHeight||16),x=Math.max(0,Math.min(layerDrag.x,end.x)-(rawWidth?0:width/2)),y=Math.max(0,Math.min(layerDrag.y,end.y)-(rawHeight?0:height/2)); setLayerPoints((points)=>[...points,{id:`point-${Date.now()}-${Math.random()}`,x,y,width:Math.min(width,100-x),height:Math.min(height,100-y),name:`Предмет ${String(points.length+1).padStart(2,"0")}`}]); setLayerDrag(null);setDetectionError(""); };
  const beginLayerEdit = (event:MouseEvent<HTMLElement>,id:string,mode:"move"|"n"|"s"|"e"|"w"|"ne"|"nw"|"se"|"sw") => { event.preventDefault();event.stopPropagation(); const item=layerPoints.find((point)=>point.id===id); if(!item)return; const position=layerCursorPosition(event); setLayerEdit({id,mode,x:position.x,y:position.y,source:{x:item.x,y:item.y,width:item.width,height:item.height}}); };
  const updateLayerEdit = (event:MouseEvent<HTMLButtonElement>) => { if(!layerEdit)return; const position=layerCursorPosition(event),dx=position.x-layerEdit.x,dy=position.y-layerEdit.y,source=layerEdit.source,mode=layerEdit.mode; let x=source.x,y=source.y,width=source.width,height=source.height; if(mode==="move"){x=Math.max(0,Math.min(100-width,source.x+dx));y=Math.max(0,Math.min(100-height,source.y+dy));}else{if(mode.includes("w")){x=Math.max(0,Math.min(source.x+source.width-4,source.x+dx));width=source.x+source.width-x;}if(mode.includes("e")){width=Math.max(4,Math.min(100-source.x,source.width+dx));}if(mode.includes("n")){y=Math.max(0,Math.min(source.y+source.height-4,source.y+dy));height=source.y+source.height-y;}if(mode.includes("s")){height=Math.max(4,Math.min(100-source.y,source.height+dy));}} setLayerPoints((points)=>points.map((point)=>point.id===layerEdit.id?{...point,x,y,width,height}:point)); };
  const beginLayerBrush = (event:MouseEvent<HTMLElement>) => { event.preventDefault(); setLayerDrawing([[layerCursorPosition(event).x,layerCursorPosition(event).y]]); };
  const continueLayerBrush = (event:MouseEvent<HTMLElement>) => { if(!layerDrawing)return; const position=layerCursorPosition(event); setLayerDrawing((points)=>points?[...points,[position.x,position.y]]:points); };
  const finishLayerBrush = () => { if(!layerDrawing)return; if(layerDrawing.length>=3)setLayerStrokes((strokes)=>[...strokes,{id:`stroke-${Date.now()}-${Math.random()}`,name:`Предмет ${String(strokes.length+1).padStart(2,"0")}`,points:layerDrawing}]); setLayerDrawing(null);setDetectionError(""); };
  const cropLayerArea = (source:string,point:{x:number;y:number;width:number;height:number}) => new Promise<{image:string;left:number;top:number;width:number;height:number}>((resolve,reject)=>{const image=new Image();image.onload=()=>{const padding=Math.max(8,Math.round(Math.min(image.naturalWidth,image.naturalHeight)*.008));const left=Math.max(0,Math.floor(image.naturalWidth*point.x/100)-padding),top=Math.max(0,Math.floor(image.naturalHeight*point.y/100)-padding),right=Math.min(image.naturalWidth,Math.ceil(image.naturalWidth*(point.x+point.width)/100)+padding),bottom=Math.min(image.naturalHeight,Math.ceil(image.naturalHeight*(point.y+point.height)/100)+padding);const canvas=document.createElement("canvas");canvas.width=right-left;canvas.height=bottom-top;const context=canvas.getContext("2d");if(!context)return reject(new Error("Не удалось подготовить выделенную область."));context.drawImage(image,left,top,canvas.width,canvas.height,0,0,canvas.width,canvas.height);resolve({image:canvas.toDataURL("image/png"),left,top,width:canvas.width,height:canvas.height});};image.onerror=()=>reject(new Error("Не удалось подготовить выделенную область."));image.src=source;});
  const createBackgroundPatch = async (source:string,point:{x:number;y:number;width:number;height:number}) => { const mask=await manualBackgroundMask(source,[point]); const local=await prepareLocalEdit(source,mask); const response=await fetch("/api/layers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"background",image:local.roomImage,mask:local.mask,outputSize:local.outputSize})}); if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||"Не удалось создать фоновую пластину.");} return local.compose(await blobToDataUrl(await response.blob())); };
  const layerStrokeObject = (stroke:LayerStroke):DetectedObject => { const xs=stroke.points.map(([x])=>x),ys=stroke.points.map(([,y])=>y); const x=Math.max(0,Math.min(...xs)),y=Math.max(0,Math.min(...ys)); return {id:stroke.id,name:stroke.name,x,y,width:Math.min(100-x,Math.max(...xs)-x),height:Math.min(100-y,Math.max(...ys)-y),polygon:stroke.points}; };
  const createPolygonBackgroundPatch = async (source:string,polygon:number[][]) => { const mask=await manualPolygonMask(source,polygon); const local=await prepareLocalEdit(source,mask); const response=await fetch("/api/layers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"background",image:local.roomImage,mask:local.mask,outputSize:local.outputSize})}); if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||"Не удалось создать фоновую пластину.");} return local.compose(await blobToDataUrl(await response.blob())); };
  const buildLayers = async () => { const source=interiorImage || generatedImage; if(!source){setDetectionError("Сначала загрузите изображение интерьера.");return;} if(!layerStrokes.length){setDetectionError("Обведите кистью хотя бы один предмет, который хотите вынести в слой.");return;} setIsBuildingLayers(true);setDetectionError("");setLayerBackground("");setLayerImages({});setHiddenLayerIds([]);try{const refined=layerStrokes.map(layerStrokeObject);setDetectedObjects(refined);const images:Record<string,string>={};for(const item of refined){images[item.id]=await extractOriginalLayer(source,item);setLayerImages({...images});}let background=source;for(const item of refined){background=await createPolygonBackgroundPatch(background,item.polygon || []);}setLayerBackground(background);}catch(error){setLayerImages({});setLayerBackground("");setDetectionError(error instanceof Error?error.message:"Не удалось разобрать изображение на слои.");}finally{setIsBuildingLayers(false);}};
  const loadInterior = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = async () => { const image = String(reader.result); const version:HistoryItem = { id: `${Date.now()}-${Math.random()}`, name: "Исходное изображение", image, generated: false, proposalItems:[] }; const nextHistory = [...historyVersions, version].slice(-8); setRatioFromImage(image); setInteriorImage(image); setInteriorName(file.name); setGeneratedImage(image); setGenerated(true); setDetectedObjects([]); setLayerBackground(""); setLayerImages({}); setLayerPoints([]); setLayerStrokes([]); setLayerDrawing(null); setPlacementPoint(null); setPlacementPrompt(""); setMaterialMenuOpen(false); setMaterialSelection(null); setSelectedObject(null); setHoveredObject(null); setReplacementMask(""); setDetectionError(""); setProposalItems([]); setHistoryVersions(nextHistory); setActiveHistoryId(version.id); setUpscaleVersion(version); setProjectSaved(false); if (!user || !projectId || !projectName.trim()) return; setIsSavingProject(true); try { await persistProject(projectId,projectName.trim(),{interiorImage:image,generatedImage:image,interiorName:file.name,generated:true,activeHistoryId:version.id,historyVersions:nextHistory,proposalItems:[]}); setProjectSaved(true); } catch(error) { setGenerationError(error instanceof Error?error.message:"Не удалось сохранить загруженный интерьер."); } finally { setIsSavingProject(false); } }; reader.readAsDataURL(file); };
  const replaceSelectedObject = (item = selectedObject) => { if (!item || isGenerating) return; setSelectedObject(item); setGenerationError(""); setReplacementMask(""); setReplacementTarget(item); setActiveTool("Добавить мебель"); setFurnitureMode("choice"); };
  const removeSelectedObject = async (object = selectedObject) => { if (!object || isGenerating) return; const item = object; setSelectedObject(item); const source = generatedImage || interiorImage; if (!source) { setGenerationError("Сначала загрузите изображение интерьера."); return; } setIsGenerating(true); setGenerationError(""); try { const roomImage = source.startsWith("data:") ? source : await blobAsDataUrl(source); const point={x:item.x+item.width/2,y:item.y+item.height/2}; const pointEdit={...point,markedImage:await createPointMarkerImage(roomImage,point)}; const response = await fetch("/api/generate", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ operation:"remove", prompt:`Удалить целиком ${item.name} под маркером и естественно восстановить скрытый фон`, roomImage, pointEdit, removal:{ name:item.name }, outputSize:outputSizeForRatio(canvasRatio) }) }); if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || "Не удалось удалить предмет"); } const imageBlob = await response.blob(); if (!imageBlob.size) throw new Error("Модель не вернула изображение"); const newInterior=await blobToDataUrl(imageBlob); const nextProposalItems=removeNearestProposalItem(proposalItems,point); setRatioFromImage(newInterior); setGeneratedImage(newInterior); setGenerated(true); setProposalItems(nextProposalItems); addHistoryVersion(newInterior, `Удалён: ${item.name}`, true, nextProposalItems); setInteriorImage(newInterior); setInteriorName("Новая визуализация"); setDetectedObjects([]); setSelectedObject(null); setHoveredObject(null); setExactMasks({}); setExactPolygons({}); setDetectionError(""); setActiveTool("Добавить мебель"); setFurnitureAction("add"); setFurnitureMode("choice"); setPlacementPoint(null); } catch (error) { setGenerationError(error instanceof Error ? error.message : "Не удалось удалить предмет"); } finally { setIsGenerating(false); } };
  const openHistoryVersion = async (version:HistoryItem) => { const stayInFurniture=activeTool==="Добавить мебель"; setGeneratedImage(version.image); setGenerated(version.generated); setActiveHistoryId(version.id); setProposalItems(version.proposalItems || []); setUpscaleVersion(version); setRatioFromImage(version.image); setSelectedObject(null); setHoveredObject(null); setDetectedObjects([]); setDetectionError(""); if(!stayInFurniture)setActiveTool("Заменить"); try { const editableImage = version.image.startsWith("data:") ? version.image : await blobAsDataUrl(version.image); setInteriorImage(editableImage); setInteriorName(version.name); if(stayInFurniture){setFurnitureMode("choice");setPlacementPoint(null);}else void detectObjects(editableImage); } catch { setGenerationError("Не удалось открыть версию для редактирования."); } };
  const downloadCurrentImage = async () => { const source = generatedImage || interiorImage; if (!source) { setGenerationError("Сначала создайте или загрузите визуализацию."); return; } try { await downloadImageAsJpeg(source, projectName || "norr-визуализация"); } catch { setGenerationError("Не удалось скачать изображение. Попробуйте ещё раз."); } };
  const downloadHistoryVersion = async (version:HistoryItem) => { try { await downloadImageAsJpeg(version.image, version.name); } catch { setGenerationError("Не удалось скачать изображение. Попробуйте ещё раз."); } };
  const createPlanReference = async (planImage:string, planPrompt:string, surfaceReferences:string[]) => {
    if(!planItems.length){setGenerationError("Добавьте хотя бы один элемент на планограмму.");return;}
    setIsPlanRendering(true);
    setGenerationError("");
    try {
      const referenceSources = [...surfaceReferences,...planItems.flatMap((item)=>item.referenceImage?[item.referenceImage]:[])];
      const referenceImages = await normalizePlanReferenceImages(referenceSources, blobAsDataUrl);
      const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:planPrompt,planRender:{planImage,room:planRoom,items:planItems.map((item)=>{const center=planogramItemCenterPercent(item,planRoom);return {name:item.name,width:item.width,depth:item.depth,x:center.x,y:center.y,rotation:item.rotation,rugShape:item.rugShape,referenceImage:item.referenceImage,referenceName:item.referenceName};}),referenceImages,instruction:planInstruction,outputSize:"1536x1024"}})});
      if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||"Не удалось создать визуализацию по плану.");}
      const imageBlob=await response.blob();
      if(!imageBlob.size)throw new Error("Модель не вернула визуализацию.");
      const imageUrl=URL.createObjectURL(imageBlob);
      const nextInterior=await blobToDataUrl(imageBlob);
      const renderedPlanItems = planItems.map((item) => ({ ...item }));
      setGeneratedImage(imageUrl);setInteriorImage(nextInterior);setInteriorName("Интерьер по планограмме");setGenerated(true);setRatioFromImage(imageUrl);setProposalItems(renderedPlanItems);addHistoryVersion(imageUrl,"Интерьер по планограмме",true,renderedPlanItems);setActiveTool("Добавить мебель");setFurnitureMode("choice");
    } catch(error) {
      setGenerationError(error instanceof Error?error.message:"Не удалось создать визуализацию по плану.");
    } finally {
      setIsPlanRendering(false);
    }
  };
  const productMode = activeTool === "Добавить мебель";
  const studioMode: "image" | "plan" = activeTool === "Планограмма" ? "plan" : "image";
  const selectedHistoryVersion = historyVersions.find((version) => version.id === activeHistoryId) || historyVersions.at(-1) || null;
  const selectStudioMode = (mode: "image" | "plan") => {
    setStudioDrawer(null);
    if (mode === "plan") {
      if (activeTool !== "Планограмма") setImageStudioTool(activeTool);
      setActiveTool("Планограмма");
    } else {
      setActiveTool(imageStudioTool === "Планограмма" ? "Добавить мебель" : imageStudioTool);
    }
    if (!unifiedStudioPreview) return;
    const url = new URL(window.location.href);
    url.searchParams.set("studioPreview", "unified");
    url.searchParams.set("studioMode", mode);
    window.history.pushState({ ...window.history.state, studioMode: mode }, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const toggleStudioFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await studioWorkspaceRef.current?.requestFullscreen();
  };
  const navigate = (nextView: AppView, nextProjectId = projectId) => {
    const paths: Record<AppView, string> = { home: "", account: "#кабинет", newProject: "#новый-проект", projectMenu: "#меню-проекта", studio: "#студия" };
    const url = new URL(window.location.href);
    url.pathname = "/";
    if ((nextView === "studio" || nextView === "projectMenu") && nextProjectId) url.searchParams.set("project", nextProjectId);
    else url.searchParams.delete("project");
    url.hash = paths[nextView];
    window.history.pushState({ norrView: nextView, projectId: nextView === "studio" || nextView === "projectMenu" ? nextProjectId : "" }, "", `${url.pathname}${url.search}${url.hash}`);
    if (nextView === "studio" || nextView === "projectMenu") setProjectId(nextProjectId);
    setView(nextView);
  };
  const openAuth = (mode: "register" | "login" = "register") => { setAuthMode(mode); setAuthOpen(true); };
  const continueToProject = () => user ? navigate("account") : openAuth("register");
  useEffect(() => {
    const viewFromUrl = (): AppView => { const rawHash=window.location.hash.slice(1);const hash=`#${new URLSearchParams(`value=${rawHash}`).get("value")||rawHash}`; return hash==="#кабинет"?"account":hash==="#новый-проект"?"newProject":hash==="#меню-проекта"?"projectMenu":hash==="#студия"?"studio":"home"; };
    const projectFromUrl = () => new URLSearchParams(window.location.search).get("project")?.trim() || "";
    const initialView = viewFromUrl();
    const initialProjectId = initialView === "studio" || initialView === "projectMenu" ? projectFromUrl() : "";
    if (initialProjectId) setProjectId(initialProjectId);
    window.history.replaceState({ ...window.history.state, norrView:initialView, projectId:initialProjectId }, "", window.location.href);
    const frame=requestAnimationFrame(()=>setView(initialView));
    const onPopState = (event: PopStateEvent) => {
      const nextView = event.state?.norrView ?? viewFromUrl();
      const nextProjectId = nextView === "studio" || nextView === "projectMenu" ? String(event.state?.projectId || projectFromUrl()) : "";
      setProjectId(nextProjectId);
      setView(nextView);
    };
    window.addEventListener("popstate", onPopState);
    return () => {cancelAnimationFrame(frame);window.removeEventListener("popstate", onPopState);};
  }, []);
  useEffect(() => {
    const syncPreviewMode = () => {
      const params = new URLSearchParams(window.location.search);
      const enabled = params.get("studioPreview") !== "legacy";
      setUnifiedStudioPreview(enabled);
      if (enabled) setActiveTool(params.get("studioMode") === "plan" ? "Планограмма" : "Добавить мебель");
    };
    syncPreviewMode();
    window.addEventListener("popstate", syncPreviewMode);
    return () => window.removeEventListener("popstate", syncPreviewMode);
  }, []);
  useEffect(() => {
    if (!unifiedStudioPreview) return;
    const closeTemporaryLayer = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setStudioDrawer(null);
      setPlacementPoint(null);
      setSelectedObject(null);
    };
    window.addEventListener("keydown", closeTemporaryLayer);
    return () => window.removeEventListener("keydown", closeTemporaryLayer);
  }, [unifiedStudioPreview]);
  useEffect(() => {
    if (activeTool !== "Планограмма") setImageStudioTool(activeTool);
  }, [activeTool]);
  useEffect(() => {
    let active = true;
    void fetch("/api/auth/me")
      .then((response) => response.ok ? response.json() : { user: null })
      .then((payload) => { if (active) setUser(payload.user || null); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setAuthChecked(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!authChecked || user || norrEntryAuth) return;
    const productId = norrProductIdFromSearch(window.location.search) || norrProductIdFromStorage(sessionStorage.getItem(NORR_PRODUCT_STORAGE_KEY));
    if (!productId) return;
    setNorrEntryAuth(true);
    setAuthMode("register");
    setAuthOpen(true);
  }, [authChecked, user, norrEntryAuth]);
  useEffect(() => {
    const fromUrl=norrProductIdFromSearch(window.location.search);
    const fromStorage=norrProductIdFromStorage(sessionStorage.getItem(NORR_PRODUCT_STORAGE_KEY));
    const productId=fromUrl||fromStorage;
    if(!productId){if(sessionStorage.getItem(NORR_PRODUCT_STORAGE_KEY))sessionStorage.removeItem(NORR_PRODUCT_STORAGE_KEY);return;}
    const stored=serializeNorrProductHandoff(productId);
    if(stored)sessionStorage.setItem(NORR_PRODUCT_STORAGE_KEY,stored);
    const controller=new AbortController();
    fetch(`/api/catalog?ids=${encodeURIComponent(productId)}`,{signal:controller.signal}).then(async(response)=>{const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||"Не удалось загрузить товар NORR Møbler.");const product=Array.isArray(payload.products)?payload.products[0] as CatalogProduct|undefined:undefined;if(!product)throw new Error("Товар NORR Møbler не найден в актуальном каталоге.");setLinkedCatalogProduct(product);setReferenceName(product.name);setReferenceImage(product.image);setFurnitureAction("add");setFurnitureMode("choice");setActiveTool("Добавить мебель");setGenerationError("");setProjectId("");setView("studio");const url=new URL(window.location.href);url.searchParams.set(NORR_PRODUCT_QUERY_PARAMETER,product.id);url.hash="#студия";window.history.replaceState({...window.history.state,norrView:"studio",projectId:""},"",`${url.pathname}${url.search}${url.hash}`);}).catch(error=>{if(error?.name!=="AbortError")setGenerationError(error instanceof Error?error.message:"Не удалось загрузить товар NORR Møbler.");});
    return()=>controller.abort();
  },[]);
  useEffect(() => { const handlePlanSave = () => { void saveProject(); }; window.addEventListener("room-save-project", handlePlanSave); return () => window.removeEventListener("room-save-project", handlePlanSave); });
  const selectedPlanItemForIt = planItems.find((item) => item.id === planSelectedId) || null;
  const itContext: RoomDesignContext = {
    route: view === "studio" ? "#студия" : view === "projectMenu" ? "#меню-проекта" : `#${view}`,
    page: view === "home" ? "landing" : view === "account" ? "projects" : view === "newProject" ? "project-setup" : view === "projectMenu" ? "other" : "studio",
    projectId: projectId || null,
    projectName: projectName || "Новый проект",
    section: activeTool === "Планограмма" ? "planogram" : "image-editor",
    activeTool,
    furnitureAction,
    selectedObject: selectedObject ? { id: selectedObject.id, name: selectedObject.name } : null,
    render: { hasSource: Boolean(interiorImage), hasResult: Boolean(generatedImage), isGenerating },
    planogram: {
      itemCount: planItems.length,
      selectedItemId: planSelectedId,
      selectedItem: selectedPlanItemForIt ? {
        id: selectedPlanItemForIt.id,
        name: selectedPlanItemForIt.name,
        kind: selectedPlanItemForIt.kind,
        widthMm: selectedPlanItemForIt.width,
        depthMm: selectedPlanItemForIt.depth,
        rotation: selectedPlanItemForIt.rotation,
        hasReference: Boolean(selectedPlanItemForIt.referenceImage),
        referenceName: selectedPlanItemForIt.referenceName || null,
      } : null,
      room: { widthMm: planRoom.width, lengthMm: planRoom.length },
      hasFloorReference: Boolean(planFloorReference),
      hasWallReference: Boolean(planWallReference),
      hasCamera: Boolean(planCamera),
    },
    workspace: {
      isAuthenticated: Boolean(user),
      projectSaved,
      historyCount: historyVersions.length,
      queuedEditCount: furnitureEdits.length,
      hasFurnitureReference: Boolean(referenceImage),
    },
    template: null,
    availableActions: ["get_current_context", "search_catalog"],
  };
  const handleItAction = (action: ItUiAction) => {
    if (action.type === "navigate") {
      setActiveTool(action.target === "planogram" ? "Планограмма" : "Добавить мебель");
      if (action.target === "image-editor") setFurnitureMode("choice");
      return;
    }
    const findTarget = (target: ItUiTarget) => {
      const selectors: Partial<Record<ItUiTarget, string>> = {
        "image-editor": "[data-it-target='image-editor']",
        "image-upload": ".furniture-choice .upload-zone",
        "editor-add": ".furniture-action-bar button:first-child",
        replace: ".furniture-action-bar button:nth-child(2),.furniture-switch button:nth-child(2)",
        "editor-remove": ".furniture-action-bar .danger",
        "editor-catalog": ".furniture-choice .catalog-option",
        "save-project": ".project-save-head",
        history: ".history-strip",
        upscale: ".upscale-panel .generate",
        planogram: "[data-it-target='planogram']",
        "planogram-sofa": ".plan-template-grid button:first-child",
        "planogram-armchair": ".plan-template-grid button:nth-child(5)",
        "planogram-selected-item": ".planogram-furniture.selected, .planogram-furniture",
        "planogram-properties": ".plan-properties",
        "planogram-floor-reference": ".plan-final-actions .plan-surface-reference:first-child",
        "planogram-wall-reference": ".plan-final-actions .plan-surface-reference:nth-child(2)",
        "planogram-save": ".plan-save",
        "planogram-create-render": ".plan-create-reference",
        "templates-catalog": "[data-ono-target='templates-catalog']",
        "template-light-scenarios": "[data-ono-target='template-light-scenarios']",
      };
      const selector = selectors[target];
      return selector ? document.querySelector<HTMLElement>(selector) : null;
    };
    const revealTarget = (targetName: ItUiTarget) => window.setTimeout(() => {
      const target = findTarget(targetName);
      if (!target) return;
      if (action.type === "focus") target.focus({ preventScroll: true });
      if (action.type === "highlight" || action.type === "guide") {
        target.classList.add("it-guided-target");
        window.setTimeout(() => target.classList.remove("it-guided-target"), 4200);
      }
      if (action.type === "guide") {
        const rect = target.getBoundingClientRect();
        window.dispatchEvent(new CustomEvent("it:guide", { detail: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } }));
      }
    }, 100);

    if (action.target === "replace") {
      setActiveTool("Добавить мебель");
      setFurnitureAction("replace");
      setFurnitureMode("choice");
      revealTarget(action.target);
      return;
    }
    revealTarget(action.target);
  };
  const itContextSignature = JSON.stringify(itContext);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("roomdesign:it-context", { detail: JSON.parse(itContextSignature) as RoomDesignContext }));
  }, [itContextSignature]);
  useEffect(() => {
    const handleSitewideItAction = (event: Event) => {
      const action = (event as CustomEvent<ItUiAction>).detail;
      if (action) handleItAction(action);
    };
    window.addEventListener("roomdesign:it-action", handleSitewideItAction);
    return () => window.removeEventListener("roomdesign:it-action", handleSitewideItAction);
  });
  if (view === "home") return <>
    <TemplatesHome accountControl={user ? <AccountDropdown user={user}/> : <><button type="button" onClick={() => openAuth("login")}>Войти</button><button type="button" onClick={() => openAuth("register")}>Зарегистрироваться</button></>} onStartProject={continueToProject}/>
    {authOpen && <AuthModal mode={authMode} onMode={setAuthMode} onClose={()=>setAuthOpen(false)} onSignedIn={(nextUser)=>{setUser(nextUser);setAuthOpen(false);navigate("account");}}/>}
  </>;
  if (view === "account") return <>
    <AccountDashboardWithProfile user={user} onUserUpdated={setUser} onHome={()=>navigate("home")} onCreate={()=>{resetProjectWorkspace(true);navigate("newProject","");}} onOpenProject={(project)=>{resetProjectWorkspace(false);setProjectName(project.name);navigate(unifiedStudioPreview?"projectMenu":"studio",project.id)}} onOpenGeneration={async(generation)=>{try{const image=await blobAsDataUrl(`/api/account/generations/${generation.id}`);resetProjectWorkspace(true);setInteriorImage(image);setGeneratedImage(image);setInteriorName("Сохранённая генерация");setGenerated(true);setRatioFromImage(image);setHistoryVersions([{id:generation.id,name:"Сохранённая генерация",image,generated:true}]);setActiveHistoryId(generation.id);navigate("studio","");}catch{setGenerationError("Не удалось открыть сохранённую генерацию.");}}} onLogin={()=>openAuth("login")}/>
    {authOpen && <AuthModal mode={authMode} onMode={setAuthMode} onClose={()=>setAuthOpen(false)} onSignedIn={(nextUser)=>{setUser(nextUser);setAuthOpen(false);}}/>}
  </>;
  if (view === "newProject") return <main className={`project-page project-page-concept${unifiedStudioPreview?" is-brief-preview":""}`}>
    <header className="project-nav">
      <div className="project-brand">
        <button className="project-wordmark room-design-wordmark" type="button" onClick={() => navigate("home")} aria-label="ROOM DESIGN — на главную">ROOM DESIGN</button>
        <i aria-hidden="true"/>
        <button className="project-back" type="button" onClick={() => user ? navigate("account") : navigate("home")}>← {user ? "Кабинет" : "На главную"}</button>
      </div>
      {user ? <AccountDropdown user={user} dashboard={unifiedStudioPreview}/> : <button className="project-login" type="button" onClick={()=>openAuth("login")}>Войти</button>}
    </header>
    <section className="project-form-wrap">
      <section className="project-intro" aria-label="Новый проект">
        <img src={unifiedStudioPreview?"/project-brief-blueprint.png":"/concept-d-create-project-hero.avif"} alt=""/>
        {unifiedStudioPreview&&projectBrief.client.trim()&&<div className="project-brief-signature" aria-hidden="true">
          <span>{projectBrief.client.trim()}</span>
        </div>}
        {!unifiedStudioPreview&&<><div className="project-intro-shade" aria-hidden="true"/>
        <div className="project-intro-copy">
          <p className="project-kicker"><span>01</span><i aria-hidden="true"/>НОВЫЙ ПРОЕКТ</p>
          <h1>Создайте<br/>пространство<br/>для своей идеи.</h1>
          <p className="project-lead">Начните с названия — затем добавьте<br className="project-desktop-break"/> комнаты и изображения.</p>
        </div>
        <p className="project-slogan"><i aria-hidden="true"/>ВДОХНОВЕНИЕ ПРЕВРАЩАЕТ ПРОСТРАНСТВО В ДОМ</p></>}
      </section>
      <section className="project-panel">
        <form className="project-form" noValidate onSubmit={async (e) => {
          e.preventDefault();
          if (!user || isCreatingProject) { if (!user) openAuth("register"); return; }
          const briefDescription = [
            ["Заказчик и контактное лицо",projectBrief.client], ["Объект и адрес",projectBrief.object], ["Цель проекта",projectBrief.goal],
            ["Стиль и настроение",projectBrief.style], ["Ключевые требования",projectBrief.requirements], ["Бюджет и вилка",projectBrief.budget],
            ["Сроки и этапы",projectBrief.timeline], ["Особые условия",projectBrief.conditions],
          ].filter(([,value])=>value.trim()).map(([label,value])=>`${label}: ${value.trim()}`).join("\n");
          const briefName = projectBrief.object.trim().split(/\n|,|\./)[0]?.trim().slice(0,96) || projectBrief.client.trim().split(/\n|,|\./)[0]?.trim().slice(0,96);
          const name = unifiedStudioPreview ? briefName : projectName.trim();
          if (!name) { setProjectError(unifiedStudioPreview?"Укажите объект и адрес.":"Введите название проекта."); return; }
          const nextProjectType = unifiedStudioPreview ? (/офис/i.test(projectBrief.object)?"Офис":/дом|коттедж/i.test(projectBrief.object)?"Дом":/отел|ресторан|кафе|гостин/i.test(projectBrief.object)?"Гостеприимство":"Квартира") : projectType;
          const nextDescription = unifiedStudioPreview ? briefDescription : projectDescription;
          setProjectError(""); setIsCreatingProject(true);
          try {
            const response = await fetch("/api/projects", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name,projectType:nextProjectType,description:nextDescription}) });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.project?.id) throw new Error(payload.error || "Не удалось создать проект.");
            const newProjectId = String(payload.project.id);
            resetProjectWorkspace(false);
            skipNextProjectLoadRef.current = newProjectId;
            setProjectName(name); setProjectType(nextProjectType); setProjectDescription(nextDescription); setProjectId(newProjectId); setProjectSaved(false); navigate(unifiedStudioPreview ? "projectMenu" : "studio", newProjectId);
          } catch (error) {
            setProjectError(error instanceof Error ? error.message : "Не удалось создать проект.");
          } finally { setIsCreatingProject(false); }
        }}>
          {unifiedStudioPreview?<>
            <header className="project-brief-heading"><span>НОВЫЙ ПРОЕКТ</span><h1>Короткий бриф</h1><p>Заполните главное — детали можно уточнить позже.</p></header>
            <div className="project-brief-grid">
              {([
                ["client","ЗАКАЗЧИК И КОНТАКТНОЕ ЛИЦО","Имя, компания, кто принимает решения"],
                ["object","ОБЪЕКТ И АДРЕС","Квартира, дом или офис · площадь · этаж · адрес"],
                ["goal","ЦЕЛЬ ПРОЕКТА","Например: ремонт под ключ или обновить кухню"],
                ["style","СТИЛЬ И НАСТРОЕНИЕ","1–2 направления и ссылки на 2–3 референса"],
                ["requirements","КЛЮЧЕВЫЕ ТРЕБОВАНИЯ","Функции, хранение, состав помещений, обязательные решения"],
                ["budget","БЮДЖЕТ И ВИЛКА","Общий бюджет или ориентир за м²"],
                ["timeline","СРОКИ И ЭТАПЫ","Дата старта, контрольные точки и завершение"],
                ["conditions","ОСОБЫЕ УСЛОВИЯ","Животные, эргономика, шум, ограничения перепланировки"],
              ] as const).map(([key,label,placeholder])=><div key={key} className={`project-field project-brief-field${key==="requirements"||key==="conditions"?" is-wide":""}${projectError&&key==="object"?" has-error":""}`}>
                <label htmlFor={`project-brief-${key}`}>{label}</label>
                <textarea id={`project-brief-${key}`} value={projectBrief[key]} onChange={(event)=>{setProjectBrief((value)=>({...value,[key]:event.target.value}));if(projectError&&key==="object")setProjectError("");}} placeholder={placeholder}/>
                {projectError&&key==="object"&&<p id="project-name-error" className="project-error" role="alert">{projectError}</p>}
              </div>)}
            </div>
          </>:<><div className={projectError ? "project-field has-error" : "project-field"}>
            <label htmlFor="project-name">НАЗВАНИЕ ПРОЕКТА</label>
            <input id="project-name" required aria-invalid={Boolean(projectError)} aria-describedby={projectError ? "project-name-error" : undefined} value={projectName} onChange={(e) => { setProjectName(e.target.value); if (projectError) setProjectError(""); }} placeholder="Например, квартира на Патриарших"/>
            {projectError && <p id="project-name-error" className="project-error" role="alert">{projectError}</p>}
          </div>
          <div className="project-field">
            <label htmlFor="project-type">ТИП ПРОЕКТА</label>
            <div className="project-select-wrap"><select id="project-type" value={projectType} onChange={(e)=>setProjectType(e.target.value)}><option>Квартира</option><option>Дом</option><option>Офис</option><option>Гостеприимство</option><option>Другое</option></select><span aria-hidden="true">⌄</span></div>
          </div>
          <div className="project-field">
            <div className="project-label-row"><label htmlFor="project-description">ОПИСАНИЕ</label><small>необязательно</small></div>
            <textarea id="project-description" value={projectDescription} onChange={(e)=>setProjectDescription(e.target.value)} placeholder="Коротко опишите проект"/>
          </div></>}
          <button className="create-project" type="submit" disabled={isCreatingProject}>{isCreatingProject ? "Создаём…" : "Создать проект"} <span aria-hidden="true">→</span></button>
        </form>
        {!unifiedStudioPreview&&<footer className="project-panel-footer"><span>ROOM DESIGN</span><i aria-hidden="true"/><em>БОЛЬШЕ, ЧЕМ ИНТЕРЬЕР</em><b>№ 001</b></footer>}
      </section>
    </section>
    {authOpen && <AuthModal mode={authMode} onMode={setAuthMode} onClose={()=>setAuthOpen(false)} onSignedIn={(nextUser)=>{setUser(nextUser);setAuthOpen(false);navigate("account");}}/>}
  </main>;
  if (view === "projectMenu") return <ProjectMenuPreview
    user={user}
    projectName={projectName || "Новый проект"}
    projectType={projectType}
    projectDescription={projectDescription}
    projectId={projectId}
    coverImage={generatedImage || interiorImage}
    historyCount={historyVersions.length}
    furnitureCount={planItems.length || proposalItems.length}
    isLoading={isLoadingProject}
    projectSaved={projectSaved}
    onHome={()=>navigate("home")}
    onProjects={()=>user?navigate("account"):navigate("home")}
    onOpenStudio={()=>navigate("studio",projectId)}
    onOpenTechnical={()=>{window.location.assign(`/technical-lighting${projectId?`?project=${encodeURIComponent(projectId)}&studioPreview=unified`:"?studioPreview=unified"}`)}}
  />;
  return <main ref={studioWorkspaceRef} className={`studio-shell${unifiedStudioPreview ? ` unified-studio-preview drawer-${studioDrawer || "closed"}` : ""}`} data-studio-mode={studioMode}>
    {unifiedStudioPreview?<EditorHeader user={user} projectName={projectName} onHome={()=>navigate("home")} onProjectMenu={()=>projectId?navigate("projectMenu",projectId):navigate("account")} onLogin={()=>openAuth("login")}/>:(<header className="topbar"><button className="wordmark room-design-wordmark" type="button" onClick={() => navigate("home")} aria-label="ROOM DESIGN — на главную">ROOM DESIGN</button><div className="crumb"><button onClick={() => unifiedStudioPreview&&projectId?navigate("projectMenu",projectId):user?navigate("account"):navigate("home")}>← {unifiedStudioPreview&&projectId?"Меню проекта":"Проекты"}</button><i>›</i><b>{projectName || "Новый проект"}</b><i>›</i><span>Гостиная</span></div><div className="top-actions">{!unifiedStudioPreview&&<button className="help" aria-label="Помощь" title="Помощь">?</button>}{user?<AccountDropdown user={user} studio={!unifiedStudioPreview}/>:<button className="avatar" title="Аккаунт" onClick={()=>openAuth("login")}>?</button>}</div></header>)}
    {unifiedStudioPreview&&<section className="studio-project-bar" aria-label="Управление студией">
      <div className="studio-project-identity">
        <div><span>ПРОЕКТ</span><strong title={projectName || "Новый проект"}>{projectName || "Новый проект"}</strong><small>Гостиная</small></div>
        <div className="studio-save-status" role="status" aria-live="polite"><i className={generationError?"is-error":projectSaved?"is-saved":"is-draft"}/><span>{isLoadingProject?"Загрузка проекта…":isSavingProject?"Сохранение…":generationError?"Требуется внимание":projectSaved?"Сохранено":"Есть несохранённые изменения"}</span></div>
      </div>
      <div className="studio-mode-tabs" role="tablist" aria-label="Режим студии интерьера">
        <button type="button" role="tab" aria-selected={studioMode==="image"} onClick={()=>selectStudioMode("image")}>Редактор изображений</button>
        <button type="button" role="tab" aria-selected={studioMode==="plan"} onClick={()=>selectStudioMode("plan")}>Создание интерьера</button>
      </div>
      <div className="studio-mobile-panels" aria-label="Панели студии">
        {studioMode==="plan"&&<button type="button" onClick={()=>setStudioDrawer(studioDrawer==="context"?null:"context")}>Параметры</button>}
        {studioMode==="image"&&<button type="button" aria-expanded={studioDrawer==="history"} onClick={()=>setStudioDrawer(studioDrawer==="history"?null:"history")}>История</button>}
      </div>
      <div className="studio-project-actions">
        {studioMode==="image"&&<button className="studio-upscale-action" type="button" disabled={!upscaleVersion||isGenerating||isUpscaling} onClick={()=>void upscaleHistoryVersion()} aria-label="Сделать апскейл выбранной версии" title="Сделать апскейл выбранной версии"><span className="studio-upscale-icon" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path d="M13.2 3.2c.7 5.3 2.9 7.5 8.2 8.2-5.3.7-7.5 2.9-8.2 8.2-.7-5.3-2.9-7.5-8.2-8.2 5.3-.7 7.5-2.9 8.2-8.2Z"/><path d="M23.7 2.8c.3 2 1.2 2.9 3.2 3.2-2 .3-2.9 1.2-3.2 3.2-.3-2-1.2-2.9-3.2-3.2 2-.3 2.9-1.2 3.2-3.2Z"/></svg></span><b>{isUpscaling?"Улучшаем…":"Апскейл"}</b></button>}
        {!unifiedStudioPreview&&studioMode==="image"&&<button type="button" onClick={()=>setStudioDrawer(studioDrawer==="context"?null:"context")} aria-expanded={studioDrawer==="context"} aria-label="Инструменты редактирования" title="Каталог, референс и текстовая правка">✎</button>}
        {!unifiedStudioPreview&&<button type="button" onClick={()=>setFavorite(!favorite)} aria-label={favorite?"Убрать из избранного":"Добавить в избранное"} title={favorite?"Убрать из избранного":"Добавить в избранное"}>{favorite?"♥":"♡"}</button>}
        {!unifiedStudioPreview&&<button type="button" disabled={!selectedHistoryVersion} onClick={()=>selectedHistoryVersion&&void downloadHistoryVersion(selectedHistoryVersion)} aria-label="Скачать выбранную версию" title="Скачать выбранную версию">⇩</button>}
        <button type="button" onClick={()=>void openCommercialProposal()} disabled={isSavingProject||isLoadingProject} aria-label="Создать коммерческое предложение" title="Создать коммерческое предложение">▤</button>
        <button type="button" onClick={()=>void toggleStudioFullscreen()} aria-label="Полноэкранный режим рабочей зоны" title="Полноэкранный режим">⛶</button>
        <button type="button" className="studio-save-button" onClick={()=>void saveProject()} disabled={isSavingProject||isLoadingProject}>{isSavingProject?"Сохраняем…":projectSaved?"Сохранено":"Сохранить проект"}</button>
      </div>
    </section>}
    <section className="studio">{unifiedStudioPreview?<aside className="studio-source-rail" aria-label="Исходные материалы проекта">
      <section className="studio-source-section">
        <header><span>ИСХОДНОЕ ИЗОБРАЖЕНИЕ</span><h2>Пространство</h2></header>
        <label className={interiorImage?"studio-source-upload has-image":"studio-source-upload"}>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>loadInterior(event.target.files?.[0])}/>
          <span className="studio-source-media">{interiorImage?<img src={interiorImage} alt="Исходное изображение интерьера"/>:<strong aria-hidden="true">＋</strong>}</span>
          <em>SRC</em>
          <span className="studio-source-copy"><b>{interiorImage?"Заменить исходное изображение":"Добавить исходное изображение"}</b><small>Загрузите фотографию</small><small>JPG, PNG или WEBP</small></span>
        </label>
      </section>
      <section className="studio-source-section studio-text-instruction" aria-label="Текстовое изменение для рендера">
        <header><span>ЧТО ДОБАВИТЬ ИЛИ ИЗМЕНИТЬ?</span></header>
        <textarea value={studioMode==="plan"?planInstructionDraft:imageInstructionDraft} onChange={(event)=>studioMode==="plan"?setPlanInstructionDraft(event.target.value):setImageInstructionDraft(event.target.value)} maxLength={2000} placeholder={studioMode==="plan"?"Например: добавить тёплый вечерний свет и светлые стены":"Например: добавить тёплый вечерний свет"}/>
        <button type="button" className={studioMode==="plan"?(planInstructionDraft.trim()===planInstruction&&Boolean(planInstruction)?"saved":""):(imageInstructionDraft.trim()===imageInstruction&&Boolean(imageInstruction)?"saved":"")} disabled={studioMode==="plan"?planInstructionDraft.trim()===planInstruction:imageInstructionDraft.trim()===imageInstruction} onClick={()=>{if(studioMode==="plan"){const next=planInstructionDraft.trim();setPlanInstruction(next);setPlanInstructionDraft(next);}else{const next=imageInstructionDraft.trim();setImageInstruction(next);setImageInstructionDraft(next);setPlacementPrompt(next);}setProjectSaved(false);}}>Сохранить</button>
        <p>{studioMode==="plan"?(planInstructionDraft.trim()===planInstruction&&planInstruction?"Изменение сохранено и попадёт в следующий рендер.":"Сохраните текст, затем нажмите «Создать рендер»."):(imageInstructionDraft.trim()===imageInstruction&&imageInstruction?"Изменение сохранено и попадёт в следующий рендер.":"Сохраните текст, затем нажмите «Создать рендер».")}</p>
      </section>
      {studioMode==="plan"&&<section className="studio-source-section studio-plan-surfaces" aria-label="Референсы пола и стен">
        <header><span>ОТДЕЛКА ПОМЕЩЕНИЯ</span></header>
        <button className="plan-surface-reference" type="button" onClick={()=>window.dispatchEvent(new Event("room-plan-floor-reference"))}>{planFloorReference?<img src={planFloorReference.image} alt="Референс пола"/>:<i>↥</i>}<span><small>ПОЛ</small><b>{planFloorReference?"Заменить референс пола":"Добавить референс пола"}</b></span></button>
        <button className="plan-surface-reference" type="button" onClick={()=>window.dispatchEvent(new Event("room-plan-wall-reference"))}>{planWallReference?<img src={planWallReference.image} alt="Референс стен"/>:<i>↥</i>}<span><small>СТЕНЫ</small><b>{planWallReference?"Заменить референс стен":"Добавить референс стен"}</b></span></button>
      </section>}
      {referenceSelected&&<section className="studio-source-section studio-reference-settings">
        <header><span>РЕФЕРЕНС · НАСТРОЙКА</span></header>
        {referenceImage&&!linkedCatalogProduct?<article className="studio-source-reference-specs" aria-label="Параметры пользовательского референса">
          <div className="studio-source-reference-head">
            <label className="studio-source-reference-media"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>{const file=event.target.files?.[0];setReferenceName(file?.name||"");if(!file){setReferenceImage("");setReferenceDetails({name:"",description:"",widthMm:"",depthMm:"",heightMm:""});return;}setReferenceDetails({name:file.name.replace(/\.[^.]+$/,"")||"Пользовательский референс",description:"Пользовательский референс мебели",widthMm:"",depthMm:"",heightMm:""});const reader=new FileReader();reader.onload=()=>{setReferenceImage(String(reader.result||""));setLinkedCatalogProduct(null);};reader.readAsDataURL(file);}}/><img src={referenceImage} alt={referenceDetails.name||"Пользовательский референс"}/><em>REF</em></label>
            <div className="studio-source-reference-identity"><input aria-label="Название референса" value={referenceDetails.name} onChange={(event)=>setReferenceDetails({...referenceDetails,name:event.target.value})} placeholder="Название предмета"/><input aria-label="Описание референса" value={referenceDetails.description} onChange={(event)=>setReferenceDetails({...referenceDetails,description:event.target.value})} placeholder="Описание предмета"/></div>
          </div>
          <div className="studio-source-reference-dimensions">{([{key:"widthMm",label:"Ширина, мм"},{key:"depthMm",label:"Глубина, мм"},{key:"heightMm",label:"Высота, мм"}] as const).map((field)=><label key={field.key}><span>{field.label}</span><input aria-label={field.label} type="number" min="1" max="20000" step="1" required value={referenceDetails[field.key]} onChange={(event)=>setReferenceDetails({...referenceDetails,[field.key]:event.target.value})} placeholder="Обязательно"/></label>)}</div>
        </article>:<label className={referenceImage?"studio-source-upload has-image":"studio-source-upload"}>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>{const file=event.target.files?.[0];setReferenceName(file?.name||"");if(!file){setReferenceImage("");setReferenceDetails({name:"",description:"",widthMm:"",depthMm:"",heightMm:""});return;}setReferenceDetails({name:file.name.replace(/\.[^.]+$/,"")||"Пользовательский референс",description:"Пользовательский референс мебели",widthMm:"",depthMm:"",heightMm:""});const reader=new FileReader();reader.onload=()=>{setReferenceImage(String(reader.result||""));setLinkedCatalogProduct(null);};reader.readAsDataURL(file);}}/>
          <span className="studio-source-media">{referenceImage?<img src={referenceImage} alt="Референс проекта"/>:<strong aria-hidden="true">＋</strong>}</span>
          <em>REF</em>
          <span className="studio-source-copy"><b>{referenceImage?"Заменить референс":"Добавить из референса"}</b><small>Загрузите фотографию</small><small>Стиль, мебель или настроение</small></span>
        </label>}
      </section>}
      {orbitAction==="material"&&<section className="studio-source-section studio-reference-settings studio-material-reference-settings">
        <header><span>РЕФЕРЕНС · МАТЕРИАЛ</span></header>
        {materialReference.image?<article className="studio-material-reference-card"><img src={materialReference.image} alt={materialReference.name||"Референс материала"}/><span><b>{materialReference.name||"Референс материала"}</b><small>{materialReference.description}</small></span></article>:<p className="studio-material-reference-empty">Загрузите референс ткани, цвета или фактуры в первой карточке каталога. Размеры для этого режима не требуются.</p>}
      </section>}
      <p className="studio-source-motto"><i aria-hidden="true"/>ВДОХНОВЕНИЕ<br/>ПРЕВРАЩАЕТ ПРОСТРАНСТВО<br/>В ДОМ</p>
    </aside>:<aside className="tools" aria-label="Навигация проекта"><button data-it-target="image-editor" onClick={() => { setActiveTool("Добавить мебель"); setFurnitureAction("add"); setFurnitureMode("choice"); }} className={activeTool === "Добавить мебель" ? "tool active furniture-tool" : "tool furniture-tool"} aria-label="Редактор изображений"><em className="furniture-symbol" aria-hidden="true"><i/><i/><i/></em><span>Редактор изображений</span></button>
      <button data-it-target="planogram" onClick={() => setActiveTool("Планограмма")} className={activeTool === "Планограмма" ? "tool planogram-tool active" : "tool planogram-tool"} aria-label="Создание интерьера"><em aria-hidden="true">⌗</em><span>Создание интерьера</span></button>
      <a className="tool technical-lighting-beta-tool" href={projectId?`/technical-lighting?project=${encodeURIComponent(projectId)}`:"/technical-lighting"} aria-label="Технический свет Beta"><em aria-hidden="true">✦</em><span>Технический свет <small>Beta</small></span></a><div className="tool-spacer"/></aside>}
      <section className="canvas-area">{activeTool === "Планограмма" ? <PlanogramWorkspace items={planItems} room={planRoom} selectedId={planSelectedId} onSelect={setPlanSelectedId} onChange={setPlanItems} onRoomChange={setPlanRoom} floorReference={planFloorReference} wallReference={planWallReference} onFloorReferenceChange={setPlanFloorReference} onWallReferenceChange={setPlanWallReference} camera={planCamera} onCameraChange={setPlanCamera} onCreateReference={createPlanReference} isCreatingReference={isPlanRendering}/> : <><div className="canvas-head"><div><span className="status-dot"/> {isLoadingProject ? "Загружаем проект…" : generated ? "Визуализация готова" : interiorImage ? "Исходное изображение" : "Загрузите фото интерьера"}</div><div className="canvas-actions"><button type="button" className={projectSaved ? "project-save-control project-save-head saved" : "project-save-control project-save-head"} onClick={()=>void saveProject()} disabled={isSavingProject||isLoadingProject}>{isLoadingProject ? "Загружаем…" : isSavingProject ? "Сохраняем…" : projectSaved ? "Сохранено" : "Сохранить проект"}</button><div className="proposal-control"><button type="button" className="proposal-print proposal-editor-open" onClick={()=>void openCommercialProposal()} disabled={isSavingProject||isLoadingProject} aria-label="Создать коммерческое предложение" title="Создать коммерческое предложение"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2 2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 13h10v8H7z"/></svg><span>Создать коммерческое предложение</span></button>{proposalError&&<span className="proposal-inline-error" role="alert">{proposalError}</span>}</div><button className="favorite-icon" onClick={() => setFavorite(!favorite)} aria-label={favorite ? "Убрать из избранного" : "Добавить в избранное"} title={favorite ? "Убрать из избранного" : "Добавить в избранное"}>{favorite ? "♥" : "♡"}</button></div></div>
        <div className={isGenerating ? "room-canvas processing" : "room-canvas"} style={{aspectRatio:canvasRatio,flex:"0 1 auto"}}><img src={generatedImage || interiorImage || "/project-loading-blueprint.png"} alt={generatedImage || interiorImage ? (generated ? "Сгенерированная интерьерная визуализация" : "Загруженный интерьер") : "Эскиз интерьера"}/>{isLoadingProject ? <div className="project-loading-screen" role="status" aria-live="polite"><div className="project-loading-card"><b>ROOM DESIGN</b><i aria-hidden="true"/><strong>Готовим ваш проект</strong><span>Собираем пространство, материалы и историю работы</span><div className="project-loading-progress" aria-label="Проект загружается"><em/><em/><em/></div></div></div> : !interiorImage && !generatedImage ? <div className="project-empty-screen"><div className="project-empty-card"><strong>Начните с вашего пространства</strong><p>Загрузите фотографию интерьера, чтобы добавить мебель и создать первую визуализацию.</p><label className="project-empty-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>loadInterior(event.target.files?.[0])}/><span aria-hidden="true">↥</span><b>Загрузить фото интерьера</b><small>JPG, PNG или WEBP</small></label></div></div> : null}{(generatedImage||interiorImage)&&!isLoadingProject&&<EditorImageActions image={generatedImage||interiorImage} name={interiorName} onError={setGenerationError}/>}<div className="canvas-shade"/>{activeTool === "Слои" && interiorImage && <div role="application" aria-label="Обвести предмет кистью" onMouseDown={beginLayerBrush} onMouseMove={continueLayerBrush} onMouseUp={finishLayerBrush} onMouseLeave={finishLayerBrush} style={{position:"absolute",inset:0,zIndex:2,cursor:"crosshair",touchAction:"none"}}><svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:"100%",height:"100%",overflow:"visible",pointerEvents:"none"}}>{layerStrokes.map((stroke)=><path key={stroke.id} d={`M ${stroke.points.map((point)=>`${point[0]} ${point[1]}`).join(" L ")} Z`} fill="rgba(213,232,90,.16)" stroke="#d5e85a" strokeWidth=".45" vectorEffect="non-scaling-stroke"/>)}{layerDrawing&&layerDrawing.length>1&&<path d={`M ${layerDrawing.map((point)=>`${point[0]} ${point[1]}`).join(" L ")}`} fill="none" stroke="#d5e85a" strokeWidth=".45" vectorEffect="non-scaling-stroke" strokeLinecap="round"/>}</svg><span style={{position:"absolute",left:12,top:12,padding:"6px 8px",background:"#242520",borderRadius:4,color:"#fff",fontSize:11,fontWeight:700,pointerEvents:"none"}}>Зажмите и обведите предмет</span></div>}{activeTool === "Добавить мебель" && interiorImage && <><div className="furniture-switch"><button className={furnitureAction === "add" ? "active" : ""} onClick={()=>{setFurnitureAction("add");setPlacementPoint(null);setReplacementTarget(null);setFurnitureMode("choice")}}>Добавить</button><button className={furnitureAction === "replace" ? "active" : ""} onClick={()=>{setFurnitureAction("replace");setPlacementPoint(null);setReplacementTarget(null);setFurnitureMode("choice")}}>Заменить</button></div><button type="button" aria-label={furnitureAction === "replace" ? "Поставить точку в центре предмета для замены" : "Поставить точку размещения предмета"} onClick={(event)=>{const next=layerCursorPosition(event);if(placementPoint&&Math.hypot(next.x-placementPoint.x,next.y-placementPoint.y)<4)setPlacementPoint(null);else setPlacementPoint(next)}} style={{position:"absolute",inset:0,zIndex:3,border:0,padding:0,background:"transparent",cursor:"crosshair"}}>{placementPoint&&<span style={{position:"absolute",left:`${placementPoint.x}%`,top:`${placementPoint.y}%`,width:28,height:28,transform:"translate(-50%,-50%)",borderRadius:"50%",border:"2px solid #d5e85a",background:"#1f201c",color:"#fff",display:"grid",placeItems:"center",fontSize:22,fontWeight:400,boxShadow:"0 2px 10px #0008",pointerEvents:"none"}}>+</span>}</button>{placementPoint&&<section className="studio-point-menu" role="dialog" aria-label="Действия в выбранной точке" style={{left:`${Math.min(placementPoint.x,68)}%`,top:`${Math.max(placementPoint.y,24)}%`}} onClick={(event)=>event.stopPropagation()}><header><span>ВЫБРАННАЯ ТОЧКА</span><button type="button" aria-label="Закрыть меню точки" onClick={()=>{setPlacementPoint(null);setStudioDrawer(null)}}>×</button></header>{(linkedCatalogProduct?.image||referenceImage)&&<div className="studio-point-reference"><img src={linkedCatalogProduct?.image||referenceImage} alt=""/><span><b>{linkedCatalogProduct?.name||referenceName||"Референс"}</b><small>{linkedCatalogProduct?.article||"Готов к размещению"}</small></span></div>}<div className="studio-point-actions"><button type="button" className={furnitureAction==="add"?"active":""} onClick={()=>{setFurnitureAction("add");setFurnitureMode("choice");setStudioDrawer("context");window.setTimeout(()=>window.dispatchEvent(new Event("room-open-furniture-catalog")),0)}}>Добавить</button><button type="button" className={furnitureAction==="replace"?"active":""} onClick={()=>{setFurnitureAction("replace");setFurnitureMode("choice");setStudioDrawer("context");window.setTimeout(()=>window.dispatchEvent(new Event("room-open-furniture-catalog")),0)}}>Заменить</button><button type="button" className="danger" onClick={()=>void removeAtPlacement(placementPoint)}>Удалить</button></div><button type="button" className="studio-point-tools" onClick={()=>setStudioDrawer("context")}>Каталог, референс и текстовая правка →</button></section>}</>}{activeTool === "Заменить" && Object.entries(exactPolygons).map(([id,polygons])=>{const item=detectedObjects.find((object)=>object.id===id);if(!item)return null;const active=selectedObject?.id===id||hoveredObject===id;const path=polygons.map((polygon)=>polygon.length?`M ${polygon.map((point,index)=>`${index?"L":""}${point[0]} ${point[1]}`).join(" ")} Z`:"").join(" ");return <button key={id} className="object-contour" style={{position:"absolute",inset:0,zIndex:4,width:"100%",height:"100%",padding:0,border:0,background:"transparent",cursor:"pointer"}} onMouseEnter={()=>setHoveredObject(id)} onMouseLeave={()=>setHoveredObject(null)} onFocus={()=>setHoveredObject(id)} onBlur={()=>setHoveredObject(null)} onClick={()=>previewObject(item)} aria-label={`Выбрать: ${item.name}`}><svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:"100%",height:"100%",overflow:"visible",pointerEvents:"none"}}><path d={path} fill={active?"rgba(213,232,90,.26)":"rgba(213,232,90,.11)"} stroke="#d5e85a" strokeWidth={active?0.46:0.28} vectorEffect="non-scaling-stroke"/></svg>{active&&<span style={{position:"absolute",left:`${item.x}%`,top:`${Math.max(2,item.y-4)}%`,padding:"5px 8px",background:"#242520",borderRadius:4,color:"#fff",fontSize:11,fontWeight:700,pointerEvents:"none"}}>{item.name}</span>}</button>})}{activeTool === "Добавить мебель" && interiorImage && placementPoint&&<div className="material-tool" onClick={(event)=>event.stopPropagation()}><button type="button" className="material-brush-trigger" aria-label="Изменить материал выбранной поверхности" aria-expanded={materialMenuOpen} onClick={()=>{if(materialMenuOpen){setMaterialMenuOpen(false);return;}enterMaterialMode();}}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.7 3.3 6 6-8.4 8.4-6-6 8.4-8.4Z"/><path d="M5.2 12.8c-2.4.9-3.2 2.5-2.9 5 .3 2.4-1.1 3.2-1.1 3.2s4.7.7 6.8-1.5c1.2-1.2 1-3.2.1-4.6"/></svg><span className="sr-only">Материал / отделка</span></button>{materialMenuOpen&&materialSelection&&<div className="material-menu" role="dialog" aria-label="Изменить материал"><input ref={materialInputRef} className="material-reference-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>loadMaterialReference(event.target.files?.[0])}/><button type="button" onClick={()=>materialInputRef.current?.click()}>Загрузить референс</button><button type="button" className="material-catalog-action" onClick={()=>{setGenerationError("Каталог материалов готовится.");setMaterialMenuOpen(false)}}>Добавить из каталога</button></div>}</div>}<div className="canvas-note"><span>{activeTool === "Слои" ? "РУЧНОЕ ВЫДЕЛЕНИЕ СЛОЁВ" : activeTool === "Добавить мебель" ? furnitureAction === "replace" ? "ЗАМЕНА ПРЕДМЕТА" : "ДОБАВЛЕНИЕ ПРЕДМЕТА" : generated ? "ИИ-ВИЗУАЛИЗАЦИЯ" : "ИСХОДНОЕ ИЗОБРАЖЕНИЕ"}</span><strong>{activeTool === "Слои" ? "Зажмите и обведите предмет кистью" : activeTool === "Добавить мебель" ? furnitureAction === "replace" ? "Поставьте точку в центре предмета, который хотите заменить." : "Поставьте точку на изображении, куда хотите установить предмет." : generated ? `Ваша идея / ${creativity.toLowerCase()} креативность` : "Гостиная"}</strong></div>{isGenerating && <div className="generating"><div className="orb"/><strong>Создаём ваш дизайн…</strong><span>Norr AI готовит визуализацию</span></div>}</div>
        {activeTool === "Добавить мебель" && interiorImage && <><div className="furniture-action-bar" role="group" aria-label="Действие с мебелью"><button className={furnitureAction === "add" ? "active" : ""} onClick={()=>{setFurnitureAction("add");setPlacementPoint(null);setReplacementTarget(null);setFurnitureMode("choice")}}>Добавить</button><button className={furnitureAction === "replace" ? "active" : ""} onClick={()=>{setFurnitureAction("replace");setPlacementPoint(null);setReplacementTarget(null);setFurnitureMode("choice")}}>Заменить</button><button className={furnitureAction === "remove" ? "active danger" : "danger"} onClick={()=>{setFurnitureAction("remove");setReplacementTarget(null);setFurnitureMode("choice");if(placementPoint)void removeAtPlacement(placementPoint)}}>Удалить</button></div>{furnitureAction === "remove" && <button type="button" className="furniture-delete-overlay" aria-label="Поставить точку на предмете для удаления" onClick={(event)=>{const next=layerCursorPosition(event);if(placementPoint&&Math.hypot(next.x-placementPoint.x,next.y-placementPoint.y)<4){setPlacementPoint(null);return;}setPlacementPoint(next);void removeAtPlacement(next)}} style={{aspectRatio:canvasRatio}}/>}</>}
        <div className="history-strip"><div className="history-title"><b>История рендеров</b><span>{historyVersions.length} {historyVersions.length === 1 ? "версия" : "версии"}</span></div><div className="history-cards">{historyVersions.length ? historyVersions.map((version) => <div key={version.id} className="history-card-wrap"><button className={activeHistoryId === version.id ? "history-card current" : "history-card"} onClick={() => void openHistoryVersion(version)}><img src={version.image} alt=""/><span>{version.name}</span></button></div>) : <span className="history-empty">Создайте первую версию, чтобы увидеть её здесь.</span>}</div></div>
        {upscaleVersion&&!unifiedStudioPreview&&<section className="upscale-panel" aria-label="Апскейл выбранной версии"><div className="upscale-preview"><img src={upscaleVersion.image} alt={`Предпросмотр: ${upscaleVersion.name}`}/><span>Предпросмотр перед апскейлом</span></div><div className="upscale-copy"><label>КАЧЕСТВО ИЗОБРАЖЕНИЯ</label><h2>Сделать апскейл</h2><p>Улучшим детализацию и чёткость выбранной версии. Композиция, предметы и кадр останутся прежними.</p><button className="generate" type="button" onClick={()=>void upscaleHistoryVersion()} disabled={isGenerating}>{isGenerating?"Улучшаем качество…":"✦ Сделать апскейл"}</button>{generationError&&<p className="generation-error" role="alert">{generationError}</p>}</div></section>}
        {activeTool === "Слои" && <LayerGallery background={layerBackground} source={interiorImage || generatedImage || ""} objects={detectedObjects} layers={layerImages} hidden={hiddenLayerIds} selected={selectedObject} onSelect={previewObject} onReplace={replaceSelectedObject} onRemove={(item)=>setHiddenLayerIds((items)=>items.includes(item.id)?items.filter((id)=>id!==item.id):[...items,item.id])} isBuilding={isBuildingLayers}/>}</>}</section>
      <aside className="inspector"><div className="inspector-title"><div><span>СТУДИЯ КОМНАТЫ</span><h1>{productMode ? "Редактор изображений" : activeTool === "Планограмма" ? "Создание интерьера" : activeTool}</h1></div><button>•••</button></div>{activeTool === "Планограмма" ? <>{generationError&&<p className="panel-error" role="alert">{generationError}</p>}<PlanogramPanel items={planItems} room={planRoom} selectedId={planSelectedId} onSelect={setPlanSelectedId} onChange={setPlanItems}/></> : activeTool === "Слои" ? <LayersPanel isBuilding={isBuildingLayers} error={detectionError} onBuild={buildLayers} onUpload={loadInterior} imageName={interiorName} points={layerStrokes.map((stroke)=>({id:stroke.id,x:0,y:0,width:0,height:0,name:stroke.name}))} onRemovePoint={(id)=>setLayerStrokes((strokes)=>strokes.filter((stroke)=>stroke.id!==id))}/> : activeTool === "Заменить" ? <ObjectPanel objects={detectedObjects} selected={selectedObject} isDetecting={isDetecting} isGenerating={isGenerating || isSegmenting} error={detectionError || generationError} onDetect={detectObjects} onSelect={previewObject} onUpload={loadInterior} imageName={interiorName} onReplace={replaceSelectedObject} onRemove={removeSelectedObject}/> : productMode ? <FurnitureChoice persistentCatalog={unifiedStudioPreview} action={furnitureAction} onUpload={loadInterior} imageName={interiorName} interiorImage={interiorImage} referenceName={referenceName} setReferenceName={setReferenceName} referenceImage={referenceImage} setReferenceImage={(value)=>{setReferenceImage(value);setLinkedCatalogProduct(null);}} referenceDetails={referenceDetails} setReferenceDetails={setReferenceDetails} referenceSelected={referenceSelected} setReferenceSelected={(selected)=>{setReferenceSelected(selected);if(selected)setLinkedCatalogProduct(null);}} onGenerate={generate} queuedEdits={furnitureEdits} onQueueCatalogProduct={(product)=>{setLinkedCatalogProduct(product);return queueCatalogProduct(product);}} onRemoveQueued={(id)=>setFurnitureEdits((items)=>items.filter((item)=>item.id!==id))} onGenerateQueued={generateFurnitureEdits} placementPrompt={placementPrompt} setPlacementPrompt={setPlacementPrompt} onAdjust={editCurrentImage} canAdjust={Boolean(interiorImage)} isGenerating={isGenerating || isSegmenting} generationError={generationError} orbitAction={orbitAction} materialReference={materialReference} onLoadMaterialReference={loadMaterialReference} onGenerateMaterial={()=>void applyMaterial(materialReference.image,materialReference.name)} onRemoveAtPoint={()=>placementPoint&&void removeAtPlacement(placementPoint)} canRemoveAtPoint={Boolean(placementPoint)} studioMaterials={studioMaterials} activeStudioMaterialId={linkedCatalogProduct?.id||""} onOpenStudioCatalog={openStudioCatalog} onActivateStudioMaterial={(product)=>{const active=linkedCatalogProduct?.id===product.id;if(active){setFurnitureEdits([]);setLinkedCatalogProduct(null);return;}setReferenceSelected(false);setFurnitureEdits([]);setLinkedCatalogProduct(product);}} onRemoveStudioMaterial={(id)=>{const removed=studioMaterials.find((item)=>item.id===id);setStudioMaterials((items)=>items.filter((item)=>item.id!==id));if(removed&&(furnitureEdits[0]?.product.id===removed.product.id||linkedCatalogProduct?.id===removed.product.id)){setFurnitureEdits([]);setLinkedCatalogProduct(null);}setProjectSaved(false);}}/> : <DesignPanel prompt={prompt} setPrompt={setPrompt} generate={generate} isGenerating={isGenerating || isSegmenting} generationError={generationError} selected={selected} onProducts={() => { setActiveTool("Добавить мебель"); setFurnitureMode("choice"); }} preserved={preserved} setPreserved={setPreserved} creativity={creativity} setCreativity={setCreativity}/>}</aside></section>
    {studioCatalogOpen&&<FurnitureCatalogPage projectName={projectName||"Новый проект"} roomName="Гостиная" selectedIds={studioMaterials.map((item)=>item.product.id)} onClose={closeStudioCatalog} onSelect={chooseStudioCatalogProduct}/>}
    {saveProjectDialogOpen&&<div className="auth-overlay save-project-overlay" role="dialog" aria-modal="true" aria-labelledby="save-project-title"><form className="auth-card save-project-card" onSubmit={saveGenerationAsProject}><button className="auth-close" type="button" aria-label="Закрыть" onClick={()=>setSaveProjectDialogOpen(false)}>×</button><span>НОВЫЙ ПРОЕКТ</span><h2 id="save-project-title">Сохранить как проект</h2><p>Назовите проект, чтобы продолжить работу с этой визуализацией позже.</p><label htmlFor="save-project-name">Название проекта<input id="save-project-name" value={saveProjectName} onChange={(event)=>{setSaveProjectName(event.target.value);if(saveProjectError)setSaveProjectError("");}} required maxLength={120} placeholder="Например, гостиная на Патриарших"/></label>{saveProjectError&&<p className="auth-error" role="alert">{saveProjectError}</p>}<button className="auth-submit" disabled={isSavingProject}>{isSavingProject?"Сохраняем…":"Сохранить"}</button></form></div>}
    {authOpen && <AuthModal mode={authMode} onMode={setAuthMode} onClose={()=>setAuthOpen(false)} onSignedIn={(nextUser)=>{setUser(nextUser);setAuthOpen(false);setNorrEntryAuth(false);}} context={norrEntryAuth ? "norr-product" : "default"} required={norrEntryAuth}/>}
    {adminOpen && <AdminDashboard onClose={()=>setAdminOpen(false)}/>}
  </main>;
}

type ProjectMenuStageId = "sources" | "installation" | "planning" | "interior" | "materials" | "porcelain" | "bathroom" | "lighting" | "documentation";

const PROJECT_MENU_STAGES: Array<{ id: ProjectMenuStageId; label: string; available: boolean }> = [
  { id: "sources", label: "Обмерный план", available: false },
  { id: "installation", label: "Монтаж, демонтаж", available: false },
  { id: "planning", label: "Планировочное решение", available: false },
  { id: "materials", label: "Концепция и материалы", available: false },
  { id: "interior", label: "Интерьер и меблировка", available: true },
  { id: "lighting", label: "Технический свет", available: true },
  { id: "bathroom", label: "Санузел", available: false },
  { id: "porcelain", label: "Керамогранит", available: false },
  { id: "documentation", label: "Документация", available: false },
];

function ProjectMenuPreview({
  user,
  projectName,
  projectType,
  projectDescription,
  projectId,
  coverImage,
  historyCount,
  furnitureCount,
  isLoading,
  projectSaved,
  onHome,
  onProjects,
  onOpenStudio,
  onOpenTechnical,
}: {
  user: SignedInUser | null;
  projectName: string;
  projectType: string;
  projectDescription: string;
  projectId: string;
  coverImage: string;
  historyCount: number;
  furnitureCount: number;
  isLoading: boolean;
  projectSaved: boolean;
  onHome: () => void;
  onProjects: () => void;
  onOpenStudio: () => void;
  onOpenTechnical: () => void;
}) {
  const [selectedStage, setSelectedStage] = useState<ProjectMenuStageId>("interior");
  const [unavailableStage, setUnavailableStage] = useState<string | null>(null);
  const stage = PROJECT_MENU_STAGES.find((item) => item.id === selectedStage) || PROJECT_MENU_STAGES[2];
  const stageIndex = PROJECT_MENU_STAGES.findIndex((item) => item.id === selectedStage);
  const nextStage = PROJECT_MENU_STAGES[stageIndex + 1] || null;
  const isInterior = selectedStage === "interior";
  const isLighting = selectedStage === "lighting";
  const openSelectedStage = () => {
    if (isInterior) onOpenStudio();
    if (isLighting) onOpenTechnical();
  };
  const openNextStage = () => {
    if (!nextStage) return;
    if (!nextStage.available) {
      setUnavailableStage(nextStage.label);
      return;
    }
    if (nextStage.id === "interior") onOpenStudio();
    if (nextStage.id === "lighting") onOpenTechnical();
  };
  const stageDescription = isInterior
    ? "Создавайте визуализации, расставляйте мебель и работайте с планом комнаты в единой студии."
    : "Спроектируйте план потолка, выберите светильники и проверьте свет в интерьере.";
  const renderLabel = historyCount === 1 ? "1 визуализация" : `${historyCount} визуализаций`;
  useEffect(()=>{if(!unavailableStage)return;const timer=window.setTimeout(()=>setUnavailableStage(null),3600);return()=>window.clearTimeout(timer);},[unavailableStage]);

  return <main className="project-menu-preview">
    <header className="project-menu-header">
      <button className="project-menu-wordmark room-design-wordmark" type="button" onClick={onHome}>ROOM DESIGN</button>
      <nav aria-label="Путь проекта">
        <button type="button" onClick={onProjects}>Проекты</button><span>›</span><b>{projectName}</b><span>›</span><em>Меню проекта</em>
      </nav>
      <div className="project-menu-account">{user?<AccountDropdown user={user} dashboard/>:<span aria-hidden="true">?</span>}</div>
    </header>
    <div className="project-menu-layout">
      <aside className="project-menu-sidebar" aria-label="Этапы проекта">
        <div className="project-menu-summary">
          <span>ДИЗАЙН-ПРОЕКТ</span>
          <h1>{projectName}</h1>
          <p>{projectType}{projectDescription?` · ${projectDescription}`:""}</p>
          <strong>{PROJECT_MENU_STAGES.filter((item)=>item.available).length} из {PROJECT_MENU_STAGES.length} разделов доступны</strong>
          <i aria-hidden="true"><b/></i>
        </div>
        <ol className="project-menu-stages">
          {PROJECT_MENU_STAGES.map((item,index)=><li key={item.id} className={`${selectedStage===item.id?"is-active ":""}${item.available?"is-available":"is-placeholder"}`}>
            <button type="button" onClick={()=>item.available?setSelectedStage(item.id):setUnavailableStage(item.label)} aria-current={selectedStage===item.id?"step":undefined}>
              <span>{String(index+1).padStart(2,"0")}</span><b>{item.label}</b><small>{item.available?"доступно":"скоро"}</small>
            </button>
          </li>)}
        </ol>
        <button className="project-menu-back" type="button" onClick={onProjects}>← Все проекты</button>
      </aside>
      <section className="project-menu-content" aria-live="polite">
        <>
          <div className="project-menu-title-row">
            <div><span>РАЗДЕЛ ПРОЕКТА</span><h2>{stage.label}</h2><p>{stageDescription}</p></div>
            <mark>{isLoading?"Загрузка…":projectSaved?"Сохранено":"Можно начать"}</mark>
          </div>
          <div className="project-menu-workspace">
            <article className={`project-menu-feature ${isLighting?"is-lighting":"is-interior"}`}>
              <div className="project-menu-visual">
                <img src={coverImage||"/project-loading-blueprint.png"} alt={coverImage?`Последняя визуализация проекта «${projectName}»`:"Эскиз будущего интерьера"}/>
                <span>{isLighting?"Технический свет":"Студия интерьера"}</span>
              </div>
              <div className="project-menu-feature-copy">
                <div><span>{isInterior?"ЕДИНАЯ РАБОЧАЯ СРЕДА":"СВЕТОВОЙ СЦЕНАРИЙ"}</span><h3>{isInterior?"Интерьер и план комнаты":"План света и визуализация"}</h3><p>{isInterior?`${renderLabel} · ${furnitureCount} предметов в рабочем проекте`:"План потолка · каталог светильников · проверка результата"}</p></div>
                <button type="button" onClick={openSelectedStage}>{historyCount||furnitureCount?"Продолжить":"Начать работу"} <b>→</b></button>
              </div>
            </article>
            <aside className="project-menu-details">
              <section><span>СОСТАВ РАЗДЕЛА</span>{isInterior?<><p><b>Редактор изображений</b><em>{historyCount?"есть история":"готов"}</em></p><p><b>Создание интерьера</b><em>{furnitureCount?`${furnitureCount} предметов`:"готово к работе"}</em></p><p><b>История рендеров</b><em>{historyCount}</em></p></>:<><p><b>План потолка</b><em>доступен</em></p><p><b>Каталог света</b><em>доступен</em></p><p><b>Визуализации</b><em>в проекте</em></p></>}</section>
              {nextStage&&<section className="project-menu-next"><span>СЛЕДУЮЩИЙ РАЗДЕЛ</span><h3>{nextStage.label}</h3><p>{nextStage.available?"Продолжите работу над проектом на следующем этапе.":"Этот этап скоро появится в маршруте проекта."}</p><button type="button" onClick={openNextStage}>Перейти <b>→</b></button></section>}
            </aside>
          </div>
          <section className="project-menu-materials"><div><span>МАТЕРИАЛЫ ПРОЕКТА</span><h3>Всё, что уже собрано</h3></div><p><b>{historyCount}</b> визуализаций</p><p><b>{furnitureCount}</b> предметов</p><p><b>{projectId?"1":"0"}</b> проект</p></section>
        </>
      </section>
    </div>
    {unavailableStage&&<div className="project-menu-toast" role="alert" aria-live="assertive"><i aria-hidden="true">!</i><div><b>Раздел в работе</b><span>«{unavailableStage}» скоро появится.</span></div><button type="button" onClick={()=>setUnavailableStage(null)} aria-label="Закрыть уведомление">×</button></div>}
  </main>;
}

function AccountDashboard({user,onHome,onCreate,onOpenProject,onOpenGeneration,onLogin}:{user:SignedInUser|null;onHome:()=>void;onCreate:()=>void;onOpenProject:(project:AccountProject)=>void;onOpenGeneration:(generation:AccountGeneration)=>void;onLogin:()=>void}){const[data,setData]=useState<AccountOverview|null>(null);const[error,setError]=useState("");useEffect(()=>{if(!user)return;void fetch("/api/account/overview").then(async(response)=>{const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||"Не удалось загрузить кабинет.");return payload;}).then(setData).catch((reason)=>setError(reason instanceof Error?reason.message:"Не удалось загрузить кабинет."));},[user]);if(!user)return <main className="account-page"><header className="account-nav"><button onClick={onHome}>← На главную</button><div className="home-wordmark">ROOM<span>design</span></div><button onClick={onLogin}>Войти</button></header><section className="account-empty"><span>ROOM DESIGN</span><h1>Войдите, чтобы открыть кабинет</h1><p>Здесь хранятся проекты, сохранённые визуализации и история использования токенов.</p><button onClick={onLogin}>Войти или зарегистрироваться</button></section></main>;const summary=data?.summary||{};const greeting=user.firstName?`Ваши проекты, ${user.firstName}.`:"Ваши проекты.";return <main className="account-page"><header className="account-nav"><button onClick={onHome}>← На главную</button><div className="home-wordmark">ROOM<span>design</span></div><span>{user.email}</span></header>{error?<p className="account-error">{error}</p>:!data?<p className="account-loading">Загружаем кабинет…</p>:<><section className="account-stats"><article><small>ПРОЕКТЫ</small><b>{data.projects.length}</b></article><article><small>СОХРАНЁННЫЕ ГЕНЕРАЦИИ</small><b>{Number(summary.generation_count||0)}</b></article><article><small>ИСПОЛЬЗОВАНО ТОКЕНОВ</small><b>{Number(summary.total_tokens||0).toLocaleString("ru-RU")}</b></article><article><small>СТОИМОСТЬ ГЕНЕРАЦИЙ</small><b>${Number(summary.cost_usd||0).toFixed(4)}</b></article></section><section className="account-hero"><div><p>ЛИЧНЫЙ КАБИНЕТ</p><h1>{greeting}</h1><span>Продолжайте работу с сохранёнными результатами или сделайте новый проект.</span></div><button onClick={onCreate}>Создать проект <b>→</b></button></section><section className="account-section"><div className="account-section-head"><div><small>ПРОЕКТЫ</small><h2>Продолжить работу</h2></div></div>{data.projects.length?<div className="account-project-grid">{data.projects.map((project)=><article key={project.id} className="account-project"><span>{project.project_type}</span><h3>{project.name}</h3><p>{project.description||"Без описания"}</p><footer><time>{new Date(project.updated_at).toLocaleDateString("ru-RU")}</time><button onClick={()=>onOpenProject(project)}>Открыть →</button></footer></article>)}</div>:<div className="account-no-projects"><b>Здесь появятся ваши проекты.</b><span>Создайте первый проект, чтобы начать работать с интерьером.</span></div>}</section><section className="account-section"><div className="account-section-head"><div><small>СОХРАНЁННЫЕ ИЗОБРАЖЕНИЯ</small><h2>Последние генерации</h2></div></div>{data.generations.length?<div className="account-generation-grid">{data.generations.map((generation)=><button key={generation.id} className="account-generation" onClick={()=>onOpenGeneration(generation)}><img src={`/api/account/generations/${generation.id}`} alt="Сохранённая генерация"/><span>{generation.operation}</span><small>{new Date(generation.created_at).toLocaleDateString("ru-RU")} · {Number(generation.total_tokens||0).toLocaleString("ru-RU")} токенов</small><b>Продолжить редактирование →</b></button>)}</div>:<div className="account-no-projects"><b>Сохранённых генераций пока нет.</b><span>Они появятся здесь после первой визуализации.</span></div>}</section></>}</main>}

function AccountDashboardWithProfile({user,onUserUpdated,onHome,onCreate,onOpenProject,onOpenGeneration,onLogin}:{user:SignedInUser|null;onUserUpdated:(user:SignedInUser)=>void;onHome:()=>void;onCreate:()=>void;onOpenProject:(project:AccountProject)=>void;onOpenGeneration:(generation:AccountGeneration)=>void;onLogin:()=>void}){
  const [data,setData]=useState<AccountOverview|null>(null);
  const [error,setError]=useState("");
  const [profileOpen,setProfileOpen]=useState(false);
  const [deletingProjectId,setDeletingProjectId]=useState("");
  const [toastOpen,setToastOpen]=useState(false);
  const loadOverview=()=>fetch("/api/account/overview").then(async(response)=>{const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||"Не удалось загрузить кабинет.");return payload as AccountOverview;});
  useEffect(()=>{if(!user)return;void loadOverview().then(setData).catch(()=>setError("Не удалось загрузить данные кабинета. Попробуйте обновить страницу."));},[user?.id]);
  useEffect(()=>{if(!toastOpen)return;const timer=window.setTimeout(()=>setToastOpen(false),3500);return()=>window.clearTimeout(timer);},[toastOpen]);
  if(!user)return <main className="account-page"><header className="account-nav"><button onClick={onHome}>← На главную</button><button className="home-wordmark room-design-wordmark" type="button" onClick={onHome} aria-label="ROOM DESIGN — на главную">ROOM DESIGN</button><button onClick={onLogin}>Войти</button></header><section className="account-empty"><span>ROOM DESIGN</span><h1>Войдите, чтобы открыть кабинет</h1><p>Здесь хранятся проекты, сохранённые визуализации и история использования токенов.</p><button onClick={onLogin}>Войти или зарегистрироваться</button></section></main>;
  const formatDate=(value:string,withTime=false)=>new Intl.DateTimeFormat("ru-RU",withTime?{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}:{day:"numeric",month:"short",year:"numeric"}).format(new Date(value));
  const isLoading=!data&&!error;
  const projects=data?.projects||[];
  const generations=data?.generations||[];
  const dashboard=data?.dashboard||{projectsCount:projects.length,uniqueProductsCount:0,favoritesCount:0,usedBrandsCount:0,topProducts:[],brands:[],furnitureState:"empty" as const};
  const scrollToProjects=()=>{const target=document.getElementById("projects-dashboard-projects-title");if(!target)return;target.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});target.focus({preventScroll:true});};
  const deleteProject=async(event:React.MouseEvent,project:AccountProject)=>{event.preventDefault();event.stopPropagation();if(deletingProjectId||!window.confirm(`Удалить проект «${project.name}»? Это действие нельзя отменить.`))return;setDeletingProjectId(project.id);setError("");try{const response=await fetch(`/api/projects/${encodeURIComponent(project.id)}`,{method:"DELETE"});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||"Не удалось удалить проект.");setData(await loadOverview());}catch(reason){setError(reason instanceof Error?reason.message:"Не удалось удалить проект.");}finally{setDeletingProjectId("");}};
  return <main className="projects-dashboard personal-catalog-dashboard">
    <header className="personal-catalog-header">
      <div className="personal-catalog-header-left"><button className="room-design-wordmark" type="button" onClick={onHome} aria-label="ROOM DESIGN — на главную">ROOM DESIGN</button><i/><button type="button" onClick={onHome}>←&nbsp;&nbsp;На главную</button></div>
      <AccountDropdown user={user} dashboard/>
    </header>
    {error&&<p className="projects-dashboard-error" role="status">{error}</p>}
    <div className="personal-catalog-shell">
      <section className="personal-catalog-intro">
        <div><span className="personal-catalog-eyebrow">ВАШЕ ПРОСТРАНСТВО</span><h1>Проекты, предметы и любимые бренды.</h1><p>Всё, что вы примеряли в интерьерах, теперь собрано в одной личной подборке.</p></div>
        <div className="personal-catalog-actions"><button className="personal-catalog-primary" type="button" onClick={onCreate}><span aria-hidden="true">＋</span> Начать новый проект</button><button className="personal-catalog-secondary" type="button" onClick={scrollToProjects}><span aria-hidden="true">↓</span> Выбрать текущий проект</button></div>
      </section>
      <section className={isLoading?"personal-catalog-stats is-loading":"personal-catalog-stats"} aria-label="Статистика личного каталога" aria-busy={isLoading}>
        {[['Проекты',dashboard.projectsCount],['Предметы в проектах',dashboard.uniqueProductsCount],['Избранное',dashboard.favoritesCount],['Любимые бренды',dashboard.usedBrandsCount]].map(([label,value])=><article key={String(label)}><span>{label}</span><b>{isLoading?'—':Number(value)}</b></article>)}
      </section>
      <div className="personal-catalog-main-grid">
        <section className="personal-catalog-furniture" aria-labelledby="personal-furniture-title">
          <span className="personal-catalog-eyebrow">ЧАЩЕ ВСЕГО ИСПОЛЬЗУЕТЕ</span><h2 id="personal-furniture-title">Ваша мебель</h2>
          {isLoading?<div className="personal-catalog-product-grid is-loading"><i/><i/><i/></div>:dashboard.furnitureState==='unavailable'?<div className="personal-catalog-empty"><b>Не удалось загрузить подборку мебели.</b><button type="button" onClick={()=>{setError('');void loadOverview().then(setData).catch(()=>setError('Не удалось обновить подборку мебели.'));}}>Попробовать снова</button></div>:dashboard.topProducts.length?<div className="personal-catalog-product-grid">{dashboard.topProducts.map((product,index)=><article className="personal-catalog-product" key={product.identityKey}><div className="personal-catalog-product-image">{product.imageUrl?<img src={product.imageUrl} alt={product.productName} loading="lazy"/>:<span aria-hidden="true">{product.category?.slice(0,1)||'R'}</span>}</div><div className="personal-catalog-product-meta"><b className="personal-catalog-rank">{index+1}</b><span className="personal-catalog-heart" aria-hidden="true">♡</span><small>{product.brandName||'Бренд не указан'}</small><h3>{product.productName}</h3><p>в {product.uniqueProjectCount} {product.uniqueProjectCount===1?'проекте':'проектах'}</p>{product.variantLabel&&<em>{product.variantLabel}</em>}{product.available===false&&<mark>Недоступен в каталоге</mark>}</div></article>)}</div>:<div className="personal-catalog-empty"><b>Здесь появятся предметы, которые вы добавите в проекты.</b><span>Мы учитываем только реально сохранённую мебель и свет.</span></div>}
        </section>
        <aside className="personal-catalog-brands" aria-labelledby="personal-brands-title"><span className="personal-catalog-eyebrow">ВАШИ БРЕНДЫ</span><h2 id="personal-brands-title">Любимые марки</h2><p>Рейтинг строится по реальному использованию товаров в проектах.</p>{isLoading?<div className="personal-catalog-brand-skeleton"><i/><i/></div>:dashboard.brands.length?<div className="personal-catalog-brand-list">{dashboard.brands.map((brand)=><article key={brand.brandId}><b className="personal-catalog-brand-logo" aria-hidden="true">{brand.brandName.slice(0,1)}</b><div><h3>{brand.brandName}</h3><small>{brand.uniqueProductCount} предм. · {brand.projectCount} проект.</small></div><strong>{brand.sharePercent}%</strong></article>)}</div>:<div className="personal-catalog-brand-empty">Бренды появятся после добавления товаров в проект.</div>}<button className="personal-catalog-brand-button" type="button" onClick={()=>setToastOpen(true)}>Открыть каталог брендов</button></aside>
      </div>
      <section className="projects-dashboard-section projects-dashboard-projects personal-catalog-section" aria-labelledby="projects-dashboard-projects-title"><span className="personal-catalog-eyebrow">ПРОДОЛЖИТЬ РАБОТУ</span><h2 id="projects-dashboard-projects-title" tabIndex={-1}>Последние проекты</h2>{isLoading?<div className="projects-dashboard-skeleton"><i/><i/><i/></div>:projects.length?<div className="projects-dashboard-project-grid">{projects.map((project)=><div key={project.id} className="projects-dashboard-project" role="link" tabIndex={0} aria-label={`Открыть проект «${project.name}»`} onClick={()=>onOpenProject(project)} onKeyDown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpenProject(project);}}}><button className="projects-dashboard-project-delete" type="button" aria-label={`Удалить проект «${project.name}»`} title="Удалить проект" disabled={deletingProjectId===project.id} onClick={(event)=>void deleteProject(event,project)}><span aria-hidden="true">×</span><em role="tooltip">Удалить проект</em></button><div className="projects-dashboard-project-mark">{project.preview_image?<img src={project.preview_image} alt={`Последнее изображение проекта «${project.name}»`} loading="lazy"/>:<span aria-hidden="true">{project.project_type.slice(0,1)}</span>}</div><div><small>{project.project_type}</small><h3>{project.name}</h3><p>{project.description||'Описание проекта пока не добавлено.'}</p><time>Обновлено {formatDate(project.updated_at)}</time><span className="projects-dashboard-project-open">Открыть <b>→</b></span></div></div>)}</div>:<div className="projects-dashboard-empty"><div><b>Здесь появятся ваши проекты.</b><span>Начните новый проект в верхней части страницы.</span></div></div>}</section>
      <section className="projects-dashboard-section projects-dashboard-generations personal-catalog-section" aria-labelledby="projects-dashboard-generations-title"><span className="personal-catalog-eyebrow">СОХРАНЁННЫЕ ИЗОБРАЖЕНИЯ</span><h2 id="projects-dashboard-generations-title">Последние генерации</h2>{isLoading?<div className="projects-dashboard-skeleton is-compact"><i/><i/><i/></div>:generations.length?<div className="projects-dashboard-generation-grid">{generations.map((generation)=>generation.image_deleted_at?<article key={generation.id} className="projects-dashboard-generation is-deleted"><div className="generation-retention-placeholder">Изображение удалено по политике хранения</div><span><b>{generation.operation}</b><small>{formatDate(generation.created_at,true)}<i/> {Number(generation.total_tokens||0).toLocaleString('ru-RU')} токенов</small></span></article>:<button key={generation.id} type="button" className="projects-dashboard-generation" onClick={()=>onOpenGeneration(generation)}><img src={`/api/account/generations/${generation.id}`} alt={`Сохранённый рендер: ${generation.operation}`}/><span><b>{generation.operation}</b><small>{formatDate(generation.created_at,true)}<i/> {Number(generation.total_tokens||0).toLocaleString('ru-RU')} токенов</small><strong>Продолжить редактирование&nbsp;&nbsp;→</strong></span></button>)}</div>:<div className="projects-dashboard-empty is-compact"><div><b>Сохранённых генераций пока нет.</b><span>Они появятся здесь после первой визуализации.</span></div></div>}</section>
    </div>
    {toastOpen&&<div className="personal-catalog-toast" role="status" aria-live="polite"><span>Каталог брендов появится скоро.</span><button type="button" aria-label="Закрыть уведомление" onClick={()=>setToastOpen(false)}>×</button></div>}
    {profileOpen&&<ProfileModal user={user} onClose={()=>setProfileOpen(false)} onUserUpdated={onUserUpdated}/>}
  </main>;
}

function LegacyAccountDashboardWithProfile({user,onUserUpdated,onHome,onCreate,onOpenProject,onOpenGeneration,onLogin}:{user:SignedInUser|null;onUserUpdated:(user:SignedInUser)=>void;onHome:()=>void;onCreate:()=>void;onOpenProject:(project:AccountProject)=>void;onOpenGeneration:(generation:AccountGeneration)=>void;onLogin:()=>void}){
  const [data,setData]=useState<AccountOverview|null>(null);
  const [error,setError]=useState("");
  const [profileOpen,setProfileOpen]=useState(false);
  const [deletingProjectId,setDeletingProjectId]=useState("");
  useEffect(()=>{if(!user)return;void fetch("/api/account/overview").then(async(response)=>{const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||"Не удалось загрузить кабинет.");return payload;}).then(setData).catch(()=>setError("Не удалось загрузить данные кабинета. Попробуйте обновить страницу."));},[user?.id]);
  if(!user)return <main className="account-page"><header className="account-nav"><button onClick={onHome}>← На главную</button><button className="home-wordmark room-design-wordmark" type="button" onClick={onHome} aria-label="ROOM DESIGN — на главную">ROOM DESIGN</button><button onClick={onLogin}>Войти</button></header><section className="account-empty"><span>ROOM DESIGN</span><h1>Войдите, чтобы открыть кабинет</h1><p>Здесь хранятся проекты, сохранённые визуализации и история использования токенов.</p><button onClick={onLogin}>Войти или зарегистрироваться</button></section></main>;
  const summary=data?.summary||{};
  const greeting=user.firstName?`Ваши проекты, ${user.firstName}.`:"Ваши проекты.";
  const formatDate=(value:string,withTime=false)=>new Intl.DateTimeFormat("ru-RU",withTime?{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}:{day:"numeric",month:"short",year:"numeric"}).format(new Date(value));
  const isLoading=!data&&!error;
  const projects=data?.projects||[];
  const generations=data?.generations||[];
  const deleteProject=async(event:React.MouseEvent,project:AccountProject)=>{
    event.preventDefault();event.stopPropagation();
    if(deletingProjectId||!window.confirm(`Удалить проект «${project.name}»? Это действие нельзя отменить.`))return;
    setDeletingProjectId(project.id);setError("");
    try{
      const response=await fetch(`/api/projects/${encodeURIComponent(project.id)}`,{method:"DELETE"});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||"Не удалось удалить проект.");
      setData((current)=>current?{...current,projects:current.projects.filter((item)=>item.id!==project.id)}:current);
    }catch(reason){setError(reason instanceof Error?reason.message:"Не удалось удалить проект.");}
    finally{setDeletingProjectId("");}
  };
  return <main className="projects-dashboard">
    <section className="projects-dashboard-top">
      <div className="projects-dashboard-paper">
        <header className="projects-dashboard-header"><button className="room-design-wordmark" type="button" onClick={onHome} aria-label="ROOM DESIGN — на главную">ROOM DESIGN</button><i/><button type="button" onClick={onHome}>←&nbsp;&nbsp;На главную</button></header>
        <div className="projects-dashboard-copy"><p><b>01</b><i/><span>ЛИЧНЫЙ КАБИНЕТ</span></p><h1>{greeting}</h1><div className="projects-dashboard-description">Продолжайте работу с сохранёнными результатами<br className="projects-dashboard-copy-break"/> или создайте новый проект.</div><div className="projects-dashboard-actions"><button className="projects-dashboard-primary" type="button" onClick={onCreate}>Создать проект <b>→</b></button><button className="projects-dashboard-secondary" type="button" onClick={()=>setProfileOpen(true)}><span className="projects-dashboard-person" aria-hidden="true"/> Личные данные</button></div></div>
      </div>
      <div className="projects-dashboard-media"><img src="/images/room-design/room-design-projects-dashboard-hero-reference.avif" alt=""/><p className="projects-dashboard-good"><i/>Good<br/>Rooms<br/>Better<br/>Lives<i/></p><p className="projects-dashboard-story">ПРОСТРАНСТВО<br/>ДЛЯ ЛУЧШИХ<br/>ИСТОРИЙ<i/></p></div>
      <div className="projects-dashboard-account"><AccountDropdown user={user} dashboard/></div>
    </section>
    {error&&<p className="projects-dashboard-error" role="status">{error}</p>}
    <section className={isLoading?"projects-dashboard-ledger is-loading":"projects-dashboard-ledger"} aria-busy={isLoading}>
      <article><span>01</span><i/><div><small>Проекты</small><b>{isLoading?"—":projects.length}</b></div></article>
      <article><span>02</span><i/><div><small>Сохранённые генерации</small><b>{isLoading?"—":Number(summary.generation_count||0)}</b></div></article>
      <article><span>03</span><i/><div><small>Использовано токенов</small><b>{isLoading?"—":Number(summary.total_tokens||0).toLocaleString("ru-RU")}</b></div></article>
      <aside><span>БОЛЬШЕ, ЧЕМ<br/>ИНТЕРЬЕР</span><i/></aside>
    </section>
    <section className="projects-dashboard-section projects-dashboard-projects" aria-labelledby="projects-dashboard-projects-title">
      <header><span>04</span><i/><h2 id="projects-dashboard-projects-title">Продолжить работу</h2></header>
      {isLoading?<div className="projects-dashboard-skeleton"><i/><i/><i/></div>:projects.length?<div className="projects-dashboard-project-grid">{projects.map((project)=><div key={project.id} className="projects-dashboard-project" role="link" tabIndex={0} aria-label={`Открыть проект «${project.name}»`} onClick={()=>onOpenProject(project)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onOpenProject(project);}}}><button className="projects-dashboard-project-delete" type="button" aria-label={`Удалить проект «${project.name}»`} title="Удалить проект" disabled={deletingProjectId===project.id} onClick={(event)=>void deleteProject(event,project)}><span aria-hidden="true">×</span><em role="tooltip">Удалить проект</em></button><div className="projects-dashboard-project-mark">{project.preview_image?<img src={project.preview_image} alt={`Последнее изображение проекта «${project.name}»`} loading="lazy"/>:<span aria-hidden="true">{project.project_type.slice(0,1)}</span>}</div><div><small>{project.project_type}</small><h3>{project.name}</h3><p>{project.description||"Описание проекта пока не добавлено."}</p><time>Обновлено {formatDate(project.updated_at)}</time><span className="projects-dashboard-project-open">Открыть <b>→</b></span></div></div>)}</div>:<div className="projects-dashboard-empty"><div><b>Здесь появятся ваши проекты.</b><span>Создайте первый проект, чтобы начать работать с интерьером.</span></div><button type="button" onClick={onCreate}>Создать первый проект →</button></div>}
    </section>
    <section className="projects-dashboard-section projects-dashboard-generations" aria-labelledby="projects-dashboard-generations-title">
      <header><span>05</span><i/><h2 id="projects-dashboard-generations-title">Последние генерации</h2>{generations.length>0&&<a href="/account#renders">Все генерации&nbsp;&nbsp;→</a>}</header>
      {isLoading?<div className="projects-dashboard-skeleton is-compact"><i/><i/><i/></div>:generations.length?<div className="projects-dashboard-generation-grid">{generations.map((generation)=>generation.image_deleted_at?<article key={generation.id} className="projects-dashboard-generation is-deleted"><div className="generation-retention-placeholder">Изображение удалено по политике хранения</div><span><b>{generation.operation}</b><small>{formatDate(generation.created_at,true)}<i/> {Number(generation.total_tokens||0).toLocaleString("ru-RU")} токенов</small></span></article>:<button key={generation.id} type="button" className="projects-dashboard-generation" onClick={()=>onOpenGeneration(generation)}><img src={`/api/account/generations/${generation.id}`} alt={`Сохранённый рендер: ${generation.operation}`}/><span><b>{generation.operation}</b><small>{formatDate(generation.created_at,true)}<i/> {Number(generation.total_tokens||0).toLocaleString("ru-RU")} токенов</small><strong>Продолжить редактирование&nbsp;&nbsp;→</strong></span></button>)}</div>:<div className="projects-dashboard-empty is-compact"><div><b>Сохранённых генераций пока нет.</b><span>Они появятся здесь после первой визуализации.</span></div></div>}
    </section>
    <footer className="projects-dashboard-footer"><span>ROOM DESIGN <i/> <em>БОЛЬШЕ, ЧЕМ ИНТЕРЬЕР</em></span><span><b>№ 001</b><i/>СОЗДАЁМ ПРОСТРАНСТВА ДЛЯ ЛУЧШИХ ИСТОРИЙ</span></footer>
    {profileOpen&&<ProfileModal user={user} onClose={()=>setProfileOpen(false)} onUserUpdated={onUserUpdated}/>}
  </main>;
}

function ProfileModal({user,onClose,onUserUpdated}:{user:SignedInUser;onClose:()=>void;onUserUpdated:(user:SignedInUser)=>void}){
  const [firstName,setFirstName]=useState(user.firstName);
  const [lastName,setLastName]=useState(user.lastName);
  const [phone,setPhone]=useState(user.phone);
  const [companyRole,setCompanyRole]=useState(user.companyRole);
  const [profileError,setProfileError]=useState("");
  const [profileMessage,setProfileMessage]=useState("");
  const [currentPassword,setCurrentPassword]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const [repeatPassword,setRepeatPassword]=useState("");
  const [passwordError,setPasswordError]=useState("");
  const [passwordMessage,setPasswordMessage]=useState("");
  const [busy,setBusy]=useState<"profile"|"password"|"">("");
  const saveProfile=async(event:React.FormEvent)=>{event.preventDefault();setBusy("profile");setProfileError("");setProfileMessage("");try{const response=await fetch("/api/account/profile",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({firstName,lastName,phone,companyRole})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||"Не удалось сохранить личные данные.");onUserUpdated(payload.user);setProfileMessage("Личные данные сохранены.");}catch(reason){setProfileError(reason instanceof Error?reason.message:"Не удалось сохранить личные данные.");}finally{setBusy("");}};
  const savePassword=async(event:React.FormEvent)=>{event.preventDefault();setPasswordError("");setPasswordMessage("");if(newPassword!==repeatPassword){setPasswordError("Новые пароли не совпадают.");return;}setBusy("password");try{const response=await fetch("/api/account/password",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({currentPassword,newPassword})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||"Не удалось изменить пароль.");setCurrentPassword("");setNewPassword("");setRepeatPassword("");setPasswordMessage("Пароль изменён.");}catch(reason){setPasswordError(reason instanceof Error?reason.message:"Не удалось изменить пароль.");}finally{setBusy("");}};
  return <div className="auth-overlay profile-overlay" role="dialog" aria-modal="true" aria-label="Личные данные"><div className="auth-card profile-card"><button className="auth-close" type="button" aria-label="Закрыть" onClick={onClose}>×</button><span>ЛИЧНЫЙ КАБИНЕТ</span><h2>Личные данные</h2><p>Обновите информацию профиля или задайте новый пароль.</p><form onSubmit={saveProfile}><label>Email <small>логин нельзя изменить</small><input value={user.email} readOnly disabled/></label><div className="auth-name-grid"><label>Имя <small>обязательно</small><input value={firstName} onChange={(event)=>setFirstName(event.target.value)} required autoComplete="given-name"/></label><label>Фамилия<input value={lastName} onChange={(event)=>setLastName(event.target.value)} autoComplete="family-name"/></label></div><label>Телефон<input type="tel" value={phone} onChange={(event)=>setPhone(event.target.value)} autoComplete="tel"/></label><label>Компания / должность<input value={companyRole} onChange={(event)=>setCompanyRole(event.target.value)} autoComplete="organization-title"/></label>{profileError&&<p className="auth-error">{profileError}</p>}{profileMessage&&<p className="profile-success">{profileMessage}</p>}<button className="auth-submit" disabled={Boolean(busy)}>{busy==="profile"?"Сохраняем…":"Сохранить данные"}</button></form><div className="profile-divider"/><form onSubmit={savePassword}><h3>Сменить пароль</h3><label>Текущий пароль<input type="password" value={currentPassword} onChange={(event)=>setCurrentPassword(event.target.value)} required autoComplete="current-password"/></label><label>Новый пароль <small>не менее 8 символов</small><input type="password" value={newPassword} onChange={(event)=>setNewPassword(event.target.value)} required minLength={8} autoComplete="new-password"/></label><label>Повторите новый пароль<input type="password" value={repeatPassword} onChange={(event)=>setRepeatPassword(event.target.value)} required minLength={8} autoComplete="new-password"/></label>{passwordError&&<p className="auth-error">{passwordError}</p>}{passwordMessage&&<p className="profile-success">{passwordMessage}</p>}<button className="auth-submit profile-password-submit" disabled={Boolean(busy)}>{busy==="password"?"Меняем пароль…":"Изменить пароль"}</button></form></div></div>;
}

function AuthModal({mode,onMode,onClose,onSignedIn,context="default",required=false}:{mode:"register"|"login";onMode:(mode:"register"|"login")=>void;onClose:()=>void;onSignedIn:(user:SignedInUser)=>void;context?:"default"|"norr-product";required?:boolean}){const[email,setEmail]=useState("");const[password,setPassword]=useState("");const[firstName,setFirstName]=useState("");const[error,setError]=useState("");const[busy,setBusy]=useState(false);const titleId="auth-modal-title";const norrProduct=context==="norr-product";const submit=async(event:React.FormEvent)=>{event.preventDefault();setBusy(true);setError("");try{const body=mode==="register"?{email,password,firstName}:{email,password};const response=await fetch(`/api/auth/${mode}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||"Не удалось продолжить.");onSignedIn(payload.user);}catch(reason){setError(reason instanceof Error?reason.message:"Не удалось продолжить.");}finally{setBusy(false);}};const switchMode=()=>{setError("");onMode(mode==="register"?"login":"register")};return <div className="auth-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId}><form className={norrProduct?"auth-card auth-card-compact auth-card-norr":"auth-card auth-card-compact"} onSubmit={submit}>{!required&&<button className="auth-close" type="button" aria-label="Закрыть" onClick={onClose}>×</button>}<span>{norrProduct?"ROOM DESIGN × NORR MØBLER":"ROOM DESIGN"}</span><h2 id={titleId}>{mode==="register"?(norrProduct?"ПРОЙДИТЕ БЫСТРУЮ РЕГИСТРАЦИЮ":"Создайте аккаунт"):"Войдите в аккаунт"}</h2><p>{mode==="register"?(norrProduct?"Чтобы загрузить фото интерьера и примерить выбранный товар.":"Зарегистрируйтесь, чтобы сохранять проекты и генерации."):"Введите email и пароль, чтобы продолжить работу."}</p>{mode==="register"&&<label>Имя<input aria-label="Имя обязательно" value={firstName} onChange={(event)=>setFirstName(event.target.value)} required autoComplete="given-name" autoFocus/></label>}<label>Email<input aria-label="Email логин" type="email" value={email} onChange={(event)=>setEmail(event.target.value)} required autoComplete="email" autoFocus={mode==="login"}/></label><label>Пароль<input type="password" value={password} onChange={(event)=>setPassword(event.target.value)} required minLength={8} autoComplete={mode==="register"?"new-password":"current-password"}/></label>{error&&<p className="auth-error" role="alert">{error}</p>}<button className="auth-submit" disabled={busy}>{busy?"Подождите…":mode==="register"?"Зарегистрироваться":"Войти"}</button><button className="auth-switch" type="button" onClick={switchMode}>{mode==="register"?"Уже есть аккаунт? Войти":"Нет аккаунта? Зарегистрироваться"}</button></form></div>}
function AdminDashboard({onClose}:{onClose:()=>void}){const[data,setData]=useState<{users:any[];generations:any[]}|null>(null);const[error,setError]=useState("");const usd=(value:unknown)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:4,maximumFractionDigits:4}).format(Number(value||0));const netto=(item:any)=>Number(item.cost_netto_usd??item.cost_usd??0);const brutto=(item:any)=>Number(item.cost_brutto_usd??netto(item)*3);useEffect(()=>{void fetch("/api/admin/overview").then(async(response)=>{const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Нет доступа.");return payload;}).then(setData).catch((reason)=>setError(reason instanceof Error?reason.message:"Не удалось загрузить данные."));},[]);return <div className="admin-overlay" role="dialog" aria-modal="true" aria-label="Администрирование"><section className="admin-card"><header><div><span>ROOM design</span><h2>Администрирование</h2></div><button onClick={onClose} aria-label="Закрыть">×</button></header>{error?<p className="auth-error">{error}</p>:!data?<p className="admin-loading">Загружаем данные…</p>:<><section className="admin-summary"><b>{data.users.length}<small>пользователей</small></b><b>{data.generations.length}<small>последних генераций</small></b><b>{data.generations.reduce((sum,item)=>sum+Number(item.total_tokens||0),0)}<small>токенов</small></b><b>{usd(data.users.reduce((sum,item)=>sum+netto(item),0))}<small>сумма NET</small></b><b>{usd(data.users.reduce((sum,item)=>sum+brutto(item),0))}<small>сумма GROSS</small></b></section><p className="admin-rate">NET — фактическая стоимость обращения к AI. GROSS = NET × 3.</p><h3>Пользователи</h3><div className="admin-table"><div className="admin-row admin-head"><span>Email</span><span>Роль</span><span>Генерации</span><span>Токены</span><span>NET, USD</span><span>GROSS, USD</span></div>{data.users.map((item)=><div className="admin-row" key={item.id}><span>{item.email}</span><span>{item.role==="admin"?"Администратор":"Пользователь"}</span><span>{item.generations}</span><span>{item.tokens||"—"}</span><span>{usd(netto(item))}</span><span>{usd(brutto(item))}</span></div>)}</div><h3>Генерации</h3><div className="admin-generations">{data.generations.map((item)=><article key={item.id}><img src={`/api/admin/generations/${item.id}`} alt="Результат генерации"/><div><b>{item.email}</b><span>{item.operation}</span><small>{item.total_tokens ? `Вход: ${item.input_tokens||0} · Выход: ${item.output_tokens||0}` : "Токены не вернулись от модели"}</small><small>{item.total_tokens ? `NET: ${usd(netto(item))}` : ""}</small><small>{item.total_tokens ? `GROSS: ${usd(brutto(item))}` : ""}</small></div></article>)}</div></>}</section></div>}
function DesignPanel({prompt,setPrompt,generate,isGenerating,generationError,selected,onProducts,preserved,setPreserved,creativity,setCreativity}:{prompt:string;setPrompt:(v:string)=>void;generate:()=>void;isGenerating:boolean;generationError:string;selected:string;onProducts:()=>void;preserved:string[];setPreserved:(v:string[])=>void;creativity:string;setCreativity:(v:string)=>void}){const togglePreserved=(item:string)=>setPreserved(preserved.includes(item)?preserved.filter(x=>x!==item):[...preserved,item]); return <div className="panel-content"><label>ОПИШИТЕ ВАШУ ИДЕЮ</label><textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)}/><div className="panel-section"><label>СОХРАНИТЬ</label><div className="chips">{["Архитектуру","Окна","Пол","Потолок"].map(x=><button className={preserved.includes(x)?"chip selected":"chip"} key={x} onClick={()=>togglePreserved(x)} aria-pressed={preserved.includes(x)}>{preserved.includes(x)?"✓ ":""}{x}</button>)}</div></div><div className="panel-section"><label>КРЕАТИВНОСТЬ</label><div className="segmented">{["Низкая","Средняя","Высокая"].map(level=><button key={level} className={creativity===level?"selected":""} onClick={()=>setCreativity(level)} aria-pressed={creativity===level}>{level}</button>)}</div></div><div className="selected-product"><span className="tiny-product"/><div><label>ВЫБРАННЫЙ ПРЕДМЕТ</label><b>{selected}</b><button onClick={onProducts}>Изменить предмет</button></div></div><button className="generate" onClick={generate} disabled={isGenerating}>{isGenerating ? "Создаём…" : "✦ Создать дизайн"}</button>{generationError && <p className="generation-error" role="alert">{generationError}</p>}<p className="hint">Сохраняем: {preserved.length ? preserved.map(x=>x.toLowerCase()).join(", ") : "ничего"}. Креативность: {creativity.toLowerCase()}.</p></div>}
function ObjectPanel({objects,selected,isDetecting,isGenerating,error,onDetect,onSelect,onUpload,imageName,onReplace,onRemove}:{objects:DetectedObject[];selected:DetectedObject|null;isDetecting:boolean;isGenerating:boolean;error:string;onDetect:()=>void;onSelect:(item:DetectedObject)=>void;onUpload:(file?:File)=>void;imageName:string;onReplace:(item:DetectedObject)=>void;onRemove:(item:DetectedObject)=>void}){return <div className="panel-content"><label>ИЗОБРАЖЕНИЕ ИНТЕРЬЕРА</label><label className="upload-zone"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>onUpload(e.target.files?.[0])}/><em>↥</em><b>{imageName || "Загрузить изображение"}</b><small>{imageName ? "Изображение готово к анализу" : "JPG, PNG или WEBP"}</small></label><p className="choice-intro">Выберите крупный предмет на изображении или в списке. Для каждого найденного предмета ниже показан его рабочий слой.</p><button className="generate" onClick={()=>onDetect()} disabled={isDetecting || isGenerating}>{isDetecting ? "Распознаём предметы…" : "✦ Распознать предметы"}</button>{isGenerating && <p className="hint">Готовим предметные слои…</p>}{error && <p className="generation-error" role="alert">{error}</p>}{objects.length>0&&<div className="panel-section"><label>НАЙДЕННЫЕ ПРЕДМЕТЫ · СЛОИ</label><div className="product-list">{objects.map((item)=><div className={selected?.id===item.id?"product-card object-card selected":"product-card object-card"} key={item.id} onClick={()=>onSelect(item)} role="button" tabIndex={0} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" ")onSelect(item)}}><ObjectThumbnail item={item}/><div><b>{item.name}</b><span>Рабочий слой предмета</span></div><div className="object-card-actions"><button className="object-replace" onClick={(event)=>{event.stopPropagation();onReplace(item)}} disabled={isGenerating} aria-label={`Заменить: ${item.name}`} title="Заменить">↺</button><button className="object-remove" onClick={(event)=>{event.stopPropagation();onRemove(item)}} disabled={isGenerating} aria-label={`Удалить: ${item.name}`} title="Удалить">×</button></div></div>)}</div></div>}</div>}
function LayersPanel({isBuilding,error,onBuild,onUpload,imageName,points,onRemovePoint}:{isBuilding:boolean;error:string;onBuild:()=>void;onUpload:(file?:File)=>void;imageName:string;points:Array<{id:string;x:number;y:number;width:number;height:number;name:string}>;onRemovePoint:(id:string)=>void}){return <div className="panel-content layers-experiment"><label>РУЧНОЕ ВЫДЕЛЕНИЕ СЛОЁВ</label><p className="layers-intro">Загрузите интерьер, затем обведите кистью по контуру каждый предмет, который хотите вынести в слой. Не отмечайте то, что должно остаться фоном.</p><label className="upload-zone"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>onUpload(event.target.files?.[0])}/><em>↥</em><b>{imageName || "Загрузить интерьер"}</b><small>{imageName ? "Обведите предметы на изображении слева" : "JPG, PNG или WEBP"}</small></label>{points.length>0&&<div className="panel-section"><label>ВЫБРАННЫЕ СЛОИ · {points.length}</label><div className="product-list">{points.map((point,index)=><div className="product-card object-card" key={point.id}><span className="object-thumbnail"><i style={{display:"grid",placeItems:"center",fontStyle:"normal",fontWeight:800,color:"#3d4430"}}>{index+1}</i></span><div><b>{point.name}</b><span>Выделенная область предмета</span></div><div className="object-card-actions"><button className="object-remove" onClick={()=>onRemovePoint(point.id)} aria-label={`Убрать область ${index+1}`} title="Убрать">×</button></div></div>)}</div></div>}<button className="generate" onClick={onBuild} disabled={isBuilding || !imageName || !points.length}>{isBuilding ? "Создаём слои…" : "✦ Создать слои"}</button>{!points.length&&imageName&&<p className="hint">Зажмите кнопку мыши и обведите нужный предмет по контуру.</p>}{error&&<p className="generation-error" role="alert">{error}</p>}</div>}
function LayerGallery({background,source,objects,layers,hidden,selected,onSelect,onReplace,onRemove,isBuilding}:{background:string;source:string;objects:DetectedObject[];layers:Record<string,string>;hidden:string[];selected:DetectedObject|null;onSelect:(item:DetectedObject)=>void;onReplace:(item:DetectedObject)=>void;onRemove:(item:DetectedObject)=>void;isBuilding:boolean}){const [menu,setMenu]=useState<string|null>(null);return <section className="layer-gallery" aria-label="Слои проекта"><div className="layer-gallery-head"><div><span>СЛОИ ПРОЕКТА</span><b>Фон и предметы</b></div><small>{isBuilding?"Выделяем исходные пиксели…":background?`${objects.length+1} слоёв подготовлено`:"Загрузите интерьер и создайте слои"}</small></div><article className="base-plate"><div className="layer-art checker">{background?<img src={background} alt="Фоновая пластина без мебели"/>:source?<img src={source} alt="Исходный интерьер"/>:<div className="layer-empty">Здесь появится фоновая пластина</div>}</div><div className="layer-caption"><span>СЛОЙ 00 · ОСНОВА</span><b>Фоновая пластина</b><small>{background?"Одна фоновая генерация; предметы ниже — исходные пиксели":"Появится после разборки изображения"}</small></div></article>{objects.length>0&&<div className="object-layers-grid">{objects.map((item,index)=>{const isHidden=hidden.includes(item.id);return <article key={item.id} className={`${selected?.id===item.id?"object-layer-tile active":"object-layer-tile"}${isHidden?" hidden-layer":""}`} onClick={()=>onSelect(item)}><button className="layer-menu-trigger" aria-label={`Меню слоя: ${item.name}`} onClick={(event)=>{event.stopPropagation();setMenu(menu===item.id?null:item.id)}}>•••</button>{menu===item.id&&<div className="layer-menu" onClick={(event)=>event.stopPropagation()}><button onClick={()=>{setMenu(null);onReplace(item)}}>Заменить</button><button className="danger" onClick={()=>{setMenu(null);onRemove(item)}}>{isHidden?"Вернуть":"Удалить"}</button></div>}<div className="layer-art checker">{layers[item.id]?<img src={layers[item.id]} alt={`Прозрачный слой: ${item.name}`}/>:<div className="layer-wait">Слой {String(index+1).padStart(2,"0")}</div>}</div><span>СЛОЙ {String(index+1).padStart(2,"0")}</span><b>{item.name}</b><small>{isHidden?"Слой скрыт — генерация не запускается":layers[item.id]?"Исходные пиксели + альфа-маска":"Ожидает выделения"}</small></article>})}</div>}</section>}

function ObjectThumbnail({item}:{item:DetectedObject}){const [preview,setPreview]=useState("");useEffect(()=>{const source=document.querySelector<HTMLImageElement>(".room-canvas > img");if(!source||!source.complete)return;const width=source.naturalWidth,height=source.naturalHeight;if(!width||!height)return;const padding=Math.max(10,Math.round(Math.min(width,height)*.015));const left=Math.max(0,Math.round(width*item.x/100)-padding),top=Math.max(0,Math.round(height*item.y/100)-padding),cropWidth=Math.min(width-left,Math.round(width*item.width/100)+padding*2),cropHeight=Math.min(height-top,Math.round(height*item.height/100)+padding*2);const canvas=document.createElement("canvas");canvas.width=cropWidth;canvas.height=cropHeight;const context=canvas.getContext("2d");if(!context)return;context.fillStyle="#fff";context.fillRect(0,0,cropWidth,cropHeight);context.drawImage(source,left,top,cropWidth,cropHeight,0,0,cropWidth,cropHeight);setPreview(canvas.toDataURL("image/jpeg",.86));},[item.id,item.x,item.y,item.width,item.height]);return <span className="object-thumbnail">{preview?<img src={preview} alt={`Слой: ${item.name}`}/>:<i/>}</span>}
const furnitureCatalogCategories = [
  {type:"sofa",name:"Диван",icon:"sofa"}, {type:"armchair",name:"Кресло",icon:"chair"},
  {type:"chair",name:"Стул",icon:"stool"}, {type:"ottoman",name:"Пуфы",icon:"stool"}, {type:"dining_table",name:"Стол обеденный",icon:"table"},
  {type:"coffee_table",name:"Стол журнальный",icon:"table"}, {type:"desk_table",name:"Стол письменный и туалетный",icon:"table"},
  {type:"console",name:"Консоль",icon:"table"}, {type:"shoe_rack",name:"Обувница",icon:"cabinet"},
  {type:"bed",name:"Кровать",icon:"bed"}, {type:"rug",name:"Ковёр",icon:"rug"},
  {type:"light",name:"Светильник",icon:"lamp"}, {type:"decor",name:"Декор для дома",icon:"decor"},
  {type:"cabinet",name:"Шкаф",icon:"cabinet"}, {type:"dresser",name:"Комод",icon:"dresser"}, {type:"nightstand",name:"Прикроватная тумба",icon:"nightstand"}, {type:"tv_stand",name:"TV-тумба",icon:"tv_stand"},
  {type:"shelving",name:"Стеллаж",icon:"cabinet"},
  {type:"shelf",name:"Полка",icon:"cabinet"},
] as const;

function FurnitureCatalogPage({projectName,roomName,selectedIds,onClose,onSelect}:{projectName:string;roomName:string;selectedIds:string[];onClose:()=>void;onSelect:(product:CatalogProduct)=>void}){
  const[category,setCategory]=useState<(typeof furnitureCatalogCategories)[number]>(furnitureCatalogCategories[0]);const[brands,setBrands]=useState<Array<"norrmobler"|"leve-home">>([]);const[searchInput,setSearchInput]=useState("");const[query,setQuery]=useState("");const[subtype,setSubtype]=useState("");const[subtypes,setSubtypes]=useState<string[]>([]);const[availableOnly,setAvailableOnly]=useState(true);const[sort,setSort]=useState("");const[priceMin,setPriceMin]=useState("");const[priceMax,setPriceMax]=useState("");const[widthMin,setWidthMin]=useState("");const[widthMax,setWidthMax]=useState("");const[products,setProducts]=useState<CatalogProduct[]>([]);const[total,setTotal]=useState(0);const[page,setPage]=useState(1);const[loading,setLoading]=useState(true);const[error,setError]=useState("");const[unavailableSources,setUnavailableSources]=useState<string[]>([]);const[retry,setRetry]=useState(0);const[detail,setDetail]=useState<CatalogProduct|null>(null);const firstControl=useRef<HTMLButtonElement>(null);
  useEffect(()=>{firstControl.current?.focus();const escape=(event:KeyboardEvent)=>{if(event.key!=="Escape")return;if(detail)setDetail(null);else onClose();};window.addEventListener("keydown",escape);return()=>window.removeEventListener("keydown",escape);},[detail,onClose]);
  useEffect(()=>{const timer=window.setTimeout(()=>{setPage(1);setQuery(searchInput.trim());},300);return()=>window.clearTimeout(timer);},[searchInput]);
  useEffect(()=>{setPage(1);},[category,brands,subtype,availableOnly,sort,priceMin,priceMax,widthMin,widthMax]);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError("");const params=new URLSearchParams({type:category.type,page:String(page),limit:"24"});if(query)params.set("q",query);if(brands.length)params.set("brands",brands.join(","));if(subtype)params.set("subtype",subtype);if(availableOnly)params.set("available","1");if(sort)params.set("sort",sort);if(priceMin)params.set("minPrice",priceMin);if(priceMax)params.set("maxPrice",priceMax);if(widthMin)params.set("widthMinMm",widthMin);if(widthMax)params.set("widthMaxMm",widthMax);fetch(`/api/catalog?${params}`,{signal:controller.signal}).then(async(response)=>{const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Каталог временно недоступен.");setProducts((items)=>page===1?payload.products:[...items,...payload.products.filter((product:CatalogProduct)=>!items.some((item)=>item.id===product.id))]);setTotal(Number(payload.total)||0);setSubtypes(Array.isArray(payload.subtypes)?payload.subtypes:[]);setUnavailableSources(Array.isArray(payload.unavailableSources)?payload.unavailableSources:[]);}).catch((reason)=>{if(reason.name!=="AbortError")setError(reason.message||"Не удалось загрузить каталог.");}).finally(()=>setLoading(false));return()=>controller.abort();},[category,brands,query,subtype,availableOnly,sort,priceMin,priceMax,widthMin,widthMax,page,retry]);
  const toggleBrand=(brand:"norrmobler"|"leve-home")=>setBrands((current)=>current.includes(brand)?current.filter((item)=>item!==brand):[...current,brand]);
  const reset=()=>{setBrands([]);setSearchInput("");setQuery("");setSubtype("");setAvailableOnly(true);setSort("");setPriceMin("");setPriceMax("");setWidthMin("");setWidthMax("");setPage(1);};
  const filterCount=brands.length+Number(Boolean(query))+Number(Boolean(subtype))+Number(!availableOnly)+Number(Boolean(sort))+Number(Boolean(priceMin||priceMax))+Number(Boolean(widthMin||widthMax));
  return <section className="room-catalog-page" role="dialog" aria-modal="true" aria-labelledby="room-catalog-title"><header className="room-catalog-header"><button ref={firstControl} type="button" onClick={onClose}>← Вернуться в проект</button><div><span>{projectName} · {roomName}</span><h1 id="room-catalog-title">Каталог мебели</h1></div><button className="room-catalog-close" type="button" onClick={onClose} aria-label="Закрыть каталог">×</button></header><section className="room-catalog-brands" aria-label="Выбор бренда"><div><small>01 · БРЕНДЫ</small><h2>Выберите марку</h2></div><button type="button" className={!brands.length?"active":""} onClick={()=>setBrands([])}><i>RD</i><span><b>Все бренды</b><small>Вся мебель</small></span></button><button type="button" className={brands.includes("norrmobler")?"active":""} onClick={()=>toggleBrand("norrmobler")}><i>N</i><span><b>NORR Møbler</b><small>Мебель и ковры</small></span></button><button type="button" className={brands.includes("leve-home")?"active":""} onClick={()=>toggleBrand("leve-home")}><i>L</i><span><b>LEVE HOME</b><small>Только в наличии</small></span></button></section>{unavailableSources.length>0&&<p className="room-catalog-warning" role="status">Некоторые бренды временно недоступны. Показываем товары доступных партнёров.</p>}<div className="room-catalog-layout"><aside className="room-catalog-filters"><div className="room-catalog-filter-head"><span>02 · ФИЛЬТРЫ</span>{filterCount>0&&<button type="button" onClick={reset}>Сбросить всё</button>}</div><fieldset><legend>Тип товара</legend>{furnitureCatalogCategories.map((item)=><button type="button" className={category.type===item.type?"active":""} key={item.type} onClick={()=>{setCategory(item);setSubtype("");}}>{item.name}<span>→</span></button>)}</fieldset>{subtypes.length>1&&<fieldset><legend>Вариант</legend>{subtypes.map((item)=><label key={item}><input type="radio" name="catalog-subtype" checked={subtype===item} onChange={()=>setSubtype(item)}/><span>{item}</span></label>)}</fieldset>}<fieldset><legend>Цена, руб.</legend><div className="room-catalog-range"><input inputMode="numeric" value={priceMin} onChange={(event)=>setPriceMin(event.target.value.replace(/\D/g,""))} placeholder="от" aria-label="Минимальная цена"/><input inputMode="numeric" value={priceMax} onChange={(event)=>setPriceMax(event.target.value.replace(/\D/g,""))} placeholder="до" aria-label="Максимальная цена"/></div></fieldset><fieldset><legend>Ширина, мм</legend><div className="room-catalog-range"><input inputMode="numeric" value={widthMin} onChange={(event)=>setWidthMin(event.target.value.replace(/\D/g,""))} placeholder="от" aria-label="Минимальная ширина"/><input inputMode="numeric" value={widthMax} onChange={(event)=>setWidthMax(event.target.value.replace(/\D/g,""))} placeholder="до" aria-label="Максимальная ширина"/></div></fieldset><label className="room-catalog-available"><input type="checkbox" checked={availableOnly} onChange={(event)=>setAvailableOnly(event.target.checked)}/><span>Только в наличии</span></label></aside><main className="room-catalog-results"><div className="room-catalog-toolbar"><form onSubmit={(event)=>{event.preventDefault();setPage(1);setQuery(searchInput.trim());}}><span>⌕</span><input value={searchInput} onChange={(event)=>setSearchInput(event.target.value)} placeholder="Название, бренд или артикул" aria-label="Поиск по каталогу"/></form><div><span>{loading&&page===1?"Загружаем…":`${total.toLocaleString("ru-RU")} товаров`}</span><select value={sort} onChange={(event)=>setSort(event.target.value)} aria-label="Сортировка"><option value="">Без сортировки</option><option value="price_asc">Сначала дешевле</option><option value="price_desc">Сначала дороже</option></select></div></div>{filterCount>0&&<div className="room-catalog-active-filters"><span>Выбрано фильтров: {filterCount}</span><button type="button" onClick={reset}>Сбросить всё</button></div>}{error&&page===1?<div className="room-catalog-error"><b>Каталог не загрузился</b><p>{error}</p><button type="button" onClick={()=>setRetry((value)=>value+1)}>Повторить</button></div>:<div className="room-catalog-grid">{loading&&page===1?Array.from({length:8},(_,index)=><div className="room-catalog-skeleton" key={index}/>):products.map((product)=><article key={product.id} className={selectedIds.includes(product.id)?"room-catalog-card selected":"room-catalog-card"}><button className="room-catalog-card-body" type="button" onClick={()=>setDetail(product)}><span className="room-catalog-card-image">{product.image?<img src={product.image} alt={product.name}/>:<i>Нет фото</i>}<em>{product.available?"В наличии":"Под заказ"}</em></span><small>{product.brand}</small><h3>{product.name}</h3><p>{product.article?`Арт. ${product.article}`:"Артикул не указан"}</p><p>{[product.widthMm,product.depthMm,product.heightMm].some(Boolean)?`${product.widthMm||"—"} × ${product.depthMm||"—"} × ${product.heightMm||"—"} мм`:"Габариты уточняются"}</p>{product.price>0?<strong>{new Intl.NumberFormat("ru-RU").format(product.price)} руб.</strong>:<strong>Цена по запросу</strong>}</button><button className="room-catalog-choose" type="button" disabled={!product.available} onClick={()=>onSelect(product)}>{selectedIds.includes(product.id)?"Уже выбран":"Выбрать"}</button></article>)}</div>}{!loading&&!error&&!products.length&&<div className="room-catalog-empty"><b>По этим условиям товаров нет</b><p>Измените запрос или сбросьте фильтры.</p><button type="button" onClick={reset}>Сбросить фильтры</button></div>}{products.length<total&&<button className="room-catalog-more" type="button" disabled={loading} onClick={()=>setPage((value)=>value+1)}>{loading?"Загружаем…":"Показать ещё"}</button>}</main></div>{detail&&<aside className="room-catalog-detail" aria-label="Подробности товара"><button className="room-catalog-detail-close" type="button" onClick={()=>setDetail(null)} aria-label="Закрыть подробности">×</button><div className="room-catalog-detail-gallery">{(detail.images?.length?detail.images:[detail.image]).slice(0,4).map((image,index)=><img src={image} alt={`${detail.name}, изображение ${index+1}`} key={`${image}-${index}`}/>)}</div><small>{detail.brand}</small><h2>{detail.name}</h2><p>Арт. {detail.article||"не указан"}</p><dl><div><dt>Габариты</dt><dd>{detail.widthMm||"—"} × {detail.depthMm||"—"} × {detail.heightMm||"—"} мм</dd></div>{detail.material&&<div><dt>Материал</dt><dd>{detail.material}</dd></div>}{detail.color&&<div><dt>Цвет</dt><dd>{detail.color}</dd></div>}<div><dt>Наличие</dt><dd>{detail.available?"В наличии":"Недоступен"}</dd></div></dl>{detail.description&&<p className="room-catalog-description">{detail.description}</p>}<strong>{detail.price>0?`${new Intl.NumberFormat("ru-RU").format(detail.price)} руб.`:"Цена по запросу"}</strong><button className="room-catalog-detail-choose" type="button" disabled={!detail.available} onClick={()=>onSelect(detail)}>Выбрать для проекта</button>{detail.url&&<a href={detail.url} target="_blank" rel="noreferrer">Открыть у партнёра ↗</a>}</aside>}</section>;
}

function FurnitureCatalogPicker({onSelect,onClose,onUploadReference,canGenerate=false,onGenerate,isGenerating=false,selectionCount=0,persistent=false,referenceLabel="Загрузить референс",footerMessage,selectedProductIds=[]}:{onSelect:(product:CatalogProduct)=>void;onClose:()=>void;onUploadReference?:(file?:File)=>void;canGenerate?:boolean;onGenerate?:()=>void;isGenerating?:boolean;selectionCount?:number;persistent?:boolean;referenceLabel?:string;footerMessage?:string;selectedProductIds?:string[]}){
  const referenceUpload=useRef<HTMLInputElement>(null);
  const [fullscreen,setFullscreen]=useState(false);
  const [category,setCategory]=useState<(typeof furnitureCatalogCategories)[number]>(furnitureCatalogCategories[0]);
  const [searchInput,setSearchInput]=useState("");
  const [query,setQuery]=useState("");
  const [availableOnly,setAvailableOnly]=useState(false);
  const [brands,setBrands]=useState<Array<"norrmobler"|"leve-home">>([]);
  const [subtype,setSubtype]=useState("");
  const [subtypes,setSubtypes]=useState<string[]>([]);
  const [products,setProducts]=useState<CatalogProduct[]>([]);
  const [page,setPage]=useState(1);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{const timer=window.setTimeout(()=>setQuery(searchInput.trim()),250);return()=>window.clearTimeout(timer);},[searchInput]);
  useEffect(()=>{setProducts([]);setPage(1);},[category?.type,query,availableOnly,subtype,brands]);
  useEffect(()=>{if(!category)return;const controller=new AbortController();setLoading(true);setError("");const params=new URLSearchParams({type:category.type,page:String(page),limit:"18"});if(query)params.set("q",query);if(availableOnly)params.set("available","1");if(subtype)params.set("subtype",subtype);if(brands.length)params.set("brands",brands.join(","));fetch(`/api/catalog?${params}`,{signal:controller.signal}).then(async(response)=>{const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Каталог временно недоступен.");setProducts((items)=>page===1?payload.products:[...items,...payload.products.filter((product:CatalogProduct)=>!items.some((item)=>item.id===product.id))]);setTotal(payload.total||0);setSubtypes(payload.subtypes||[]);}).catch((reason)=>{if(reason.name!=="AbortError")setError(reason.message||"Не удалось загрузить каталог.");}).finally(()=>setLoading(false));return()=>controller.abort();},[category,page,query,availableOnly,subtype,brands,retry]);
  const toggleBrand=(brand:"norrmobler"|"leve-home")=>setBrands((current)=>current.includes(brand)?current.filter((item)=>item!==brand):[...current,brand]);
  return <div className={`furniture-catalog furniture-catalog-products studio-bottom-catalog${fullscreen?" catalog-fullscreen":""}`}>
    <header className="studio-catalog-bar">
      <span className="studio-catalog-number">04</span>
      <div className="catalog-brand-filter" role="group" aria-label="Выбор бренда"><span>ВЫБОР БРЕНДА</span><div><button className={!brands.length?"active":""} type="button" onClick={()=>setBrands([])}>Все бренды</button><button className={brands.includes("norrmobler")?"active":""} type="button" onClick={()=>toggleBrand("norrmobler")}><i/>NORR Møbler</button><button className={brands.includes("leve-home")?"active":""} type="button" onClick={()=>toggleBrand("leve-home")}><i/>LEVE HOME</button></div></div>
      <div className="catalog-search"><input value={searchInput} onChange={(event)=>setSearchInput(event.target.value)} placeholder="Поиск по названию или артикулу"/><label><input type="checkbox" checked={availableOnly} onChange={(event)=>setAvailableOnly(event.target.checked)}/> В наличии</label></div>
      <nav aria-label="Категории мебели">{furnitureCatalogCategories.map((item)=><button key={item.type} className={category.type===item.type?"active":""} type="button" onClick={()=>{setCategory(item);setSubtype("");}}>{item.name}</button>)}</nav>
      <span className="studio-catalog-total">{loading?"Загрузка…":`${total} товаров`}</span>
      <div className="catalog-window-actions"><button type="button" onClick={()=>setFullscreen((value)=>!value)} aria-label={fullscreen?"Свернуть каталог":"Открыть каталог на весь экран"} title={fullscreen?"Свернуть":"На весь экран"}>{fullscreen?"↙":"⛶"}</button>{!persistent&&<button type="button" onClick={onClose} aria-label="Закрыть каталог">×</button>}</div>
    </header>
    {subtypes.length>1&&<div className="catalog-chips"><button className={!subtype?"active":""} type="button" onClick={()=>setSubtype("")}>Все</button>{subtypes.map((item)=><button key={item} className={subtype===item?"active":""} type="button" onClick={()=>setSubtype(item)}>{item}</button>)}</div>}
    {onUploadReference&&<input ref={referenceUpload} className="studio-catalog-reference-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>onUploadReference(event.target.files?.[0])}/>}
    <div className="furniture-catalog-grid" onScroll={(event)=>{const node=event.currentTarget;if(!loading&&products.length<total&&node.scrollLeft+node.clientWidth>=node.scrollWidth-160)setPage((value)=>value+1);}}>{onUploadReference&&<button className="furniture-catalog-card furniture-reference-upload-card" type="button" onClick={()=>referenceUpload.current?.click()}><span><strong>＋</strong><em>REF</em></span><b>{referenceLabel}</b><small>JPG, PNG или WEBP</small><strong>Свой предмет</strong></button>}{products.map((product)=>{const selected=selectedProductIds.includes(product.id);return <button className={selected?"furniture-catalog-card selected":"furniture-catalog-card"} type="button" key={product.id} aria-pressed={selected} onClick={()=>onSelect(product)}><span><img src={product.image} alt={product.name}/><em>{product.brand}</em>{selected&&<i className="catalog-selected-mark">✓</i>}</span><b>{product.name}</b><small>Арт. {product.article}</small>{product.price>0&&<strong>{new Intl.NumberFormat("ru-RU").format(product.price)} руб.</strong>}</button>})}{loading&&<div className="catalog-loading">Загружаем товары…</div>}{error&&<div className="catalog-error"><span>{error}</span><button type="button" onClick={()=>setRetry((value)=>value+1)}>Повторить</button></div>}</div>
    <footer><span>{footerMessage||selectionCount?footerMessage||`Выбрано для рендера: ${selectionCount}`:onUploadReference?"Поставьте точку, выберите режим и товар или загрузите референс.":"Выберите товар для отмеченного предмета."}</span>{onGenerate&&<button className="studio-catalog-generate" type="button" disabled={!canGenerate||isGenerating} onClick={onGenerate}>{isGenerating?"Создаём рендер…":"Создать рендер"}</button>}</footer>
  </div>;
}

function FurnitureChoice({action,onUpload,imageName,interiorImage,referenceName,setReferenceName,referenceImage,setReferenceImage,referenceDetails,setReferenceDetails,referenceSelected,setReferenceSelected,onGenerate,queuedEdits,onQueueCatalogProduct,onRemoveQueued,onGenerateQueued,placementPrompt,setPlacementPrompt,onAdjust,canAdjust,isGenerating,generationError,persistentCatalog=false,orbitAction=null,materialReference,onLoadMaterialReference,onGenerateMaterial,onRemoveAtPoint,canRemoveAtPoint=false,studioMaterials=[],activeStudioMaterialId="",onOpenStudioCatalog,onActivateStudioMaterial,onRemoveStudioMaterial}:{action:"add"|"replace"|"remove";onUpload:(file?:File)=>void;imageName:string;interiorImage:string;referenceName:string;setReferenceName:(value:string)=>void;referenceImage:string;setReferenceImage:(value:string)=>void;referenceDetails:FurnitureReferenceDetails;setReferenceDetails:(details:FurnitureReferenceDetails)=>void;referenceSelected:boolean;setReferenceSelected:(selected:boolean)=>void;onGenerate:(reference:string,details?:FurnitureReferenceDetails)=>void;queuedEdits:FurnitureEdit[];onQueueCatalogProduct:(product:CatalogProduct)=>boolean;onRemoveQueued:(id:string)=>void;onGenerateQueued:()=>void;placementPrompt:string;setPlacementPrompt:(value:string)=>void;onAdjust:()=>void;canAdjust:boolean;isGenerating:boolean;generationError:string;persistentCatalog?:boolean;orbitAction?:"add"|"replace"|"material"|"remove"|null;materialReference?:MaterialReference;onLoadMaterialReference?:(file?:File)=>void;onGenerateMaterial?:()=>void;onRemoveAtPoint?:()=>void;canRemoveAtPoint?:boolean;studioMaterials?:StudioMaterial[];activeStudioMaterialId?:string;onOpenStudioCatalog?:(trigger?:HTMLElement|null)=>void;onActivateStudioMaterial?:(product:CatalogProduct)=>void;onRemoveStudioMaterial?:(id:string)=>void}){
  const replacing=action==="replace";
  const referenceInput=useRef<HTMLInputElement>(null);
  const persistentCatalogEnabled=persistentCatalog;
  const [catalogOpen,setCatalogOpen]=useState(persistentCatalog);
  const previousOrbitAction=useRef(orbitAction);
  const referenceReady=Boolean(referenceImage)&&(["widthMm","depthMm","heightMm"] as const).every((key)=>Number(referenceDetails[key])>0);
  useEffect(()=>{if(persistentCatalog||replacing)setCatalogOpen(true);},[persistentCatalog,replacing]);
  useEffect(()=>{const openCatalog=()=>setCatalogOpen(true);window.addEventListener("room-open-furniture-catalog",openCatalog);return()=>window.removeEventListener("room-open-furniture-catalog",openCatalog);},[]);
  useEffect(()=>{if(previousOrbitAction.current!==orbitAction&&(orbitAction==="material"||orbitAction==="remove")){queuedEdits.forEach((item)=>onRemoveQueued(item.id));setReferenceSelected(false);}previousOrbitAction.current=orbitAction;},[orbitAction]);
  const loadReference=(file?:File)=>{queuedEdits.forEach((item)=>onRemoveQueued(item.id));setReferenceSelected(false);setReferenceName(file?.name||"");if(!file){setReferenceImage("");setReferenceDetails({name:"",description:"",widthMm:"",depthMm:"",heightMm:""});return;}setReferenceDetails({name:file.name.replace(/\.[^.]+$/,"")||"Пользовательский референс",description:"Пользовательский референс мебели",widthMm:"",depthMm:"",heightMm:""});const reader=new FileReader();reader.onload=()=>setReferenceImage(String(reader.result||""));reader.readAsDataURL(file);};
  const loadContextReference=(file?:File)=>orbitAction==="material"?onLoadMaterialReference?.(file):loadReference(file);
  const selectCatalogProduct=(product:CatalogProduct)=>{const selectedEdit=queuedEdits[0];if(selectedEdit?.product.id===product.id){onRemoveQueued(selectedEdit.id);return;}queuedEdits.forEach((item)=>onRemoveQueued(item.id));setReferenceSelected(false);void onQueueCatalogProduct(product);};
  const selectReference=()=>{if(referenceSelected){setReferenceSelected(false);return;}queuedEdits.forEach((item)=>onRemoveQueued(item.id));setReferenceSelected(true);};
  const runCatalogGeneration=()=>{if(!persistentCatalogEnabled)setCatalogOpen(false);if(orbitAction==="material"){onGenerateMaterial?.();return;}if(orbitAction==="remove"){window.dispatchEvent(new Event("room-confirm-remove"));return;}if(queuedEdits.length)onGenerateQueued();else if(referenceSelected)onGenerate(referenceImage,referenceDetails);else if(placementPrompt.trim())onAdjust();};
  const materialReady=Boolean(materialReference?.image);
  const instructionReady=Boolean(canAdjust&&placementPrompt.trim());
  const catalogCanGenerate=orbitAction==="material"?Boolean(canRemoveAtPoint&&materialReady):orbitAction==="remove"?canRemoveAtPoint:orbitAction==="add"||orbitAction==="replace"?Boolean(canRemoveAtPoint&&(queuedEdits.length||(referenceSelected&&referenceReady))):instructionReady;
  const catalogReferenceLabel=orbitAction==="material"?"Загрузить референс ткани":"Загрузить референс";
  const catalogFooterMessage=orbitAction==="material"?(materialReady?"Референс материала выбран. Можно создать рендер.":"Загрузите референс ткани, цвета или фактуры."):orbitAction==="remove"?"Нажмите «Создать рендер», чтобы удалить предмет под точкой.":undefined;
  const roomCanvas=typeof document==="undefined"?null:document.querySelector(".room-canvas");
  const renderButton=roomCanvas&&!isGenerating?createPortal(<button className="studio-canvas-render-button" type="button" disabled={!catalogCanGenerate} aria-disabled={!catalogCanGenerate} onClick={runCatalogGeneration}>Создать рендер</button>,roomCanvas):null;
  const renderError=roomCanvas&&generationError&&!isGenerating?createPortal(<p className="studio-canvas-generation-error" role="alert">{generationError}</p>,roomCanvas):null;
  if(persistentCatalogEnabled){
    const hasMaterials=Boolean(studioMaterials.length||referenceImage||materialReference?.image);
    const activeId=activeStudioMaterialId||queuedEdits[0]?.product.id||"";
    return <>{<div className={`studio-material-tray${hasMaterials?" has-materials":" is-empty"}`} aria-label="Материалы текущего проекта">
      <input ref={referenceInput} className="direct-reference-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>loadContextReference(event.target.files?.[0])}/>
      {!hasMaterials?<div className="studio-material-empty"><button type="button" onClick={()=>referenceInput.current?.click()}><span>＋</span><b>Загрузить референс</b><small>Свой предмет, ткань или фактура</small></button><button type="button" onClick={(event)=>onOpenStudioCatalog?.(event.currentTarget)}><span>⌕</span><b>Выбрать из каталога</b><small>NORR Møbler и LEVE HOME</small></button></div>:<><div className="studio-material-actions"><button type="button" onClick={()=>referenceInput.current?.click()}><span>＋</span><b>Референс</b></button><button type="button" onClick={(event)=>onOpenStudioCatalog?.(event.currentTarget)}><span>⌕</span><b>Каталог</b></button></div><div className="studio-material-list" role="list">{referenceImage&&<article className={referenceSelected?"studio-material-card active":"studio-material-card"} role="listitem"><button type="button" className="studio-material-select" aria-pressed={referenceSelected} onClick={selectReference}><img src={referenceImage} alt="Пользовательский референс"/><span><small>РЕФЕРЕНС</small><b>{referenceDetails.name||referenceName||"Свой предмет"}</b><em>{referenceReady?`${referenceDetails.widthMm} × ${referenceDetails.depthMm} × ${referenceDetails.heightMm} мм`:referenceSelected?"Укажите габариты слева":"Нажмите, чтобы выбрать"}</em></span></button><button type="button" className="studio-material-remove" aria-label="Удалить референс" onClick={()=>loadReference()}>×</button></article>}{materialReference?.image&&<article className="studio-material-card active" role="listitem"><img src={materialReference.image} alt="Референс материала"/><span><small>МАТЕРИАЛ</small><b>{materialReference.name||"Ткань или фактура"}</b><em>Без обязательных размеров</em></span></article>}{studioMaterials.map((item)=><article key={item.id} className={activeId===item.product.id?"studio-material-card active":"studio-material-card"} role="listitem"><button type="button" className="studio-material-select" aria-pressed={activeId===item.product.id} onClick={()=>onActivateStudioMaterial?.(item.product)}><img src={item.product.image} alt={item.product.name}/><span><small>{item.product.brand}</small><b>{item.product.name}</b><em>{item.product.article?`Арт. ${item.product.article}`:"Артикул не указан"}{item.product.widthMm?` · ${item.product.widthMm} × ${item.product.depthMm||"—"} × ${item.product.heightMm||"—"} мм`:""}</em></span></button><button type="button" className="studio-material-remove" aria-label={`Удалить ${item.product.name}`} onClick={()=>onRemoveStudioMaterial?.(item.id)}>×</button></article>)}</div></>}
      <footer><span>{hasMaterials?"Материалы, выбранные для этого проекта":"Добавьте первый материал — каталог не запускает генерацию автоматически"}</span></footer>
    </div>}{renderButton}{renderError}</>;
  }
  if(catalogOpen)return <>{<div className="panel-content furniture-choice furniture-catalog-panel"><FurnitureCatalogPicker onSelect={selectCatalogProduct} onClose={()=>{if(!persistentCatalogEnabled)setCatalogOpen(false);}} onUploadReference={orbitAction==="remove"?undefined:loadContextReference} referenceLabel={catalogReferenceLabel} footerMessage={catalogFooterMessage} canGenerate={catalogCanGenerate} isGenerating={isGenerating} selectionCount={orbitAction==="material"?(materialReady?1:0):queuedEdits.length+(referenceReady?1:0)} selectedProductIds={queuedEdits.map((item)=>item.product.id)} persistent={persistentCatalogEnabled}/></div>}{renderButton}{renderError}</>;
  return <div className="panel-content furniture-choice"><p className="choice-intro">{replacing?"Поставьте точку в центре предмета, который хотите заменить.":"Поставьте точку на изображении, куда хотите установить предмет."}</p><label className={interiorImage?"upload-zone upload-zone-loaded":"upload-zone"}><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>onUpload(event.target.files?.[0])}/>{interiorImage?<span className="reference-preview upload-preview"><img src={interiorImage} alt="Загруженный интерьер"/><i><em>↥</em>Загрузить интерьер</i></span>:<><em>↥</em><b>Загрузите интерьер</b></>}</label><input ref={referenceInput} className="direct-reference-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>loadReference(event.target.files?.[0])}/><div className="furniture-source-actions"><button type="button" className="furniture-option" onClick={()=>referenceInput.current?.click()}><em>↥</em><span><b>Загрузить референс</b></span></button><button type="button" className="furniture-option catalog-option" onClick={()=>setCatalogOpen(true)}><em>⌑</em><span><b>Добавить из каталога</b></span></button></div>{referenceImage&&<div className="reference-preview upload-preview reference-upload-preview"><img src={referenceImage} alt="Выбранный предмет мебели"/><span><b>{referenceName||"Референс"}</b><i>Референс загружен</i></span></div>}{queuedEdits.length>0&&<div className="furniture-edit-queue"><div><b>Выбрано для генерации</b><span>{queuedEdits.length}/5</span></div>{queuedEdits.map((item,index)=><div className="furniture-edit-row" key={item.id}><i>{index+1}</i><span><b>{item.referenceName}</b><small>{item.action==="replace"?"Замена":"Добавление"}</small></span><button type="button" onClick={()=>onRemoveQueued(item.id)} aria-label={`Удалить ${item.referenceName}`}>×</button></div>)}</div>}<button className="generate reference-action" onClick={()=>queuedEdits.length?onGenerateQueued():onGenerate(referenceImage,referenceDetails)} disabled={(!referenceReady&&!queuedEdits.length)||isGenerating}>{isGenerating?"Создаём интерьер…":<>Создать интерьер<span>→</span></>}</button>{canAdjust&&<div className="panel-section"><label>ЧТО ИЗМЕНИТЬ?</label><textarea value={placementPrompt} onChange={(event)=>setPlacementPrompt(event.target.value)} placeholder="Например: сделай кресло зелёным, убери торшер или добавь человека в кресло"/><button className="generate" onClick={onAdjust} disabled={isGenerating||!placementPrompt.trim()}>{isGenerating?"Применяем изменения…":"Применить изменения"}</button><p className="hint">Инструкция применяется ко всему текущему изображению. После результата можно продолжить редактирование.</p></div>}{generationError&&<p className="panel-error">{generationError}</p>}</div>;
}
function ProductPanel({selected,setSelected,onGenerate,onBack}:{selected:string;setSelected:(p:string)=>void;onGenerate:()=>void;onBack:()=>void}){return <div className="panel-content products"><button className="panel-back" onClick={onBack}>← Способ добавления</button><div className="search">⌕ <input placeholder="Найти в каталоге"/></div><div className="categories"><button className="selected">Все</button><button>Диваны</button><button>Кресла</button><button>Столы</button></div><div className="product-list">{products.map(p=><button className={selected===p.name?"product-card selected":"product-card"} key={p.name} onClick={()=>setSelected(p.name)}><img src={p.image} alt=""/><div><b>{p.name}</b><span>{p.type}</span><strong>{p.price}</strong></div>{selected===p.name&&<em>✓</em>}</button>)}</div><button className="generate" onClick={onGenerate}>Разместить в комнате <span>→</span></button></div>}
function ReferencePanel({action,referenceName,setReferenceName,referenceImage,setReferenceImage,onGenerate,onBack,isGenerating,generationError}:{action:"add"|"replace";referenceName:string;setReferenceName:(v:string)=>void;referenceImage:string;setReferenceImage:(v:string)=>void;onGenerate:(reference:string)=>void;onBack:()=>void;isGenerating:boolean;generationError:string}){const replacing=action==="replace";const loadReference=(file?:File)=>{setReferenceName(file?.name || ""); if (!file) return setReferenceImage(""); const reader=new FileReader(); reader.onload=()=>setReferenceImage(String(reader.result || "")); reader.readAsDataURL(file);}; return <div className="panel-content reference-panel"><button className="panel-back" onClick={onBack}>← Назад</button><p className="choice-intro">{replacing?"Загрузите фото новой мебели. ИИ заменит только предмет в отмеченной точке, сохранив остальной интерьер.":"Загрузите фотографию предмета — ИИ добавит именно его в текущую визуализацию, сохранив масштаб, свет и перспективу комнаты."}</p><label className="upload-zone"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>loadReference(e.target.files?.[0])}/><em>↥</em><b>{referenceName || "Выберите изображение"}</b><small>{referenceImage ? replacing?"Референс готов к замене":"Референс готов к добавлению" : "JPG, PNG или WEBP"}</small>{referenceImage&&<span className="reference-preview"><img src={referenceImage} alt="Загруженный референс мебели"/><i>Референс готов</i></span>}</label><button className="generate" onClick={()=>onGenerate(referenceImage)} disabled={!referenceImage || isGenerating}>{isGenerating ? replacing?"Заменяем…":"Размещаем…" : <>{replacing?"Заменить предмет":"Разместить референс"} <span>→</span></>}</button>{generationError && <p className="generation-error" role="alert">{generationError}</p>}</div>}


const planTemplates: Array<Pick<PlanItem,"kind"|"name"|"width"|"depth">> = [
  { kind:"sofa", name:"Диван", width:2200, depth:950 }, { kind:"table", name:"Стол обеденный", width:1600, depth:900 },
  { kind:"table", name:"Стол журнальный", width:1100, depth:650 }, { kind:"table", name:"Стол письменный и туалетный", width:1200, depth:600 },
  { kind:"chair", name:"Кресло", width:800, depth:800 }, { kind:"stool", name:"Стул", width:480, depth:480 }, { kind:"stool", name:"Пуф", width:600, depth:600 },
  { kind:"rug", name:"Ковер", width:2000, depth:1400 }, { kind:"bed", name:"Кровать", width:2000, depth:1600 },
  { kind:"cabinet", name:"Шкаф", width:1100, depth:550 }, { kind:"cabinet", name:"Стеллаж", width:1200, depth:400 }, { kind:"lamp", name:"Светильник", width:400, depth:400 },
  { kind:"decor", name:"Декор для дома", width:500, depth:300 },
  { kind:"plant", name:"Растение", width:550, depth:550 }, { kind:"dresser", name:"Комод", width:1200, depth:450 }, { kind:"nightstand", name:"Прикроватная тумба", width:500, depth:400 }, { kind:"tv_stand", name:"TV-тумба", width:1600, depth:450 },
];

type PlanogramWorkspaceProps = {items:PlanItem[];room:{width:number;length:number};selectedId:string|null;onSelect:(id:string|null)=>void;onChange:(items:PlanItem[])=>void;onRoomChange:(room:{width:number;length:number})=>void;floorReference:PlanSurfaceReference|null;wallReference:PlanSurfaceReference|null;onFloorReferenceChange:(reference:PlanSurfaceReference|null)=>void;onWallReferenceChange:(reference:PlanSurfaceReference|null)=>void;camera:PlanCamera|null;onCameraChange:(camera:PlanCamera|null)=>void;onCreateReference:(planImage:string,prompt:string,surfaceReferences:string[])=>void;isCreatingReference:boolean};

function PlanogramWorkspace(props:PlanogramWorkspaceProps){
  const hostRef=useRef<HTMLDivElement>(null);
  const [board,setBoard]=useState<HTMLElement|null>(null);
  const [panel,setPanel]=useState<HTMLElement|null>(null);
  const camera=props.camera;
  const [draggingCamera,setDraggingCamera]=useState(false);
  const cameraRef=useRef<PlanCamera|null>(camera);
  const setCamera=(next:PlanCamera|null)=>{cameraRef.current=next;props.onCameraChange(next);};
  useEffect(()=>{cameraRef.current=camera;},[camera]);
  useEffect(()=>{const timer=window.setTimeout(()=>{setBoard(hostRef.current?.querySelector<HTMLElement>(".planogram-editor-board")||null);setPanel(document.querySelector<HTMLElement>(".planogram-panel"));},0);return()=>window.clearTimeout(timer);},[]);
  const placeCamera=(clientX:number,clientY:number)=>{if(!board)return;const rect=board.getBoundingClientRect();const x=Math.max(1,Math.min(99,(clientX-rect.left)/rect.width*100));const y=Math.max(1,Math.min(99,(clientY-rect.top)/rect.height*100));const rotation=Math.atan2(50-y,50-x)*180/Math.PI;setCamera({x,y,height:cameraRef.current?.height||1500,rotation});};
  const cameraBrief=()=>{const current=cameraRef.current;if(!current)return "";const xMm=Math.round(props.room.width*current.x/100);const yMm=Math.round(props.room.length*current.y/100);return `\nКАМЕРА ОБЯЗАТЕЛЬНА: установи виртуальную камеру в точке ${xMm} мм от левого края и ${yMm} мм от верхнего края плана, на высоте ${current.height} мм от пола. Направь объектив из этой точки к центру комнаты (азимут ${Math.round(current.rotation)}°). Сформируй кадр именно от первого лица этой камеры; не показывай камеру на визуализации и не выбирай другой ракурс.`;};
  const enhancedCreate=(planImage:string,prompt:string,surfaceReferences:string[])=>{const current=cameraRef.current;if(!current){props.onCreateReference(planImage,prompt,surfaceReferences);return;}const image=new Image();image.onload=()=>{const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext("2d");if(!context){props.onCreateReference(planImage,prompt+cameraBrief(),surfaceReferences);return;}context.drawImage(image,0,0);const x=canvas.width*current.x/100,y=canvas.height*current.y/100,angle=current.rotation*Math.PI/180;context.save();context.translate(x,y);context.rotate(angle);context.fillStyle="rgba(194,104,29,.24)";context.beginPath();context.moveTo(18,0);context.lineTo(160,-72);context.lineTo(160,72);context.closePath();context.fill();context.fillStyle="#c2681d";context.strokeStyle="#ffffff";context.lineWidth=7;context.fillRect(-28,-20,56,40);context.strokeRect(-28,-20,56,40);context.fillStyle="#ffffff";context.beginPath();context.arc(0,0,9,0,Math.PI*2);context.fill();context.restore();props.onCreateReference(canvas.toDataURL("image/png"),prompt+cameraBrief(),surfaceReferences);};image.onerror=()=>props.onCreateReference(planImage,prompt+cameraBrief(),surfaceReferences);image.src=planImage;};
  return <div ref={hostRef} className="planogram-camera-host" onDoubleClickCapture={(event)=>{const target=event.target as HTMLElement;if(target.closest(".planogram-furniture,.room-resize-handle,.plan-camera-marker"))return;const boardTarget=target.closest(".planogram-editor-board");if(boardTarget)placeCamera(event.clientX,event.clientY);}}><PlanogramWorkspaceBase {...props} onCreateReference={enhancedCreate}/>{board&&camera&&createPortal(<button type="button" draggable={false} className="plan-camera-marker" aria-label="Камера на плане. Перетащите, чтобы изменить ракурс." title="Камера — перетащите в нужную точку" style={{left:`${camera.x}%`,top:`${camera.y}%`,transform:`translate(-50%,-50%) rotate(${camera.rotation}deg)`}} onDragStart={(event)=>event.preventDefault()} onPointerDown={(event)=>{if(event.pointerType==="mouse"&&event.button!==0)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);setDraggingCamera(true);}} onPointerMove={(event)=>{if(!draggingCamera)return;event.preventDefault();event.stopPropagation();placeCamera(event.clientX,event.clientY);}} onPointerUp={(event)=>{event.stopPropagation();setDraggingCamera(false);}} onPointerCancel={()=>setDraggingCamera(false)}><i className="plan-camera-fov" aria-hidden="true"/><span/></button>,board)}{panel&&createPortal(<div className="plan-camera-settings"><label>КАМЕРА</label>{camera?<><div className="plan-camera-summary"><i/><span><b>Ракурс установлен</b><small>{Math.round(props.room.width*camera.x/100)} × {Math.round(props.room.length*camera.y/100)} мм · {Math.round(camera.rotation)}°</small></span></div><label className="plan-camera-height">ВЫСОТА ОТ ПОЛА, ММ<input type="number" min="300" max="3000" step="50" value={camera.height} onChange={(event)=>{const height=Math.max(300,Math.min(3000,Math.round(Number(event.target.value)||1500)));setCamera({...camera,height});}}/></label><small>Перетащите камеру по плану. Конус показывает направление кадра к центру комнаты.</small><button type="button" className="plan-camera-remove" onClick={()=>setCamera(null)}>Убрать камеру</button></>:<p>Дважды кликните по свободному месту планограммы, чтобы установить камеру.</p>}</div>,panel)}</div>;
}

function PlanogramWorkspaceBase({items,room,selectedId,onSelect,onChange,onRoomChange,floorReference,wallReference,onFloorReferenceChange,onWallReferenceChange,onCreateReference,isCreatingReference}:PlanogramWorkspaceProps){
  const [dragging,setDragging]=useState<string|null>(null); const [resizing,setResizing]=useState<{id:string;handle:"n"|"ne"|"e"|"se"|"s"|"sw"|"w"|"nw";x:number;y:number;item:PlanItem}|null>(null); const [rotating,setRotating]=useState<{id:string;centerX:number;centerY:number;startAngle:number;startRotation:number}|null>(null); const [editingId,setEditingId]=useState<string|null>(null); const [zoom,setZoom]=useState(100); const [menu,setMenu]=useState<string|null>(null); const [roomResize,setRoomResize]=useState<{mode:"width"|"length";x:number;y:number;width:number;length:number}|null>(null); const fileRef=useRef<HTMLInputElement>(null); const floorRef=useRef<HTMLInputElement>(null); const wallRef=useRef<HTMLInputElement>(null);
  const planClipboardRef=useRef<PlanItem|null>(null); const pasteIndexRef=useRef(0);
  useEffect(()=>{const openFloor=()=>floorRef.current?.click(),openWall=()=>wallRef.current?.click();window.addEventListener("room-plan-floor-reference",openFloor);window.addEventListener("room-plan-wall-reference",openWall);return()=>{window.removeEventListener("room-plan-floor-reference",openFloor);window.removeEventListener("room-plan-wall-reference",openWall);};},[]);
  useEffect(()=>{const handlePlanogramClipboard=(event:KeyboardEvent)=>{if(!(event.ctrlKey||event.metaKey)||event.altKey||isEditablePlanogramShortcutTarget(event.target))return;const key=event.key.toLowerCase();if(key==="c"){const selected=items.find((item)=>item.id===selectedId);if(!selected)return;planClipboardRef.current=structuredClone(selected);pasteIndexRef.current=0;event.preventDefault();return;}if(key!=="v"||!planClipboardRef.current)return;pasteIndexRef.current+=1;const clone=clonePlanogramItem(planClipboardRef.current,crypto.randomUUID(),pasteIndexRef.current);onChange([...items,clone]);onSelect(clone.id);setEditingId(null);setMenu(null);event.preventDefault();};window.addEventListener("keydown",handlePlanogramClipboard);return()=>window.removeEventListener("keydown",handlePlanogramClipboard);},[items,onChange,onSelect,selectedId]);
  useEffect(()=>{const selectCatalogProduct=(event:Event)=>{const detail=(event as CustomEvent<{index:number;product:CatalogProduct}>).detail;const item=items[detail?.index];const product=detail?.product;if(!item||!product)return;onChange(items.map((current)=>{if(current.id!==item.id)return current;const updated={...current,name:product.name,width:product.widthMm||current.width,depth:product.depthMm||current.depth,referenceImage:product.image,referenceImages:product.images,referenceName:product.name,referenceProductId:product.id,referenceArticle:product.article,referenceBrand:product.brand,referenceCatalogSource:product.source,referenceUrl:product.url,referencePrice:product.price,referenceOldPrice:product.oldPrice,referenceCategory:product.category,referenceSubtype:product.subtype,referenceColor:product.color,referenceMaterial:product.material,referenceHeightMm:product.heightMm,referenceDescription:product.description,referenceParameters:product.parameters};return clampPlanogramItemToRoom(updated,room); }));onSelect(item.id);};window.addEventListener("room-plan-catalog-select",selectCatalogProduct);return()=>window.removeEventListener("room-plan-catalog-select",selectCatalogProduct);},[items,onChange,onSelect,room]);
  const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
  const itemWidth=(item:PlanItem)=>planogramItemSizePercent(item,room).width; const itemDepth=(item:PlanItem)=>planogramItemSizePercent(item,room).depth;
  const liveMeasurements=useMemo(()=>{if(!dragging)return null;const moving=items.find((item)=>item.id===dragging);if(!moving)return null;const box=(item:PlanItem)=>{const geometry=planogramItemPositionBounds(item,room),extraX=(geometry.boundingWidth-geometry.width)/2,extraY=(geometry.boundingDepth-geometry.depth)/2,left=item.x-extraX,top=item.y-extraY,right=item.x+geometry.width+extraX,bottom=item.y+geometry.depth+extraY;return{item,left,top,right,bottom,cx:(left+right)/2,cy:(top+bottom)/2};};const current=box(moving),wall={left:Math.max(0,Math.round(current.left/100*room.width)),right:Math.max(0,Math.round((100-current.right)/100*room.width)),top:Math.max(0,Math.round(current.top/100*room.length)),bottom:Math.max(0,Math.round((100-current.bottom)/100*room.length))};const relatives=items.filter((item)=>item.id!==moving.id).map((item)=>{const target=box(item),dx=target.cx-current.cx,dy=target.cy-current.cy,horizontal=Math.abs(dx)>=Math.abs(dy),from=horizontal?{x:dx>=0?current.right:current.left,y:current.cy}:{x:current.cx,y:dy>=0?current.bottom:current.top},to=horizontal?{x:dx>=0?target.left:target.right,y:target.cy}:{x:target.cx,y:dy>=0?target.top:target.bottom},distance=Math.round(Math.hypot((to.x-from.x)/100*room.width,(to.y-from.y)/100*room.length));return{itemId:item.id,label:item.name,from,to,distance};}).sort((a,b)=>a.distance-b.distance).slice(0,3);return{current,wall,relatives};},[dragging,items,room]);
  useEffect(()=>{const clamped=items.map((item)=>clampPlanogramItemToRoom(item,room));if(clamped.some((item,index)=>Math.abs(item.x-items[index].x)>.0001||Math.abs(item.y-items[index].y)>.0001))onChange(clamped);},[items,onChange,room]);
  const move=(event:React.PointerEvent<HTMLDivElement>)=>{const rect=event.currentTarget.getBoundingClientRect();const x=(event.clientX-rect.left)/rect.width*100;const y=(event.clientY-rect.top)/rect.height*100;if(rotating){const angle=Math.atan2(event.clientY-rotating.centerY,event.clientX-rotating.centerX)*180/Math.PI;const rotation=Math.round((rotating.startRotation+angle-rotating.startAngle+360)%360);onChange(items.map((current)=>current.id===rotating.id?clampPlanogramItemToRoom({...current,rotation},room):current));return;}if(roomResize){const delta=roomResize.mode==="width"?(event.clientX-roomResize.x)/(rect.width/roomResize.width):(event.clientY-roomResize.y)/(rect.height/roomResize.length);onRoomChange(roomResize.mode==="width"?{...room,width:Math.round(clamp(roomResize.width+delta,2500,14000))}:{...room,length:Math.round(clamp(roomResize.length+delta,2200,11000))});return;}if(resizing){const start=resizing.item;const dx=(event.clientX-resizing.x)/rect.width*room.width;const dy=(event.clientY-resizing.y)/rect.height*room.length;const left=resizing.handle.includes("w"),right=resizing.handle.includes("e"),top=resizing.handle.includes("n"),bottom=resizing.handle.includes("s");let width=start.width+(right?dx:0)-(left?dx:0),depth=start.depth+(bottom?dy:0)-(top?dy:0),itemX=start.x+(left?dx/room.width*100:0),itemY=start.y+(top?dy/room.length*100:0);if(width<200){if(left)itemX-=((200-width)/room.width*100);width=200;}if(depth<200){if(top)itemY-=((200-depth)/room.length*100);depth=200;}const resized=clampPlanogramItemToRoom({...start,x:itemX,y:itemY,width:Math.round(width),depth:Math.round(depth)},room);onChange(items.map((current)=>current.id===start.id?resized:current));return;}if(dragging){const item=items.find((current)=>current.id===dragging);if(!item)return;const size=planogramItemSizePercent(item,room);const moved=clampPlanogramItemToRoom({...item,x:x-size.width/2,y:y-size.depth/2},room);onChange(items.map((current)=>current.id===item.id?moved:current));}};
  const stop=()=>{setDragging(null);setResizing(null);setRotating(null);setRoomResize(null);};
  const exportPlan=()=>window.dispatchEvent(new Event("room-save-project"));
  const downloadPdf=()=>{const printable=`<!doctype html><html><head><meta charset="utf-8"><title>Создание интерьера ROOM design</title><style>body{font-family:Arial,sans-serif;padding:36px;color:#2b1d14}h1{margin:0 0 8px}p{color:#6e594a}.room{position:relative;width:760px;max-width:100%;aspect-ratio:${room.width}/${room.length};margin:42px 0;border:3px solid #2b1d14;background:#fffdf9;background-image:linear-gradient(#e8e2d5 1px,transparent 1px),linear-gradient(90deg,#e8e2d5 1px,transparent 1px);background-size:24px 24px}.item{position:absolute;display:grid;place-items:center;border:2px solid #6e594a;background:#efe6d8;font-size:12px;font-weight:700}.table,.rug,.chair,.stool{border-radius:50%}.rug.rug-rectangular{border-radius:4px}.sofa{border-radius:12px}</style></head><body><h1>Создание интерьера</h1><p>Размер помещения: ${room.width} × ${room.length} мм</p><div class="room">${items.map((item)=>`<div class="item ${item.kind}${item.kind==="rug"&&item.rugShape==="rectangular"?" rug-rectangular":""}" style="left:${item.x}%;top:${item.y}%;width:${itemWidth(item)}%;height:${itemDepth(item)}%;transform:rotate(${item.rotation}deg)">${item.name}<br><small>${item.width} × ${item.depth} мм</small></div>`).join("")}</div><script>print()</script></body></html>`;const win=window.open("","_blank","noopener,noreferrer");if(!win){setMenu(null);return;}win.document.write(printable);win.document.close();};
  const createReference=()=>{const canvas=document.createElement("canvas");canvas.width=1600;canvas.height=Math.round(1600*room.length/room.width);const context=canvas.getContext("2d");if(!context)return;context.fillStyle="#f7f2ea";context.fillRect(0,0,canvas.width,canvas.height);context.strokeStyle="#d9cfc2";context.lineWidth=2;for(let x=0;x<canvas.width;x+=60){context.beginPath();context.moveTo(x,0);context.lineTo(x,canvas.height);context.stroke();}for(let y=0;y<canvas.height;y+=60){context.beginPath();context.moveTo(0,y);context.lineTo(canvas.width,y);context.stroke();}context.strokeStyle="#2b1d14";context.lineWidth=8;context.strokeRect(4,4,canvas.width-8,canvas.height-8);items.forEach((item)=>{const x=canvas.width*item.x/100,y=canvas.height*item.y/100,w=canvas.width*itemWidth(item)/100,h=canvas.height*itemDepth(item)/100;context.save();context.translate(x+w/2,y+h/2);context.rotate(item.rotation*Math.PI/180);context.fillStyle=item.kind==="window"?"#cbe2e5":item.kind==="door"?"#d1ae8e":item.kind==="rug"?"#cbb69d":item.kind==="table"?"#dec8ad":"#e6ddd0";context.strokeStyle=item.kind==="window"?"#5d9198":item.kind==="door"?"#76513b":"#5c3d2e";context.lineWidth=4;if(["table","chair","stool"].includes(item.kind)||(item.kind==="rug"&&item.rugShape!=="rectangular")){context.beginPath();context.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);context.fill();context.stroke();}else{context.fillRect(-w/2,-h/2,w,h);context.strokeRect(-w/2,-h/2,w,h);}context.fillStyle="#2b1d14";context.font="600 26px Arial";context.textAlign="center";context.fillText(item.name,0,8);context.restore();});const structural=items.filter((item)=>item.kind==="window"||item.kind==="door");const furnishing=items.filter((item)=>item.kind!=="window"&&item.kind!=="door");const prompt=`Создай фотореалистичную визуализацию интерьера строго по приложенной планограмме. Помещение ${room.width} × ${room.length} мм. Расставь предметы в соответствии с их положением, габаритами в миллиметрах и поворотом: ${furnishing.map((item)=>`${item.name} ${item.width}×${item.depth} мм${item.kind==="rug"?`, форма ${item.rugShape==="rectangular"?"прямоугольная":"круглая или овальная"}`:""}, позиция ${Math.round(item.x)}%/${Math.round(item.y)}%, поворот ${item.rotation}°${item.referenceName?`, используй приложенный референс «${item.referenceName}»`:""}`).join("; ")||"мебель не задана"}. ${structural.length?`ОБЯЗАТЕЛЬНО используй вручную заданные конструктивные элементы строго в указанных местах: ${structural.map((item)=>`${item.name} ${item.width}×${item.depth} мм, позиция ${Math.round(item.x)}%/${Math.round(item.y)}%, поворот ${item.rotation}°`).join("; ")}. Не перемещай и не заменяй их.`:"Окна и дверь на плане не заданы: выбери их расположение, вид и размеры самостоятельно, как лучше для композиции."} ${floorReference?"Используй приложенный референс пола только как обязательный источник цвета и фактуры пола; не меняй его на другой материал.":"Референс пола не задан: самостоятельно выбери материал, цвет и фактуру пола, которые подходят интерьеру."} ${wallReference?"Используй приложенный референс стен только как обязательный источник цвета и фактуры стен; не меняй его на другую отделку.":"Референс стен не задан: самостоятельно выбери цвет и фактуру стен, которые подходят интерьеру."} Сохрани масштаб, свободные проходы и логику планировки. Если приложены фотографии мебели, воспроизведи именно эти предметы. Без текста, логотипов и водяных знаков.`;onCreateReference(canvas.toDataURL("image/png"),prompt,[floorReference?.image,wallReference?.image].filter((image):image is string=>Boolean(image)));};
  const attachReference=(event:React.ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];const id=menu;if(!file||!id)return;const reader=new FileReader();reader.onload=()=>{onChange(items.map((item)=>item.id===id?{...item,referenceImage:String(reader.result||""),referenceName:file.name}:item));setMenu(null);};reader.readAsDataURL(file);event.target.value="";};
  const attachSurfaceReference=(event:React.ChangeEvent<HTMLInputElement>,kind:"floor"|"wall")=>{const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{const reference={image:String(reader.result||""),name:file.name};if(kind==="floor")onFloorReferenceChange(reference);else onWallReferenceChange(reference);};reader.readAsDataURL(file);event.target.value="";};
  const handles:["n"|"ne"|"e"|"se"|"s"|"sw"|"w"|"nw",string][]=[["n","top"],["ne","top-right"],["e","right"],["se","bottom-right"],["s","bottom"],["sw","bottom-left"],["w","left"],["nw","top-left"]];
  return <section className="planogram-workspace" aria-label="Создание интерьера"><header className="planogram-toolbar"><div><span>СОЗДАНИЕ ИНТЕРЬЕРА</span><b>Гостиная · вид сверху</b></div><div className="planogram-toolbar-actions"><button onClick={()=>setZoom(Math.max(70,zoom-10))}>−</button><em>{zoom}%</em><button onClick={()=>setZoom(Math.min(130,zoom+10))}>+</button><button className="project-save-control plan-save" onClick={exportPlan}>Сохранить проект</button></div></header><div className="planogram-editor-scroll"><div className="planogram-editor-board planogram-dimensioned-board" style={{transform:`scale(${zoom/100})`,aspectRatio:`${room.width}/${room.length}`}} onPointerMove={move} onPointerUp={stop} onPointerLeave={stop} onPointerDown={(event)=>{if(!(event.target as HTMLElement).closest(".planogram-furniture,.room-resize-handle,.studio-canvas-render-button")){onSelect(null);setEditingId(null);setMenu(null);setRotating(null);}}}><svg className="planogram-technical-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="planogram-minor-grid" width={10000/room.width} height={10000/room.length} patternUnits="userSpaceOnUse"><path d={`M ${10000/room.width} 0 L 0 0 0 ${10000/room.length}`} fill="none" stroke="#e4ded8" strokeWidth=".14"/></pattern><pattern id="planogram-major-grid" width={50000/room.width} height={50000/room.length} patternUnits="userSpaceOnUse"><path d={`M ${50000/room.width} 0 L 0 0 0 ${50000/room.length}`} fill="none" stroke="#cfc6bf" strokeWidth=".22"/></pattern></defs><rect width="100" height="100" fill="url(#planogram-minor-grid)"/><rect width="100" height="100" fill="url(#planogram-major-grid)"/></svg><span className="room-measure room-width">{room.width} мм</span><span className="room-measure room-length">{room.length} мм</span><button className="room-resize-handle room-resize-width" aria-label="Изменить ширину комнаты" onPointerDown={(event)=>{event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);setRoomResize({mode:"width",x:event.clientX,y:event.clientY,width:room.width,length:room.length});}}/><button className="room-resize-handle room-resize-length" aria-label="Изменить длину комнаты" onPointerDown={(event)=>{event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);setRoomResize({mode:"length",x:event.clientX,y:event.clientY,width:room.width,length:room.length});}}/>{liveMeasurements&&<><div className="planogram-live-measurements" aria-live="polite"><i className="left" style={{left:0,top:`${liveMeasurements.current.cy}%`,width:`${liveMeasurements.current.left}%`}}/><i className="right" style={{left:`${liveMeasurements.current.right}%`,top:`${liveMeasurements.current.cy}%`,width:`${100-liveMeasurements.current.right}%`}}/><i className="top" style={{left:`${liveMeasurements.current.cx}%`,top:0,height:`${liveMeasurements.current.top}%`}}/><i className="bottom" style={{left:`${liveMeasurements.current.cx}%`,top:`${liveMeasurements.current.bottom}%`,height:`${100-liveMeasurements.current.bottom}%`}}/><span className="left" style={{left:`${liveMeasurements.current.left/2}%`,top:`${liveMeasurements.current.cy}%`}}>{liveMeasurements.wall.left} мм</span><span className="right" style={{left:`${(liveMeasurements.current.right+100)/2}%`,top:`${liveMeasurements.current.cy}%`}}>{liveMeasurements.wall.right} мм</span><span className="top" style={{left:`${liveMeasurements.current.cx}%`,top:`${liveMeasurements.current.top/2}%`}}>{liveMeasurements.wall.top} мм</span><span className="bottom" style={{left:`${liveMeasurements.current.cx}%`,top:`${(liveMeasurements.current.bottom+100)/2}%`}}>{liveMeasurements.wall.bottom} мм</span></div><svg className="planogram-relative-measurements" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{liveMeasurements.relatives.map((measurement)=><g key={measurement.itemId}><line x1={measurement.from.x} y1={measurement.from.y} x2={measurement.to.x} y2={measurement.to.y}/><circle cx={measurement.to.x} cy={measurement.to.y} r=".7"/><text x={(measurement.from.x+measurement.to.x)/2} y={(measurement.from.y+measurement.to.y)/2-1.2}>{measurement.label} · {measurement.distance} мм</text></g>)}</svg></>}{items.map((item)=>{const selected=item.id===selectedId;const editing=item.id===editingId;const width=itemWidth(item),depth=itemDepth(item);const architectural=item.kind==="window"||item.kind==="door";return <div key={item.id} draggable={false} className={`planogram-furniture ${item.kind}${item.kind==="rug"&&item.rugShape==="rectangular"?" rug-rectangular":""}${selected?" selected":""}${editing?" editing":""}`} role="button" tabIndex={0} style={{left:`${item.x}%`,top:`${item.y}%`,width:`${width}%`,height:`${depth}%`,transform:`rotate(${item.rotation}deg)`}} onDragStart={(event)=>event.preventDefault()} onDoubleClick={(event)=>{event.stopPropagation();onSelect(item.id);setEditingId(item.id);setMenu(null);}} onContextMenu={(event)=>{event.preventDefault();event.stopPropagation();onSelect(item.id);setEditingId(null);setMenu(menu===item.id?null:item.id);}} onPointerDown={(event)=>{if((event.target as HTMLElement).closest(".plan-resize-handle,.plan-inline-rotate,.plan-context-menu"))return;if(event.pointerType==="mouse"){if(event.button!==0)return;event.preventDefault();}event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);onSelect(item.id);setEditingId(null);setMenu(null);setDragging(item.id);}} aria-label={`${item.name}: перемещать. Два клика — размеры.`}><i/><span>{item.name}</span>{editing&&<small className="plan-item-size">{item.width} × {item.depth} мм</small>}{editing&&<button type="button" className="plan-inline-rotate" aria-label="Повернуть предмет" title="Зажмите и вращайте" onPointerDown={(event)=>{event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);const rect=event.currentTarget.parentElement!.getBoundingClientRect();const centerX=rect.left+rect.width/2,centerY=rect.top+rect.height/2;setDragging(null);setResizing(null);setRotating({id:item.id,centerX,centerY,startAngle:Math.atan2(event.clientY-centerY,event.clientX-centerX)*180/Math.PI,startRotation:item.rotation});}}>↻</button>}{editing&&handles.map(([handle,position])=><button key={handle} className={`plan-resize-handle ${position}`} aria-label={`Изменить размер: ${item.name}`} onPointerDown={(event)=>{event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);setResizing({id:item.id,handle,x:event.clientX,y:event.clientY,item});}}/>)}{menu===item.id&&!architectural&&<div className="plan-context-menu"><b>{item.name}</b><button type="button" onClick={(event)=>{event.stopPropagation();fileRef.current?.click();}}>Загрузить референс</button>{item.referenceImage&&<button type="button" className="danger" onClick={(event)=>{event.stopPropagation();onChange(items.map((current)=>current.id===item.id?{...current,referenceImage:"",referenceName:""}:current));setMenu(null);}}>Убрать референс</button>}</div>}</div>})}{!items.length&&<div className="planogram-empty-state"><b>Начните расстановку</b><span>Добавьте мебель из панели справа и перетащите её по плану.</span></div>}<button className="studio-canvas-render-button plan-render-button" type="button" onClick={createReference} disabled={isCreatingReference||!items.length}>{isCreatingReference?"Создаём рендер…":"Создать рендер"}</button></div></div><input ref={fileRef} className="plan-reference-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={attachReference}/><input ref={floorRef} className="plan-reference-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>attachSurfaceReference(event,"floor")}/><input ref={wallRef} className="plan-reference-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>attachSurfaceReference(event,"wall")}/><footer className="planogram-footer"><span>При перемещении видны расстояния до стен и ближайших предметов.</span><b>{items.length} {items.length===1?"элемент":"элементов"}</b></footer></section>;
}

function PlanogramPanel({items,room,selectedId,onSelect,onChange}:{items:PlanItem[];room:{width:number;length:number};selectedId:string|null;onSelect:(id:string|null)=>void;onChange:(items:PlanItem[])=>void}){const [catalogOpen,setCatalogOpen]=useState(false);const selected=items.find((item)=>item.id===selectedId);const add=(template:Pick<PlanItem,"kind"|"name"|"width"|"depth">)=>{const id=crypto.randomUUID();const next={...template,id,x:Math.min(70,17+(items.length*11)%58),y:Math.min(70,18+(items.length*9)%52),rotation:0,...(template.kind==="rug"?{rugShape:"round" as const}:{})};onChange([...items,next]);onSelect(id);};const update=(patch:Partial<PlanItem>)=>selected&&onChange(items.map((item)=>item.id===selected.id?{...item,...patch}:item));const selectCatalogProduct=(product:CatalogProduct)=>{if(!selected)return;update({name:product.name,width:product.widthMm||selected.width,depth:product.depthMm||selected.depth,referenceImage:product.image,referenceImages:product.images,referenceName:product.name,referenceProductId:product.id,referenceArticle:product.article,referenceBrand:product.brand,referenceCatalogSource:product.source,referenceUrl:product.url,referencePrice:product.price,referenceOldPrice:product.oldPrice,referenceCategory:product.category,referenceSubtype:product.subtype,referenceColor:product.color,referenceMaterial:product.material,referenceHeightMm:product.heightMm,referenceDescription:product.description,referenceParameters:product.parameters});setCatalogOpen(false);};const updateDimension=(key:"width"|"depth",value:string)=>{const next=Math.round(Number(value));if(Number.isFinite(next)&&next>0)update({[key]:Math.min(next,20000)});};if(catalogOpen)return <div className="panel-content planogram-panel furniture-catalog-panel"><FurnitureCatalogPicker onSelect={selectCatalogProduct} onClose={()=>setCatalogOpen(false)}/></div>;return <div className="panel-content planogram-panel"><p className="choice-intro">Размеры комнаты показаны в миллиметрах. Потяните границу комнаты, чтобы изменить её; перетаскивайте предметы, а двойным кликом открывайте восемь маркеров размера.</p><div className="plan-room-summary"><span>КОМНАТА</span><b>{room.width} × {room.length} мм</b><small>{(room.width*room.length/1000000).toFixed(1)} м²</small></div><label>ДОБАВИТЬ ПРЕДМЕТ</label><div className="plan-template-grid">{planTemplates.map((item)=><button key={`${item.kind}:${item.name}`} type="button" onClick={()=>add(item)}><i className={`plan-icon ${item.kind}`}/><span>{item.name}</span></button>)}</div>{selected?<div className="plan-properties"><label>ВЫБРАННЫЙ ПРЕДМЕТ</label><b>{selected.name}</b>{selected.kind==="rug"&&<div className="plan-rug-shape" role="group" aria-label="Форма ковра"><button type="button" className={(selected.rugShape??"round")==="rectangular"?"active":""} onClick={()=>update({rugShape:"rectangular"})}>Прямоугольный</button><button type="button" className={(selected.rugShape??"round")==="round"?"active":""} onClick={()=>update({rugShape:"round"})}>Круглый</button></div>}<strong>{selected.width} × {selected.depth} мм</strong><div className="plan-fields"><label>ШИРИНА, ММ<input aria-label="Ширина предмета в миллиметрах" type="number" min="1" max="20000" step="1" value={selected.width} onChange={(event)=>updateDimension("width",event.target.value)}/></label><label>ГЛУБИНА, ММ<input aria-label="Глубина предмета в миллиметрах" type="number" min="1" max="20000" step="1" value={selected.depth} onChange={(event)=>updateDimension("depth",event.target.value)}/></label></div><small>Введите точные габариты вручную или дважды кликните по предмету на плане и тяните нужный из восьми маркеров по контуру.</small>{selected.referenceImage&&<div className="plan-reference-card"><img src={selected.referenceImage} alt={`Референс: ${selected.name}`}/><span>{selected.referenceName||"Референс предмета"}</span></div>}<button className="plan-catalog-select" type="button" onClick={()=>setCatalogOpen(true)}>Выбрать мебель из каталога</button><button className="plan-rotate" type="button" onClick={()=>update({rotation:(selected.rotation+90)%360})}>↻ Повернуть на 90°</button><button className="plan-delete" type="button" onClick={()=>{onChange(items.filter((item)=>item.id!==selected.id));onSelect(null)}}>Удалить предмет</button></div>:<p className="plan-select-note">Выберите предмет на плане. Для привязки настоящей мебели нажмите на него правой кнопкой и загрузите референс.</p>}</div>}

function Planogram({objects,selected,onSelect}:{objects:DetectedObject[];selected:DetectedObject|null;onSelect:(item:DetectedObject)=>void}) {
  const kindFor = (name:string) => { const value=name.toLowerCase(); if(value.includes("диван")) return "sofa"; if(value.includes("кресло")) return "chair"; if(value.includes("стол")) return "table"; if(value.includes("ковер")) return "rug"; if(value.includes("пуф")) return "pouf"; if(value.includes("торшер")) return "lamp"; if(value.includes("картина")) return "painting"; if(value.includes("растен") || value.includes("дерев")) return "plant"; return "object"; };
  const clamp=(min:number,value:number,max:number)=>Math.min(max,Math.max(min,value));
  return <section className="planogram" aria-label="Планограмма комнаты">
    <div className="planogram-head"><div><span>СОЗДАНИЕ ИНТЕРЬЕРА</span><b>Вид сверху</b></div><small>{objects.length ? `${objects.length} предметов распознано` : "Появится после распознавания"}</small></div>
    <div className={objects.length ? "planogram-board" : "planogram-board planogram-empty"}>
      <div className="planogram-room"><span className="planogram-window">ОКНА</span><span className="planogram-door">ВХОД</span><span className="planogram-room-name">ГОСТИНАЯ</span>
        {objects.map((item,index)=>{const centerX=item.x+item.width/2; const centerY=item.y+item.height/2; const width=clamp(12,item.width*.42+7,31); const height=clamp(9,item.height*.24+6,22); return <button key={item.id} className={`plan-object ${kindFor(item.name)} ${selected?.id===item.id ? "selected" : ""}`} style={{left:`${clamp(9,centerX,91)}%`,top:`${clamp(12,10+centerY*.72,86)}%`,width:`${width}%`,height:`${height}%`,zIndex:index+2}} onClick={()=>onSelect(item)} aria-label={`Выбрать на планограмме: ${item.name}`}><i/><span>{item.name}</span></button>})}
        {!objects.length && <p>Распознайте предметы — здесь появится схема расстановки.</p>}
      </div>
    </div>
    {objects.length>0 && <div className="layer-stack" aria-label="Слои проекта"><div className="layer-stack-head"><span>СЛОИ</span><small>Рабочая структура визуализации</small></div><button className="layer-row base-layer" type="button"><i>▣</i><span><b>Фон</b><small>Исходное пространство</small></span><em>⌁</em></button>{objects.map((item)=>{const active=selected?.id===item.id;return <button key={`layer-${item.id}`} type="button" className={active?"layer-row active":"layer-row"} onClick={()=>onSelect(item)}><i>{kindFor(item.name)==="sofa"?"▰":kindFor(item.name)==="table"?"○":kindFor(item.name)==="plant"?"✦":"□"}</i><span><b>{item.name}</b><small>Предметный слой</small></span><em>⌁</em></button>})}</div>}
    {objects.length>0 && <p className="planogram-note">Схема создана по ракурсу фотографии. Выберите предмет на плане, чтобы подсветить его на визуализации.</p>}
  </section>
}
