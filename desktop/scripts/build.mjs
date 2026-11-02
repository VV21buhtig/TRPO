import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });

await build({
  entryPoints: ["src/renderer.ts"],
  bundle: true,
  outfile: "dist/renderer.js",
  format: "iife",
  target: ["chrome126"],
  sourcemap: false,
  logLevel: "info",
});

await copyFile("src/index.html", "dist/index.html");
await copyFile("src/styles.css", "dist/styles.css");

console.log("desktop build: renderer + static assets ready");
