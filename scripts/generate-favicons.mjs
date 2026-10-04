import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const publicDir = path.resolve("public");
const previewDir = path.resolve("tmp/favicon-editorial-r");

const colors = {
  ink: "#1A1917",
  burgundy: "#6E242A",
  ivory: "#F7F5F1",
  white: "#FFFFFF",
};

// Cormorant Garamond Medium — the serif family already used by Room Design.
// The glyph is deliberately stored as an outline so favicon.svg never relies
// on a browser font or a <text> element.
const rPath =
  "M546 0Q530 0 493.5 38.5Q457 77 406 148.5Q355 220 291 319L358 340Q442 219 500.5 147Q559 75 604 43.5Q649 12 690 12Q693 12 693 6Q693 0 690 0Q634 0 598.5 0Q563 0 546 0ZM306 628Q390 628 434.5 592.5Q479 557 479 498Q479 442 447 398Q415 354 363.5 329Q312 304 253 304Q241 304 228 304.5Q215 305 204 306L204 81Q204 52 209.5 37Q215 22 232.5 17Q250 12 285 12Q288 12 288 6Q288 0 285 0Q260 0 230 1Q200 2 164 2Q130 2 99 1Q68 0 43 0Q40 0 40 6Q40 12 43 12Q77 12 94.5 17Q112 22 118.5 37Q125 52 125 81L125 544Q125 573 119 587.5Q113 602 96 607.5Q79 613 44 613Q42 613 42 619Q42 625 44 625Q69 625 99.5 623.5Q130 622 164 622Q196 622 236 625Q276 628 306 628ZM397 466Q397 522 382 553.5Q367 585 339.5 598Q312 611 275 611Q237 611 220.5 597.5Q204 584 204 542L204 331Q218 330 234.5 329Q251 328 263 328Q337 328 367 362Q397 396 397 466Z";

function iconSvg({ foreground, room, optical16 = false }) {
  const stroke = optical16
    ? ` stroke="${foreground}" stroke-width="5" stroke-linejoin="round"`
    : "";
  const square = optical16
    ? '<path fill="' + room + '" d="M92 60h28v28H92z"/>'
    : '<path fill="' + room + '" d="M94 62h24v24H94z"/>';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Room Design — Editorial R Cut">
  <g transform="translate(7 230) scale(.325 -.325)">
    <path fill="${foreground}"${stroke} d="${rPath}"/>
  </g>
  ${square}
</svg>
`;
}

function tileSvg(size = 256) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="${size}" height="${size}" role="img" aria-label="Room Design">
  <path fill="${colors.burgundy}" d="M0 0h256v256H0z"/>
  <g transform="translate(25 218) scale(.28 -.28)">
    <path fill="${colors.ivory}" d="${rPath}"/>
  </g>
  <path fill="${colors.ink}" d="M101 74h24v24h-24z"/>
</svg>
`;
}

function pinnedSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <g transform="translate(7 230) scale(.325 -.325)">
    <path fill="#000000" d="${rPath}"/>
  </g>
</svg>
`;
}

function makeIco(images) {
  const headerSize = 6;
  const entrySize = 16;
  const firstImageOffset = headerSize + entrySize * images.length;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let imageOffset = firstImageOffset;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(imageOffset, 12);
    imageOffset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)]);
}

async function raster(svg, size, background) {
  let image = sharp(Buffer.from(svg)).resize(size, size);
  if (background) image = image.flatten({ background });
  return image.png().toBuffer();
}

await fs.mkdir(publicDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const light = iconSvg({ foreground: colors.ink, room: colors.burgundy });
const dark = iconSvg({ foreground: colors.ivory, room: colors.burgundy });
const small = iconSvg({ foreground: colors.ink, room: colors.burgundy, optical16: true });
const tile = tileSvg();

await Promise.all([
  fs.writeFile(path.join(publicDir, "favicon.svg"), light),
  fs.writeFile(path.join(publicDir, "favicon-dark.svg"), dark),
  fs.writeFile(path.join(publicDir, "safari-pinned-tab.svg"), pinnedSvg()),
]);

const png16 = await raster(small, 16, colors.ivory);
const png32 = await raster(light, 32, colors.ivory);
const png48 = await raster(light, 48, colors.ivory);
const png180 = await raster(tile, 180);
const png192 = await raster(tile, 192);
const png512 = await raster(tile, 512);

await Promise.all([
  fs.writeFile(path.join(publicDir, "favicon-16x16.png"), png16),
  fs.writeFile(path.join(publicDir, "favicon-32x32.png"), png32),
  fs.writeFile(path.join(publicDir, "favicon-48x48.png"), png48),
  fs.writeFile(path.join(publicDir, "apple-touch-icon.png"), png180),
  fs.writeFile(path.join(publicDir, "android-chrome-192x192.png"), png192),
  fs.writeFile(path.join(publicDir, "android-chrome-512x512.png"), png512),
  fs.writeFile(
    path.join(publicDir, "favicon.ico"),
    makeIco([
      { size: 16, data: png16 },
      { size: 32, data: png32 },
      { size: 48, data: png48 },
    ]),
  ),
]);

const preview = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 600">
  <path fill="${colors.ivory}" d="M0 0h1280v600H0z"/>
  <text x="60" y="70" font-family="Arial, sans-serif" font-size="20" letter-spacing="4" fill="${colors.burgundy}">ROOM DESIGN — EDITORIAL R CUT</text>
  <g transform="translate(60 120)"><rect width="320" height="320" rx="24" fill="white"/><image href="data:image/svg+xml;base64,${Buffer.from(light).toString("base64")}" x="32" y="32" width="256" height="256"/></g>
  <g transform="translate(420 120)"><rect width="320" height="320" rx="24" fill="${colors.ink}"/><image href="data:image/svg+xml;base64,${Buffer.from(dark).toString("base64")}" x="32" y="32" width="256" height="256"/></g>
  <g transform="translate(780 120)"><rect width="320" height="320" rx="24" fill="white"/><image href="data:image/svg+xml;base64,${Buffer.from(tile).toString("base64")}" x="32" y="32" width="256" height="256"/></g>
  <text x="160" y="480" font-family="Arial, sans-serif" font-size="18" fill="${colors.ink}">LIGHT</text>
  <text x="520" y="480" font-family="Arial, sans-serif" font-size="18" fill="${colors.ink}">DARK</text>
  <text x="875" y="480" font-family="Arial, sans-serif" font-size="18" fill="${colors.ink}">APP TILE</text>
  <g transform="translate(1140 130)"><image href="data:image/svg+xml;base64,${Buffer.from(small).toString("base64")}" width="16" height="16"/><text x="28" y="14" font-family="Arial" font-size="14" fill="${colors.ink}">16 px</text></g>
  <g transform="translate(1140 180)"><image href="data:image/svg+xml;base64,${Buffer.from(light).toString("base64")}" width="32" height="32"/><text x="44" y="22" font-family="Arial" font-size="14" fill="${colors.ink}">32 px</text></g>
  <g transform="translate(1140 250)"><image href="data:image/svg+xml;base64,${Buffer.from(light).toString("base64")}" width="48" height="48"/><text x="60" y="30" font-family="Arial" font-size="14" fill="${colors.ink}">48 px</text></g>
  <g transform="translate(1140 340)"><image href="data:image/svg+xml;base64,${Buffer.from(tile).toString("base64")}" width="96" height="96"/><text x="0" y="122" font-family="Arial" font-size="14" fill="${colors.ink}">180 px source</text></g>
</svg>`);
await sharp(preview).png().toFile(path.join(previewDir, "editorial-r-context.png"));

console.log(`Generated favicon set in ${publicDir}`);
console.log(`Generated visual QA sheet in ${previewDir}`);
