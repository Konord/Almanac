import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The art screen saver's paintings (src/app/art): Next.js makes a
  // screen-sized copy of each scan once and keeps it. Some scans are large
  // (80 MB), and the kitchen screen is 2560 wide.
  images: {
    localPatterns: [{ pathname: "/art/**", search: "" }],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 2560, 3840],
    qualities: [75, 90],
    maximumResponseBody: 200_000_000,
    minimumCacheTTL: 2_678_400,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
