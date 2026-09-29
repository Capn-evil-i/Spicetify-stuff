const fs = require("node:fs");
const path = require("node:path");

const bundlePath = path.resolve(__dirname, "../dist/fullScreen.js");
const compatPath = path.resolve(__dirname, "runtime-api-compat.js");
const marker = "__fullScreenResilientRuntimeCompat";

if (!fs.existsSync(bundlePath)) throw new Error(`Built extension not found: ${bundlePath}`);
const bundle = fs.readFileSync(bundlePath, "utf8");
if (bundle.includes(marker)) throw new Error("Runtime compatibility layer is already present in the bundle.");

const compat = fs.readFileSync(compatPath, "utf8");
fs.writeFileSync(bundlePath, `${compat}\n;\n${bundle}`, "utf8");
console.log("Prepended the Spotify 1.3 runtime compatibility layer.");
