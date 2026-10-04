import type { NextConfig } from "next";

// GitHub project sites are served from a sub-path (https://<user>.github.io/<repo>/).
// The deploy workflow sets BASE_PATH; locally and on a custom domain it is empty.
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // Fully static site: `next build` writes plain HTML/JS/CSS to `out/`.
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  transpilePackages: ["@tldr/core", "@tldr/core-dom"],
};

export default nextConfig;
