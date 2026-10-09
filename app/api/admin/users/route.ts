import { requireGlobalAdmin } from "@/lib/auth";
import { adminUsers } from "@/lib/admin";
import { resolveAdminUsersFilter } from "@/lib/admin-users-report";

export async function GET(request: Request) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  try {
    const report = await adminUsers(resolveAdminUsersFilter(new URL(request.url)));
    return Response.json({ users: report.users, usersTotals: report.totals, usersFilter: report.filter, usersGrossCoefficient: report.grossCoefficient });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось построить отчёт по пользователям." }, { status: 400 });
  }
}
