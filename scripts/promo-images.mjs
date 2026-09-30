// Builds shop images from the client's promo flyers (720×1080 JPGs).
//   node scripts/promo-images.mjs <folder-with-flyers>
// For each product: full flyer, a square product photo for cards, and a gift cut-out.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("Pass the folder that holds the flyer JPGs.");
const out = "public/promos";
mkdirSync(out, { recursive: true });

// [left, top, width, height] in flyer pixels.
const FLYERS = {
  "BCD-139": { file: "8ffa980e-5af0-4832-af1a-dc1ef949dc10.JPG", thumb: [60, 330, 520, 420], gift: [0, 720, 320, 130] },
  "BCD-138": { file: "bf26b236-9529-4fbd-ac95-74a9c55d2608.JPG", thumb: [60, 340, 480, 400], gift: [20, 680, 230, 140] },
  "GME-200": { file: "947f59ce-2dac-45b2-94d5-3f4609401668.JPG", thumb: [20, 215, 700, 510], gift: [450, 220, 270, 500] },
  "SNW-500": { file: "9e4882de-eae9-4dfa-9068-3d5d4eee556b.JPG", thumb: [30, 372, 640, 385], gift: [35, 630, 240, 190] },
  "GME-300": { file: "ed359194-3878-4b8e-9f41-2adf3757fa85.JPG", thumb: [15, 350, 670, 405], gift: [20, 540, 320, 220] },
  "GME-400": { file: "1fe125ca-0398-43d9-847c-edf4060cf814.JPG", thumb: [0, 345, 690, 392], gift: [10, 500, 300, 280] },
};

const box = ([left, top, width, height]) => ({ left, top, width, height });

for (const [code, f] of Object.entries(FLYERS)) {
  const src = join(dir, f.file);
  const slug = code.toLowerCase();
  // Pad with the flyer's own background colour so the square photo blends in.
  const { data } = await sharp(src).extract({ left: f.thumb[0] + 5, top: f.thumb[1] + 5, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const background = { r: data[0], g: data[1], b: data[2] };

  await sharp(src).webp({ quality: 82 }).toFile(`${out}/${slug}-flyer.webp`);
  await sharp(src).extract(box(f.thumb)).resize(600, 600, { fit: "contain", background }).webp({ quality: 80 }).toFile(`${out}/${slug}.webp`);
  await sharp(src).extract(box(f.gift)).resize(320, 320, { fit: "contain", background: "#ffffff" }).webp({ quality: 80 }).toFile(`${out}/${slug}-gift.webp`);
  console.log("✔", code);
}
