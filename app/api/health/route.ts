import { imageModel } from "@/lib/image-model";
import { openAIKey } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const openAIConfigured = Boolean(openAIKey());
  return Response.json({
    ok: true,
    runtime: "node",
    imageGeneration: {
      configured: openAIConfigured,
      model: imageModel(),
    },
  }, {
    status: openAIConfigured ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
