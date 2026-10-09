import { requireGlobalAdmin } from "@/lib/auth";
import { adminUsersReport, resolveAdminUsersFilter } from "@/lib/admin-users-report";
import { createAdminUsersXlsx } from "@/lib/admin-users-xlsx";
import { database } from "@/lib/server-runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!await requireGlobalAdmin(request)) return Response.json({ error: "Требуются права global admin." }, { status: 403 });
  try {
    const filter = resolveAdminUsersFilter(new URL(request.url));
    const report = await adminUsersReport(filter);
    const tenant = filter.tenantId
      ? await database.prepare("SELECT name FROM tenants WHERE id = ?").bind(filter.tenantId).first<{ name: string }>()
      : null;
    const workbook = await createAdminUsersXlsx(report, tenant?.name || "Все tenant");
    const filename = `room-design-users-${filter.fromDate}-${filter.toDate}.xlsx`;
    return new Response(Buffer.from(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось сформировать Excel." }, { status: 400 });
  }
}
