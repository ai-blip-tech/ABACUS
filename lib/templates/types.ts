export type TemplateStatus = "draft" | "internal" | "beta" | "live" | "paused" | "coming_soon" | "archived";
export type TemplateResultType = "image" | "image_series" | "video";
export type TemplateCategory = "home" | "make_yours" | "control" | "visualization" | "experiments" | "delivery";
export type TemplateAudience = "personal" | "professional" | "both";
export type TemplateInputKind = "room_image" | "reference_image" | "product_images" | "people_images" | "second_room_image" | "floor_plan" | "audio" | "choice" | "short_text" | "range";

export type TemplateInputSlot = {
  id: string;
  kind: TemplateInputKind;
  label: string;
  helper?: string;
  required: boolean;
  minCount: number;
  maxCount: number;
  acceptedMimeTypes: string[];
  maxBytes?: number;
  allowReorder?: boolean;
  consent?: "none" | "people" | "audio" | "collaborator";
  options?: string[];
  placeholder?: string;
  range?: {
    min: number;
    max: number;
    step: number;
    unit: string;
    defaultValue: number;
    presets: Array<{ value: number; label: string; description: string }>;
  };
};

export type TemplateDefinition = {
  id: string;
  slug: string;
  version: number;
  status: TemplateStatus;
  wave: "foundation" | "one" | "two" | "experimental";
  category: TemplateCategory;
  audience: TemplateAudience;
  title: string;
  hook: string;
  description: string;
  ctaLabel?: string;
  resultType: TemplateResultType;
  inputSummary: string;
  inputSlots: TemplateInputSlot[];
  requireAnyOf?: string[][];
  exclusiveValueGroups?: string[][];
  preview: {
    type: "placeholder" | "video";
    src: string;
    alt: string;
    position?: string;
    videoSrc?: string;
    videoMimeType?: string;
  };
  badges: Array<"NEW" | "VIDEO" | "С ДРУГОМ" | "WILDCARD" | "BETA">;
  requiredCapabilities: string[];
  safetyPolicy?: string;
  analyticsKey: string;
  sortOrder: number;
  featured: boolean;
};
