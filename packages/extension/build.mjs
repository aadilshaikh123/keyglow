// Builds the extension twice from the same code:
//   dist/          Chrome, Edge and other Chromium browsers
//   dist-firefox/  Firefox (different background declaration and add-on ID)
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const FIREFOX_ID = "keyglow@aadilshaikh123.github.io";

function firefoxManifest(manifest) {
  const { service_worker, ...background } = manifest.background;
  return {
    ...manifest,
    background: { ...background, scripts: [service_worker] },
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_ID,
        strict_min_version: "140.0",
        // The extension sends data only to the companion on the user's own computer.
        data_collection_permissions: { required: ["none"] },
      },
    },
  };
}

for (const dir of ["dist", "dist-firefox"]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  cpSync("static", dir, { recursive: true });
  await build({
    entryPoints: ["src/content.ts", "src/background.ts", "src/popup.ts"],
    outdir: dir,
    bundle: true,
    format: "iife",
    target: ["chrome120", "firefox140"],
    logLevel: "warning",
  });
}

const manifest = JSON.parse(readFileSync("static/manifest.json", "utf8"));
writeFileSync("dist-firefox/manifest.json", JSON.stringify(firefoxManifest(manifest), null, 2) + "\n");
console.log("built dist/ (Chromium) and dist-firefox/ (Firefox)");
