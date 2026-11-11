import { parseGameState } from "@keyglow/protocol";
import { describe, expect, it } from "vitest";
import { MockBackend } from "../src/backends/mock.js";
import { lettersFromLedNames } from "../src/backends/openrgb.js";
import { Cmd, buildLightTable, buildPacket, chunks, letterLights } from "../src/backends/rdm-protocol.js";
import { Controller } from "../src/controller.js";
import { DEFAULT_PALETTE, colorsForKeys, parseHexColor, parsePaletteOverrides } from "../src/palette.js";
import { isAllowedOrigin } from "../src/server.js";

const hex = (bytes: Uint8Array, count: number): string =>
  Array.from(bytes.subarray(0, count))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");

describe("rdm packets", () => {
  // Expected bytes are what the vendor driver's own packet builder produces.
  it("builds session and read packets", () => {
    expect(hex(buildPacket(Cmd.CommStart), 8)).toBe("aa 10 00 00 00 00 00 00");
    expect(hex(buildPacket(Cmd.CommStop), 8)).toBe("aa 11 00 00 00 00 00 00");
    expect(hex(buildPacket(Cmd.ReadDeviceInfo, 56, 15), 8)).toBe("aa 12 38 00 0f 00 00 00");
    expect(hex(buildPacket(Cmd.ReadCustomLight, 56, 56), 8)).toBe("aa 22 38 00 38 00 00 00");
  });

  it("builds a single-key colour write", () => {
    // Key 70 -> byte offset 210 (0xd2), three colour bytes.
    expect(hex(buildPacket(Cmd.SetCustomLight, 70 * 3, 3, [255, 0, 9]), 11)).toBe("aa 23 d2 00 03 00 00 00 ff 00 09");
  });

  it("is always 64 bytes and rejects oversized data", () => {
    expect(buildPacket(Cmd.SetFuncInfo, 0, 56, new Array(56).fill(1))).toHaveLength(64);
    expect(() => buildPacket(Cmd.SetFuncInfo, 0, 57, new Array(57).fill(1))).toThrow();
  });

  it("splits blocks into 56-byte chunks", () => {
    expect(chunks(384)).toEqual([
      [0, 56], [56, 56], [112, 56], [168, 56], [224, 56], [280, 56], [336, 48],
    ]);
    expect(chunks(71)).toEqual([[0, 56], [56, 15]]);
  });

  it("maps Core65 letters to row-ordered light positions", () => {
    const lights = letterLights(0x302e)!;
    expect(lights.size).toBe(26);
    expect([lights.get("q"), lights.get("w"), lights.get("p")]).toEqual([15, 16, 24]);
    expect([lights.get("a"), lights.get("s"), lights.get("d"), lights.get("l")]).toEqual([30, 31, 32, 38]);
    expect([lights.get("z"), lights.get("b"), lights.get("m")]).toEqual([44, 48, 50]);
    expect(letterLights(0x9999)).toBeUndefined();
  });

  it("builds a light table with everything else off", () => {
    const table = buildLightTable(4, new Map([[2, [1, 2, 3]], [9, [9, 9, 9]]]));
    expect(Array.from(table)).toEqual([0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 0]);
  });
});

describe("palette", () => {
  it("colours all 26 letters, defaulting to unused", () => {
    const colors = colorsForKeys({ a: "correct", b: "absent" }, DEFAULT_PALETTE);
    expect(colors.size).toBe(26);
    expect(colors.get("a")).toEqual(DEFAULT_PALETTE.correct);
    expect(colors.get("b")).toEqual(DEFAULT_PALETTE.absent);
    expect(colors.get("z")).toEqual(DEFAULT_PALETTE.unused);
  });

  it("parses overrides and rejects bad ones", () => {
    expect(parseHexColor("#FF8000")).toEqual([255, 128, 0]);
    expect(parsePaletteOverrides("absent=400000", DEFAULT_PALETTE).absent).toEqual([64, 0, 0]);
    expect(parsePaletteOverrides("", DEFAULT_PALETTE)).toEqual(DEFAULT_PALETTE);
    expect(() => parsePaletteOverrides("nope=000000", DEFAULT_PALETTE)).toThrow();
    expect(() => parsePaletteOverrides("absent=xyz", DEFAULT_PALETTE)).toThrow();
  });
});

describe("message validation", () => {
  it("accepts a valid message", () => {
    expect(parseGameState({ game: "wordle", status: "playing", keys: { a: "correct" } })).toEqual({
      game: "wordle",
      status: "playing",
      keys: { a: "correct" },
    });
  });

  it("rejects bad input", () => {
    expect(typeof parseGameState(null)).toBe("string");
    expect(typeof parseGameState({ game: "w", status: "nope", keys: {} })).toBe("string");
    expect(typeof parseGameState({ game: "w", status: "playing", keys: { A: "correct" } })).toBe("string");
    expect(typeof parseGameState({ game: "w", status: "playing", keys: { a: "green" } })).toBe("string");
    expect(typeof parseGameState({ game: "w", status: "playing", keys: { __proto__x: "correct" } })).toBe("string");
  });
});

describe("origin check", () => {
  it("allows extensions and local tools, blocks web pages", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin("chrome-extension://abcdefghijklmnop")).toBe(true);
    expect(isAllowedOrigin("https://www.nytimes.com")).toBe(false);
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
    expect(isAllowedOrigin("null")).toBe(false);
  });

  it("pins to one extension when configured", () => {
    expect(isAllowedOrigin("chrome-extension://abc", "abc")).toBe(true);
    expect(isAllowedOrigin("chrome-extension://xyz", "abc")).toBe(false);
  });
});

describe("openrgb led names", () => {
  it("maps Key: X names to letters", () => {
    const letters = lettersFromLedNames(["Key: Escape", "Key: A", "Key: B", "Key: Left Alt", "Key: a"]);
    expect(Object.fromEntries(letters)).toEqual({ a: 1, b: 2 });
  });
});

describe("controller", () => {
  const make = (idleTimeoutMs = 60_000) => {
    const backend = new MockBackend(() => {});
    const controller = new Controller(backend, { palette: DEFAULT_PALETTE, idleTimeoutMs, log: () => {} });
    return { backend, controller };
  };

  it("skips repeated identical frames and restores on close", async () => {
    const { backend, controller } = make();
    await controller.apply({ game: "t", status: "playing", keys: { a: "correct" } });
    await controller.apply({ game: "t", status: "playing", keys: { a: "correct" } });
    await controller.apply({ game: "t", status: "playing", keys: { a: "correct", b: "absent" } });
    expect(backend.calls).toHaveLength(2);
    await controller.apply({ game: "t", status: "closed", keys: {} });
    expect(backend.calls.at(-1)).toBe("restore");
    // A second close has nothing to restore.
    await controller.apply({ game: "t", status: "closed", keys: {} });
    expect(backend.calls).toHaveLength(3);
  });

  it("shows the same frame again after a restore", async () => {
    const { backend, controller } = make();
    const message = { game: "t", status: "playing" as const, keys: { a: "correct" as const } };
    await controller.apply(message);
    await controller.restore();
    await controller.apply(message);
    expect(backend.calls.filter((c) => c !== "restore")).toHaveLength(2);
  });

  it("restores when the extension goes quiet", async () => {
    const { backend, controller } = make(20);
    await controller.apply({ game: "t", status: "playing", keys: {} });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(backend.calls.at(-1)).toBe("restore");
  });

  it("reports a failed keyboard write and recovers on the next frame", async () => {
    const { backend, controller } = make();
    const real = backend.setLetters.bind(backend);
    let fail = true;
    backend.setLetters = async (colors) => {
      if (fail) throw new Error("unplugged");
      return real(colors);
    };
    await expect(controller.apply({ game: "t", status: "playing", keys: {} })).rejects.toThrow("unplugged");
    expect(controller.isConnected).toBe(false);
    fail = false;
    await controller.apply({ game: "t", status: "playing", keys: {} });
    expect(controller.isConnected).toBe(true);
    expect(backend.calls).toHaveLength(1);
  });
});
