// Read-only dump of URX "rdm" protocol state: device info, function info, custom light table, key matrix.
import { createRequire } from "node:module";
const require = createRequire(new URL("../packages/companion/package.json", import.meta.url));
const HID = require("node-hid");
const info = HID.devices().find((d) => d.vendorId === 0x36b0 && d.usagePage === 0xff60 && d.usage === 0x61);
const dev = new HID.HID(info.path);
const hex = (a) => Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join(" ");
function tx(cmd, off = 0, len = 0, data = []) {
  const p = new Array(65).fill(0);
  p[1] = 0xaa; p[2] = cmd; p[3] = off & 255; p[4] = (off >> 8) & 255; p[5] = len;
  data.forEach((b, i) => (p[9 + i] = b));
  dev.write(p);
  for (let i = 0; i < 5; i++) {
    const r = dev.readTimeout(1000);
    if (r && r.length && r[0] === 0xaa && r[1] === cmd) return r;
  }
  throw new Error("no reply to cmd 0x" + cmd.toString(16));
}
function readBlock(cmd, total) {
  const out = [];
  for (let off = 0; off < total; off += 56) {
    const len = Math.min(56, total - off);
    out.push(...tx(cmd, off, len).slice(8, 8 + len));
  }
  return out;
}
try {
  console.log("start    ", hex(tx(0x10).slice(0, 12)));
  console.log("devinfo  ", hex(readBlock(0x12, 71)));
  console.log("funcinfo ", hex(readBlock(0x14, 64)));
  const light = readBlock(0x22, 384);
  console.log("light    ", hex(light));
  const matrix = readBlock(0x1a, 512);
  console.log("matrix   ", hex(matrix));
} finally {
  try { console.log("stop     ", hex(tx(0x11).slice(0, 12))); } catch (e) { console.log("stop failed", e.message); }
  dev.close();
}
