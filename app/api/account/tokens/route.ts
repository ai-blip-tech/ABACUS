import { currentUser } from "@/lib/auth";
import { getGlobalSettings, getTokenAccount, quoteAiOperation } from "@/lib/billing";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Войдите в аккаунт." }, { status: 401 });
  const [account, generationQuote, settings] = await Promise.all([getTokenAccount(user.id), quoteAiOperation("generate"), getGlobalSettings()]);
  return Response.json({
    account,
    generationQuote,
    purchase: {
      exchangeRate: settings.token_exchange_rate,
      customPurchaseEnabled: settings.custom_token_purchase_enabled,
      paymentsEnabled: settings.payments_enabled,
    },
  });
}
