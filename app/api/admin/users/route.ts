import { requireGlobalAdmin } from "@/lib/auth";
import { adminUsers } from "@/lib/admin";

export async function GET(request: Request) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  const search = new URL(request.url).searchParams.get("q") || "";
  return Response.json({ users: await adminUsers(search) });
}
