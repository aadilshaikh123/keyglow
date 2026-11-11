import type { GameStateMessage } from "@keyglow/protocol";

/** Content script -> service worker. */
export interface StateRequest {
  type: "keyglow-state";
  state: GameStateMessage;
}

/** Result of the last attempt to reach the companion, kept for the popup. */
export interface LastSend {
  at: number;
  ok: boolean;
  error?: string;
  state: GameStateMessage;
}

export const LAST_SEND_KEY = "lastSend";
export const PORT_KEY = "port";
