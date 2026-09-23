import { changePassword, currentUser } from "@/lib/auth";

export async function PATCH(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Войдите в аккаунт." }, { status: 401 });
  try {
    const body = await request.json() as { currentPassword?: string; newPassword?: string };
    await changePassword(user, body.currentPassword || "", body.newPassword || "");
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось изменить пароль." }, { status: 400 });
  }
}
