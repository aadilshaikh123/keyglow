import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import HID from "node-hid";
import type { RGB } from "../palette.js";
import type { Backend } from "./backend.js";
import {
  BYTES_PER_KEY,
  Cmd,
  DEVINFO_MATRIX_KEYS,
  DEVINFO_SIZE,
  FUNC_CUSTOM_INDEX,
  FUNC_INFO_SIZE,
  FUNC_LIGHT_MODE,
  HEADER,
  LIGHT_MODE_CUSTOM,
  STATUS_NO_SESSION,
  buildLightTable,
  buildPacket,
  chunks,
  letterLights,
} from "./rdm-protocol.js";

const RAW_HID_USAGE_PAGE = 0xff60;
const RAW_HID_USAGE = 0x61;
/** Vendor ID shared by URX and other boards on this firmware family. A handshake confirms the protocol. */
const VENDOR_IDS = [0x36b0];
const REPLY_TIMEOUT_MS = 1000;

interface Snapshot {
  funcInfo: number[];
  lightTable: number[];
}

/**
 * Drives keyboards that speak the "rdm" raw-HID protocol (URX Core65 and relatives) directly,
 * with no vendor software running. Switches the board to its custom per-key mode while a game
 * is shown and writes the previous mode and colours back on restore.
 */
export class UrxRdmBackend implements Backend {
  readonly name = "urx";
  private dev: HID.HIDAsync | undefined;
  private keyCount = 0;
  private letterIndex = new Map<string, number>();
  private original: Snapshot | undefined;
  private written: Uint8Array | undefined;
  private snapshotPath = "";

  async connect(): Promise<void> {
    const candidates = (await HID.devicesAsync()).filter(
      (d) => VENDOR_IDS.includes(d.vendorId) && d.usagePage === RAW_HID_USAGE_PAGE && d.usage === RAW_HID_USAGE && d.path,
    );
    if (candidates.length === 0) throw new Error("no supported keyboard found (is it plugged in by USB cable?)");

    let lastError: unknown;
    for (const info of candidates) {
      try {
        this.dev = await HID.HIDAsync.open(info.path!);
        await this.startSession();
        const devInfo = await this.readBlock(Cmd.ReadDeviceInfo, DEVINFO_SIZE);
        if (devInfo[0] !== 0xaa || devInfo[1] !== 0xbb) throw new Error("keyboard did not identify as an rdm device");
        this.keyCount = devInfo[DEVINFO_MATRIX_KEYS]!;
        const lights = letterLights(info.productId);
        if (!lights) throw new Error(`${info.product ?? "this keyboard"} speaks the right protocol but its light layout is not mapped yet`);
        this.letterIndex = lights;

        const id = `${info.vendorId.toString(16)}-${info.productId.toString(16)}`;
        this.snapshotPath = join(tmpdir(), `keyglow-rdm-${id}.json`);
        this.original = await this.takeSnapshot();
        // A previous run was killed mid-game: put the saved lighting back straight away.
        if (this.written) await this.restore();
        await this.stopSession();
        return;
      } catch (err) {
        lastError = err;
        await this.close();
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async setLetters(colors: Map<string, RGB>): Promise<void> {
    if (!this.dev || !this.original) throw new Error("keyboard not connected");
    const byIndex = new Map<number, RGB>();
    for (const [letter, rgb] of colors) {
      const index = this.letterIndex.get(letter);
      if (index !== undefined) byIndex.set(index, rgb);
    }
    const table = buildLightTable(this.keyCount, byIndex);

    await this.startSession();
    try {
      if (!this.written) {
        // First frame of a game: keep a copy of the user's lighting on disk in case we are killed mid-game.
        writeFileSync(this.snapshotPath, JSON.stringify(this.original));
        const func = Uint8Array.from(this.original.funcInfo);
        func[FUNC_LIGHT_MODE] = LIGHT_MODE_CUSTOM;
        func[FUNC_CUSTOM_INDEX] = 0;
        // Mode first, colours second: the firmware acknowledges but drops a mode change that
        // follows colour writes made while another mode is active.
        await this.writeFuncInfo(func);
        await this.writeTable(table, undefined);
      } else {
        await this.writeTable(table, this.written);
      }
      this.written = table;
    } finally {
      await this.stopSession();
    }
  }

  async restore(): Promise<void> {
    if (!this.dev || !this.original || !this.written) return;
    await this.startSession();
    try {
      await this.writeTable(Uint8Array.from(this.original.lightTable), this.written);
      await this.writeFuncInfo(Uint8Array.from(this.original.funcInfo));
      this.written = undefined;
      rmSync(this.snapshotPath, { force: true });
    } finally {
      await this.stopSession();
    }
  }

  async close(): Promise<void> {
    const dev = this.dev;
    this.dev = undefined;
    if (dev) await dev.close().catch(() => {});
  }

  /**
   * Reads the lighting to restore later. If a previous run was killed before it could restore,
   * the keyboard still shows our colours, so the copy saved on disk is the real original.
   */
  private async takeSnapshot(): Promise<Snapshot> {
    const funcInfo = Array.from(await this.readBlock(Cmd.ReadFuncInfo, FUNC_INFO_SIZE));
    const lightTable = Array.from(await this.readBlock(Cmd.ReadCustomLight, this.keyCount * BYTES_PER_KEY));
    if (existsSync(this.snapshotPath)) {
      try {
        const saved = JSON.parse(readFileSync(this.snapshotPath, "utf8")) as Snapshot;
        const valid =
          Array.isArray(saved.funcInfo) &&
          saved.funcInfo.length === FUNC_INFO_SIZE &&
          Array.isArray(saved.lightTable) &&
          saved.lightTable.length === lightTable.length;
        if (valid && funcInfo[FUNC_LIGHT_MODE] === LIGHT_MODE_CUSTOM) {
          // Mark the table as ours so restore() will write the saved one back.
          this.written = Uint8Array.from(lightTable);
          return saved;
        }
      } catch {
        // Unreadable file: fall through and trust the keyboard.
      }
      rmSync(this.snapshotPath, { force: true });
    }
    return { funcInfo, lightTable };
  }

  /** Writes the settings block and reads it back, retrying if the keyboard did not apply it. */
  private async writeFuncInfo(func: Uint8Array): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.transact(buildPacket(Cmd.SetFuncInfo, 0, FUNC_INFO_SIZE, func));
      const now = await this.readBlock(Cmd.ReadFuncInfo, FUNC_INFO_SIZE);
      if (now.every((b, i) => b === func[i])) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("keyboard did not apply the lighting mode change");
  }

  /** Writes only the 56-byte chunks that differ from what the keyboard already has. */
  private async writeTable(table: Uint8Array, previous: Uint8Array | undefined): Promise<void> {
    for (const [offset, length] of chunks(table.length)) {
      const next = table.subarray(offset, offset + length);
      const same = previous !== undefined && next.every((b, i) => previous[offset + i] === b);
      if (!same) await this.transact(buildPacket(Cmd.SetCustomLight, offset, length, next));
    }
  }

  private async readBlock(cmd: number, total: number): Promise<Uint8Array> {
    const out = new Uint8Array(total);
    for (const [offset, length] of chunks(total)) {
      const reply = await this.transact(buildPacket(cmd, offset, length));
      out.set(reply.subarray(8, 8 + length), offset);
    }
    return out;
  }

  private async startSession(): Promise<void> {
    await this.send(buildPacket(Cmd.CommStart));
  }

  private async stopSession(): Promise<void> {
    await this.send(buildPacket(Cmd.CommStop)).catch(() => {});
  }

  /** Sends a packet; if the keyboard says the session lapsed, reopens it and retries once. */
  private async transact(packet: Uint8Array): Promise<Uint8Array> {
    let reply = await this.send(packet);
    if (reply[7] === STATUS_NO_SESSION) {
      await this.startSession();
      reply = await this.send(packet);
      if (reply[7] === STATUS_NO_SESSION) throw new Error("keyboard refused to open a session");
    }
    return reply;
  }

  private async send(packet: Uint8Array): Promise<Uint8Array> {
    const dev = this.dev;
    if (!dev) throw new Error("keyboard not connected");
    // Leading 0 is the HID report ID.
    await dev.write([0, ...packet]);
    const deadline = Date.now() + REPLY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const reply = await dev.read(Math.max(1, deadline - Date.now()));
      if (reply && reply.length >= 8 && reply[0] === HEADER && reply[1] === packet[1]) return Uint8Array.from(reply);
    }
    throw new Error(`keyboard did not answer command 0x${packet[1]!.toString(16)}`);
  }
}
