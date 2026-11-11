import { DEFAULT_PORT, parseGameState } from "@keyglow/protocol";
import { LAST_SEND_KEY, PORT_KEY, type LastSend, type StateRequest } from "./messages";

async function companionUrl(path: string): Promise<string> {
  const stored = await chrome.storage.local.get(PORT_KEY);
  const port = typeof stored[PORT_KEY] === "number" ? stored[PORT_KEY] : DEFAULT_PORT;
  return `http://127.0.0.1:${port}${path}`;
}

async function forward(request: StateRequest): Promise<void> {
  const record: LastSend = { at: Date.now(), ok: false, state: request.state };
  try {
    const response = await fetch(await companionUrl("/state"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request.state),
    });
    if (response.ok) {
      record.ok = true;
    } else {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      record.error = body.error ?? `companion answered ${response.status}`;
    }
  } catch {
    record.error = "companion app is not running";
  }
  await chrome.storage.session.set({ [LAST_SEND_KEY]: record });
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const request = message as Partial<StateRequest> | null;
  // Only our own content scripts may send states, and the payload is re-validated here.
  if (sender.id !== chrome.runtime.id || request?.type !== "keyglow-state") return false;
  const state = parseGameState(request.state);
  if (typeof state === "string") return false;
  void forward({ type: "keyglow-state", state }).then(() => sendResponse(true));
  return true; // keep the service worker alive until the POST finishes
});
