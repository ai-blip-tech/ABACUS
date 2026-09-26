import { currentUser } from "@/lib/auth";
import { getTokenHistory } from "@/lib/billing";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Войдите в аккаунт." }, { status: 401 });
  return Response.json({ transactions: await getTokenHistory(user.id) });
}
