import { LETTERS, type GameStatus, type KeyState } from "@keyglow/protocol";

/** Reads one game's page. Add an adapter (and a manifest match) to support another game. */
export interface GameAdapter {
  game: string;
  matches(location: Location): boolean;
  /** Letter states from the on-screen keyboard, or null while the keyboard is not on the page. */
  readKeys(root: ParentNode): Record<string, KeyState> | null;
  readStatus(root: ParentNode): Exclude<GameStatus, "closed">;
}

const STATE_WORDS: readonly KeyState[] = ["correct", "present", "absent"];

function stateFrom(element: Element): KeyState {
  const state = element.getAttribute("data-state");
  if (state && (STATE_WORDS as readonly string[]).includes(state)) return state as KeyState;
  // Fallback if the attribute is renamed: the accessible label also names the state.
  const label = (element.getAttribute("aria-label") ?? "").toLowerCase();
  for (const word of STATE_WORDS) if (new RegExp(`\\b${word}\\b`).test(label)) return word;
  return "unused";
}

export const wordleAdapter: GameAdapter = {
  game: "wordle",

  matches: (location) => location.hostname === "www.nytimes.com" && location.pathname.startsWith("/games/wordle"),

  readKeys(root) {
    const keys: Record<string, KeyState> = {};
    let found = 0;
    for (const button of root.querySelectorAll("button[data-key]")) {
      const key = (button.getAttribute("data-key") ?? "").toLowerCase();
      if (key.length !== 1 || !LETTERS.includes(key)) continue;
      found++;
      keys[key] = stateFrom(button);
    }
    return found >= 26 ? keys : null;
  },

  readStatus(root) {
    const tiles = [...root.querySelectorAll('[data-testid="tile"], [aria-roledescription="tile"]')];
    if (tiles.length === 0 || tiles.length % 5 !== 0) return "playing";
    const states = tiles.map((tile) => tile.getAttribute("data-state") ?? "");
    let scoredRows = 0;
    for (let row = 0; row < states.length; row += 5) {
      const cells = states.slice(row, row + 5);
      if (cells.every((s) => s === "correct")) return "won";
      if (cells.every((s) => (STATE_WORDS as readonly string[]).includes(s))) scoredRows++;
    }
    return scoredRows === states.length / 5 ? "lost" : "playing";
  },
};

export const adapters: readonly GameAdapter[] = [wordleAdapter];
