import type { RGB } from "../palette.js";
import type { Backend } from "./backend.js";

/** Prints what would be shown. For developing without a keyboard. */
export class MockBackend implements Backend {
  readonly name = "mock";
  readonly calls: Array<Map<string, RGB> | "restore"> = [];
  constructor(private readonly log: (line: string) => void = console.log) {}

  async connect(): Promise<void> {}

  async setLetters(colors: Map<string, RGB>): Promise<void> {
    this.calls.push(colors);
    for (const row of ["qwertyuiop", "asdfghjkl", "zxcvbnm"]) {
      const cells = [...row].map((letter) => {
        const [r, g, b] = colors.get(letter) ?? [0, 0, 0];
        return `\x1b[48;2;${r};${g};${b}m ${letter.toUpperCase()} \x1b[0m`;
      });
      this.log(cells.join(""));
    }
  }

  async restore(): Promise<void> {
    this.calls.push("restore");
    this.log("[mock] lighting restored");
  }

  async close(): Promise<void> {}
}
