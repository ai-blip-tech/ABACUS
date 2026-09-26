import { requireGlobalAdmin } from "@/lib/auth";
import { getTokenAccount, getTokenHistory } from "@/lib/billing";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  const { id } = await context.params;
  const [account, transactions] = await Promise.all([getTokenAccount(id), getTokenHistory(id)]);
  return Response.json({ account, transactions });
}
