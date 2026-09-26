import { currentUser } from "@/lib/auth";
import { getTokenAccount, quoteAiOperation } from "@/lib/billing";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Войдите в аккаунт." }, { status: 401 });
  const [account, generationQuote] = await Promise.all([getTokenAccount(user.id), quoteAiOperation("generate")]);
  return Response.json({ account, generationQuote });
}
