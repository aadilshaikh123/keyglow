/**
 * Packet layout of the "rdm" raw-HID protocol used by URX keyboards (and other boards built on
 * the same firmware). Worked out from the vendor web driver. Pure functions, no I/O.
 *
 * Every packet is 64 bytes: AA, command, offset (LE16), length, 0, 0, status, then up to 56 data bytes.
 */

export const PACKET_SIZE = 64;
export const CHUNK = 56;
export const HEADER = 0xaa;

export const Cmd = {
  CommStart: 0x10,
  CommStop: 0x11,
  ReadDeviceInfo: 0x12,
  ReadFuncInfo: 0x14,
  SetFuncInfo: 0x15,
  ReadKeyMatrix: 0x1a,
  ReadCustomLight: 0x22,
  SetCustomLight: 0x23,
} as const;

/** Reply status byte (index 7). */
export const STATUS_OK = 0x55;
export const STATUS_NO_SESSION = 0x0f;

/** Function-info block: byte 2 is the lighting mode, byte 10 the custom-light slot. */
export const FUNC_INFO_SIZE = 56;
export const FUNC_LIGHT_MODE = 2;
export const FUNC_CUSTOM_INDEX = 10;
export const LIGHT_MODE_CUSTOM = 253;

export const BYTES_PER_KEY = 3;
/** Device-info block offsets. */
export const DEVINFO_SIZE = 71;
export const DEVINFO_MATRIX_KEYS = 12;
export const DEVINFO_CUSTOM_LIGHT_COUNT = 18;

export function buildPacket(cmd: number, offset = 0, length = 0, data: ArrayLike<number> = []): Uint8Array {
  if (data.length > CHUNK) throw new Error(`packet data too long (${data.length})`);
  const p = new Uint8Array(PACKET_SIZE);
  p[0] = HEADER;
  p[1] = cmd & 255;
  p[2] = offset & 255;
  p[3] = (offset >> 8) & 255;
  p[4] = length & 255;
  for (let i = 0; i < data.length; i++) p[8 + i] = data[i]! & 255;
  return p;
}

/** Splits a block read/write into [offset, length] chunks of at most 56 bytes. */
export function chunks(total: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let off = 0; off < total; off += CHUNK) out.push([off, Math.min(CHUNK, total - off)]);
  return out;
}

/**
 * Lights are numbered left to right, top row first, which is unrelated to the key-matrix order,
 * so each model needs its own table. Each entry gives the light index of the first key of a
 * letter row; the rest of the row follows consecutively.
 */
const LETTER_ROW_STARTS: Record<number, readonly [q: number, a: number, z: number]> = {
  // URX Core65
  0x302e: [15, 30, 44],
};

/** Light index of each letter for a product, or undefined if the model has not been mapped. */
export function letterLights(productId: number): Map<string, number> | undefined {
  const starts = LETTER_ROW_STARTS[productId];
  if (!starts) return undefined;
  const out = new Map<string, number>();
  ["qwertyuiop", "asdfghjkl", "zxcvbnm"].forEach((row, r) => {
    [...row].forEach((letter, i) => out.set(letter, starts[r]! + i));
  });
  return out;
}

/** Builds the full custom-light table: given keys coloured, everything else off. */
export function buildLightTable(keyCount: number, colors: Map<number, readonly [number, number, number]>): Uint8Array {
  const table = new Uint8Array(keyCount * BYTES_PER_KEY);
  for (const [index, [r, g, b]] of colors) {
    if (index < 0 || index >= keyCount) continue;
    table[index * 3] = r;
    table[index * 3 + 1] = g;
    table[index * 3 + 2] = b;
  }
  return table;
}
