import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requireGlobalAdmin } from "@/lib/auth";
import GlobalAdminClient from "./admin-client";

export const dynamic = "force-dynamic";

export default async function GlobalAdminPage() {
  const requestHeaders = await headers();
  const origin = `http://${requestHeaders.get("host") || "localhost"}`;
  const admin = await requireGlobalAdmin(new Request(`${origin}/admin`, { headers: requestHeaders }));
  if (!admin) notFound();
  return <GlobalAdminClient admin={{ id: admin.id, email: admin.email, firstName: admin.firstName, lastName: admin.lastName }}/>;
}
