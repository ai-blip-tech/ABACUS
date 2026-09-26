import { currentUser, ensureStore, updateProfile } from "@/lib/auth";
import { database } from "@/lib/server-runtime";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Войдите в аккаунт." }, { status: 401 });
  await ensureStore();
  const [profile, identities, memberships] = await database.batch([
    database.prepare("SELECT id, email, global_role, first_name, last_name, phone, company_role, created_at FROM users WHERE id = ?").bind(user.id),
    database.prepare("SELECT provider, provider_email, created_at FROM auth_identities WHERE user_id = ? ORDER BY created_at").bind(user.id),
    database.prepare("SELECT tenants.id, tenants.slug, tenants.name, tenant_memberships.role, tenant_memberships.created_at FROM tenant_memberships JOIN tenants ON tenants.id = tenant_memberships.tenant_id WHERE tenant_memberships.user_id = ? ORDER BY tenants.name").bind(user.id),
  ]);
  return Response.json({ profile: profile.results[0], identities: identities.results, memberships: memberships.results });
}

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
