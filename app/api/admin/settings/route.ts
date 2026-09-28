import { requireGlobalAdmin } from "@/lib/auth";
import { getGlobalSettings, updateGlobalSettings, type GlobalSettings } from "@/lib/billing";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  const history = await database.prepare("SELECT * FROM global_setting_history ORDER BY created_at DESC LIMIT 100").all();
  const prices = await database.prepare("SELECT operation, estimated_netto_usd, active, updated_at FROM ai_operation_prices ORDER BY operation").all();
  return Response.json({ settings: await getGlobalSettings(), history: history.results, aiOperationPrices: prices.results });
}

export async function PATCH(request: Request) {
  const admin = await requireGlobalAdmin(request);
  if (!admin) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  try {
    const body = await request.json() as Partial<GlobalSettings>;
    return Response.json({ settings: await updateGlobalSettings(admin.id, body) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Настройки не сохранены." }, { status: 400 });
  }
}
