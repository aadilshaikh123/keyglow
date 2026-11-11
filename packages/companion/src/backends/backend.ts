import type { RGB } from "../palette.js";

export interface Backend {
  readonly name: string;
  /** Finds the keyboard and remembers its current lighting so it can be restored. */
  connect(): Promise<void>;
  /** Lights each given letter; every other key on the keyboard is turned off. */
  setLetters(colors: Map<string, RGB>): Promise<void>;
  /** Puts back the lighting that was active before the first setLetters call. */
  restore(): Promise<void>;
  close(): Promise<void>;
}
