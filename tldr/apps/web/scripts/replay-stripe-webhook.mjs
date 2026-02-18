#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current?.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      args[key] = value;
      i += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const baseUrl = args.baseUrl ?? process.env.WEB_BASE_URL;
const eventFile = args.eventFile ?? process.env.STRIPE_EVENT_FILE;
const signature = args.signature ?? process.env.STRIPE_SIGNATURE;

if (!baseUrl || !eventFile || !signature) {
  console.error(
    "Usage: node scripts/replay-stripe-webhook.mjs --baseUrl <url> --eventFile <path> --signature <sig>",
  );
  process.exit(1);
}

const absoluteEventPath = path.resolve(eventFile);
const rawBody = await fs.readFile(absoluteEventPath, "utf8");

const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/stripe/webhook`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "stripe-signature": signature,
  },
  body: rawBody,
});

const payload = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error("Webhook replay failed", response.status, payload);
  process.exit(1);
}

console.log("Webhook replay succeeded", payload);
