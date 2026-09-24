import { currentUser, updateProfile } from "@/lib/auth";

export async function PATCH(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Войдите в аккаунт." }, { status: 401 });
  try {
    const body = await request.json() as { firstName?: string; lastName?: string; phone?: string; companyRole?: string };
    const updated = await updateProfile(user, {
      firstName: body.firstName || "",
      lastName: body.lastName,
      phone: body.phone,
      companyRole: body.companyRole,
    });
    return Response.json({ user: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить личные данные." }, { status: 400 });
  }
}
