import type { Metadata } from "next";
import FurnitureCatalogPage from "../furniture-catalog-page";

export const metadata: Metadata = { title: "Каталог мебели | Room Design" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ type?: string | string[] }> }) {
  const { type } = await searchParams;
  return <FurnitureCatalogPage initialCategory={type === "dresser" || type === "tv_stand" ? type : undefined} />;
}
