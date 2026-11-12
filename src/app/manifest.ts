import type { MetadataRoute } from "next";

// "Add to Home Screen" on Android / Chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "يلا جمعية · Yala-Gam3ya",
    short_name: "يلا جمعية",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
