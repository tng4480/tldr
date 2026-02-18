import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (mode === "production" && !env.VITE_API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is required for production extension builds.");
  }

  return {
    plugins: [react(), crx({ manifest })],
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
