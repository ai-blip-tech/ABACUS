import { createSession, register, sessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; password?: string; firstName?: string; lastName?: string; phone?: string; companyRole?: string };
    const user = await register(request, body.email || "", body.password || "", {
      firstName: body.firstName || "",
      lastName: body.lastName,
      phone: body.phone,
      companyRole: body.companyRole,
    });
    const token = await createSession(user);
    return Response.json({ user }, { headers: { "Set-Cookie": sessionCookie(token) } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось создать аккаунт." }, { status: 400 });
  }
}
