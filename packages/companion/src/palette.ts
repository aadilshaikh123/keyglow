import { LETTERS, type KeyState } from "@keyglow/protocol";

export type RGB = readonly [number, number, number];
export type Palette = Record<KeyState, RGB>;

/** Saturated colours: LEDs wash out the muted tones the game uses on screen. */
export const DEFAULT_PALETTE: Palette = {
  correct: [0, 200, 0],
  present: [255, 150, 0],
  absent: [200, 0, 0],
  unused: [70, 70, 70],
};

/**
 * Matches the game's high-contrast mode: orange = correct, blue = present.
 * Absent stays off here: red next to orange is hard to tell apart for the people this mode is for.
 */
export const HIGH_CONTRAST_PALETTE: Palette = {
  correct: [255, 90, 0],
  present: [0, 110, 255],
  absent: [0, 0, 0],
  unused: [70, 70, 70],
};

export function parseHexColor(text: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(text.trim());
  if (!m) throw new Error(`"${text}" is not a 6-digit hex colour`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Parses "correct=00c800,absent=400000" into palette overrides. */
export function parsePaletteOverrides(text: string, base: Palette): Palette {
  const out: Palette = { ...base };
  for (const part of text.split(",").filter(Boolean)) {
    const [name, hex] = part.split("=");
    if (!name || !hex || !(name in out)) throw new Error(`bad colour override "${part}"`);
    out[name as KeyState] = parseHexColor(hex);
  }
  return out;
}

/** Colour for every letter a-z; letters missing from `keys` are "unused". */
export function colorsForKeys(keys: Record<string, KeyState>, palette: Palette): Map<string, RGB> {
  const out = new Map<string, RGB>();
  for (const letter of LETTERS) out.set(letter, palette[keys[letter] ?? "unused"]);
  return out;
}
