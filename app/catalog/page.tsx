import type { Metadata } from "next";
import FurnitureCatalogPage from "../furniture-catalog-page";

export const metadata: Metadata = { title: "Каталог мебели | Room Design" };

export default function CatalogPage() {
  return <FurnitureCatalogPage />;
}
