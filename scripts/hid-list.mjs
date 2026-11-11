import { createRequire } from "node:module";
const require = createRequire(new URL("../packages/companion/package.json", import.meta.url));
const HID = require("node-hid");
for (const d of HID.devices().filter((d) => d.vendorId === 0x36b0)) {
  console.log({
    product: d.product, manufacturer: d.manufacturer, iface: d.interface,
    usagePage: "0x" + d.usagePage.toString(16), usage: "0x" + d.usage.toString(16),
    release: d.release, path: d.path,
  });
}
