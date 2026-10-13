import { navigationManifestFor } from "./navigation-manifest.ts";
import { onoTenantProfiles, type OnoTenantProfile } from "./tenant-profiles.ts";

export type OnoSiteConfig = {
  version: "1.0";
  tenantId: OnoTenantProfile["tenantId"];
  siteId: OnoTenantProfile["siteId"];
  displayName: string;
  locale: "ru";
  approvedOrigins: readonly string[];
  navigationManifestVersion: string;
  retentionDays: number;
  capabilities: OnoTenantProfile["capabilities"] & {
    persistentMemory: true;
    embeddedWidget: true;
  };
  theme: { accent: string; surface: string; text: string };
};

const roomDesignOrigins = [
  "https://roomdesign.com.ru",
  "https://www.roomdesign.com.ru",
  ...(process.env.NODE_ENV !== "production" ? [
    "http://127.0.0.1:3128",
    "http://localhost:3128",
    "http://127.0.0.1:3129",
    "http://localhost:3129",
  ] : []),
] as readonly string[];

const configuredNorrOrigins = (process.env.ONO_NORR_APPROVED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => {
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  });

const norrOrigins: readonly string[] = [
  "https://norrmobler.ru",
  "https://www.norrmobler.ru",
  ...configuredNorrOrigins,
  ...(process.env.NODE_ENV !== "production" ? ["http://norr.localhost:3128"] : []),
];

export const onoSiteConfigs: Record<OnoTenantProfile["siteId"], OnoSiteConfig> = {
  roomdesign: {
    version: "1.0",
    tenantId: "room-design",
    siteId: "roomdesign",
    displayName: "Room Design",
    locale: "ru",
    approvedOrigins: roomDesignOrigins,
    navigationManifestVersion: navigationManifestFor("roomdesign").version,
    retentionDays: 30,
    capabilities: { ...onoTenantProfiles.roomdesign.capabilities, persistentMemory: true, embeddedWidget: true },
    theme: { accent: "#7b1020", surface: "#f8f6f0", text: "#171713" },
  },
  norrmobler: {
    version: "1.0",
    tenantId: "norr-mobler",
    siteId: "norrmobler",
    displayName: "NORR Møbler",
    locale: "ru",
    approvedOrigins: norrOrigins,
    navigationManifestVersion: navigationManifestFor("norrmobler").version,
    retentionDays: 30,
    capabilities: { ...onoTenantProfiles.norrmobler.capabilities, persistentMemory: true, embeddedWidget: true },
    theme: { accent: "#6e242a", surface: "#f4f0ea", text: "#181715" },
  },
};

export const onoSiteConfigFor = (siteId: OnoTenantProfile["siteId"]) => onoSiteConfigs[siteId];

export function isApprovedOnoOrigin(config: OnoSiteConfig, origin: string | null) {
  if (!origin) return true;
  return config.approvedOrigins.includes(origin as never);
}

export function isTrustedOnoRequestSource(config: OnoSiteConfig, request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === requestOrigin || isApprovedOnoOrigin(config, origin);
  const referer = request.headers.get("referer");
  if (referer) {
    try { return new URL(referer).origin === requestOrigin; } catch { return false; }
  }
  return process.env.NODE_ENV !== "production";
}
