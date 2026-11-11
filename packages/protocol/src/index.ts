/** State of one letter key, as shown on the game's on-screen keyboard. */
export type KeyState = "correct" | "present" | "absent" | "unused";

export type GameStatus = "playing" | "won" | "lost" | "closed";

/** Message the extension POSTs to the companion at /state. */
export interface GameStateMessage {
  /** Identifier of the game adapter that produced the state, e.g. "wordle". */
  game: string;
  /** Lower-case letter -> state. Letters not listed are treated as "unused". */
  keys: Record<string, KeyState>;
  status: GameStatus;
}

export interface HealthResponse {
  ok: true;
  name: "keyglow";
  version: string;
  backend: string;
  /** False when the keyboard could not be reached; `error` says why. */
  connected: boolean;
  error?: string;
}

export const DEFAULT_PORT = 47652;
export const KEY_STATES: readonly KeyState[] = ["correct", "present", "absent", "unused"];
export const GAME_STATUSES: readonly GameStatus[] = ["playing", "won", "lost", "closed"];
export const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** Validates untrusted JSON. Returns the message, or a string describing the problem. */
export function parseGameState(value: unknown): GameStateMessage | string {
  if (typeof value !== "object" || value === null) return "body must be a JSON object";
  const v = value as Record<string, unknown>;
  if (typeof v.game !== "string" || v.game.length === 0 || v.game.length > 40) return "game must be a short string";
  if (typeof v.status !== "string" || !GAME_STATUSES.includes(v.status as GameStatus)) return "invalid status";
  if (typeof v.keys !== "object" || v.keys === null) return "keys must be an object";
  const keys: Record<string, KeyState> = {};
  for (const [k, s] of Object.entries(v.keys as Record<string, unknown>)) {
    if (k.length !== 1 || !LETTERS.includes(k)) return `invalid key "${k}"`;
    if (typeof s !== "string" || !KEY_STATES.includes(s as KeyState)) return `invalid state for "${k}"`;
    keys[k] = s as KeyState;
  }
  return { game: v.game, status: v.status as GameStatus, keys };
}
