import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "China-in-Ghana",
    short_name: "China-in-Ghana",
    description: "Live wholesale prices and stock at your nearest branch. Order on WhatsApp.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f8fb",
    theme_color: "#0b1b3f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Staff sign in", url: "/login", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
