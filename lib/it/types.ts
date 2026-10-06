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
  projectId: string | null;
  projectName: string;
  section: "image-editor" | "planogram";
  activeTool: string;
  furnitureAction: "add" | "replace" | "remove";
  selectedObject: { id: string; name: string } | null;
  render: { hasSource: boolean; hasResult: boolean; isGenerating: boolean };
  planogram: { itemCount: number; selectedItemId: string | null };
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

export type ItUiAction =
  | { type: "navigate"; target: "image-editor" | "planogram" }
  | { type: "focus"; target: "replace" }
  | { type: "highlight"; target: "replace" };

export type ItTurn = {
  text: string;
  state: ItVisualState;
  products?: ItCatalogProduct[];
  actions?: ItUiAction[];
};

export type ItConversationMessage = {
  role: "user" | "assistant";
  text: string;
  products?: ItCatalogProduct[];
};

export type ItRequest = {
  message: string;
  context: RoomDesignContext;
  history?: ItConversationMessage[];
};
