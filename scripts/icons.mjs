// Generates the app icons from the logo mark. Run: node scripts/icons.mjs
import sharp from "sharp";

const mark = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${40 + pad * 2} ${40 + pad * 2}">
  <rect x="${-pad}" y="${-pad}" width="${40 + pad * 2}" height="${40 + pad * 2}" fill="#16306E"/>
  <path d="M10 19.5 20 11l10 8.5V29a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2z" fill="#fff"/>
  <rect x="15.5" y="20.5" width="9" height="10.5" rx="2" fill="#FF6B1A"/>
  <circle cx="30.5" cy="10" r="4" fill="#FFC83D"/>
</svg>`;

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <rect width="40" height="40" rx="9" fill="#16306E"/>
  <path d="M10 19.5 20 11l10 8.5V29a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2z" fill="#fff"/>
  <rect x="15.5" y="20.5" width="9" height="10.5" rx="2" fill="#FF6B1A"/>
  <circle cx="30.5" cy="10" r="4" fill="#FFC83D"/>
</svg>`;

const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <path d="M8 19.5 20 9l12 10.5V31a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" fill="#fff"/>
</svg>`;

const out = [
  [rounded, 192, "public/icons/icon-192.png"],
  [rounded, 512, "public/icons/icon-512.png"],
  [mark(8), 512, "public/icons/maskable-512.png"],
  [mark(3), 180, "public/icons/apple-touch-icon.png"],
  [badge, 96, "public/icons/badge-96.png"],
];
for (const [svg, size, file] of out) {
  await sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toFile(file);
  console.log("✔", file);
}
