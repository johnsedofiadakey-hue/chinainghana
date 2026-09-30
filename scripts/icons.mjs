// Generates the app icons from the "Star home" mark. Run: node scripts/icons.mjs
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { badgeSvg, markSvg } from "../src/components/brand/mark.mjs";

const out = [
  [markSvg({ radius: 9 }), 192, "public/icons/icon-192.png"],
  [markSvg({ radius: 9 }), 512, "public/icons/icon-512.png"],
  [markSvg({ pad: 8, radius: 0 }), 512, "public/icons/maskable-512.png"], // safe zone for Android masks
  [markSvg({ pad: 3, radius: 0 }), 180, "public/icons/apple-touch-icon.png"], // iOS rounds the corners itself
  [badgeSvg(), 96, "public/icons/badge-96.png"],
];
for (const [svg, size, file] of out) {
  await sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toFile(file);
  console.log("✔", file);
}

// Browser-tab icon (Next.js serves src/app/icon.svg automatically).
writeFileSync("src/app/icon.svg", markSvg({ radius: 10 }));
console.log("✔ src/app/icon.svg");
