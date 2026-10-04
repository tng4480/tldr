import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.resolve(__dirname, "../public");
const sourcePath = path.join(publicDir, "tldr.png");

const sizes = [16, 32, 48, 128];

async function main() {
  await mkdir(publicDir, { recursive: true });

  try {
    await stat(sourcePath);
  } catch {
    throw new Error(`Missing source icon: ${sourcePath}`);
  }

  await Promise.all(
    sizes.map(async (size) => {
      const outPath = path.join(publicDir, `tldr${size}.png`);
      await sharp(sourcePath)
        .resize(size, size, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ compressionLevel: 9 })
        .toFile(outPath);
      const meta = await sharp(outPath).metadata();
      // eslint-disable-next-line no-console
      console.log(`Wrote ${path.relative(process.cwd(), outPath)} (${meta.width}x${meta.height})`);
    }),
  );
}

await main();

