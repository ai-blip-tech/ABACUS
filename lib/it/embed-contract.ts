import type { ItUiAction } from "./types.ts";

export type OnoEnvironment = "preview" | "production";

export type OnoSiteConfig = {
  tenantId: "room-design" | "norr-mobler";
  siteId: "roomdesign" | "norrmobler";
  environment: OnoEnvironment;
  apiBaseUrl: string;
  approvedOrigins: string[];
  locale: "ru";
  capabilities: {
    catalog: boolean;
    productNavigation: boolean;
    roomDesignGuidance: boolean;
    mutatingActions: boolean;
  };
};

export type OnoPageContext = {
  pageType: "landing" | "templates" | "template" | "project" | "catalog" | "product" | "other";
  pathname: string;
  title?: string;
  entityId?: string;
  templateSlug?: string;
  product?: {
    id: string;
    sku?: string;
    name: string;
    category?: string;
    brand?: string;
    collection?: string;
    price?: number;
    currency?: "RUB";
    availability?: "in_stock" | "out_of_stock" | "preorder" | "unknown";
    canonicalUrl?: string;
    attributes?: Array<{ name: string; value: string }>;
  };
};

export type OnoWidgetEvent =
  | { type: "widget.ready"; siteId: OnoSiteConfig["siteId"] }
  | { type: "widget.opened"; source: string }
  | { type: "widget.closed" }
  | { type: "page.changed"; context: OnoPageContext }
  | { type: "user.click_product"; productId: string }
  | { type: "widget.link_opened"; href: string }
  | { type: "handoff.requested" }
  | { type: "widget.error"; code: string }
  | { type: "ono.message.sent"; hasImage: boolean }
  | { type: "ono.catalog.results"; count: number }
  | { type: "widget.ui_action"; action: ItUiAction };

export { ONO_PROTOCOL_VERSION as onoEmbedVersion } from "./version.ts";
