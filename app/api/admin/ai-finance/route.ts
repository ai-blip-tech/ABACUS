import { requireGlobalAdmin } from "@/lib/auth";
import { adminAiFinance, resolveFinancePeriod } from "@/lib/admin-ai-finance";

export async function GET(request: Request) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  const finance = await adminAiFinance(resolveFinancePeriod(new URL(request.url)));
  return Response.json({ finance });
}
