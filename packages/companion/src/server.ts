import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { parseGameState, type HealthResponse } from "@keyglow/protocol";
import type { Controller } from "./controller.js";

const MAX_BODY_BYTES = 4096;

export interface ServerOptions {
  version: string;
  /** If set, only this extension ID may call the server. Otherwise any browser extension may. */
  extensionId?: string;
  log: (line: string) => void;
}

/**
 * Browsers attach an Origin header to requests made by pages and extensions. Ordinary web pages
 * must not be able to drive the keyboard, so only extension origins are accepted. Requests
 * with no Origin come from local tools such as curl, which could reach the keyboard anyway.
 */
export function isAllowedOrigin(origin: string | undefined, extensionId?: string): boolean {
  if (origin === undefined) return true;
  const m = /^(chrome-extension|moz-extension):\/\/([a-z0-9-]+)$/i.exec(origin);
  if (!m) return false;
  return extensionId === undefined || m[2] === extensionId;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      parts.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", reject);
  });
}

export function createKeyglowServer(controller: Controller, options: ServerOptions): Server {
  return createServer((req, res) => {
    void handle(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      options.log(`error: ${message}`);
      if (!res.headersSent) send(res, 500, { ok: false, error: message });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Refuse anything not addressed to loopback by name, which blocks DNS-rebinding tricks.
    const host = (req.headers.host ?? "").replace(/:\d+$/, "");
    if (host !== "127.0.0.1" && host !== "localhost") return send(res, 403, { ok: false, error: "bad host" });
    if (!isAllowedOrigin(req.headers.origin, options.extensionId)) return send(res, 403, { ok: false, error: "origin not allowed" });

    if (req.method === "GET" && req.url === "/health") {
      if (!controller.isConnected) await controller.connect();
      const health: HealthResponse = {
        ok: true,
        name: "keyglow",
        version: options.version,
        backend: controller.backend.name,
        connected: controller.isConnected,
        ...(controller.lastError ? { error: controller.lastError } : {}),
      };
      return send(res, 200, health);
    }

    if (req.method === "POST" && req.url === "/state") {
      let json: unknown;
      try {
        json = JSON.parse(await readBody(req));
      } catch {
        return send(res, 400, { ok: false, error: "invalid JSON" });
      }
      const message = parseGameState(json);
      if (typeof message === "string") return send(res, 400, { ok: false, error: message });
      try {
        await controller.apply(message);
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        options.log(`keyboard error: ${text}`);
        return send(res, 503, { ok: false, error: text });
      }
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { ok: false, error: "not found" });
  }
}
