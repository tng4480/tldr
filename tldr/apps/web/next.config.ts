import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tldr/core", "@tldr/core-dom"],
};

export default nextConfig;
