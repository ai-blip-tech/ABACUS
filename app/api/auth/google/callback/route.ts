import { clearGoogleStateCookie, finishGoogleLogin } from "@/lib/google-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const result = await finishGoogleLogin(request, url.searchParams.get("code") || "", url.searchParams.get("state") || "");
    const response = Response.redirect(new URL("/account", url.origin), 302);
    response.headers.append("Set-Cookie", result.cookie);
    response.headers.append("Set-Cookie", clearGoogleStateCookie);
    return response;
  } catch (error) {
    const target = new URL("/", url.origin);
    target.searchParams.set("authError", error instanceof Error ? error.message : "Google Sign-In не выполнен.");
    const response = Response.redirect(target, 302);
    response.headers.set("Set-Cookie", clearGoogleStateCookie);
    return response;
  }
}
