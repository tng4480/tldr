import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest(() => ({
  manifest_version: 3,
  name: "TLDR Reading Assistant",
  version: "0.1.0",
  description: "Inline highlights and side panel reading assistant.",
  icons: {
    16: "tldr16.png",
    32: "tldr32.png",
    48: "tldr48.png",
    128: "tldr128.png",
  },
  permissions: ["activeTab", "sidePanel", "storage", "scripting"],
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
  web_accessible_resources: [
    {
      resources: ["tldr.png"],
      matches: ["<all_urls>"],
    },
  ],
  action: {
    default_title: "TLDR",
    default_icon: {
      16: "tldr16.png",
      32: "tldr32.png",
      48: "tldr48.png",
      128: "tldr128.png",
    },
  },
}));
