import { OG_SIZE, renderOgImage } from "@/lib/og";

export const alt = "China-in-Ghana branch · Live wholesale prices and stock. Order on WhatsApp.";
export const size = OG_SIZE;
export const contentType = "image/png";

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return renderOgImage(titleFromSlug(slug));
}
