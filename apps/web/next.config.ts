import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The room layout and protocol are TypeScript sources of the bot app:
  transpilePackages: ["@tribunal/bot"],
  // Small self-contained server for the Docker image:
  output: "standalone",
};

export default nextConfig;
