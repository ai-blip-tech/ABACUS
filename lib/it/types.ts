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
  page: "landing" | "projects" | "project-setup" | "studio" | "templates" | "template" | "account" | "admin" | "proposal" | "other";
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
  availableActions: string[];
};

export type ItCatalogProduct = {
  id: string;
  name: string;
  image: string;
  url: string;
  price: number;
  category: string;
  color: string;
  material: string;
  widthMm: number | null;
  depthMm: number | null;
  heightMm: number | null;
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
  | "planogram-create-render";

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
};
