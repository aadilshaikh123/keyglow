import { LETTERS } from "@keyglow/protocol";
import openrgb, { type Client, type RGBColor } from "openrgb-sdk";
import type { RGB } from "../palette.js";
import type { Backend } from "./backend.js";

const DEVICE_TYPE_KEYBOARD = 5;


/** Maps OpenRGB LED names such as "Key: A" to letters. */
export function lettersFromLedNames(names: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  names.forEach((name, index) => {
    const m = /^Key: ([A-Z])$/i.exec(name.trim());
    if (!m) return;
    const letter = m[1]!.toLowerCase();
    if (LETTERS.includes(letter) && !out.has(letter)) out.set(letter, index);
  });
  return out;
}

/**
 * Drives any keyboard OpenRGB supports, through OpenRGB's SDK server
 * (OpenRGB must be running with "SDK Server" started, default port 6742).
 */
export class OpenRgbBackend implements Backend {
  readonly name = "openrgb";
  private client: Client | undefined;
  private deviceId = -1;
  private ledCount = 0;
  private letterIndex = new Map<string, number>();
  private original: { mode: number; colors: RGBColor[] } | undefined;
  private active = false;

  constructor(
    private readonly host = "127.0.0.1",
    private readonly port = 6742,
  ) {}

  async connect(): Promise<void> {
    const client = new openrgb.Client("KeyGlow", this.port, this.host);
    try {
      await client.connect(2000);
    } catch {
      throw new Error(`cannot reach OpenRGB at ${this.host}:${this.port} (start OpenRGB and its SDK Server)`);
    }
    this.client = client;
    const devices = await client.getAllControllerData();
    const keyboard = devices.find((d) => d.type === DEVICE_TYPE_KEYBOARD && lettersFromLedNames(d.leds.map((l) => l.name)).size === 26);
    if (!keyboard) throw new Error("OpenRGB has no keyboard with per-key lighting");
    this.deviceId = keyboard.deviceId;
    this.ledCount = keyboard.colors.length;
    this.letterIndex = lettersFromLedNames(keyboard.leds.map((l) => l.name));
    this.original = { mode: keyboard.activeMode, colors: keyboard.colors.map((c) => ({ ...c })) };
  }

  async setLetters(colors: Map<string, RGB>): Promise<void> {
    if (!this.client) throw new Error("OpenRGB not connected");
    if (!this.active) {
      await this.client.updateMode(this.deviceId, "Direct");
      this.active = true;
    }
    const frame: RGBColor[] = Array.from({ length: this.ledCount }, () => ({ red: 0, green: 0, blue: 0 }));
    for (const [letter, [red, green, blue]] of colors) {
      const index = this.letterIndex.get(letter);
      if (index !== undefined) frame[index] = { red, green, blue };
    }
    this.client.updateLeds(this.deviceId, frame);
  }

  async restore(): Promise<void> {
    if (!this.client || !this.original || !this.active) return;
    this.client.updateLeds(this.deviceId, this.original.colors);
    await this.client.updateMode(this.deviceId, this.original.mode);
    this.active = false;
  }

  async close(): Promise<void> {
    this.client?.disconnect();
    this.client = undefined;
  }
}
