import { imageModel } from "@/lib/image-model";
import { openAIKey } from "@/lib/server-config";

export async function GET() {
  return Response.json({
    configured: Boolean(openAIKey()),
    provider: "OpenAI",
    model: imageModel(),
  }, { headers: { "Cache-Control": "no-store" } });
}
