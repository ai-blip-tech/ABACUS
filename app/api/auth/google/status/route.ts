import { googleOAuthConfig } from "@/lib/server-config";

export async function GET() {
  return Response.json({ enabled: googleOAuthConfig().enabled });
}
