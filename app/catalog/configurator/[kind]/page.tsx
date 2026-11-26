import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Конфигуратор мебели | Room Design" };

export default async function CabinetConfiguratorPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "dresser" && kind !== "tv_stand") notFound();

  return <iframe
    src={`/room-design-planner/view?cabinet=${kind}`}
    title={kind === "dresser" ? "Конфигуратор комодов" : "Конфигуратор ТВ-тумб"}
    style={{ display: "block", width: "100%", height: "100dvh", border: 0 }}
  />;
}
