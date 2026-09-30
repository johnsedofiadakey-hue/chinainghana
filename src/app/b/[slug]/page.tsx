import type { Metadata } from "next";
import { Storefront } from "@/components/store/Storefront";

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function generateMetadata(props: PageProps<"/b/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const name = titleFromSlug(slug);
  return {
    title: `${name} branch`,
    description: `Live prices and stock at China-in-Ghana ${name}. Order on WhatsApp.`,
    openGraph: {
      title: `China-in-Ghana · ${name}`,
      description: "Live wholesale prices and stock. Order on WhatsApp.",
    },
  };
}

export default async function BranchPage(props: PageProps<"/b/[slug]">) {
  const { slug } = await props.params;
  return <Storefront initialSlug={slug} />;
}
