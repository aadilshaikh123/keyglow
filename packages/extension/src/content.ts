import type { GameStateMessage } from "@keyglow/protocol";
import { adapters } from "./adapters";
import type { StateRequest } from "./messages";

const DEBOUNCE_MS = 150;
/** Re-send regularly so the companion knows the game is still open (it restores after 60 s of silence). */
const HEARTBEAT_MS = 20_000;

const adapter = adapters.find((a) => a.matches(location));

if (adapter) {
  let shown = false;
  let lastSent = "";
  let timer: number | undefined;

  const send = (state: GameStateMessage): void => {
    const request: StateRequest = { type: "keyglow-state", state };
    // Fails only when the extension was reloaded under this page; nothing useful to do then.
    chrome.runtime.sendMessage(request).catch(() => {});
  };

  const publish = (force: boolean): void => {
    const keys = adapter.readKeys(document);
    if (keys === null) {
      // Keyboard not on the page (welcome screen, or navigated away inside the app).
      if (shown) {
        shown = false;
        lastSent = "";
        send({ game: adapter.game, status: "closed", keys: {} });
      }
      return;
    }
    const state: GameStateMessage = { game: adapter.game, status: adapter.readStatus(document), keys };
    const text = JSON.stringify(state);
    if (!force && text === lastSent) return;
    shown = true;
    lastSent = text;
    send(state);
  };

  const schedule = (): void => {
    clearTimeout(timer);
    timer = window.setTimeout(() => publish(false), DEBOUNCE_MS);
  };

  new MutationObserver(schedule).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-state", "aria-label"],
  });
  window.setInterval(() => publish(true), HEARTBEAT_MS);
  window.addEventListener("pagehide", () => {
    if (shown) send({ game: adapter.game, status: "closed", keys: {} });
  });
  // Coming back from the back/forward cache: show the game again.
  window.addEventListener("pageshow", () => publish(true));
  publish(true);
}
