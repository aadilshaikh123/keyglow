#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DEFAULT_PORT, type KeyState } from "@keyglow/protocol";
import type { Backend } from "./backends/backend.js";
import { MockBackend } from "./backends/mock.js";
import { OpenRgbBackend } from "./backends/openrgb.js";
import { UrxRdmBackend } from "./backends/urx-rdm.js";
import { Controller } from "./controller.js";
import { DEFAULT_PALETTE, HIGH_CONTRAST_PALETTE, parsePaletteOverrides } from "./palette.js";
import { createKeyglowServer } from "./server.js";

const HELP = `keyglow - mirror word-game key colours onto your RGB keyboard

Usage:
  keyglow [run]     Start the companion and wait for the browser extension
  keyglow test      Light a sample game state, hold until Ctrl+C, then restore

Options:
  --backend <name>      auto (default), urx, openrgb, mock
  --port <number>       Port to listen on (default ${DEFAULT_PORT})
  --high-contrast       Orange/blue instead of green/yellow
  --colors <list>       Override colours, e.g. absent=400000,unused=303030
  --extension-id <id>   Only accept requests from this extension ID
  --help
`;

const log = (line: string): void => console.log(`[keyglow] ${line}`);

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  return pkg.version;
}

/** "auto" tries the direct USB backend first, then OpenRGB. */
async function pickBackend(name: string): Promise<Backend> {
  if (name === "mock") return new MockBackend();
  if (name === "urx") return new UrxRdmBackend();
  if (name === "openrgb") return new OpenRgbBackend();
  if (name !== "auto") throw new Error(`unknown backend "${name}"`);
  const errors: string[] = [];
  for (const candidate of [new UrxRdmBackend(), new OpenRgbBackend()]) {
    try {
      await candidate.connect();
      await candidate.close();
      return candidate;
    } catch (err) {
      errors.push(`${candidate.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`no usable keyboard backend.\n  ${errors.join("\n  ")}`);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      backend: { type: "string", default: "auto" },
      port: { type: "string", default: String(DEFAULT_PORT) },
      "high-contrast": { type: "boolean", default: false },
      colors: { type: "string", default: "" },
      "extension-id": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  const command = positionals[0] ?? "run";
  if (values.help || !["run", "test"].includes(command)) {
    console.log(HELP);
    process.exitCode = values.help ? 0 : 1;
    return;
  }

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`invalid port "${values.port}"`);
  const palette = parsePaletteOverrides(values.colors, values["high-contrast"] ? HIGH_CONTRAST_PALETTE : DEFAULT_PALETTE);
  const backend = await pickBackend(values.backend);
  const controller = new Controller(backend, { palette, idleTimeoutMs: 60_000, log });
  await controller.connect();
  if (!controller.isConnected) throw new Error(controller.lastError ?? "keyboard not connected");
  log(`keyboard ready (backend: ${backend.name})`);

  let stopping = false;
  const stop = (closeServer?: () => void): void => {
    if (stopping) return;
    stopping = true;
    log("restoring keyboard lighting");
    closeServer?.();
    void controller.shutdown().finally(() => process.exit(0));
  };

  if (command === "test") {
    const keys: Record<string, KeyState> = { a: "correct", b: "present", c: "absent" };
    await controller.apply({ game: "test", status: "playing", keys });
    log("A should show as correct, B as present, C as absent (red by default), other letters dim white, the rest off.");
    log("Press Ctrl+C to restore your lighting.");
    // The controller's idle timer would restore after a minute; keep the test frame up until Ctrl+C.
    const keepAlive = setInterval(() => void controller.apply({ game: "test", status: "playing", keys }), 30_000);
    const end = (): void => {
      clearInterval(keepAlive);
      stop();
    };
    process.on("SIGINT", end);
    process.on("SIGTERM", end);
    return;
  }

  const server = createKeyglowServer(controller, { version: version(), extensionId: values["extension-id"], log });
  server.on("error", (err: NodeJS.ErrnoException) => {
    console.error(err.code === "EADDRINUSE" ? `[keyglow] port ${port} is in use (is keyglow already running?)` : `[keyglow] ${err.message}`);
    void controller.shutdown().finally(() => process.exit(1));
  });
  server.listen(port, "127.0.0.1", () => log(`listening on http://127.0.0.1:${port} - open the game in your browser`));
  const end = (): void => stop(() => server.close());
  process.on("SIGINT", end);
  process.on("SIGTERM", end);
}

main().catch((err: unknown) => {
  console.error(`[keyglow] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
