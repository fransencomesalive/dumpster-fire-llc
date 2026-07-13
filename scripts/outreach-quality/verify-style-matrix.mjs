import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyArtifactManifest } from "./cross-style-matrix.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "data");
const manifestPath = resolve(dataDir, "style-matrix-v3-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const files = Object.fromEntries(
  Object.keys(manifest.files).map((name) => [name, readFileSync(resolve(dataDir, name), "utf8")]),
);

verifyArtifactManifest(manifest, files);
console.log(`style matrix artifact seal verified: ${Object.keys(files).length} files`);
