// Bundles the CLI into one file. @keyglow/protocol is a private workspace package, so it is
// inlined; real npm dependencies stay external (node-hid ships native binaries).
import { readFileSync, rmSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
rmSync("dist", { recursive: true, force: true });
await build({
  entryPoints: ["src/cli.ts"],
  outfile: "dist/cli.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: Object.keys(pkg.dependencies ?? {}),
  logLevel: "info",
});
