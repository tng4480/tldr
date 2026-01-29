import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest(() => ({
  manifest_version: 3,
  name: "TLDR Reading Assistant",
  version: "0.1.0",
  description: "Inline highlights and side panel reading assistant.",
  permissions: ["activeTab", "sidePanel", "storage"],
  host_permissions: ["<all_urls>", "http://localhost:3000/*"],
  background: {
    service_worker: "src/background/serviceWorker.ts",
    type: "module",
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/contentScript.ts"],
      run_at: "document_idle",
    },
  ],
  action: {
    default_title: "TLDR",
  },
}));
