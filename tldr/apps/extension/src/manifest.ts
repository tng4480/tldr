import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest(() => ({
  manifest_version: 3,
  name: "TLDR Reading Assistant",
  version: "1.2.0",
  description: "Inline highlights and side panel reading assistant.",
  icons: {
    16: "tldr16.png",
    32: "tldr32.png",
    48: "tldr48.png",
    128: "tldr128.png",
  },
  permissions: ["activeTab", "sidePanel", "storage", "scripting", "contextMenus"],
  host_permissions: ["https://*/*", "http://*/*"],
  background: {
    service_worker: "src/background/serviceWorker.ts",
    type: "module",
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  content_scripts: [
    {
      matches: ["https://*/*", "http://*/*"],
      js: ["src/content/contentScript.ts"],
      run_at: "document_idle",
    },
  ],
  web_accessible_resources: [
    {
      resources: ["tldr.png"],
      matches: ["https://*/*", "http://*/*"],
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
