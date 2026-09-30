export type ProposalImageFormat = "png" | "jpeg";

export function proposalImageFormat(bytes: Uint8Array, mime = ""): ProposalImageFormat | null {
  const isPng = bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a;
  if (isPng) return "png";

  const isJpeg = bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff;
  if (isJpeg) return "jpeg";

  const normalizedMime = mime.toLowerCase().split(";", 1)[0].trim();
  if (normalizedMime === "image/png") return "png";
  if (normalizedMime === "image/jpeg" || normalizedMime === "image/jpg") return "jpeg";
  return null;
}
