import { OG_SIZE, renderOgImage } from "@/lib/og";

export const alt = "China-in-Ghana · Home appliances at wholesale prices. Order on WhatsApp.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return renderOgImage();
}
