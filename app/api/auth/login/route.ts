import { createSession, login, sessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; password?: string };
    const user = await login(request, body.email || "", body.password || "");
    const token = await createSession(user);
    return Response.json({ user }, { headers: { "Set-Cookie": sessionCookie(token) } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось войти." }, { status: 401 });
  }
}
