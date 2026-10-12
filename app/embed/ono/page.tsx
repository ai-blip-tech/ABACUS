import EmbeddedOnoClient from "./embedded-ono-client";
import "./embedded-ono.css";
import { isApprovedOnoOrigin, onoSiteConfigFor } from "@/lib/it/site-config";
import { resolveOnoTenantProfile } from "@/lib/it/tenant-profiles";
import { headers } from "next/headers";

type EmbeddedOnoPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const firstValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function EmbeddedOnoPage({ searchParams }: EmbeddedOnoPageProps) {
  const query = await searchParams;
  const siteId = firstValue(query.site) === "norrmobler" ? "norrmobler" : "roomdesign";
  const parentOrigin = firstValue(query.parentOrigin) || "";
  const config = onoSiteConfigFor(siteId);
  const requestHeaders = await headers();
  const trustedProfile = resolveOnoTenantProfile(requestHeaders.get("host"));

  if (trustedProfile.siteId !== siteId || !parentOrigin || !isApprovedOnoOrigin(config, parentOrigin)) return null;
  return <EmbeddedOnoClient parentOrigin={parentOrigin} siteId={siteId}/>;
}
