import { navigationManifestFor } from "@/lib/it/navigation-manifest";
import { isApprovedOnoOrigin, onoSiteConfigFor } from "@/lib/it/site-config";
import { resolveOnoTenantProfile } from "@/lib/it/tenant-profiles";
import { onoKnowledgeHealth } from "@/lib/it/knowledge-base";
import { ONO_CORE_VERSION, ONO_PROTOCOL_VERSION, onoServerEnabled } from "@/lib/it/version";

export async function GET(request: Request) {
  const profile = resolveOnoTenantProfile(request.headers.get("host") || new URL(request.url).host);
  const config = onoSiteConfigFor(profile.siteId);
  if (!isApprovedOnoOrigin(config, request.headers.get("origin"))) return Response.json({ error: "Источник виджета не разрешён." }, { status: 403 });
  return Response.json({
    enabled: onoServerEnabled(),
    config,
    navigationManifest: navigationManifestFor(profile.siteId),
    knowledge: onoKnowledgeHealth(profile),
    coreVersion: ONO_CORE_VERSION,
    protocolVersion: ONO_PROTOCOL_VERSION,
    stage: 5,
    transport: { streaming: "ndjson", cancellation: true, progressStages: ["analyzing", "thinking", "searching", "comparing", "finalizing"] },
  }, { headers: { "Cache-Control": "no-store" } });
}
