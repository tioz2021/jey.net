import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "jey.net",
    short_name: "jey.net",
    description: "Личный каталог фильмов, сериалов, книг, игр и аниме.",
    start_url: "/items",
    scope: "/",
    display: "standalone",
    background_color: "#f3f4f6",
    theme_color: "#7c3aed",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
