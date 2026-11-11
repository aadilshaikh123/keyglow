// Draws the extension icon (four keycaps: green, yellow, red, grey) as PNGs. No dependencies.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
// Signed-distance rounded rectangle in unit coordinates.
const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r)), dy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return dx * dx + dy * dy <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1;
};
const BG = [31, 31, 32], KEYS = [[[0, 200, 0], 0, 0], [[255, 170, 0], 1, 0], [[214, 40, 40], 0, 1], [[150, 150, 150], 1, 1]];
function shade(x, y) {
  if (!inRoundRect(x, y, 0, 0, 1, 1, 0.2)) return null;
  const pad = 0.14, gap = 0.08, k = (1 - 2 * pad - gap) / 2;
  for (const [color, cx, cy] of KEYS) {
    const x0 = pad + cx * (k + gap), y0 = pad + cy * (k + gap);
    if (inRoundRect(x, y, x0, y0, x0 + k, y0 + k, k * 0.22)) return color;
  }
  return BG;
}
const OUT = { 300: "../store/edge/logo-300.png" };
for (const size of [16, 32, 48, 128, 300]) {
  const SS = 4, rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const i = (py * size + px) * 4;
    if (a) { rgba[i] = r / a; rgba[i + 1] = g / a; rgba[i + 2] = b / a; rgba[i + 3] = (255 * a) / (SS * SS); }
  }
  writeFileSync(new URL(OUT[size] ?? `../packages/extension/static/icons/icon-${size}.png`, import.meta.url), png(size, rgba));
}
console.log("icons written");
