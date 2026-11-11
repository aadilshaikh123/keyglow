// Read-only probe: sends version/info queries only, nothing that changes keyboard state.
import { createRequire } from "node:module";
const require = createRequire(new URL("../packages/companion/package.json", import.meta.url));
const HID = require("node-hid");
const info = HID.devices().find((d) => d.vendorId === 0x36b0 && d.usagePage === 0xff60 && d.usage === 0x61);
if (!info) { console.log("raw HID interface not found"); process.exit(1); }
const dev = new HID.HID(info.path);
const hex = (a) => Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join(" ");
function query(label, bytes) {
  const pkt = new Array(33).fill(0);
  bytes.forEach((b, i) => (pkt[i + 1] = b));
  dev.write(pkt);
  const res = dev.readTimeout(500);
  console.log(label.padEnd(34), res && res.length ? hex(res) : "(no reply)");
}
query("VIA 0x01 protocol version", [0x01]);
query("SignalRGB 0x21 qmk version", [0x21]);
query("SignalRGB 0x22 protocol version", [0x22]);
query("SignalRGB 0x23 unique id", [0x23]);
query("SignalRGB 0x27 total leds", [0x27]);
query("SignalRGB 0x28 firmware type", [0x28]);
dev.close();
