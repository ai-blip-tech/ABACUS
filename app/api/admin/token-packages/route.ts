import { requireGlobalAdmin } from "@/lib/auth";
import { ensureBillingStore } from "@/lib/billing";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  await ensureBillingStore();
  const packages = await database.prepare("SELECT * FROM token_packages ORDER BY sort_order, price").all();
  return Response.json({ packages: packages.results });
}
