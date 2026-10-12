export type ItVisualState =
  | "closed"
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "searching"
  | "moving"
  | "acting"
  | "success"
  | "error";

export type RoomDesignContext = {
  route: string;
  page: "landing" | "projects" | "project-setup" | "studio" | "templates" | "template" | "catalog" | "product" | "account" | "admin" | "proposal" | "other";
  projectId: string | null;
  projectName: string;
  section: "image-editor" | "planogram" | "templates" | "template-workspace" | "account" | "admin" | "proposal" | "project-setup" | "other";
  activeTool: string;
  furnitureAction: "add" | "replace" | "remove";
  selectedObject: { id: string; name: string } | null;
  render: { hasSource: boolean; hasResult: boolean; isGenerating: boolean };
  planogram: {
    itemCount: number;
    selectedItemId: string | null;
    selectedItem: {
      id: string;
      name: string;
      kind: string;
      widthMm: number;
      depthMm: number;
      rotation: number;
      hasReference: boolean;
      referenceName: string | null;
    } | null;
    room: { widthMm: number; lengthMm: number };
    hasFloorReference: boolean;
    hasWallReference: boolean;
    hasCamera: boolean;
  };
  workspace: {
    isAuthenticated: boolean;
    projectSaved: boolean;
    historyCount: number;
    queuedEditCount: number;
    hasFurnitureReference: boolean;
  };
  template: {
    slug: string;
    title: string;
    status: string;
    category: string;
    audience: string;
    description: string;
    inputSummary: string;
    resultType: string;
    inputs: Array<{ label: string; required: boolean; minCount: number; maxCount: number }>;
  } | null;
  commerce?: {
    product: {
      id: string;
      sku: string;
      name: string;
      category: string;
      brand: string;
      collection: string;
      price: number | null;
      currency: "RUB";
      availability: "in_stock" | "out_of_stock" | "preorder" | "unknown";
      canonicalUrl: string;
      attributes: Array<{ name: string; value: string }>;
    } | null;
  };
  availableActions: string[];
};

export type ItCatalogProduct = {
  id: string;
  sourceId?: string;
  name: string;
  article?: string;
  image: string;
  images?: string[];
  url: string;
  canonicalUrl?: string;
  price: number;
  oldPrice?: number;
  available?: boolean;
  category: string;
  subtype?: string;
  color: string;
  material: string;
  brand?: string;
  widthMm: number | null;
  depthMm: number | null;
  heightMm: number | null;
  description?: string;
  parameters?: Array<{ name: string; value: string }>;
  updatedAt?: string;
  provenance?: "norrmobler_yml";
};

export type ItToolTrace = {
  name: string;
  status: "success" | "error";
  durationMs: number;
  resultCount: number;
};

export type ItVisionAnalysis = {
  subject: "room" | "furniture" | "material" | "unknown";
  categories: string[];
  colors: string[];
  materials: string[];
  styles: string[];
  confidence: "low" | "medium" | "high";
  uncertain: string[];
  requiresConfirmation: boolean;
};

export type ItSource = {
  title: string;
  url: string;
};

export type ItUiTarget =
  | "image-editor"
  | "image-upload"
  | "editor-add"
  | "replace"
  | "editor-remove"
  | "editor-catalog"
  | "save-project"
  | "history"
  | "upscale"
  | "planogram"
  | "planogram-sofa"
  | "planogram-armchair"
  | "planogram-selected-item"
  | "planogram-properties"
  | "planogram-floor-reference"
  | "planogram-wall-reference"
  | "planogram-save"
  | "planogram-create-render"
  | "templates-catalog"
  | "template-light-scenarios"
  | "norr-catalog"
  | "norr-sofas"
  | "norr-contact";

export type ItUiAction =
  | { type: "navigate"; target: "image-editor" | "planogram" }
  | { type: "focus"; target: ItUiTarget }
  | { type: "highlight"; target: ItUiTarget }
  | { type: "guide"; target: ItUiTarget };

export type ItTurn = {
  text: string;
  state: ItVisualState;
  products?: ItCatalogProduct[];
  actions?: ItUiAction[];
  toolTrace?: ItToolTrace[];
  handoffRequested?: boolean;
  visionAnalysis?: ItVisionAnalysis;
  sources?: ItSource[];
};

export type ItConversationMessage = {
  role: "user" | "assistant";
  text: string;
  image?: string;
  products?: ItCatalogProduct[];
};

export type ItRequest = {
  message: string;
  image?: string;
  context: RoomDesignContext;
  history?: ItConversationMessage[];
  sessionId?: string;
  requestId?: string;
  memorySummary?: string;
  memoryState?: Record<string, unknown>;
};
