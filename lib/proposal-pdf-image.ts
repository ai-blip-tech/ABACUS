import sharp from "sharp";
import { proposalImageFormat, type ProposalImageFormat } from "./proposal-image.ts";

export type ProposalImageRole = "cover" | "visualization" | "catalog" | "reference";

export type NormalizedProposalImage = {
  bytes: Uint8Array;
  format: ProposalImageFormat;
  detectedFormat: string;
  normalized: boolean;
};

const roleLabel: Record<ProposalImageRole, string> = {
  cover: "обложки",
  visualization: "визуализации",
  catalog: "каталожного товара",
  reference: "референсного товара",
};

function decodeDataUrl(source: string) {
  const match = source.match(/^data:([^;,]+)?(?:;base64)?,([\s\S]*)$/);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const payload = match[2] || "";
  return {
    mime,
    bytes: source.includes(";base64,")
      ? Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(payload)),
  };
}

async function sourceBytes(source: string, fetcher: typeof fetch) {
  const inline = decodeDataUrl(source);
  if (inline) return inline;
  const response = await fetcher(source, { headers: { "User-Agent": "ROOM-design-proposal/1.0" } });
  if (!response.ok) throw new Error(`fetch:${response.status}`);
  return { mime: response.headers.get("content-type") || "", bytes: new Uint8Array(await response.arrayBuffer()) };
}

export async function normalizeProposalImage(source: string, role: ProposalImageRole, fetcher: typeof fetch = fetch): Promise<NormalizedProposalImage> {
  let detectedFormat = "unknown";
  let stage = "read";
  try {
    const { mime, bytes } = await sourceBytes(source, fetcher);
    stage = "detect";
    const directlySupported = proposalImageFormat(bytes, mime);
    if (directlySupported) return { bytes, format: directlySupported, detectedFormat: directlySupported, normalized: false };

    const image = sharp(bytes, { animated: false, failOn: "error" });
    const metadata = await image.metadata();
    detectedFormat = metadata.format || "unknown";
    stage = "normalize";
    const normalized = new Uint8Array(await image.png({ compressionLevel: 9 }).toBuffer());
    return { bytes: normalized, format: "png", detectedFormat, normalized: true };
  } catch (error) {
    console.error("[proposal-image]", {
      role,
      detectedFormat,
      normalizationResult: "failed",
      failureStage: stage,
      message: error instanceof Error ? error.message : "unknown",
    });
    throw new Error(`Не удалось подготовить изображение ${roleLabel[role]} для PDF.`);
  }
}
