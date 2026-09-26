import { beginGoogleLogin, googleStateCookie } from "@/lib/google-auth";

export async function GET(request: Request) {
  try {
    const login = await beginGoogleLogin(request);
    return new Response(null, { status: 302, headers: { Location: login.url, "Set-Cookie": googleStateCookie(login.state) } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Google Sign-In недоступен." }, { status: 503 });
  }
}
