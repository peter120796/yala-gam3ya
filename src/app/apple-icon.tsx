import { ImageResponse } from "next/og";
import { markSvg } from "@/components/brand/mark";

// iPhone / iPad home-screen icon (iOS rounds the corners itself).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(markSvg({ rounded: false })).toString("base64")}`;
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={180} height={180} alt="" />,
    size,
  );
}
