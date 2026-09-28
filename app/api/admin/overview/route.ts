import { requireGlobalAdmin } from "@/lib/auth";
import { adminOverview } from "@/lib/admin";

export async function GET(request: Request) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  return Response.json({ overview: await adminOverview() });
}
