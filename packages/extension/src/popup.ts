import { DEFAULT_PORT, type HealthResponse } from "@keyglow/protocol";
import { LAST_SEND_KEY, PORT_KEY, type LastSend } from "./messages";

function setLine(id: string, text: string, kind: "ok" | "bad" | "idle"): void {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = text;
  element.dataset.kind = kind;
}

async function refresh(): Promise<void> {
  const stored = await chrome.storage.local.get(PORT_KEY);
  const port = typeof stored[PORT_KEY] === "number" ? stored[PORT_KEY] : DEFAULT_PORT;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const health = (await response.json()) as HealthResponse;
    if (health.name !== "keyglow") throw new Error("not keyglow");
    setLine("companion", `Companion running (v${health.version})`, "ok");
    if (health.connected) setLine("keyboard", `Keyboard connected (${health.backend})`, "ok");
    else setLine("keyboard", `Keyboard not connected: ${health.error ?? "unknown error"}`, "bad");
  } catch {
    setLine("companion", "Companion app is not running. Start it with: npx keyglow", "bad");
    setLine("keyboard", "Keyboard: unknown", "idle");
  }

  const session = await chrome.storage.session.get(LAST_SEND_KEY);
  const last = session[LAST_SEND_KEY] as LastSend | undefined;
  if (!last || last.state.status === "closed") {
    setLine("game", "No game open. Open Wordle to light up your keys.", "idle");
  } else {
    const counts = { correct: 0, present: 0, absent: 0 };
    for (const state of Object.values(last.state.keys)) if (state !== "unused") counts[state]++;
    const summary = `${counts.correct} correct, ${counts.present} present, ${counts.absent} absent`;
    if (last.ok) setLine("game", `Showing ${last.state.game}: ${summary}`, "ok");
    else setLine("game", `Could not show ${last.state.game}: ${last.error ?? "unknown error"}`, "bad");
  }
}

void refresh();
